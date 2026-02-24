# Windows Host Off-Host Backup Replication (Policy + Manual Runbook)

Date: 2026-02-24
Scope: Phase 9 off-host backup replication policy and manual operator runbook for the Windows-host deployment path

## Goal

Improve recovery resilience for the Windows-host deployment by maintaining a copy of local backup folders in an off-host location (for example a network share) using a documented manual process before adding replication automation.

## Scope and Assumptions

This guide assumes:
- Local scheduled backups are already configured and working (`docs/windows-host-backup-scheduling-retention.md`)
- Local backup folders are created under `C:\ChoreDashboard\backups`
- Each backup folder includes `backup-manifest.json`
- The deployment remains Windows-host-only (`docs/deployment-platform-support-boundaries.md`)

Example paths used below:
- Local backup root: `C:\ChoreDashboard\backups`
- Off-host replication destination (example): `\\NAS01\ChoreDashboardBackups`
- Optional subfolder for this host: `\\NAS01\ChoreDashboardBackups\windows-host-01`

## Off-Host Replication Policy (Baseline)

Recommended baseline policy:

1. Keep local backups as the primary operational backup store on the host.
2. Replicate backup folders off-host **at least daily** after scheduled backups are known-good.
3. Replicate the most recent **pre-deploy backup** off-host before production-like deploy work when practical.
4. Replicate complete backup folders (including `backup-manifest.json` and SQLite sidecars if present).
5. Treat the off-host destination as a backup replica location, not an active working directory.

Why this baseline:
- Local backups are fastest for routine restores and drill work.
- Off-host copies protect against host disk loss, theft, or host-wide corruption.
- Manual replication keeps the process simple while policies are still stabilizing.

## Source-of-Truth Expectations (Local vs Off-Host)

Use these rules to avoid ambiguity during incidents:

### Local Backups (`C:\ChoreDashboard\backups`)

Local backups are the source of truth for:
- backup creation and retention operations
- day-to-day operator verification
- local restore drills
- fastest recovery when the host is still healthy

### Off-Host Replicated Backups (Network Share or Equivalent)

Off-host backups are the source of truth for:
- disaster recovery scenarios where the host or local disk is unavailable/untrusted
- confirming a secondary copy exists for recent backups

Rules:
- Do not create ad-hoc backup folders directly in the off-host destination.
- Do not edit replicated backup contents in-place.
- If local and off-host copies differ, treat the difference as a replication state issue and investigate before cleanup.

## Replication Timing and Operator Expectations

Baseline expectations:
- Daily scheduled local backup completes first
- Operator (or later automation) replicates to off-host within the same day
- Replication lag greater than 24 hours is a warning
- Replication lag during an incident is an escalation factor (covered by later Phase 9 recovery-confidence work)

## Manual Replication Runbook (Before Automation)

This runbook intentionally uses built-in Windows tools only.

### 1. Confirm Local Backup Source Health

Before replicating:
- confirm the latest local backup folder exists
- confirm `backup-manifest.json` exists in the latest backup folder
- confirm the local backup task completed successfully (Task Scheduler / `backup-task.log`)

Preview the most recent local backups:

```powershell
Get-ChildItem C:\ChoreDashboard\backups -Directory 'chore-db-*' | Sort-Object Name | Select-Object -Last 5
```

### 2. Confirm Off-Host Destination Availability

Confirm the network share (or other off-host path) is reachable and writable by the operator account.

```powershell
Test-Path \\NAS01\ChoreDashboardBackups\windows-host-01
```

If the folder does not exist (initial setup):

```powershell
New-Item -ItemType Directory -Path \\NAS01\ChoreDashboardBackups\windows-host-01 -Force | Out-Null
```

### 3. Replicate Backup Folders (Manual Copy)

Use `robocopy` to copy backup folders and preserve folder structure.

Example (replicate all backup folders under the local backup root):

```powershell
$src = 'C:\ChoreDashboard\backups'
$dst = '\\NAS01\ChoreDashboardBackups\windows-host-01'
robocopy $src $dst /E /R:2 /W:5 /NFL /NDL /NP
$code = $LASTEXITCODE
"robocopy_exit=$code"
```

`robocopy` exit code notes (practical):
- `0-7` are typically non-fatal/success-like outcomes
- `>= 8` indicates a failure condition that requires follow-up

If `robocopy` returns `>= 8`:
- treat replication as failed
- preserve console output/log
- do not assume off-host copy is current

### 4. Verify Replication Before Declaring Success

Minimum verification after copy:

1. Confirm the newest backup folder exists at the off-host destination
2. Confirm `backup-manifest.json` exists in that folder
3. Spot-check one recent replicated folder contents

Example checks:

