#include <WiFi.h>
#include <HTTPClient.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "hardware_config.h"

// Optional LCD support. Remove if your board does not have an I2C LCD.
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ===== WiFi config =====
const char* WIFI_SSID = HW_WIFI_SSID;
const char* WIFI_PASSWORD = HW_WIFI_PASSWORD;

// ===== Config header (override values in hardware_config.h) =====
// WiFi config (from hardware_config.h)
const char* BOOTSTRAP_HOST_STR = HW_BOOTSTRAP_HOST;
const uint16_t BOOTSTRAP_PORT_VAL = HW_BOOTSTRAP_PORT;
const char* BOOTSTRAP_PATH_STR = HW_BOOTSTRAP_PATH;
const char* HARDWARE_BOOTSTRAP_KEY_STR = HW_HARDWARE_BOOTSTRAP_KEY;

// ===== Runtime socket config loaded from backend env =====
String socketHost = "192.168.1.5";
uint16_t socketPort = 5000;
String socketPath = "/socket.io/?EIO=4";
String simulatorApiKey = SIMULATOR_KEY;
uint32_t reconnectIntervalMs = 5000;

// ===== Servo pins =====
const int ENTRY_SERVO_PIN = HW_ENTRY_SERVO_PIN;  // entry-gate
const int EXIT_SERVO_PIN = HW_EXIT_SERVO_PIN;   // exit-gate (servo 1)

const int SERVO_MIN_ANGLE = 0;
const int SERVO_MAX_ANGLE = 180;
const int SERVO_STEP = 5;
const int SERVO_STEP_DELAY_MS = 35;

// ===== Connection state =====
bool socketConnected = false;
bool joinSent = false;
unsigned long lastReconnectAttempt = 0;

LiquidCrystal_I2C lcd(0x27, 16, 2);
SocketIOclient socketIO;
Servo entryServo;
Servo exitServo;

int entryAngle = 0;
int exitAngle = 0;

bool fetchSocketConfigFromBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String("http://") + BOOTSTRAP_HOST_STR + ":" + String(BOOTSTRAP_PORT_VAL) + BOOTSTRAP_PATH_STR;

  Serial.print("[Bootstrap] GET ");
  Serial.println(url);
  displayStatus("Bootstrap", "Fetching cfg...");

  http.begin(url);
  if (strlen(HARDWARE_BOOTSTRAP_KEY_STR) > 0) {
    http.addHeader("x-hardware-key", HARDWARE_BOOTSTRAP_KEY_STR);
  }

  int statusCode = http.GET();
  if (statusCode != 200) {
    Serial.print("[Bootstrap] HTTP failed: ");
    Serial.println(statusCode);
    http.end();
    return false;
  }

  String response = http.getString();
  http.end();

  DynamicJsonDocument doc(2048);
  DeserializationError error = deserializeJson(doc, response);
  if (error) {
    Serial.print("[Bootstrap] JSON parse error: ");
    Serial.println(error.c_str());
    return false;
  }

  JsonObject data = doc["data"];
  if (data.isNull()) {
    Serial.println("[Bootstrap] Missing data object");
    return false;
  }

  const char* fetchedHost = data["socketHost"] | "";
  const int fetchedPort = data["socketPort"] | 0;
  const char* fetchedPath = data["socketPath"] | "";
  const char* fetchedSimulatorApiKey = data["simulatorApiKey"] | "";
  const int fetchedReconnectIntervalMs = data["reconnectIntervalMs"] | 5000;

  if (strlen(fetchedHost) == 0 || fetchedPort <= 0 || strlen(fetchedPath) == 0) {
    Serial.println("[Bootstrap] Invalid bootstrap payload");
    return false;
  }

  socketHost = fetchedHost;
  socketPort = static_cast<uint16_t>(fetchedPort);
  // sanitize path: remove query string if present (Socket.IO client library handles EIO internally)
  String rawPath = String(fetchedPath);
  int qpos = rawPath.indexOf('?');
  if (qpos >= 0) {
    rawPath = rawPath.substring(0, qpos);
  }
  if (!rawPath.startsWith("/")) {
    rawPath = "/" + rawPath;
  }
  socketPath = rawPath;
  simulatorApiKey = fetchedSimulatorApiKey;
  reconnectIntervalMs = fetchedReconnectIntervalMs > 0 ? static_cast<uint32_t>(fetchedReconnectIntervalMs) : 5000;

  Serial.println("[Bootstrap] Config loaded from backend env");
  Serial.print("[Bootstrap] socketHost=");
  Serial.println(socketHost);
  Serial.print("[Bootstrap] socketPort=");
  Serial.println(socketPort);
  Serial.print("[Bootstrap] socketPath=");
  Serial.println(socketPath);
  displayStatus("Bootstrap OK", socketHost + ":" + String(socketPort));
  return true;
}

