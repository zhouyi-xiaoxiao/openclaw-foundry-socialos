# Embeddings Product Settings

This project supports a **safe-by-default retrieval path**:
- no API key → keyword/hybrid search still works
- API key present → semantic enhancement is enabled automatically

## Runtime settings

Set via environment variables (see `.env.example`):

- `EMBEDDINGS_PROVIDER=auto|openai|local`
- `OPENAI_API_KEY=`
- `OPENAI_EMBEDDING_MODEL=text-embedding-3-small|text-embedding-3-large`
- `LOCAL_EMBEDDING_MODEL=lite|strong`
- `DUAL_INDEX=0|1`

## Effective provider resolution

When `EMBEDDINGS_PROVIDER=auto`:

1. If `OPENAI_API_KEY` is present and non-empty:
   - `effectiveProvider=openai`
   - retrieval mode becomes `hybrid-semantic`
2. If no key is present:
   - `effectiveProvider=local`
   - retrieval mode remains `hybrid-keyword`

You can inspect the resolved mode at:

- `GET /settings/embeddings`

## Search behavior

`POST /people/search` always keeps keyword matching available.

- Without key: returns `retrieval.mode=hybrid-keyword`
- With key: returns `retrieval.mode=hybrid-semantic` and applies semantic boost scoring

This ensures search is usable in no-key local setups while still upgrading automatically when credentials exist.

## Dashboard setting surface

Dashboard includes a `Settings` page placeholder (`/settings`) for:
- provider selection UX (`auto/openai/local`)
- fallback explanation (`no key => still searchable`)
- benchmark entrypoint documentation

## Benchmark script

Run:

```bash
./scripts/bench_embeddings.sh
```

Output: `reports/bench_embeddings_latest.md`

The benchmark report records effective provider, retrieval mode, sample recall/latency, and estimated cost to support product decision-making.
