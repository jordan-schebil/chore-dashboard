# Windows Host Hardening and Safety Baseline

Date: 2026-02-24
Scope: Phase 7 baseline safeguards for Windows-host deployments (Express API + separately hosted frontend)

## Purpose

This is a practical baseline, not a full security hardening standard.

It exists to reduce the highest-risk operator mistakes for this project:
- exposing the unauthenticated API directly to untrusted networks
- running the API with overly broad host/process privileges
- storing runtime config/secrets in ad hoc or version-controlled locations
- deploying without basic firewall and binding controls

## Critical Warning (No Auth API)

The Express API currently has **no authentication or authorization**.

Operational implication:
- Do **not** expose the API directly to untrusted networks or the public internet.
- Prefer `HOST=127.0.0.1` behind a same-host reverse proxy/static frontend host.
- If direct exposure is unavoidable in a private network, restrict access via firewall and network segmentation.

## Bind Address Baseline

Recommended default:
- `HOST=127.0.0.1`

Why:
- Limits API reachability to the local machine
- Reduces accidental network exposure
- Fits the documented Windows-host deployment shape (frontend static hosting + reverse proxy on the same host)

Use `HOST=0.0.0.0` only when:
- you intentionally need remote network access to the API
- firewall rules are configured explicitly
- operators understand the no-auth risk

## Windows Firewall Baseline

Recommended baseline:
- If using `HOST=127.0.0.1`, avoid broad inbound allow rules for the API port
- If using `HOST=0.0.0.0`, create a narrow inbound rule limited to:
  - the required port (for example `8000`)
  - expected source IPs/subnets only
  - the expected network profile(s)

Operational rule:
- Treat a firewall exception for the API port as a deliberate change requiring operator review

## Runtime Account Recommendation (Non-Admin)

Recommended:
- Run the API service under a dedicated non-admin Windows account (local or managed service account), when operationally feasible

Why:
- Limits impact of process compromise or operator mistakes
- Reduces unintended access to unrelated host resources

Minimum expectations for the runtime account:
- Read/execute access to `C:\ChoreDashboard\app`
- Read/write access to `C:\ChoreDashboard\data`
- Read/write access to `C:\ChoreDashboard\logs`
- No local administrator membership unless there is a documented exception

If running as Local System / admin temporarily:
- document why
- define a migration plan to a constrained service account

## File/Directory Permissions Baseline

Recommended layout permissions (conceptual baseline):
- `C:\ChoreDashboard\app`:
  - writable by deploy operators
  - readable/executable by the API runtime account
- `C:\ChoreDashboard\data`:
  - writable by the API runtime account
  - restricted from broad interactive-user access where possible
- `C:\ChoreDashboard\logs`:
  - writable by the API runtime account
  - readable by operators/support personnel

Avoid:
- granting `Everyone` full control
- storing DB/logs under user profile folders if the service runs under a different account

## Config and Secrets Placement (NSSM + Windows Host)

For this project, the primary runtime config values are:
- `HOST`
- `PORT`
- `DATABASE_PATH`
- `ALLOWED_ORIGINS`
- logging flags (`LOG_REQUESTS`, `LOG_REQUEST_BODIES`, `LOG_REQUEST_BODY_MAX_CHARS`)

These are **configuration values**, not secrets, but they still affect security posture.

Recommended placement:
- Store API runtime env values in NSSM service config (`AppEnvironmentExtra`) for the supervised API process
- Treat NSSM service configuration as the source of truth for runtime API env on the host
- Document the current configured values in operator runbooks/change tickets when modified

Frontend/API handoff values:
- `VITE_API_BASE` is a frontend build/runtime value and belongs with frontend deployment config/build inputs, not the API service env

If secrets are introduced later (for example auth tokens, SMTP creds, third-party API keys):
- do not commit them to repo files (`.env`, `.env.example`, docs)
- do not hardcode them in scripts
- prefer a Windows host secret store / protected deployment-variable mechanism appropriate to your environment
- restrict access to service config and deployment tooling to operators only

## Baseline Reverse Proxy / Hosting Safety Assumptions

If hosting frontend static assets and reverse proxying to the API on the same host:
- keep the API on `127.0.0.1`
- expose only the frontend/proxy listener publicly
- ensure the proxy forwards requests only to the intended local API port
- set `ALLOWED_ORIGINS` to the frontend public origin (not the proxy-to-API local target)

## Operator Change Safety Checklist (Quick)

Before changing API bind/firewall/service env:
- confirm reason for change
- back up DB if the change is part of a deploy/update
- record current NSSM service config (`nssm dump ChoreDashboardApi`)
- apply one change at a time (env, deploy, firewall) where possible
- validate with API health and frontend/API smoke checks after each change window

## What This Baseline Does Not Cover

- IIS hardening specifics
- TLS certificate management
- Windows patching policy / EDR / enterprise hardening controls
- centralized log shipping/SIEM integration
- formal secret management platform selection

Those can be added in later phases if this deployment path becomes a long-lived production target.

## Cross-References

- Windows deployment target/helper: `docs/windows-host-deployment.md`
- NSSM service supervision: `docs/windows-host-api-service-nssm.md`
- Logging and diagnostics: `docs/windows-host-logging-diagnostics.md`
- Operational runbooks (deploy/rollback/recovery): `docs/windows-host-operations-runbooks.md`
