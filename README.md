# SocialOS Runtime (Foundry Autopilot)

Local-first social operating system scaffold:
- Campaign generation across 7 platforms
- People memory + fuzzy retrieval baseline
- Self mirror + dev digest rails
- OpenClaw multi-agent runtime profile (`socialos`)

## One-command reproducible demo (recommended)
```bash
bash scripts/demo.sh
```

`bash scripts/demo.sh` is the canonical bootstrap path for this repo. It will:
1. Run install/bootstrap (`scripts/install.sh`) and seed SQLite demo data.
2. Deploy runtime config to local profile (`~/.openclaw-socialos/openclaw.json`, log at `/tmp/socialos_deploy.log`).
3. Run runtime policy smoke check (`runtime_policy_check`) so default safety rails are validated.
4. Print next-step runbook commands.

## Quickstart (fresh clone)
```bash
git clone <this-repo>
cd openclaw-foundry-socialos
bash scripts/demo.sh
```

## Demo runbook
- Canonical demo flow: `socialos/docs/DEMO_SCRIPT.md`
- One automation pass: `bash scripts/devloop_once.sh`
- Dispatcher control: `bash scripts/foundry_dispatch.sh <COMMAND>`
- Status + latest digest: `bash scripts/status.sh`
- Full validation suite: `bash scripts/test.sh`

When the queue has no pending product tasks, devloop auto-switches to `AUTO-OPT-*` optimization lanes instead of idle noop.

## Safety defaults (must remain local-first)
- API exposure remains loopback-only (`127.0.0.1`).
- Default publish mode is `dry-run`.
- Live publish still requires explicit multi-gate enablement (env + UI intent + credentials).
- High-frequency automation jobs stay no-deliver.
- Do **not** widen `gateway.bind` / `gateway.tailscale` / `gateway.auth` exposure in demo setup.

## Daily operations
```bash
./scripts/devloop_once.sh       # process exactly 1 queue item
./scripts/foundry_dispatch.sh STATUS
./scripts/foundry_dispatch.sh ADD_TASK:"..."
./scripts/foundry_dispatch.sh PAUSE_DEVLOOP
./scripts/foundry_dispatch.sh RESUME_DEVLOOP
./scripts/foundry_dispatch.sh SET_PUBLISH_MODE:dry-run
./scripts/status.sh             # show queue + digest status
./scripts/pause_devloop.sh      # create .foundry/PAUSED
./scripts/resume_devloop.sh     # resume loop
./scripts/test.sh               # runtime policy + smoke checks
./scripts/bench_embeddings.sh   # baseline embedding benchmark output
```

## Runtime profile
- Source config: `socialos/openclaw/runtime.openclaw.json5`
- Deploy to local profile: `./scripts/deploy_runtime.sh`

## Product docs
- `socialos/docs/PRODUCT.md`
- `socialos/docs/ARCHITECTURE.md`
- `socialos/docs/DEMO_SCRIPT.md`
- `socialos/docs/SAFETY.md`
- `socialos/docs/AUTH.md`
- `socialos/docs/EMBEDDINGS.md`
