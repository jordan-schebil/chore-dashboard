# Phase 9: Alerting, Off-Host Backup Replication, and Expansion Readiness Checklist

Date: 2026-02-24
Status: Completed

## Goal
Improve operational resilience beyond the local Windows-host baseline by defining lightweight alerting/notification, off-host backup replication practices, and a gated decision path for any future deployment-target expansion.

## Entry Criteria (Met)
- Phase 8 monitoring, backup scheduling/retention, restore drills, and platform support boundary decisions are complete.
- Windows-host-only support policy is documented (`docs/deployment-platform-support-boundaries.md`).
- Windows-host helper scripts exist for health checks, service actions, scheduled backups, and retention cleanup.

## Phase 9 Focus Areas

### 1. Lightweight Alerting and Notification (Windows Host)
- [x] Define a minimum alerting policy for backup failures and health-check failures (what must notify, what can remain log-only) (`docs/windows-host-alerting-notification-baseline.md`)
- [x] Document one or two lightweight notification paths appropriate for a Windows-host deployment (for example Task Scheduler failure results, email relay script, webhook call script) (`docs/windows-host-alerting-notification-baseline.md`)
- [x] Define alert noise controls (retry window, repeat suppression guidance, escalation timing) (`docs/windows-host-alerting-notification-baseline.md`)

### 2. Off-Host Backup Replication (Policy + Runbook)
- [x] Document an off-host replication policy for backup folders (network share or equivalent) and when replication must occur (`docs/windows-host-offhost-backup-replication-runbook.md`)
- [x] Define source-of-truth expectations between local backups and replicated copies (`docs/windows-host-offhost-backup-replication-runbook.md`)
- [x] Document operator runbook steps for manual replication and verification before adding automation (`docs/windows-host-offhost-backup-replication-runbook.md`)

### 3. Replication Validation and Recovery Confidence
- [x] Define how operators validate replicated backups (folder presence, manifest checks, spot-restore confidence checks) (`docs/windows-host-offhost-replication-validation-confidence.md`)
- [x] Add a periodic replicated-backup verification/checklist process tied to restore drill cadence (`docs/windows-host-offhost-replication-validation-confidence.md`)
- [x] Clarify incident decision points when local backups exist but off-host replication is stale or missing (`docs/windows-host-offhost-replication-validation-confidence.md`)

### 4. Optional Ops Automation (Phase 9)
- [x] Add a lightweight notification helper script (webhook) for optional push delivery experiments (`scripts/windows-host-notify-webhook.ps1`, `package.json`, `docs/windows-host-alerting-notification-baseline.md`)
- [x] Add a replication helper wrapper script (copy + manifest verification) (`scripts/windows-host-offhost-backup-replicate.ps1`, `package.json`, `docs/windows-host-offhost-backup-replication-runbook.md`)
- [x] Add a replication retention/cleanup helper for off-host destinations (`scripts/windows-host-offhost-backup-retention-cleanup.ps1`, `package.json`, `docs/windows-host-offhost-backup-replication-runbook.md`)

Validation note (2026-02-24):
- PowerShell parser checks passed for:
  - `scripts/windows-host-notify-webhook.ps1`
  - `scripts/windows-host-offhost-backup-replicate.ps1`
  - `scripts/windows-host-offhost-backup-retention-cleanup.ps1`
- `npm run notify:windows-host:webhook -- -DryRun -WebhookUrl https://example.invalid/webhook -Title "Test" -Message "Preview"` passed
- `npm run backup:windows-host:replicate-offhost -- -DryRun -LocalBackupRoot .\backups -ReplicaRoot .\backups-offhost-test` passed
- `npm run backup:windows-host:retention:offhost -- -ReplicaRoot .\backups -KeepCount 14` passed (preview; no deletions)
- `npm run package:release -- --dry-run` passed and includes the new Phase 9 helper scripts

### 5. Future Target Expansion Readiness (Decision Intake Only)
- [x] Define a lightweight intake checklist for future target expansion requests (for example Linux VM) using the parity requirements from `docs/deployment-platform-support-boundaries.md` (`docs/deployment-target-expansion-intake-evidence-gate.md`)
- [x] Document the evidence required before opening a new implementation phase for a second supported target (`docs/deployment-target-expansion-intake-evidence-gate.md`)
- [x] Keep the current support boundary unchanged unless a new target is explicitly approved (`docs/deployment-target-expansion-intake-evidence-gate.md`, `docs/deployment-platform-support-boundaries.md`)

## Immediate Next Step (Recommended)
Phase 9 is complete. Next step: start Phase 10 planning (notification integration, replication automation scheduling, or broader disaster-recovery hardening) if you want to continue.
