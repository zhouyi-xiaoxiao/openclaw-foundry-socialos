Run: 20260305_125428_P0-7
What: Completed P0-7 embeddings productization (settings endpoints, docs, benchmark, no-key fallback + keyed auto-enhancement)
Why: Ensure search remains usable without API keys while transparently improving relevance when embeddings keys are available
Risk: low (semantic scoring is heuristic pending future provider-backed retrieval hardening)
Verify: bash scripts/bench_embeddings.sh; node scripts/tests/e2e_smoke.mjs
Next: continue to next unchecked queue item