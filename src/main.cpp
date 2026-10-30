#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_heap_caps.h>
#include <esp_sntp.h>
#include <esp_netif.h>
#include <sys/time.h>
#include <mbedtls/base64.h>
#include <atomic>
#include <time.h>
#include <memory>
#include "WifiStatusLed.h"

bool resolveGatewayHost(const char *host, IPAddress &address);
bool gatewayCancelled();

// Resolve once, then pass BOTH the IP and original hostname to TLS. The
// hostname remains the SNI/certificate identity; no pinned IP or TLS bypass.
class GatewayTlsClient : public WiFiClientSecure {
  bool bodyActive = false;
  uint32_t bodyStartedAt = 0, bodyProgressAt = 0;
  bool bodyReadable() {
    if (!bodyActive) return true;
    const uint32_t now = millis();
    if (!gatewayCancelled() && now - bodyProgressAt < 15000 && now - bodyStartedAt < 45000) return true;
    bodyTimedOut = !gatewayCancelled();
    stop();
    return false;
  }
 public:
  uint32_t connectMs = 0;
  bool dnsFailed = false;
  bool bodyTimedOut = false;
  using WiFiClientSecure::connect;
  using WiFiClientSecure::read;
  void beginBody() { bodyTimedOut = false; bodyStartedAt = bodyProgressAt = millis(); bodyActive = true; }
  void endBody() { bodyActive = false; }
  int available() override { return bodyReadable() ? WiFiClientSecure::available() : 0; }
  uint8_t connected() override { return bodyReadable() ? WiFiClientSecure::connected() : 0; }
  int read(uint8_t *data, size_t size) override {
    if (!bodyReadable()) return -1;
    const int count = WiFiClientSecure::read(data, size);
    if (count > 0) bodyProgressAt = millis();
    return count;
  }
  int connect(const char *host, uint16_t port, int32_t timeout) override {
    dnsFailed = false;
    _timeout = timeout;
    IPAddress address;
    if (!resolveGatewayHost(host, address)) { dnsFailed = true; return 0; }
    const uint32_t started = millis();
    const int result = WiFiClientSecure::connect(address, port, host, _CA_cert, _cert, _private_key);
    connectMs = millis() - started;
    return result;
  }
};

// Protocol v1: bounded NDJSON control frames + base64 data chunks.
// Request payloads live in PSRAM; responses are streamed in bounded chunks.
static constexpr size_t MAX_FRAME = 24000;
static constexpr size_t MAX_BODY = 1500000;
static constexpr size_t MAX_RESPONSE = 262144;
static constexpr size_t CHUNK = 2048;
static constexpr size_t ENCODED_CHUNK = ((CHUNK + 2) / 3) * 4;
Preferences prefs;
DynamicJsonDocument settings(24000);
SemaphoreHandle_t txMutex;
std::atomic<bool> busy(false), cancelled(false);
String activeId, activeOp, rxLine;
uint8_t *requestBuffer = nullptr;
bool uploadActive = false;
size_t expectedBytes = 0, receivedBytes = 0;
uint32_t expectedSeq = 0, lastUploadAt = 0;
bool psramReady = false, droppingLine = false;
std::atomic<int> clockSource(0); // 0 unset, 1 USB, 2 SNTP, 3 retained RTC.
std::atomic<int> networkStage(0), lastHttpStatus(0), lastTlsCode(0);
std::atomic<uint32_t> lastUploadMs(0), lastNetworkMs(0), lastPostMs(0), lastReadMs(0), reusedConnections(0);
std::atomic<uint32_t> lastDnsMs(0);
std::atomic<uint32_t> cancelRequestedAt(0), lastCancelDrainMs(0);
uint32_t sessionIdleSince = 0;
std::atomic<bool> lastDnsFallback(false);
uint32_t uploadStartedAt = 0;
std::atomic<bool> sessionInvalidated(true);
std::unique_ptr<GatewayTlsClient> cachedTls;
std::unique_ptr<HTTPClient> cachedHttp;
String cachedUrl, cachedKey, cachedCa;
WifiStatusLed wifiStatusLed;

