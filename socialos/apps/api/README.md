# apps/api

Local API scaffold for SocialOS domain services (SQLite-backed, loopback-only).

## Run

```bash
node socialos/apps/api/server.mjs --help
node socialos/apps/api/server.mjs --port 8787
```

Default bind is `127.0.0.1` (no external exposure).
Cross-origin access is restricted to a loopback allowlist (`localhost` / `127.0.0.1` only). Wildcard CORS is forbidden.

## Minimal P0 endpoints

- `GET /health`
- `GET /ops/status`
  - output: mode/lock/queue/health/latest-run snapshot
- `GET /ops/runs?limit=N`
  - output: recent run reports from `reports/runs/*.json`
- `GET /ops/blocked`
  - output: blocked queue entries parsed from `QUEUE.md`
- `GET /settings/embeddings`
  - output: resolved embeddings settings (`requestedProvider`, `effectiveProvider`, `retrievalMode`, `semanticBoostEnabled`)
  - behavior:
    - with `EMBEDDINGS_PROVIDER=auto`, key present => `effectiveProvider=openai`
    - with `EMBEDDINGS_PROVIDER=auto`, key missing => `effectiveProvider=local`
- `POST /capture`
  - input: `{ "text": "...", "source": "optional" }`
  - write: `Audit(id, action, payload, created_at)` + `SelfCheckin(...)`
- `GET /self-mirror`
  - output: latest mirror + recent checkins
- `POST /self-mirror/generate`
  - input: `{ "range": "optional" }`
  - write: `Mirror(id, range_label, content, created_at)`
- `GET /dev-digest?limit=N`
  - output: latest `DevDigest` rows for Dashboard
- `POST /events`
  - input: `{ "title": "...", "captureId": "optional", "payload": {} }`
  - write: `Event(id, title, payload, created_at)`
- `POST /people/search`
  - input: `{ "query": "...", "limit": 8 }`
  - output: `retrieval.mode` + ranked people rows
  - behavior:
    - no key: `retrieval.mode=hybrid-keyword` (keyword/hybrid fallback remains available)
    - key present: `retrieval.mode=hybrid-semantic` (automatic semantic boost on top of keyword recall)
- `POST /publish/queue`
  - input: `{ "eventId": "...", "platform": "x", "mode": "dry-run|live", "language": "en", "content": "...", "frequency": "optional" }`
  - supported normalized platforms:
    - `instagram`, `x`, `linkedin`, `zhihu`, `xiaohongshu`, `wechat_moments`, `wechat_official`
  - aliases are normalized before validation/queueing (for example: `twitter` → `x`, `xhs` → `xiaohongshu`, `wechat-moments` → `wechat_moments`, `official-account` → `wechat_official`)
  - compliance checks are deterministic and platform-scoped:
    - max character length
    - max hashtag count
    - simple format checks (markdown links, fenced code blocks, raw HTML tags, malformed hashtag syntax)
  - on compliance violation returns `422` with:
    - `{ "error": "platform compliance failed", "platform": "<normalized>", "issues": [{ "code": "...", "message": "..." }] }`
  - on success write: `PostDraft(...)` then `PublishTask(...)`
  - default mode remains `dry-run` when mode is omitted or invalid
  - high-frequency payloads are tagged `noDeliver`
- `POST /publish/approve`
  - input: `{ "taskId": "...", "approvedBy": "optional", "mode": "optional", "liveEnabled": false, "credentialsReady": false }`
  - behavior:
    - approve queued task and run publisher workflow
    - update `PublishTask` execution status/result
    - append `Audit` rows (`publish_approve`, `publish_execute`)
    - append `DevDigest` row linked to execution `runId`
  - safety:
    - effective mode defaults to `dry-run`
    - live mode requires explicit env + request gating (`PUBLISH_MODE=live` or `SOCIALOS_ENABLE_LIVE_PUBLISH=1`, plus `liveEnabled=true`, plus `credentialsReady=true`)
    - high-frequency tasks remain `noDeliver` even when live is explicitly enabled

## Verification

```bash
node scripts/tests/e2e_smoke.mjs
```

Expected: `e2e_smoke: PASS ...`
