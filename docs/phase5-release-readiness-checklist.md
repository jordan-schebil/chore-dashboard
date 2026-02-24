# Phase 5: Release Readiness Checklist

Date: 2026-02-23
Status: Completed

## Goal
Prepare the Express-only project for repeatable local releases and safer maintenance by tightening release workflow, backup/recovery guidance, and deployment documentation.

## Entry Criteria (Met)
- Phase 4 stabilization is complete (tests, error handling, operational logging, cleanup, baseline CI).
- Contract tests pass locally (`npm run test:contract`).
- Unit tests pass locally (`npm test`).
- Playwright e2e passes locally (`npm run test:e2e`) and is intentionally kept out of CI for now.

## Phase 5 Focus Areas

### 1. Release Workflow
- [x] Define a local release checklist (build, unit, contract, e2e, manual smoke) (`README.md`)
- [x] Add a single script/command alias for the standard verification sequence (`package.json` -> `verify:release`)
- [x] Document version bump and tagging convention (`README.md`)

### 2. Data Safety and Recovery
- [x] Document SQLite backup/restore steps for `chores.db` (`README.md`)
- [x] Add a simple backup helper script (`scripts/backup-db.mjs`, `package.json` -> `db:backup`)
- [x] Validate startup behavior against a restored DB file (2026-02-23 isolated restore run on port `8012`)

Validation record (2026-02-23):
- Source backup: `backups/chore-db-20260223-201552`
- Restored to isolated test copy: `backups/restore-validate-20260223-152023/chores.db`
- Started API with `HOST=127.0.0.1`, `PORT=8012`, `DATABASE_PATH=<restored copy>`
- Verified `GET /` returned `status: "running"` and `message: "Chore Dashboard API"`
- Verified `GET /chores` returned `46` chores
- Verified `GET /rooms` returned `2` rooms
- API process shut down after verification; primary `chores.db` was not modified

### 3. Deployment / Runtime Guidance
- [x] Document production-like environment variables and example startup commands (`README.md`)
- [x] Document reverse proxy / host binding assumptions (`README.md`)
- [x] Document log expectations and failure modes (startup, port conflicts, DB open/schema failures) (`README.md`)

### 4. Maintenance Standards
- [x] Define what must pass before merging backend changes (unit + contract at minimum) (`README.md`)
- [x] Define when e2e should be rerun locally (UI changes, route changes, reorder/completion flows) (`README.md`)
- [x] Note supported Node version policy for contributors (Node 24 currently used in CI) (`README.md`)

## Immediate Next Step (Recommended)
Phase 5 is complete. Next step: start Phase 6 planning for deployment automation / packaging (or stop here and cut a release using the Phase 5 checklist).