String setting(const char *key) { return settings[key] | ""; }
bool gatewayCancelled() { return cancelled.load(); }

bool resolveGatewayHost(const char *host, IPAddress &address) {
  const uint32_t started = millis();
  lastDnsFallback.store(WiFi.dnsIP(0) == IPAddress(1, 1, 1, 1));
  bool resolved = WiFi.hostByName(host, address);
  if (!resolved && !cancelled && WiFi.status() == WL_CONNECTED) {
    // Change only DNS on the active station: keep its DHCP address/gateway.
    esp_netif_t *station = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    esp_netif_dns_info_t originalMain = {}, originalBackup = {}, primary = {}, backup = {};
    if (station && esp_netif_get_dns_info(station, ESP_NETIF_DNS_MAIN, &originalMain) == ESP_OK &&
        esp_netif_get_dns_info(station, ESP_NETIF_DNS_BACKUP, &originalBackup) == ESP_OK) {
      primary.ip.type = ESP_IPADDR_TYPE_V4;
      primary.ip.u_addr.ip4.addr = static_cast<uint32_t>(IPAddress(1, 1, 1, 1));
      backup.ip.type = ESP_IPADDR_TYPE_V4;
      backup.ip.u_addr.ip4.addr = static_cast<uint32_t>(IPAddress(8, 8, 8, 8));
      const bool installed = esp_netif_set_dns_info(station, ESP_NETIF_DNS_MAIN, &primary) == ESP_OK &&
        esp_netif_set_dns_info(station, ESP_NETIF_DNS_BACKUP, &backup) == ESP_OK;
      if (installed) {
        lastDnsFallback.store(true);
        resolved = WiFi.hostByName(host, address);
      }
      // Keep a working fallback until DHCP supplies DNS again. On failure,
      // restore the original servers rather than permanently overriding them.
      if (!resolved) {
        esp_netif_set_dns_info(station, ESP_NETIF_DNS_MAIN, &originalMain);
        esp_netif_set_dns_info(station, ESP_NETIF_DNS_BACKUP, &originalBackup);
      }
    }
  }
  lastDnsMs.store(millis() - started);
  return resolved && !cancelled;
}

bool sendDoc(const JsonDocument &doc) {
  if (doc.overflowed()) return false;
  String line;
  const size_t expected = measureJson(doc);
  if (!line.reserve(expected + 1) || serializeJson(doc, line) != expected) return false;
  line += '\n';
  if (line.length() != expected + 1) return false;
  if (xSemaphoreTake(txMutex, pdMS_TO_TICKS(2000)) != pdPASS) return false;
  const uint32_t readyAt = millis();
  while (!Serial && millis() - readyAt < 1000) delay(1);
  if (!Serial) { xSemaphoreGive(txMutex); return false; }
  const uint32_t startedAt = millis();
  size_t sent = 0;
  while (sent < line.length() && millis() - startedAt < 2000) {
    const size_t count = Serial.write(reinterpret_cast<const uint8_t *>(line.c_str()) + sent, line.length() - sent);
    if (count > line.length() - sent) break;
    sent += count;
    if (!count) delay(1);
  }
  // HWCDC can leave a short tail queued until another write triggers TX.
  // Drain each protocol frame so an ACK never depends on the next request.
  Serial.flush();
  xSemaphoreGive(txMutex);
  return sent == line.length();
}

void reply(const String &id, const char *type, const char *code = nullptr) {
  StaticJsonDocument<256> doc;
  doc["v"] = 1; doc["id"] = id; doc["type"] = type;
  if (code) doc["code"] = code;
  sendDoc(doc);
}

