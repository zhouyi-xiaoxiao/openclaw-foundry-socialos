#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${REPO_ROOT}/infra/db/socialos.db"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

mkdir -p "${REPO_ROOT}/infra/db" "${REPO_ROOT}/reports/runs" "${REPO_ROOT}/.foundry"

sqlite3 "${DB_PATH}" < "${REPO_ROOT}/infra/db/schema.sql"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sqlite3 "${DB_PATH}" <<SQL
INSERT OR IGNORE INTO Person(id,name,tags,notes,next_follow_up_at,created_at,updated_at)
VALUES('person_demo_alex','Alex Growth Hacker','["growth","hackathon"]','met at weekend hackathon','${NOW}','${NOW}','${NOW}');
INSERT OR IGNORE INTO SelfCheckin(id,energy,emotions,trigger_text,reflection,created_at)
VALUES('checkin_demo_1',1,'["focused"]','shipping progress','Small daily wins compound.','${NOW}');
SQL

echo "Install complete. DB initialized at ${DB_PATH}"
