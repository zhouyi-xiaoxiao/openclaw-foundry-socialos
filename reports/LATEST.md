Run: 20260305_132821_P1-1
What: Completed P1-1 platform compliance guardrails in publish queue (per-platform char/hashtag/format validation, alias normalization, structured 422 issues), plus smoke-test and docs coverage.
Why: Prevent non-compliant drafts from entering the publish queue and make failures deterministic + explainable across 7 target platforms.
Risk: low (validation-only gate; existing delivery defaults, loopback exposure, and high-frequency no-deliver semantics unchanged).
Verify: openclaw config validate; openclaw doctor; node -c socialos/apps/api/server.mjs; node scripts/tests/e2e_smoke.mjs; bash scripts/test.sh
Next: continue to next unchecked queue item
