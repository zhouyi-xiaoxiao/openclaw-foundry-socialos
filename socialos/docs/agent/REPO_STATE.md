# Repo State Handoff

- Generated: 2026-03-07T23:04:13.999Z
- Branch: detached
- Git head: a682dc8
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

## Deck Surface
- Route: `/deck`
- Deck spec: `socialos/docs/pitch/VC_DECK_SPEC.md`
- Deck maintenance: `socialos/docs/pitch/DECK_MAINTENANCE.md`

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
- `socialos/docs/pitch/DECK_STATUS.json`

## Refresh Flow
- Manual: `node scripts/refresh_public_docs.mjs`
- After green validation: run with `--validation-passed` so the latest validation snapshot is refreshed.
- Overnight: `scripts/overnight_supervisor.sh` refreshes the generated docs after writing the local summary.

## Evidence Files
- `socialos/docs/evidence/hackathon-drafts-zai.json`
- `socialos/docs/evidence/hackathon-flock-triage.json`
- `socialos/docs/evidence/hackathon-glm-generate.json`
- `socialos/docs/evidence/hackathon-overview.json`
- `socialos/docs/evidence/hackathon-proof-summary.md`
- `socialos/docs/evidence/hackathon-proofs-ai-agents-for-good.json`
- `socialos/docs/evidence/hackathon-proofs-all.json`
- `socialos/docs/evidence/hackathon-proofs-animoca.json`
- `socialos/docs/evidence/hackathon-proofs-claw-for-human.json`
- `socialos/docs/evidence/hackathon-proofs-human-for-claw.json`
- `socialos/docs/evidence/hackathon-proofs-z-ai-general.json`
- `socialos/docs/evidence/hackathon-workspace-zai.json`
- `socialos/docs/evidence/sample-digest.md`
- `socialos/docs/evidence/sample-run-report.json`
- `socialos/docs/evidence/sample-run-report.md`
- `socialos/docs/evidence/socialos-demo-step01.png`
- `socialos/docs/evidence/socialos-demo-step02-contacts.png`
- `socialos/docs/evidence/socialos-demo-step04.png`
- `socialos/docs/evidence/socialos-demo-step08.png`
- `socialos/docs/evidence/socialos-demo.gif`

## Dirty Summary
- M QUEUE.md
-  M foundry/tasks/TASK-20260305210700851017.json
-  M scripts/overnight_supervisor.mjs
-  M scripts/tests/overnight_supervisor_parser_smoke.mjs
-  M socialos/docs/STATUS.md
-  M socialos/docs/agent/REPO_STATE.md
-  M socialos/docs/evidence/LATEST_VALIDATION.md
-  M socialos/docs/pitch/DECK_STATUS.json
- ?? foundry/tasks/AUTO-OPT-BLOCKED-TRIAGE.json
- ?? foundry/tasks/AUTO-OPT-DOC-DEBT.json
- ?? foundry/tasks/AUTO-OPT-OBS-DEBT.json
- ?? foundry/tasks/AUTO-OPT-PERF-DEBT.json

## Overnight Context
- Next focus: workspace-usability-and-demo-trust
- Reason: Repo is healthy; continue aggressive product/core polish in Workspace, Contacts, Drafts, and Queue.

## Script Entry Points
- `bash scripts/demo.sh` -> install, deploy runtime, validate safety, start public demo
- `bash scripts/demo_status.sh` -> report local demo service health
- `bash scripts/overnight_supervisor.sh` -> run the unattended outer-loop guard and write a morning-review summary
- `node scripts/refresh_public_docs.mjs` -> refresh generated public docs and evidence status after a safe run
- `bash scripts/hackathon_preflight.sh` -> verify record-ready demo state, capture proof snapshots, and export the public proof site
- `node scripts/capture_hackathon_proofs.mjs` -> write stable bounty proof snapshots into public evidence files
- `node scripts/export_vc_deck.mjs` -> export the public deck plus proof pages as a static site artifact for GitHub Pages
- `bash scripts/stop_demo.sh` -> stop local demo services
- `bash scripts/test.sh` -> run full public validation suite
- `bash scripts/foundry_dispatch.sh STATUS` -> inspect and control Foundry automation
