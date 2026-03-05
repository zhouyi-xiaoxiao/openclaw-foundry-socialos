# SocialOS Runtime Roadmap (Autopilot)

## Phase P0 — End-to-end local-first MVP
1. Runtime skeleton + agent policies + publish safety gates
2. socialos-tools plugin contract + dry-run publish path
3. SQLite domain model + API minimal loop
4. Dashboard pages (capture/people/events/drafts/queue/mirror/digest)
5. 7-platform draft generation templates
6. Queue→publish audit trail + dev digest productization
7. Embeddings provider abstraction + fallback + bench

## Phase P1 — Demo quality + quality gates
1. Compliance checks per platform
2. Better hybrid retrieval + evidence UI
3. Weekly mirror automation and explainability
4. Demo scripts, docs polish, reproducibility hardening

## Phase P2 — Optional production expansion
1. Live publish connectors for X/LinkedIn (credential-gated)
2. Assisted package upgrades for Ins/小红书/朋友圈/公众号
3. Postgres + pgvector migration path
4. Operational scaling guardrails

## Continuous Foundry loop
- Trigger: `RUN_DEVLOOP_ONCE` (manual) + `DEVLOOP_REALTIME` cron every 30s
- Single-run contract: 1 queue item per run
- No-task contract: auto-seed/reopen `AUTO-OPT-CONTINUOUS`, execute optimization in same run (no idle spinning)
- Failure contract: mark blocked, rollback, no infinite retry
- Push contract: fetch/rebase before run; push main + tags after successful merge
