# apps/api

Local API scaffold for SocialOS domain services (SQLite-backed, loopback-only).

## Run

```bash
node socialos/apps/api/server.mjs --help
node socialos/apps/api/server.mjs --port 8787
```

Default bind is `127.0.0.1` (no external exposure).

## Minimal P0 endpoints

- `POST /capture`
  - input: `{ "text": "...", "source": "optional" }`
  - write: `Audit(id, action, payload, created_at)`
- `POST /events`
  - input: `{ "title": "...", "captureId": "optional", "payload": {} }`
  - write: `Event(id, title, payload, created_at)`
- `POST /publish/queue`
  - input: `{ "eventId": "...", "platform": "x", "mode": "dry-run|live", "language": "en", "content": "...", "frequency": "optional" }`
  - write: `PostDraft(...)` then `PublishTask(...)`
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
- `GET /health`

## Verification

```bash
node scripts/tests/e2e_smoke.mjs
```

Expected: `e2e_smoke: PASS ...`
