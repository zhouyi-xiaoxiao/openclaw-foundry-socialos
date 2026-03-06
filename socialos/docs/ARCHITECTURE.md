# SocialOS Architecture (stable P1)

## Runtime shape
- `socialos/apps/web`: local dashboard UI
- `socialos/apps/api`: loopback-only HTTP API
- `infra/db/socialos.db`: SQLite-first persistence
- `socialos/lib/product-core.mjs`: product heuristics for capture, validation, mirror
- `socialos/lib/foundry-tasks.mjs`: structured task model + Foundry runtime paths
- `scripts/foundry_generic_task.mjs`: generic task execution chain
- `reports/`: markdown/json run outputs

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
1. `POST /capture/assets`
   - stores image/audio metadata + extracted text
2. `POST /capture/parse`
   - builds `Person Draft + Self Check-in Draft + Interaction Draft`
3. `POST /capture/commit`
   - persists person memory, interaction, self check-in, audit
4. `POST /events`
   - stores structured campaign seed
5. `POST /drafts/generate`
   - generates platform-specific publish packages
6. `PATCH /drafts/:id`
   - edits draft content/variants
7. `POST /drafts/:id/validate`
   - stores format/pii/sensitive validation
8. `POST /publish/queue`
   - creates queued publish tasks
9. `POST /publish/approve`
   - turns queued tasks into assisted/manual handoff with preflight
10. `POST /publish/complete`
   - records posted / failed / still-manual outcomes
11. `POST /self-mirror/generate`
   - writes structured mirror + evidence rows

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

## Foundry generic execution path
1. Structured task lands in `foundry/tasks/*.json`
2. devloop detects `TASK-*`
3. generic runner checks `llm-task` health
4. creates backup branch + `lkg/*` tag
5. generates PlanSpec
6. runs orchestrator/coder/tester/reviewer
7. writes run report + digest + queue/task state

## Why SQLite still fits P1
- deterministic local demo
- easy seed/reset
- enough for current People/Campaign/Mirror loops
- `Postgres + pgvector` stays isolated in `P2-4`
