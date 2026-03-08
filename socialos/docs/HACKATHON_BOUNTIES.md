# SocialOS Hackathon Bounties

SocialOS submits one shared product to five DoraHacks tracks:

- `Claw for Human`
- `Animoca Bounty`
- `Human for Claw`
- `Z.AI General`
- `AI Agents for Good`

Excluded on purpose:

- `BioHack`
- `Biodock`
- `CEO Claw`
- `AnyWay`
- `Satellite imagery`

## Canonical Surfaces
Public:

- [Deck Root](https://zhouyixiaoxiao.org/)
- [Canonical Bounty Hub](https://zhouyixiaoxiao.org/hackathon/)
- [All Proof JSON](https://zhouyixiaoxiao.org/data/proofs/all.json)

Local recording:

- `/demo`
- `/hackathon`
- `/buddy`

Shared proof APIs:

- `GET /hackathon/overview`
- `GET /proofs`
- `POST /integrations/glm/generate`
- `POST /integrations/flock/sdg-triage`
- `GET /integrations/telegram/status`
- `POST /integrations/telegram/send`

## Submission Matrix
| Bounty | Sponsor | Local Route | Public Anchor | Proof JSON | Deck Appendix |
| --- | --- | --- | --- | --- | --- |
| `Claw for Human` | `Imperial Blockchain` | `/demo` | [`#bounty-claw-for-human`](https://zhouyixiaoxiao.org/hackathon/#bounty-claw-for-human) | [`claw-for-human.json`](https://zhouyixiaoxiao.org/data/proofs/claw-for-human.json) | `Slide 9` |
| `Animoca Bounty` | `Animoca Brands` | `/hackathon?bounty=animoca` | [`#bounty-animoca`](https://zhouyixiaoxiao.org/hackathon/#bounty-animoca) | [`animoca.json`](https://zhouyixiaoxiao.org/data/proofs/animoca.json) | `Slide 10` |
| `Human for Claw` | `Imperial Blockchain` | `/buddy` | [`#bounty-human-for-claw`](https://zhouyixiaoxiao.org/hackathon/#bounty-human-for-claw) | [`human-for-claw.json`](https://zhouyixiaoxiao.org/data/proofs/human-for-claw.json) | `Slide 11` |
| `Z.AI General` | `Z.AI` | `/hackathon?bounty=z-ai-general` | [`#bounty-z-ai-general`](https://zhouyixiaoxiao.org/hackathon/#bounty-z-ai-general) | [`z-ai-general.json`](https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json) | `Slide 12` |
| `AI Agents for Good` | `FLock.io` | `/hackathon?bounty=ai-agents-for-good` | [`#bounty-ai-agents-for-good`](https://zhouyixiaoxiao.org/hackathon/#bounty-ai-agents-for-good) | [`ai-agents-for-good.json`](https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json) | `Slide 13` |

## Claw for Human
### Short Summary
SocialOS fits `Claw for Human` because it brings OpenClaw out of the shell and into a product that ordinary judges can understand in one pass. Instead of a raw orchestration graph, the product shows one calm relationship workspace where a single note becomes people memory, event context, platform-ready drafts, queue handoff, and reflection. The route starts at `/demo`, where judges can follow the same fixed loop from `Workspace` to `Contacts`, `Drafts`, `Queue`, and `Self Mirror`, then closes on the canonical public hub and proof JSON.

### Technical Implementation
The Node API persists people, identities, interactions, events, drafts, queue state, and mirror evidence in SQLite. OpenClaw coordinates the hidden runtime lanes for memory, compliance, publishing, and reflection, while the web layer exposes only the trust-bounded product surface.

### Partner / Infrastructure Integration
The relevant integration is OpenClaw itself. SocialOS uses OpenClaw as the orchestration and guardrail layer, then proves that infrastructure through the `/demo` route, the OpenClaw trace snapshot, and the shared proof catalog.

### Judge-Facing Closing Line
“This is Claw turned into a trustworthy product surface for human relationship work, not kept as a shell-only experience.”

## Animoca Bounty
### Short Summary
SocialOS fits `Animoca Bounty` because it already behaves like an identity and memory system instead of a one-shot assistant. The same person can accumulate linked identities, event history, follow-up context, and future draft opportunities across time. That persistence is the point. The product keeps a durable relationship graph that can support creator, operator, and community workflows over the long term, which is the right shape for Animoca’s identity, memory, and cognition direction.

### Technical Implementation
The schema keeps `Person`, `Identity`, `Interaction`, `Event`, `PostDraft`, and `Mirror` as first-class records. The runtime separates memory, compliance, and publishing lanes so the product can act like a coordinated agent system instead of a monolithic chatbot. The Animoca route on `/hackathon` makes that architecture visible to judges through route guidance, proof cards, and the agent-lane story.

### Partner / Infrastructure Integration
Animoca is satisfied through the product behaviour: persistent identity, memory continuity, and coordinated agent lanes. The proof is the fact that SocialOS can remember the same person or community thread across multiple steps and multiple product surfaces without resetting context every turn.

### Judge-Facing Closing Line
“This is persistent identity and memory for creator and community operations, not a one-task chatbot.”

## Human for Claw
### Short Summary
SocialOS fits `Human for Claw` through Buddy mode, a deliberately narrower route that keeps the experience safe, legible, and emotionally approachable. Instead of exposing the full operator surface, Buddy mode limits the system to four tasks: meeting someone new, remembering context, writing a thank-you or follow-up, and calm reflection. That constraint is the product value. It shows that the same Claw-backed system can be shaped for children, families, first-time users, or trust-sensitive contexts.

### Technical Implementation
Buddy mode is implemented as a dedicated route that strips away complex settings and risky surfaces while reusing the same SocialOS memory and reflection system under the hood. The experience stays `dry-run`, loopback-only, and visibly bounded, which is the point of the track.

### Partner / Infrastructure Integration
The infrastructure remains OpenClaw and SocialOS, but the integration lens changes from power to trust. The video should show that Buddy mode is intentionally smaller, clearer, and safer than the full operator route, while still being connected to the same real backend.

### Judge-Facing Closing Line
“Buddy mode is narrower on purpose: safer to trust, easier to understand, and still connected to the same real system.”

## Z.AI General
### Short Summary
SocialOS fits `Z.AI General` because GLM is wired into the real product path, not bolted onto a demo panel. The judge-facing flow uses live GLM generation for summary and support tasks, then reuses the same provider path inside Workspace and Draft generation. That makes GLM a core system dependency instead of a decorative checkbox.

### Technical Implementation
`POST /integrations/glm/generate` returns live provider, model, and capture metadata. The same provider-aware routing path is reused by `Workspace` and `Drafts`, and the resulting proof is written into audit evidence, surfaced through `/proofs`, and exported into repo-tracked JSON for public verification.

### Partner / Infrastructure Integration
Z.AI powers the live GLM route used for judge-facing generation. The public proof JSON shows the provider, model, and capture metadata so judges can verify the integration claim without guessing. The route remains production-shaped because it is the same path the product already uses for summaries and draft generation.

### Judge-Facing Closing Line
“GLM is integrated into the real SocialOS loop and captured as live proof, not shown as a decorative plug-in.”

## AI Agents for Good
### Short Summary
SocialOS fits `AI Agents for Good` by reframing the same relationship-memory engine as community support and volunteer coordination infrastructure. The problem is not answering one impact question once. The problem is remembering people, triaging urgency, and carrying that signal into real follow-through. In the AI for Good flow, SocialOS uses FLock to label SDG context, urgency, and a recommended next action, then keeps that action inside the same memory, event, draft, and outreach system used elsewhere in the product.

### Technical Implementation
`POST /integrations/flock/sdg-triage` returns structured SDG output with provider, model, open-source-model, and capture metadata. `GET /integrations/telegram/status` and `POST /integrations/telegram/send` expose a Telegram volunteer channel when configured. The same result can also flow into the existing outreach lanes, so the track is visibly multi-channel even before final publishing. Proof events are written into the audit log and surfaced again through `/proofs` and the canonical `/hackathon` hub.

### Partner / Infrastructure Integration
The partner integration is `OpenClaw + FLock + multi-channel follow-through`. OpenClaw orchestrates the workflow, FLock performs the structured SDG triage on an open-source model path, and SocialOS carries the next action into Web Workspace, outreach drafts, and Telegram volunteer handoff when the channel is configured. The important proof is not just the label. It is the fact that the label lands inside a longer-running coordination loop.

### Judge-Facing Closing Line
“This is not a charity chatbot. It is live SDG triage plus relationship memory and actual multi-channel action follow-through through Telegram and the outreach lanes.”

## Recording Pack
- Shared backbone: `socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md`
- Bounty modules: `socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md`
- Final checklist and paste-ready copy: `socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md`
- Live provider setup: `socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md`
