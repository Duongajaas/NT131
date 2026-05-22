#include "freertos-tasks.h"
#include <Arduino.h>
#include <WiFi.h>
#include <SocketIOclient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <SPI.h>
#include <MFRC522.h>

// ─────────────────────────────────────────────────────────────
// Externals declared in the main .ino file
// ─────────────────────────────────────────────────────────────
extern SocketIOclient socketIO;
extern LiquidCrystal_I2C lcd;
extern Servo entryServo;
extern Servo exitServo;
extern MFRC522 mfrc522;

extern int entryAngle;
extern int exitAngle;
extern bool entryAngleSet;
extern bool exitAngleSet;

extern bool socketConnected;
extern bool joinSent;
extern bool joinPending;
extern unsigned long joinRequestedAt;

extern bool rfidScanEnabled;
extern String currentRfidCheckpoint;
extern String currentRfidCorrelationId;

extern const char* WIFI_SSID;
extern const char* WIFI_PASSWORD;

extern const int ENTRY_SERVO_PIN;
extern const int EXIT_SERVO_PIN;
extern const int SERVO_MIN_ANGLE;
extern const int SERVO_MAX_ANGLE;
extern const int SERVO_STEP;
extern const int SERVO_STEP_DELAY_MS;

extern const char* GATE_ENTRY;
extern const char* GATE_EXIT;
extern const char* CMD_OPEN;
extern const char* CMD_CLOSE;
extern const char* CHECKPOINT_ENTRY;

extern const unsigned long JOIN_DELAY_MS;

// Functions declared in main .ino
extern void sweepServo(Servo& servo, int& currentAngle, int targetAngle, bool& angleSet);
extern void displayStatus(const String& line1, const String& line2);
extern void emitRfidScanEvent(const String& uid, const String& checkpoint);
extern void emitHardwareJoinFromLoop();
extern void processQueuedRfidEvents();
extern void processMfrcRfid();

// ─────────────────────────────────────────────────────────────
// Task Handles
// ─────────────────────────────────────────────────────────────
TaskHandle_t taskSocketIOHandle    = nullptr;
TaskHandle_t taskRfidPollingHandle = nullptr;
TaskHandle_t taskServoControlHandle= nullptr;
TaskHandle_t taskWifiManagerHandle = nullptr;
TaskHandle_t taskLcdDisplayHandle  = nullptr;
TaskHandle_t taskMetricsHandle     = nullptr;

// ─────────────────────────────────────────────────────────────
// Queue Handles
// ─────────────────────────────────────────────────────────────
QueueHandle_t queueServoCommand = nullptr;
QueueHandle_t queueRfidEvent    = nullptr;
QueueHandle_t queueWifiStatus   = nullptr;
QueueHandle_t queueDisplay      = nullptr;

// ─────────────────────────────────────────────────────────────
// Semaphore / Mutex Handles
// ─────────────────────────────────────────────────────────────
SemaphoreHandle_t mutexSocketIO   = nullptr;
SemaphoreHandle_t mutexServoState = nullptr;
SemaphoreHandle_t mutexLcd        = nullptr;

uint32_t queueMutexHeapBytes = 0;

