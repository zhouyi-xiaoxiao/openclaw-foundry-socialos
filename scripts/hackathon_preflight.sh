#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${SOCIALOS_API_PORT:-8787}"
WEB_PORT="${SOCIALOS_WEB_PORT:-4173}"
LOCAL_API="http://127.0.0.1:${API_PORT}"
LOCAL_WEB="http://127.0.0.1:${WEB_PORT}"
PUBLIC_WEB="${SOCIALOS_PUBLIC_WEB_URL:-https://zhouyixiaoxiao.org}"

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

read_keychain_secret() {
  local service_name="$1"
  security find-generic-password -s "$service_name" -w 2>/dev/null || true
}

require_secret() {
  local env_name="$1"
  if [[ -z "${!env_name:-}" ]]; then
    echo "Preflight failed: missing ${env_name}. Configure the environment or macOS Keychain first." >&2
    exit 1
  fi
}

check_url() {
  local url="$1"
  if ! curl -fsS "$url" >/dev/null; then
    echo "Preflight failed: ${url} is not healthy" >&2
    exit 1
  fi
}

check_file() {
  local target="$1"
  if [[ ! -f "${target}" ]]; then
    echo "Preflight failed: missing ${target}" >&2
    exit 1
  fi
}

export HACKATHON_MODE="${HACKATHON_MODE:-all-bounties}"
export PUBLISH_MODE="${PUBLISH_MODE:-dry-run}"
export GLM_MODEL_ID="${GLM_MODEL_ID:-glm-5}"
export FLOCK_MODEL_ID="${FLOCK_MODEL_ID:-qwen3-235b-a22b-instruct-2507}"
export STRUCTURED_MODEL_TIMEOUT_MS="${STRUCTURED_MODEL_TIMEOUT_MS:-20000}"
export GLM_API_KEY="${GLM_API_KEY:-$(read_keychain_secret 'Z.ai API key')}"
export FLOCK_API_KEY="${FLOCK_API_KEY:-$(read_keychain_secret 'Flock API key')}"

echo "== SocialOS Hackathon Preflight =="

echo "[1/6] Verifying live provider configuration"
require_secret GLM_API_KEY
require_secret FLOCK_API_KEY
bash "${REPO_ROOT}/scripts/hackathon_live.sh" env-check

echo "[2/6] Restarting demo services into a clean record-ready state"
bash "${REPO_ROOT}/scripts/stop_demo.sh" >/dev/null 2>&1 || true
bash "${REPO_ROOT}/scripts/demo.sh" >/dev/null

echo "[3/6] Verifying local routes"
bash "${REPO_ROOT}/scripts/demo_status.sh"
check_url "${LOCAL_API}/health"
check_url "${LOCAL_WEB}/quick-capture"
check_url "${LOCAL_WEB}/demo"
check_url "${LOCAL_WEB}/hackathon"
check_url "${LOCAL_WEB}/buddy"

echo "[4/6] Capturing stable live hackathon proof files"
bash "${REPO_ROOT}/scripts/hackathon_live.sh" proofs

echo "[5/6] Exporting the public static proof site"
node "${REPO_ROOT}/scripts/export_vc_deck.mjs"
check_file "${REPO_ROOT}/.deck-site/index.html"
check_file "${REPO_ROOT}/.deck-site/hackathon/index.html"
check_file "${REPO_ROOT}/.deck-site/data/hackathon-overview.json"
check_file "${REPO_ROOT}/.deck-site/data/proofs/all.json"

echo "[6/6] Final URLs"
echo "- Local Workspace: ${LOCAL_WEB}/quick-capture"
echo "- Local Demo: ${LOCAL_WEB}/demo"
echo "- Local Hackathon Hub: ${LOCAL_WEB}/hackathon"
echo "- Local Buddy Mode: ${LOCAL_WEB}/buddy"
echo "- Public Deck: ${PUBLIC_WEB}/"
echo "- Public Demo Proof: ${PUBLIC_WEB}/demo/"
echo "- Public Hackathon Hub: ${PUBLIC_WEB}/hackathon/"
echo "- Public Buddy Proof: ${PUBLIC_WEB}/buddy/"
echo "- Public Proof JSON: ${PUBLIC_WEB}/data/proofs/all.json"
