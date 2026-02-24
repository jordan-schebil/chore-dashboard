# Phase 6: Deployment Automation and Packaging Checklist

Date: 2026-02-23
Status: Completed

## Goal
Add repeatable deployment automation and packaging helpers so release handoff and deployment-like setup require fewer manual steps and produce consistent artifacts.

## Entry Criteria (Met)
- Phase 5 release readiness is complete (release checklist, backup/recovery runbook, deployment/runtime guidance, maintenance standards).
- Local verification command exists (`npm run verify:release`).
- Local DB backup helper exists (`npm run db:backup`).

## Phase 6 Focus Areas

### 1. Release Artifact Packaging
- [x] Add a local packaging script that creates a staged release artifact folder (`scripts/package-release.mjs`, `package.json` -> `package:release`)
- [x] Document the packaging workflow and artifact contents (`README.md`)
- [x] Validate `npm run package:release` locally (dry run + real artifact creation on 2026-02-23)
- [x] Add optional archive/compression step (zip) for Windows handoff (`scripts/zip-release-artifact.ps1`, `package.json` -> `package:release:zip`)

Validation record (2026-02-23):
- `node --check scripts/package-release.mjs` passed
- `npm run package:release -- --dry-run` passed
- `npm run package:release` created `release-artifacts/chore-dashboard-v1.0.0-20260223-203803`
- Verified artifact contains `dist/`, `server/`, `package.json`, `package-lock.json`, Windows launcher scripts, and `release-manifest.json`
- `npm run package:release:zip -- -DryRun` passed
- `npm run package:release:zip` created `release-artifacts/chore-dashboard-v1.0.0-20260223-203803.zip` (`322602` bytes)

### 2. Deployment Automation (Local / Self-Hosted)
- [x] Define a deployment target shape for documentation examples (Windows host) (`docs/windows-host-deployment.md`)
- [x] Add deployment helper script for the chosen target (copy/install/optional start) (`scripts/deploy-windows-host.ps1`, `package.json` -> `deploy:windows-host`)
- [x] Add a post-deploy smoke checklist (health endpoint + UI/API connectivity) (`docs/windows-host-deployment.md`)

Validation record (2026-02-23):
- `npm run deploy:windows-host -- -DryRun` passed (latest artifact auto-detected)
- `npm run deploy:windows-host -- -TargetRoot .\deployments\windows-host-phase6-test -SkipInstall` passed
- Verified local deployed layout contains `app/`, `data/`, and `deploy-manifest.json`
- Verified deployed `app/` contains `dist/`, `server/`, package files, and launcher scripts

### 3. Environment and Config Templates
- [x] Add `.env.example` (backend + frontend examples) for deployment-like setup (`.env.example`)
- [x] Add a production-like env template example (or documented sample values) for operators (`.env.example`, `README.md`)
- [x] Document config handoff expectations for separate frontend/API hosting (`README.md`)

### 4. Optional CI Release Automation
- [x] Build and upload release artifacts in CI for tagged releases (`.github/workflows/release-artifacts.yml`)
- [x] Generate checksum in CI and document the source of truth (`.github/workflows/release-artifacts.yml`, `README.md`)

Validation note (2026-02-23):
- Workflow file added and reviewed locally; live GitHub validation requires a tag push (`v*`) or manual `workflow_dispatch` run

## Immediate Next Step (Recommended)
Phase 6 is complete. Next step: either start Phase 7 planning (deployment ops / service supervision), or run one tagged release CI trial in GitHub to validate the new workflow end-to-end.
