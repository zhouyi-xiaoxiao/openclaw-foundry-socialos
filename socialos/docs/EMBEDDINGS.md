# Embeddings Product Settings

SocialOS keeps search usable with or without cloud credentials.

## Supported config
- `EMBEDDINGS_PROVIDER=auto|openai|local`
- `OPENAI_API_KEY=`
- `OPENAI_EMBEDDING_MODEL=text-embedding-3-small|text-embedding-3-large`
- `LOCAL_EMBEDDING_MODEL=lite|strong`
- `DUAL_INDEX=0|1`

## Effective provider resolution
When `EMBEDDINGS_PROVIDER=auto`:

1. `OPENAI_API_KEY` present -> `effectiveProvider=openai`
2. no key -> `effectiveProvider=local`

This resolution is surfaced by:
- `GET /settings/embeddings`
- `GET /settings/runtime`
- Dashboard `Settings` page

## Retrieval modes
- no key -> `hybrid-keyword`
- key present -> `hybrid-semantic`

Keyword fallback is always preserved, so People search never becomes unusable in local-only setups.

## Product behavior
- Search results are ranked with blended keyword/semantic scoring.
- People detail exposes evidence rows so retrieval stays explainable.
- This is enough for P1; `pgvector` still stays in `P2-4`.

## Reference quality targets
- `text-embedding-3-small`: MTEB avg 62.3
- `text-embedding-3-large`: MTEB avg 64.6
- local profile defaults are documented as `lite` / `strong` so the repo stays portable.

## Benchmarking
Run:
```bash
./scripts/bench_embeddings.sh
```

The latest benchmark is written to:
- `reports/bench_embeddings_latest.md`
