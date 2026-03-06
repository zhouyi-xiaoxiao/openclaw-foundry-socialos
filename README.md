# SocialOS Runtime (Foundry Autopilot)

## Project Overview
SocialOS is a local-first social operating system for turning messy relationship notes and campaign ideas into something a solo builder can actually run. The product flow is:

`Quick Capture -> People -> Events/Campaigns -> Drafts -> Queue/Publish -> Self Mirror`

What the current stable P1 build already does:
- `Quick Capture` is now a chat-like composer instead of a control-panel wall. You can type one message, record a voice note, or upload a business card image.
- Audio intake is optional-OpenAI powered when `OPENAI_API_KEY` is present, and still usable with manual transcript fallback when it is not.
- `People` supports search, detail view, linked identities, evidence-backed timeline, and follow-up suggestions.
- `Drafts` generates platform-native packages: English-first for `X / LinkedIn / Instagram`, Chinese-first for `知乎 / 小红书 / 微信朋友圈 / 微信公众号`.
- `Queue / Publish` supports assisted publishing with copy-ready packages, platform entry links, and manual outcome write-back.
- `Self Mirror` generates a structured weekly synthesis with evidence drill-down.
- `Settings` exposes Foundry task intake, runtime controls, and the Codex/Foundry execution split.

## Setup & Installation
```bash
git clone <this-repo>
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/demo.sh
```

`bash scripts/demo.sh` is the canonical bootstrap path. It will:
1. Install dependencies and initialize SQLite with demo seed data.
2. Deploy the `socialos` runtime profile to the local OpenClaw profile.
3. Run the runtime policy smoke so safety rails are checked before demoing.
4. Start local API + Web and print the demo URLs/runbook.

Local URLs after boot:
- Web: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:8787`

## Architecture Overview
- Frontend: loopback-only Node dashboard in `socialos/apps/web`
- API: local Node service in `socialos/apps/api`
- Database: SQLite at `infra/db/socialos.db`
- Runtime: OpenClaw multi-agent profile `socialos/openclaw/runtime.openclaw.json5`
- Automation: Foundry devloop + generic task executor + digest/run reports

System design, at a glance:
1. User captures a note, voice memo, or business card.
2. API parses it into structured `Person / Identity / Interaction / SelfCheckin` data.
3. Events feed the 7-platform draft generator.
4. Drafts are validated, edited, and handed into assisted publishing.
5. Queue writes audit logs and manual publish outcomes.
6. Self Mirror reads recent evidence and produces weekly synthesis.

## OpenClaw / Runtime Integration
This project is built around an OpenClaw-powered workflow:
- OpenClaw acts as the local multi-agent runtime.
- Foundry is the first-layer execution cluster for devloop, generic tasks, verification, and digest generation.
- SocialOS uses OpenClaw-style runtime isolation to keep publisher actions gated and local-first.
- High-risk publish actions remain `dry-run` by default and require explicit gates before live execution.

Why that matters for the current generic build:
- The product is not just a static dashboard. It demonstrates a real OpenClaw-backed system that captures, structures, generates, validates, and operationalizes content workflows.
- The integration is visible in product UX, runtime configuration, and the local automation layer.
 - Specific bounty mapping can be layered on top later without changing the product loop itself.

## Demo Runbook
- Canonical demo flow: `socialos/docs/DEMO_SCRIPT.md`
- One automation pass: `bash scripts/devloop_once.sh`
- Dispatcher control: `bash scripts/foundry_dispatch.sh <COMMAND>`
- Status + latest digest: `bash scripts/status.sh`
- Full validation suite: `bash scripts/test.sh`

When the queue has no pending product tasks, devloop auto-switches to `AUTO-OPT-*` lanes instead of idle looping.

## Safety Defaults
- API exposure remains loopback-only (`127.0.0.1`).
- Default publish mode is `dry-run`.
- Live publish still requires explicit multi-gate enablement (env + UI intent + credentials).
- High-frequency automation jobs stay no-deliver.
- Do **not** widen `gateway.bind` / `gateway.tailscale` / `gateway.auth` exposure in demo setup.

## Product Workflow
1. Open `http://127.0.0.1:4173/quick-capture` and parse a note or upload a business card/audio memo.
2. Commit the structured draft into Person / Identity / Interaction / SelfCheckin / Audit.
3. Use `People` to inspect evidence and log follow-up context.
4. Create an `Event`, then generate 7-platform drafts from `Drafts` using platform-native language by default.
5. Validate/edit drafts, queue them, and record manual publish outcomes in `Queue`.
6. Generate and inspect weekly evidence-backed synthesis in `Self Mirror`.

## Key Endpoints
- `POST /capture/parse`
- `POST /capture/commit`
- `POST /capture/assets`
- `GET /people/:id`
- `PATCH /drafts/:id`
- `POST /drafts/:id/validate`
- `POST /publish/approve`
- `POST /publish/complete`
- `GET /self-mirror`
- `GET /self-mirror/evidence`

## Daily Operations
```bash
./scripts/foundry_dispatch.sh STATUS
./scripts/foundry_dispatch.sh PAUSE_DEVLOOP
./scripts/foundry_dispatch.sh RESUME_DEVLOOP
./scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE
./scripts/foundry_dispatch.sh SET_PUBLISH_MODE:dry-run
./scripts/status.sh
./scripts/test.sh
./scripts/bench_embeddings.sh
```

Recommended working loop:
1. `PAUSE_DEVLOOP` before feature work.
2. Run targeted smoke checks while implementing.
3. Run `bash scripts/test.sh`.
4. `RESUME_DEVLOOP` after green verification.

## Runtime Profile
- Source config: `socialos/openclaw/runtime.openclaw.json5`
- Deploy to local profile: `./scripts/deploy_runtime.sh`

## Product Docs
- `socialos/docs/PRODUCT.md`
- `socialos/docs/ARCHITECTURE.md`
- `socialos/docs/DEMO_SCRIPT.md`
- `socialos/docs/SAFETY.md`
- `socialos/docs/EMBEDDINGS.md`
- `socialos/docs/AUTH.md`