static int computeCpuIdlePercent() {
#if (configGENERATE_RUN_TIME_STATS == 1)
    static uint32_t lastTotalRunTime = 0;
    static uint32_t lastIdleRunTime = 0;

    const UBaseType_t taskCount = uxTaskGetNumberOfTasks();
    TaskStatus_t* taskStatusArray = static_cast<TaskStatus_t*>(pvPortMalloc(taskCount * sizeof(TaskStatus_t)));
    if (!taskStatusArray) {
        return -1;
    }

    uint32_t totalRunTime = 0;
    const UBaseType_t captured = uxTaskGetSystemState(taskStatusArray, taskCount, &totalRunTime);
    uint32_t idleRunTime = 0;

    for (UBaseType_t index = 0; index < captured; ++index) {
        const char* name = taskStatusArray[index].pcTaskName;
        if (strncmp(name, "IDLE", 4) == 0) {
            idleRunTime += taskStatusArray[index].ulRunTimeCounter;
        }
    }

    vPortFree(taskStatusArray);

    if (lastTotalRunTime == 0 || totalRunTime <= lastTotalRunTime) {
        lastTotalRunTime = totalRunTime;
        lastIdleRunTime = idleRunTime;
        return -1;
    }

    const uint32_t totalDelta = totalRunTime - lastTotalRunTime;
    const uint32_t idleDelta = (idleRunTime >= lastIdleRunTime) ? (idleRunTime - lastIdleRunTime) : 0;

    lastTotalRunTime = totalRunTime;
    lastIdleRunTime = idleRunTime;

    if (totalDelta == 0) {
        return -1;
    }

    return static_cast<int>((idleDelta * 100UL) / totalDelta);
#else
    return -1;
#endif
}

// ─────────────────────────────────────────────────────────────
// initializeFreertos()
// Create all queues and mutexes before tasks are spawned.
// Call once from setup() BEFORE createAllTasks().
// ─────────────────────────────────────────────────────────────
void initializeFreertos() {
    const uint32_t heapBefore = ESP.getFreeHeap();

    // Queues ─ depth chosen conservatively; increase if commands are dropped.
    queueServoCommand = xQueueCreate(8,  sizeof(ServoCommand));
    queueRfidEvent    = xQueueCreate(4,  sizeof(RfidScanEvent));
    queueWifiStatus   = xQueueCreate(4,  sizeof(WifiStatusEvent));
    queueDisplay      = xQueueCreate(16, sizeof(DisplayMessage));

    // Mutexes
    mutexSocketIO   = xSemaphoreCreateMutex();
    mutexServoState = xSemaphoreCreateMutex();
    mutexLcd        = xSemaphoreCreateMutex();

    // Sanity check – halt loudly if any allocation failed
    if (!queueServoCommand || !queueRfidEvent || !queueWifiStatus ||
        !queueDisplay || !mutexSocketIO || !mutexServoState || !mutexLcd) {
        Serial.println("[FreeRTOS] FATAL: queue/mutex allocation failed");
        while (true) { vTaskDelay(pdMS_TO_TICKS(1000)); }
    }

    const uint32_t heapAfter = ESP.getFreeHeap();
    queueMutexHeapBytes = (heapBefore > heapAfter) ? (heapBefore - heapAfter) : 0;

    Serial.println("[FreeRTOS] Queues and mutexes created");
    Serial.print("[FreeRTOS] queue/mutex heap bytes=");
    Serial.println(queueMutexHeapBytes);
}

// ─────────────────────────────────────────────────────────────
// createAllTasks()
// Spawn all tasks with their pinned cores and priorities.
// ─────────────────────────────────────────────────────────────
void createAllTasks() {
    // Core 1 – Network-heavy tasks
    xTaskCreatePinnedToCore(taskSocketIO,    "socketIO",    STACK_SIZE_SOCKET_IO,  nullptr, TASK_PRIORITY_SOCKET_IO, &taskSocketIOHandle,     1);
    xTaskCreatePinnedToCore(taskWifiManager, "wifiMgr",     STACK_SIZE_WIFI,       nullptr, TASK_PRIORITY_WIFI,      &taskWifiManagerHandle,  1);

    // Core 0 – Hardware-heavy tasks
    xTaskCreatePinnedToCore(taskRfidPolling,  "rfidPoll",   STACK_SIZE_RFID,       nullptr, TASK_PRIORITY_RFID,      &taskRfidPollingHandle,  0);
    xTaskCreatePinnedToCore(taskServoControl, "servoCtr",   STACK_SIZE_SERVO,      nullptr, TASK_PRIORITY_SERVO,     &taskServoControlHandle, 0);
    xTaskCreatePinnedToCore(taskLcdDisplay,   "lcdDisp",    STACK_SIZE_LCD,        nullptr, TASK_PRIORITY_LCD,       &taskLcdDisplayHandle,   0);
    xTaskCreatePinnedToCore(taskMetrics,      "metrics",    STACK_SIZE_METRICS,    nullptr, TASK_PRIORITY_METRICS,   &taskMetricsHandle,      1);

    Serial.println("[FreeRTOS] All tasks created");
}