void discardUpload() {
  if (requestBuffer) { free(requestBuffer); requestBuffer = nullptr; }
  uploadActive = false;
  activeId = "";
}

size_t uploadLimit() {
  if (!psramReady) return 0;
  const size_t freeBlock = heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  const size_t reserve = 256 * 1024;
  return freeBlock > reserve ? min(MAX_BODY, freeBlock - reserve) : 0;
}

void closeSession() {
  if (cachedHttp) { cachedHttp->setReuse(false); cachedHttp->end(); }
  if (cachedTls) cachedTls->stop();
  cachedHttp.reset(); cachedTls.reset();
  cachedUrl = ""; cachedKey = ""; cachedCa = "";
}

bool validHttps(const String &url) {
  return url.startsWith("https://") && url.length() < 512 &&
    url.indexOf('@') < 0 && url.indexOf('\r') < 0 && url.indexOf('\n') < 0;
}

bool safeHeader(const String &value) {
  return value.length() > 0 && value.length() <= 4096 &&
    value.indexOf('\r') < 0 && value.indexOf('\n') < 0;
}

void status(const String &id) {
  StaticJsonDocument<1536> doc;
  doc["v"] = 1; doc["id"] = id; doc["type"] = "status";
  doc["device"] = "detect-question-esp32s3";
  doc["firmware"] = "0.3.0";
  doc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  doc["wifiHostname"] = WiFi.getHostname() ? WiFi.getHostname() : "";
  doc["wifiStatusCode"] = int(WiFi.status());
  doc["wifiTxPowerQuarterDbm"] = int(WiFi.getTxPower());
  doc["clockReady"] = time(nullptr) > 1700000000;
  doc["clockSource"] = clockSource.load() == 2 ? "sntp" : clockSource.load() == 1 ? "usb" : clockSource.load() == 3 ? "rtc" : "unset";
  doc["supportsTimeSync"] = true;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["epochSeconds"] = long(time(nullptr));
  doc["configured"] = setting("apiKey").length() > 0;
  doc["busy"] = busy.load() || uploadActive;
  doc["requestStorage"] = "psram";
  doc["psramReady"] = psramReady;
  doc["psramBytes"] = ESP.getPsramSize();
  doc["freePsram"] = ESP.getFreePsram();
  doc["maxBodyBytes"] = uploadLimit();
  doc["maxResponseBytes"] = MAX_RESPONSE;
  doc["chunkBytes"] = CHUNK;
  doc["maxConcurrent"] = 1;
  doc["networkStage"] = networkStage.load();
  doc["lastHttpStatus"] = lastHttpStatus.load();
  doc["lastTlsCode"] = lastTlsCode.load();
  doc["lastDnsMs"] = lastDnsMs.load();
  doc["lastCancelDrainMs"] = lastCancelDrainMs.load();
  doc["lastDnsFallback"] = lastDnsFallback.load();
  doc["lastUploadMs"] = lastUploadMs.load();
  doc["lastNetworkMs"] = lastNetworkMs.load();
  doc["lastPostMs"] = lastPostMs.load();
  doc["lastReadMs"] = lastReadMs.load();
  doc["reusedConnections"] = reusedConnections.load();
  sendDoc(doc);
}

