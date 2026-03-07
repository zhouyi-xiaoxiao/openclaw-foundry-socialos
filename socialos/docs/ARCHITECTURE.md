# SocialOS Architecture (stable P1)

## Runtime shape
- `socialos/apps/web`: local dashboard UI
- `socialos/apps/api`: loopback-only HTTP API
- `infra/db/socialos.db`: SQLite-first persistence
- `socialos/lib/product-core.mjs`: product heuristics for capture, validation, mirror
- `socialos/lib/studio-control-plane.mjs`: DB-backed Studio control plane for tasks, runs, agents, settings, and evidence export
- `socialos/lib/foundry-tasks.mjs`: legacy task export helpers for Studio evidence
- `scripts/foundry_generic_task.mjs`: multi-agent execution adapter used by Studio task runs
- `reports/`: exported markdown/json evidence derived from Studio state

## Data model
- `Person`
- `Identity`
- `Interaction`
- `Event`
- `PostDraft`
- `PublishTask`
- `Audit`
- `CaptureAsset`
- `DevDigest`
- `SelfCheckin`
- `Mirror`
- `MirrorEvidence`

## Main product dataflow
1. `GET /workspace/bootstrap`
   - aggregates summary, top actions, recent contacts/events, queue preview, latest mirror, and voice readiness
2. `POST /workspace/chat`
   - routes natural-language capture/search/campaign/self requests and returns a presentation-focused response contract
3. `POST /capture/assets`
   - stores image/audio metadata + extracted text
4. `POST /capture/parse`
   - builds `Person Draft + Self Check-in Draft + Interaction Draft`
5. `POST /capture/commit`
   - persists person memory, interaction, self check-in, audit
6. `POST /events`
   - stores structured campaign seed
7. `POST /drafts/generate`
   - generates platform-specific publish packages
8. `PATCH /drafts/:id`
   - edits draft content/variants
9. `POST /drafts/:id/validate`
   - stores format/pii/sensitive validation
10. `POST /publish/queue`
   - creates queued publish tasks
11. `POST /publish/approve`
   - turns queued tasks into assisted/manual handoff with preflight
12. `POST /publish/complete`
   - records posted / failed / still-manual outcomes
13. `POST /self-mirror/generate`
   - writes structured mirror + evidence rows

## Presentation contract
`POST /workspace/chat` returns a presentation-first structure for the unified UI:
- `presentation.mode`
- `presentation.answer`
- `presentation.primaryCard`
- `presentation.secondaryCards`
- `presentation.actions`

This keeps the main surface simple:
- concise answer first
- one primary result card
- up to three related cards
- lightweight actions only

## Search architecture
- Retrieval stays safe-by-default:
  - no key -> `hybrid-keyword`
  - key present -> `hybrid-semantic`
- Search ranking currently blends:
  - keyword overlap
  - note-length semantic boost (when OpenAI key exists)
- People detail carries explicit evidence rows so search is explainable.

## Draft / publish architecture
### PostDraft.metadata
- `capability`
- `publishPackage`
- `validation`
- `variants`
- generation metadata

### PublishTask lifecycle
- `queued`
- `manual_step_needed`
- `posted`
- `failed`

### Publish safety boundary
- API server is loopback-only (`127.0.0.1`)
- default publish mode remains `dry-run`
- live publish requires:
  - runtime env enablement
  - UI live intent
  - credentials ready
- even when gates are open, P1 only performs preflight + operator handoff for `X / LinkedIn`

## Studio control-plane execution path
1. Task lands in SQLite-first `StudioTask`
2. Studio exports task evidence into `foundry/tasks/*.json`
3. generic runner checks `llm-task` health
4. creates backup branch + `lkg/*` tag
5. generates PlanSpec
6. runs orchestrator/coder/tester/reviewer
7. writes run state back into `StudioRun` / `StudioRunStep`
8. exports queue, run report, digest, and task evidence files

## Why SQLite still fits P1
- deterministic local demo
- easy seed/reset
- enough for current People/Campaign/Mirror loops
- `Postgres + pgvector` stays isolated in `P2-4`

## Public repo handoff surfaces
- Human overview: `README.md`
- Agent handoff: `AGENTS.md`
- Machine-readable map: `socialos/docs/SYSTEM_MANIFEST.json`
- Operator playbook: `socialos/docs/AGENT_PLAYBOOK.md`
- Curated evidence: `socialos/docs/EVIDENCE.md`
