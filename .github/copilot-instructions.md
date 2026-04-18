# Project Guidelines

## Code Style
- Use TypeScript with strict typing and ESM imports with `.ts` extension in backend source files.
- Keep controller handlers thin: parse request input, call service, return JSON.
- Put business rules in services and data access in repositories.
- Use `AppError` for operational errors and wrap async routes with async-handler middleware.
- Follow existing naming convention: database fields use snake_case, TypeScript variables/functions use camelCase.

## Architecture
- Backend follows route -> controller -> service -> repository -> model layering.
- Authentication and authorization are middleware-based (JWT from `Authorization: Bearer ...`).
- Validation is handled in validator middleware with Joi before controller logic.
- Realtime parking integrations must use a dedicated event bus layer rather than embedding socket emits in repositories.

## Build and Test
- Backend install: `cd backend && npm install`
- Backend dev: `cd backend && npm run dev`
- Backend build: `cd backend && npm run build`
- Backend start (compiled): `cd backend && npm start`
- There is no official automated test script yet. Add tests with new features when practical.

## Conventions
- Keep response envelope consistent: `message` and `data` (or validation `errors`).
- Add new endpoints by extending `backend/src/routes/index.ts` and keeping middleware order consistent.
- For parking domain changes, align entity fields with [docs/database/note.md](../docs/database/note.md).
- For realtime integration and hardware abstraction, follow:
  - [docs/architecture/realtime-event-contract.md](../docs/architecture/realtime-event-contract.md)
  - [docs/architecture/operator-integration-contract.md](../docs/architecture/operator-integration-contract.md)
  - [.github/instructions/backend-socketio.instructions.md](instructions/backend-socketio.instructions.md)
  - [.github/instructions/hardware-gateway.instructions.md](instructions/hardware-gateway.instructions.md)
- Prefer incremental changes with backward compatibility for operator-facing APIs.
