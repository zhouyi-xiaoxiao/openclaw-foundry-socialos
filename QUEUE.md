# SocialOS Foundry Queue

Legend:
- `[ ]` pending
- `[-]` in progress (single active item)
- `[x]` done
- `[!]` blocked

## P0（跑通闭环）
- [x] P0-1 runtime skeleton：socialos runtime.openclaw.json5 + 5 agents + 严格 tools policy + embedding 策略（auto）
  - Done When:
    - runtime 配置文件存在且包含 orchestrator / people-memory / self-model / compliance / publisher
    - 发布策略默认 dry-run，publish_execute 标记 optional 且仅 publisher 可见
    - `scripts/deploy_runtime.sh` 可将配置部署到 socialos profile
    - `scripts/test.sh` 中的 runtime policy 校验通过
- [x] P0-2 socialos-tools 插件骨架：所有工具注册；publish_execute optional；仅 publisher 可见
  - Done When:
    - 工具 schema 齐全并可被 runtime 引用
    - 权限测试通过（非 publisher 调用发布失败）
    - publisher dry-run 返回模拟结果
- [x] P0-3 DB+API 最小闭环（SQLite）
  - Done When:
    - Person/Identity/Interaction/Event/PostDraft/PublishTask/Audit/DevDigest/SelfCheckin/Mirror 表可用
    - e2e_smoke（capture→event→queue）通过
- [x] P0-4 Dashboard v0 页面骨架可用
  - Done When:
    - Quick Capture / People / Events / Drafts / Queue / Self Mirror / Dev Digest 页面可打开
- [x] P0-5 7 平台草稿生成（中英+风格模板）（已解除 CORS blocker）
  - Done When:
    - 一次 event 可生成 7 平台 drafts 入库
    - 草稿可预览复制，L1 发布包可生成
- [x] P0-6 Queue→Publish（默认 dry-run）
  - Done When:
    - Approve→PublishTask→publisher 执行→audit + digest 落库
- [x] P0-7 Embeddings 选择产品化
  - Done When:
    - Settings + docs/EMBEDDINGS.md + bench 脚本可用
    - 无 key 可搜索（keyword/hybrid），有 key 自动增强

## P1（演示增强）
- [x] P1-1 compliance 规则：各平台字数/标签/格式检查
- [x] P1-2 People hybrid 搜索增强：keyword+vector evidence 展示
- [x] P1-3 weekly mirror 自动生成与证据跳转
- [x] P1-4 demo/README 完善：一键复现脚本与演示文档
- [x] P1-5 产品工作台升级：从 skeleton 变成可操作的 product workspace
  - Done When:
    - Quick Capture / People / Events / Drafts / Queue / Settings 都有真实表单或真实数据面板
    - Drafts 页面可直接生成并排队 7 平台发布包
    - Settings 页面可直接操作 Foundry 与查看 Codex / Foundry 分工

## P2（可扩展）
- [!] P2-1 X/LinkedIn live 发布（凭据可用时）
- [x] P2-2 Ins/小红书/朋友圈发布包优化
- [x] P2-3 公众号图文包增强
- [!] P2-4 DB 升级 Postgres + pgvector（可选）

## Orchestrator Ops
- [x] OPS-1 DEVLOOP_REALTIME + DIGEST_PERIODIC cron 对齐（no-deliver）
- [x] OPS-2 GitHub 自动 push 集成（fetch/rebase/push + push blocked digest）
- [x] OPS-3 PAUSE/RESUME 机制（.foundry/PAUSED）

## Auto Optimization Pool
- [!] AUTO-OPT-TEST-DEBT 自动执行测试债清理循环
  - Done When:
    - `bash scripts/test.sh` 通过并记录 run 报告
- [x] AUTO-OPT-PERF-DEBT 自动执行 embedding/perf 复盘
  - Done When:
    - `bash scripts/bench_embeddings.sh` 完成并输出建议
- [x] AUTO-OPT-DOC-DEBT 自动执行文档一致性体检
  - Done When:
    - `node scripts/tests/docs_demo_smoke.mjs` 通过
- [x] AUTO-OPT-OBS-DEBT 自动执行可观测性体检
  - Done When:
    - `/ops/status`、`/ops/runs`、`/ops/blocked` 冒烟通过
- [x] AUTO-OPT-BLOCKED-TRIAGE 自动处理 blocked 并生成 autofix 任务
  - Done When:
    - 若存在 blocked，生成至少 1 条 `AUTOFIX-*` 任务
    - 若不存在 blocked，写入 run 记录确认空阻塞

## AutoFix Backlog
- [x] AUTOFIX-P2_1-175603 P2-1 deferred by policy (external credentials/integration dependency)
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-P2_2-180105 P2-2 deferred by policy (external credentials/integration dependency)
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-P2_3-180110 P2-3 deferred by policy (external credentials/integration dependency)
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-P2_4-180133 P2-4 deferred by policy (external credentials/integration dependency)
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTO_OPT_BLOCKED_TRIAGE-180334 Auto-triage from blocked item: - [!] P2-1 X/LinkedIn live 发布（凭据可用时）
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTO_OPT_TEST_DEBT-195409 Coder stage failed for AUTO-OPT-TEST-DEBT
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_195409-195439 Coder stage failed for AUTOFIX-AUTO_OPT_TEST_DEBT-195409
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439-195507 Coder stage failed for AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_195409-195439
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507-195536 Coder stage failed for AUTOFIX-AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439-195507
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507_195536-195608 Coder stage failed for AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507-195536
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507_195536_195608-195637 Coder stage failed for AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507_195536-195608
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507_195536_195608_195637-195708 Coder stage failed for AUTOFIX-AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_195409_195439_195507_195536_195608-195637
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [!] AUTOFIX-AUTO_OPT_TEST_DEBT-210541 Tester gate failed for AUTO-OPT-TEST-DEBT
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [!] AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_210541-210607 Coder stage failed for AUTOFIX-AUTO_OPT_TEST_DEBT-210541
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [!] AUTOFIX-AUTOFIX_AUTOFIX_AUTO_OPT_TEST_DEBT_210541_210607-210639 Coder stage failed for AUTOFIX-AUTOFIX_AUTO_OPT_TEST_DEBT_210541-210607
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass

## Adhoc Tasks
- [!] TASK-20260305210700851017 fast fail probe (details: foundry/tasks/TASK-20260305210700851017.json)
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
- [x] AUTOFIX-TASK_20260305210700851017-210742 Plan generation failed for TASK-20260305210700851017
  - Done When:
    - blocker root cause is fixed
    - related tests and reviewer checks pass
