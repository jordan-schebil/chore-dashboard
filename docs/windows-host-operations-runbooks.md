# Windows Host Operations Runbooks

Date: 2026-02-24
Scope: Phase 7 operator runbooks for Windows-host deployments (NSSM-supervised Express API)

## Scope and Assumptions

These runbooks assume:
- Windows-host deployment layout from `docs/windows-host-deployment.md`
- API supervised as an NSSM service using `docs/windows-host-api-service-nssm.md`
- Service name: `ChoreDashboardApi` (examples use this name)
- Frontend static assets are hosted separately from the API service

Example host layout:

```text
C:\ChoreDashboard\
|-- app\
|-- app.previous.<timestamp>\   # created by Phase 6 deploy helper on update
|-- data\
|   `-- chores.db
`-- logs\
```

## Operator Defaults (Example Values)

Use your real host values if they differ.

- Service name: `ChoreDashboardApi`
- Deploy root: `C:\ChoreDashboard`
- App dir: `C:\ChoreDashboard\app`
- Data dir: `C:\ChoreDashboard\data`
- DB path: `C:\ChoreDashboard\data\chores.db`
- API health URL: `http://127.0.0.1:8000/`

## Runbook: Start / Stop / Restart (API Service)

Start:

```powershell
nssm start ChoreDashboardApi
# or (wrapper)
npm run service:windows-host:start
```

Stop:

```powershell
nssm stop ChoreDashboardApi
# or (wrapper)
npm run service:windows-host:stop
```

Restart:

```powershell
nssm restart ChoreDashboardApi
# or (wrapper)
npm run service:windows-host:restart
```

Status checks:

```powershell
Get-Service ChoreDashboardApi
sc.exe query ChoreDashboardApi
npm run service:windows-host:status
Invoke-RestMethod http://127.0.0.1:8000/
```

If service start fails:
- Check `C:\ChoreDashboard\logs\api-stderr.log`
- Check `C:\ChoreDashboard\logs\api-stdout.log`
- Check service configuration in NSSM (`nssm edit ChoreDashboardApi` or `nssm dump ChoreDashboardApi`)
- Optional wrapper config dump: `npm run service:windows-host:nssm -- -Action dump`

## Optional Ops Automation: Health-Check Helper (PowerShell)

Phase 7 includes a small PowerShell helper script for common operator checks:
- Windows service status (`Get-Service`)
- API health endpoint (`GET /`)
- Core read endpoints (`GET /chores`, `GET /rooms`)

Script path:
- `scripts/windows-host-health-check.ps1`

If the script is included in your deployed artifact/app folder (Phase 6 packaging), run it from the app directory:

```powershell
cd C:\ChoreDashboard\app
powershell -ExecutionPolicy Bypass -File .\scripts\windows-host-health-check.ps1
```

If using the packaged `package.json` scripts in the app directory:

```powershell
cd C:\ChoreDashboard\app
npm run health:windows-host
```

Example with explicit service name and API URL:

```powershell
npm run health:windows-host -- -ServiceName ChoreDashboardApi -BaseUrl http://127.0.0.1:8000
```

Manual API debug mode (skip service check if the API is running outside NSSM):

```powershell
npm run health:windows-host -- -SkipServiceCheck -BaseUrl http://127.0.0.1:8000
```

Exit behavior:
- Exit code `0` when all enabled checks pass
- Exit code `1` if any check fails

Use this helper as a quick pre/post-deploy or post-restart check before deeper log triage.

## Runbook: Deploy Update (Artifact Swap + API Restart)

Use this for standard updates with a new release artifact.

1. Confirm you have a release artifact folder/zip and (if from CI) checksum.
2. Back up the database before change.
3. Stop the API service.
4. Deploy the new app artifact (Phase 6 deploy helper).
5. Start the API service.
6. Run the post-change smoke checklist.

Example (PowerShell on deployment host):

```powershell
# 1) Optional: verify zip checksum if using a CI-produced zip artifact
Get-FileHash -Algorithm SHA256 .\release-artifacts\chore-dashboard-v1.0.0.zip

# 2) Back up DB (file copy example; stop service first for safest copy)
Copy-Item C:\ChoreDashboard\data\chores.db C:\ChoreDashboard\data\chores.predeploy.bak -Force

# 3) Stop API
nssm stop ChoreDashboardApi

# 4) Deploy app files (example using local artifact folder + install deps)
npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard -ArtifactDir .\release-artifacts\chore-dashboard-v1.0.0

# 5) Start API
nssm start ChoreDashboardApi

# 6) Smoke check
Invoke-RestMethod http://127.0.0.1:8000/
```

Notes:
- The Phase 6 deploy helper moves the previous app to `app.previous.<timestamp>`.
- The deploy helper does not touch `C:\ChoreDashboard\data\chores.db`.

## Runbook: Rollback to Previous `app.previous.<timestamp>`

Use this when the new app build/config is bad but the DB is believed to be healthy.

When rollback is usually enough (no DB restore):
- API fails to start after deploy due to app/config/runtime issue
- New app serves wrong behavior without corrupting data
- Frontend/API mismatch issue after deploy but data remains intact

Steps:

1. Stop API service:

```powershell
nssm stop ChoreDashboardApi
```

2. Identify the rollback candidate:

```powershell
Get-ChildItem C:\ChoreDashboard -Directory 'app.previous.*' | Sort-Object Name
```

3. Preserve the current failed app folder for inspection (recommended):