void displayStatus(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  displayStatus("WiFi", "Connecting...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("[WiFi] Connected. IP: ");
  Serial.println(WiFi.localIP());
  displayStatus("WiFi connected", WiFi.localIP().toString());
}

void sweepServo(Servo& servo, int& currentAngle, int targetAngle) {
  targetAngle = constrain(targetAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);

  if (currentAngle == targetAngle) {
    return;
  }

  int step = (targetAngle > currentAngle) ? SERVO_STEP : -SERVO_STEP;
  for (int angle = currentAngle; (step > 0) ? angle <= targetAngle : angle >= targetAngle; angle += step) {
    servo.write(angle);
    delay(SERVO_STEP_DELAY_MS);
  }

  servo.write(targetAngle);
  currentAngle = targetAngle;
}

void applyGateCommand(const String& gateId, const String& command) {
  if (gateId != "entry-gate" && gateId != "exit-gate") {
    return;
  }

  if (command != "open" && command != "close") {
    return;
  }

  Serial.print("[Gate] gateId=");
  Serial.print(gateId);
  Serial.print(" command=");
  Serial.println(command);

  if (gateId == "entry-gate") {
    displayStatus("entry-gate", command);
    if (command == "open") {
      sweepServo(entryServo, entryAngle, SERVO_MAX_ANGLE);  // 0 -> 180
    } else {
      sweepServo(entryServo, entryAngle, SERVO_MIN_ANGLE);  // 180 -> 0
    }
  }

  if (gateId == "exit-gate") {
    displayStatus("exit-gate", command);
    if (command == "open") {
      sweepServo(exitServo, exitAngle, SERVO_MAX_ANGLE);  // 0 -> 180
    } else {
      sweepServo(exitServo, exitAngle, SERVO_MIN_ANGLE);  // 180 -> 0
    }
  }

  displayStatus("Done", gateId + " " + command);
}

void emitHardwareJoin() {
  if (joinSent) {
    return;  // Prevent duplicate join emissions
  }

  DynamicJsonDocument doc(256);
  JsonArray root = doc.to<JsonArray>();
  root.add("hardware.join");

  JsonObject payload = root.createNestedObject();
  if (simulatorApiKey.length() > 0) {
    payload["apiKey"] = simulatorApiKey;
  }

  String output;
  serializeJson(doc, output);
  
  // Debug payload
  Serial.print("[Socket] Payload being sent: ");
  Serial.println(output);
  Serial.print("[Socket] Payload length: ");
  Serial.println(output.length());
  
  socketIO.sendEVENT(output);
  joinSent = true;
  Serial.println("[Socket] hardware.join sent");
}

void handleGateEnvelope(JsonObjectConst envelope) {
  JsonVariantConst payload = envelope["payload"];
  if (payload.isNull()) {
    return;
  }

  const char* gateId = payload["gateId"] | "";
  const char* command = payload["command"] | "";

  if (strlen(gateId) == 0 || strlen(command) == 0) {
    return;
  }

  applyGateCommand(String(gateId), String(command));
}

void onSocketEvent(socketIOmessageType_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case sIOtype_DISCONNECT:
      socketConnected = false;
      joinSent = false;
      Serial.println("[Socket] Disconnected");
      displayStatus("Socket", "Disconnected");
      break;

    case sIOtype_CONNECT:
      socketConnected = true;
      Serial.println("[Socket] Connected");
      displayStatus("Socket", "Connected");
      // small delay to ensure handshake fully settled on both sides
      delay(200);
      emitHardwareJoin();
      break;

    case sIOtype_EVENT: {
      // Debug: Log raw packet
      Serial.print("[Socket] RAW EVENT packet (");
      Serial.print(length);
      Serial.print(" bytes): ");
      Serial.write(payload, length);
      Serial.println();
      
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, payload, length);
      if (error) {
        Serial.print("[Socket] JSON parse error: ");
        Serial.println(error.c_str());
        return;
      }

      JsonArray root = doc.as<JsonArray>();
      if (root.size() < 2 || !root[0].is<const char*>()) {
        Serial.print("[Socket] Invalid event structure - size: ");
        Serial.println(root.size());
        return;
      }

      String channel = root[0].as<String>();
      Serial.print("[Socket] Event channel: ");
      Serial.println(channel);

      // Backend emits envelope on both channels:
      // - realtime.event
      // - gate.command.sent
      if (channel == "gate.command.sent") {
        JsonObjectConst envelope = root[1].as<JsonObjectConst>();
        handleGateEnvelope(envelope);
        return;
      }

      if (channel == "realtime.event") {
        JsonObjectConst envelope = root[1].as<JsonObjectConst>();
        const char* eventName = envelope["eventName"] | "";
        if (String(eventName) == "gate.command.sent") {
          handleGateEnvelope(envelope);
        }
        return;
      }

      break;
    }

    case sIOtype_ACK:
      Serial.println("[Socket] ACK received");
      break;

    case sIOtype_ERROR:
      Serial.println("[Socket] ERROR received");
      socketConnected = false;
      joinSent = false;
      break;

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  displayStatus("Boot", "Starting...");

  entryServo.setPeriodHertz(50);
  exitServo.setPeriodHertz(50);
  entryServo.attach(ENTRY_SERVO_PIN, 500, 2400);
  exitServo.attach(EXIT_SERVO_PIN, 500, 2400);

  entryServo.write(entryAngle);
  exitServo.write(exitAngle);

  connectWiFi();

  if (!fetchSocketConfigFromBackend()) {
    Serial.println("[Bootstrap] Failed to load config. Using fallback defaults.");
    displayStatus("Bootstrap fail", "Using fallback");
    socketHost = BOOTSTRAP_HOST_STR;
    socketPort = BOOTSTRAP_PORT_VAL;
      socketPath = "/socket.io";
    reconnectIntervalMs = 5000;
  }

  socketIO.begin(socketHost.c_str(), socketPort, socketPath.c_str());
  socketIO.onEvent(onSocketEvent);
  socketIO.setReconnectInterval(reconnectIntervalMs);

  Serial.print("[Socket] begin -> host=");
  Serial.print(socketHost);
  Serial.print(" port=");
  Serial.print(socketPort);
  Serial.print(" path=");
  Serial.println(socketPath);

  Serial.println("[System] Ready");
  displayStatus("System", "Ready");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  socketIO.loop();

  // Monitor connection state
  unsigned long now = millis();
  if (!socketConnected && (now - lastReconnectAttempt) > reconnectIntervalMs) {
    lastReconnectAttempt = now;
    Serial.println("[Socket] Attempting reconnect...");
  }
}
