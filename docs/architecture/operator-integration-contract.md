# Operator Integration Contract (REST + Realtime)

Document purpose: define exact request/response and event payloads for Operator FE and 3D simulator integration with backend parking MVP.

## Scope
- Backend base path: /api/v1
- Auth: Authorization: Bearer <access_token>
- Roles:
  - admin_or_operator: most parking endpoints
  - admin_only: create parking slot
- Response envelope:
  - success: { "message": string, "data": any }
  - validation error: { "message": "Validation failed", "errors": [{ "field": string, "message": string }] }
  - operational error: { "message": string, "details"?: any }

## Status And Enums
- session status:
  - waiting_scan
  - approved_entry
  - active
  - parked
  - exit_pending
  - completed
  - blocked
- slot type:
  - regular
  - motorbike
  - handicap
- payment status:
  - pending
  - paid
  - failed
  - waived
- gate state:
  - opening
  - open
  - closing
  - closed
  - error
  - offline

## REST APIs For Operator

### 1) Parking entry by RFID scan
- Method: POST
- Path: /api/v1/parking/sessions/entry
- Role: admin_or_operator
- Body:
```json
{
  "uid": "A1B2C3D4",
  "plate_number": "59A12345",
  "plate_confidence": 96.2,
  "entry_image_url": "https://example.local/entry/59A12345.jpg",
  "correlation_id": "corr-0001"
}
```
- Success 201 data:
```json
{
  "message": "Parking entry processed successfully",
  "data": {
    "session": {
      "_id": "SESSION_ID",
      "vehicle_id": "VEHICLE_ID",
      "rfid_card_id": "RFID_CARD_ID",
      "status": "approved_entry",
      "entry_plate_text": "59A12345",
      "entry_plate_confidence": 96.2,
      "is_plate_mismatch": false,
      "entry_time": "2026-04-04T09:30:00.000Z"
    },
    "gate_action": "open"
  }
}
```
- Mismatch result 201 data:
```json
{
  "message": "Parking entry processed successfully",
  "data": {
    "session": {
      "_id": "SESSION_ID",
      "status": "blocked",
      "is_plate_mismatch": true
    },
    "gate_action": "deny",
    "reason": "plate_mismatch"
  }
}
```

### 2) List parking sessions
- Method: GET
- Path: /api/v1/parking/sessions
- Role: admin_or_operator
- Query:
  - status
  - rfid_card_id
  - vehicle_id
- Example:
  - /api/v1/parking/sessions?status=blocked

### 3) Manual approve blocked session
- Method: POST
- Path: /api/v1/parking/sessions/:id/approve
- Role: admin_or_operator
- Body:
```json
{
  "correlation_id": "corr-0002"
}
```
- Success 200: session status moves to approved_entry and entry gate command is issued.

### 4) Assign parking slot
- Method: POST
- Path: /api/v1/parking/sessions/:id/assign-slot
- Role: admin_or_operator
- Body:
```json
{
  "slot_id": "OPTIONAL_SLOT_OBJECT_ID",
  "correlation_id": "corr-0003"
}
```
- Success 200 data:
```json
{
  "message": "Parking slot assigned successfully",
  "data": {
    "session": {
      "_id": "SESSION_ID",
      "status": "parked"
    },
    "slot": {
      "_id": "SLOT_ID",
      "slot_code": "A-01",
      "is_occupied": true,
      "current_session_id": "SESSION_ID"
    }
  }
}
```

### 5) Process parking exit
- Method: POST
- Path: /api/v1/parking/sessions/:id/exit
- Role: admin_or_operator
- Body:
```json
{
  "exit_plate_number": "59A12345",
  "exit_plate_confidence": 97.1,
  "exit_image_url": "https://example.local/exit/59A12345.jpg",
  "payment_status": "paid",
  "correlation_id": "corr-0004"
}
```
- Success 200 data:
```json
{
  "message": "Parking exit processed successfully",
  "data": {
    "session": {
      "_id": "SESSION_ID",
      "status": "completed",
      "duration_minutes": 135,
      "is_plate_mismatch": false
    },
    "transaction": {
      "_id": "TRANSACTION_ID",
      "final_amount": 20000,
      "payment_status": "paid"
    },
    "gate_action": "open"
  }
}
```
- Mismatch result: gate_action is deny and session may remain blocked for manual resolution.

### 6) Parking slot management
- Create slot (admin only):
  - POST /api/v1/parking/slots
- List slots:
  - GET /api/v1/parking/slots
  - Query: level, slot_type, is_occupied
- Get slot detail:
  - GET /api/v1/parking/slots/:id
- Release slot manually:
  - PATCH /api/v1/parking/slots/:id/release

### 7) Operator status endpoints
- Overview:
  - GET /api/v1/parking/status/overview
- Filtered slots:
  - GET /api/v1/parking/status/slots
- Gate state:
  - GET /api/v1/parking/status/gates
- Gate command logs:
  - GET /api/v1/parking/status/gate-commands?limit=50