```powershell
Rename-Item C:\ChoreDashboard\app ("app.failed." + (Get-Date -Format "yyyyMMdd-HHmmss"))
```

4. Restore the previous app folder:

```powershell
$prev = Get-ChildItem C:\ChoreDashboard -Directory 'app.previous.*' | Sort-Object Name | Select-Object -Last 1
Move-Item $prev.FullName C:\ChoreDashboard\app
```

5. Start API service:

```powershell
nssm start ChoreDashboardApi
```

6. Run the post-change smoke checklist and review logs.

## Runbook: Failure Recovery and DB Restore Decision Points

Use this decision path after a failed deploy or bad runtime behavior.

### A. Decide: App Rollback Only vs DB Restore

Choose **app rollback only** (no DB restore) when:
- Failure is startup/config/service-related (port bind, bad env vars, missing dependency, CORS config)
- UI/API behavior regression occurred but no data corruption/unexpected writes are observed
- The service failed before operators/users performed write actions after deployment

Consider **DB restore** when any of these are true:
- Data corruption is observed (missing/invalid rows, unexpected resets, broken user data)
- An unintended destructive action occurred (for example accidental `/reset` use on production-like data)
- A deploy included DB-affecting behavior and rollback alone does not restore correct runtime behavior
- You need to return to a known-good pre-change data state and have a verified backup

### B. Pre-Restore Safety Steps

Before restoring a DB backup:
- Stop the API service
- Preserve the current DB files for forensics (copy `chores.db` and sidecars if present)
- Confirm which backup timestamp you are restoring
- Confirm the expected data loss window with stakeholders/operators (restore reverts changes after the backup)

### C. DB Restore Procedure (File-Level)

1. Stop API:

```powershell
nssm stop ChoreDashboardApi
```

2. Preserve current DB state (recommended):

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item C:\ChoreDashboard\data\chores.db "C:\ChoreDashboard\data\chores.pre-restore.$stamp.db" -Force
if (Test-Path C:\ChoreDashboard\data\chores.db-wal) { Copy-Item C:\ChoreDashboard\data\chores.db-wal "C:\ChoreDashboard\data\chores.pre-restore.$stamp.db-wal" -Force }
if (Test-Path C:\ChoreDashboard\data\chores.db-shm) { Copy-Item C:\ChoreDashboard\data\chores.db-shm "C:\ChoreDashboard\data\chores.pre-restore.$stamp.db-shm" -Force }
```

3. Restore the chosen backup files (example from a Phase 5 backup folder):

```powershell
$backup = 'C:\ChoreDashboard\backups\chore-db-20260223-201552'
Copy-Item "$backup\chores.db" "C:\ChoreDashboard\data\chores.db" -Force
if (Test-Path "$backup\chores.db-wal") { Copy-Item "$backup\chores.db-wal" "C:\ChoreDashboard\data\chores.db-wal" -Force }
if (Test-Path "$backup\chores.db-shm") { Copy-Item "$backup\chores.db-shm" "C:\ChoreDashboard\data\chores.db-shm" -Force }
```

4. Start API:

```powershell
nssm start ChoreDashboardApi
```

5. Run the post-change smoke checklist and confirm expected data state.

### D. If Recovery Still Fails

- Review API logs (`api-stdout.log`, `api-stderr.log`)
- Verify NSSM env vars (`HOST`, `PORT`, `DATABASE_PATH`, `ALLOWED_ORIGINS`)
- Confirm Node installation path and service command are still valid
- Try app rollback and DB restore separately (not simultaneously) to isolate whether the issue is app or data

## Post-Change Smoke Checklist (Ops Runbook Version)

Run this after deploy, rollback, or DB restore.

1. Service and API health
- `Get-Service ChoreDashboardApi` shows Running
- `GET /` returns `status: "running"`
- Optional helper: `npm run health:windows-host` (from `C:\ChoreDashboard\app`)

2. Core API reads
- `GET /chores` returns expected rows (or seeded defaults on a new DB)
- `GET /rooms` returns without server error

3. Frontend/API connectivity
- Frontend loads from the hosted static site
- Dashboard renders chore data
- No browser CORS errors for the configured frontend origin

4. Optional write-path check (recommended on non-production data or after explicit backup)
- Toggle one completion and verify it persists after refresh

5. Logs
- No repeated startup failure loop or unhandled error spam in API logs

## Cross-References

- Phase 6 deployment helper: `docs/windows-host-deployment.md`
- NSSM service supervision: `docs/windows-host-api-service-nssm.md`
- Logging and diagnostics: `docs/windows-host-logging-diagnostics.md`
- Monitoring baseline and escalation thresholds: `docs/windows-host-monitoring-baseline.md`
- Host hardening and safety baseline: `docs/windows-host-hardening-safety.md`
- Windows backup scheduling and retention policy: `docs/windows-host-backup-scheduling-retention.md`
- Windows restore drill cadence and isolated restore validation: `docs/windows-host-restore-drill-runbook.md`
- Restore drill checklist template (operator-facing): `docs/windows-host-restore-drill-checklist-template.md`
- NSSM helper wrapper script (packaged script): `scripts/windows-host-nssm-service.ps1`
- Operator health-check helper (packaged script): `scripts/windows-host-health-check.ps1`
- Scheduled backup wrapper script (packaged script): `scripts/windows-host-scheduled-backup.ps1`
- Backup retention cleanup helper (packaged script): `scripts/windows-host-backup-retention-cleanup.ps1`
- Backup/restore procedure and backup helper: `README.md` (SQLite backup and restore section)
