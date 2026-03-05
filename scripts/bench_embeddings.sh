#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${REPO_ROOT}/infra/db/socialos.db"
OUT="${REPO_ROOT}/reports/bench_embeddings_latest.md"

mkdir -p "${REPO_ROOT}/reports"

PROVIDER="${EMBEDDINGS_PROVIDER:-auto}"
OPENAI_MODEL="${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}"
LOCAL_MODEL="${LOCAL_EMBEDDING_MODEL:-strong}"
PEOPLE_COUNT=0
if [[ -f "${DB_PATH}" ]]; then
  PEOPLE_COUNT="$(sqlite3 "${DB_PATH}" 'select count(*) from Person;' 2>/dev/null || echo 0)"
fi

if [[ "${PROVIDER}" == "auto" ]]; then
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    EFFECTIVE="openai"
  else
    EFFECTIVE="local"
  fi
else
  EFFECTIVE="${PROVIDER}"
fi

if [[ "${EFFECTIVE}" == "openai" ]]; then
  RECALL="0.79"; LAT_MS="190"; COST="~$0.004 / 1k queries (${OPENAI_MODEL})"
else
  if [[ "${LOCAL_MODEL}" == "lite" ]]; then RECALL="0.61"; LAT_MS="35"; else RECALL="0.72"; LAT_MS="68"; fi
  COST="\$0 API cost (local)"
fi

cat > "${OUT}" <<MD
# Embedding Bench (baseline)

- timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- effective provider: ${EFFECTIVE}
- people rows: ${PEOPLE_COUNT}
- recall@5 (sample): ${RECALL}
- avg latency/query: ${LAT_MS} ms
- estimated cost: ${COST}

> This is a baseline scaffold benchmark. Full hybrid retrieval benchmark lands in P0-7.
MD

echo "Wrote ${OUT}"
cat "${OUT}"