// ─────────────────────────────────────────────────────────────
// taskSocketIO (Core 1, priority 3)
// Drives the SocketIOclient loop and handles the delayed join
// handshake after a fresh connection.
// ─────────────────────────────────────────────────────────────
void taskSocketIO(void* parameter) {
    Serial.println("[taskSocketIO] started");

    for (;;) {
        // Drive the underlying WebSocket engine
        if (xSemaphoreTake(mutexSocketIO, pdMS_TO_TICKS(10)) == pdTRUE) {
            socketIO.loop();
            xSemaphoreGive(mutexSocketIO);
        }

        // Send hardware.join after connection, with a small settling delay
        if (socketConnected && joinPending && !joinSent) {
            if ((millis() - joinRequestedAt) >= JOIN_DELAY_MS) {
                emitHardwareJoinFromLoop();
                joinPending = false;
            }
        }

        // Drain any queued RFID events that were deferred
        // Ensure emits use the Socket.IO mutex to avoid concurrent socket calls
        if (xSemaphoreTake(mutexSocketIO, pdMS_TO_TICKS(100)) == pdTRUE) {
            processQueuedRfidEvents();
            xSemaphoreGive(mutexSocketIO);
        } else {
            Serial.println("[taskSocketIO] warning: could not take mutex to process queued RFID events");
        }

        vTaskDelay(pdMS_TO_TICKS(10));  // 100 Hz loop – fast enough for Socket.IO
    }
}

// ─────────────────────────────────────────────────────────────
// taskRfidPolling (Core 0, priority 3)
// Polls the MFRC522 reader when rfidScanEnabled is true and
// pushes scan results onto queueRfidEvent for the main loop /
// taskSocketIO to emit.
// ─────────────────────────────────────────────────────────────
void taskRfidPolling(void* parameter) {
    Serial.println("[taskRfidPolling] started");

    for (;;) {
        if (rfidScanEnabled) {
            processMfrcRfid();
        }
        // 150 ms between polls keeps the SPI bus quiet without adding latency
        vTaskDelay(pdMS_TO_TICKS(150));
    }
}

