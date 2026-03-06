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
```

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

### Runtime
- Product runtime config: `socialos/openclaw/runtime.openclaw.json5`
- Foundry config: `foundry/openclaw.foundry.json5`
- Do not widen gateway exposure or flip default publish mode to live

## 5. Curate public evidence
- Copy representative evidence into `socialos/docs/evidence/`
- Update `socialos/docs/EVIDENCE.md`
- Do not commit:
  - live DB files
  - rolling run reports
  - auth profiles
  - local logs/pids

## 6. Before you finish
```bash
bash scripts/test.sh
```

If automation was paused:
```bash
bash scripts/foundry_dispatch.sh RESUME_DEVLOOP
```
