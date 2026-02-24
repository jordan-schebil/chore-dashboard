# Phase 4: Express Stabilization Checklist

Date: 2026-02-23
Status: Completed

## Goal
Harden the Express-only codebase after migration and retirement of the legacy backend so the project is easier to maintain, test, and release.

## Entry Criteria (Met)
- Express backend is the only active runtime path.
- Contract tests pass (`npm run test:contract`).
- Playwright e2e smoke test passes (`npm run test:e2e`).
- Startup scripts and local launcher use Express only.

## Phase 4 Focus Areas

### 1. Test Coverage Expansion
- Add backend integration tests for write-heavy flows not fully covered by current contract fixtures:
  - [x] parent/subtask inheritance and cascade updates (`tests/contract/api-write-invariants.test.js`)
  - [x] reset endpoint side effects (`tests/contract/api-reset-audit.test.js`)
  - [x] audit log write semantics (`tests/contract/api-reset-audit.test.js`)
- Expand Playwright coverage beyond smoke test:
  - [x] create/edit/delete chore flow (`tests/e2e/chore-dashboard.spec.js`)
  - [x] reorder flow (`tests/e2e/chore-dashboard.spec.js`)
  - [x] completion toggle persistence (`tests/e2e/chore-dashboard.spec.js`)
  - [x] room management flow (`tests/e2e/chore-dashboard.spec.js`)

### 2. Error Handling and API Consistency
- [x] Review Express error responses for consistent JSON shapes across routes/middleware and add a stable `error` envelope (`server/src/middleware/errors.js`)
- [x] Normalize route-level validation semantics with stable `error.code` values while preserving existing `detail` payloads (shared validators + common route errors)
- [x] Add regression tests for error envelope edge cases (`tests/contract/api-error-envelope.test.js`):
  - unknown route 404
  - string-detail validation errors
  - object-detail validation errors
  - malformed JSON body errors
  - disallowed CORS origin errors

### 3. Operational Hardening
- [x] Add a production-oriented startup path (environment docs, logging expectations) (`README.md`, `server/index.js`)
- [x] Validate DB error handling paths and startup failure messaging (startup/listen failure logs + non-zero exit) (`server/index.js`)
- [x] Add request logging middleware (lightweight, opt-in by env) (`server/src/middleware/request-logger.js`, `server/src/app.js`, `server/src/config.js`)

### 4. Codebase Cleanup
- Reduce migration-era comments and historical wording in runtime files where no longer useful.
- [x] Consolidate repeated route logic into shared helpers where it improves readability (transaction wrapper + `not found`/constraint checks in `server/src/routes/route-helpers.js`)
- [x] Extract repeated parent-inheritance prep in chore write routes (`server/src/routes/chores.js`)
- [x] Review `server/src` modules for naming clarity and dead code (removed unused helpers and renamed `server/src/routes/_helpers.js` -> `server/src/routes/route-helpers.js`)

### 5. CI / Automation (Optional but Recommended)
- [x] Add lightweight CI workflow for `npm run test:contract` (`.github/workflows/contract-tests.yml`)
- [x] Add lightweight CI workflow for `npm test` (unit) (`.github/workflows/unit-tests.yml`)
- [x] Defer Playwright CI for now (local e2e remains the release gate until runtime/cost justifies browser CI)
- Add CI steps for:
  - `npm run test:e2e` (or a smoke subset)
- Cache Playwright browsers in CI to keep runtime reasonable.

## Immediate Next Step (Recommended)
Move to Phase 5: define release-readiness and operations tasks (versioning, backup/recovery runbooks, and deployment guidance).
