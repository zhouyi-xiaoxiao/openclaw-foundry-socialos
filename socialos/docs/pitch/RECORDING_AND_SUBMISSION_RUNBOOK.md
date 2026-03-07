# SocialOS Recording and Submission Runbook

This is the final execution document for recording and submitting the five DoraHacks bounty entries.

## 1. One-Time Preflight
Run:

```bash
cd /Users/zhouyixiaoxiao/openclaw-foundry-socialos
bash scripts/hackathon_preflight.sh
```

This command:

- verifies live GLM and FLock keys
- restarts the local demo in record-ready mode
- checks `/demo`, `/hackathon`, and `/buddy`
- refreshes repo-tracked live proof JSON
- exports the public static site into `.deck-site/`

## 2. Tabs To Open
Local:

- `http://127.0.0.1:4173/quick-capture`
- `http://127.0.0.1:4173/demo`
- `http://127.0.0.1:4173/hackathon`
- `http://127.0.0.1:4173/buddy`

Public:

- `https://zhouyixiaoxiao.org/`
- `https://zhouyixiaoxiao.org/hackathon/`
- `https://zhouyixiaoxiao.org/data/proofs/all.json`

## 3. Video Pack Strategy
Submit `5 independent videos`, one per bounty. Each video should be `5-8 minutes` and stand on its own.

Shared structure for every video:

1. title and bounty name
2. problem
3. solution
4. technical implementation
5. bounty-specific integration
6. short live demo
7. public verification close

Use:

- shared backbone: `socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md`
- bounty modules: `socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md`

## 4. Video-By-Video Checklist
### Claw for Human
- Local start: `http://127.0.0.1:4173/demo`
- What to show: `Workspace -> Contacts -> Drafts -> Queue -> Self Mirror`, then OpenClaw trace
- Public close: `https://zhouyixiaoxiao.org/hackathon/#bounty-claw-for-human`
- Proof JSON: `https://zhouyixiaoxiao.org/data/proofs/claw-for-human.json`
- Deck appendix: `Slide 9`

### Animoca Bounty
- Local start: `http://127.0.0.1:4173/hackathon?bounty=animoca`
- What to show: persistent people memory, linked identities, linked events, agent lanes
- Public close: `https://zhouyixiaoxiao.org/hackathon/#bounty-animoca`
- Proof JSON: `https://zhouyixiaoxiao.org/data/proofs/animoca.json`
- Deck appendix: `Slide 10`

### Human for Claw
- Local start: `http://127.0.0.1:4173/buddy`
- What to show: four safe tasks, no risky publish lane, calm reflection
- Public close: `https://zhouyixiaoxiao.org/hackathon/#bounty-human-for-claw`
- Proof JSON: `https://zhouyixiaoxiao.org/data/proofs/human-for-claw.json`
- Deck appendix: `Slide 11`

### Z.AI General
- Local start: `http://127.0.0.1:4173/hackathon?bounty=z-ai-general`
- What to show: live GLM proof summary, `POST /integrations/glm/generate`, multilingual draft flow
- Public close: `https://zhouyixiaoxiao.org/hackathon/#bounty-z-ai-general`
- Proof JSON: `https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json`
- Deck appendix: `Slide 12`

### AI Agents for Good
- Local start: `http://127.0.0.1:4173/hackathon?bounty=ai-agents-for-good`
- What to show: live FLock SDG triage, urgency, suggested action, follow-up framing
- Public close: `https://zhouyixiaoxiao.org/hackathon/#bounty-ai-agents-for-good`
- Proof JSON: `https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json`
- Deck appendix: `Slide 13`

## 5. DoraHacks Paste-Ready Repo Description
Use:

> SocialOS is a local-first relationship and identity operating system that turns messy real-world inputs into people memory, event context, multilingual draft packages, trust-first queue handoff, and evidence-backed reflection. For DoraHacks, the repo ships one shared product with five fully packaged submission angles: Claw for Human, Animoca Bounty, Human for Claw, Z.AI General, and AI Agents for Good.

## 6. DoraHacks Paste-Ready Integration Lines
### Claw for Human
> SocialOS integrates OpenClaw as the runtime coordination layer behind a calm, human-readable relationship workspace. The demo route is `/demo`, and the public proof anchor is `/hackathon/#bounty-claw-for-human`.

### Animoca Bounty
> SocialOS demonstrates persistent identity, linked memory, and coordinated agent lanes across people, events, and follow-up actions. The canonical proof anchor is `/hackathon/#bounty-animoca`.

### Human for Claw
> SocialOS exposes a dedicated Buddy mode with four safe tasks and a smaller trust-first surface for first-time or younger users. The canonical proof anchor is `/hackathon/#bounty-human-for-claw`.

### Z.AI General
> SocialOS integrates GLM through `POST /integrations/glm/generate` and the real multilingual draft workflow, with public provider proof published at `/data/proofs/z-ai-general.json`.

### AI Agents for Good
> SocialOS integrates FLock through `POST /integrations/flock/sdg-triage`, turning SDG labeling, urgency, and suggested action into a reusable follow-up workflow. Public proof is published at `/data/proofs/ai-agents-for-good.json`.

## 7. Final Submission Checklist
For each bounty, attach:

- one bounty-specific `5-8 minute` video
- the public GitHub repo
- the deck root: `https://zhouyixiaoxiao.org/`
- the canonical public bounty hub: `https://zhouyixiaoxiao.org/hackathon/`
- the matching proof JSON

## 8. Final GitHub / Pages Steps
1. Run `bash scripts/test.sh`
2. Confirm `.deck-site/index.html`
3. Confirm `.deck-site/hackathon/index.html`
4. Confirm `.deck-site/data/proofs/all.json`
5. Commit the repo changes
6. Push to `main`
7. Wait for `.github/workflows/deploy-deck.yml`
8. Re-open `https://zhouyixiaoxiao.org/` and `https://zhouyixiaoxiao.org/hackathon/`
