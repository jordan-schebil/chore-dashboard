# Windows Host Restore Drill Checklist Template

Date: 2026-02-24
Scope: Phase 8 operator-facing checklist template for restore drills without engineering present

Use this template with `docs/windows-host-restore-drill-runbook.md`.

Copy this file (or the checklist block below) into your ops notes/ticket and fill it out during each restore drill.

## Restore Drill Checklist (Operator)

### Preparation

- [ ] Selected backup folder to validate
- [ ] Confirmed backup folder contains `chores.db`
- [ ] Confirmed `backup-manifest.json` is present
- [ ] Chosen isolated drill port (not production-like API port)
- [ ] Confirmed drill will use `127.0.0.1`

### Isolated Restore Setup

- [ ] Created timestamped drill workspace folder
- [ ] Restored `chores.db` into the drill workspace
- [ ] Restored `chores.db-wal` (if present)
- [ ] Restored `chores.db-shm` (if present)
- [ ] Verified restored files exist in the drill workspace

### Drill API Startup

- [ ] Started API from `C:\ChoreDashboard\app` (or equivalent deployed app dir)
- [ ] Set `HOST=127.0.0.1`
- [ ] Set `PORT=<drill-port>`
- [ ] Set `DATABASE_PATH=<drill-workspace>\chores.db`
- [ ] API started without startup errors

### Smoke Checks (Read-Only)

- [ ] `GET /` returned `status: "running"`
- [ ] `GET /chores` returned JSON array
- [ ] `GET /rooms` returned JSON array
- [ ] Optional check: `GET /completions/<today>` succeeded
- [ ] Optional check: `GET /daily-order/<today>` succeeded
- [ ] Optional helper check: `npm run health:windows-host -- -SkipServiceCheck -BaseUrl http://127.0.0.1:<drill-port>`

### Evidence Recording

- [ ] Recorded drill timestamp
- [ ] Recorded operator name
- [ ] Recorded backup folder used
- [ ] Recorded backup manifest `created_at`
- [ ] Recorded drill workspace path
- [ ] Recorded drill API URL / port
- [ ] Recorded chore and room row counts
- [ ] Recorded any errors/issues (or “none”)
- [ ] Marked final result (`PASS` / `FAIL`)

### Cleanup

- [ ] Stopped the manual drill API process
- [ ] Confirmed live NSSM service was not affected
- [ ] Retained or removed the drill workspace per local ops policy
- [ ] Filed/saved the drill record

## Drill Record Template (Copy/Paste)

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

- Restore drill runbook: `docs/windows-host-restore-drill-runbook.md`
- Backup scheduling and retention: `docs/windows-host-backup-scheduling-retention.md`
- Windows operations runbooks: `docs/windows-host-operations-runbooks.md`
