# SocialOS Agent Playbook

This playbook is the shortest safe path for a future AI/agent to operate and modify the repo.

## 1. Start the local demo
```bash
cp .env.example .env
bash scripts/demo.sh
bash scripts/demo_status.sh
```

Expected local URLs:
- Web: `http://127.0.0.1:4173/quick-capture`
- API: `http://127.0.0.1:8787/health`

## 2. Run validation
```bash
bash scripts/test.sh
```

If you are making a product/runtime change, also inspect:
```bash
bash scripts/foundry_dispatch.sh STATUS
bash scripts/status.sh
bash scripts/overnight_supervisor.sh
```

The overnight supervisor is the safe outer-loop guard:
- it checks demo health
- it checks Foundry status
- it leaves a local morning-review summary in `reports/overnight/`
- it stops mutating when safety defaults are no longer satisfied

## 3. Add a product task
Preferred path:
1. Create a structured task from the UI in `Settings`
2. Or use the API path already exposed by the product
3. Or create/update queue/task metadata through the Foundry task model

Authoritative task logic:
- `socialos/lib/foundry-tasks.mjs`
- `scripts/foundry_generic_task.mjs`

## 4. Change UI, API, or runtime safely
### UI
- Authoritative file: `socialos/apps/web/server.mjs`
- Keep one primary `Workspace` composer
- Do not reintroduce three separate top-level chat entrypoints

### API
- Authoritative file: `socialos/apps/api/server.mjs`
- Preserve loopback-only posture
- Keep `presentation.*` contract coherent for the unified workspace
- Graph and linking logic live in the same API file and the `EventPersonLink` schema layer

### Runtime
- Product runtime config: `socialos/openclaw/runtime.openclaw.json5`
- Foundry config: `foundry/openclaw.foundry.json5`
- Do not widen gateway exposure or flip default publish mode to live

## 5. Curate public evidence
- Copy representative evidence into `socialos/docs/evidence/`
- Update `socialos/docs/EVIDENCE.md`
- Refresh generated public status docs with `node scripts/refresh_public_docs.mjs`
- Do not commit:
  - live DB files
  - rolling run reports
  - auth profiles
  - local logs/pids

## 5a. Find the right docs fast
- Product demo story: `socialos/docs/pitch/`
- Public VC deck route: `/deck`
- Deck source of truth: `socialos/docs/pitch/VC_DECK_SPEC.md`
- Deck maintenance notes: `socialos/docs/pitch/DECK_MAINTENANCE.md`
- Full docs map: `socialos/docs/DOCS_INDEX.md`
- Generated public repo state: `socialos/docs/STATUS.md`
- Generated agent handoff snapshot: `socialos/docs/agent/REPO_STATE.md`
- Generated validation snapshot: `socialos/docs/evidence/LATEST_VALIDATION.md`
- Generated deck status: `socialos/docs/pitch/DECK_STATUS.json`
- Graph/linking contract: `infra/db/schema.sql` + `socialos/apps/api/server.mjs`

## 6. Before you finish
```bash
bash scripts/test.sh
node scripts/refresh_public_docs.mjs
```

For deck work specifically:
- edit copy in `socialos/docs/pitch/VC_DECK_SPEC.md`
- keep `PITCH_5_MIN.md`, `JUDGE_BRIEF.md`, and `DEMO_TALK_TRACK.md` aligned
- treat `socialos/docs/pitch/DECK_STATUS.json` as generated only
- test the deck at `/deck`, `/deck?mode=rehearsal`, and `/deck?print-pdf`

If automation was paused:
```bash
bash scripts/foundry_dispatch.sh RESUME_DEVLOOP
```

If unattended work is expected, leave an up-to-date supervisor summary:
```bash
bash scripts/overnight_supervisor.sh
```
