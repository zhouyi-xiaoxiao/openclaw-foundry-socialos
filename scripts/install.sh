#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${REPO_ROOT}/infra/db/socialos.db"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

mkdir -p "${REPO_ROOT}/infra/db" "${REPO_ROOT}/reports/runs" "${REPO_ROOT}/.foundry"

sqlite3 "${DB_PATH}" < "${REPO_ROOT}/infra/db/schema.sql"

node "${REPO_ROOT}/scripts/seed_demo_data.mjs"

echo "Install complete. DB initialized at ${DB_PATH}"
