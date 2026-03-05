# apps/web

Dashboard v0 skeleton (loopback-only Node server).

## Run

```bash
node socialos/apps/web/server.mjs --port 4173
```

Open in browser:
- `http://127.0.0.1:4173/` (redirects to Quick Capture)
- `http://127.0.0.1:4173/quick-capture`
- `http://127.0.0.1:4173/people`
- `http://127.0.0.1:4173/events`
- `http://127.0.0.1:4173/drafts`
- `http://127.0.0.1:4173/queue`
- `http://127.0.0.1:4173/self-mirror`
- `http://127.0.0.1:4173/dev-digest`

All pages share a common layout + left navigation and render placeholder panels for follow-up iterations.
