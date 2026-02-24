# Phase 7: Operations and Service Supervision Checklist

Date: 2026-02-24
Status: Completed

## Goal
Make the Windows-host deployment path operationally sustainable by documenting and automating service supervision, restart/recovery procedures, and operator runbooks around the Express API and separately hosted frontend assets.

## Entry Criteria (Met)
- Phase 6 deployment automation and packaging is complete (artifact folder + zip packaging, Windows-host deploy helper, env/config templates, optional CI release artifact workflow).
- Windows-host deployment target shape is documented (`docs/windows-host-deployment.md`).
- Local deployment helper exists (`npm run deploy:windows-host`).

## Phase 7 Focus Areas

### 1. Windows Service Supervision
- [x] Choose a Windows service supervision approach for the Express API (NSSM) and document the decision (`docs/windows-host-api-service-nssm.md`)
- [x] Document install/start/stop/restart/update steps for the chosen approach (`docs/windows-host-api-service-nssm.md`)
- [x] Define runtime env handoff for supervised process startup (`HOST`, `PORT`, `DATABASE_PATH`, `ALLOWED_ORIGINS`) (`docs/windows-host-api-service-nssm.md`)

### 2. Operational Runbooks
- [x] Document operator runbooks for start / stop / restart (`docs/windows-host-operations-runbooks.md`, `docs/windows-host-api-service-nssm.md`)
- [x] Document deploy update runbook (artifact swap + dependency install + API restart) (`docs/windows-host-operations-runbooks.md`)
- [x] Document rollback to previous `app.previous.<timestamp>` (`docs/windows-host-operations-runbooks.md`)
- [x] Document DB backup before deploy / restore after failure with DB restore decision points (`docs/windows-host-operations-runbooks.md`)
- [x] Add a short post-change smoke checklist tied to runbooks (API health + core UI/API checks) (`docs/windows-host-operations-runbooks.md`)

### 3. Logging and Diagnostics
- [x] Document stdout/stderr capture expectations for the supervised API process (`docs/windows-host-logging-diagnostics.md`)
- [x] Decide and document request logging usage in production-like runs (`LOG_REQUESTS`, `LOG_REQUEST_BODIES`) (`docs/windows-host-logging-diagnostics.md`)
- [x] Add guidance for collecting logs and key failure symptoms (port bind issues, DB open/schema failures, CORS misconfiguration) (`docs/windows-host-logging-diagnostics.md`)

### 4. Host Hardening and Safety (Baseline)
- [x] Document minimum Windows host safeguards (bind/firewall/non-admin account/no-auth exposure warning) (`docs/windows-host-hardening-safety.md`)
- [x] Document where secrets/config should live for the chosen supervision approach (`docs/windows-host-hardening-safety.md`)

### 5. Optional Ops Automation
- [x] Add helper scripts for service install/uninstall/restart/status once a supervision tool is selected (`scripts/windows-host-nssm-service.ps1`, `package.json`, `docs/windows-host-api-service-nssm.md`)
- [x] Add a small health-check script for operators (PowerShell) and document usage (`scripts/windows-host-health-check.ps1`, `docs/windows-host-operations-runbooks.md`, `package.json`)

Validation note (2026-02-24):
- `npm run service:windows-host:status -- -DryRun` passed
- `npm run service:windows-host:install -- -DryRun -DeployRoot C:\ChoreDashboard -AllowedOrigins https://chores.example.com` passed
- `npm run package:release -- --dry-run` confirms both Windows host helper scripts are included in the artifact list

## Immediate Next Step (Recommended)
Phase 7 is complete. Next step: start Phase 8 planning (monitoring, backup scheduling, or deployment platform expansion).
