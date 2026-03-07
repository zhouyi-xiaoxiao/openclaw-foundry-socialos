# SocialOS

[![CI](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml/badge.svg)](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml)
[![Demo Docs](https://img.shields.io/badge/docs-demo-blue)](socialos/docs/DEMO_SCRIPT.md)
[![Architecture](https://img.shields.io/badge/docs-architecture-blue)](socialos/docs/ARCHITECTURE.md)
[![Evidence](https://img.shields.io/badge/docs-evidence-blue)](socialos/docs/EVIDENCE.md)
[![Pitch Pack](https://img.shields.io/badge/docs-pitch-blue)](socialos/docs/pitch/PITCH_5_MIN.md)
[![VC Deck](https://img.shields.io/badge/deck-vc_pitch-blue)](socialos/docs/pitch/VC_DECK_SPEC.md)

SocialOS is a local-first relationship and identity operating system. It turns messy real-world inputs into structured people memory, event context, multilingual draft packages, trust-first queue handoff, and evidence-backed self reflection.

This repository is judge-ready for DoraHacks. The public proof surface stays at [zhouyixiaoxiao.org](https://zhouyixiaoxiao.org/), while the live interactive product remains localhost-only and `dry-run` by default.

## Project Overview
What SocialOS already does today:

- Captures text, voice, screenshots, and cards into structured `Person`, `Identity`, `Interaction`, `Event`, and `SelfCheckin` memory.
- Recalls people and events from fuzzy context instead of exact-keyword lookup only.
- Generates platform-native drafts across `LinkedIn`, `X`, `Instagram`, `Zhihu`, `Rednote`, `WeChat Moments`, and `WeChat Official Account`.
- Keeps publishing trust-first through review, queueing, and manual handoff.
- Produces evidence-backed daily and weekly self mirror summaries.
- Exposes a judge-facing bounty layer without splitting SocialOS into five separate products.

Canonical public URLs:

- [Pitch Deck](https://zhouyixiaoxiao.org/)
- [Canonical Bounty Hub](https://zhouyixiaoxiao.org/hackathon/)
- [Auxiliary Claw for Human Proof Page](https://zhouyixiaoxiao.org/demo/)
- [Auxiliary Human for Claw Proof Page](https://zhouyixiaoxiao.org/buddy/)
- [All Proof JSON](https://zhouyixiaoxiao.org/data/proofs/all.json)

Canonical local recording URLs:

- `http://127.0.0.1:4173/quick-capture`
- `http://127.0.0.1:4173/demo`
- `http://127.0.0.1:4173/hackathon`
- `http://127.0.0.1:4173/buddy`

## Setup & Installation
Clone and boot the local demo:

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/demo.sh
node scripts/seed_demo_data.mjs --reset-review-demo
```

Judge-day lifecycle:

```bash
bash scripts/demo.sh
bash scripts/demo_status.sh
bash scripts/hackathon_preflight.sh
bash scripts/test.sh
bash scripts/stop_demo.sh
```

Live provider verification:

```bash
bash scripts/hackathon_live.sh env-check
bash scripts/hackathon_live.sh proofs
```

Public export and evidence refresh:

```bash
node scripts/capture_hackathon_proofs.mjs
node scripts/export_vc_deck.mjs
node scripts/refresh_public_docs.mjs
```

Key environment variables:

- `HACKATHON_MODE`
- `GLM_API_KEY`
- `GLM_MODEL_ID`
- `FLOCK_API_KEY`
- `FLOCK_MODEL_ID`
- `STRUCTURED_MODEL_TIMEOUT_MS`

## Architecture Overview
Core system shape:

- Frontend: loopback-only Node web app in `socialos/apps/web`
- API: loopback-only Node service in `socialos/apps/api`
- Database: SQLite in `infra/db/socialos.db`
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

## Bounty-Specific Integration
SocialOS submits one product story to five tracks:

| Bounty | Public Hub Anchor | Local Demo Route | Integration Endpoint | Proof JSON | Deck Appendix |
| --- | --- | --- | --- | --- | --- |
| `Claw for Human` | [`/hackathon/#bounty-claw-for-human`](https://zhouyixiaoxiao.org/hackathon/#bounty-claw-for-human) | `/demo` | OpenClaw runtime + `/proofs?bounty=claw-for-human` | [`claw-for-human.json`](https://zhouyixiaoxiao.org/data/proofs/claw-for-human.json) | `Slide 9` |
| `Animoca Bounty` | [`/hackathon/#bounty-animoca`](https://zhouyixiaoxiao.org/hackathon/#bounty-animoca) | `/hackathon?bounty=animoca` | Identity, memory, and agent-lane trace | [`animoca.json`](https://zhouyixiaoxiao.org/data/proofs/animoca.json) | `Slide 10` |
| `Human for Claw` | [`/hackathon/#bounty-human-for-claw`](https://zhouyixiaoxiao.org/hackathon/#bounty-human-for-claw) | `/buddy` | Buddy-safe surface + `/proofs?bounty=human-for-claw` | [`human-for-claw.json`](https://zhouyixiaoxiao.org/data/proofs/human-for-claw.json) | `Slide 11` |
| `Z.AI General` | [`/hackathon/#bounty-z-ai-general`](https://zhouyixiaoxiao.org/hackathon/#bounty-z-ai-general) | `/hackathon?bounty=z-ai-general` | `POST /integrations/glm/generate` | [`z-ai-general.json`](https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json) | `Slide 12` |
| `AI Agents for Good` | [`/hackathon/#bounty-ai-agents-for-good`](https://zhouyixiaoxiao.org/hackathon/#bounty-ai-agents-for-good) | `/hackathon?bounty=ai-agents-for-good` | `POST /integrations/flock/sdg-triage` | [`ai-agents-for-good.json`](https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json) | `Slide 13` |

Bounty fit at a glance:

- `Claw for Human`: SocialOS turns OpenClaw-backed lanes into a calm, human-readable relationship workspace.
- `Animoca Bounty`: SocialOS proves persistent identity, memory, and coordinated agent lanes instead of one-shot tasks.
- `Human for Claw`: Buddy mode narrows the system to four safe, youth-friendly tasks.
- `Z.AI General`: GLM is part of the real multilingual generation path, not a decorative side integration.
- `AI Agents for Good`: FLock SDG triage feeds directly into volunteer follow-up and relationship memory.

Full submission source text lives in [socialos/docs/HACKATHON_BOUNTIES.md](socialos/docs/HACKATHON_BOUNTIES.md).

## Public Proof URLs
The public site is proof-first and read-only:

- [Deck Root](https://zhouyixiaoxiao.org/)
- [Canonical Bounty Hub](https://zhouyixiaoxiao.org/hackathon/)
- [Auxiliary Demo Proof](https://zhouyixiaoxiao.org/demo/)
- [Auxiliary Buddy Proof](https://zhouyixiaoxiao.org/buddy/)
- [Overview JSON](https://zhouyixiaoxiao.org/data/hackathon-overview.json)
- [All Proof JSON](https://zhouyixiaoxiao.org/data/proofs/all.json)

The live interactive demo remains localhost-only by design.

## Demo Flow
Record 5 independent `5-8 minute` videos, not one shared video with tiny swaps:

1. `Claw for Human`: start from `/demo`, then close on `/hackathon/#bounty-claw-for-human`.
2. `Animoca Bounty`: start from `/hackathon?bounty=animoca`, then close on `/hackathon/#bounty-animoca`.
3. `Human for Claw`: start from `/buddy`, then close on `/hackathon/#bounty-human-for-claw`.
4. `Z.AI General`: start from `/hackathon?bounty=z-ai-general`, show live GLM generation, then close on `/hackathon/#bounty-z-ai-general`.
5. `AI Agents for Good`: start from `/hackathon?bounty=ai-agents-for-good`, show live FLock SDG triage, then close on `/hackathon/#bounty-ai-agents-for-good`.

Every video must clearly cover:

- the problem
- the solution
- the technical implementation
- the bounty partner or infrastructure integration
- a short live demo

The exact recording order, tabs, narration, and DoraHacks paste-ready copy live in [socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md](socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md).

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
- [socialos/docs/pitch/REHEARSAL_CUES_CN.md](socialos/docs/pitch/REHEARSAL_CUES_CN.md)
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
