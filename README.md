# SocialOS

[![CI](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml/badge.svg)](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml)
[![Demo Docs](https://img.shields.io/badge/docs-demo-blue)](socialos/docs/DEMO_SCRIPT.md)
[![Architecture](https://img.shields.io/badge/docs-architecture-blue)](socialos/docs/ARCHITECTURE.md)
[![Evidence](https://img.shields.io/badge/docs-evidence-blue)](socialos/docs/EVIDENCE.md)
[![Pitch Pack](https://img.shields.io/badge/docs-pitch-blue)](socialos/docs/pitch/PITCH_5_MIN.md)
[![VC Deck](https://img.shields.io/badge/deck-vc_pitch-blue)](socialos/docs/pitch/VC_DECK_SPEC.md)

SocialOS is a local-first relationship and identity operating system. It turns messy real-world input into structured people memory, event context, platform-native drafts, trust-first queue handoff, and evidence-backed reflection.

This repo now supports two equally important entry paths:

- `quick demo reproduction` for judges, reviewers, and curious GitHub visitors
- `reusable local workspace` for builders who want to adapt SocialOS on their own machine

The hosted site at [zhouyixiaoxiao.org](https://zhouyixiaoxiao.org/) is the public proof surface. The real interactive product remains loopback-only and local-first.

## Start Here

### Watch / verify

If you want the fastest public overview first:

- [Pitch site / deck](https://zhouyixiaoxiao.org/)
- [Canonical bounty hub](https://zhouyixiaoxiao.org/hackathon/)
- [Claw for Human video](https://zhouyixiaoxiao.org/videos/claw-for-human/)
- [Human for Claw video](https://zhouyixiaoxiao.org/videos/human-for-claw/)
- [Z.AI General video](https://zhouyixiaoxiao.org/videos/z-ai-general/)
- [AI Agents for Good video](https://zhouyixiaoxiao.org/videos/ai-agents-for-good/)
- [Animoca video](https://zhouyixiaoxiao.org/videos/animoca/)

### Clone / run / reuse

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
bash scripts/quickstart.sh
bash scripts/provider_doctor.sh
```

Start a blank personal workspace instead of the seeded demo:

```bash
bash scripts/quickstart.sh --profile local
```

### What runs without any API keys

- local web app
- local API
- seeded demo dataset
- local embeddings fallback
- core relationship-memory workflow

### What API keys unlock

- `OPENAI_API_KEY` -> better embeddings plus optional voice transcription/refinement
- `GLM_API_KEY` -> live Z.AI route and GLM-backed generation
- `FLOCK_API_KEY` -> live SDG triage
- `TELEGRAM_*` -> optional Telegram volunteer channel for multi-channel follow-through

### Recommended first run

- `bash scripts/quickstart.sh`
- `bash scripts/provider_doctor.sh`
- `bash scripts/quickstart.sh --profile local`

## Project Overview

SocialOS already supports:

- structured people memory and identity linkage
- event context and reusable follow-up history
- platform-native draft generation
- trust-first queue handoff before publishing
- evidence-backed reflection loops
- judge-facing proof routes without exposing the full local runtime publicly

## Quickstart

Clone the repo and run the default demo profile with one command:

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
bash scripts/quickstart.sh
```

That command will:

- verify `node`, `python3`, and `sqlite3`
- create `.env.local` if needed
- initialize the profile-specific SQLite database
- seed the demo profile
- start the local API and web app
- print the exact URLs to open

Then inspect optional provider setup:

```bash
bash scripts/provider_doctor.sh
```

If you want your own blank workspace instead of the seeded demo:

```bash
bash scripts/quickstart.sh --profile local
```

## What You Get Locally

After quickstart, you have:

- a local web app at `http://127.0.0.1:4173/quick-capture`
- a local API at `http://127.0.0.1:8787/health`
- a reusable relationship-memory workflow for people, events, drafts, queue handoff, and reflection
- a separate demo DB and local DB so demo resets do not overwrite personal data

## Setup & Installation

Current prerequisites:

- macOS or Linux
- Node 22 or newer
- `sqlite3`
- `python3`

Recommended first run:

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/quickstart.sh
```

Current environment defaults live in `.env.example`. Profile selection and DB routing are usually managed automatically through `.env.local`.

API onboarding and optional live-provider setup are documented in:

- [socialos/docs/API_SETUP.md](socialos/docs/API_SETUP.md)
- [socialos/docs/REUSE_SOCIALOS.md](socialos/docs/REUSE_SOCIALOS.md)
- [socialos/docs/EMBEDDINGS.md](socialos/docs/EMBEDDINGS.md)

Secondary lifecycle commands:

```bash
# Demo-first bootstrap with runtime validation
bash scripts/demo.sh

# Health check
bash scripts/demo_status.sh

# Judge-day preflight
bash scripts/hackathon_preflight.sh

# Full test suite
bash scripts/test.sh

# Stop local services
bash scripts/stop_demo.sh

# Check optional providers and feature unlocks
bash scripts/provider_doctor.sh

# Capture fresh hackathon proofs
node scripts/capture_hackathon_proofs.mjs

# Export the static deck/public site
node scripts/export_vc_deck.mjs

# Refresh generated public docs
node scripts/refresh_public_docs.mjs
```

## Run the Demo Profile

Use the seeded review/demo workspace when you want the hackathon-ready state:

```bash
bash scripts/quickstart.sh
```

Reset the seeded demo profile if you want to replay the canonical walkthrough from a clean state:

```bash
bash scripts/quickstart.sh --profile demo --reset-demo
```

The demo profile uses:

- DB: `infra/db/socialos.demo.db`
- Routes: `/quick-capture`, `/demo`, `/hackathon`, `/buddy`

## Start Your Own Local Workspace

Use the blank profile when you want to reuse SocialOS for yourself instead of the review demo:

```bash
bash scripts/quickstart.sh --profile local
```

The local profile uses:

- DB: `infra/db/socialos.local.db`
- the same local app and API
- no automatic demo seeding

This keeps your own notes, contacts, and follow-up history separate from the public demo dataset.

More reuse notes live in [socialos/docs/REUSE_SOCIALOS.md](socialos/docs/REUSE_SOCIALOS.md).
API setup guidance lives in [socialos/docs/API_SETUP.md](socialos/docs/API_SETUP.md).
Embeddings behavior is documented in [socialos/docs/EMBEDDINGS.md](socialos/docs/EMBEDDINGS.md).

## Architecture Overview

Core system shape:

- Frontend: loopback-only Node web app in `socialos/apps/web`
- API: loopback-only Node service in `socialos/apps/api`
- Database: profile-managed SQLite under `infra/db/`
- Runtime: OpenClaw product profile in `socialos/openclaw/runtime.openclaw.json5`
- Control plane: Studio task, run, agent, and policy layer in SQLite and `foundry/`

System design:

1. A user sends one raw note, voice memo, or image into `Workspace`.
2. The API extracts reusable people memory, event context, and self signals.
3. The same memory powers `Contacts`, `Logbook`, and fuzzy recall.
4. Events flow into multilingual, platform-native draft generation.
5. Drafts move through validation and trust-first queue handoff.
6. `Self Mirror` closes the loop with evidence-backed reflection.

Hackathon overlay:

- `/demo` is the shared product walkthrough and `Claw for Human` route.
- `/hackathon` is the canonical bounty hub and proof matrix.
- `/buddy` is the `Human for Claw` safe-mode route.
- `GET /hackathon/overview` returns bounty metadata used by the hub.
- `GET /proofs` returns structured proof cards.
- `POST /integrations/glm/generate` captures the live `Z.AI General` proof path.
- `POST /integrations/flock/sdg-triage` captures the live `AI Agents for Good` proof path.
- `GET /integrations/telegram/status` and `POST /integrations/telegram/send` expose the optional Telegram volunteer channel used by the impact workflow.

## Bounty-Specific Integration

SocialOS submits one product story to five tracks:

| Bounty | Public Hub Anchor | Local Demo Route | Integration Endpoint | Proof JSON | Deck Appendix |
| --- | --- | --- | --- | --- | --- |
| `Claw for Human` | [`/hackathon/#bounty-claw-for-human`](https://zhouyixiaoxiao.org/hackathon/#bounty-claw-for-human) | `/demo` | OpenClaw runtime + `/proofs?bounty=claw-for-human` | [`claw-for-human.json`](https://zhouyixiaoxiao.org/data/proofs/claw-for-human.json) | `Slide 9` |
| `Animoca Bounty` | [`/hackathon/#bounty-animoca`](https://zhouyixiaoxiao.org/hackathon/#bounty-animoca) | `/hackathon?bounty=animoca` | Identity, memory, and agent-lane trace | [`animoca.json`](https://zhouyixiaoxiao.org/data/proofs/animoca.json) | `Slide 10` |
| `Human for Claw` | [`/hackathon/#bounty-human-for-claw`](https://zhouyixiaoxiao.org/hackathon/#bounty-human-for-claw) | `/buddy` | Buddy-safe surface + `/proofs?bounty=human-for-claw` | [`human-for-claw.json`](https://zhouyixiaoxiao.org/data/proofs/human-for-claw.json) | `Slide 11` |
| `Z.AI General` | [`/hackathon/#bounty-z-ai-general`](https://zhouyixiaoxiao.org/hackathon/#bounty-z-ai-general) | `/hackathon?bounty=z-ai-general` | `POST /integrations/glm/generate` | [`z-ai-general.json`](https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json) | `Slide 12` |
| `AI Agents for Good` | [`/hackathon/#bounty-ai-agents-for-good`](https://zhouyixiaoxiao.org/hackathon/#bounty-ai-agents-for-good) | `/hackathon?bounty=ai-agents-for-good` | `POST /integrations/flock/sdg-triage` + `POST /integrations/telegram/send` | [`ai-agents-for-good.json`](https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json) | `Slide 13` |

High-level fit:

- `Claw for Human`: SocialOS turns OpenClaw-backed lanes into a calm, human-readable relationship workspace.
- `Animoca Bounty`: SocialOS proves persistent identity, memory, and coordinated agent lanes instead of one-shot tasks.
- `Human for Claw`: Buddy mode narrows the system to four safe, youth-friendly social tasks.
- `Z.AI General`: GLM is part of the real production generation path, not a decorative side integration.
- `AI Agents for Good`: FLock SDG triage, OpenClaw orchestration, and Telegram-powered multi-channel follow-through feed directly into relationship memory.

Full submission source text lives in [socialos/docs/HACKATHON_BOUNTIES.md](socialos/docs/HACKATHON_BOUNTIES.md).

## Public Links

Public proof and verification links:

- [Repo homepage](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos)
- [Deck root](https://zhouyixiaoxiao.org/)
- Local deck route: `/deck`
- [Canonical Bounty Hub](https://zhouyixiaoxiao.org/hackathon/)
- [Auxiliary demo proof](https://zhouyixiaoxiao.org/demo/)
- [Auxiliary buddy proof](https://zhouyixiaoxiao.org/buddy/)
- [All proof JSON](https://zhouyixiaoxiao.org/data/proofs/all.json)
- [Claw for Human video](https://zhouyixiaoxiao.org/videos/claw-for-human/)
- [Human for Claw video](https://zhouyixiaoxiao.org/videos/human-for-claw/)
- [Z.AI General video](https://zhouyixiaoxiao.org/videos/z-ai-general/)
- [AI Agents for Good video](https://zhouyixiaoxiao.org/videos/ai-agents-for-good/)
- [Animoca video](https://zhouyixiaoxiao.org/videos/animoca/)
- [Reuse guide](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/blob/main/socialos/docs/REUSE_SOCIALOS.md)
- [API setup guide](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/blob/main/socialos/docs/API_SETUP.md)
- [Embeddings guide](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/blob/main/socialos/docs/EMBEDDINGS.md)

The public site is read-only and proof-first. The interactive product remains local-first by design.

## GitHub-First Distribution

This repository is set up to be usable directly from GitHub:

- clone from `main`
- use the one-command quickstart for demo reproduction
- switch to `--profile local` for your own workspace
- use the hosted URLs above for public verification

Recommended clone path:

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
```

Recommended branch expectation:

- default branch: `main`
- feature branches: `codex/*` or your own branch naming

The repo is also ready to be used as a GitHub template for local-first reuse.

## Demo Flow

Record or replay 5 independent `5-8 minute` videos:

1. `Claw for Human`: start from `/demo`, then close on `/hackathon/#bounty-claw-for-human`.
2. `Animoca Bounty`: start from `/hackathon?bounty=animoca`, then close on `/hackathon/#bounty-animoca`.
3. `Human for Claw`: start from `/buddy`, then close on `/hackathon/#bounty-human-for-claw`.
4. `Z.AI General`: start from `/hackathon?bounty=z-ai-general`, show live GLM generation, then close on `/hackathon/#bounty-z-ai-general`.
5. `AI Agents for Good`: start from `/hackathon?bounty=ai-agents-for-good`, show live FLock SDG triage plus the channel proof, then close on `/hackathon/#bounty-ai-agents-for-good`.

Every video must cover:

- the problem
- the solution
- the technical implementation
- the bounty partner or infrastructure integration
- a short live demo

The exact recording order, tabs, narration, and DoraHacks paste-ready copy live in [socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md](socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md).

## Troubleshooting

- `sqlite3 is required`: install SQLite and rerun the quickstart command
- `Node 22 or newer is required`: upgrade Node and rerun the quickstart command
- `stale demo process`: run `bash scripts/stop_demo.sh`, then rerun quickstart
- `seed/reset confusion`: demo and local profiles use different DB files; switch profile instead of reusing the same database
- `missing .env`: run `cp .env.example .env` and rerun quickstart

## For Contributors

Useful commands before pushing:

```bash
bash scripts/test.sh
bash scripts/demo_status.sh
```

Contributor cautions:

- use `bash scripts/quickstart.sh --profile local` for your own workspace
- use `bash scripts/quickstart.sh --profile demo --reset-demo` only when you intentionally want the canonical seeded demo
- do not widen gateway exposure or change the default `dry-run` publishing posture
- avoid committing local DBs, `.env.local`, or private workspace data

## OpenClaw / Studio Integration

SocialOS is backed by two coordinated multi-agent layers:

- Product runtime agents:
  - `orchestrator`
  - `people-memory`
  - `self-model`
  - `compliance`
  - `publisher`
- Studio execution agents:
  - `forge_orchestrator`
  - `forge_coder`
  - `forge_tester`
  - `forge_reviewer`

Why it matters:

- the product loop is real, not mocked
- publishing remains gated behind trust boundaries
- proof artifacts are written into audit and digest evidence
- the repo stays understandable to future maintainers and agents

Agent-facing entrypoints:

- [AGENTS.md](AGENTS.md)
- [socialos/docs/AGENT_PLAYBOOK.md](socialos/docs/AGENT_PLAYBOOK.md)
- [socialos/docs/SYSTEM_MANIFEST.json](socialos/docs/SYSTEM_MANIFEST.json)
- [socialos/docs/DOCS_INDEX.md](socialos/docs/DOCS_INDEX.md)

## Judge Pitch Pack

- [socialos/docs/pitch/PITCH_5_MIN.md](socialos/docs/pitch/PITCH_5_MIN.md)
- [socialos/docs/pitch/PITCH_5_MIN_VC_SCRIPT.md](socialos/docs/pitch/PITCH_5_MIN_VC_SCRIPT.md)
- [socialos/docs/pitch/JUDGE_BRIEF.md](socialos/docs/pitch/JUDGE_BRIEF.md)
- [socialos/docs/pitch/DEMO_TALK_TRACK.md](socialos/docs/pitch/DEMO_TALK_TRACK.md)
- [socialos/docs/pitch/DECK_PAGE_SCRIPT.md](socialos/docs/pitch/DECK_PAGE_SCRIPT.md)
- [socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md](socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md)
- [socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md](socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md)
- [socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md](socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md)
- [socialos/docs/pitch/VC_DECK_SPEC.md](socialos/docs/pitch/VC_DECK_SPEC.md)
- [socialos/docs/pitch/DECK_MAINTENANCE.md](socialos/docs/pitch/DECK_MAINTENANCE.md)
- [socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md](socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md)

## Public Evidence

Curated static evidence:

- [socialos/docs/EVIDENCE.md](socialos/docs/EVIDENCE.md)
- [socialos/docs/HACKATHON_BOUNTIES.md](socialos/docs/HACKATHON_BOUNTIES.md)
- [socialos/docs/STATUS.md](socialos/docs/STATUS.md)
- [socialos/docs/evidence/LATEST_VALIDATION.md](socialos/docs/evidence/LATEST_VALIDATION.md)

Generated proof artifacts:

- `socialos/docs/evidence/hackathon-overview.json`
- `socialos/docs/evidence/hackathon-proofs-all.json`
- `socialos/docs/evidence/hackathon-proofs-z-ai-general.json`
- `socialos/docs/evidence/hackathon-proofs-ai-agents-for-good.json`
- `socialos/docs/evidence/hackathon-telegram-status.json`
- `socialos/docs/evidence/hackathon-telegram-send.json`

## Safety Defaults

- API exposure remains loopback-only (`127.0.0.1`)
- default publish mode remains `dry-run`
- live publish still requires explicit credentials and user intent
- do **not** widen `gateway.bind`, `gateway.tailscale`, or `gateway.auth`

## Public Docs

- [socialos/docs/PRODUCT.md](socialos/docs/PRODUCT.md)
- [socialos/docs/ARCHITECTURE.md](socialos/docs/ARCHITECTURE.md)
- [socialos/docs/DEMO_SCRIPT.md](socialos/docs/DEMO_SCRIPT.md)
- [socialos/docs/SAFETY.md](socialos/docs/SAFETY.md)
- [socialos/docs/EMBEDDINGS.md](socialos/docs/EMBEDDINGS.md)
- [socialos/docs/AGENT_PLAYBOOK.md](socialos/docs/AGENT_PLAYBOOK.md)
- [socialos/docs/EVIDENCE.md](socialos/docs/EVIDENCE.md)
- [socialos/docs/SYSTEM_MANIFEST.json](socialos/docs/SYSTEM_MANIFEST.json)
- [socialos/docs/DOCS_INDEX.md](socialos/docs/DOCS_INDEX.md)
