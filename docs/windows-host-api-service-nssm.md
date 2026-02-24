# Windows Host API Service Supervision (NSSM)

Date: 2026-02-24
Scope: Phase 7 Windows service supervision decision + operator runbook

## Decision

Chosen approach: **NSSM (Non-Sucking Service Manager)** for supervising the Express API on Windows hosts.

Why NSSM (for this project):
- Simple wrapper for running `node.exe` as a Windows service
- Supports restart behavior and stdout/stderr log redirection
- Works well with a plain Node/Express process without custom service code
- Lower operational overhead than building a custom Windows service wrapper

Alternatives considered (not selected for the default runbook):
- Task Scheduler: acceptable for startup-on-boot, weaker service-style stop/restart operations
- Manual process supervision: too fragile for repeatable operations

## Assumptions

This runbook assumes the Phase 6 Windows-host deployment layout:

```text
C:\ChoreDashboard\
|-- app\                 # deployed artifact contents
|-- data\
|   `-- chores.db        # persistent SQLite DB
`-- logs\               # API stdout/stderr logs (recommended)
```

And:
- Node.js is installed on the host (example path: `C:\Program Files\nodejs\node.exe`)
- NSSM is installed and `nssm.exe` is available on `PATH` (or use the full path)
- Frontend static files are hosted separately (IIS or equivalent)

## Runtime Environment Handoff (Service Process)

Set these on the supervised API process:
- `HOST=127.0.0.1` (recommended when behind same-host reverse proxy)
- `PORT=8000`
- `DATABASE_PATH=C:\ChoreDashboard\data\chores.db`
- `ALLOWED_ORIGINS=https://chores.example.com`

Optional:
- `LOG_REQUESTS=true|false`
- `LOG_REQUEST_BODIES=false` (recommended default)
- `LOG_REQUEST_BODY_MAX_CHARS=200`

## Install Runbook (NSSM Service)

Service name used in examples: `ChoreDashboardApi`

1. Deploy/update the app files first (Phase 6 helper is fine):
- `npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard`

2. Create a logs directory (recommended):
- PowerShell:

```powershell
New-Item -ItemType Directory -Path C:\ChoreDashboard\logs -Force | Out-Null
```

3. Install the service (PowerShell example using `nssm.exe` on PATH):

```powershell
$svc = 'ChoreDashboardApi'
$appDir = 'C:\ChoreDashboard\app'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$apiEntrypoint = 'server\index.js'

nssm install $svc $nodeExe $apiEntrypoint
nssm set $svc AppDirectory $appDir
nssm set $svc AppStdout C:\ChoreDashboard\logs\api-stdout.log
nssm set $svc AppStderr C:\ChoreDashboard\logs\api-stderr.log
nssm set $svc AppRotateFiles 1
nssm set $svc AppRotateOnline 1
nssm set $svc AppRotateBytes 10485760
nssm set $svc Start SERVICE_AUTO_START
nssm set $svc DisplayName "Chore Dashboard API"
nssm set $svc Description "Express API service for Chore Dashboard"
nssm set $svc AppEnvironmentExtra "HOST=127.0.0.1" "PORT=8000" "DATABASE_PATH=C:\ChoreDashboard\data\chores.db" "ALLOWED_ORIGINS=https://chores.example.com" "LOG_REQUESTS=false" "LOG_REQUEST_BODIES=false"
```

Notes:
- `AppEnvironmentExtra` replaces the configured set; rerun with the full desired list when updating env vars.
- If Node is installed elsewhere, update `$nodeExe`.
- If you prefer `npm run start:api:node`, NSSM can run `cmd.exe /c npm run start:api:node`, but `node.exe server/index.js` is simpler and avoids npm wrapper behavior in services.

4. Start the service:

```powershell
nssm start ChoreDashboardApi
```

