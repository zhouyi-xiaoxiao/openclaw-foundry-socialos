# SocialOS Hackathon Bounty Guide

SocialOS is submitting one shared product loop to five bounty tracks:

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

## Shared Routes
Local interactive routes:
- `/demo`
- `/hackathon`
- `/buddy`
- `/deck`

Public read-only routes:
- `https://zhouyixiaoxiao.org/`
- `https://zhouyixiaoxiao.org/demo/`
- `https://zhouyixiaoxiao.org/hackathon/`
- `https://zhouyixiaoxiao.org/buddy/`
- `https://zhouyixiaoxiao.org/data/proofs/all.json`

## Shared API Proof Surfaces
- `GET /hackathon/overview`
- `GET /proofs`
- `POST /integrations/glm/generate`
- `POST /integrations/flock/sdg-triage`

## Bounty Matrix
### Claw for Human
- Why it fits: SocialOS turns OpenClaw-powered lanes into a guided, human-readable relationship workspace.
- Local demo route: `/demo`
- Public proof route: `https://zhouyixiaoxiao.org/demo/`
- What to show: Workspace -> Contacts -> Drafts -> Queue -> Mirror, then OpenClaw trace.
- Exact line to say: "This is Claw translated into a calm relationship product, not kept as a shell-only experience."
- Proof sources: `/demo`, `/proofs?bounty=claw-for-human`, `socialos/openclaw/runtime.openclaw.json5`

### Animoca Bounty
- Why it fits: SocialOS already has persistent people memory, linked identities, and explicit agent coordination lanes.
- Local demo route: `/hackathon?bounty=animoca`
- Public proof route: `https://zhouyixiaoxiao.org/hackathon/`
- What to show: identity memory, linked people/events, and Studio lane coordination.
- Exact line to say: "This is persistent identity and memory, not a one-shot agent task."
- Proof sources: `/hackathon`, `/proofs?bounty=animoca`, `infra/db/schema.sql`

### Human for Claw
- Why it fits: Buddy mode narrows the system into four safe tasks and removes risky publish behavior.
- Local demo route: `/buddy`
- Public proof route: `https://zhouyixiaoxiao.org/buddy/`
- What to show: the four safe tasks, trust-first defaults, and the absence of live publish pressure.
- Exact line to say: "Buddy mode is intentionally narrower, safer, and easier to trust."
- Proof sources: `/buddy`, `/proofs?bounty=human-for-claw`, `socialos/apps/web/server.mjs`

### Z.AI General
- Why it fits: SocialOS already routes provider-aware generation through Workspace and Drafts, with GLM as the target provider path.
- Local demo route: `/hackathon?bounty=z-ai-general`
- Public proof route: `https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json`
- What to show: bilingual generation proof, provider routing, and multilingual draft flow.
- Exact line to say: "This environment is integration-ready and honest: GLM is shown in fallback mode unless a live key is configured."
- Proof sources: `/integrations/glm/generate`, `/proofs?bounty=z-ai-general`, `socialos/docs/evidence/hackathon-glm-generate.json`

### AI Agents for Good
- Why it fits: the same memory and follow-through loop can support volunteer coordination and impact workflows, not just content.
- Local demo route: `/hackathon?bounty=ai-agents-for-good`
- Public proof route: `https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json`
- What to show: SDG triage, urgency, suggested action, and the handoff into follow-up coordination.
- Exact line to say: "This is not a charity chatbot; it is long-term relationship memory plus action follow-through."
- Proof sources: `/integrations/flock/sdg-triage`, `/proofs?bounty=ai-agents-for-good`, `socialos/docs/evidence/hackathon-flock-triage.json`

## Honest Integration Status
- `OpenClaw`: live in the product architecture and demo flow
- `GLM`: fallback/demo mode until `GLM_API_KEY` is configured
- `FLock`: fallback/demo mode until `FLOCK_API_KEY` is configured

## Submission Pack
- Master recording script: `socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md`
- Bounty swap lines: `socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md`
- Recording + submission runbook: `socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md`
- Chinese rehearsal cues: `socialos/docs/pitch/REHEARSAL_CUES_CN.md`
- Stable proof snapshots: `socialos/docs/evidence/hackathon-*.json`
