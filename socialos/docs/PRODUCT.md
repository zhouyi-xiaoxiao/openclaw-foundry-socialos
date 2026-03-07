# SocialOS Product Spec (Stable P1)

## One-liner
SocialOS is a local-first relationship + identity operating system with a chat-first workspace, structured people memory, event-aware draft generation, assisted publishing, and evidence-backed self reflection.

## Product Goals
- Demo-ready: a judge can clone the repo, run `bash scripts/demo.sh`, and see a non-empty product.
- Reproducible: the public repo is enough to understand setup, safety defaults, and the product loop.
- Extensible: publishing can move from `L1 assisted` to `L2 gated`; embeddings can switch providers; Studio can execute structured product tasks from a DB-backed control plane.
- Explainable: search results, mirror conclusions, and publish handoffs all expose evidence, preflight, or audit trails.

## Current Stable P1 Surfaces
### 1. Workspace
- `Workspace` is the single primary home surface.
- It combines:
  - lightweight capture
  - natural-language recall
  - event suggestions
  - draft entry points
  - top actions and context summaries
- The UI is chat-first rather than a control-panel wall.
- Voice input stays editable:
  - record
  - stop
  - transcript lands in the composer
  - the user edits, then sends

### 2. Contacts
- Keyword and hybrid recall over people memory.
- Contact detail pages include:
  - profile summary
  - linked identities
  - interaction timeline
  - evidence rows
  - follow-up suggestion

### 3. Logbook
- Structured event records live here.
- Events can be linked back to captures and used as campaign seeds.
- Event records include:
  - title
  - audience
  - language strategy
  - tone
  - links
  - assets
  - payload details

### 4. Drafts
- Generates exactly one platform-native draft per supported platform in the default `platform-native` lane.
- English platforms:
  - `LinkedIn`
  - `X`
  - `Instagram`
- Chinese platforms:
  - `知乎`
  - `小红书`
  - `微信朋友圈`
  - `微信公众号`
- Draft cards expose:
  - editable content
  - validation result
  - publish package
  - support level
  - entry target
  - blocked reason

### 5. Queue / Publish
- `PublishTask` lifecycle:
  - `queued`
  - `manual_step_needed`
  - `posted`
  - `failed`
- `P1` behavior:
  - `X / LinkedIn`: credentials-gated preflight + assisted handoff only
  - `Instagram / 知乎 / 小红书 / 微信朋友圈 / 微信公众号`: assisted handoff
- Publish behavior writes:
  - `PublishTask`
  - `Audit`
  - `DevDigest`

### 6. Self Mirror
- Weekly synthesis stays evidence-backed.
- Output shape:
  - `summaryText`
  - `themes`
  - `energizers`
  - `drainers`
  - `conclusions`
  - `evidence`
- Every mirror conclusion can drill down into `MirrorEvidence`.

### 7. Settings
- Runtime controls
- Studio handoff into tasks, runs, agents, and policies
- execution split between product runtime and Studio
- publish mode visibility

## Capture Model
- Text is the main path.
- Audio and image inputs are supported as capture assets:
  - images default to local OCR with human confirmation
  - audio can use browser recording and OpenAI transcription when a key is present
- The structured capture path is:
  - `Person Draft`
  - `Interaction Draft`
  - `Self Check-in Draft`
- Commit writes to:
  - `Person`
  - `Identity`
  - `Interaction`
  - `SelfCheckin`
  - `Audit`

## Platform Support Levels
- `LinkedIn`: L2 Auto Publish (credentials gated, `P1` preflight only)
- `X`: L2 Auto Publish (credentials gated, `P1` preflight only)
- `Instagram`: L1 Assisted
- `知乎`: L1 Assisted
- `小红书`: L1 Assisted+
- `微信朋友圈`: L1 Assisted+
- `微信公众号`: L1.5 Rich Article Package

## Runtime Split
### Product runtime agents
- `orchestrator`
- `people-memory`
- `self-model`
- `compliance`
- `publisher`

### Studio agents
- `forge_orchestrator`
- `forge_coder`
- `forge_tester`
- `forge_reviewer`

### Human still required
- live publish decisions
- credentials and login state
- final brand voice approval for public posting

## P1 Acceptance
From a fresh local clone, within 5-10 minutes, an operator can:
1. open the unified `Workspace`
2. capture a new person and self signal
3. inspect the resulting contact memory
4. create an event from recent context
5. generate 7 platform-native drafts
6. validate and queue a draft
7. record a manual publish outcome
8. inspect a weekly mirror and evidence trail
