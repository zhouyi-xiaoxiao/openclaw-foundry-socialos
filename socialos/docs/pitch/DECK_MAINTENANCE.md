# SocialOS Deck Maintenance

This doc explains how to maintain the public VC deck without drifting from the pitch docs or introducing unsafe public state.

## Public Route
- Main deck: `/deck`
- Rehearsal mode: `/deck?mode=rehearsal`
- Print mode: `/deck?print-pdf`

## Curated Files
These are edited by hand and should stay stable:
- `socialos/docs/pitch/PITCH_5_MIN.md`
- `socialos/docs/pitch/JUDGE_BRIEF.md`
- `socialos/docs/pitch/DEMO_TALK_TRACK.md`
- `socialos/docs/pitch/VC_DECK_SPEC.md`
- `socialos/docs/pitch/DECK_MAINTENANCE.md`

## Generated Files
These are refreshed by script and should not be hand-edited:
- `socialos/docs/STATUS.md`
- `socialos/docs/agent/REPO_STATE.md`
- `socialos/docs/evidence/LATEST_VALIDATION.md`
- `socialos/docs/pitch/DECK_STATUS.json`

## Runtime Assets
- Deck renderer: `socialos/apps/web/server.mjs`
- Static export script: `scripts/export_vc_deck.mjs`
- Pages workflow: `.github/workflows/deploy-deck.yml`
- Reveal runtime assets:
  - `socialos/apps/web/vendor/reveal/reveal.min.css`
  - `socialos/apps/web/vendor/reveal/reveal.min.js`
  - `socialos/apps/web/vendor/reveal/notes.min.js`

## How To Change Copy
1. Edit `socialos/docs/pitch/VC_DECK_SPEC.md` first.
2. Keep `PITCH_5_MIN.md`, `JUDGE_BRIEF.md`, and `DEMO_TALK_TRACK.md` aligned with the same narrative.
3. Update deck rendering only after the curated pitch docs are coherent.

## How To Swap Visuals
1. Put curated screenshots or GIFs in `socialos/docs/evidence/`.
2. Reference only stable evidence files.
3. Avoid linking to local demo URLs in public deck mode.

## How To Refresh Generated Deck Status
```bash
node scripts/refresh_public_docs.mjs
```

That refresh updates `DECK_STATUS.json` together with the existing generated public docs.

## How To Export The Public Deck
```bash
bash scripts/demo.sh
node scripts/export_vc_deck.mjs
```

That export writes a static site artifact into `.deck-site/` with:
- `index.html`
- `deck/index.html`
- `deck/print/index.html`
- `CNAME`

The GitHub Pages workflow publishes that artifact for the public domain.

## How To Test The Deck
```bash
bash scripts/test.sh
node scripts/tests/deck_route_smoke.mjs
```

Manual checks:
- open `/deck`
- open `/deck?mode=rehearsal`
- open `/deck?print-pdf`
- verify that public mode does not expose localhost-only links
- run `node scripts/export_vc_deck.mjs` and verify `.deck-site/index.html` exists

## Drift Rules
- `DECK_STATUS.json` can change automatically.
- Slide copy and slide order must not be auto-generated.
- If the deck changes, the pitch docs must remain the source of truth.
