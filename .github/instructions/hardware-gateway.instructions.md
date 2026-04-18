---
applyTo: "backend/src/**/*.{ts,tsx}"
description: "Use when implementing mock ESP32 gate control, servo barrier commands, and later migration to real hardware adapters."
---

# Hardware Gateway Instructions

## Goals
- Keep business logic independent from concrete hardware transport.
- Allow mock-first development, then switch to ESP32 without rewriting parking services.

## Adapter Contract
- Implement a hardware gateway interface with operations:
  - `openGate(gateId, command)`
  - `closeGate(gateId, command)`
  - `getGateState(gateId)`
  - `ping()`
- Command DTO should include:
  - `commandId`
  - `sessionId`
  - `correlationId`
  - `requestedBy`
  - `timeoutMs`

## State and Ack Rules
- Map hardware outcomes to normalized states: `opening`, `open`, `closing`, `closed`, `error`, `offline`.
- Every command must return one of: `ack`, `nack`, `timeout`.
- Publish state changes and command outcomes through realtime events.

## Safety Rules
- Default to fail-closed behavior when adapter is offline or command times out.
- Keep manual override path for operator role on exceptional cases.
- Never block event loop waiting on hardware; use async timeout and retry strategy.

## Logging and Traceability
- Log all commands with `commandId`, `sessionId`, `correlationId`, and hardware response.
- Keep logs structured for debugging end-to-end flow backend <-> simulator <-> hardware.

## Migration Rule
- Use a mock adapter in MVP and keep transport-specific code isolated.
- MQTT/HTTP/serial clients should be pluggable adapters behind the same interface.
