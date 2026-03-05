# SocialOS Demo Runbook (P1-4)

This runbook is for a **local-first** demo of the current baseline (capture → queue/publish dry-run → digest evidence).

## 0) Demo goal & boundary
- Goal: show the end-to-end SocialOS loop is reproducible from one command.
- Boundary: keep runtime local, keep publish mode dry-run, keep external delivery disabled for high-frequency jobs.
- Safety posture must remain unchanged: no widening of `gateway.bind`, `gateway.tailscale`, or `gateway.auth` exposure.

## 1) One-command bootstrap (required)
```bash
bash scripts/demo.sh
```

Expected key output:
- `Install complete. DB initialized ...`
- `runtime_policy_check: PASS`
- `== Demo Ready ==`
- `api health: PASS (http://127.0.0.1:8787/health)`
- `web health: PASS (http://127.0.0.1:4173/quick-capture)`

If runtime deploy validation fails, check `/tmp/socialos_deploy.log` (bootstrap still keeps local safety defaults).

## 2) Full validation gate (recommended before presenting)
```bash
bash scripts/test.sh
```

This includes runtime/policy checks and e2e smoke coverage for:
- publish safety defaults (`dry-run`)
- publisher-only execution boundaries
- loopback-only API posture
- capture/event/queue/approve flow + web routes

## 3) Demo flow (10–15 min)

### Step A — Confirm baseline status
```bash
bash scripts/status.sh
bash scripts/foundry_dispatch.sh STATUS
```

Talk track:
- Queue + digest are visible in one place.
- Runtime is designed for autonomous one-item devloop iterations.

### Step B — Show docs + product loop map
- Open `socialos/docs/PRODUCT.md` for scope (7-platform campaign + people memory + self mirror).
- Open `socialos/docs/ARCHITECTURE.md` for safety boundary and publish pipeline.
- Open dashboard:
  - `http://127.0.0.1:4173/dev-digest`
  - `http://127.0.0.1:4173/quick-capture`

### Step C — Execute one automation iteration
```bash
bash scripts/devloop_once.sh
# or explicitly through dispatcher:
bash scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE
```

Then inspect latest digest/report:
```bash
bash scripts/status.sh
sed -n '1,40p' reports/LATEST.md
```

Talk track:
- Devloop processes exactly one queue item per run.
- Digest is persisted as human-readable evidence.

### Step D — Verify demo artifacts
- Runtime config source: `socialos/openclaw/runtime.openclaw.json5`
- Runtime deploy target: `~/.openclaw-socialos/openclaw.json`
- DB file: `infra/db/socialos.db`
- Run reports: `reports/runs/`

## 4) Presenter checklist
- [ ] Mention default mode is `dry-run` and live publish remains gated.
- [ ] Mention API/runtime posture is local-first and loopback-only.
- [ ] Mention no external exposure changes are required for this demo.
- [ ] Show latest digest/report as verifiable output.

## 5) Troubleshooting
- Re-run bootstrap:
  ```bash
  bash scripts/demo.sh
  ```
- Re-run tests:
  ```bash
  bash scripts/test.sh
  ```
- Deploy validation logs:
  - `/tmp/socialos_deploy.log`
  - `/tmp/socialos_validate.log`
