# SocialOS Agent Handoff

This repository is a public, local-first SocialOS build. Treat it as a product repo first, and a runtime/automation repo second.

## What SocialOS Is
- SocialOS is a relationship + identity operating system for capturing people, interactions, events, self signals, and turning them into follow-up actions plus platform-native draft packages.
- The current public build is a stable `P1`:
  - one unified `Workspace` home surface
  - local API + local web UI
  - SQLite-backed product memory
  - OpenClaw product runtime
  - Foundry execution cluster for devloop and generic tasks
- The public repo is intentionally generic. Specific bounty mappings can be layered on top later without changing the product loop.

## Safe Defaults
- Local-first only
- Loopback-only API/web exposure
- Default publish mode: `dry-run`
- No widening of `gateway.bind`, `gateway.tailscale`, or `gateway.auth`
- No secrets, auth profiles, live SQLite state, or rolling reports in Git

## Product Runtime Agents
- `orchestrator`: routes capture/search/campaign/self requests
- `people-memory`: owns person memory updates
- `self-model`: owns check-ins and mirror synthesis
- `compliance`: owns draft validation and risk checks
- `publisher`: owns publish queue and assisted handoff

Authoritative file:
- `socialos/openclaw/runtime.openclaw.json5`

## Foundry Agents
- `forge_orchestrator`
- `forge_coder`
- `forge_tester`
- `forge_reviewer`

Authoritative file:
- `foundry/openclaw.foundry.json5`

## Authoritative Files By Subsystem
- UI shell and routes: `socialos/apps/web/server.mjs`
- API contracts and persistence: `socialos/apps/api/server.mjs`
- Product heuristics: `socialos/lib/product-core.mjs`
- Foundry structured task model: `socialos/lib/foundry-tasks.mjs`
- Generic task executor: `scripts/foundry_generic_task.mjs`
- Database schema: `infra/db/schema.sql`
- Public product docs: `socialos/docs/`
- Public machine manifest: `socialos/docs/SYSTEM_MANIFEST.json`
- Demo bootstrap and lifecycle: `scripts/demo.sh`, `scripts/demo_status.sh`, `scripts/stop_demo.sh`
- Test suite entrypoint: `scripts/test.sh`

## Required Commands Before Changes
1. `bash scripts/demo_status.sh`
2. `bash scripts/foundry_dispatch.sh STATUS`
3. If changing product/runtime behavior, pause automation:
   - `bash scripts/foundry_dispatch.sh PAUSE_DEVLOOP`

## Required Commands After Changes
1. Run targeted smoke tests for the subsystem you touched.
2. Run the full public validation path:
   - `bash scripts/test.sh`
3. If you paused automation and validation is green:
   - `bash scripts/foundry_dispatch.sh RESUME_DEVLOOP`

## Public Evidence Rules
- Curate public evidence into `socialos/docs/evidence/`
- Do not commit:
  - `infra/db/socialos.db`
  - `reports/LATEST.md`
  - rolling `reports/runs/*`
  - runtime/auth state
  - local logs or pid files
- If a run is worth preserving publicly, copy a representative snapshot into `socialos/docs/evidence/` and reference it from `socialos/docs/EVIDENCE.md`

## What Must Not Change Casually
- Loopback-only network posture
- Default `dry-run` publish mode
- Publisher-only high-risk action boundaries
- Runtime auth profiles or local credentials
- Gateway exposure settings
- Machine-readable manifest shape without updating tests and docs together

## Where To Start
- Human overview: `README.md`
- Public product shape: `socialos/docs/PRODUCT.md`
- Public architecture: `socialos/docs/ARCHITECTURE.md`
- Agent operator playbook: `socialos/docs/AGENT_PLAYBOOK.md`
- Machine-readable system map: `socialos/docs/SYSTEM_MANIFEST.json`
- Full doc map: `socialos/docs/DOCS_INDEX.md`
- Pitch pack: `socialos/docs/pitch/`
- Generated repo state: `socialos/docs/STATUS.md`, `socialos/docs/agent/REPO_STATE.md`, `socialos/docs/evidence/LATEST_VALIDATION.md`

## Canonical Commands
- `bash scripts/demo.sh`
- `bash scripts/demo_status.sh`
- `bash scripts/stop_demo.sh`
- `bash scripts/overnight_supervisor.sh`
- `node scripts/refresh_public_docs.mjs`
- `bash scripts/test.sh`

## Overnight Supervisor
- `bash scripts/overnight_supervisor.sh` is the safe outer-loop guard for unattended iteration.
- It always begins with:
  - `bash scripts/demo_status.sh`
  - `bash scripts/foundry_dispatch.sh STATUS`
- It writes a concise local morning-review summary to:
  - `reports/overnight/latest.md`
  - `reports/overnight/latest.json`
- It also refreshes generated public docs so future agents can read the current repo state from Git-tracked files.
- If the demo is unhealthy it attempts a local restart.
- If publish mode is not `dry-run` or Foundry has 2+ consecutive failures, it switches to stop/stabilize mode and leaves a status summary instead of guessing.

## Generated Docs Refresh
- `node scripts/refresh_public_docs.mjs` updates generated public docs only.
- It must not rewrite curated contract docs such as:
  - `README.md`
  - `AGENTS.md`
  - `socialos/docs/PRODUCT.md`
  - `socialos/docs/ARCHITECTURE.md`
- Generated docs are additive handoff surfaces, not the primary product spec.
