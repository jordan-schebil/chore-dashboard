# Phase 8: Monitoring, Backup Scheduling, and Platform Expansion Checklist

Date: 2026-02-24
Status: Completed

## Goal
Reduce operational risk after deployment by formalizing monitoring expectations, scheduled backup execution/retention, restore drill cadence, and the next deployment-target decision beyond the current Windows-host baseline.

## Entry Criteria (Met)
- Phase 7 operations/service supervision is complete (NSSM supervision runbook, deploy/rollback/recovery runbooks, logging/diagnostics, hardening baseline, helper scripts).
- Windows-host helper scripts exist for NSSM service actions and operator health checks (`scripts/windows-host-nssm-service.ps1`, `scripts/windows-host-health-check.ps1`).
- Release packaging includes Windows-host operator helper scripts (`npm run package:release`).

## Phase 8 Focus Areas

### 1. Monitoring Baseline (Practical)
- [x] Define a minimum monitoring baseline for the Windows-host deployment path (service status, API health endpoint, core read checks, log review cadence) (`docs/windows-host-monitoring-baseline.md`)
- [x] Decide what is monitored manually vs. scheduled/automated on the host (health-check helper, Task Scheduler, or other local scheduler) (`docs/windows-host-monitoring-baseline.md`)
- [x] Document failure thresholds/escalation triggers (when a warning becomes an incident requiring rollback or restore evaluation) (`docs/windows-host-monitoring-baseline.md`)

### 2. Scheduled Backups and Retention
- [x] Document a Windows Task Scheduler runbook for recurring SQLite backups using the existing backup helper (`npm run db:backup`) (`docs/windows-host-backup-scheduling-retention.md`)
- [x] Define backup destination expectations (local disk vs. network share) and retention/cleanup policy (`docs/windows-host-backup-scheduling-retention.md`)
- [x] Add an optional retention cleanup helper script (age/count-based) to reduce operator error (`scripts/windows-host-backup-retention-cleanup.ps1`, `package.json`, `docs/windows-host-backup-scheduling-retention.md`)

### 3. Restore Drills and Recovery Validation
- [x] Define a restore drill cadence (for example monthly/quarterly) and the minimum verification steps after restore (`docs/windows-host-restore-drill-runbook.md`)
- [x] Document a repeatable restore-drill flow using an isolated DB copy and API smoke checks (`docs/windows-host-restore-drill-runbook.md`)
- [x] Record what evidence/operators should keep after a successful drill (timestamp, backup source, row counts, issues found) (`docs/windows-host-restore-drill-runbook.md`)

### 4. Deployment Platform Expansion Decision
- [x] Decide whether to remain Windows-host-only for the near term or document the next supported target (for example Linux VM) (`docs/deployment-platform-support-boundaries.md`)
- [x] Define minimum parity requirements for any future second supported target (startup, data path, backup flow, release artifact consumption) (`docs/deployment-platform-support-boundaries.md`)
- [x] Explicitly document what remains unsupported to avoid ambiguous ops handoff (`docs/deployment-platform-support-boundaries.md`)

### 5. Optional Ops Automation (Phase 8)
- [x] Add a scheduled backup helper/wrapper for Task Scheduler argument consistency (`scripts/windows-host-scheduled-backup.ps1`, `package.json`, `docs/windows-host-backup-scheduling-retention.md`)
- [x] Add a lightweight retention cleanup helper (age/count-based) if retention is adopted (`scripts/windows-host-backup-retention-cleanup.ps1`, `package.json`, `docs/windows-host-backup-scheduling-retention.md`)
- [x] Add a restore-drill checklist template for operators (`docs/windows-host-restore-drill-checklist-template.md`, `docs/windows-host-restore-drill-runbook.md`)

Validation note (2026-02-24):
- `npm run backup:windows-host:scheduled -- -DryRun -AppDir .\ -DatabasePath .\chores.db -BackupRoot .\backups` passed (warm mode preview)
- `npm run backup:windows-host:scheduled -- -Mode cold -DryRun -AppDir .\ -DatabasePath .\chores.db -BackupRoot .\backups -ServiceName ChoreDashboardApi` passed (cold mode preview)
- `npm run backup:windows-host:retention -- -BackupRoot .\backups -KeepCount 14` passed (preview; no deletions needed in local test state)
- `npm run package:release -- --dry-run` passed and includes the new Phase 8 helper scripts

## Immediate Next Step (Recommended)
Phase 8 is complete. Next step: start Phase 9 planning (lightweight alerting/notification, off-host backup replication, or target-specific deployment expansion when justified).
