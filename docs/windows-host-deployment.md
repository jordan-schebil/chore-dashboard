# Windows Host Deployment (Self-Hosted)

Date: 2026-02-23
Scope: Phase 6 deployment target shape (documentation + local helper script)

## Target Shape

This target assumes:
- A single Windows host runs the Express API process.
- Frontend static files (`dist/`) are hosted separately (for example IIS or another static file host on the same machine).
- The SQLite database file is stored outside the app deployment folder so app redeploys do not overwrite data.

Suggested directory layout on the host:

```text
C:\ChoreDashboard\
|-- app\                 # deployed artifact contents (server/, dist/, package.json, etc.)
|-- data\
|   `-- chores.db        # runtime SQLite DB (persistent)
`-- deploy-manifest.json # written by helper script
```

## Deployment Helper Script

Use the helper after creating a release artifact with `npm run package:release`.

Command:

```powershell
npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard -ArtifactDir .\release-artifacts\<artifact-folder>
```

Behavior:
- Validates the release artifact layout
- Creates `app/` and `data/` under the target root
- Moves any existing `app/` folder to a timestamped `app.previous.<timestamp>` backup
- Copies the artifact into `app/`
- Runs `npm ci --omit=dev` in the deployed app folder (unless `-SkipInstall`)
- Writes `deploy-manifest.json`
- Optionally starts the API in a new PowerShell window (`-StartApi`)

Common options:
- `-TargetRoot <path>`: target deployment root (default: `.\deployments\windows-host`)
- `-ArtifactDir <path>`: explicit artifact folder (default: latest under `release-artifacts/`)
- `-SkipInstall`: skip `npm ci --omit=dev` (useful for local copy-only validation)
- `-StartApi`: launch the API after deploy
- `-BindHost <host>` / `-Port <port>`: values used if `-StartApi` is provided
- `-DryRun`: print planned actions without copying files

Examples:

```powershell
# Dry run against the latest local artifact
npm run deploy:windows-host -- -DryRun

# Deploy to a real host path and install runtime dependencies
npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard

# Deploy and start the API bound to localhost:8000
npm run deploy:windows-host -- -TargetRoot C:\ChoreDashboard -StartApi -BindHost 127.0.0.1 -Port 8000
```

## Post-Deploy Smoke Checklist

Run this after deployment (and after starting the API / static frontend host):

1. API health
- `GET /` returns `status: "running"`

2. API data connectivity
- `GET /chores` returns chore data (non-empty list on a seeded/new DB, or expected rows on an existing DB)
- `GET /rooms` returns without server error

3. Frontend/API wiring
- Frontend loads in the browser
- Dashboard renders chore data
- A completion toggle succeeds and persists after reload (on non-production test data or after backup)

4. Logging / runtime checks
- Confirm startup logs show expected bind address and DB path
- Confirm no CORS errors in the browser console for the configured frontend origin

## Notes

- The helper script does not configure IIS, reverse proxies, or Windows service management.
- The helper script does not package or deploy `chores.db`; use the Phase 5 backup/restore workflow for data safety.
- For Windows API service supervision (NSSM runbook), see `docs/windows-host-api-service-nssm.md`.
- For operational deploy/rollback/recovery runbooks, see `docs/windows-host-operations-runbooks.md`.
- For logging policy and troubleshooting, see `docs/windows-host-logging-diagnostics.md`.
- For Windows host hardening and safety baseline guidance, see `docs/windows-host-hardening-safety.md`.
