#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/socialos_profile.sh"

PROFILE="local"
DB_PATH=""
RESET_DEMO=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --db-path)
      DB_PATH="$2"
      shift 2
      ;;
    --reset-demo)
      RESET_DEMO=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

if ! node --input-type=module -e "await import('node:sqlite')" >/dev/null 2>&1; then
  echo "Node 22 or newer is required because SocialOS uses node:sqlite." >&2
  exit 1
fi

PROFILE="$(socialos_resolve_profile "${PROFILE}")"
DB_PATH="${DB_PATH:-$(socialos_default_db_path "${REPO_ROOT}" "${PROFILE}")}"
DB_PATH="$(python3 - <<'PY' "${DB_PATH}"
import os, sys
print(os.path.abspath(sys.argv[1]))
PY
)"

mkdir -p "$(dirname "${DB_PATH}")" "${REPO_ROOT}/reports/runs" "${REPO_ROOT}/.foundry"
DB_EXISTED=0
if [[ -f "${DB_PATH}" ]]; then
  DB_EXISTED=1
fi

sqlite3 "${DB_PATH}" < "${REPO_ROOT}/infra/db/schema.sql"

if [[ "${PROFILE}" == "demo" ]]; then
  PERSON_COUNT="$(sqlite3 "${DB_PATH}" 'SELECT count(*) FROM Person;')"
  if [[ "${RESET_DEMO}" == "1" || "${DB_EXISTED}" == "0" || "${PERSON_COUNT}" == "0" ]]; then
    if [[ "${RESET_DEMO}" == "1" ]]; then
      SOCIALOS_DB_PATH="${DB_PATH}" node "${REPO_ROOT}/scripts/seed_demo_data.mjs" --reset-review-demo
    else
      SOCIALOS_DB_PATH="${DB_PATH}" node "${REPO_ROOT}/scripts/seed_demo_data.mjs"
    fi
    SEEDED_MESSAGE="demo profile seeded"
  else
    SEEDED_MESSAGE="demo profile preserved"
  fi
else
  SEEDED_MESSAGE="blank local workspace ready"
fi

echo "Install complete."
echo "- profile: ${PROFILE}"
echo "- db: ${DB_PATH}"
echo "- status: ${SEEDED_MESSAGE}"
