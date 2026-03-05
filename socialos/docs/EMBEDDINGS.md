# Embeddings Choice Guide

Config knobs:
- EMBEDDINGS_PROVIDER=auto|openai|local
- OPENAI_API_KEY=
- OPENAI_EMBEDDING_MODEL=text-embedding-3-small|text-embedding-3-large
- LOCAL_EMBEDDING_MODEL=lite|strong
- DUAL_INDEX=0|1

Auto behavior:
- key exists => openai
- key missing => local
- keyword search always available as fallback

Reference quality:
- text-embedding-3-small: MTEB avg 62.3
- text-embedding-3-large: MTEB avg 64.6

Local tiers:
- local-lite: faster + smaller footprint
- local-strong: better recall, higher resource usage

Run benchmark:
- `./scripts/bench_embeddings.sh`
- Outputs: recall@k, avg latency, and estimated API cost (if openai)
