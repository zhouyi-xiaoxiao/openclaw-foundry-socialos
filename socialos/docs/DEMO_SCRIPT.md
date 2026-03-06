# SocialOS Demo Script (stable P1)

## 0. Goal
Show a local-first SocialOS product loop that is:
- reproducible
- safe-by-default
- evidence-backed
- not dependent on live publish credentials

## 1. Bootstrap
```bash
bash scripts/demo.sh
```

Expected highlights:
- install/bootstrap runs
- demo seed data lands in SQLite
- runtime deploy validates
- `runtime_policy_check` passes
- API health is up
- Web health is up

## 2. Verify demo health
```bash
bash scripts/demo_status.sh
```

Expected health checks:
- API returns `{"ok":true}`
- Web returns the unified `Workspace` page
- loopback-only ports are bound

## 3. Full validation before presenting
```bash
bash scripts/test.sh
```

The validation suite now covers:
- `runtime_policy_check`
- `e2e_smoke`
- `capture_parse_commit_smoke`
- `people_detail_smoke`
- `draft_validation_smoke`
- `manual_publish_flow_smoke`
- `mirror_evidence_smoke`
- `audio_capture_smoke`
- `business_card_ocr_smoke`
- `weekly_mirror_smoke`
- `ops_api_smoke`
- `web_routes_smoke`

## 4. Suggested demo flow (5-10 minutes)
### Step A. Confirm runtime status
```bash
bash scripts/demo_status.sh
bash scripts/foundry_dispatch.sh STATUS
```

Then open:
- `http://127.0.0.1:4173/quick-capture`
- `http://127.0.0.1:4173/settings`
- `http://127.0.0.1:4173/settings?panel=ops`

### Step B. Unified Workspace capture
- Open `http://127.0.0.1:4173/quick-capture`
- Type a raw note about meeting someone or use the voice/image input lane
- Show the assistant response plus one primary card
- Save the resulting contact/memory suggestion when relevant

Talk track:
- The main surface is one workspace, not three competing home pages.
- Capture and recall happen in the same place.
- Voice stays editable before sending.

### Step C. People detail
- Open `http://127.0.0.1:4173/people`
- Search by keyword fragment
- Open the detail card
- Show identities, timeline, evidence, follow-up suggestion

### Step D. Event -> Drafts
- Open `http://127.0.0.1:4173/events`
- Create an event with audience/language/tone
- Open `http://127.0.0.1:4173/drafts`
- Generate the 7-platform package set:
  - English only for `LinkedIn / X / Instagram`
  - Chinese only for `知乎 / 小红书 / 微信朋友圈 / 微信公众号`
- Edit one draft and run validation

### Step E. Queue / Publish
- Queue one draft
- Approve it
- Show it moves to `manual_step_needed`
- Record a manual outcome (`posted` or `failed`)

Talk track:
- P1 prioritizes product trust over risky automation.
- Assisted handoff is the default lane.

### Step F. Self Mirror
- Open `http://127.0.0.1:4173/self-mirror`
- Generate a mirror
- Expand one conclusion and show evidence

## 5. Safety line to say out loud
- API stays loopback-only.
- Publish mode stays `dry-run` by default.
- No widening of `gateway.bind`, `gateway.tailscale`, or `gateway.auth`.
- Live publish still needs explicit credentials and operator intent.

## 6. Public evidence
- curated public evidence: `socialos/docs/EVIDENCE.md`
- representative run report snapshots: `socialos/docs/evidence/`
- runtime config: `socialos/openclaw/runtime.openclaw.json5`
- test suite: `bash scripts/test.sh`
- one automation pass: `bash scripts/devloop_once.sh`

## 7. Stop the demo cleanly
```bash
bash scripts/stop_demo.sh
```
