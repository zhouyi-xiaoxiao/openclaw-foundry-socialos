# SocialOS Docs Index

This index is the fastest way for a human reviewer or a future agent to understand which document to read next and which files are authoritative.

## Fast Paths
- Judges and first-time reviewers: start with [`/README.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/README.md)
- Incoming agents: start with [`/AGENTS.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/AGENTS.md)
- Operators and maintainers: use [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/AGENT_PLAYBOOK.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/AGENT_PLAYBOOK.md)
- Machines and tooling: use [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/SYSTEM_MANIFEST.json`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/SYSTEM_MANIFEST.json)

## Product and Architecture
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/PRODUCT.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/PRODUCT.md)
  Product behavior and the user-facing loop.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/ARCHITECTURE.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/ARCHITECTURE.md)
  System design, data flow, and subsystem layout.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/SAFETY.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/SAFETY.md)
  Safety posture and boundaries.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/EMBEDDINGS.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/EMBEDDINGS.md)
  Retrieval and embeddings strategy.

## Demo and Pitch
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/DEMO_SCRIPT.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/DEMO_SCRIPT.md)
  Demo runbook and live flow.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/PITCH_5_MIN.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/PITCH_5_MIN.md)
  Five-minute pitch structure and timing.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/JUDGE_BRIEF.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/JUDGE_BRIEF.md)
  Short judge-oriented product brief.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/DEMO_TALK_TRACK.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/pitch/DEMO_TALK_TRACK.md)
  Exact talk track and URLs for the live demo.

## Evidence and Generated Status
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/EVIDENCE.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/EVIDENCE.md)
  Curated public evidence and demo assets.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/STATUS.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/STATUS.md)
  Generated public repo status snapshot.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/agent/REPO_STATE.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/agent/REPO_STATE.md)
  Generated repo-state handoff for agents.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/evidence/LATEST_VALIDATION.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/evidence/LATEST_VALIDATION.md)
  Generated latest validation snapshot.

## Future Implementation Specs
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/IMPORT_INBOX_SPEC.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/IMPORT_INBOX_SPEC.md)
  Real-data onboarding and review-first import flow.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/MULTI_ENTITY_CAPTURE.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/MULTI_ENTITY_CAPTURE.md)
  Multi-person, multi-interaction capture design.
- [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/LINKEDIN_MENTION_STRATEGY.md`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/docs/LINKEDIN_MENTION_STRATEGY.md)
  Suggested mentions and assisted handoff roadmap.

## Authoritative Code Files
- UI shell: [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/apps/web/server.mjs`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/apps/web/server.mjs)
- API and persistence: [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/apps/api/server.mjs`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/apps/api/server.mjs)
- Product heuristics: [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/lib/product-core.mjs`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/lib/product-core.mjs)
- Foundry task model: [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/lib/foundry-tasks.mjs`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/socialos/lib/foundry-tasks.mjs)
- Database schema: [`/Users/zhouyixiaoxiao/openclaw-foundry-socialos/infra/db/schema.sql`](/Users/zhouyixiaoxiao/openclaw-foundry-socialos/infra/db/schema.sql)

## Static vs Generated
- Curated static contracts:
  - `README.md`
  - `AGENTS.md`
  - `PRODUCT.md`
  - `ARCHITECTURE.md`
  - `SAFETY.md`
  - pitch pack docs
- Generated status outputs:
  - `STATUS.md`
  - `agent/REPO_STATE.md`
  - `evidence/LATEST_VALIDATION.md`

Refresh generated docs safely with:

```bash
node scripts/refresh_public_docs.mjs
```
