# SocialOS Agent Handoff

This repository is a public, local-first SocialOS build. Treat it as a product repo first, and a runtime/automation repo second.

## What SocialOS Is
- SocialOS is a relationship + identity operating system for capturing people, interactions, events, self signals, and turning them into follow-up actions plus platform-native draft packages.
- The current public build is a stable `P1`:
  - one unified `Workspace` home surface
  - local API + local web UI
  - SQLite-backed product memory
  - OpenClaw product runtime
  - Studio control plane for tasks, runs, agents, and policies
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

## Studio Agents
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
- Studio control plane: `socialos/lib/studio-control-plane.mjs`
- Legacy task export model: `socialos/lib/foundry-tasks.mjs`
- Generic task executor adapter: `scripts/foundry_generic_task.mjs`
- Database schema: `infra/db/schema.sql`
- Graph/linking layer: `infra/db/schema.sql` (`EventPersonLink`) + `socialos/apps/api/server.mjs` (`/graph/overview`, event-person link handlers)
- Public product docs: `socialos/docs/`
- Public machine manifest: `socialos/docs/SYSTEM_MANIFEST.json`
- Demo bootstrap and lifecycle: `scripts/demo.sh`, `scripts/demo_status.sh`, `scripts/stop_demo.sh`
- Test suite entrypoint: `scripts/test.sh`

## Required Commands Before Changes
1. `bash scripts/demo_status.sh`
2. `bash scripts/studio.sh status`
3. If changing product/runtime behavior, pause automation:
   - `bash scripts/studio.sh pause`

## Required Commands After Changes
1. Run targeted smoke tests for the subsystem you touched.
2. Run the full public validation path:
   - `bash scripts/test.sh`
3. If you paused automation and validation is green:
   - `bash scripts/studio.sh resume`

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
- VC deck route: `/deck`
- VC deck spec: `socialos/docs/pitch/VC_DECK_SPEC.md`
- Deck maintenance: `socialos/docs/pitch/DECK_MAINTENANCE.md`
- Generated repo state: `socialos/docs/STATUS.md`, `socialos/docs/agent/REPO_STATE.md`, `socialos/docs/evidence/LATEST_VALIDATION.md`
- Generated deck status: `socialos/docs/pitch/DECK_STATUS.json`
- Deck export script: `scripts/export_vc_deck.mjs`
- Pages workflow: `.github/workflows/deploy-deck.yml`

## Canonical Commands
- `bash scripts/demo.sh`
- `bash scripts/demo_status.sh`
- `bash scripts/stop_demo.sh`
- `bash scripts/overnight_supervisor.sh`
- `bash scripts/studio.sh status`
- `bash scripts/studio.sh run-once`
- `node scripts/refresh_public_docs.mjs`
- `node scripts/export_vc_deck.mjs`
- `bash scripts/test.sh`

## Overnight Supervisor
- `bash scripts/overnight_supervisor.sh` is the safe outer-loop guard for unattended iteration.
- It always begins with:
  - `bash scripts/demo_status.sh`
  - `bash scripts/studio.sh status`
- It writes a concise local morning-review summary to:
  - `reports/overnight/latest.md`
  - `reports/overnight/latest.json`
- It also refreshes generated public docs and deck-safe status files so future agents can read the current repo state from Git-tracked files.
- If the demo is unhealthy it attempts a local restart.
- If publish mode is not `dry-run` or Studio has 2+ consecutive failures, it switches to stop/stabilize mode and leaves a status summary instead of guessing.

## Generated Docs Refresh
- `node scripts/refresh_public_docs.mjs` updates generated public docs only.
- It also refreshes `socialos/docs/pitch/DECK_STATUS.json` for the public VC deck.
- Use `node scripts/export_vc_deck.mjs` after the deck route is healthy if you need a static artifact for GitHub Pages or another host.
- It must not rewrite curated contract docs such as:
  - `README.md`
  - `AGENTS.md`
  - `socialos/docs/PRODUCT.md`
  - `socialos/docs/ARCHITECTURE.md`
- It must not rewrite curated pitch docs such as:
  - `socialos/docs/pitch/PITCH_5_MIN.md`
  - `socialos/docs/pitch/VC_DECK_SPEC.md`
- Generated docs are additive handoff surfaces, not the primary product spec.
