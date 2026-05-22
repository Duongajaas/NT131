#include <WiFi.h>
#include <HTTPClient.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "hardware_config.h"

// Optional LCD support. Remove if your board does not have an I2C LCD.
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
// Optional MFRC522 RFID reader (SPI)
#include <SPI.h>
#include <MFRC522.h>

// FreeRTOS multitasking support
#include "freertos-tasks.h"

// Default MFRC522 pin mapping (override in hardware_config.h if needed)
#ifndef SS_PIN
#define SS_PIN 5
#endif
#ifndef RST_PIN
#define RST_PIN 17
#endif

// Backward-compatible aliases used by older config snippets.
#ifndef RFID_SS_PIN
#define RFID_SS_PIN SS_PIN
#endif
#ifndef RFID_RST_PIN
#define RFID_RST_PIN RST_PIN
#endif

MFRC522 mfrc522(SS_PIN, RST_PIN);

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
String socketPath = "/socket.io";
String simulatorApiKey = SIMULATOR_KEY;
String hardwareBootstrapKey = HARDWARE_BOOTSTRAP_KEY_STR;
uint32_t reconnectIntervalMs = 5000;

// ===== Servo pins =====
extern const int ENTRY_SERVO_PIN = HW_ENTRY_SERVO_PIN;  // entry-gate
extern const int EXIT_SERVO_PIN = HW_EXIT_SERVO_PIN;   // exit-gate (servo 1)

extern const int SERVO_MIN_ANGLE = 0;
extern const int SERVO_MAX_ANGLE = 180;
extern const int SERVO_STEP = 5;
extern const int SERVO_STEP_DELAY_MS = 35;
const bool OPERATOR_ONLY_CONTROL = true;

// Auto-close delay after opening gate (milliseconds). Set to 0 to disable.
const uint32_t DEFAULT_AUTO_CLOSE_MS = 1500;

const char* GATE_ENTRY = "entry-gate";
const char* GATE_EXIT = "exit-gate";
const char* CMD_OPEN = "open";
const char* CMD_CLOSE = "close";
const char* CHECKPOINT_ENTRY = "entry_rfid";
const char* CHECKPOINT_EXIT = "exit_rfid";

// ===== Connection state =====
bool socketConnected = false;
bool joinSent = false;
bool joinPending = false;
unsigned long joinRequestedAt = 0;
unsigned long lastReconnectAttempt = 0;
extern const unsigned long JOIN_DELAY_MS = 1000;
bool rfidScanEnabled = false;
String currentRfidCheckpoint = CHECKPOINT_ENTRY;
String currentRfidCorrelationId = "";
String serialRfidBuffer = "";
unsigned long serialRfidLastByteAt = 0;
const unsigned long SERIAL_RFID_IDLE_FLUSH_MS = 40;
const size_t SERIAL_RFID_MAX_BUFFER = 64;
String lastScannedUid = "";
String lastHandledEventId = "";

LiquidCrystal_I2C lcd(0x27, 16, 2);
SocketIOclient socketIO;
Servo entryServo;
Servo exitServo;

int entryAngle = 0;
int exitAngle = 0;
bool entryAngleSet = false;  // Track if entry servo has been explicitly set
bool exitAngleSet = false;   // Track if exit servo has been explicitly set

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
  // Match the frontend client: keep the actual Socket.IO endpoint fixed.
  // The bootstrap response is still logged for verification, but the live connection always uses /socket.io.
  socketPath = "/socket.io";
  simulatorApiKey = fetchedSimulatorApiKey;
  hardwareBootstrapKey = HARDWARE_BOOTSTRAP_KEY_STR;
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

void sweepServo(Servo& servo, int& currentAngle, int targetAngle, bool& angleSet) {
  targetAngle = constrain(targetAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);

  // If angle already matches target and has been explicitly set before, skip
  if (currentAngle == targetAngle && angleSet) {
    Serial.print("[sweepServo] angle already at target ");
    Serial.print(currentAngle);
    Serial.println(" (skipping sweep)");
    return;
  }

  // Mark as set before sweep
  angleSet = true;

  int step = (targetAngle > currentAngle) ? SERVO_STEP : -SERVO_STEP;
  Serial.print("[sweepServo] from ");
  Serial.print(currentAngle);
  Serial.print(" to ");
  Serial.println(targetAngle);
  for (int angle = currentAngle; (step > 0) ? angle <= targetAngle : angle >= targetAngle; angle += step) {
    servo.write(angle);
    Serial.print("[sweepServo] write angle=");
    Serial.println(angle);
    delay(SERVO_STEP_DELAY_MS);
  }

  servo.write(targetAngle);
  currentAngle = targetAngle;
}

