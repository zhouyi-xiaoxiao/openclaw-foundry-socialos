#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/socialos_profile.sh"

ENV_PATH="${REPO_ROOT}/.env"
ENV_LOCAL_PATH="${REPO_ROOT}/.env.local"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-path)
      ENV_PATH="$2"
      shift 2
      ;;
    --env-local-path)
      ENV_LOCAL_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -f "${ENV_PATH}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_PATH}"
  set +a
fi

if [[ -f "${ENV_LOCAL_PATH}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_LOCAL_PATH}"
  set +a
fi

have_command() {
  command -v "$1" >/dev/null 2>&1
}

node_sqlite_ready() {
  node --input-type=module -e "await import('node:sqlite')" >/dev/null 2>&1
}

bool_label() {
  if [[ "$1" == "1" ]]; then
    printf 'yes\n'
  else
    printf 'no\n'
  fi
}

print_row() {
  local capability="$1"
  local status="$2"
  local unlocks="$3"
  printf ' - %-24s | %-24s | %s\n' "${capability}" "${status}" "${unlocks}"
}

PROFILE_RAW="${SOCIALOS_PROFILE:-demo}"
PROFILE="$(socialos_resolve_profile "${PROFILE_RAW}" 2>/dev/null || printf 'demo\n')"
DB_PATH="${SOCIALOS_DB_PATH:-$(socialos_default_db_path "${REPO_ROOT}" "${PROFILE}")}"

ENV_EXISTS=0
ENV_LOCAL_EXISTS=0
NODE_READY=0
PYTHON_READY=0
SQLITE_READY=0
NODE_SQLITE_READY=0
OPENAI_READY=0
GLM_READY=0
FLOCK_READY=0
TELEGRAM_TOKEN_READY=0
TELEGRAM_CHAT_READY=0
TELEGRAM_WEBHOOK_READY=0

[[ -f "${ENV_PATH}" ]] && ENV_EXISTS=1
[[ -f "${ENV_LOCAL_PATH}" ]] && ENV_LOCAL_EXISTS=1
have_command node && NODE_READY=1
have_command python3 && PYTHON_READY=1
have_command sqlite3 && SQLITE_READY=1
if [[ "${NODE_READY}" == "1" ]] && node_sqlite_ready; then
  NODE_SQLITE_READY=1
fi
[[ -n "${OPENAI_API_KEY:-}" ]] && OPENAI_READY=1
[[ -n "${GLM_API_KEY:-}" ]] && GLM_READY=1
[[ -n "${FLOCK_API_KEY:-}" ]] && FLOCK_READY=1
[[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] && TELEGRAM_TOKEN_READY=1
[[ -n "${TELEGRAM_DEFAULT_CHAT_ID:-}" ]] && TELEGRAM_CHAT_READY=1
[[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]] && TELEGRAM_WEBHOOK_READY=1

CORE_READY=0
if [[ "${NODE_READY}" == "1" && "${PYTHON_READY}" == "1" && "${SQLITE_READY}" == "1" && "${NODE_SQLITE_READY}" == "1" ]]; then
  CORE_READY=1
fi

REQUESTED_EMBEDDINGS="$(printf '%s' "${EMBEDDINGS_PROVIDER:-auto}" | tr '[:upper:]' '[:lower:]')"
case "${REQUESTED_EMBEDDINGS}" in
  auto|local|openai) ;;
  *) REQUESTED_EMBEDDINGS="auto" ;;
esac

EFFECTIVE_EMBEDDINGS="${REQUESTED_EMBEDDINGS}"
if [[ "${REQUESTED_EMBEDDINGS}" == "auto" ]]; then
  if [[ "${OPENAI_READY}" == "1" ]]; then
    EFFECTIVE_EMBEDDINGS="openai"
  else
    EFFECTIVE_EMBEDDINGS="local"
  fi
fi

OPENAI_EMBEDDING_MODEL_VALUE="${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}"
LOCAL_EMBEDDING_MODEL_VALUE="${LOCAL_EMBEDDING_MODEL:-strong}"
GLM_MODEL_VALUE="${GLM_MODEL_ID:-glm-4.7}"
FLOCK_MODEL_VALUE="${FLOCK_MODEL_ID:-qwen3-30b-a3b-instruct-2507}"

DEMO_READY="${CORE_READY}"
LOCAL_READY="${CORE_READY}"
TELEGRAM_READY=0
if [[ "${TELEGRAM_TOKEN_READY}" == "1" && "${TELEGRAM_CHAT_READY}" == "1" ]]; then
  TELEGRAM_READY=1
fi

echo "== SocialOS Provider Doctor =="
echo "Files:"
echo "- .env: $([[ "${ENV_EXISTS}" == "1" ]] && printf 'found' || printf 'missing') (${ENV_PATH})"
echo "- .env.local: $([[ "${ENV_LOCAL_EXISTS}" == "1" ]] && printf 'found' || printf 'missing') (${ENV_LOCAL_PATH})"
echo "- profile: ${PROFILE}"
echo "- db: ${DB_PATH}"
echo "- embeddings provider intent: ${REQUESTED_EMBEDDINGS}"
echo "- effective embeddings provider: ${EFFECTIVE_EMBEDDINGS}"
echo ""
echo "Summary:"
echo "- Demo-ready: $(bool_label "${DEMO_READY}")"
echo "- Local reuse-ready: $(bool_label "${LOCAL_READY}")"
echo "- Live bounty providers ready: GLM $(bool_label "${GLM_READY}"), FLock $(bool_label "${FLOCK_READY}"), Telegram $(bool_label "${TELEGRAM_READY}")"
echo ""
echo "Capability matrix:"

if [[ "${CORE_READY}" == "1" ]]; then
  print_row "Core app" "ready now" "Run the local web app, API, demo profile, and blank local profile."
else
  print_row "Core app" "missing dependency" "Install node 22+, sqlite3, and python3 before running quickstart."
fi

if [[ "${REQUESTED_EMBEDDINGS}" == "openai" && "${OPENAI_READY}" != "1" ]]; then
  print_row "Embeddings" "missing key" "Set OPENAI_API_KEY to activate ${OPENAI_EMBEDDING_MODEL_VALUE}; otherwise switch to EMBEDDINGS_PROVIDER=auto or local."
elif [[ "${EFFECTIVE_EMBEDDINGS}" == "openai" ]]; then
  print_row "Embeddings" "ready now" "Semantic retrieval and semantic boost use ${OPENAI_EMBEDDING_MODEL_VALUE}."
else
  LOCAL_STATUS="ready now"
  if [[ "${REQUESTED_EMBEDDINGS}" == "auto" ]]; then
    LOCAL_STATUS="degrades to local fallback"
  fi
  print_row "Embeddings" "${LOCAL_STATUS}" "Search stays usable with the local ${LOCAL_EMBEDDING_MODEL_VALUE} model and keyword fallback."
fi

if [[ "${OPENAI_READY}" == "1" ]]; then
  print_row "Voice note transcription" "ready now" "Enable automatic transcription and refinement for uploaded voice notes."
else
  print_row "Voice note transcription" "optional" "The app still works; add OPENAI_API_KEY if you want automatic voice transcription instead of browser-only speech recognition."
fi

if [[ "${GLM_READY}" == "1" ]]; then
  print_row "GLM / Z.AI" "ready now" "Unlock live GLM routing for Workspace and Draft generation using ${GLM_MODEL_VALUE}."
else
  print_row "GLM / Z.AI" "missing key" "Set GLM_API_KEY to unlock the live Z.AI route and GLM-backed generation."
fi

if [[ "${FLOCK_READY}" == "1" ]]; then
  print_row "FLock / SDG triage" "ready now" "Unlock live SDG triage and next-step guidance using ${FLOCK_MODEL_VALUE}."
else
  print_row "FLock / SDG triage" "missing key" "Set FLOCK_API_KEY to unlock live AI Agents for Good triage."
fi

if [[ "${TELEGRAM_READY}" == "1" ]]; then
  if [[ "${TELEGRAM_WEBHOOK_READY}" == "1" ]]; then
    print_row "Telegram" "ready now" "Volunteer channel send plus webhook proof are available."
  else
    print_row "Telegram" "ready now" "Volunteer channel send is available; add TELEGRAM_WEBHOOK_SECRET if you want webhook proof too."
  fi
else
  print_row "Telegram" "optional" "Set TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHAT_ID to enable the volunteer channel."
fi

echo ""
echo "Recommended commands:"
echo "- Demo reproduction: bash scripts/quickstart.sh"
echo "- Blank local workspace: bash scripts/quickstart.sh --profile local"
echo "- Stop local services: bash scripts/stop_demo.sh"
echo "- Re-check providers: bash scripts/provider_doctor.sh"
