# simulator-3d

Standalone 3D simulator app for NT131 Smart Parking.

This app is separated from the main operator/admin frontend. It simulates vehicle movement and sends checkpoint events to backend via Socket.IO.
When configured with a backend simulator API key, it also creates real vehicle, RFID, session, and parking-slot records through REST.

## What this app does

- Renders 3D parking scene with React Three Fiber.
- Simulates vehicle entry and exit states.
- Emits simulator checkpoint events:
  - `simulator.vehicle.checkpoint` with `entry_rfid` and `exit_rfid`.
- Works with backend canonical realtime flow so operator UI can receive `vehicle.state.changed` and gate state updates.

## Requirements

- Node.js 22+
- Backend running (default: `http://localhost:5000`)

## Environment variables

Create `.env` in this folder (optional, defaults are provided):

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
VITE_SIMULATOR_API_KEY=
```

`VITE_SIMULATOR_API_KEY` must match `SIMULATOR_API_KEY` on the backend. This is a service credential for the simulator, not a user login token.

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

Default Vite URL is usually `http://localhost:5173` unless that port is busy.

## Build

```bash
npm run build
```

## Preview build

```bash
npm run preview
```

## Docker

This folder includes a Dockerfile used by root `docker-compose.yml` as service `simulator-3d`.

Run from repository root:

```bash
docker compose up --build simulator-3d
```

## End-to-end quick test

1. Start backend.
2. Start main frontend (`frontend/`) and open operator/admin console.
3. Start this simulator app.
4. In simulator, run entry flow until RFID checkpoint.
5. In operator UI, verify live plate is updated from realtime event.
6. Trigger RFID verify in operator UI and check accepted/rejected decision.

Detailed checklist: `docs/architecture/simulator-operator-e2e-checklist.md`.

## Troubleshooting

- If TypeScript reports missing `vite/client` or `node` types, run `npm install` in this folder again.
- If websocket cannot join simulator room, verify backend is up and `VITE_SIMULATOR_API_KEY` (if required by backend settings) is correct.