void openEntryGate() {
  sweepServo(entryServo, entryAngle, SERVO_MAX_ANGLE, entryAngleSet);  // 0 -> 180
}

void closeEntryGate() {
  sweepServo(entryServo, entryAngle, SERVO_MIN_ANGLE, entryAngleSet);  // 180 -> 0
}

void openExitGate() {
  sweepServo(exitServo, exitAngle, SERVO_MAX_ANGLE, exitAngleSet);  // 0 -> 180
}

void closeExitGate() {
  sweepServo(exitServo, exitAngle, SERVO_MIN_ANGLE, exitAngleSet);  // 180 -> 0
}

String normalizeGateId(const String& gateId) {
  if (gateId == "entry" || gateId == "in" || gateId == "gate-in") {
    return String(GATE_ENTRY);
  }

  if (gateId == "exit" || gateId == "out" || gateId == "gate-out") {
    return String(GATE_EXIT);
  }

  return gateId;
}

String normalizeCommand(const String& command) {
  if (command == "mo") {
    return String(CMD_OPEN);
  }

  if (command == "dong") {
    return String(CMD_CLOSE);
  }

  return command;
}

void applyGateCommand(const String& gateId, const String& command, const String& source = String("backend"), uint32_t seq = 0) {
  String normalizedGateId = normalizeGateId(gateId);
  String normalizedCommand = normalizeCommand(command);

  if (normalizedGateId != GATE_ENTRY && normalizedGateId != GATE_EXIT) {
    return;
  }

  if (normalizedCommand != CMD_OPEN && normalizedCommand != CMD_CLOSE) {
    return;
  }

  Serial.print("[Gate] queueing command: gateId=");
  Serial.print(normalizedGateId);
  Serial.print(" command=");
  Serial.println(normalizedCommand);

  // Queue servo command to the servo control task
  ServoCommand cmd;
  strncpy(cmd.gateId, normalizedGateId.c_str(), sizeof(cmd.gateId) - 1);
  strncpy(cmd.command, normalizedCommand.c_str(), sizeof(cmd.command) - 1);
  strncpy(cmd.source, source.c_str(), sizeof(cmd.source) - 1);
  cmd.seq = seq;
  cmd.commandId = millis();
  // Auto-close only for open commands by default
  if (normalizedCommand == CMD_OPEN) {
    cmd.autoCloseMs = DEFAULT_AUTO_CLOSE_MS;
  } else {
    cmd.autoCloseMs = 0;
  }

  if (xQueueSend(queueServoCommand, &cmd, pdMS_TO_TICKS(100)) == pdTRUE) {
    Serial.println("[Gate] command queued successfully");
    emitGateAck(cmd, millis(), millis());
    DisplayMessage msg;
    snprintf(msg.line1, sizeof(msg.line1), "Gate: %s", normalizedGateId.c_str());
    snprintf(msg.line2, sizeof(msg.line2), "%s...", normalizedCommand.c_str());
    msg.durationMs = 500;
    xQueueSend(queueDisplay, &msg, pdMS_TO_TICKS(100));
  } else {
    Serial.println("[Gate] failed to queue command");
  }
}

String normalizeUid(const String& uid) {
  String normalized = "";
  for (size_t i = 0; i < uid.length(); ++i) {
    char ch = uid.charAt(i);
    if (isxdigit(static_cast<unsigned char>(ch))) {
      normalized += static_cast<char>(toupper(static_cast<unsigned char>(ch)));
    }
  }

  normalized.trim();
  return normalized;
}

bool isLikelyUidFormat(const String& value) {
  bool hasHex = false;
  for (size_t i = 0; i < value.length(); ++i) {
    char ch = value.charAt(i);
    if (isxdigit(static_cast<unsigned char>(ch))) {
      hasHex = true;
      continue;
    }

    if (ch == ' ' || ch == ':' || ch == '-' || ch == '\t') {
      continue;
    }

    return false;
  }

  return hasHex;
}

