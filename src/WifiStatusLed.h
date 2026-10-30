#pragma once

#include <Arduino.h>
#include <esp32-hal-rgb-led.h>

#ifndef GATEWAY_LED_PIN
#define GATEWAY_LED_PIN 48
#endif
#ifndef GATEWAY_LED_RGB
#define GATEWAY_LED_RGB 0
#endif
#ifndef GATEWAY_LED_ACTIVE_LOW
#define GATEWAY_LED_ACTIVE_LOW 0
#endif
#ifndef GATEWAY_LED_BRIGHTNESS_PERCENT
#define GATEWAY_LED_BRIGHTNESS_PERCENT 10
#endif
static_assert(GATEWAY_LED_BRIGHTNESS_PERCENT >= 0 && GATEWAY_LED_BRIGHTNESS_PERCENT <= 100,
              "LED brightness must be between 0 and 100 percent");

// Poll from loop(), without delay(): disconnected = blinking,
// connected to the Wi-Fi access point = solid on. Optional RGB mode uses
// amber/green respectively. This does not claim
// that Internet, TLS or the provider API is ready.
class WifiStatusLed {
 public:
  void begin(uint32_t now) {
#if !GATEWAY_LED_RGB
    pinMode(GATEWAY_LED_PIN, OUTPUT);
    digitalWrite(GATEWAY_LED_PIN, GATEWAY_LED_ACTIVE_LOW ? HIGH : LOW);
    ledcSetup(0, 1000, 8);
    ledcAttachPin(GATEWAY_LED_PIN, 0);
#endif
    changedAt = now;
    connected = false;
    on = true;
    render();
  }

  void update(bool wifiConnected, uint32_t now) {
    if (wifiConnected != connected) {
      connected = wifiConnected;
      on = true;
      changedAt = now;
      render();
    } else if (!connected && uint32_t(now - changedAt) >= 500) {
      changedAt = now;
      on = !on;
      render();
    }
  }

 private:
  uint32_t changedAt = 0;
  bool connected = false;
  bool on = false;

  void render() {
#if GATEWAY_LED_RGB
    // Keep brightness low; use the core's WS2812 driver, not digitalWrite.
    neopixelWrite(GATEWAY_LED_PIN, on && !connected ? 16 : 0,
                  on ? (connected ? 16 : 6) : 0, 0);
#else
    const uint32_t duty = on ? (255 * GATEWAY_LED_BRIGHTNESS_PERCENT + 50) / 100 : 0;
    ledcWrite(0, GATEWAY_LED_ACTIVE_LOW ? 255 - duty : duty);
#endif
  }
};
