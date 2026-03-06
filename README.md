# SocialOS

[![CI](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml/badge.svg)](https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos/actions/workflows/ci.yml)
[![Demo Docs](https://img.shields.io/badge/docs-demo-blue)](socialos/docs/DEMO_SCRIPT.md)
[![Architecture](https://img.shields.io/badge/docs-architecture-blue)](socialos/docs/ARCHITECTURE.md)
[![Evidence](https://img.shields.io/badge/docs-evidence-blue)](socialos/docs/EVIDENCE.md)

SocialOS is a local-first relationship + identity operating system. It turns raw notes, voice memos, screenshots, and business cards into structured people memory, event context, self signals, and platform-native draft packages.

The public repo is designed to be readable by judges, maintainers, and future AI/agents without any hidden context. It stays local-first, loopback-only, and `dry-run` by default.

## Project Overview
Current stable scope:
- one unified `Workspace` home surface for capture, recall, and action suggestions
- `Contacts`, `Logbook`, `Drafts`, `Queue`, `Self Mirror`, and `Settings` as secondary operating surfaces
- 7-platform draft generation with platform-native language defaults
- assisted publishing with audit trails and manual outcome write-back
- OpenClaw product runtime + Foundry execution cluster
- structured public docs, agent handoff docs, and a machine-readable manifest

What the current `P1` build already does:
- Capture text, voice, and image/business-card inputs into structured `Person / Identity / Interaction / SelfCheckin` memory
- Search people, events, drafts, and self signals in natural language
- Generate one English draft each for `LinkedIn / X / Instagram`
- Generate one Chinese draft each for `知乎 / 小红书 / 微信朋友圈 / 微信公众号`
- Validate drafts for format, PII, and sensitive wording
- Queue assisted publish actions and record manual outcomes
- Generate evidence-backed weekly self mirror summaries

## Setup & Installation
```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
cp .env.example .env
bash scripts/demo.sh
```

Canonical public lifecycle:
```bash
bash scripts/demo.sh
bash scripts/demo_status.sh
bash scripts/test.sh
bash scripts/stop_demo.sh
```

The demo bootstrap:
1. installs dependencies and initializes SQLite demo data
2. deploys the local OpenClaw runtime profile
3. runs `runtime_policy_check`
4. starts loopback-only API + Web services
5. prints health endpoints and public docs

Local URLs after boot:
- Web: `http://127.0.0.1:4173/quick-capture`
- API: `http://127.0.0.1:8787/health`

## Architecture Overview
- Frontend: loopback-only Node dashboard in `socialos/apps/web`
- API: local Node service in `socialos/apps/api`
- Database: SQLite at `infra/db/socialos.db`
- Runtime: OpenClaw product profile in `socialos/openclaw/runtime.openclaw.json5`
- Automation: Foundry devloop + generic task executor in `foundry/` and `scripts/`

System design at a glance:
1. A user sends a note, voice memo, or image into `Workspace`.
2. The API parses it into structured memory and suggested follow-up actions.
3. The same memory powers contact recall, event creation, and self mirror synthesis.
4. Events feed a 7-platform draft generator with platform-native language defaults.
5. Drafts are edited, validated, queued, and handed into assisted publishing.
6. Foundry keeps the repo validated, taskable, and evidence-backed.

## OpenClaw / Foundry Integration
SocialOS is not a static dashboard. It is backed by two coordinated multi-agent layers:

- Product runtime agents:
  - `orchestrator`
  - `people-memory`
  - `self-model`
  - `compliance`
  - `publisher`
- Foundry execution agents:
  - `forge_orchestrator`
  - `forge_coder`
  - `forge_tester`
  - `forge_reviewer`

The integration matters because:
- the product loop is real, not mocked
- runtime isolation keeps publisher actions gated
- generic product tasks can be executed and verified through Foundry
- the repo exposes enough structured context for future AI/agents to continue safely

Agent-facing entrypoints:
- [Repo Agent Handoff](AGENTS.md)
- [Agent Playbook](socialos/docs/AGENT_PLAYBOOK.md)
- [System Manifest](socialos/docs/SYSTEM_MANIFEST.json)

## Public Evidence
Curated public evidence lives in [socialos/docs/EVIDENCE.md](socialos/docs/EVIDENCE.md).

Included evidence:
- demo GIF and screenshots
- representative Foundry run report snapshots
- stable evidence files copied out of volatile local runtime paths

## Current Product Capabilities
- Capture and commit people memory with explicit human confirmation
- Keep a single chat-first `Workspace` instead of multiple competing entry forms
- Generate platform-specific drafts with:
  - English for `LinkedIn / X / Instagram`
  - Chinese for `知乎 / 小红书 / 微信朋友圈 / 微信公众号`
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

## Operational Commands
```bash
bash scripts/demo.sh
bash scripts/demo_status.sh
bash scripts/stop_demo.sh
bash scripts/test.sh
bash scripts/status.sh
bash scripts/foundry_dispatch.sh STATUS
bash scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE
bash scripts/foundry_dispatch.sh PAUSE_DEVLOOP
bash scripts/foundry_dispatch.sh RESUME_DEVLOOP
```

## Repo Hygiene
- volatile local state stays out of Git
- curated evidence is copied into `socialos/docs/evidence/`
- secrets and auth profiles are never committed
- the public repo is the authoritative handoff surface for humans and future agents
