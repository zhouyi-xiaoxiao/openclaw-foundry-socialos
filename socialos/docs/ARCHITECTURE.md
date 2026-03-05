# SocialOS Architecture (initial)

- **apps/web**: Dashboard UI (Quick Capture, People, Events, Drafts, Queue, Mirror, Dev Digest)
- **apps/api**: local API (or Next API routes in later iterations)
- **openclaw/runtime.openclaw.json5**: socialos profile runtime config
- **openclaw/plugins/socialos-tools**: business tool registry + policy metadata
- **infra/db**: SQLite-first local persistence
- **reports/**: human-readable and machine-readable run summaries

Safety boundary:
- only publisher can run `publish_execute`
- live publish requires env + UI + credentials simultaneously