// HTTPClient decodes HTTP chunked transfer before writing to this sink.
// Never allocate an entire API response or print provider error bodies.
class UsbResponse : public Stream {
 public:
  String id;
  size_t total = 0;
  uint32_t seq = 0;
  bool failed = false;
  std::unique_ptr<unsigned char[]> encoded;
  DynamicJsonDocument doc;
  explicit UsbResponse(const String &value) : id(value), encoded(new (std::nothrow) unsigned char[ENCODED_CHUNK + 1]), doc(ENCODED_CHUNK + 512) {}
  size_t write(uint8_t byte) override { return write(&byte, 1); }
  size_t write(const uint8_t *data, size_t len) override {
    if (failed) return 0;
    if (!encoded || cancelled || total + len > MAX_RESPONSE) { failed = true; setWriteError(); return 0; }
    size_t offset = 0;
    while (offset < len) {
      if (cancelled) return offset;
      const size_t count = min(CHUNK, len - offset);
      size_t encodedLen = 0;
      if (mbedtls_base64_encode(encoded.get(), ENCODED_CHUNK + 1, &encodedLen, data + offset, count)) return offset;
      doc.clear();
      doc["v"] = 1; doc["id"] = id; doc["type"] = "result_chunk";
      doc["seq"] = seq; doc["data"] = String(reinterpret_cast<char *>(encoded.get()), encodedLen);
      if (!sendDoc(doc)) { failed = true; setWriteError(); return offset; }
      ++seq;
      offset += count; total += count;
    }
    return len;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};

void networkTask(void *) {
  const uint32_t startedAt = millis();
  networkStage.store(1); lastHttpStatus.store(0); lastTlsCode.store(0);
  lastPostMs.store(0); lastReadMs.store(0);
  lastDnsMs.store(0); lastDnsFallback.store(false);
  const uint32_t heapBefore = ESP.getFreeHeap();
  bool reused = false;
  uint32_t idleMs = 0, connectMs = 0;
  int bodyResult = 0, httpStatus = 0, tlsCode = 0;
  const auto diagnostics = [&](JsonObject info) {
    info["dnsMs"] = lastDnsMs.load();
    info["dnsFallback"] = lastDnsFallback.load();
    info["connectMs"] = connectMs;
    info["postAndHeadersMs"] = lastPostMs.load();
    info["bodyMs"] = lastReadMs.load();
    info["networkMs"] = millis() - startedAt;
    info["reusedConnection"] = reused;
    info["idleMs"] = idleMs;
    info["httpCode"] = httpStatus;
    info["tlsCode"] = tlsCode;
    info["bodyResult"] = bodyResult;
    info["heapBefore"] = heapBefore;
    info["freeHeap"] = ESP.getFreeHeap();
    info["largestHeapBlock"] = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    info["wifiConnected"] = WiFi.status() == WL_CONNECTED;
    info["cancelDrainMs"] = cancelled ? millis() - cancelRequestedAt.load() : 0;
  };
  const String id = activeId;
  const bool license = activeOp == "license";
  const String url = license ? setting("licenseUrl") : setting("apiUrl");
  const String key = license ? setting("anonKey") : setting("apiKey");
  String ca = license ? setting("licenseCa") : setting("caCert");
  const char *error = nullptr;
  char tlsMessage[128] = {0};
  if (WiFi.status() != WL_CONNECTED) error = "WIFI_OFFLINE";
  else if (time(nullptr) <= 1700000000) error = "CLOCK_NOT_READY";
  else if (!validHttps(url) || !safeHeader(key) || ca.length() < 100) error = "NOT_CONFIGURED";
  else {
    if (sessionInvalidated.exchange(false) || cachedUrl != url || cachedKey != key || cachedCa != ca ||
        (sessionIdleSince && (millis() - sessionIdleSince > 3000))) {
      closeSession();
    }
    // A socket can look connected after the server/mobile NAT has expired it.
    // Reconnect before a new POST after an idle gap; never replay a sent POST.
    if (cachedTls && sessionIdleSince && millis() - sessionIdleSince >= 15000) closeSession();
    if (!cachedTls) {
      cachedUrl = url; cachedKey = key; cachedCa = ca;
      cachedTls.reset(new GatewayTlsClient());
      cachedHttp.reset(new HTTPClient());
      cachedTls->setCACert(cachedCa.c_str());
      cachedTls->setHandshakeTimeout(10);
    }
    GatewayTlsClient &tls = *cachedTls;
    HTTPClient &http = *cachedHttp;
    reused = tls.connected();
    idleMs = reused && sessionIdleSince ? millis() - sessionIdleSince : 0;
    tls.connectMs = 0;
    http.setConnectTimeout(10000);
    http.setTimeout(30000);
    http.useHTTP10(false);
    http.setReuse(true);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(tls, url)) error = "HTTPS_BEGIN_FAILED";
    else {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", "Bearer " + key);
      if (license) http.addHeader("apikey", key);
      if (!requestBuffer) error = "NO_REQUEST_BUFFER";
      else if (cancelled) error = "CANCELLED";
      else {
        networkStage.store(2);
        const uint32_t postStarted = millis();
        httpStatus = http.sendRequest("POST", requestBuffer, expectedBytes);
        connectMs = tls.connectMs;
        lastPostMs.store(millis() - postStarted);
        lastHttpStatus.store(httpStatus);
        if (reused && httpStatus > 0) reusedConnections.fetch_add(1);
        if (httpStatus <= 0) {
          error = cancelled ? "CANCELLED" : tls.dnsFailed ? "DNS_FAILED" : "HTTPS_FAILED";
          tlsCode = tls.lastError(tlsMessage, sizeof(tlsMessage));
        }
        else if (httpStatus < 200 || httpStatus >= 300) error = "HTTP_ERROR";
        else {
          UsbResponse sink(id);
          if (http.getSize() > int(MAX_RESPONSE)) error = "RESPONSE_TOO_LARGE";
          else {
            networkStage.store(3);
            const uint32_t readStarted = millis();
            tls.beginBody();
            const int count = http.writeToStream(&sink);
            bodyResult = count;
            tls.endBody();
            lastReadMs.store(millis() - readStarted);
            if (cancelled) error = "CANCELLED";
            else if (tls.bodyTimedOut) error = "RESPONSE_READ_TIMEOUT";
            else if (sink.failed) error = "USB_WRITE_FAILED";
            else if (count < 0 || size_t(count) != sink.total) error = "RESPONSE_READ_FAILED";
            else {
              StaticJsonDocument<1536> doc;
              doc["v"] = 1; doc["id"] = id; doc["type"] = "result_end";
              doc["bytes"] = sink.total; doc["chunks"] = sink.seq;
              diagnostics(doc.createNestedObject("diagnostics"));
              if (!sendDoc(doc)) error = "USB_WRITE_FAILED";
            }
          }
        }
      }
    }
  }
  lastTlsCode.store(tlsCode);
  lastNetworkMs.store(millis() - startedAt);
  networkStage.store(error ? 5 : 4);
  // Reuse only completely consumed successful responses. Never replay a
  // failed POST automatically: the provider may already have billed it.
  if (error || cancelled) closeSession();
  else if (cachedHttp) { cachedHttp->end(); sessionIdleSince = millis(); }
  if (cancelled) lastCancelDrainMs.store(millis() - cancelRequestedAt.load());
  if (error) {
    StaticJsonDocument<2048> doc;
    doc["v"] = 1; doc["id"] = id; doc["type"] = "error";
    doc["code"] = error; doc["httpStatus"] = httpStatus;
    diagnostics(doc.createNestedObject("diagnostics"));
    if (tlsCode) { doc["tlsCode"] = tlsCode; doc["tlsMessage"] = tlsMessage; }
    sendDoc(doc);
  }
  if (requestBuffer) { free(requestBuffer); requestBuffer = nullptr; }
  // Keep activeId stable until the main loop accepts another command.
  busy.store(false);
  vTaskDelete(nullptr);
}

