# SocialOS Runtime (Foundry Autopilot)

Local-first social operating system scaffold:
- Campaign generation across 7 platforms
- People memory + fuzzy retrieval baseline
- Self mirror + dev digest rails
- OpenClaw multi-agent runtime profile (`socialos`)

## Quickstart
```bash
./scripts/install.sh
./scripts/demo.sh
```

## Daily operations
```bash
./scripts/devloop_once.sh       # process exactly 1 queue item
./scripts/status.sh             # show queue + digest status
./scripts/pause_devloop.sh      # create .foundry/PAUSED
./scripts/resume_devloop.sh     # resume loop
./scripts/test.sh               # runtime policy + smoke checks
./scripts/bench_embeddings.sh   # baseline embedding benchmark output
```

When the queue has no pending product tasks, devloop auto-switches to `AUTO-OPT-CONTINUOUS` (optimization cycle) instead of idle noop.

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
