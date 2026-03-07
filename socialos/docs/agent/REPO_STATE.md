# Repo State Handoff

- Generated: 2026-03-07T08:11:29.608Z
- Branch: detached
- Git head: 325ce0c
- Dirty working tree: true

## Canonical Chain
- `README.md` -> human and judge entrypoint
- `AGENTS.md` -> repo-level agent handoff
- `socialos/docs/AGENT_PLAYBOOK.md` -> operational instructions
- `socialos/docs/SYSTEM_MANIFEST.json` -> machine-readable source of truth
- `socialos/docs/DOCS_INDEX.md` -> cross-linked docs map

## Pitch Pack
- `socialos/docs/pitch/PITCH_5_MIN.md`
- `socialos/docs/pitch/JUDGE_BRIEF.md`
- `socialos/docs/pitch/DEMO_TALK_TRACK.md`

## Authoritative Subsystems
- ui: `socialos/apps/web/server.mjs`
- api: `socialos/apps/api/server.mjs`
- product-core: `socialos/lib/product-core.mjs`
- foundry-tasks: `socialos/lib/foundry-tasks.mjs`
- db-schema: `infra/db/schema.sql`

## Generated Docs
- `socialos/docs/STATUS.md`
- `socialos/docs/agent/REPO_STATE.md`
- `socialos/docs/evidence/LATEST_VALIDATION.md`

## Refresh Flow
- Manual: `node scripts/refresh_public_docs.mjs`
- After green validation: run with `--validation-passed` so the latest validation snapshot is refreshed.
- Overnight: `scripts/overnight_supervisor.sh` refreshes the generated docs after writing the local summary.

## Evidence Files
- `socialos/docs/evidence/sample-digest.md`
- `socialos/docs/evidence/sample-run-report.json`
- `socialos/docs/evidence/sample-run-report.md`
- `socialos/docs/evidence/socialos-demo-step01.png`
- `socialos/docs/evidence/socialos-demo-step04.png`
- `socialos/docs/evidence/socialos-demo-step08.png`
- `socialos/docs/evidence/socialos-demo.gif`

## Dirty Summary
- M scripts/tests/draft_validation_smoke.mjs
-  M socialos/apps/api/server.mjs
-  M socialos/apps/web/server.mjs
-  M socialos/docs/STATUS.md
-  M socialos/docs/agent/REPO_STATE.md
-  M socialos/docs/evidence/LATEST_VALIDATION.md

## Overnight Context
- Next focus: workspace-usability-and-demo-trust
- Reason: Repo is healthy; continue aggressive product/core polish in Workspace, Contacts, Drafts, and Queue.

## Script Entry Points
- `bash scripts/demo.sh` -> install, deploy runtime, validate safety, start public demo
- `bash scripts/demo_status.sh` -> report local demo service health
- `bash scripts/overnight_supervisor.sh` -> run the unattended outer-loop guard and write a morning-review summary
- `node scripts/refresh_public_docs.mjs` -> refresh generated public docs and evidence status after a safe run
- `bash scripts/stop_demo.sh` -> stop local demo services
- `bash scripts/test.sh` -> run full public validation suite
- `bash scripts/foundry_dispatch.sh STATUS` -> inspect and control Foundry automation
