# SocialOS Foundry Queue

Legend:
- `[ ]` pending
- `[-]` in progress
- `[x]` done
- `[!]` blocked

## Product Backlog
- [x] P0-1 runtime skeleton + 5-agent policy boundary
- [x] P0-2 socialos-tools/plugin contract + publisher-only publish action
- [x] P0-3 SQLite + API minimum closed loop
- [x] P0-4 dashboard page skeleton
- [x] P0-5 7-platform draft generation
- [x] P0-6 queue -> publish dry-run baseline
- [x] P0-7 embeddings productization
- [x] P1-1 platform compliance validation
- [x] P1-2 people hybrid search + evidence
- [x] P1-3 weekly mirror + evidence drill-down
- [x] P1-4 demo/bootstrap/docs polish
- [x] P1-5 product workspace upgrade
- [x] P1-6 quick capture parse -> commit workflow
- [x] P1-7 people detail page + identity/timeline actions
- [x] P1-8 draft edit + validation storage
- [x] P1-9 manual publish handoff + posted/failed write-back
- [x] P1-10 multimodal capture assets (audio + business card)

## P2 Blocked
- [!] P2-1 X / LinkedIn true live publish
  - blocked by: credentials + login state + live decision
- [!] P2-4 Postgres + pgvector migration
  - blocked by: infra scope upgrade, not needed for stable P1

## Foundry Ops
- [x] OPS-1 cron alignment (`DEVLOOP_REALTIME`, `DIGEST_PERIODIC`)
- [x] OPS-2 git push integration lane
- [x] OPS-3 pause/resume controls
- [x] OPS-4 generic structured task execution
- [x] OPS-5 llm-task health surface in Settings and `/ops/cluster`

## Auto Optimization Pool
- [x] AUTO-OPT-TEST-DEBT
- [x] AUTO-OPT-PERF-DEBT
- [x] AUTO-OPT-DOC-DEBT
- [x] AUTO-OPT-OBS-DEBT
- [x] AUTO-OPT-BLOCKED-TRIAGE

## AutoFix Backlog
- [!] AUTOFIX-AUTO_OPT_TEST_DEBT-015144 Coder stage failed for AUTO-OPT-TEST-DEBT
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_015144-015214 Coder stage failed for AUTOFIX-AUTO_OPT_TEST_DEBT-015144
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [!] AUTOFIX-AUTO_OPT_TEST_DEBT-193455 Tester gate failed for AUTO-OPT-TEST-DEBT
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_193455-193543 Coder stage failed for AUTOFIX-AUTO_OPT_TEST_DEBT-193455
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