void emitGateAck(const ServoCommand& cmd, uint32_t receivedTs, uint32_t processedTs) {
  if (cmd.seq == 0) {
    return;
  }

  DynamicJsonDocument ackDoc(256);
  JsonObject obj = ackDoc.to<JsonObject>();
  obj["seq"] = cmd.seq;
  obj["gateId"] = cmd.gateId;
  obj["command"] = cmd.command;
  obj["source"] = cmd.source;
  obj["receivedTs"] = receivedTs;
  obj["processedTs"] = processedTs;

  String out;
  serializeJson(obj, out);
  String evt = String("[\"gate.ack\",") + out + String("]");
  bool ok = socketIO.sendEVENT(evt);

  Serial.print("[Gate ACK] sent seq=");
  Serial.print(cmd.seq);
  Serial.print(" ok=");
  Serial.println(ok ? "true" : "false");
}

void emitRfidScanEvent(const String& uid, const String& checkpoint) {
  String normalizedUid = normalizeUid(uid);
  if (normalizedUid.length() == 0) {
    return;
  }

  Serial.print("[RFID] uid detected: ");
  Serial.println(normalizedUid);
  // show immediate UID and start checking
  lastScannedUid = normalizedUid;
  displayStatus("Checking", normalizedUid);

  if (!rfidScanEnabled) {
    Serial.println("[RFID] Ignore scan: waiting_rfid stage is not active");
    displayStatus("RFID ignored", "Not waiting stage");
    return;
  }

  if (!socketConnected || !joinSent) {
    Serial.println("[RFID] Skip emit: socket not ready");
    return;
  }

  DynamicJsonDocument doc(512);
  JsonArray root = doc.to<JsonArray>();
  root.add("hardware.rfid.scan");

  JsonObject payload = root.createNestedObject();
  payload["uid"] = normalizedUid;
  payload["checkpoint"] = checkpoint;
  payload["correlationId"] = currentRfidCorrelationId.length() > 0
    ? currentRfidCorrelationId
    : String("esp32-rfid-") + String(millis());

  String output;
  serializeJson(doc, output);

  Serial.print("[RFID] emit payload: ");
  Serial.println(output);
  bool ok = socketIO.sendEVENT(output);
  Serial.print("[RFID] sendEVENT ok: ");
  Serial.println(ok ? "true" : "false");

  if (ok) {
    rfidScanEnabled = false;
    // keep showing checking until backend responds; backend will send accepted/rejected
    Serial.println("[RFID] scan emitted, awaiting backend response...");
  }
}

void processSerialRfidInput() {
  while (Serial.available() > 0) {
    char ch = static_cast<char>(Serial.read());
    serialRfidLastByteAt = millis();

    if (ch == '\r') {
      continue;
    }

    if (ch == '\n') {
      break;
    }

    serialRfidBuffer += ch;

    if (serialRfidBuffer.length() > SERIAL_RFID_MAX_BUFFER) {
      Serial.println("[RFID] serial buffer overflow, clearing");
      serialRfidBuffer = "";
      break;
    }
  }

  if (serialRfidBuffer.length() == 0) {
    return;
  }

  const bool shouldFlushLine = Serial.available() == 0 && (millis() - serialRfidLastByteAt) >= SERIAL_RFID_IDLE_FLUSH_MS;
  if (!shouldFlushLine && serialRfidBuffer.indexOf(':') < 0 && serialRfidBuffer.indexOf(' ') < 0) {
    return;
  }

  String line = serialRfidBuffer;
  serialRfidBuffer = "";
  line.trim();

  if (line.length() == 0) {
    return;
  }

  Serial.print("[RFID] raw input: ");
  Serial.println(line);

  if (line.startsWith("RFID_ENTRY:")) {
    String uid = line.substring(11);
    emitRfidScanEvent(uid, currentRfidCheckpoint.length() > 0 ? currentRfidCheckpoint : String(CHECKPOINT_ENTRY));
    return;
  }

  if (line.startsWith("RFID_EXIT:")) {
    String uid = line.substring(10);
    emitRfidScanEvent(uid, CHECKPOINT_EXIT);
    return;
  }

  if (line.startsWith("RFID:")) {
    String uid = line.substring(5);
    emitRfidScanEvent(uid, currentRfidCheckpoint.length() > 0 ? currentRfidCheckpoint : String(CHECKPOINT_ENTRY));
    return;
  }

  if (line.startsWith("UID:")) {
    String uid = line.substring(4);
    emitRfidScanEvent(uid, currentRfidCheckpoint.length() > 0 ? currentRfidCheckpoint : String(CHECKPOINT_ENTRY));
    return;
  }

  if (isLikelyUidFormat(line)) {
    emitRfidScanEvent(line, currentRfidCheckpoint.length() > 0 ? currentRfidCheckpoint : String(CHECKPOINT_ENTRY));
  }
}

