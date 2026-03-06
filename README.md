# SocialOS Runtime (Foundry Autopilot)

Local-first SocialOS workspace for:
- Quick Capture -> People -> Events/Campaigns -> Drafts -> Queue/Publish -> Self Mirror
- 7-platform content packages
- Foundry generic task intake + dev digest + loopback-only ops surface
- OpenClaw multi-agent runtime profile (`socialos`)

## One-command reproducible demo
```bash
bash scripts/demo.sh
```

`bash scripts/demo.sh` is the canonical bootstrap path for this repo. It will:
1. Install dependencies and initialize SQLite with demo seed data.
2. Deploy the `socialos` runtime profile to the local OpenClaw profile.
3. Run the runtime policy smoke so safety rails are checked before demoing.
4. Start local API + Web and print the demo URLs/runbook.

## What Is Implemented Now (stable P1)
- `Quick Capture`: two-stage parse -> commit flow, plus audio note / business card asset intake.
- `People`: search, detail view, identities, timeline, evidence, follow-up suggestion.
- `Events & Campaigns`: structured event form with audience/language/tone/links/assets.
- `Drafts`: 7-platform draft generation, plain-text editing, validation, queue handoff.
- `Queue / Publish`: `queued -> manual_step_needed -> posted|failed`, assisted publish packages, manual result write-back.
- `Self Mirror`: structured weekly mirror with themes, energizers, drainers, conclusions, and evidence drill-down.
- `Settings`: Foundry task intake, runtime controls, llm-task health, supported scopes, Codex/Foundry split.

## Quickstart
```bash
git clone <this-repo>
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/demo.sh
```

## Demo runbook
- Canonical demo flow: `socialos/docs/DEMO_SCRIPT.md`
- One automation pass: `bash scripts/devloop_once.sh`
- Dispatcher control: `bash scripts/foundry_dispatch.sh <COMMAND>`
- Status + latest digest: `bash scripts/status.sh`
- Full validation suite: `bash scripts/test.sh`

When the queue has no pending product tasks, devloop auto-switches to `AUTO-OPT-*` lanes instead of idle looping.

## Safety defaults (must remain local-first)
- API exposure remains loopback-only (`127.0.0.1`).
- Default publish mode is `dry-run`.
- Live publish still requires explicit multi-gate enablement (env + UI intent + credentials).
- High-frequency automation jobs stay no-deliver.
- Do **not** widen `gateway.bind` / `gateway.tailscale` / `gateway.auth` exposure in demo setup.

## Product workflow
1. Open `http://127.0.0.1:4173/quick-capture` and parse a note or upload a business card/audio memo.
2. Commit the structured draft into Person / Identity / Interaction / SelfCheckin / Audit.
3. Use `People` to inspect evidence and log follow-up context.
4. Create an `Event`, then generate 7-platform drafts from `Drafts`.
5. Validate/edit drafts, queue them, and record manual publish outcomes in `Queue`.
6. Generate and inspect weekly evidence-backed synthesis in `Self Mirror`.

## Key endpoints
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

## Daily operations
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

## Runtime profile
- Source config: `socialos/openclaw/runtime.openclaw.json5`
- Deploy to local profile: `./scripts/deploy_runtime.sh`

## Product docs
- `socialos/docs/PRODUCT.md`
- `socialos/docs/ARCHITECTURE.md`
- `socialos/docs/DEMO_SCRIPT.md`
- `socialos/docs/SAFETY.md`
- `socialos/docs/EMBEDDINGS.md`
- `socialos/docs/AUTH.md`
