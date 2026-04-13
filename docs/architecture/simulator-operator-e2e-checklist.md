# Simulator -> Operator E2E Checklist

This checklist validates the realtime pipeline:
Simulator checkpoint -> backend canonical event -> operator UI plate display -> RFID verify API decision.

## 1) Preconditions
- Backend is running and reachable at http://localhost:3000
- frontend app is running
- simulator-3d app is running
- At least one active RFID card in DB linked to a vehicle with known plate_number
- Operator has valid JWT token (admin token can be used for full actions)

## 2) Environment setup
- frontend .env and simulator-3d .env should point to the same backend:
  - VITE_API_BASE_URL=http://localhost:3000/api/v1
  - VITE_SOCKET_URL=http://localhost:3000

## 3) Test case: checkpoint event reaches operator
1. Open simulator-3d and start entry simulation
2. Wait for vehicle to arrive at entry RFID checkpoint
3. Open operator UI and verify live plate card updates
4. Verify event feed contains eventName vehicle.state.changed

Expected:
- Operator sees latest detected plate at RFID
- Event source is simulator (via backend canonical envelope)

## 4) Test case: RFID plate match accepted
1. In operator UI, set UID mapped to same plate currently detected
2. Click Verify RFID

Expected:
- API response decision is accepted
- observed_plate_number equals expected_plate_number
- Realtime feed includes rfid.scan.accepted

## 5) Test case: RFID plate mismatch rejected
1. Keep observed plate from simulator
2. Enter UID that maps to a different vehicle plate
3. Click Verify RFID

Expected:
- API response decision is rejected
- reason indicates plate mismatch
- Realtime feed includes rfid.scan.rejected and alert.plate_mismatch

## 6) Test case: unknown or inactive RFID
1. Enter non-existent UID or inactive RFID UID
2. Click Verify RFID

Expected:
- API response decision is rejected
- reason indicates card not found or inactive card

## 7) Optional admin flow validation
1. With admin role view, process entry and assign slot
2. Trigger exit flow and verify session updates

Expected:
- Session status transitions are reflected in session table
- Gate and transaction outcomes are consistent with API response

## 8) Regression checks
- Duplicate events do not duplicate event rows by eventId
- Reconnect does not break room join (operator.join and simulator.join)
- No frontend crash when payload fields are missing or optional
