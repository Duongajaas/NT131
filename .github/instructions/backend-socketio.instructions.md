---
applyTo: "backend/src/**/*.{ts,tsx}"
description: "Use when implementing realtime parking events with Socket.IO between backend, simulator, and operator FE. Enforce stable event names, payload contracts, and idempotent processing."
---

# Backend Socket.IO Instructions

## Goals
- Keep realtime events deterministic and traceable across backend, simulator, and operator dashboard.
- Prevent contract drift by using one shared event naming scheme.

## Event Naming
- Use `domain.entity.action` format, for example:
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

## Payload Rules
- Every event payload must include:
  - `eventId` (UUID)
  - `occurredAt` (ISO timestamp)
  - `sessionId` when session-scoped
  - `correlationId` for end-to-end tracing
  - `source` (`backend`, `simulator`, `operator`, `hardware-gateway`)
- Keep payloads minimal and explicit; avoid dumping whole Mongoose documents.
- Include both `status` and `reason` for rejection/blocked paths.

## Reliability Rules
- Treat incoming commands as idempotent by `eventId`.
- Persist important state transitions before broadcasting success events.
- Emit failure events for rejected actions instead of silent drops.
- Use acknowledgement callbacks for command-style events where response is required.

## Backend Structure
- Keep Socket.IO wiring in dedicated modules/services, not repositories.
- Services decide business outcomes; socket layer only publishes/subscribes and maps DTOs.
- Reuse existing auth model for operator channels and protect privileged event handlers.

## Source of Truth
- Realtime contract details are maintained in [docs/architecture/realtime-event-contract.md](../../docs/architecture/realtime-event-contract.md).
