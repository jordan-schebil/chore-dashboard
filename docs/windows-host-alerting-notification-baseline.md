# Windows Host Alerting and Notification Baseline (Lightweight)

Date: 2026-02-24
Scope: Phase 9 alerting/notification baseline for Windows-host deployments (NSSM-supervised Express API)

## Goal

Define a lightweight alerting baseline for the Windows-host deployment path without introducing an external alerting platform.

This baseline covers:
- what failures matter most (backup + health-check failures)
- what gets explicit follow-up vs log-only review
- the selected notification path for now
- noise-control rules to avoid false urgency

## Decision (Current Baseline)

Current Phase 9 decision:
- **No automated push notifications** (email/webhook/SMS/Teams) are implemented yet
- Use **log-only + manual review** as the supported baseline
- Rely on:
  - Task Scheduler task history / Last Run Result for scheduled backup and optional health-check tasks
  - local task log files (`backup-task.log`, optional `health-check-task.log`)
  - operator review cadence from `docs/windows-host-monitoring-baseline.md`

Why this is acceptable for the current support level:
- Windows-host-only scope and small operational footprint
- existing helper scripts already produce clear pass/fail exit codes
- Phase 8 established monitoring, backup cadence, and restore drills before adding automation complexity

## Scope and Assumptions

This guide assumes:
- Windows-host monitoring baseline exists (`docs/windows-host-monitoring-baseline.md`)
- Scheduled backups use the Phase 8 Task Scheduler runbook (`docs/windows-host-backup-scheduling-retention.md`)
- Optional health-check task may be scheduled using `npm run health:windows-host`
- Logging/triage guidance exists in `docs/windows-host-logging-diagnostics.md`

Example paths:
- `C:\ChoreDashboard\logs\backup-task.log`
- `C:\ChoreDashboard\logs\health-check-task.log`
- `C:\ChoreDashboard\logs\api-stdout.log`
- `C:\ChoreDashboard\logs\api-stderr.log`

## Minimum Alerting Policy (What Requires Follow-Up)

### A. Scheduled Backup Failures (Must Follow Up)

Treat backup scheduling issues as high priority operational alerts because they reduce recovery confidence.

Must-follow-up conditions:
- scheduled backup task returns non-success (`Last Run Result` not `0x0`)
- no new backup folder created within the expected daily window
- backup task log shows backup helper failure (`[db-backup] failed:`)
- backup retention cleanup (if scheduled later) deletes unexpectedly or fails repeatedly

Response expectation:
- same-day operator review
- earlier if the system is in a deploy/change window

### B. Health-Check Task Failures (Follow-Up Based on Repetition)

If a recurring health-check task is enabled, use repetition-based handling:

Warning-level (log-only until reviewed):
- one failed health-check run followed by a successful next run

Incident-level (immediate operator action):
- 2+ consecutive failed health-check task runs
- repeated failures over a short window (for example multiple failures within 1 hour)
- failure coincides with deploy/rollback/DB restore activity

### C. API Error Log Signals (Review-Driven)

These are not push-notified by the current baseline but must be reviewed:
- repeated startup failures
- repeated unhandled errors
- repeated CORS misconfiguration errors after config changes

Use the monitoring/log review cadence from:
- `docs/windows-host-monitoring-baseline.md`
- `docs/windows-host-logging-diagnostics.md`

## Selected Notification Path (Current) = Log-Only + Manual Review

This is the chosen Phase 9 notification path for now.

### Signal Sources

1. Task Scheduler
- Task history enabled
- `Last Run Result`
- task run duration / retry outcomes

2. Task log files
- `backup-task.log`
- `health-check-task.log` (if a recurring health-check task is enabled)

3. API logs (for correlation during failures)
- `api-stdout.log`
- `api-stderr.log`

### Operator Review Workflow (Baseline)

Daily (or next operator check window):
- confirm backup task success and recent backup folder creation
- review `backup-task.log` for failures

If health-check task is scheduled:
- review recent `health-check-task.log` failures
- check whether failures were transient or repeated

Weekly:
- review recent API stderr for repeated errors
- reconcile any task failures with incident/change windows

## Alert Noise Controls (Baseline)

To reduce alert fatigue and false escalations:

1. Backup task retries
- enable a retry in Task Scheduler (example: 1 retry after 5 minutes)
- treat a recovered retry as a warning, not immediate incident, if backups are current

2. Health-check repetition threshold
- do not escalate on a single failed run if the next run succeeds
- escalate on repeated consecutive failures

3. Change-window context
- during deploy/rollback/restore work, expect transient failures
- require post-change health validation before closing the change

4. Manual review windows
- define when “same-day” means for your household/operator schedule
- avoid indefinite backlog of task failures without triage

## Optional Future Notification Paths (Not Implemented Yet)

These are intentionally deferred until there is a clear need:

- Webhook notification helper (for Teams/Discord/Slack-compatible webhook endpoints)
- Email relay script (SMTP or local relay)
- Windows Event Log integration helper + event-based forwarding

If one of these is added later, it should preserve the current log/task-history path as a fallback source of truth.

## Optional Automation (Phase 9): Webhook Notification Helper

Phase 9 adds an optional webhook helper script for manual or scripted notification delivery when you choose to test/introduce a push notification path:
- `scripts/windows-host-notify-webhook.ps1`
- `npm run notify:windows-host:webhook`

Important:
- This does **not** change the current supported baseline (still log-only + manual review).
- Use this helper only if you intentionally adopt a webhook path for your host/operator workflow.

Dry-run example (safe payload preview, no network request):

```powershell
cd C:\ChoreDashboard\app
npm run notify:windows-host:webhook -- -DryRun -WebhookUrl https://example.invalid/webhook -Title "Backup warning" -Message "Test notification preview" -Severity warning
```

Example using env var handoff (recommended for real use):

```powershell
$env:CHORE_ALERT_WEBHOOK_URL='https://example.invalid/webhook'
npm run notify:windows-host:webhook -- -Title "Health-check failures" -Message "Two consecutive health-check task failures" -Severity critical -EventType health_check_failure
```

Notes:
- The helper returns non-zero on send failure.
- The helper masks query-string details in its target log output.
- The helper can be paired with Task Scheduler tasks later, but that integration is not the baseline in this phase.

## Operator Alert Review Checklist (Copy/Paste)

```text
Alert Review Checklist
- Backup task last run result:
- Backup folder created within expected window:
- backup-task.log errors:
- Health-check task enabled: yes / no
- Health-check consecutive failures:
- API stderr repeated errors observed:
- Change window active (deploy/rollback/restore): yes / no
- Classification: warning / incident
- Action taken:
```

## Boundaries

- This phase does not implement push notifications
- This is a baseline policy and review process, not a monitoring platform
- Off-host backup replication alerts/validation escalation are handled in later Phase 9 work after replication policy exists (`docs/windows-host-offhost-backup-replication-runbook.md`)

## Cross-References

- Windows monitoring baseline: `docs/windows-host-monitoring-baseline.md`
- Windows backup scheduling and retention: `docs/windows-host-backup-scheduling-retention.md`
- Windows logging and diagnostics: `docs/windows-host-logging-diagnostics.md`
- Windows operations runbooks (incident response / rollback / restore): `docs/windows-host-operations-runbooks.md`
- Windows off-host backup replication policy and manual runbook: `docs/windows-host-offhost-backup-replication-runbook.md`
- Replicated-backup validation and recovery-confidence guidance: `docs/windows-host-offhost-replication-validation-confidence.md`
- Phase 9 tracking: `docs/phase9-alerting-offhost-replication-expansion-readiness-checklist.md`
