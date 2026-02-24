# Windows Host Off-Host Replication Validation and Recovery Confidence

Date: 2026-02-24
Scope: Phase 9 replicated-backup validation cadence, confidence checks, and incident decision points for the Windows-host deployment path

## Goal

Define how operators validate that off-host replicated backups are usable and how replication state affects recovery decisions during incidents.

This guide complements:
- the off-host replication policy/runbook (`docs/windows-host-offhost-backup-replication-runbook.md`)
- the local restore drill runbook (`docs/windows-host-restore-drill-runbook.md`)

## Why This Matters

Off-host replication improves resilience only if operators can answer:
- Is the replicated copy current enough?
- Is the replicated copy structurally intact?
- Which backup source should be used right now (local vs off-host)?

Without a validation routine, replication can appear healthy while silently drifting/stalling.

## Replicated-Backup Validation Levels (Practical)

Use a staged approach so operators can do quick checks often and deeper checks less frequently.

### Level 1: Presence and Recency Check (Frequent)

Confirm:
- off-host destination is reachable
- latest local backup folder name exists off-host
- `backup-manifest.json` exists in the replicated folder
- replication lag is within policy (baseline: same day; warning if >24h)

This is the minimum ongoing confidence check.

### Level 2: Manifest Spot-Check (Periodic)

Confirm:
- replicated `backup-manifest.json` is readable
- manifest fields look sane (`created_at`, `source_db_path`, file list)
- expected files are present (`chores.db`, optional sidecars)

This validates replication completeness beyond folder-name presence.

### Level 3: Restore Confidence Check (Tied to Restore Drills)

At a defined cadence, perform a restore drill using a backup sourced from the **off-host replicated copy**, not just the local backup root.

This is the strongest confidence signal because it validates:
- replication content
- transfer completeness
- operator recovery workflow against the replicated source

## Periodic Verification Cadence (Tied to Restore Drills)

Recommended baseline:

### Daily / Per Replication Run (Lightweight)

Run Level 1 checks after manual replication (or after future automation):
- latest backup folder exists off-host
- manifest exists off-host
- replication command exit code recorded

### Weekly Operator Review

Run Level 1 + small Level 2 checks:
- compare latest local backup name vs latest off-host backup name
- confirm replication lag within policy window
- open one recent replicated `backup-manifest.json`

### Restore Drill Cadence (Quarterly or Monthly)

Tie replicated-backup validation to the existing restore drill cadence:
- at least **every second restore drill** (or at least quarterly), run the restore drill from the **off-host replicated source**
- if drills are quarterly, make at least one quarterly drill use the off-host source
- if drills are monthly, use the off-host source at least quarterly

Practical rule:
- Do not run every drill from local backups only; periodically prove the off-host copy is restorable

## Replicated-Backup Verification Checklist (Operator Copy/Paste)

```text
Replicated Backup Verification Checklist
- Off-host destination reachable:
- Latest local backup folder name:
- Latest off-host backup folder name:
- Replication lag within policy window:
- backup-manifest.json present in latest off-host backup:
- Manifest spot-check completed:
- Files present in replicated backup (chores.db / sidecars):
- Verification type: daily / weekly / restore-drill-linked
- Result: PASS / FAIL
- Follow-up actions:
```

## Off-Host Source Restore Drill Guidance (How to Apply)

When a restore drill is designated as an off-host-source drill:

1. Use the off-host replicated backup folder as the source in the restore-drill runbook.
2. Copy the replicated backup folder contents into the local drill workspace.
3. Continue the normal isolated restore drill (`docs/windows-host-restore-drill-runbook.md`).
4. Record that the drill source was **off-host replicated copy**.

This preserves the same API smoke-check steps while changing only the backup source.

## Incident Decision Points (Local Current, Off-Host Stale/Missing, and Other States)

Use this matrix during incidents.

### Case A: Local Backups Current, Off-Host Replication Stale/Missing, Host Healthy

Interpretation:
- immediate recovery may still be possible from local backups
- disaster-recovery confidence is degraded

Action:
- proceed with local backup restore/recovery if needed
- classify off-host replication gap as a parallel operational issue
- restore replication after the incident is stabilized
- document the risk window (RPO exposure if host fails before replication catches up)

### Case B: Local Backups Current, Off-Host Replication Stale/Missing, Host Suspected Compromised or Untrusted

Interpretation:
- local backups may not be trustworthy enough for disaster recovery
- stale off-host replication increases recovery risk materially

Action:
- escalate immediately
- preserve evidence and avoid destructive cleanup
- evaluate the newest trustworthy off-host copy and document expected data loss window
- treat as a recovery-confidence incident, not just a replication lag warning

### Case C: Local Backups Missing/Corrupt, Off-Host Replication Current

Interpretation:
- off-host copy becomes primary recovery source

Action:
- use off-host replicated backup for restore workflow
- follow the restore decision path in `docs/windows-host-operations-runbooks.md`
- after recovery, investigate local backup failure cause before returning to normal operations

### Case D: Local Backups Current, Off-Host Replication Current

Interpretation:
- preferred state

Action:
- use the fastest appropriate source for the incident (usually local if host is healthy)
- keep off-host copy as disaster fallback

### Case E: Local and Off-Host Both Stale or Unverified

Interpretation:
- elevated recovery risk / potential data-loss exposure

Action:
- escalate immediately
- stop risky changes/deployments until backup confidence is restored
- preserve available backups and logs
- run urgent validation on the newest available copies and document the recovery window risk

## Escalation Triggers Specific to Replication Confidence

Treat as an incident (not just routine ops cleanup) if any of these occur:
- replication lag exceeds 24h and a deploy/maintenance change is planned
- replication has failed repeatedly over multiple days
- off-host destination is unavailable during an active incident
- off-host replicated backup fails manifest/file verification
- an off-host-source restore drill fails due to backup integrity/replication issues

## Evidence to Record (Replication Confidence Events)

When a replication validation fails or an incident relies on replication-state decisions, record:
- date/time
- operator
- local latest backup folder name
- off-host latest backup folder name
- replication lag estimate
- verification type (daily/weekly/drill/incident)
- observed failure (reachability/manifest/file mismatch/restore failure)
- chosen recovery source (local vs off-host)
- expected data loss window (if applicable)
- follow-up actions

## Boundaries

- This guide does not add replication automation
- This guide does not define off-host retention cleanup policy
- This guide does not replace the restore-drill runbook; it defines how to use replicated sources within that process

## Cross-References

- Off-host backup replication policy and manual runbook: `docs/windows-host-offhost-backup-replication-runbook.md`
- Restore drill runbook (isolated restore validation): `docs/windows-host-restore-drill-runbook.md`
- Restore drill checklist template (operator-facing): `docs/windows-host-restore-drill-checklist-template.md`
- Windows monitoring baseline: `docs/windows-host-monitoring-baseline.md`
- Windows alerting/notification baseline: `docs/windows-host-alerting-notification-baseline.md`
- Windows operations runbooks (rollback/restore decisions): `docs/windows-host-operations-runbooks.md`
- Phase 9 tracking: `docs/phase9-alerting-offhost-replication-expansion-readiness-checklist.md`
