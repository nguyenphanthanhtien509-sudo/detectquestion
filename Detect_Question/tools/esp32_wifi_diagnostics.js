'use strict';
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Esp32SerialTransport } = require('../desktop/usb/Esp32SerialTransport');

async function main() {
  const [, , port, configFile] = process.argv;
  if (!port || !configFile) throw new Error('Usage: node tools/esp32_wifi_diagnostics.js COM7 gateway-config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const transport = new Esp32SerialTransport({ path: port, timeoutMs: 20000 });
  try {
    let status = await transport.request('status', {});
    const check = await transport.exchange({ id: randomUUID(), type: 'wifi_verify', ssid: config.ssid, password: config.password }, 'wifi_check');
    console.log(JSON.stringify({ ssidMatchesStored: check.ssidMatchesStored, passwordMatchesStored: check.passwordMatchesStored }));
    if (!status.wifiConnected) {
      await transport.exchange({ id: randomUUID(), type: 'wifi_scan' }, 'scan_started');
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        status = await transport.request('status', {});
        if (status.wifiScanDone) break;
      }
    }
    const fields = ['firmware', 'wifiConnected', 'wifiStatusCode', 'wifiDisconnectReason', 'wifiRetryCount', 'wifiRssi', 'wifiScanDone', 'wifiScanFailed', 'configuredNetworkSeen', 'configuredNetworkChannel', 'configuredNetworkRssi', 'configuredNetworkAuthMode'];
    console.log(JSON.stringify(Object.fromEntries(fields.map(key => [key, status[key]])), null, 2));
  } finally { await transport.close(); }
}
main().catch(cause => { console.error(cause.code || cause.message); process.exitCode = 1; });
