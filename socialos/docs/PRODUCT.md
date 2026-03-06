# SocialOS Product Spec (stable P1)

## One-liner
SocialOS = people memory + 7-platform campaign workbench + self mirror, all running local-first with a Foundry execution layer.

## Product goals
- 可演示：Quick Capture -> People -> Event -> Drafts -> Queue -> Self Mirror 六段链路都能在 UI 内完成。
- 可复现：`bash scripts/demo.sh` 后直接可用，页面不是空壳。
- 可扩展：发布层按 `L1 assisted -> L2 gated` 递进；embedding provider 可切换；Foundry 可接结构化产品任务。
- 可解释：搜索、mirror、publish handoff 都要带 evidence / preflight / audit 线索。

## Current stable P1 capabilities
### 1. Quick Capture
- 文本输入是主路径，支持两段式 `parse -> commit`。
- 输出结构化 `Person Draft + Self Check-in Draft + Interaction Draft`。
- 支持图片/名片和音频作为 capture asset：
  - 图片默认走本地 OCR，失败时回退人工确认。
  - 音频默认浏览器/手动 transcript，失败时回退人工编辑。
- Commit 后必须落到：
  - `Person`
  - `Identity`
  - `Interaction`
  - `SelfCheckin`
  - `Audit`

### 2. People
- 支持 keyword/hybrid 搜索。
- 支持联系人详情页：
  - 基础档案
  - 多平台 identity
  - 互动时间线
  - evidence 片段
  - follow-up suggestion
- 支持在详情页直接补 identity / interaction。

### 3. Events & Campaigns
- Event 表单包含：
  - title
  - capture link
  - audience
  - language strategy
  - tone
  - links
  - assets
  - payload details
- Generate Drafts 会生成 7 平台 package：
  - Instagram
  - X
  - LinkedIn
  - 知乎
  - 小红书
  - 微信朋友圈
  - 微信公众号

### 4. Drafts
- 每个平台 draft 至少包含：
  - support level
  - entry target
  - blocked by
  - publish package
  - editable content
  - variants
  - validation result
- 编辑器在 P1 为纯文本编辑 + 卡片预览，不引入富文本。
- Validation 分类：
  - platform format
  - pii
  - sensitive wording

### 5. Queue / Publish
- 状态模型：
  - `queued`
  - `manual_step_needed`
  - `posted`
  - `failed`
- P1 策略：
  - `X / LinkedIn`: 只做 connector preflight + assisted handoff，不承诺 live auto-post。
  - `Instagram / 小红书 / 知乎 / 朋友圈 / 公众号`: 全部稳定在 `L1 assisted`。
- 所有 publish 行为都写：
  - `PublishTask`
  - `Audit`
  - `DevDigest`

### 6. Self Mirror
- 输出结构：
  - `summaryText`
  - `themes`
  - `energizers`
  - `drainers`
  - `conclusions[3]`
  - `evidence`
- 每条 conclusion 都可以 drill-down 到 `MirrorEvidence`。

## Platform support levels
- `Instagram`: L1 Assisted
- `X`: L2 Auto Publish (credentials gated, P1 only preflight)
- `LinkedIn`: L2 Auto Publish (credentials gated, P1 only preflight)
- `知乎`: L1 Assisted
- `小红书`: L1 Assisted+
- `微信朋友圈`: L1 Assisted+
- `微信公众号`: L1.5 Rich Article Package

## Foundry / Codex split
### Foundry
- 接 quick / structured task
- 做 PlanSpec / coder / tester / reviewer 编排
- 跑巡检和 digest
- 处理 generic task 执行链

### Codex
- 负责复杂跨文件改造
- UI 工作台产品化
- runtime / API / Web / docs / tests 一致性改造
- blocked 解锁、dry-run 方案、紧急人工介入

### Human still required
- live publish 决策
- 凭据与登录态
- 品牌语气和最终内容判断

## P1 acceptance
- 从空 DB 启动 demo，5 分钟内可完成：
  - 录入一个人
  - 找到这个人
  - 创建一个 event
  - 生成 7 平台 drafts
  - 入队并记录一条 manual publish outcome
  - 生成一条 mirror 并打开 evidence
