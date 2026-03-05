# SocialOS Product Spec (P0 → P2)

## One-liner
SocialOS = 全平台社交内容战役（Campaign）+ 人脉长期记忆（People Memory）+ 自我镜像（Self Mirror）的个人社交操作系统（local-first）。

## Product goals
- **全自动构建**：Foundry 按 QUEUE 自动迭代（无需人工确认）。
- **可复现**：GitHub clone 后可一键安装与本地启动。
- **可演示**：Dashboard 覆盖 capture → people → campaigns → queue/publish → mirror → digest 主链路。
- **可扩展**：发布层按 L0/L1/L2 分级；embedding provider 可插拔。

## Platform coverage (必须覆盖 7 平台)
1. Instagram（Ins）
2. X（Twitter）
3. LinkedIn
4. 知乎
5. 小红书
6. 微信朋友圈
7. 微信公众号（订阅号/服务号图文后台）

## Support levels (UI + docs 必须标注)
- **L0 Draft（全平台必有）**
  - 平台风格草稿：标题/正文/标签/CTA/emoji/图片建议
  - 一键复制
  - 一键打开发布入口或步骤说明
- **L1 Assisted（默认）**
  - 生成发布包：caption/标签/配图建议/排版/注意事项
  - 打开对应发布入口（网页/后台/手机步骤）
  - 最终点击发布由用户完成
- **L2 Auto Publish（扩展能力，高风险）**
  - 通过官方 API/浏览器自动化发布
  - 仅 publisher agent 可执行
  - 默认 dry-run；仅在 live 显式开启后可真发

## Core UX loop (Demo 必须可跑通)
### A) Quick Capture
输入：文字（P0 必须），语音/名片图（P1）
输出两张卡：
1) Person Card：姓名/标签/平台账号/下次跟进/备注
2) Self Check-in：能量(-2..+2)/情绪标签/价值触发/一句话感受
Confirm 后写入 DB + 可读记忆档案（people/self）。

### B) People
- 每人详情页：多平台身份、互动时间线、聊过主题、下次跟进建议
- 模糊搜索：支持“上周 hackathon 那个做增长的”检索
- 结果必须带 evidence（命中证据片段）

### C) Events & Campaigns
- 创建 Event（时间地点要点、受众、语言策略）
- 一次生成 7 平台草稿（中英 + 平台风格）
- 草稿可预览/编辑/复制

### D) Queue / Publish
- 草稿批量入队
- 默认 dry-run
- 可自动平台（优先 X/LinkedIn）支持 L2（需 key/登录态）
- 半自动平台（Ins/小红书/朋友圈/公众号/知乎）至少 L1 发布包 + 入口步骤
- 全流程写审计日志

### E) Self Mirror
- 每周自动生成（支持手动触发）
- 输出：主题词 TOP、充电/耗电的人、3 条画像结论（含证据）、下周小实验

## Runtime multi-agent policy (socialos profile)
- orchestrator：拆任务调度；禁止发布/browser/exec
- people-memory：联系人抽取 + DB + memory/people 写入
- self-model：self check-in + mirror 写入
- compliance：隐私/平台规则检查（尽量只读）
- publisher：唯一允许发布执行能力（默认 dry-run）

## Publish safety policy
默认 `PUBLISH_MODE=dry-run`。仅当以下条件全部满足才允许 live：
1. 环境变量 `PUBLISH_MODE=live`
2. Dashboard Settings 显式开启 live
3. 该平台 key/登录态可用

## Embeddings strategy (必须可复现)
配置：
- `EMBEDDINGS_PROVIDER=auto|openai|local`
- `OPENAI_API_KEY`（可空）
- `OPENAI_EMBEDDING_MODEL=text-embedding-3-small|text-embedding-3-large`
- `LOCAL_EMBEDDING_MODEL=lite|strong`
- `DUAL_INDEX=0|1`

Auto fallback：
- 有 OPENAI_API_KEY → openai
- 无 key → local
- keyword 搜索永远可用（兜底）

基准参考（展示于 UI + docs）：
- text-embedding-3-small: MTEB avg 62.3
- text-embedding-3-large: MTEB avg 64.6

## Dev Digest productization
每次 dev-loop 成功/失败必须同步：
- DB `DevDigest`
- `reports/LATEST.md`
- Dashboard `Dev Digest` 页面（What/Why/Risk/Verify/Next）

## Operational controls
支持命令：
- `RUN_DEVLOOP_ONCE`
- `ADD_TASK: <text>`
- `PAUSE_DEVLOOP` / `RESUME_DEVLOOP`（`.foundry/PAUSED`）
- `STATUS`
- `SET_PUBLISH_MODE: dry-run|live`

## Cron requirements
- `DEVLOOP_REALTIME`: `*/30 * * * * *`，isolated，no-deliver，message=`RUN_DEVLOOP_ONCE`
- `DIGEST_PERIODIC`: `0 */15 * * * *`，isolated，no-deliver，message=`SEND_DIGEST_NOTIFICATION`
- 队列无待办时不得空跑：自动切换到 `AUTO-OPT-CONTINUOUS`，生成优化方案并执行一次优化循环（测试 + embeddings bench）

## Delivery boundary
只 push 产品仓库内容（代码/配置/文档）。禁止提交 secrets 与 Foundry 私有 state：
- `~/.openclaw-foundry`
- auth profiles/tokens
- runtime private logs