void handleRealtimeEnvelope(JsonObjectConst envelope) {
  const char* eventId = envelope["eventId"] | "";
  if (strlen(eventId) > 0 && String(eventId) == lastHandledEventId) {
    return;
  }
  if (strlen(eventId) > 0) {
    lastHandledEventId = String(eventId);
  }

  const char* eventName = envelope["eventName"] | "";
  JsonObjectConst payload = envelope["payload"].as<JsonObjectConst>();
  const char* src = envelope["source"] | "";

  if (String(eventName) == "simulator.stage.changed") {
    const char* stage = payload["stage"] | "";
    const char* checkpoint = payload["checkpoint"] | "";
    const char* correlationId = envelope["correlationId"] | "";

    Serial.print("[Stage] simulator.stage.changed: ");
    Serial.println(stage);
    displayStatus("Stage", String(stage));

    if (String(stage) == "waiting_rfid") {
      rfidScanEnabled = true;
      currentRfidCheckpoint = strlen(checkpoint) > 0 ? String(checkpoint) : String(CHECKPOINT_ENTRY);
      currentRfidCorrelationId = String(correlationId);
      displayStatus("waiting_rfid", "Scan RFID card");
      Serial.print("[RFID] waiting at checkpoint: ");
      Serial.println(currentRfidCheckpoint);
    }
    if (String(stage) == "exiting" || String(stage) == "exit_processing") {
      // Vehicle ready to exit → open exit gate
      Serial.println("[Stage] Auto-opening exit gate (exiting/exit_processing)");
      applyGateCommand(String(GATE_EXIT), String(CMD_OPEN), String("simulator"));
    }
    return;
  }

  if (String(eventName) == "vehicle.state.changed") {
    const char* checkpoint = payload["checkpoint"] | "";
    const char* state = payload["state"] | "";
    const char* correlationId = envelope["correlationId"] | "";

    Serial.print("[Vehicle] checkpoint=");
    Serial.print(checkpoint);
    Serial.print(" state=");
    Serial.println(state);

    if (String(checkpoint) == CHECKPOINT_ENTRY && String(state) == "arrived") {
      rfidScanEnabled = true;
      currentRfidCheckpoint = String(CHECKPOINT_ENTRY);
      currentRfidCorrelationId = String(correlationId);
      displayStatus("waiting_rfid", "Scan RFID card");
      Serial.println("[RFID] entry checkpoint arrived, waiting for scan");
    }
    if (String(checkpoint) == CHECKPOINT_EXIT && String(state) == "arrived") {
      rfidScanEnabled = true;
      currentRfidCheckpoint = String(CHECKPOINT_EXIT);
      currentRfidCorrelationId = String(correlationId);
      displayStatus("waiting_rfid_exit", "Scan RFID card");
      Serial.println("[RFID] exit checkpoint arrived, waiting for scan");
    }
    // If the vehicle has passed the barrier at a checkpoint, request gate close
    if (String(state) == "passed" || String(state) == "exited" || String(state) == "departed") {
      String gateId = (String(checkpoint) == CHECKPOINT_ENTRY) ? String(GATE_ENTRY) : String(GATE_EXIT);
      Serial.print("[Vehicle] passing detected at checkpoint ");
      Serial.print(checkpoint);
      Serial.print(" -> requesting gate close for ");
      Serial.println(gateId);
      applyGateCommand(gateId, String(CMD_CLOSE));
    }
    return;
  }

  if (String(eventName) == "rfid.scan.accepted") {
    rfidScanEnabled = false;
    const char* uid = payload["uid"] | "";
    const char* checkpoint = payload["checkpoint"] | "";
    const char* expected_plate = payload["expected_plate_number"] | payload["expected_plate"] | "";
    String showUid = (strlen(uid) > 0) ? String(uid) : lastScannedUid;
    displayStatus("RFID accepted", showUid);
    Serial.print("[RFID] accepted uid: ");
    Serial.println(showUid);
    if (strlen(expected_plate) > 0) {
      Serial.print("[RFID] expected_plate: ");
      Serial.println(expected_plate);
    }
    
    // Open entry gate when RFID accepted at entry
    String checkpointStr = strlen(checkpoint) > 0 ? String(checkpoint) : String("");
    if (checkpointStr == CHECKPOINT_ENTRY || checkpointStr == "") {
      Serial.println("[RFID] Opening entry gate (RFID accepted at entry)");
      applyGateCommand(String(GATE_ENTRY), String(CMD_OPEN), String("backend"));
    }
    // Emit generic event ACK if seq present in payload
    {
      int seq = payload["seq"] | 0;
      if (seq > 0) {
        DynamicJsonDocument ackDoc(256);
        JsonObject obj = ackDoc.to<JsonObject>();
        obj["event"] = String(eventName);
        obj["seq"] = seq;
        obj["receivedTs"] = millis();
        obj["processedTs"] = millis();
        String out; serializeJson(obj, out);
        String evt = String("[\"event.ack\",") + out + String("]");
        bool ok = socketIO.sendEVENT(evt);
        Serial.print("[Event ACK] sent event="); Serial.print(eventName); Serial.print(" seq="); Serial.print(seq); Serial.print(" ok="); Serial.println(ok ? "true" : "false");
      }
    }
    
    return;
  }

  if (String(eventName) == "rfid.scan.rejected") {
    rfidScanEnabled = true;
    const char* uid = payload["uid"] | "";
    const char* reason = payload["reason"] | "";
    String showUid = (strlen(uid) > 0) ? String(uid) : lastScannedUid;
    String line2 = "Try again";
    if (strlen(reason) > 0) {
      line2 = String(reason).substring(0, 16);
    }
    displayStatus("RFID rejected", showUid);
    Serial.print("[RFID] rejected uid: ");
    Serial.println(showUid);
    if (strlen(reason) > 0) {
      Serial.print("[RFID] reason: ");
      Serial.println(reason);
    }
    return;
  }

  // Fallback: some simulator-originated packets may carry direct gate commands
  // even if a top-level "gate.command.sent" event wasn't emitted. Accept
  // simulator-sourced payloads that include gateId+command and apply them.
  if (String(src) == "simulator") {
    const char* maybeGateId = payload["gateId"] | "";
    const char* maybeCommand = payload["command"] | "";
    if (strlen(maybeGateId) > 0 && strlen(maybeCommand) > 0) {
      Serial.print("[Fallback] applying simulator gate command: ");
      Serial.print(maybeGateId);
      Serial.print(" ");
      Serial.println(maybeCommand);
      applyGateCommand(String(maybeGateId), String(maybeCommand), String("simulator"));
    }
  }
}