void configure(const String &id, JsonObject doc) {
  const String ssid = doc["ssid"] | "";
  const String password = doc["password"] | "";
  const String url = doc["apiUrl"] | "";
  const String key = doc["apiKey"] | "";
  const String ca = doc["caCert"] | "";
  const String licenseUrl = doc["licenseUrl"] | "";
  const String anon = doc["anonKey"] | "";
  const String licenseCa = doc["licenseCa"] | "";
  if (!ssid.length() || ssid.length() > 32 || password.length() > 64 || !validHttps(url) ||
      !safeHeader(key) || ca.length() > 8000 || ca.indexOf("-----BEGIN CERTIFICATE-----") < 0 ||
      (licenseUrl.length() && (!validHttps(licenseUrl) || !safeHeader(anon) ||
       licenseCa.length() > 8000 || licenseCa.indexOf("-----BEGIN CERTIFICATE-----") < 0))) {
    reply(id, "error", "INVALID_CONFIG"); return;
  }
  // Store a single JSON blob so provisioning cannot leave half-written keys.
  String config;
  serializeJson(doc, config);
  // NVS strings are limited to one page (~4 KB). A validated CA chain can
  // exceed that, so store the atomic configuration as a multi-page blob.
  if (prefs.putBytes("configV1", config.c_str(), config.length()) != config.length()) { reply(id, "error", "STORAGE_ERROR"); return; }
  prefs.remove("config"); // Retire the legacy small-string representation.
  deserializeJson(settings, config);
  sessionInvalidated.store(true);
  WiFi.disconnect();
  WiFi.begin(ssid.c_str(), password.c_str());
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  reply(id, "configured");
}

