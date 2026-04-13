# Realtime Event Contract (Parking MVP)

This document defines the canonical event contract for backend, simulator, operator frontend, and hardware gateway.

See operator-facing REST + realtime alignment in `docs/architecture/operator-integration-contract.md`.

## Envelope
All events must follow this envelope:

```json
{
  "eventId": "uuid",
  "eventName": "domain.entity.action",
  "occurredAt": "2026-04-04T10:00:00.000Z",
  "source": "backend",
  "correlationId": "uuid",
  "sessionId": "optional-session-id",
  "payload": {}
}
```

## Core Events
- `rfid.scan.requested`
- `rfid.scan.accepted`
- `rfid.scan.rejected`
- `gate.command.sent`
- `gate.state.changed`
- `vehicle.state.changed`
- `session.created`
- `session.updated`
- `session.completed`
- `slot.assigned`
- `slot.released`
- `alert.plate_mismatch`

## Key Payload Fields

### RFID
- `uid`
- `plateNumber`
- `plateConfidence`
- `decision` (`accepted` | `rejected`)
- `reason`

### Gate
- `gateId`
- `command` (`open` | `close`)
- `result` (`ack` | `nack` | `timeout`)
- `state` (`opening` | `open` | `closing` | `closed` | `error` | `offline`)

### Session
- `status` (`active` | `waiting_scan` | `approved_entry` | `parked` | `exit_pending` | `completed` | `blocked`)
- `vehicleId`
- `rfidCardId`

### Slot
- `slotId`
- `slotCode`
- `action` (`assigned` | `released`)

## Reliability
- Commands are idempotent by `eventId`.
- Persist state before emitting success transition events.
- Emit explicit rejection/failure events for all denied actions.

## Security
- Operator command channels must be authenticated and authorized.
- Hardware gateway channels must use service credentials or signed tokens.

## Versioning
- Backward-compatible changes only in MVP.
- If payload shape changes in a breaking way, introduce versioned event names.