```powershell
$latestLocal = Get-ChildItem C:\ChoreDashboard\backups -Directory 'chore-db-*' | Sort-Object Name | Select-Object -Last 1
$latestReplica = Join-Path '\\NAS01\ChoreDashboardBackups\windows-host-01' $latestLocal.Name
Test-Path $latestReplica
Test-Path (Join-Path $latestReplica 'backup-manifest.json')
Get-ChildItem $latestReplica
```

Optional stronger verification (manifest spot-check):

```powershell
Get-Content (Join-Path $latestReplica 'backup-manifest.json')
```

### 5. Record Replication Result (Operator Notes)

Record:
- date/time
- operator
- local source root
- off-host destination
- latest replicated backup folder name
- `robocopy` exit code
- verification result (`PASS` / `FAIL`)
- issues/follow-up actions

## Optional Automation (Phase 9): Replication Helper Wrapper

Phase 9 adds an optional wrapper for the manual replication flow:
- `scripts/windows-host-offhost-backup-replicate.ps1`
- `npm run backup:windows-host:replicate-offhost`

What it does:
- runs `robocopy` for the backup root
- checks `robocopy` exit code (`>= 8` treated as failure)
- verifies the latest local backup folder exists off-host
- verifies `backup-manifest.json` exists in the replicated latest folder

Dry-run example (safe command preview):

```powershell
cd C:\ChoreDashboard\app
npm run backup:windows-host:replicate-offhost -- -DryRun -LocalBackupRoot C:\ChoreDashboard\backups -ReplicaRoot \\NAS01\ChoreDashboardBackups\windows-host-01
```

Example real run:

```powershell
npm run backup:windows-host:replicate-offhost -- -LocalBackupRoot C:\ChoreDashboard\backups -ReplicaRoot \\NAS01\ChoreDashboardBackups\windows-host-01 -CreateReplicaRoot
```

Notes:
- The helper does not delete files from the off-host destination.
- Continue to record replication results in operator notes/checklists.

## Optional Off-Host Retention Policy (If Adopted)

If you choose to apply retention to the off-host destination, document it explicitly before deleting backups.

Suggested starting point (optional, not required by the baseline):
- keep more history off-host than local (example: keep 30 replicated backups)
- avoid cleanup during incidents or while replication confidence is degraded
- review off-host retention only after local retention and restore drills are stable

## Optional Automation (Phase 9): Off-Host Retention Cleanup Helper

Phase 9 adds an off-host retention cleanup wrapper (preview by default):
- `scripts/windows-host-offhost-backup-retention-cleanup.ps1`
- `npm run backup:windows-host:retention:offhost`

Example preview (keep latest 30):

```powershell
cd C:\ChoreDashboard\app
npm run backup:windows-host:retention:offhost -- -ReplicaRoot \\NAS01\ChoreDashboardBackups\windows-host-01 -KeepCount 30
```

Example apply (only after explicit policy approval and verification):

```powershell
npm run backup:windows-host:retention:offhost -- -ReplicaRoot \\NAS01\ChoreDashboardBackups\windows-host-01 -KeepCount 30 -Apply
```

Notes:
- The wrapper reuses the local retention helper logic with an off-host default path.
- Preview mode is the default; deletions require `-Apply`.

## Manual Replication Checklist (Copy/Paste)

```text
Off-Host Backup Replication Checklist
- Latest local backup folder exists:
- backup-manifest.json present locally:
- Local backup task success confirmed:
- Off-host destination reachable/writable:
- Replication command executed:
- robocopy exit code:
- Latest backup folder present off-host:
- backup-manifest.json present off-host:
- Spot-check completed:
- Result: PASS / FAIL
- Follow-up actions:
```

## Boundaries (Current Phase)

- This runbook documents **manual replication and verification only**
- Optional helper scripts exist, but manual review/verification remains the baseline
- No off-host retention cleanup policy is required by the baseline
- No push-alerting for replication failures is implemented yet (Phase 9 alerting baseline is currently log-only/manual-review)

## Cross-References

- Windows backup scheduling and retention (local backup source): `docs/windows-host-backup-scheduling-retention.md`
- Windows restore drill runbook (local restore validation): `docs/windows-host-restore-drill-runbook.md`
- Replicated-backup validation cadence and recovery-confidence decisions: `docs/windows-host-offhost-replication-validation-confidence.md`
- Windows monitoring baseline: `docs/windows-host-monitoring-baseline.md`
- Windows alerting/notification baseline: `docs/windows-host-alerting-notification-baseline.md`
- Deployment support boundaries (Windows-host-only): `docs/deployment-platform-support-boundaries.md`
- Phase 9 tracking: `docs/phase9-alerting-offhost-replication-expansion-readiness-checklist.md`
