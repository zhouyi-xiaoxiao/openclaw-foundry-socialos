# apps/api

Local API scaffold for SocialOS domain services (SQLite-backed, loopback-only).

## Run

```bash
node socialos/apps/api/server.mjs --help
node socialos/apps/api/server.mjs --port 8787
```

Default bind is `127.0.0.1` (no external exposure).

## Minimal P0-3 endpoints

- `POST /capture`
  - input: `{ "text": "...", "source": "optional" }`
  - write: `Audit(id, action, payload, created_at)`
- `POST /events`
  - input: `{ "title": "...", "captureId": "optional", "payload": {} }`
  - write: `Event(id, title, payload, created_at)`
- `POST /publish/queue`
  - input: `{ "eventId": "...", "platform": "x", "mode": "dry-run", "language": "en", "content": "..." }`
  - write: `PostDraft(...)` then `PublishTask(...)`
- `GET /health`

## Verification

```bash
node scripts/tests/e2e_smoke.mjs
```

Expected: `e2e_smoke: PASS ...`