void handleFrame(const String &line) {
  DynamicJsonDocument doc(MAX_FRAME + 2048);
  if (deserializeJson(doc, line)) { reply("", "error", "INVALID_JSON"); return; }
  const String id = doc["id"] | "";
  const String type = doc["type"] | "";
  if (doc["v"] != 1 || !id.length() || id.length() > 64) { reply(id.substring(0, 64), "error", "INVALID_FRAME"); return; }
  if (type == "hello" || type == "status") { status(id); return; }
  if (type == "sync_time") {
    const uint32_t proposed = doc["epochSeconds"] | uint32_t(0);
    if (proposed < 1704067200UL || proposed > 2114380800UL) { reply(id, "error", "INVALID_TIME"); return; }
    // SNTP/valid RTC time wins. USB fills an unset clock only; it cannot
    // roll an established clock backwards or bypass certificate checks.
    if (time(nullptr) <= 1700000000) {
      timeval value = {static_cast<time_t>(proposed), 0};
      if (settimeofday(&value, nullptr)) { reply(id, "error", "TIME_SET_FAILED"); return; }
      clockSource.store(1);
    }
    reply(id, "time_synced"); return;
  }
  if (type == "cancel") {
    if (activeId == id) {
      if (busy) {
        if (!cancelled.load()) cancelRequestedAt.store(millis());
        cancelled.store(true);
      }
      else discardUpload();
    }
    reply(id, "cancel_ack"); return;
  }
  if (busy) { reply(id, "error", "BUSY"); return; }
  if (type == "configure") {
    if (uploadActive) { reply(id, "error", "BUSY"); return; }
    configure(id, doc.as<JsonObject>()); return;
  }
  if (type == "begin") {
    if (uploadActive) { reply(id, "error", "BUSY"); return; }
    if (!psramReady) { reply(id, "error", "PSRAM_UNAVAILABLE"); return; }
    const size_t size = doc["bytes"] | size_t(0);
    const String op = doc["op"] | "";
    if (!size || size > uploadLimit() || (op != "complete" && op != "license")) { reply(id, "error", "INVALID_REQUEST"); return; }
    requestBuffer = static_cast<uint8_t *>(heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!requestBuffer) { reply(id, "error", "NO_MEMORY"); return; }
    uploadActive = true; uploadStartedAt = millis();
    activeId = id; activeOp = op; expectedBytes = size;
    receivedBytes = 0; expectedSeq = 0; lastUploadAt = millis(); cancelled = false;
    reply(id, "ready"); return;
  }
  if (id != activeId || !uploadActive) { reply(id, "error", "NO_UPLOAD"); return; }
  if (type == "chunk") {
    const String data = doc["data"] | "";
    unsigned char decoded[CHUNK]; size_t decodedLen = 0;
    if (!doc["seq"].is<uint32_t>() || doc["seq"].as<uint32_t>() != expectedSeq ||
        !data.length() || data.length() > ENCODED_CHUNK ||
        mbedtls_base64_decode(decoded, sizeof(decoded), &decodedLen,
          reinterpret_cast<const unsigned char *>(data.c_str()), data.length()) ||
        !decodedLen || receivedBytes + decodedLen > expectedBytes) {
      discardUpload(); reply(id, "error", "INVALID_CHUNK"); return;
    }
    memcpy(requestBuffer + receivedBytes, decoded, decodedLen);
    receivedBytes += decodedLen; ++expectedSeq; lastUploadAt = millis();
    StaticJsonDocument<192> ack;
    ack["v"] = 1; ack["id"] = id; ack["type"] = "chunk_ack"; ack["seq"] = expectedSeq - 1;
    sendDoc(ack); return;
  }
  if (type == "end") {
    if (receivedBytes != expectedBytes) { discardUpload(); reply(id, "error", "SIZE_MISMATCH"); return; }
    lastUploadMs.store(millis() - uploadStartedAt);
    uploadActive = false;
    busy.store(true);
    // HWCDC's interrupt is installed on the Arduino core. Keep its writer
    // on that core too, so FIFO writes/flushes cannot race across CPUs.
    if (xTaskCreatePinnedToCore(networkTask, "https_gateway", 12288, nullptr, 1, nullptr, xPortGetCoreID()) != pdPASS) {
      busy.store(false); discardUpload(); reply(id, "error", "NO_MEMORY");
    }
    return;
  }
  reply(id, "error", "UNKNOWN_COMMAND");
}

