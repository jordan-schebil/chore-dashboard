# Phase 2: Express Scaffold (Migration Record)

Note (Phase 3): This document captures the migration/cutover process. Transitional dual-backend steps documented during the migration have been retired from the active workflow.

## What This Adds
- `server/` Express backend scaffold with:
  - app/bootstrap (`server/index.js`, `server/src/app.js`)
  - env/config parsing (`server/src/config.js`)
  - SQLite connection (`server/src/db/connection.js`)
  - schema/index bootstrap parity points (`server/src/db/schema.js`)
  - route stubs for every API endpoint (`server/src/routes/*`)
  - scheduling service placeholder (`server/src/services/schedule.js`)

## Current Status
- `GET /` returns parity health payload (`message`, `status`).
- Shared utilities are ported for:
  - row mapping / room mappings
  - date validation/parsing
  - schedule matching + leaf filtering
  - audit logging helper
  - order normalization helper
- Read endpoints are implemented in Express:
  - `GET /rooms`
  - `GET /chores`
  - `GET /chores/:choreId`
  - `GET /chores/:choreId/subtasks`
  - `GET /chores-with-subtasks`
  - `GET /chores/for-date/:dateStr`
  - `GET /chores/for-range/:start/:end`
  - `GET /daily-order/:dateStr`
  - `GET /completions/:dateStr`
  - `GET /completions?start=&end=`
- Write/mutation endpoints are implemented in Express:
  - `POST/PUT/DELETE /rooms`
  - `POST/PUT/DELETE /chores`
  - `PUT /chores/global-order`
  - `PUT /daily-order/:dateStr`
  - `POST /completions/toggle`
  - `POST /reset`
- Core table/index creation is scaffolded to match the baseline schema setup.
- Legacy `chores` schema migration (`migrate_to_schedule_schema`) is ported.
- Default seed data (`seed_default_chores`) is ported.
- Startup now seeds defaults when `chores` is empty (matching prior startup behavior).

## NPM Scripts Added
- `npm run dev:api:node` -> starts Express scaffold with `node --watch`
- `npm run start:api:node` -> starts Express scaffold once

## Dependencies Added In Phase 2
- `express`
- `cors`
- `dotenv`
- `better-sqlite3`

Note: Dependencies were installed later in Phase 2 and `package-lock.json` was updated during the cutover.

## Parallel Validation During Migration (Historical)
- This was a temporary Phase 2 validation workflow.
- Current Phase 3 status: the active runtime is Express-only.

## Startup Script Backend Selection (Historical)
- Phase 2 temporarily supported dual-backend startup selection during cutover.
- Current Phase 3 status: `START.bat` and `LaunchApp.vbs` start Express only.

## Playwright Backend Selection (Historical)
- Phase 2 temporarily supported backend selection in Playwright during migration validation.
- Current Phase 3 status: Playwright launches the Express backend.

## Next Recommended Phase 2 Steps (Completed Later)
1. Install Node API dependencies (`npm install`) and run an Express runtime smoke test.
2. Run Phase 1 contract tests against Express using `CONTRACT_API_BASE`.
3. Document and/or split contract expectations for known intentional divergence (`PUT /chores/global-order` collision fixed in Express).

## Route Collision Decision (Tracked)
- The baseline route ordering had a collision causing `PUT /chores/global-order` to return `422`.
- Express registers `/chores/global-order` before `/chores/:choreId` and implements the reorder handler, so the collision is intentionally **fixed** in Node.
- If strict parity snapshots are required, maintain a separate baseline for this intentionally fixed endpoint.