// ─────────────────────────────────────────────────────────────
// taskServoControl (Core 0, priority 2)
// Blocks on queueServoCommand and executes sweep operations.
// Uses mutexServoState to protect entryAngle / exitAngle.
// ─────────────────────────────────────────────────────────────
void taskServoControl(void* parameter) {
    Serial.println("[taskServoControl] started");

    ServoCommand cmd;

    for (;;) {
        // Block indefinitely until a command arrives
        if (xQueueReceive(queueServoCommand, &cmd, portMAX_DELAY) == pdTRUE) {
            Serial.print("[taskServoControl] executing gateId=");
            Serial.print(cmd.gateId);
            Serial.print(" command=");
            Serial.println(cmd.command);
            Serial.print("[taskServoControl] source=");
            Serial.println(cmd.source);

            bool isEntry  = (strcmp(cmd.gateId, GATE_ENTRY) == 0);
            bool isExit   = (strcmp(cmd.gateId, GATE_EXIT)  == 0);
            bool doOpen   = (strcmp(cmd.command, CMD_OPEN)  == 0);
            bool doClose  = (strcmp(cmd.command, CMD_CLOSE) == 0);

            if (!isEntry && !isExit) {
                Serial.print("[taskServoControl] unknown gateId: ");
                Serial.println(cmd.gateId);
                continue;
            }

            if (!doOpen && !doClose) {
                Serial.print("[taskServoControl] unknown command: ");
                Serial.println(cmd.command);
                continue;
            }

            int targetAngle = doOpen ? SERVO_MAX_ANGLE : SERVO_MIN_ANGLE;

            Serial.print("[taskServoControl] targetAngle=");
            Serial.println(targetAngle);

            if (xSemaphoreTake(mutexServoState, pdMS_TO_TICKS(500)) == pdTRUE) {
                if (isEntry) {
                    sweepServo(entryServo, entryAngle, targetAngle, entryAngleSet);
                } else {
                    sweepServo(exitServo,  exitAngle,  targetAngle, exitAngleSet);
                }
                // If an auto-close timeout is specified on the command and
                // the command was an OPEN, wait and then close the gate.
                if (doOpen && cmd.autoCloseMs > 0) {
                    // Hold the mutex to prevent concurrent servo operations
                    vTaskDelay(pdMS_TO_TICKS(cmd.autoCloseMs));
                    int closeTarget = doOpen ? SERVO_MIN_ANGLE : SERVO_MAX_ANGLE;
                    if (isEntry) {
                        sweepServo(entryServo, entryAngle, closeTarget, entryAngleSet);
                    } else {
                        sweepServo(exitServo, exitAngle, closeTarget, exitAngleSet);
                    }
                }
                xSemaphoreGive(mutexServoState);
            } else {
                Serial.println("[taskServoControl] mutex timeout – servo skipped");
            }

            // Post a brief status message to the LCD queue
            DisplayMessage msg;
            snprintf(msg.line1, sizeof(msg.line1), "Gate: %s", cmd.gateId);
            snprintf(msg.line2, sizeof(msg.line2), "%s done", cmd.command);
            msg.durationMs = 1000;
            if (xQueueSend(queueDisplay, &msg, pdMS_TO_TICKS(50)) != pdTRUE) {
                Serial.println("[taskServoControl] warning: queueDisplay full, message dropped");
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// taskWifiManager (Core 1, priority 2)
// Monitors the WiFi connection and reconnects on drop.
// Pushes a WifiStatusEvent onto queueWifiStatus on state change.
// ─────────────────────────────────────────────────────────────
void taskWifiManager(void* parameter) {
    Serial.println("[taskWifiManager] started");

    bool lastConnected = (WiFi.status() == WL_CONNECTED);

    for (;;) {
        bool nowConnected = (WiFi.status() == WL_CONNECTED);

        if (nowConnected != lastConnected) {
            WifiStatusEvent ev;
            ev.isConnected = nowConnected;
            if (nowConnected) {
                strncpy(ev.ipAddress, WiFi.localIP().toString().c_str(), sizeof(ev.ipAddress) - 1);
                ev.ipAddress[sizeof(ev.ipAddress) - 1] = '\0';
                Serial.print("[taskWifiManager] reconnected, IP=");
                Serial.println(ev.ipAddress);
            } else {
                strncpy(ev.ipAddress, "0.0.0.0", sizeof(ev.ipAddress));
                Serial.println("[taskWifiManager] connection lost");
            }
            if (xQueueSend(queueWifiStatus, &ev, pdMS_TO_TICKS(100)) != pdTRUE) {
                Serial.println("[taskWifiManager] warning: queueWifiStatus full, event dropped");
            }
            lastConnected = nowConnected;
        }

        if (!nowConnected) {
            Serial.println("[taskWifiManager] attempting reconnect...");

            DisplayMessage msg;
            strncpy(msg.line1, "WiFi", sizeof(msg.line1));
            strncpy(msg.line2, "Reconnecting...", sizeof(msg.line2));
            msg.durationMs = 3000;
            if (xQueueSend(queueDisplay, &msg, pdMS_TO_TICKS(100)) != pdTRUE) {
                Serial.println("[taskWifiManager] warning: queueDisplay full, message dropped");
            }

            WiFi.disconnect(true);
            vTaskDelay(pdMS_TO_TICKS(1000));
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

            // Wait up to 15 s for reconnection
            uint32_t deadline = millis() + 15000;
            while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
                vTaskDelay(pdMS_TO_TICKS(500));
            }

            if (WiFi.status() == WL_CONNECTED) {
                Serial.print("[taskWifiManager] reconnected, IP=");
                Serial.println(WiFi.localIP());
            } else {
                Serial.println("[taskWifiManager] reconnect failed, will retry");
            }
        }

        vTaskDelay(pdMS_TO_TICKS(5000));  // Check every 5 s
    }
}

// ─────────────────────────────────────────────────────────────
// taskLcdDisplay (Core 0, priority 1)
// Consumes DisplayMessage items from queueDisplay and shows
// them for durationMs before reverting to the idle screen.
// Uses mutexLcd to serialise I2C access.
// ─────────────────────────────────────────────────────────────
void taskLcdDisplay(void* parameter) {
    Serial.println("[taskLcdDisplay] started");

    // Idle screen shown when there are no pending messages
    const char* IDLE_LINE1 = "Gate System";
    const char* IDLE_LINE2 = "Ready";

    DisplayMessage msg;

    for (;;) {
        // Block for up to 2 s waiting for a new message
        if (xQueueReceive(queueDisplay, &msg, pdMS_TO_TICKS(2000)) == pdTRUE) {
                if (xSemaphoreTake(mutexLcd, pdMS_TO_TICKS(200)) == pdTRUE) {
                    char buf1[17];
                    char buf2[17];
                    strncpy(buf1, msg.line1, 16);
                    buf1[16] = '\0';
                    strncpy(buf2, msg.line2, 16);
                    buf2[16] = '\0';
                    lcd.clear();
                    lcd.setCursor(0, 0);
                    lcd.print(buf1);
                    lcd.setCursor(0, 1);
                    lcd.print(buf2);
                    xSemaphoreGive(mutexLcd);
                }

            // Hold the message for the requested duration, draining further
            // messages that arrive during that window (last writer wins).
            uint32_t showUntil = millis() + msg.durationMs;
            while (millis() < showUntil) {
                DisplayMessage next;
                uint32_t remaining = showUntil - millis();
                if (xQueueReceive(queueDisplay, &next, pdMS_TO_TICKS(remaining)) == pdTRUE) {
                    // New message supersedes the current one
                    msg = next;
                    showUntil = millis() + msg.durationMs;
                    if (xSemaphoreTake(mutexLcd, pdMS_TO_TICKS(200)) == pdTRUE) {
                        char buf1[17];
                        char buf2[17];
                        strncpy(buf1, msg.line1, 16);
                        buf1[16] = '\0';
                        strncpy(buf2, msg.line2, 16);
                        buf2[16] = '\0';
                        lcd.clear();
                        lcd.setCursor(0, 0);
                        lcd.print(buf1);
                        lcd.setCursor(0, 1);
                        lcd.print(buf2);
                        xSemaphoreGive(mutexLcd);
                    }
                }
            }

            // Revert to idle when the queue is empty
            if (uxQueueMessagesWaiting(queueDisplay) == 0) {
                if (xSemaphoreTake(mutexLcd, pdMS_TO_TICKS(200)) == pdTRUE) {
                    lcd.clear();
                    lcd.setCursor(0, 0);
                    lcd.print(IDLE_LINE1);
                    lcd.setCursor(0, 1);
                    lcd.print(IDLE_LINE2);
                    xSemaphoreGive(mutexLcd);
                }
            }
        }
        // No message received within 2 s → already showing idle or a long-lived status
    }
}

// ─────────────────────────────────────────────────────────────
// taskMetrics (Core 1, priority 1)
// Emits periodic telemetry for validation:
// - CPU idle estimate (if runtime stats enabled)
// - heap usage
// - queue load
// - stack high-water mark for each task
// ─────────────────────────────────────────────────────────────
void taskMetrics(void* parameter) {
    Serial.println("[taskMetrics] started");

    for (;;) {
        const int cpuIdlePercent = computeCpuIdlePercent();
        const uint32_t freeHeap = ESP.getFreeHeap();
        const uint32_t minFreeHeap = ESP.getMinFreeHeap();

        const UBaseType_t servoQueueUsed = uxQueueMessagesWaiting(queueServoCommand);
        const UBaseType_t servoQueueFree = uxQueueSpacesAvailable(queueServoCommand);
        const UBaseType_t rfidQueueUsed = uxQueueMessagesWaiting(queueRfidEvent);
        const UBaseType_t rfidQueueFree = uxQueueSpacesAvailable(queueRfidEvent);
        const UBaseType_t wifiQueueUsed = uxQueueMessagesWaiting(queueWifiStatus);
        const UBaseType_t wifiQueueFree = uxQueueSpacesAvailable(queueWifiStatus);
        const UBaseType_t displayQueueUsed = uxQueueMessagesWaiting(queueDisplay);
        const UBaseType_t displayQueueFree = uxQueueSpacesAvailable(queueDisplay);

        const uint32_t socketStackHwmBytes = uxTaskGetStackHighWaterMark(taskSocketIOHandle) * sizeof(StackType_t);
        const uint32_t rfidStackHwmBytes = uxTaskGetStackHighWaterMark(taskRfidPollingHandle) * sizeof(StackType_t);
        const uint32_t servoStackHwmBytes = uxTaskGetStackHighWaterMark(taskServoControlHandle) * sizeof(StackType_t);
        const uint32_t wifiStackHwmBytes = uxTaskGetStackHighWaterMark(taskWifiManagerHandle) * sizeof(StackType_t);
        const uint32_t lcdStackHwmBytes = uxTaskGetStackHighWaterMark(taskLcdDisplayHandle) * sizeof(StackType_t);
        const uint32_t metricsStackHwmBytes = uxTaskGetStackHighWaterMark(taskMetricsHandle) * sizeof(StackType_t);

        const uint32_t configuredStackTotalBytes =
            STACK_SIZE_SOCKET_IO + STACK_SIZE_RFID + STACK_SIZE_SERVO +
            STACK_SIZE_WIFI + STACK_SIZE_LCD + STACK_SIZE_METRICS;

        Serial.print("[metrics] {");
        Serial.print("\"cpuIdlePct\":");
        Serial.print(cpuIdlePercent);
        Serial.print(",\"heap\":{\"free\":");
        Serial.print(freeHeap);
        Serial.print(",\"minFree\":");
        Serial.print(minFreeHeap);
        Serial.print(",\"queueMutexBytes\":");
        Serial.print(queueMutexHeapBytes);
        Serial.print("},\"queues\":{");

        Serial.print("\"servo\":{\"used\":");
        Serial.print(servoQueueUsed);
        Serial.print(",\"free\":");
        Serial.print(servoQueueFree);
        Serial.print("},\"rfid\":{\"used\":");
        Serial.print(rfidQueueUsed);
        Serial.print(",\"free\":");
        Serial.print(rfidQueueFree);
        Serial.print("},\"wifi\":{\"used\":");
        Serial.print(wifiQueueUsed);
        Serial.print(",\"free\":");
        Serial.print(wifiQueueFree);
        Serial.print("},\"display\":{\"used\":");
        Serial.print(displayQueueUsed);
        Serial.print(",\"free\":");
        Serial.print(displayQueueFree);
        Serial.print("}},\"stackHwmBytes\":{");

        Serial.print("\"socketIO\":");
        Serial.print(socketStackHwmBytes);
        Serial.print(",\"rfid\":");
        Serial.print(rfidStackHwmBytes);
        Serial.print(",\"servo\":");
        Serial.print(servoStackHwmBytes);
        Serial.print(",\"wifi\":");
        Serial.print(wifiStackHwmBytes);
        Serial.print(",\"lcd\":");
        Serial.print(lcdStackHwmBytes);
        Serial.print(",\"metrics\":");
        Serial.print(metricsStackHwmBytes);
        Serial.print("},\"stackConfiguredTotalBytes\":");
        Serial.print(configuredStackTotalBytes);
        Serial.println("}");

        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}