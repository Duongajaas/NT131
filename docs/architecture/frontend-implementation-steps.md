# Frontend Implementation Steps (Operator + Simulator Realtime)

This file is an execution checklist for frontend team.

## Step 0 - Done: Create frontend workspace
- Created Vite React TypeScript app at frontend/
- Installed dependencies: socket.io-client, zustand, clsx

## Step 1 - Environment setup
1. Copy frontend/.env.example to frontend/.env
2. Set values:
   - VITE_API_BASE_URL=http://localhost:3000/api/v1
   - VITE_SOCKET_URL=http://localhost:3000
   - VITE_SIMULATOR_API_KEY=optional-if-enabled
3. Start app with npm run dev

## Step 2 - Realtime transport layer
1. Create event contracts and typed payloads
2. Build shared socket client with reconnect and auth token
3. Add subscribe helper for both channels:
   - realtime.event
   - specific event names (session.updated, gate.state.changed)

## Step 3 - Frontend state management
1. Build zustand store for:
   - sessions
   - slots
   - gate state
   - event timeline
2. Add idempotency by eventId
3. Add correlation timeline grouping by correlationId

## Step 4 - Operator dashboard UI
1. Overview cards:
   - active sessions
   - occupied slots
   - blocked sessions
   - gate states
2. Session table:
   - status badge
   - mismatch indicator
   - quick actions
3. Gate panel:
   - entry gate state
   - exit gate state
   - manual open/close command
4. Event feed:
   - latest realtime events with source and timestamp

## Step 5 - API action wiring
1. Entry action:
   - POST /parking/sessions/entry
2. Approve blocked session:
   - POST /parking/sessions/:id/approve
3. Assign slot:
   - POST /parking/sessions/:id/assign-slot
4. Exit action:
   - POST /parking/sessions/:id/exit
5. Status data:
   - GET /parking/status/overview
   - GET /parking/status/gates
   - GET /parking/status/gate-commands

## Step 6 - Reconcile strategy
1. On websocket reconnect:
   - re-join room
   - re-fetch overview and sessions
2. On disconnected state:
   - show warning banner

## Step 7 - Acceptance checklist
- Entry happy path updates UI from realtime events
- Mismatch path blocks gate and requires approve action
- Exit path creates completed session and updates slot released
- Duplicate event does not duplicate store rows
- Manual gate command appears in gate command log

## Step 8 - Completed in current iteration
1. Built operator dashboard in frontend/
2. Added simulator panel for entry/exit state machine
3. Wired frontend REST actions to backend parking APIs
4. Wired realtime feed for operator session events

## Step 9 - Next refinement
1. Replace simulator panel placeholder flow with full 3D canvas when the WebGL scene is ready
2. Add persistent auth/session storage so token does not need to be pasted every reload
3. If needed, split Operator and Simulator into URL routes with browser history support

## Step 10 - Completed in current iteration
1. Split Operator and Simulator into separate UI screens inside the frontend app
2. Kept shared token and session context across both screens
3. Preserved the same realtime contract and backend API usage on both screens

## Step 11 - Completed in current iteration
1. Added browser routes for /operator and /simulator
2. Added active nav tabs with history support
3. Persisted access token in localStorage for reload survival

## Step 12 - Completed in current iteration
1. Added WebGL/3D parking scene to simulator using React Three Fiber
2. Animated car, gates, slots, and checkpoint lane from simulator state
3. Lazy-loaded the 3D scene as a separate chunk for better main bundle isolation

## Step 13 - Follow-up optimization
1. Reduce 3D chunk weight further if needed by trimming optional Drei helpers
2. Consider streaming or caching strategies if the scene becomes heavier
3. Add more visual states for slot occupancy and manual override in the 3D scene

## Step 14 - Completed in current iteration
1. Extracted simulator into a standalone app at simulator-3d/
2. Kept frontend/ as role-based operator/admin console only
3. Added socket checkpoint flow from simulator to backend canonical event vehicle.state.changed
4. Added operator RFID verify flow against database plate matching

## Step 15 - Local run quickstart
1. Backend: cd backend && npm install && npm run dev
2. Operator/Admin app: cd frontend && npm install && npm run dev
3. Simulator app: cd simulator-3d && npm install && npm run dev
4. Open operator/admin UI and simulator UI in separate browser tabs for end-to-end flow
