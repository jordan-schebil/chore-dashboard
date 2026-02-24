# Deployment Target Expansion Intake and Evidence Gate (Future Requests)

Date: 2026-02-24
Scope: Phase 9 intake checklist and evidence gate for future deployment target expansion requests

## Goal

Provide a lightweight, repeatable intake process for future deployment-target expansion requests (for example Linux VM) without changing the current Windows-host-only support boundary unless a new target is explicitly approved.

## Current Policy Guardrail

This intake process does **not** approve a new deployment target by itself.

Current supported deployment boundary remains:
- **Windows-host-only**

Use this document to decide whether a request is mature enough to open a future implementation phase, not to bypass the parity requirements in `docs/deployment-platform-support-boundaries.md`.

## When to Use This Intake

Use this intake whenever someone asks to support a new deployment target, including:
- Linux VM / systemd
- containerized deployment (Docker)
- orchestrated deployment (Kubernetes)
- PaaS/runtime platform targets
- alternate self-hosted target shapes not already documented

Do not use this intake for:
- improvements to the existing Windows-host runbooks/scripts
- routine bug fixes in the current supported target

## Intake Checklist (Request Readiness)

Collect this before evaluating engineering work:

### 1. Request Context

- Requested target (for example `Linux VM (systemd)`)
- Requester / owner
- Business or operational reason (why this target is needed)
- Desired timeline / deadline
- Whether Windows-host deployment is currently blocked or merely inconvenient

### 2. Target Shape Definition (High Level)

- Expected host/runtime shape (VM, container host, PaaS, etc.)
- Process supervision expectation (systemd, container restart policy, platform service, etc.)
- Storage model for SQLite (local disk path, mounted volume, unsupported)
- Frontend hosting expectation (same host vs separate static host)
- Network exposure model (reverse proxy, private network, public endpoint)

### 3. Ownership and Operations

- Who will operate the target (person/team)
- Who will receive incidents / perform restarts / restores
- Whether operators can run restore drills for the new target
- Whether the target has a stable test environment for validation

### 4. Risk and Change Impact

- New security/hardening concerns introduced by the target
- Backup/restore complexity changes vs Windows-host baseline
- Tooling gaps (service management, packaging, logs, monitoring)
- Expected support burden if added as a supported target

## Evidence Gate (Before Opening a New Implementation Phase)

A future implementation phase should not start until the request has evidence for the parity areas below.

Minimum evidence gate categories (mapped to `docs/deployment-platform-support-boundaries.md`):

### A. Startup and Supervision Evidence

Provide:
- a concrete supervision approach (for example systemd unit design)
- proposed start/stop/restart/status command model
- environment variable handoff approach

### B. Data Path and Persistence Evidence

Provide:
- explicit DB/storage path strategy
- file permission model / runtime user assumptions
- statement of whether SQLite is supported on that target shape and under what constraints

### C. Backup and Restore Operations Evidence

Provide:
- proposed scheduled backup method
- restore workflow outline
- restore drill validation approach (isolated copy or target-appropriate equivalent)

### D. Observability and Operations Evidence

Provide:
- where logs will be captured
- how operators inspect failures
- minimum monitoring/health-check approach
- alerting/notification approach (even if log-only/manual-review baseline)

### E. Deployment Automation and Release Consumption Evidence

Provide:
- how the target consumes current release artifacts (`package:release` folder/zip) or why new packaging is required
- deploy/update flow outline
- rollback path outline

### F. Validation Evidence (Required Before Support Commit)

Provide at minimum:
- one end-to-end trial run on the target (install/deploy/start/health checks)
- one backup/restore validation (or justified staged equivalent if the phase is discovery-only)
- explicit list of unsupported behaviors that remain after the trial

## Intake Outcomes (Decision States)

Use one of these outcomes after intake review:

1. `Deferred`
- Request is valid but not prioritized now
- Keep Windows-host-only support boundary unchanged

2. `Rejected / Out of Scope`
- Target does not fit current project constraints or support model
- Keep Windows-host-only support boundary unchanged

3. `Accepted for Discovery`
- Request is real, but evidence is incomplete
- Create a discovery task to gather missing evidence only (no support commitment yet)

4. `Accepted for Implementation Phase Planning`
- Evidence gate is sufficiently complete to plan a future implementation phase
- Support boundary remains unchanged until that phase is completed and approved

## Required Record for Each Request (Copy/Paste Template)

```text
Deployment Target Expansion Intake Record
- Request date:
- Requester:
- Requested target:
- Why this target is needed:
- Timeline / deadline:
- Windows-host blocked or optional:
- Proposed supervision model:
- Proposed DB/storage path model:
- Proposed backup/restore approach:
- Proposed logging/monitoring approach:
- Proposed deploy/rollback approach:
- Test environment available: yes / no
- Evidence provided (summary):
- Gaps / risks:
- Intake outcome: Deferred / Rejected / Accepted for Discovery / Accepted for Implementation Phase Planning
- Follow-up actions:
```

## What Does Not Count as Sufficient Evidence

Examples that are not enough on their own:
- “It works on my machine” without documented commands/runbook steps
- frontend-only deployment validation without API/runtime ops validation
- a running demo with no backup/restore plan
- target-specific scripts without operator runbooks
- a request to “just use Docker” without a data path and restore strategy

## Boundaries

- This document defines request intake and evidence gating only
- It does not approve or implement a new supported target
- It does not change the current Windows-host-only support policy

## Cross-References

- Deployment platform support boundaries (current policy + parity requirements): `docs/deployment-platform-support-boundaries.md`
- Phase 9 tracking: `docs/phase9-alerting-offhost-replication-expansion-readiness-checklist.md`
