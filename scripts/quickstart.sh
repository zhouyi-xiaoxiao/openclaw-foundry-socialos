#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/socialos_profile.sh"

PROFILE="demo"
DB_PATH=""
ENV_LOCAL_PATH="${REPO_ROOT}/.env.local"
RESET_DEMO=0
SKIP_START=0

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
    --env-local-path)
      ENV_LOCAL_PATH="$2"
      shift 2
      ;;
    --reset-demo)
      RESET_DEMO=1
      shift
      ;;
    --skip-start|--no-start)
      SKIP_START=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

PROFILE="$(socialos_resolve_profile "${PROFILE}")"
DB_PATH="${DB_PATH:-$(socialos_default_db_path "${REPO_ROOT}" "${PROFILE}")}"
PROFILE_LABEL="$(python3 - <<'PY' "${PROFILE}"
import sys
print(sys.argv[1].capitalize())
PY
)"

echo "== SocialOS Quickstart =="
echo "[1/5] Ensuring base environment file"
if [[ ! -f "${REPO_ROOT}/.env" && -f "${REPO_ROOT}/.env.example" ]]; then
  cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
  echo "Created ${REPO_ROOT}/.env from .env.example"
fi

echo "[2/5] Preparing ${PROFILE} profile"
bash "${REPO_ROOT}/scripts/install.sh" --profile "${PROFILE}" --db-path "${DB_PATH}" $([[ "${RESET_DEMO}" == "1" ]] && printf '%s' '--reset-demo')

echo "[3/5] Writing local profile selection"
socialos_write_env_local "${ENV_LOCAL_PATH}" "${PROFILE}" "${DB_PATH}"

if [[ "${SKIP_START}" == "0" ]]; then
  echo "[4/5] Restarting local services for the selected profile"
  node "${REPO_ROOT}/scripts/demo_service_control.mjs" stop >/dev/null 2>&1 || true
  node "${REPO_ROOT}/scripts/demo_service_control.mjs" start
  echo "[5/5] Local services are ready"
else
  echo "[4/5] Skipping local service start"
  echo "[5/5] Profile files are ready"
fi

API_PORT="${SOCIALOS_API_PORT:-8787}"
WEB_PORT="${SOCIALOS_WEB_PORT:-4173}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"

echo ""
echo "== SocialOS ${PROFILE_LABEL} Profile =="
echo "- profile: ${PROFILE}"
echo "- db: ${DB_PATH}"
echo "- env override: ${ENV_LOCAL_PATH}"
echo ""
echo "Open locally:"
echo "- App workspace: ${WEB_URL}/quick-capture"
echo "- Deck: ${WEB_URL}/deck"
echo "- Demo flow: ${WEB_URL}/demo"
echo "- Hackathon hub: ${WEB_URL}/hackathon"
echo "- Buddy mode: ${WEB_URL}/buddy"
echo "- API health: ${API_URL}/health"
echo ""
echo "Public proof surface:"
echo "- Deck: https://zhouyixiaoxiao.org/"
echo "- Hackathon hub: https://zhouyixiaoxiao.org/hackathon/"
echo "- Videos: https://zhouyixiaoxiao.org/videos/"
echo "- Proof JSON: https://zhouyixiaoxiao.org/data/proofs/all.json"
echo ""
echo "Next commands:"
echo "- Stop local services: bash ${REPO_ROOT}/scripts/stop_demo.sh"
echo "- Demo status: bash ${REPO_ROOT}/scripts/demo_status.sh"
echo "- Reset demo profile: bash ${REPO_ROOT}/scripts/quickstart.sh --profile demo --reset-demo"
echo "- Start a blank local workspace: bash ${REPO_ROOT}/scripts/quickstart.sh --profile local"
