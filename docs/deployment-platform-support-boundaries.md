# Deployment Platform Support Boundaries

Date: 2026-02-24
Scope: Phase 8 platform support decision and support boundary definition

## Decision (Current Support Policy)

The project remains **Windows-host-only** for now.

Supported deployment shape (current baseline):
- Windows host
- Express API supervised with NSSM
- SQLite database stored on the Windows host filesystem
- Frontend hosted separately (static hosting / reverse proxy path documented in existing Windows-host runbooks)

This is the only deployment target currently documented and supported for operational handoff.

## Why This Decision (Near-Term)

- The Windows-host path now has end-to-end operational coverage (deploy helper, service supervision, logging/diagnostics, rollback/recovery, backup scheduling, restore drills, monitoring baseline).
- Adding a second target without equivalent runbooks increases support ambiguity and incident risk.
- Phase 8 is focused on reliability and repeatability, not broadening target count.

## Explicitly Unsupported (For Now)

The following are not supported deployment targets or handoff paths at this time:
- Linux VM deployment (systemd-based service supervision)
- Docker / container image deployment
- Kubernetes / orchestrated deployment
- PaaS deployment targets (for example Railway/Render/Fly/etc.)
- Managed database replacement for SQLite as an operational target
- Multi-host or multi-node deployment topologies

Notes:
- This does not mean these targets are impossible.
- It means there is no approved runbook/automation/support commitment for them yet.

## Minimum Parity Requirements for Any Future Supported Target

Before adding a second supported deployment target, require parity in these areas:

1. Startup and supervision
- documented process/service supervision
- start/stop/restart/status commands
- environment variable handoff

2. Data path and persistence
- explicit DB/storage path layout
- file permission guidance
- backup destination expectations

3. Backup and restore operations
- scheduled backup runbook
- restore runbook and decision points
- restore drill procedure (isolated validation path)

4. Observability and operations
- logging capture locations
- troubleshooting guide
- monitoring baseline and escalation thresholds

5. Deployment automation and release consumption
- how the target consumes release artifacts (`package:release` folder/zip or target-specific packaging)
- deploy/update and rollback runbooks

6. Validation evidence
- at least one documented end-to-end validation run for the new target
- explicit statement of what remains unsupported on that target

## Review Triggers (When to Revisit This Decision)

Revisit the Windows-host-only policy if any of these become true:
- repeated demand for a second deployment target
- host constraints make Windows-host operations impractical
- a specific target (for example Linux VM) becomes a release requirement
- enough engineering time is allocated to build runbooks/automation to the parity bar above

## Cross-References

- Windows host deployment target and helper: `docs/windows-host-deployment.md`
- Windows service supervision (NSSM): `docs/windows-host-api-service-nssm.md`
- Windows operations runbooks: `docs/windows-host-operations-runbooks.md`
- Windows backup scheduling and retention: `docs/windows-host-backup-scheduling-retention.md`
- Windows restore drill runbook: `docs/windows-host-restore-drill-runbook.md`
- Windows monitoring baseline: `docs/windows-host-monitoring-baseline.md`
- Future target expansion request intake and evidence gate: `docs/deployment-target-expansion-intake-evidence-gate.md`
- Phase 8 tracking: `docs/phase8-monitoring-backup-platform-expansion-checklist.md`
