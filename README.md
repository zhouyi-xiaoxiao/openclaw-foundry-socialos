# SocialOS

[![CI](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml/badge.svg)](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml)
[![Demo Docs](https://img.shields.io/badge/docs-demo-blue)](socialos/docs/DEMO_SCRIPT.md)
[![Architecture](https://img.shields.io/badge/docs-architecture-blue)](socialos/docs/ARCHITECTURE.md)
[![Evidence](https://img.shields.io/badge/docs-evidence-blue)](socialos/docs/EVIDENCE.md)
[![Pitch Pack](https://img.shields.io/badge/docs-pitch-blue)](socialos/docs/pitch/PITCH_5_MIN.md)
[![VC Deck](https://img.shields.io/badge/deck-vc_pitch-blue)](socialos/docs/pitch/VC_DECK_SPEC.md)

SocialOS is a local-first relationship + identity operating system. It turns raw notes, voice memos, screenshots, and business cards into structured people memory, event context, self signals, and platform-native draft packages.

The public repo is designed to be readable by judges, maintainers, and future AI/agents without any hidden context. It stays local-first, loopback-only, and `dry-run` by default.

Public web deck target:
- `zhouyixiaoxiao.org/`
- `zhouyixiaoxiao.org/deck/`
- Local route during development: `http://127.0.0.1:4173/deck`
- Whole-site deck export target: `zhouyixiaoxiao.org/`

Public proof routes:
- `https://zhouyixiaoxiao.org/demo/`
- `https://zhouyixiaoxiao.org/hackathon/`
- `https://zhouyixiaoxiao.org/buddy/`
- `https://zhouyixiaoxiao.org/data/proofs/all.json`

Hackathon routes:
- `http://127.0.0.1:4173/demo`
- `http://127.0.0.1:4173/hackathon`
- `http://127.0.0.1:4173/buddy`

## Project Overview
Current stable scope:
- one unified `Workspace` home surface for capture, recall, and action suggestions
- `Contacts`, `Logbook`, `Drafts`, `Queue`, `Self Mirror`, and `Studio` as secondary operating surfaces
- 7-platform draft generation with platform-native language defaults
- assisted publishing with audit trails and manual outcome write-back
- OpenClaw product runtime + Studio control plane
- structured public docs, agent handoff docs, and a machine-readable manifest

What the current `P1` build already does:
- Capture text, voice, and image/business-card inputs into structured `Person / Identity / Interaction / SelfCheckin` memory
- Search people, events, drafts, and self signals in natural language
- Generate one English draft each for `LinkedIn / X / Instagram`
- Generate one Chinese draft each for `Zhihu / Rednote / WeChat Moments / WeChat Official Account`
- Validate drafts for format, PII, and sensitive wording
- Queue assisted publish actions and record manual outcomes
- Generate evidence-backed weekly self mirror summaries

## Setup & Installation
```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/demo.sh
node scripts/seed_demo_data.mjs --reset-review-demo
```

Canonical public lifecycle:
```bash
bash scripts/demo.sh
bash scripts/demo_status.sh
bash scripts/hackathon_preflight.sh
bash scripts/overnight_supervisor.sh
bash scripts/test.sh
bash scripts/stop_demo.sh
```

The demo bootstrap:
1. installs dependencies and hard-resets the review demo data in SQLite
2. deploys the local OpenClaw runtime profile
3. runs `runtime_policy_check`
4. starts loopback-only API + Web services
5. prints health endpoints and public docs

Local URLs after boot:
- Web: `http://127.0.0.1:4173/quick-capture`
- API: `http://127.0.0.1:8787/health`

Optional hackathon provider env:
- `HACKATHON_MODE`
- `GLM_API_KEY`
- `GLM_MODEL_ID`
- `FLOCK_API_KEY`
- `FLOCK_MODEL_ID`

Optional live-provider cutover:
- `bash scripts/hackathon_live.sh env-check`
- `bash scripts/hackathon_live.sh api`
- `bash scripts/hackathon_live.sh proofs`
- [Hackathon Live Provider Setup](socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md)

## Architecture Overview
- Frontend: loopback-only Node dashboard in `socialos/apps/web`
- API: local Node service in `socialos/apps/api`
- Database: SQLite at `infra/db/socialos.db`
- Runtime: OpenClaw product profile in `socialos/openclaw/runtime.openclaw.json5`
- Control plane: Studio task/run/agent/policy layer in SQLite, exported into `foundry/` and `reports/` as evidence

System design at a glance:
1. A user sends a note, voice memo, or image into `Workspace`.
2. The API parses it into structured memory and suggested follow-up actions.
3. The same memory powers contact recall, event creation, and self mirror synthesis.
4. Events feed a 7-platform draft generator with platform-native language defaults.
5. Drafts are edited, validated, queued, and handed into assisted publishing.
6. Studio keeps the repo validated, taskable, and evidence-backed.

Hackathon overlays now sit on top of the same architecture:
- `/demo`: master judge walkthrough for `Claw for Human`
- `/hackathon`: bounty hub with integration status and proof cards
- `/buddy`: simplified `Human for Claw` experience
- `GET /hackathon/overview`: bounty status + recommended routes
- `GET /proofs`: repo-native proof cards
- `POST /integrations/glm/generate`: GLM evidence flow for `Z.AI General`
- `POST /integrations/flock/sdg-triage`: SDG triage flow for `AI Agents for Good`

## Hackathon Bounties
Current submission set:
- `Claw for Human`: use `/demo` to show the full product loop and OpenClaw-backed UI trace
- `Animoca Bounty`: use `/hackathon?bounty=animoca` to frame SocialOS as persistent identity + memory + agent coordination
- `Human for Claw`: use `/buddy` to show a simpler, safer Friendship & Gratitude Coach
- `Z.AI General`: use `/hackathon?bounty=z-ai-general` to show GLM inside Workspace and multilingual draft generation
- `AI Agents for Good`: use `/hackathon?bounty=ai-agents-for-good` to show FLock SDG triage feeding follow-up coordination

Detailed route and proof guidance:
- [Hackathon Bounties](socialos/docs/HACKATHON_BOUNTIES.md)

## Integration Proof
Repo-native proof surfaces:
- [Evidence](socialos/docs/EVIDENCE.md)
- [Hackathon Bounties](socialos/docs/HACKATHON_BOUNTIES.md)
- `GET /proofs`
- `GET /hackathon/overview`
- `POST /integrations/glm/generate`
- `POST /integrations/flock/sdg-triage`

Provider posture:
- `GLM` is used for `Z.AI General` generation flows when configured
- `FLock` is used for `AI Agents for Good` SDG triage when configured
- fallback/demo mode stays explicit when those keys are not configured
- all bounty flows stay `loopback-only` and `dry-run` by default

## OpenClaw / Studio Integration
SocialOS is not a static dashboard. It is backed by two coordinated multi-agent layers:

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

The integration matters because:
- the product loop is real, not mocked
- runtime isolation keeps publisher actions gated
- generic product tasks can be executed and verified through Studio
- the repo exposes enough structured context for future AI/agents to continue safely

Agent-facing entrypoints:
- [Repo Agent Handoff](AGENTS.md)
- [Agent Playbook](socialos/docs/AGENT_PLAYBOOK.md)
- [System Manifest](socialos/docs/SYSTEM_MANIFEST.json)
- [Docs Index](socialos/docs/DOCS_INDEX.md)

## Judge Pitch Pack
- [5-Minute Pitch](socialos/docs/pitch/PITCH_5_MIN.md)
- [5-Minute VC Script](socialos/docs/pitch/PITCH_5_MIN_VC_SCRIPT.md)
- [Judge Brief](socialos/docs/pitch/JUDGE_BRIEF.md)
- [Demo Talk Track](socialos/docs/pitch/DEMO_TALK_TRACK.md)
- [Deck Page Script](socialos/docs/pitch/DECK_PAGE_SCRIPT.md)
- [DoraHacks Master Script](socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md)
- [DoraHacks Bounty Swaps](socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md)
- [Chinese Rehearsal Cues](socialos/docs/pitch/REHEARSAL_CUES_CN.md)
- [Recording + Submission Runbook](socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md)
- [Hackathon Live Provider Setup](socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md)
- [VC Deck Spec](socialos/docs/pitch/VC_DECK_SPEC.md)
- [Deck Maintenance](socialos/docs/pitch/DECK_MAINTENANCE.md)

The pitch is product-led on purpose:
- start with the user problem
- show the product loop
- use multi-agent/OpenClaw/Studio as the enabling architecture
- close with the next implementation layer for real-data onboarding

The public deck is served from:
- `/`
- `/deck`
- `/demo/`
- `/hackathon/`
- `/buddy/`
- `?mode=rehearsal` for speaker-only local notes
- `?print-pdf` for print/PDF-friendly layout
- Static export for GitHub Pages: `node scripts/export_vc_deck.mjs`
- Recording-day preflight + export: `bash scripts/hackathon_preflight.sh`
- Live provider cutover for GLM + FLock: `bash scripts/hackathon_live.sh env-check`

## Public Evidence
Curated public evidence lives in [socialos/docs/EVIDENCE.md](socialos/docs/EVIDENCE.md).

Included evidence:
- demo GIF and screenshots
- representative Studio run report snapshots
- stable evidence files copied out of volatile local runtime paths
- stable hackathon proof snapshots generated by `node scripts/capture_hackathon_proofs.mjs`
- generated validation snapshot: `socialos/docs/evidence/LATEST_VALIDATION.md`

## Generated Public Status
- [Docs Index](socialos/docs/DOCS_INDEX.md)
- [Public Status](socialos/docs/STATUS.md)
- [Agent Repo State](socialos/docs/agent/REPO_STATE.md)
- [Latest Validation](socialos/docs/evidence/LATEST_VALIDATION.md)

Refresh generated docs safely with:

```bash
node scripts/refresh_public_docs.mjs
```

## Demo Flow
Use one master 5-10 minute flow and swap only the bounty-specific segment:
1. Open `/demo` and show the shared product loop.
2. Walk `Workspace -> Contacts -> Drafts -> Queue -> Mirror`.
3. Open `/hackathon` for the target bounty and show its proof cards.
4. For `Human for Claw`, switch to `/buddy`.
5. For `Z.AI General`, show `GLM` proof and generation output.
6. For `AI Agents for Good`, show `FLock` SDG triage and the follow-up path.
7. End by showing the public proof site on `zhouyixiaoxiao.org`.

## Current Product Capabilities
- Capture and commit people memory with explicit human confirmation
- Keep a single chat-first `Workspace` instead of multiple competing entry forms
- Generate platform-specific drafts with:
  - English for `LinkedIn / X / Instagram`
  - Chinese for `Zhihu / Rednote / WeChat Moments / WeChat Official Account`
- Keep publish behavior trust-first:
  - `dry-run` by default
  - assisted/manual handoff in `P1`
  - live publish still gated by credentials + operator intent

## Safety Defaults
- API exposure remains loopback-only (`127.0.0.1`)
- default publish mode remains `dry-run`
- live publish requires explicit env + UI + credential gates
- high-frequency automation stays no-deliver
- do **not** widen `gateway.bind`, `gateway.tailscale`, or `gateway.auth`

## Public Docs
- [Product Spec](socialos/docs/PRODUCT.md)
- [Architecture](socialos/docs/ARCHITECTURE.md)
- [Demo Script](socialos/docs/DEMO_SCRIPT.md)
- [Safety](socialos/docs/SAFETY.md)
- [Embeddings](socialos/docs/EMBEDDINGS.md)
- [Agent Playbook](socialos/docs/AGENT_PLAYBOOK.md)
- [Evidence](socialos/docs/EVIDENCE.md)
- [System Manifest](socialos/docs/SYSTEM_MANIFEST.json)
- [Docs Index](socialos/docs/DOCS_INDEX.md)
- [5-Minute Pitch](socialos/docs/pitch/PITCH_5_MIN.md)
- [Judge Brief](socialos/docs/pitch/JUDGE_BRIEF.md)
- [Demo Talk Track](socialos/docs/pitch/DEMO_TALK_TRACK.md)
- [DoraHacks Master Script](socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md)
- [DoraHacks Bounty Swaps](socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md)
- [Chinese Rehearsal Cues](socialos/docs/pitch/REHEARSAL_CUES_CN.md)
- [Recording + Submission Runbook](socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md)
- [VC Deck Spec](socialos/docs/pitch/VC_DECK_SPEC.md)
- [Deck Maintenance](socialos/docs/pitch/DECK_MAINTENANCE.md)
- [Public Status](socialos/docs/STATUS.md)
- [Agent Repo State](socialos/docs/agent/REPO_STATE.md)
- [Latest Validation](socialos/docs/evidence/LATEST_VALIDATION.md)
- [Deck Status](socialos/docs/pitch/DECK_STATUS.json)

## Operational Commands
```bash
bash scripts/demo.sh
bash scripts/demo_status.sh
bash scripts/hackathon_preflight.sh
bash scripts/stop_demo.sh
bash scripts/overnight_supervisor.sh
node scripts/capture_hackathon_proofs.mjs
node scripts/export_vc_deck.mjs
node scripts/refresh_public_docs.mjs
bash scripts/test.sh
bash scripts/studio.sh status
bash scripts/studio.sh run-once
bash scripts/studio.sh pause
bash scripts/studio.sh resume
```

## Overnight Iteration Guard
For unattended iteration, use:

```bash
bash scripts/overnight_supervisor.sh
```

It does not mutate product state by itself. It is the outer-loop guard that:
- checks demo health
- checks Studio status
- confirms `dry-run` publish posture
- restarts local demo services if they dropped
- writes a concise morning-review summary into `reports/overnight/`
- refreshes generated public docs and evidence status snapshots
- exits in stop mode when the repo becomes unstable or unsafe for unattended edits

## Repo Hygiene
- volatile local state stays out of Git
- curated evidence is copied into `socialos/docs/evidence/`
- secrets and auth profiles are never committed
- the public repo is the authoritative handoff surface for humans and future agents
