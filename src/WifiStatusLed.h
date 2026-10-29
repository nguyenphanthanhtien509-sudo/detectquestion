#pragma once

#include <Arduino.h>
#include <esp32-hal-rgb-led.h>

#ifndef GATEWAY_LED_PIN
#define GATEWAY_LED_PIN 48
#endif
#ifndef GATEWAY_LED_RGB
#define GATEWAY_LED_RGB 1
#endif
#ifndef GATEWAY_LED_ACTIVE_LOW
#define GATEWAY_LED_ACTIVE_LOW 0
#endif

// Poll from loop(), without delay(): disconnected = blinking amber,
// connected to the Wi-Fi access point = solid green. This does not claim
// that Internet, TLS or the provider API is ready.
class WifiStatusLed {
 public:
  void begin(uint32_t now) {
#if !GATEWAY_LED_RGB
    pinMode(GATEWAY_LED_PIN, OUTPUT);
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
    digitalWrite(GATEWAY_LED_PIN, on ? (GATEWAY_LED_ACTIVE_LOW ? LOW : HIGH)
                                    : (GATEWAY_LED_ACTIVE_LOW ? HIGH : LOW));
#endif
  }
};
