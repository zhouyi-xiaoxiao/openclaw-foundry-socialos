# SocialOS Architecture (initial)

- **apps/web**: Dashboard UI (Quick Capture, People, Events, Drafts, Queue, Mirror, Dev Digest)
- **apps/api**: local API (or Next API routes in later iterations)
- **openclaw/runtime.openclaw.json5**: socialos profile runtime config
- **openclaw/plugins/socialos-tools**: business tool registry + policy metadata
- **infra/db**: SQLite-first local persistence
- **reports/**: human-readable and machine-readable run summaries

Publish pipeline (P0-6, P1-1 compliance gate):
- `POST /publish/queue` first runs deterministic platform compliance, then writes `PostDraft` + queued `PublishTask` on success
  - normalized platforms: `instagram`, `x`, `linkedin`, `zhihu`, `xiaohongshu`, `wechat_moments`, `wechat_official`
  - checks: character limit, hashtag-count limit, and simple format checks (markdown link, fenced code, raw HTML, malformed hashtag)
  - violations are rejected with `HTTP 422`:
    - `{ error: "platform compliance failed", platform: <normalized>, issues: [{ code, message }] }`
- `POST /publish/approve` performs Approve → publisher workflow execution
- execution persists:
  - `PublishTask.status/result` update
  - `Audit` rows for `publish_approve` and `publish_execute`
  - `DevDigest` row linked by `run_id`

Safety boundary:
- API server remains loopback-only (`127.0.0.1`)
- only publisher can run `publish_execute`
- default publish mode remains `dry-run`
- live publish requires explicit gates (env + UI intent + credentials)
- high-frequency tasks stay `noDeliver` (suppressed external dispatch)
