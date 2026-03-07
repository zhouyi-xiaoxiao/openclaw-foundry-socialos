# SocialOS Hackathon Bounties

SocialOS is submitting one shared product to five DoraHacks tracks:

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

## Submission Matrix
| Bounty | Local Route | Public Anchor | Proof JSON | Deck Appendix |
| --- | --- | --- | --- | --- |
| `Claw for Human` | `/demo` | [`#bounty-claw-for-human`](https://zhouyixiaoxiao.org/hackathon/#bounty-claw-for-human) | [`claw-for-human.json`](https://zhouyixiaoxiao.org/data/proofs/claw-for-human.json) | `Slide 9` |
| `Animoca Bounty` | `/hackathon?bounty=animoca` | [`#bounty-animoca`](https://zhouyixiaoxiao.org/hackathon/#bounty-animoca) | [`animoca.json`](https://zhouyixiaoxiao.org/data/proofs/animoca.json) | `Slide 10` |
| `Human for Claw` | `/buddy` | [`#bounty-human-for-claw`](https://zhouyixiaoxiao.org/hackathon/#bounty-human-for-claw) | [`human-for-claw.json`](https://zhouyixiaoxiao.org/data/proofs/human-for-claw.json) | `Slide 11` |
| `Z.AI General` | `/hackathon?bounty=z-ai-general` | [`#bounty-z-ai-general`](https://zhouyixiaoxiao.org/hackathon/#bounty-z-ai-general) | [`z-ai-general.json`](https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json) | `Slide 12` |
| `AI Agents for Good` | `/hackathon?bounty=ai-agents-for-good` | [`#bounty-ai-agents-for-good`](https://zhouyixiaoxiao.org/hackathon/#bounty-ai-agents-for-good) | [`ai-agents-for-good.json`](https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json) | `Slide 13` |

## Claw for Human
### Short Summary
SocialOS fits `Claw for Human` because it translates agent infrastructure into a product that real people can understand and trust. The user does not see a shell session or a raw orchestration graph. The user sees one calm relationship workspace where a single note turns into people memory, event context, multilingual drafts, queue-visible handoff, and reflection. That is the core submission idea: Claw becomes a humane interface for relationship work, not a hidden backend that only technical users can access. The demo route starts at `/demo`, where judges can follow a fixed product loop from `Workspace` to `Contacts`, `Drafts`, `Queue`, and `Self Mirror`. The public proof surface then closes on the single bounty hub, so judges can verify the same story without opening the live localhost runtime.

### Technical Implementation
The product uses the OpenClaw runtime profile plus SocialOS API and web surfaces. Agent lanes for memory, compliance, self modeling, and publishing are coordinated behind the scenes while the interface stays compact and guided. Proof metadata is written into audit evidence and exposed again through `GET /proofs?bounty=claw-for-human`.

### Partner / Infrastructure Integration
This is an infrastructure interpretation bounty. The relevant integration is OpenClaw itself: SocialOS relies on it for agent lane separation, runtime guardrails, and repeatable backend traceability. The video should show the `/demo` route, then the OpenClaw trace snapshot and public proof JSON.

### Judge-Facing Closing Line
“This is Claw turned into a trustworthy product surface for human relationship work, not kept as a shell-only experience.”

## Animoca Bounty
### Short Summary
SocialOS fits `Animoca Bounty` because the system already behaves like a persistent identity and memory layer rather than a one-shot assistant. A single person can accumulate linked identities, event history, follow-up context, and future draft opportunities across time. That persistence is the important proof. The product is not performing a disposable task and then forgetting the user. It maintains a durable relationship graph that can support creator, operator, and community workflows over the long term. In the Animoca video, the demo should open `/hackathon?bounty=animoca` and keep the story focused on identity continuity, people memory, linked events, and the coordination lanes that make those memories reusable. The public close should return to the canonical bounty hub anchor for Animoca and the matching proof JSON.

### Technical Implementation
The data model links `Person`, `Identity`, `Interaction`, `Event`, and draft artifacts in SQLite, while the API exposes fuzzy recall and route-aware proof metadata. The Animoca section on `/hackathon` pulls those relationships into a single narrative with agent trace, route guidance, and proof cards.

### Partner / Infrastructure Integration
Animoca is satisfied here through the product behavior itself: persistent identity, memory, and agent coordination. The relevant proof is the linked-memory architecture, not a separate plugin. Judges should see that SocialOS remembers the same person or community context across multiple steps in the loop.

### Judge-Facing Closing Line
“This is persistent identity and memory for creator and community operations, not a one-task chatbot.”

## Human for Claw
### Short Summary
SocialOS fits `Human for Claw` through Buddy mode, a deliberately narrower product route that keeps the experience safe, legible, and emotionally approachable. Instead of exposing the full operator surface, Buddy mode limits the system to four tasks: meeting new people, remembering context, generating thank-you or follow-up messages, and calm reflection. That constraint is the value. It demonstrates that the same Claw-backed system can be framed for students, families, or first-time users without pressure to publish, configure, or take risky actions. The Human for Claw video should start directly at `/buddy`, show the four safe task cards, reinforce that publishing remains `dry-run`, and then finish on the canonical human-for-claw anchor on the public hub.

### Technical Implementation
Buddy mode is implemented as a dedicated route that strips away complex settings and unsafe surfaces while reusing the same core SocialOS memory and reflection system. It is a product-layer adaptation, not a forked backend. Proof artifacts are still generated and exposed through the shared proof API.

### Partner / Infrastructure Integration
The infrastructure remains OpenClaw and SocialOS, but the integration lens changes: Human for Claw is about UX shaping and trust boundaries. The video should show that Buddy mode is intentionally smaller, clearer, and safer than the full operator route.

### Judge-Facing Closing Line
“Buddy mode is narrower on purpose: safer to trust, easier to understand, and still connected to the same real system.”

## Z.AI General
### Short Summary
SocialOS fits `Z.AI General` because GLM is wired into the product’s actual multilingual generation path. The system does not call GLM in a detached sandbox. Instead, GLM participates in judge-facing flows that already matter to the product: bilingual summary generation, route-aware Workspace support, and multilingual draft generation for social platforms used by Chinese-speaking and international users. That makes the integration credible. The Z.AI video should open `/hackathon?bounty=z-ai-general`, show the live GLM proof summary on the page, trigger `POST /integrations/glm/generate`, and then show how the same provider path informs the draft workflow. The public close should use the Z.AI anchor on `/hackathon` and the `z-ai-general.json` proof payload.

### Technical Implementation
`POST /integrations/glm/generate` returns `provider`, `model`, `live`, `fallbackUsed`, and `capturedAt`, and the same provider-aware path is reused inside `Workspace` and `Drafts`. Live proof events are written into audit evidence, surfaced by `/proofs`, and copied into repo-tracked JSON under `socialos/docs/evidence/`.

### Partner / Infrastructure Integration
The partner integration is explicit: Z.AI powers the live GLM route used for judge-facing multilingual generation. This is not simulated. The public proof JSON shows the provider, model, and capture metadata so judges can verify the integration claim without guessing.

### Judge-Facing Closing Line
“GLM is integrated into the real multilingual SocialOS loop and captured as live proof, not shown as a decorative plug-in.”

## AI Agents for Good
### Short Summary
SocialOS fits `AI Agents for Good` by reframing the same relationship-memory engine as community support and volunteer coordination infrastructure. The key problem is not answering one question about impact. The key problem is remembering people, triaging urgency, and turning that signal into concrete follow-up. In the AI for Good flow, SocialOS uses FLock to label SDG context, urgency, and a recommended next action, then keeps that action inside the same memory, event, and draft system used elsewhere in the product. The video should start from `/hackathon?bounty=ai-agents-for-good`, show the live FLock proof summary, trigger the SDG triage endpoint, and then explain how that result can drive actual follow-up with volunteers, students, or community organisers. The public close should use the AI for Good anchor and the matching proof JSON.

### Technical Implementation
`POST /integrations/flock/sdg-triage` returns structured output for SDG label, urgency, suggested action, provider, model, and capture metadata. The proof is recorded into audit evidence and then surfaced through `/proofs` and the canonical `/hackathon` hub.

### Partner / Infrastructure Integration
The partner integration is FLock itself. SocialOS relies on the live structured-model route to classify impact context and next steps, then carries that result into human follow-through. The important proof is not just the label. It is the fact that the label lands inside a longer-running coordination loop.

### Judge-Facing Closing Line
“This is not a charity chatbot. It is long-term relationship memory plus live SDG triage and action follow-through.”

## Recording Pack
- Shared backbone: `socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md`
- Bounty modules: `socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md`
- Chinese rehearsal cues: `socialos/docs/pitch/REHEARSAL_CUES_CN.md`
- Final checklist and paste-ready copy: `socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md`
- Live provider setup: `socialos/docs/HACKATHON_LIVE_PROVIDER_SETUP.md`
