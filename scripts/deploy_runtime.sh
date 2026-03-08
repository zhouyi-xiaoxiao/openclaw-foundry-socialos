#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/socialos_profile.sh"
SRC="${REPO_ROOT}/socialos/openclaw/runtime.openclaw.json5"
DEST_DIR="${HOME}/.openclaw-socialos"
DEST="${DEST_DIR}/openclaw.json"

load_env_file() {
  local target="$1"
  if [[ -f "${target}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${target}"
    set +a
  fi
}

load_env_file "${REPO_ROOT}/.env"
load_env_file "${REPO_ROOT}/.env.local"

PROFILE="${SOCIALOS_PROFILE:-demo}"
PROFILE="$(socialos_resolve_profile "${PROFILE}")"
DB_PATH="${SOCIALOS_DB_PATH:-$(socialos_default_db_path "${REPO_ROOT}" "${PROFILE}")}"

mkdir -p "${DEST_DIR}"
cp "${SRC}" "${DEST}"
python3 - <<'PY' "${DEST}" "${DB_PATH}"
import pathlib, re, sys
target = pathlib.Path(sys.argv[1])
db_path = sys.argv[2]
content = target.read_text()
updated = re.sub(r'dbPath:\s*"[^"]+"', f'dbPath: "{db_path}"', content, count=1)
target.write_text(updated)
PY

echo "Deployed runtime config to ${DEST}"
openclaw --profile socialos config validate --json
