#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-api}"

export SOCIALOS_API_PORT="${SOCIALOS_API_PORT:-8787}"
export SOCIALOS_WEB_PORT="${SOCIALOS_WEB_PORT:-4173}"
export HACKATHON_MODE="${HACKATHON_MODE:-all-bounties}"
export PUBLISH_MODE="${PUBLISH_MODE:-dry-run}"

# Use the strongest provider models for judge-facing bounty paths.
# These defaults are overridable via the caller's environment.
export GLM_MODEL_ID="${GLM_MODEL_ID:-glm-5}"
export FLOCK_MODEL_ID="${FLOCK_MODEL_ID:-qwen3-235b-a22b-thinking-2507}"

read_keychain_secret() {
  local service_name="$1"
  security find-generic-password -s "$service_name" -w 2>/dev/null || true
}

export GLM_API_KEY="${GLM_API_KEY:-$(read_keychain_secret 'Z.ai API key')}"
export FLOCK_API_KEY="${FLOCK_API_KEY:-$(read_keychain_secret 'Flock API key')}"

require_secret() {
  local env_name="$1"
  if [[ -z "${!env_name:-}" ]]; then
    echo "Missing ${env_name}. Add it to the environment or Keychain first." >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/hackathon_live.sh api
  bash scripts/hackathon_live.sh proofs
  bash scripts/hackathon_live.sh env-check

Commands:
  api        Start the SocialOS API with live GLM + FLock providers.
  proofs     Capture live hackathon proof snapshots using the configured providers.
  env-check  Print the non-secret provider configuration that will be used.

Notes:
  - Keys are read from macOS Keychain labels 'Z.ai API key' and 'Flock API key' by default.
  - Override GLM_MODEL_ID or FLOCK_MODEL_ID in the shell if you want a different model.
EOF
}

case "$MODE" in
  api)
    require_secret GLM_API_KEY
    require_secret FLOCK_API_KEY
    exec node "${REPO_ROOT}/socialos/apps/api/server.mjs" --port "${SOCIALOS_API_PORT}"
    ;;
  proofs)
    require_secret GLM_API_KEY
    require_secret FLOCK_API_KEY
    exec node "${REPO_ROOT}/scripts/capture_hackathon_proofs.mjs"
    ;;
  env-check)
    echo "SOCIALOS_API_PORT=${SOCIALOS_API_PORT}"
    echo "HACKATHON_MODE=${HACKATHON_MODE}"
    echo "PUBLISH_MODE=${PUBLISH_MODE}"
    echo "GLM_MODEL_ID=${GLM_MODEL_ID}"
    echo "FLOCK_MODEL_ID=${FLOCK_MODEL_ID}"
    if [[ -n "${GLM_API_KEY:-}" ]]; then
      echo "GLM_API_KEY=present"
    else
      echo "GLM_API_KEY=missing"
    fi
    if [[ -n "${FLOCK_API_KEY:-}" ]]; then
      echo "FLOCK_API_KEY=present"
    else
      echo "FLOCK_API_KEY=missing"
    fi
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown mode: ${MODE}" >&2
    usage >&2
    exit 1
    ;;
esac