void handleDirectEventPacket(const String& eventName, JsonObjectConst envelope) {
  if (eventName == "gate.command.sent") {
    handleGateEnvelope(envelope);
    return;
  }

  if (
    eventName == "simulator.stage.changed" ||
    eventName == "vehicle.state.changed" ||
    eventName == "rfid.scan.accepted" ||
    eventName == "rfid.scan.rejected"
  ) {
    handleRealtimeEnvelope(envelope);
  }
}

void emitHardwareJoin() {
  if (joinSent) {
    return;  // Prevent duplicate join emissions
  }

  DynamicJsonDocument doc(512);
  JsonArray root = doc.to<JsonArray>();
  root.add("hardware.join");
  
  JsonObject payload = root.createNestedObject();
  if (hardwareBootstrapKey.length() > 0) {
    payload["hardwareKey"] = hardwareBootstrapKey;
  }

  String output;
  serializeJson(doc, output);
  
  // Debug payload
  Serial.print("[Socket] Payload being sent: ");
  Serial.println(output);
  Serial.print("[Socket] Payload length: ");
  Serial.println(output.length());
  
  bool ok = socketIO.sendEVENT(output);
  Serial.print("[Socket] sendEVENT ok: ");
  Serial.println(ok ? "true" : "false");
  joinSent = true;
  Serial.println("[Socket] hardware.join sent");

  // Also send a simple test event so backend can detect any incoming events from this client.
  String testPayload = String("[\"__hardware_test\",{\"now\":") + String(millis()) + String("}]");
  Serial.print("[Socket] sending __hardware_test: ");
  Serial.println(testPayload);
  bool okTest = socketIO.sendEVENT(testPayload);
  Serial.print("[Socket] sendEVENT __hardware_test ok: ");
  Serial.println(okTest ? "true" : "false");
}

