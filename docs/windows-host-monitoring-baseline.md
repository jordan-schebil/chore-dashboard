# Windows Host Monitoring Baseline (Practical)

Date: 2026-02-24
Scope: Phase 8 monitoring baseline for Windows-host deployments (NSSM-supervised Express API)

## Goal

Define a minimum monitoring baseline operators can run consistently without adding a full monitoring stack.

This baseline answers:
- what to check regularly
- what can be scheduled on the host
- what thresholds should trigger incident handling (rollback/restore evaluation)

## Scope and Assumptions

This guide assumes:
- Windows-host deployment layout from `docs/windows-host-deployment.md`
- NSSM-supervised API service using `docs/windows-host-api-service-nssm.md`
- Logging and troubleshooting guidance from `docs/windows-host-logging-diagnostics.md`
- Helper scripts are available in the deployed `app\` folder:
  - `scripts/windows-host-health-check.ps1`
  - `scripts/windows-host-nssm-service.ps1`

Example values used below:
- Service name: `ChoreDashboardApi`
- API URL: `http://127.0.0.1:8000`
- App dir: `C:\ChoreDashboard\app`
- Logs dir: `C:\ChoreDashboard\logs`
- Backups dir: `C:\ChoreDashboard\backups`

## Minimum Monitoring Baseline (What to Monitor)

Monitor these categories at minimum:

1. Service state
- Windows service exists and is `Running`

2. API health
- `GET /` returns `status: "running"`

3. Core read-path sanity
- `GET /chores` returns a JSON array
- `GET /rooms` returns a JSON array

4. Error signal in logs
- no repeated startup failures
- no repeated unhandled-error spam
- no repeated CORS misconfiguration errors after deploy/config changes

5. Backup freshness (operational monitoring, not app monitoring)
- at least one recent backup exists within the expected schedule window

6. Disk growth (host safety)
- logs and backups are not growing unexpectedly

## Manual vs Scheduled Monitoring (Baseline Decision)

Use a mixed model:

### Manual Checks (Operator-initiated)

Use manual checks:
- after deploy / rollback / DB restore
- after config changes (port, origins, DB path)
- after incidents
- during restore drills

Manual baseline command (recommended):

```powershell
cd C:\ChoreDashboard\app
npm run health:windows-host
```

For deeper triage, use:
- `npm run service:windows-host:status`
- `Get-Content C:\ChoreDashboard\logs\api-stderr.log -Tail 100`
- `Get-Content C:\ChoreDashboard\logs\api-stdout.log -Tail 100`

### Scheduled Checks (Host-level, Practical)

Schedule these on the host (Task Scheduler is sufficient for the baseline):

1. Daily backup task
- Covered in `docs/windows-host-backup-scheduling-retention.md`

2. Optional recurring health-check task (recommended if the host is unattended)
- Runs `npm run health:windows-host`
- Writes output to a simple log file
- Does not replace operator review; it reduces time-to-detection

3. Weekly operator log/backup review
- verify backup freshness and backup count retention
- review recent `api-stderr.log` for repeated failures

## Monitoring Cadence (Practical Baseline)

Recommended baseline cadence:

- Every deploy/rollback/DB restore:
  - run `npm run health:windows-host`
  - review recent stdout/stderr logs

- Daily (scheduled):
  - backup task executes (see backup scheduling runbook)
  - optional health-check task executes (if enabled)

- Weekly (operator review):
  - confirm backups are current
  - confirm backup count is within retention policy
  - review logs for repeated errors/warnings
  - confirm no unexplained service restarts/stops

- Quarterly (or monthly if desired):
  - run restore drill (see `docs/windows-host-restore-drill-runbook.md`)

## Optional Scheduled Health-Check Task (Task Scheduler Pattern)

If you want lightweight automated checks without a monitoring platform, schedule the existing helper script.

Task name (example):
- `ChoreDashboardApiHealthCheck`

Action (run from deployed app directory):

Program/script:

```text
cmd.exe
```

Add arguments:

```text
/c npm run health:windows-host >> C:\ChoreDashboard\logs\health-check-task.log 2>&1
```

Start in:

```text
C:\ChoreDashboard\app
```

Suggested trigger:
- every 15 minutes (or hourly for lower-noise environments)

Notes:
- This is a local check and does not notify by itself
- Pair it with a periodic operator review of `health-check-task.log`
- If the helper exits non-zero, Task Scheduler should record a failed run result

## Failure Thresholds and Escalation Triggers

Use the following baseline thresholds to decide when to escalate from routine monitoring to incident handling.

### Warning (Investigate Soon)

Examples:
- one failed health-check run followed by the next run succeeding
- a transient CORS error during a config change window
- one missed backup run, but a recent backup still exists within acceptable window

Action:
- investigate during the next operator check window
- review logs and task history
- correct config/task issues before they repeat

### Incident (Immediate Operator Action)

Treat as an incident if any of these occur:
- service is not running and does not recover promptly after restart
- `GET /` fails repeatedly or returns non-running status
- `GET /chores` or `GET /rooms` repeatedly fails (server error / invalid response)
- repeated startup failures (`listen failed`, DB startup/schema errors)
- repeated unhandled errors affecting normal use
- no successful backup within the expected backup window (for example >24 hours on daily schedule)
- evidence of DB corruption or unexpected data loss

Immediate actions:
1. Capture service status + log snapshot (`docs/windows-host-logging-diagnostics.md`)
2. Run the health-check helper manually to confirm scope
3. Determine if this is app/config/runtime vs data issue
4. Use `docs/windows-host-operations-runbooks.md` to choose:
- app rollback
- DB restore decision path

### Escalate to Recovery Decision (Rollback/Restore Evaluation)

Move into formal rollback/restore evaluation when:
- restart does not restore stable health
- repeated 5xx/unhandled errors persist after config checks
- data behavior is wrong after deploy and rollback-only is uncertain
- backup freshness is in doubt during an incident

At this point, use:
- `docs/windows-host-operations-runbooks.md` (rollback and DB restore decision points)
- `docs/windows-host-restore-drill-runbook.md` (to confirm operators understand the restore validation flow if needed)

## Operator Monitoring Checklist (Copy/Paste)

```text
Monitoring Review Checklist
- Service status (Running):
- GET / health result:
- GET /chores and /rooms read checks:
- Recent stderr review (startup/unhandled errors):
- Recent backup timestamp:
- Backup count within retention:
- Disk usage concerns (logs/backups):
- Action needed: none / investigate / incident
```

## Boundaries

- This is a practical baseline, not a full observability platform
- No metrics/alerts backend (Prometheus/Grafana/etc.) is defined here
- Notification delivery (email/SMS/Teams) is not implemented in this phase; see the Phase 9 alerting baseline for the current log-only/manual-review policy (`docs/windows-host-alerting-notification-baseline.md`)

## Cross-References

- Windows logging and diagnostics: `docs/windows-host-logging-diagnostics.md`
- Windows operations runbooks (rollback/restore decisions): `docs/windows-host-operations-runbooks.md`
- Windows backup scheduling and retention policy: `docs/windows-host-backup-scheduling-retention.md`
- Windows restore drill runbook: `docs/windows-host-restore-drill-runbook.md`
- Windows alerting and notification baseline: `docs/windows-host-alerting-notification-baseline.md`
- Windows service supervision (NSSM): `docs/windows-host-api-service-nssm.md`
- Phase 8 tracking: `docs/phase8-monitoring-backup-platform-expansion-checklist.md`
