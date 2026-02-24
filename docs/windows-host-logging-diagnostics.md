# Windows Host Logging and Diagnostics (NSSM + Express API)

Date: 2026-02-24
Scope: Phase 7 logging/diagnostics guidance for Windows-host deployments using NSSM-supervised Express API

## Scope and Assumptions

This guide assumes:
- Windows-host deployment layout from `docs/windows-host-deployment.md`
- API supervised with NSSM using `docs/windows-host-api-service-nssm.md`
- NSSM log files configured to:
  - `C:\ChoreDashboard\logs\api-stdout.log`
  - `C:\ChoreDashboard\logs\api-stderr.log`

## Logging Model (What Goes Where)

The Express API writes:
- normal startup and request logs to stdout
- error logs (startup failures, unhandled errors, 5xx request logs) to stderr

With the NSSM runbook configuration, those streams are redirected to:
- `api-stdout.log` (stdout)
- `api-stderr.log` (stderr)

NSSM log rotation (as configured in the NSSM runbook) is expected:
- `AppRotateFiles=1`
- `AppRotateOnline=1`
- `AppRotateBytes=10485760` (10 MB)

## Operator Logging Policy (Recommended Defaults)

Default production-like recommendation:
- `LOG_REQUESTS=false`
- `LOG_REQUEST_BODIES=false`

When to temporarily enable request logging:
- investigating API path usage or sequencing issues
- troubleshooting unexpected 4xx/5xx behavior
- confirming frontend/API traffic reaches the expected host/port

When **not** to enable request body logging (`LOG_REQUEST_BODIES=true`) by default:
- shared environments with real household/user data
- long-running production-like deployments where logs may retain sensitive content

If request logging is needed:
- enable `LOG_REQUESTS=true` first
- keep `LOG_REQUEST_BODIES=false` unless the specific issue requires payload inspection
- if payload inspection is necessary, use the shortest practical window and turn it off after diagnosis

## Updating Logging Env Vars (NSSM Service)

NSSM stores service env vars in `AppEnvironmentExtra`. Reapply the full set when changing logging options.

Example (PowerShell):

```powershell
nssm stop ChoreDashboardApi
nssm set ChoreDashboardApi AppEnvironmentExtra "HOST=127.0.0.1" "PORT=8000" "DATABASE_PATH=C:\ChoreDashboard\data\chores.db" "ALLOWED_ORIGINS=https://chores.example.com" "LOG_REQUESTS=true" "LOG_REQUEST_BODIES=false" "LOG_REQUEST_BODY_MAX_CHARS=200"
nssm start ChoreDashboardApi
```

## Log Collection and Triage Commands (PowerShell)

Tail logs live:

```powershell
Get-Content C:\ChoreDashboard\logs\api-stdout.log -Tail 100 -Wait
```

```powershell
Get-Content C:\ChoreDashboard\logs\api-stderr.log -Tail 100 -Wait
```

Search for common failures:

```powershell
Select-String -Path C:\ChoreDashboard\logs\api-stderr.log -Pattern 'listen failed|startup failed|CORS origin not allowed|unhandled error'
```

Recent service status + health:

```powershell
Get-Service ChoreDashboardApi
Invoke-RestMethod http://127.0.0.1:8000/
```

Capture a quick log snapshot for escalation:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Path C:\ChoreDashboard\logs\snapshots -Force | Out-Null
Copy-Item C:\ChoreDashboard\logs\api-stdout.log "C:\ChoreDashboard\logs\snapshots\api-stdout-$stamp.log" -Force
Copy-Item C:\ChoreDashboard\logs\api-stderr.log "C:\ChoreDashboard\logs\snapshots\api-stderr-$stamp.log" -Force
```

## Failure-Symptom Troubleshooting Map

### Symptom: API service will not start (service stops immediately)

Check first:
- `api-stderr.log`
- `Get-Service ChoreDashboardApi`
- NSSM command/path configuration (`nssm dump ChoreDashboardApi`)

Common causes:
- bad `node.exe` path
- wrong `AppDirectory`
- missing runtime dependencies (`node_modules` not installed in deployed app)
- invalid env var values (especially `PORT`)

Fix path:
- correct NSSM config (`AppDirectory`, `Application`, `AppParameters`)
- rerun `npm ci --omit=dev` in `C:\ChoreDashboard\app`
- restart service

### Symptom: `listen failed` / port already in use

Likely cause:
- another process is already bound to the configured `PORT`

Check:

```powershell
netstat -ano | findstr :8000
```

Fix path:
- stop the conflicting process or change `PORT`
- update NSSM `AppEnvironmentExtra` with the new `PORT`
- restart service

### Symptom: `startup failed` with DB open/schema errors

Likely causes:
- `DATABASE_PATH` points to a missing or inaccessible location
- filesystem permission issue
- invalid/corrupt DB file

Check:
- `api-stderr.log` for `startup failed`
- verify `DATABASE_PATH` in NSSM env vars
- confirm the file/path exists and the service account can read/write

Fix path:
- correct `DATABASE_PATH`
- restore from backup if the DB is corrupt or known-bad
- restart service and run API health checks

### Symptom: Browser shows CORS errors / API calls blocked

Likely cause:
- `ALLOWED_ORIGINS` does not include the frontend public origin

Check:
- browser devtools console/network
- `api-stderr.log` or error responses mentioning `CORS origin not allowed`
- current frontend URL vs configured `ALLOWED_ORIGINS`

Fix path:
- update NSSM `AppEnvironmentExtra` so `ALLOWED_ORIGINS` includes the exact frontend origin (`scheme://host[:port]`)
- restart service
- retry browser flow

### Symptom: API health works but frontend still fails to load data

Likely causes:
- wrong `VITE_API_BASE` in the deployed frontend build
- reverse proxy/frontend pointing to the wrong API URL
- frontend/API version mismatch after partial deploy

Check:
- browser network requests target the expected API URL
- deployed frontend build uses the correct `VITE_API_BASE`
- `GET /` and `GET /chores` succeed directly against the API

Fix path:
- rebuild/redeploy frontend with correct `VITE_API_BASE`
- verify reverse proxy routing and frontend origin

### Symptom: Repeated 5xx errors during requests

Check:
- `api-stderr.log` for `unhandled error`
- `api-stdout.log` if request logging is enabled
- recent deploy/rollback/DB restore actions

Fix path:
- identify whether it is app, env, or data related
- use the operational runbooks for app rollback vs DB restore decisions:
  - `docs/windows-host-operations-runbooks.md`

## Minimal Escalation Bundle (Recommended)

When escalating an incident, capture:
- timestamp / timezone of the issue
- current service status (`Get-Service ChoreDashboardApi`)
- health endpoint result (`GET /`)
- last 100 lines of `api-stderr.log`
- last 100 lines of `api-stdout.log`
- current NSSM service config (`nssm dump ChoreDashboardApi`)
- whether a deploy/rollback/DB restore occurred just before the issue

## Cross-References

- NSSM service supervision runbook: `docs/windows-host-api-service-nssm.md`
- Deploy/rollback/recovery runbooks: `docs/windows-host-operations-runbooks.md`
- Monitoring baseline and escalation thresholds: `docs/windows-host-monitoring-baseline.md`
- Alerting/notification baseline (log-only/manual-review policy): `docs/windows-host-alerting-notification-baseline.md`
- Deployment target shape and helper: `docs/windows-host-deployment.md`
- Runtime env and deployment guidance: `README.md`
