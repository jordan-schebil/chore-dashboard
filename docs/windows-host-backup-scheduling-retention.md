# Windows Host Backup Scheduling and Retention (Task Scheduler)

Date: 2026-02-24
Scope: Phase 8 scheduled backup runbook + retention policy for the Windows-host deployment path

## Goal

Make recurring SQLite backups predictable on the Windows host by:
- scheduling the existing backup helper (`npm run db:backup`)
- writing backups outside the deployed `app/` folder
- defining a retention policy operators can follow consistently

## Assumptions

This guide assumes the Phase 6/7 Windows-host layout:

```text
C:\ChoreDashboard\
|-- app\                 # deployed artifact contents (contains package.json + scripts/)
|-- data\
|   `-- chores.db        # live SQLite DB
|-- backups\            # recommended scheduled backup destination (outside app/)
`-- logs\
```

And:
- The API runs as an NSSM service (examples use `ChoreDashboardApi`)
- Node.js and npm are available on the host
- The deployed `app\` folder contains `scripts\backup-db.mjs`

## Backup Scheduling Policy (Baseline)

Recommended baseline for the Windows-host deployment path:

1. Run a recurring backup **daily during off-hours** (example: `02:15` local time).
2. Write backups to `C:\ChoreDashboard\backups` (or another path outside `app\`).
3. Keep backups as timestamped folders created by the existing helper (`chore-db-YYYYMMDD-HHMMSS`).
4. Continue to take an additional **manual backup before deploys** or risky DB operations.

Why outside `app\`:
- The deploy helper rotates/replaces `app\` during updates.
- Keeping backups under `app\` increases the chance of accidental deletion during deploy/rollback work.

## Retention Policy (Baseline)

Use this retention policy until an automated cleanup helper is added:

- Local retention: keep the **14 most recent daily backup folders** in `C:\ChoreDashboard\backups`
- Deploy safety: keep the **most recent pre-deploy backup** until the deployment is accepted and rollback risk is low
- Optional off-host copy: if available, copy at least one recent backup to a network share after major changes

Operator rules:
- Do not delete backups from inside the most recent 14 folders
- Do not delete the only known-good backup after an incident until recovery is confirmed
- Review backup folder growth weekly (count + disk usage)

Note:
- This is a **count-based retention** policy to reduce operator ambiguity
- Phase 8 optional automation now includes a retention cleanup helper if you want scripted cleanup (`scripts/windows-host-backup-retention-cleanup.ps1`)

## Scheduling Mode Decision: Warm vs. Cold Backups

The backup helper prints a warning that stopping the app is safest. For recurring operations, choose one mode explicitly:

### A. Warm Backup (Recommended default for recurring schedule)

Run the backup while the API is online.

Tradeoff:
- Pros: no downtime, simple Task Scheduler action
- Cons: less conservative than stopping the app first

Why this is acceptable as the baseline:
- The helper copies `chores.db` and SQLite sidecars (`-wal`, `-shm`) when present
- Backups run during off-hours
- You should still take a manual pre-deploy backup with a stop-first workflow when practical

### B. Cold Backup (Optional stricter mode)

Temporarily stop the API service, run the backup, then restart the service.

Tradeoff:
- Pros: safest file copy mode
- Cons: introduces scheduled downtime and a more complex Task Scheduler command/wrapper

If you need cold backups regularly, use the Phase 8 scheduled-backup wrapper script (`scripts/windows-host-scheduled-backup.ps1`) with `-Mode cold`.

## Task Scheduler Runbook (Warm Backup Baseline)

Create a scheduled task that runs the backup helper from the deployed `app\` directory.

### Recommended Task Settings

- Task name: `ChoreDashboardDbBackup`
- Run whether user is logged on or not
- Run with highest privileges: only if required by your host policy/path ACLs
- Account: a non-admin service/ops account with:
  - read access to `C:\ChoreDashboard\data`
  - write access to `C:\ChoreDashboard\backups`
  - read/execute access to `C:\ChoreDashboard\app`

### Trigger (Example)

- Daily
- Start time: `2:15:00 AM` (local host time)

### Action (Recommended - Wrapper Script)

Program/script:

```text
powershell.exe
```

Add arguments:

```text
-ExecutionPolicy Bypass -File C:\ChoreDashboard\app\scripts\windows-host-scheduled-backup.ps1 -Mode warm *> C:\ChoreDashboard\logs\backup-task.log
```

Start in:

```text
C:\ChoreDashboard\app
```

Notes:
- The wrapper enforces the expected DB path / backup root defaults for the Windows-host layout
- `Start in` is still recommended so relative behavior matches operator shell usage
- `*>` captures stdout/stderr to a simple operator log for Task Scheduler runs
- Use `-Mode cold` only if you intentionally want scheduled downtime for safer file copies
- If you store backups on a network share, replace `--out-dir` with that path (confirm account permissions first)

### Action (Fallback - Raw npm Command)

Use this if you prefer not to use the wrapper script:

Program/script:

```text
cmd.exe
```

Add arguments:

```text
/c npm run db:backup -- --db C:\ChoreDashboard\data\chores.db --out-dir C:\ChoreDashboard\backups >> C:\ChoreDashboard\logs\backup-task.log 2>&1
```

Start in:

```text
C:\ChoreDashboard\app
```

### Conditions / Settings (Practical Baseline)

- Enable task history
- Allow task to be run on demand
- If the task fails, retry (example: 1 retry after 5 minutes)
- Stop the task if it runs unusually long (example: 15 minutes) unless your DB size requires longer

## Validation and Ongoing Checks

After creating or changing the task:

1. Run the task manually once from Task Scheduler.
2. Confirm a new folder appears under `C:\ChoreDashboard\backups`.
3. Confirm `backup-manifest.json` exists in the new folder.
4. Review `C:\ChoreDashboard\logs\backup-task.log` for `[db-backup] backup created successfully`.
5. Confirm the task result code is `0x0` in Task Scheduler history/Last Run Result.

Ongoing operator checks (weekly recommended):
- Confirm at least one recent backup folder was created in the last 24 hours
- Confirm backup count is within retention policy (keep latest 14)
- Confirm disk usage for `C:\ChoreDashboard\backups` is not growing unexpectedly

## Retention Cleanup Helper (Optional Automation)

Phase 8 adds an optional helper for previewing and applying backup retention cleanup:
- `scripts/windows-host-backup-retention-cleanup.ps1`
- `npm run backup:windows-host:retention`

Recommended baseline usage (keep latest 14, preview only):

```powershell
cd C:\ChoreDashboard\app
npm run backup:windows-host:retention -- -BackupRoot C:\ChoreDashboard\backups -KeepCount 14
```

Apply deletions:

```powershell
npm run backup:windows-host:retention -- -BackupRoot C:\ChoreDashboard\backups -KeepCount 14 -Apply
```

Optional age-based mode example (preview only):

```powershell
npm run backup:windows-host:retention -- -BackupRoot C:\ChoreDashboard\backups -KeepCount 0 -MaxAgeDays 30
```

Notes:
- The helper defaults to **preview only** unless `-Apply` is provided
- Use count-based cleanup (`-KeepCount 14`) for the baseline policy documented above
- `-KeepCount 0` means disable count-based retention in favor of age-based cleanup
- Age-based cleanup is optional and should be adopted only with explicit operator policy

## Manual Retention Cleanup (Fallback)

Use this only after confirming recent backups exist and no incident recovery is in progress.

Preview backup folders sorted oldest -> newest:

```powershell
Get-ChildItem C:\ChoreDashboard\backups -Directory 'chore-db-*' | Sort-Object Name
```

Delete older backups while keeping the 14 most recent (preview first):

```powershell
$all = Get-ChildItem C:\ChoreDashboard\backups -Directory 'chore-db-*' | Sort-Object Name
$toDelete = $all | Select-Object -First ([Math]::Max(0, $all.Count - 14))
$toDelete | Select-Object FullName
# When ready:
# $toDelete | Remove-Item -Recurse -Force
```

## Boundaries and Next Steps

- This runbook documents the **Windows-host baseline** only
- It does not schedule restore drills (covered by `docs/windows-host-restore-drill-runbook.md`)
- It does not implement remote/off-host backup replication

## Cross-References

- SQLite backup helper and basic restore steps: `README.md` (SQLite Backup and Restore section)
- Windows deploy/rollback/recovery runbooks: `docs/windows-host-operations-runbooks.md`
- NSSM service supervision and service helper wrappers: `docs/windows-host-api-service-nssm.md`
- Windows monitoring baseline and escalation thresholds: `docs/windows-host-monitoring-baseline.md`
- Windows alerting and notification baseline (backup failure follow-up policy): `docs/windows-host-alerting-notification-baseline.md`
- Windows off-host backup replication policy and manual runbook: `docs/windows-host-offhost-backup-replication-runbook.md`
- Windows restore drill cadence and isolated restore validation: `docs/windows-host-restore-drill-runbook.md`
- Phase 8 tracking: `docs/phase8-monitoring-backup-platform-expansion-checklist.md`
