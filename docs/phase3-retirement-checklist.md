# Phase 3: Legacy Backend Retirement Checklist

Date: 2026-02-23
Status: Complete (retirement cleanup pass finished)

## Goal
Retire and remove the legacy backend runtime path so the project runs on Express/Node only.

## Completed
- Express backend is the active runtime (`server/`).
- Startup scripts launch Express only:
  - `START.bat`
  - `LaunchApp.vbs`
  - `STOP.bat` (Node process stop path only)
- Playwright is configured to launch the Express backend only.
- Contract tests default to the Express backend and start Express automatically.
- Active legacy backend entrypoint removed.
- Legacy backend unit tests removed from `tests/`.
- Archived legacy snapshot directory removed (`Archive/V1/`).
- README documents Express-first workflow and Express-based contract testing.

## Validation Completed
- Contract suite passes against the Express backend:
  - `npm run test:contract`
  - Result: `10 passed`
- Playwright e2e smoke test passes on the Express backend:
  - `npm run test:e2e`
  - Result: `1 passed`
- Repository file scan confirms no active legacy backend source files remain.

## Remaining Optional Cleanup
- Remove or rewrite remaining migration-era wording in non-phase docs/comments if you want zero legacy references anywhere in the repo.
- Decide whether to keep migration history docs (`docs/phase1-*`, `docs/phase2-*`) long-term or archive them.

## Phase 3 Exit Criteria
- No active runtime path depends on the retired backend stack.
- Core validation (`test:contract`) passes on Express.
- Developer docs reflect Express-only setup.
- Legacy backend code/tests are removed from the active codebase.
