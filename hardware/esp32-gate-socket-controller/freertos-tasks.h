#ifndef FREERTOS_TASKS_H
#define FREERTOS_TASKS_H

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

// ===== Task Handles =====
extern TaskHandle_t taskSocketIOHandle;
extern TaskHandle_t taskRfidPollingHandle;
extern TaskHandle_t taskServoControlHandle;
extern TaskHandle_t taskWifiManagerHandle;
extern TaskHandle_t taskLcdDisplayHandle;
extern TaskHandle_t taskMetricsHandle;

// ===== Queue Structures =====

// Servo command from realtime events or manual triggers
typedef struct {
  char gateId[32];        // "entry-gate", "exit-gate"
  char command[16];       // "open", "close"
  uint32_t seq;           // test/request sequence id for ACK correlation
  uint32_t commandId;
  char source[16];        // "operator", "backend", "hardware"
  uint32_t autoCloseMs;   // 0 = disabled, >0 = milliseconds to auto-close after open
} ServoCommand;

// RFID scan result to be sent to backend
typedef struct {
  char uid[32];           // normalized UID hex string
  char checkpoint[32];    // "entry_rfid", "exit_rfid"
  char correlationId[64];
  uint32_t scannedAt;
} RfidScanEvent;

// WiFi status notification
typedef struct {
  bool isConnected;
  char ipAddress[16];
} WifiStatusEvent;

// Display message for LCD
typedef struct {
  char line1[33];  // 32 chars + null (trim to 16 for display when required)
  char line2[33];
  uint32_t durationMs;
} DisplayMessage;

// ===== Queue Handles =====
extern QueueHandle_t queueServoCommand;   // Commands to servo task
extern QueueHandle_t queueRfidEvent;      // RFID events from polling task
extern QueueHandle_t queueWifiStatus;     // WiFi status updates
extern QueueHandle_t queueDisplay;        // LCD display messages

// ===== Semaphores (Mutex) =====
extern SemaphoreHandle_t mutexSocketIO;   // Protect Socket.IO singleton
extern SemaphoreHandle_t mutexServoState; // Protect servo angle state
extern SemaphoreHandle_t mutexLcd;        // Protect LCD I2C access

// Heap consumed when queues + mutexes are created
extern uint32_t queueMutexHeapBytes;

// ===== Task Priority Levels =====
#define TASK_PRIORITY_SOCKET_IO    3  // High - must handle commands
#define TASK_PRIORITY_RFID         3  // High - fast polling
#define TASK_PRIORITY_SERVO        2  // Medium - blocking operations
#define TASK_PRIORITY_WIFI         2  // Medium - background reconnect
#define TASK_PRIORITY_LCD          1  // Low - UI only
#define TASK_PRIORITY_METRICS      1  // Low - diagnostics only

// ===== Task Stack Sizes =====
#define STACK_SIZE_SOCKET_IO   (8 * 1024)   // 8 KB
#define STACK_SIZE_RFID        (4 * 1024)   // 4 KB
#define STACK_SIZE_SERVO       (4 * 1024)   // 4 KB
#define STACK_SIZE_WIFI        (4 * 1024)   // 4 KB
#define STACK_SIZE_LCD         (2 * 1024)   // 2 KB
#define STACK_SIZE_METRICS     (3 * 1024)   // 3 KB

// ===== Task Entry Points (to be called in setup()) =====
void initializeFreertos();
void createAllTasks();

// ===== Task Functions =====
void taskSocketIO(void* parameter);
void taskRfidPolling(void* parameter);
void taskServoControl(void* parameter);
void taskWifiManager(void* parameter);
void taskLcdDisplay(void* parameter);
void taskMetrics(void* parameter);

#endif // FREERTOS_TASKS_H