## Realtime Event Contract For FE And Simulator
- FE should subscribe to canonical events from docs/architecture/realtime-event-contract.md.
- Envelope used across all events:
```json
{
  "eventId": "uuid",
  "eventName": "domain.entity.action",
  "occurredAt": "2026-04-04T10:00:00.000Z",
  "source": "backend",
  "correlationId": "corr-0001",
  "sessionId": "SESSION_ID",
  "payload": {}
}
```

## Socket.IO Integration
- Endpoint: ws://<host>:<port>/socket.io
- Server path: /socket.io
- Client auth token:
  - Preferred: `auth.token` in socket handshake
  - Supported fallback: `Authorization: Bearer <access_token>` header

### Room Join Events
- Operator room
  - Client emit: `operator.join`
  - Requirement: authenticated user with role `admin` or `operator`
  - Ack success:
```json
{
  "success": true,
  "room": "operator"
}
```
- Simulator room
  - Client emit: `simulator.join`
  - Payload:
```json
{
  "apiKey": "SIMULATOR_API_KEY_OPTIONAL"
}
```
  - If env `SIMULATOR_API_KEY` is configured, it must match.

### Outbound Event Channels
- Unified channel: `realtime.event`
- Named channels: backend also emits each `eventName` directly, for example `session.updated`, `gate.state.changed`.

### Operator Manual Gate Command (Socket)
- Client emit: `operator.gate.command.request`
- Payload:
```json
{
  "gateId": "entry-gate",
  "command": "open",
  "sessionId": "SESSION_ID",
  "correlationId": "corr-operator-001"
}
```
- Ack success:
```json
{
  "success": true,
  "correlationId": "corr-operator-001"
}
```
- Backend will publish realtime event `gate.command.sent` with source `operator`.

### Event payload examples
- rfid.scan.accepted
```json
{
  "uid": "A1B2C3D4",
  "plateNumber": "59A12345",
  "decision": "accepted"
}
```
- rfid.scan.rejected
```json
{
  "uid": "A1B2C3D4",
  "plateNumber": "59A12399",
  "reason": "plate_mismatch"
}
```
- alert.plate_mismatch
```json
{
  "expectedPlateNumber": "59A12345",
  "actualPlateNumber": "59A12399"
}
```
- gate.command.sent
```json
{
  "gateId": "entry-gate",
  "command": "open",
  "result": "ack",
  "commandId": "cmd-uuid",
  "reason": "manual_override"
}
```
- gate.state.changed
```json
{
  "gateId": "entry-gate",
  "state": "open"
}
```
- session.created
```json
{
  "status": "approved_entry",
  "vehicleId": "VEHICLE_ID",
  "rfidCardId": "RFID_CARD_ID"
}
```
- session.updated
```json
{
  "status": "parked",
  "approvedByOperator": true
}
```
- session.completed
```json
{
  "status": "completed",
  "amount": 20000,
  "paymentStatus": "paid",
  "exitPlateNumber": "59A12345"
}
```
- slot.assigned
```json
{
  "slotId": "SLOT_ID",
  "slotCode": "A-01",
  "action": "assigned"
}
```
- slot.released
```json
{
  "slotId": "SLOT_ID",
  "slotCode": "A-01",
  "action": "released"
}
```

## Sequence Alignment

### Flow A: Entry happy path
1. Simulator or operator posts entry to /parking/sessions/entry.
2. Backend validates RFID card active and plate_number required.
3. Backend creates session approved_entry.
4. Backend sends gate open command to hardware gateway.
5. Backend emits rfid.scan.accepted, gate.command.sent, gate.state.changed, session.created.
6. Operator FE shows gate open and session row.
7. Operator or simulator posts /parking/sessions/:id/assign-slot.
8. Backend marks slot occupied and session parked.
9. Backend emits slot.assigned and session.updated.

### Flow B: Entry mismatch and manual override
1. Entry request received with plate not matching vehicle of RFID.
2. Backend creates session blocked.
3. Backend emits rfid.scan.rejected and alert.plate_mismatch.
4. FE highlights alert and blocks auto-open.
5. Operator reviews camera evidence.
6. Operator posts /parking/sessions/:id/approve.
7. Backend updates session approved_entry and sends gate open command.
8. Backend emits session.updated, gate.command.sent, gate.state.changed.

### Flow C: Exit and payment
1. Operator or simulator posts /parking/sessions/:id/exit.
2. Backend computes duration and fee from pricing policy for guest card.
3. Backend creates transaction if missing.
4. Backend releases occupied slot if any.
5. If plate matches: emit session.completed, slot.released, gate.command.sent, gate.state.changed.
6. If plate mismatches: emit alert.plate_mismatch and gate_action deny.

## FE Implementation Rules
- Treat eventId as idempotency key in FE state store.
- Use correlationId to group timeline events into a single UI action card.
- Do not trust optimistic local transitions before receiving backend event confirmation.
- For blocked sessions, require explicit operator action before opening gate.
- If realtime disconnects, re-fetch overview and sessions to reconcile state.