void setup() {
  wifiStatusLed.begin(millis());
  Serial.setRxBufferSize(16384);
  Serial.setTxBufferSize(4096);
  Serial.begin(115200);
  Serial.setTxTimeoutMs(1000);
  txMutex = xSemaphoreCreateMutex();
  prefs.begin("ai-gateway", false);
  const size_t configSize = prefs.getBytesLength("configV1");
  if (configSize > 0 && configSize <= MAX_FRAME) {
    std::unique_ptr<char[]> configBytes(new (std::nothrow) char[configSize]);
    if (configBytes && prefs.getBytes("configV1", configBytes.get(), configSize) == configSize) {
      deserializeJson(settings, static_cast<const char *>(configBytes.get()), configSize);
    }
  } else {
    deserializeJson(settings, prefs.getString("config", "{}"));
  }
  psramReady = psramFound() && ESP.getPsramSize() > 0;
  if (time(nullptr) > 1700000000) clockSource.store(3);
  sntp_set_time_sync_notification_cb([](struct timeval *) { clockSource.store(2); });
  const String ssid = setting("ssid");
  const String password = setting("password");
  // STA_START is asynchronous; apply the limit once the driver is ready.
  WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t) {
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
  }, ARDUINO_EVENT_WIFI_STA_START);
  WiFi.persistent(false);
  WiFi.setHostname("USB");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.begin(ssid.c_str(), password.c_str());
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  rxLine.reserve(MAX_FRAME);
}

void loop() {
  wifiStatusLed.update(WiFi.status() == WL_CONNECTED, millis());
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\n') {
      if (!droppingLine && rxLine.length()) handleFrame(rxLine);
      rxLine = ""; droppingLine = false;
    } else if (c != '\r' && !droppingLine) {
      if (rxLine.length() >= MAX_FRAME) { rxLine = ""; droppingLine = true; }
      else rxLine += c;
    }
  }
  if (uploadActive && uint32_t(millis() - lastUploadAt) > 15000) {
    const String id = activeId; discardUpload(); reply(id, "error", "UPLOAD_TIMEOUT");
  }
  delay(1);
}