void handleGateEnvelope(JsonObjectConst envelope) {
  const char* source = envelope["source"] | "";
  String src = String(source);
  if (OPERATOR_ONLY_CONTROL && !(src == "operator" || src == "simulator")) {
    Serial.print("[Gate] Ignored command from source=");
    Serial.println(source);
    return;
  }

  JsonVariantConst payload = envelope["payload"];
  if (payload.isNull()) {
    return;
  }

  const char* gateId = payload["gateId"] | "";
  const char* command = payload["command"] | "";
  uint32_t seq = payload["seq"] | 0;

  if (strlen(gateId) == 0 || strlen(command) == 0) {
    return;
  }

  applyGateCommand(String(gateId), String(command), src, seq);
}

void onSocketEvent(socketIOmessageType_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case sIOtype_DISCONNECT:
      socketConnected = false;
      joinSent = false;
      joinPending = false;
      Serial.println("[Socket] Disconnected");
      // Provide extra state info on disconnect for debugging
      Serial.print("[Socket] Disconnect state -> joinSent=");
      Serial.print(joinSent ? "true" : "false");
      Serial.print(" joinPending=");
      Serial.println(joinPending ? "true" : "false");
      displayStatus("Socket", "Disconnected");
      break;

    case sIOtype_CONNECT:
      socketConnected = true;
      Serial.println("[Socket] Connected");
      displayStatus("Socket", "Connected");
      joinPending = true;
      joinRequestedAt = millis();
      joinSent = false;
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
      // - named direct event channels like simulator.stage.changed
      if (channel == "gate.command.sent") {
        JsonObjectConst envelope = root[1].as<JsonObjectConst>();
        handleGateEnvelope(envelope);
        return;
      }

      if (
        channel == "simulator.stage.changed" ||
        channel == "vehicle.state.changed" ||
        channel == "rfid.scan.accepted" ||
        channel == "rfid.scan.rejected"
      ) {
        JsonObjectConst envelope = root[1].as<JsonObjectConst>();
        handleDirectEventPacket(channel, envelope);
        return;
      }

      if (channel == "realtime.event") {
        JsonObjectConst envelope = root[1].as<JsonObjectConst>();
        handleRealtimeEnvelope(envelope);
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
      joinPending = false;
      break;

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(30);
  delay(500);

  // Initialize SPI and RFID reader
  // ensure SS/RST pins are stable
  pinMode(RFID_SS_PIN, OUTPUT);
  digitalWrite(RFID_SS_PIN, HIGH);
  pinMode(RFID_RST_PIN, OUTPUT);
  digitalWrite(RFID_RST_PIN, HIGH);
  SPI.begin(18, 19, 23, RFID_SS_PIN);
  mfrc522.PCD_Init();
  mfrc522.PCD_AntennaOn();
  delay(200);
  byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print("[RFID] MFRC522 Version: 0x");
  Serial.println(version, HEX);
  Serial.print("[RFID] SS_PIN=");
  Serial.print(SS_PIN);
  Serial.print(" RST_PIN=");
  Serial.println(RST_PIN);
  Serial.println("[RFID] MFRC522 initialized");

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  displayStatus("Boot", "Starting...");

  entryServo.setPeriodHertz(50);
  exitServo.setPeriodHertz(50);

  if (ENTRY_SERVO_PIN == EXIT_SERVO_PIN) {
    Serial.println("[Servo] Invalid config: ENTRY_SERVO_PIN and EXIT_SERVO_PIN must be different");
    displayStatus("Servo config", "Pins must differ");
    while (true) {
      delay(1000);
    }
  }

  entryServo.attach(ENTRY_SERVO_PIN, 500, 2400);
  exitServo.attach(EXIT_SERVO_PIN, 500, 2400);

  Serial.print("[Servo] Entry pin: D");
  Serial.println(ENTRY_SERVO_PIN);
  Serial.print("[Servo] Exit pin: D");
  Serial.println(EXIT_SERVO_PIN);

  entryServo.write(entryAngle);
  exitServo.write(exitAngle);

  connectWiFi();

  if (!fetchSocketConfigFromBackend()) {
    Serial.println("[Bootstrap] Failed to load config. Using fallback defaults.");
    displayStatus("Bootstrap fail", "Using fallback");
    socketHost = BOOTSTRAP_HOST_STR;
    socketPort = BOOTSTRAP_PORT_VAL;
    socketPath = "/socket.io";
    hardwareBootstrapKey = HARDWARE_BOOTSTRAP_KEY_STR;
    reconnectIntervalMs = 5000;
  }

  // Use the library's native Socket.IO handshake shape. The server allows EIO3,
  // and we keep a hardware marker in the query string while preserving the client header.
    String fullPath = "/socket.io/?EIO=3&clientType=hardware";
    socketPath = fullPath;
    socketIO.begin(socketHost.c_str(), socketPort, fullPath.c_str());
  socketIO.onEvent(onSocketEvent);
  socketIO.setReconnectInterval(reconnectIntervalMs);
  
  Serial.println("[Socket] Using path: " + fullPath);

  Serial.print("[Socket] begin -> host=");
  Serial.print(socketHost);
  Serial.print(" port=");
  Serial.print(socketPort);
  Serial.print(" path=");
  Serial.println(socketPath);

  Serial.print("[DEBUG] Final socketHost: '");
  Serial.print(socketHost);
  Serial.println("'");
  Serial.print("[DEBUG] Final socketPort: ");
  Serial.println(socketPort);
  Serial.print("[DEBUG] Final socketPath: '");
  Serial.print(socketPath);
  Serial.println("'");

  Serial.print("[DEBUG] Bootstrap socket path source: '");
  Serial.print(BOOTSTRAP_PATH_STR);
  Serial.println("'");

  Serial.println("[System] Ready");
  Serial.println("[RFID] Serial test commands:");
  Serial.println("[RFID] RFID:<UID>");
  Serial.println("[RFID] RFID_ENTRY:<UID>");
  Serial.println("[RFID] RFID_EXIT:<UID>");
  displayStatus("System", "Ready");

  // ===== Initialize FreeRTOS =====
  Serial.println("[System] Initializing FreeRTOS...");
  initializeFreertos();
  createAllTasks();
  Serial.println("[System] FreeRTOS started - scheduler taking control");
}

void loop() {
  // With FreeRTOS running, the main loop is minimal
  // All work is handled by individual tasks:
  // - taskSocketIO (Core 1): Socket.IO events
  // - taskRfidPolling (Core 0): RFID card polling
  // - taskServoControl (Core 0): Servo control
  // - taskWifiManager (Core 1): WiFi management
  // - taskLcdDisplay (Core 0): LCD updates
  //
  // Main thread responsibilities:
  // 1. Process serial RFID input
  // 2. Emit queued RFID events
  // 3. Handle join request
  
  processSerialRfidInput();
  
  // Send join if needed
  static unsigned long lastJoinAttempt = 0;
  if (socketConnected && joinPending && !joinSent && 
      (millis() - lastJoinAttempt) >= JOIN_DELAY_MS) {
    lastJoinAttempt = millis();
    emitHardwareJoinFromLoop();
  }

  // Process any queued RFID events
  processQueuedRfidEvents();

  // Yield to scheduler
  vTaskDelay(pdMS_TO_TICKS(50));
}

void processMfrcRfid() {
  static unsigned long lastPollLogAt = 0;
  static unsigned long lastNoCardLogAt = 0;
  // Only poll for cards when RFID scanning is enabled
  if (!rfidScanEnabled) {
    return;
  }

  unsigned long now = millis();
  if (now - lastPollLogAt > 2000) {
    Serial.println("[RFID] poll: checking reader for card...");
    lastPollLogAt = now;
  }

  // Non-blocking poll of MFRC522 reader
  if (!mfrc522.PICC_IsNewCardPresent()) {
    if (now - lastNoCardLogAt > 5000) {
      Serial.println("[RFID] no card present");
      lastNoCardLogAt = now;
    }
    return;
  }

  Serial.println("[RFID] card detected, reading UID...");

  if (!mfrc522.PICC_ReadCardSerial()) {
    Serial.println("[RFID] PICC_ReadCardSerial failed");
    mfrc522.PCD_Reset();
    delay(50);
    mfrc522.PCD_Init();
    mfrc522.PCD_AntennaOn();
    return;
  }

  // Build UID string as spaced hex (e.g., D4 15 13 07)
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    byte b = mfrc522.uid.uidByte[i];
    if (b < 0x10) uid += "0";
    uid += String(b, HEX);
    if (i + 1 < mfrc522.uid.size) uid += " ";
  }

  uid.toUpperCase();
  Serial.print("[RFID] MFRC522 UID: ");
  Serial.println(uid);

  // Emit to backend using existing helper (will check rfidScanEnabled inside)
  emitRfidScanEvent(uid, currentRfidCheckpoint.length() > 0 ? currentRfidCheckpoint : String(CHECKPOINT_ENTRY));

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

// ===== Process Queued RFID Events (called from main loop) =====
void processQueuedRfidEvents() {
  RfidScanEvent event;
  
  while (xQueueReceive(queueRfidEvent, &event, 0) == pdTRUE) {
    if (!socketConnected || !joinSent) {
      Serial.println("[RFID] Skip emit: socket not ready");
      continue;
    }

    Serial.print("[RFID] Emitting queued event: ");
    Serial.println(event.uid);

    Serial.println("[Mutex] taking socketIO mutex (RFID queued emit)");
    if (xSemaphoreTake(mutexSocketIO, pdMS_TO_TICKS(500)) == pdTRUE) {
      Serial.println("[Mutex] acquired (RFID queued emit)");
      DynamicJsonDocument doc(512);
      JsonArray root = doc.to<JsonArray>();
      root.add("hardware.rfid.scan");

      JsonObject payload = root.createNestedObject();
      payload["uid"] = event.uid;
      payload["checkpoint"] = event.checkpoint;
      payload["correlationId"] = String(event.correlationId).length() > 0 
        ? String(event.correlationId) 
        : String("esp32-rfid-") + String(millis());

      String output;
      serializeJson(doc, output);

      Serial.print("[RFID] emit payload: ");
      Serial.println(output);
      bool ok = socketIO.sendEVENT(output);
      Serial.print("[RFID] sendEVENT ok: ");
      Serial.println(ok ? "true" : "false");

      rfidScanEnabled = false;
      xSemaphoreGive(mutexSocketIO);
      Serial.println("[Mutex] released (RFID queued emit)");
    } else {
      Serial.println("[Mutex] failed to acquire socketIO mutex (RFID queued emit)");
    }
  }
}

// ===== Emit Hardware Join (called from main loop) =====
void emitHardwareJoinFromLoop() {
  if (joinSent) {
    return;
  }

  Serial.println("[Mutex] taking socketIO mutex (hardware.join)");
  if (xSemaphoreTake(mutexSocketIO, pdMS_TO_TICKS(500)) == pdTRUE) {
    Serial.println("[Mutex] acquired (hardware.join)");
    DynamicJsonDocument doc(512);
    JsonArray root = doc.to<JsonArray>();
    root.add("hardware.join");
    
    JsonObject payload = root.createNestedObject();
    if (hardwareBootstrapKey.length() > 0) {
      payload["hardwareKey"] = hardwareBootstrapKey;
    }

    String output;
    serializeJson(doc, output);
    
    Serial.print("[Socket] Payload being sent: ");
    Serial.println(output);
    
    bool ok = socketIO.sendEVENT(output);
    Serial.print("[Socket] sendEVENT ok: ");
    Serial.println(ok ? "true" : "false");
    joinSent = true;
    Serial.println("[Socket] hardware.join sent");

    xSemaphoreGive(mutexSocketIO);
    Serial.println("[Mutex] released (hardware.join)");
  } else {
    Serial.println("[Mutex] failed to acquire socketIO mutex (hardware.join)");
  }
}
