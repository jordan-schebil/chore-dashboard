# Windows Host Restore Drill Runbook (Isolated DB Copy)

Date: 2026-02-24
Scope: Phase 8 restore drill cadence + isolated restore validation runbook for the Windows-host deployment path

## Goal

Verify that scheduled backups are actually recoverable without risking the live deployment by restoring a backup into an isolated DB copy and running the API against that copy on a separate local port.

## Cadence (Baseline)

Recommended baseline:
- **Quarterly** restore drill minimum for low-change/household use
- **Monthly** restore drill if the system is actively used or if operators are less familiar with the recovery process
- **Additional drill after major backend/data-path changes** (for example DB migrations, backup workflow changes, or host path changes)

What counts as a successful drill:
- Backup files restore to an isolated location without errors
- API starts using the restored copy
- Core read endpoints return expected responses
- Operator records drill evidence (backup used, timestamp, row counts, issues)

## Scope and Safety Boundaries

This runbook is for **restore validation**, not production rollback.

Safety rules:
- Do **not** point the drill API to the live DB (`C:\ChoreDashboard\data\chores.db`)
- Use a different local port than the production-like service (example drill port: `8012`)
- Bind the drill API to `127.0.0.1`
- Prefer read-only smoke checks during drills (no write tests unless explicitly planned)
- Do not stop the live NSSM service unless your drill plan requires the same port (this runbook does not)

## Inputs and Example Paths

Adjust paths to match your host.

- Deploy root: `C:\ChoreDashboard`
- Live app dir: `C:\ChoreDashboard\app`
- Backup root: `C:\ChoreDashboard\backups`
- Example backup folder: `C:\ChoreDashboard\backups\chore-db-20260224-021500`
- Drill workspace root (suggested): `C:\ChoreDashboard\drills`
- Drill port (example): `8012`

## Restore Drill Procedure (Isolated Copy + API Smoke Checks)

### 1. Choose the Backup to Validate

Pick a recent scheduled backup folder (or a pre-deploy backup) and confirm it contains:
- `chores.db`
- `backup-manifest.json`
- optional `chores.db-wal`
- optional `chores.db-shm`

Preview recent backups:

```powershell
Get-ChildItem C:\ChoreDashboard\backups -Directory 'chore-db-*' | Sort-Object Name | Select-Object -Last 5
```

### 2. Create an Isolated Drill Workspace

Create a timestamped drill folder and restore the backup files into it.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$drillRoot = "C:\ChoreDashboard\drills\restore-drill-$stamp"
New-Item -ItemType Directory -Path $drillRoot -Force | Out-Null
```

### 3. Restore the Backup into the Drill Workspace

Copy the backup DB and SQLite sidecars (if present) into the drill workspace.

```powershell
$backup = 'C:\ChoreDashboard\backups\chore-db-20260224-021500'
Copy-Item "$backup\chores.db" "$drillRoot\chores.db" -Force
if (Test-Path "$backup\chores.db-wal") { Copy-Item "$backup\chores.db-wal" "$drillRoot\chores.db-wal" -Force }
if (Test-Path "$backup\chores.db-shm") { Copy-Item "$backup\chores.db-shm" "$drillRoot\chores.db-shm" -Force }
```

Optional verification:

```powershell
Get-ChildItem $drillRoot
Get-Content "$backup\backup-manifest.json"
```

### 4. Start the API Against the Restored Copy (Separate Port)

Run the API manually from the deployed `app\` folder using environment overrides for the drill DB and port.

```powershell
cd C:\ChoreDashboard\app
$env:HOST='127.0.0.1'
$env:PORT='8012'
$env:DATABASE_PATH="$drillRoot\chores.db"
$env:ALLOWED_ORIGINS='http://localhost'
npm run start:api:node
```

Notes:
- This run is separate from the NSSM service and should not interfere with production-like traffic when using a different port.
- If the drill DB path is wrong, stop and correct it before continuing.

### 5. Run Core Smoke Checks Against the Drill API

In a second PowerShell window:

```powershell
$base='http://127.0.0.1:8012'
Invoke-RestMethod "$base/"
$chores = Invoke-RestMethod "$base/chores"
$rooms = Invoke-RestMethod "$base/rooms"
"chores_count=$($chores.Count)"
"rooms_count=$($rooms.Count)"
```

Recommended additional checks (read-only):

```powershell
$today = Get-Date -Format 'yyyy-MM-dd'
Invoke-RestMethod "$base/completions/$today"
Invoke-RestMethod "$base/daily-order/$today"
```

Optional helper usage (API-only drill mode; skip service check because NSSM service is not the drill process):

```powershell
cd C:\ChoreDashboard\app
npm run health:windows-host -- -SkipServiceCheck -BaseUrl http://127.0.0.1:8012
```

### 6. Record Drill Evidence

Record the results before stopping the drill API (template below).

Operator-friendly checklist/template:
- `docs/windows-host-restore-drill-checklist-template.md`

Minimum evidence to capture:
- Drill timestamp
- Operator name
- Backup folder used
- Backup manifest timestamp (`backup-manifest.json`)
- Drill DB path
- Drill API bind/port
- `GET /` result status/message
- Chore/room row counts
- Any errors encountered and how they were resolved
- Final result (`pass` / `fail`)

### 7. Stop the Drill API and Clean Up

Stop the manual API process (`Ctrl+C` in the drill terminal).

Cleanup guidance:
- Keep the drill workspace until results are recorded and reviewed
- Remove old drill workspaces periodically if disk usage grows (they are not part of the backup retention count)

## Failure Handling During a Drill

If the drill fails:

1. Record the failure and exact step where it occurred.
2. Preserve the drill workspace and log output for investigation.
3. Determine whether the issue is:
   - bad/missing backup files
   - incorrect drill procedure/path
   - API startup/config issue
   - schema/read failure against restored data
4. Run a second drill with a different backup only after documenting the first failure.
5. If multiple backups fail, treat this as a backup/recovery incident and escalate.

## Restore Drill Evidence Template (Operator Copy/Paste)

```text
Restore Drill Record
- Date/time:
- Operator:
- Backup folder:
- Backup manifest created_at:
- Drill workspace:
- Drill API URL:
- GET / status/message:
- chores_count:
- rooms_count:
- Additional checks run:
- Result: PASS / FAIL
- Issues observed:
- Follow-up actions:
```

## Cross-References

- Windows backup scheduling and retention policy: `docs/windows-host-backup-scheduling-retention.md`
- Windows off-host backup replication policy (replicated backup sources): `docs/windows-host-offhost-backup-replication-runbook.md`
- Replicated-backup validation cadence and recovery-confidence decisions: `docs/windows-host-offhost-replication-validation-confidence.md`
- Windows deploy/rollback/recovery runbooks (actual incident restore path): `docs/windows-host-operations-runbooks.md`
- NSSM service supervision and service helper wrappers: `docs/windows-host-api-service-nssm.md`
- Restore drill checklist template (operator-facing): `docs/windows-host-restore-drill-checklist-template.md`
- Phase 8 tracking: `docs/phase8-monitoring-backup-platform-expansion-checklist.md`
