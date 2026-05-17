#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

#define HW_WIFI_SSID "YOUR_WIFI_NAME"
#define HW_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define HW_BOOTSTRAP_HOST "192.168.x.x"
#define HW_BOOTSTRAP_PORT 5000
#define HW_BOOTSTRAP_PATH "/api/v1/hardware/bootstrap"

#define HW_HARDWARE_BOOTSTRAP_KEY "YOUR_BOOTSTRAP_KEY"

#define HW_ENTRY_SERVO_PIN 13
#define HW_EXIT_SERVO_PIN 12

#define SIMULATOR_KEY "YOUR_SIMULATOR_KEY"

// MFRC522 RC522 reader default pin mapping for ESP32 (example wiring):
// SDA/SS  -> D5  (GPIO5)
// MOSI    -> D23 (GPIO23)
// MISO    -> D19 (GPIO19)
// SCK     -> D18 (GPIO18)
// RST     -> D17 (GPIO17)
// 3.3V    -> 3V3
// GND     -> GND
// Override these in your board-specific hardware_config.h if needed.
#define SS_PIN 5
#define RST_PIN 17

// RFID scan testing over Serial monitor (ESP32 firmware listens for commands):
// - RFID:<UID>        -> emit scan on entry_rfid checkpoint
// - RFID_ENTRY:<UID>  -> emit scan on entry_rfid checkpoint
// - RFID_EXIT:<UID>   -> emit scan on exit_rfid checkpoint

#endif // HARDWARE_CONFIG_H