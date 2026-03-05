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
- [ ] P0-2 socialos-tools 插件骨架：所有工具注册；publish_execute optional；仅 publisher 可见
  - Done When:
    - 工具 schema 齐全并可被 runtime 引用
    - 权限测试通过（非 publisher 调用发布失败）
    - publisher dry-run 返回模拟结果
- [ ] P0-3 DB+API 最小闭环（SQLite）
  - Done When:
    - Person/Identity/Interaction/Event/PostDraft/PublishTask/Audit/DevDigest/SelfCheckin/Mirror 表可用
    - e2e_smoke（capture→event→queue）通过
- [ ] P0-4 Dashboard v0 页面骨架可用
  - Done When:
    - Quick Capture / People / Events / Drafts / Queue / Self Mirror / Dev Digest 页面可打开
- [ ] P0-5 7 平台草稿生成（中英+风格模板）
  - Done When:
    - 一次 event 可生成 7 平台 drafts 入库
    - 草稿可预览复制，L1 发布包可生成
- [ ] P0-6 Queue→Publish（默认 dry-run）
  - Done When:
    - Approve→PublishTask→publisher 执行→audit + digest 落库
- [ ] P0-7 Embeddings 选择产品化
  - Done When:
    - Settings + docs/EMBEDDINGS.md + bench 脚本可用
    - 无 key 可搜索（keyword/hybrid），有 key 自动增强

## P1（演示增强）
- [ ] P1-1 compliance 规则：各平台字数/标签/格式检查
- [ ] P1-2 People hybrid 搜索增强：keyword+vector evidence 展示
- [ ] P1-3 weekly mirror 自动生成与证据跳转
- [ ] P1-4 demo/README 完善：一键复现脚本与演示文档

## P2（可扩展）
- [ ] P2-1 X/LinkedIn live 发布（凭据可用时）
- [ ] P2-2 Ins/小红书/朋友圈发布包优化
- [ ] P2-3 公众号图文包增强
- [ ] P2-4 DB 升级 Postgres + pgvector（可选）

## Orchestrator Ops
- [ ] OPS-1 DEVLOOP_REALTIME + DIGEST_PERIODIC cron 对齐（no-deliver）
- [ ] OPS-2 GitHub 自动 push 集成（fetch/rebase/push + push blocked digest）
- [ ] OPS-3 PAUSE/RESUME 机制（.foundry/PAUSED）
