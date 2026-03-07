# SocialOS Recording and Submission Runbook

## 1. Preflight
Run:

```bash
bash scripts/hackathon_preflight.sh
```

This command:
- verifies or boots the local demo
- checks local judge routes
- refreshes stable hackathon proof files
- exports the public static proof site into `.deck-site/`

## 2. Tabs To Open Before Recording
Local:
- `http://127.0.0.1:4173/quick-capture`
- `http://127.0.0.1:4173/people`
- `http://127.0.0.1:4173/drafts`
- `http://127.0.0.1:4173/queue`
- `http://127.0.0.1:4173/self-mirror`
- `http://127.0.0.1:4173/demo`
- `http://127.0.0.1:4173/hackathon`
- `http://127.0.0.1:4173/buddy`

Public:
- `https://zhouyixiaoxiao.org/`
- `https://zhouyixiaoxiao.org/demo/`
- `https://zhouyixiaoxiao.org/hackathon/`
- `https://zhouyixiaoxiao.org/buddy/`
- `https://zhouyixiaoxiao.org/data/proofs/all.json`

## 3. Recording Order
1. Follow `DORAHACKS_MASTER_SCRIPT.md`.
2. Use localhost for the interactive product loop.
3. Use the public site only for the “after the video, judges can verify here” segment.
4. Insert one bounty swap from `DORAHACKS_BOUNTY_SWAPS.md`.

## 4. What To Attach Or Link
For every bounty submission:
- Video: master recording plus the correct bounty swap
- Repo: `README.md`
- Public deck: `https://zhouyixiaoxiao.org/`
- Public hackathon hub: `https://zhouyixiaoxiao.org/hackathon/`

For `Claw for Human`:
- `https://zhouyixiaoxiao.org/demo/`

For `Human for Claw`:
- `https://zhouyixiaoxiao.org/buddy/`

For `Z.AI General`:
- `https://zhouyixiaoxiao.org/data/proofs/z-ai-general.json`

For `AI Agents for Good`:
- `https://zhouyixiaoxiao.org/data/proofs/ai-agents-for-good.json`

## 5. DoraHacks Paste-Ready Repo Description
Use:

> SocialOS is a local-first relationship and identity operating system that turns messy real-world inputs into people memory, event context, platform-native drafts, and evidence-backed reflection. For DoraHacks, we submit one shared product loop with five bounty-specific proof angles: Claw for Human, Animoca, Human for Claw, Z.AI General, and AI Agents for Good.

## 6. Honesty Lines For Judges
- `GLM` is wired and demonstrated in fallback mode unless a live key is configured.
- `FLock` SDG triage is wired and demonstrated in fallback mode unless a live key is configured.
- The interactive demo remains localhost-only by design.
- The public site is a read-only proof surface, not a public runtime.

## 7. Final GitHub / Pages Steps
1. Run `bash scripts/test.sh`
2. Verify `.deck-site/demo/index.html`, `.deck-site/hackathon/index.html`, `.deck-site/buddy/index.html`
3. Commit the repo changes
4. Push to `main`
5. Wait for `.github/workflows/deploy-deck.yml` to finish
6. Re-open `https://zhouyixiaoxiao.org/`, `/demo/`, `/hackathon/`, `/buddy/`