5. Verify health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/
```

## Start / Stop / Restart Runbook

Start:

```powershell
nssm start ChoreDashboardApi
```

Stop:

```powershell
nssm stop ChoreDashboardApi
```

Restart:

```powershell
nssm restart ChoreDashboardApi
```

Status checks:

```powershell
Get-Service ChoreDashboardApi
sc.exe query ChoreDashboardApi
```

## Optional Ops Automation: NSSM Helper Wrapper Script (PowerShell)

Phase 7 includes an optional helper script that wraps common NSSM operations with project defaults:
- install
- uninstall
- start / stop / restart
- status
- dump
- set-env (reapply `AppEnvironmentExtra`)

Script path:
- `scripts/windows-host-nssm-service.ps1`

Package.json wrappers (run from the repo or a deployed `app/` folder that includes `package.json` + `scripts/`):

```powershell
npm run service:windows-host:status
npm run service:windows-host:restart
npm run service:windows-host:stop
npm run service:windows-host:start
```

Install example (set the real frontend origin for your deployment):

```powershell
npm run service:windows-host:install -- -DeployRoot C:\ChoreDashboard -AllowedOrigins https://chores.example.com
```

Uninstall example:

```powershell
npm run service:windows-host:uninstall
```

Dry-run examples (safe command preview; no NSSM calls executed):

```powershell
npm run service:windows-host:install -- -DryRun -DeployRoot C:\ChoreDashboard -AllowedOrigins https://chores.example.com
npm run service:windows-host:status -- -DryRun
```

Notes:
- Override `-ServiceName`, `-NodeExe`, or `-NssmExe` if your host differs from the default examples.
- `set-env` rewrites the full `AppEnvironmentExtra` set (same NSSM behavior noted elsewhere in this runbook).
- The helper script does not replace the runbook; it reduces command repetition and operator typo risk.

## Update Runbook (Deployed App Refresh)

Use this for deploying a new release artifact with minimal operator ambiguity.

1. Back up the DB first (recommended):
- `npm run db:backup` (on the source/repo machine) or use the host backup procedure from `README.md`

2. Stop the API service:
- `nssm stop ChoreDashboardApi`

3. Deploy the new artifact to the host:
- `npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard`

4. Start the API service:
- `nssm start ChoreDashboardApi`

5. Run post-change smoke checks:
- `GET /`
- `GET /chores`
- `GET /rooms`
- Frontend loads and can read API data

## Update Env Vars (Service Reconfiguration)

If frontend origin, port, or DB path changes:

1. Stop service:
- `nssm stop ChoreDashboardApi`

2. Reapply the full environment set:

```powershell
nssm set ChoreDashboardApi AppEnvironmentExtra "HOST=127.0.0.1" "PORT=8000" "DATABASE_PATH=C:\ChoreDashboard\data\chores.db" "ALLOWED_ORIGINS=https://chores.example.com" "LOG_REQUESTS=false" "LOG_REQUEST_BODIES=false"
```

3. Start service:
- `nssm start ChoreDashboardApi`

4. Verify:
- `Invoke-RestMethod http://127.0.0.1:8000/`

## Uninstall Runbook

```powershell
nssm stop ChoreDashboardApi
nssm remove ChoreDashboardApi confirm
```

## Notes and Boundaries

- This runbook supervises the **API process only**. Frontend static hosting (IIS/reverse proxy) is managed separately.
- Keep the API bound to `127.0.0.1` when fronted by a same-host reverse proxy.
- The API has no auth; do not expose it directly to untrusted networks.
- For deploy/rollback/failure-recovery operator procedures, see `docs/windows-host-operations-runbooks.md`.
- For logging policy, log capture, and troubleshooting, see `docs/windows-host-logging-diagnostics.md`.
- For Windows host hardening and safety baseline guidance, see `docs/windows-host-hardening-safety.md`.
- For deploy/rollback/failure smoke checks and operator health-check helper usage, see `docs/windows-host-operations-runbooks.md`.
