#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_LOG="/tmp/socialos_deploy.log"
POLICY_LOG="/tmp/socialos_demo_policy.log"
API_PORT="${SOCIALOS_API_PORT:-8787}"
WEB_PORT="${SOCIALOS_WEB_PORT:-4173}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"
NODE_BIN="$(command -v node)"
CONTROL_SCRIPT="${REPO_ROOT}/scripts/demo_service_control.mjs"

wait_for_http() {
  local url="$1"
  local retries="${2:-25}"
  local sleep_sec="${3:-0.3}"
  local i
  for i in $(seq 1 "${retries}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${sleep_sec}"
  done
  return 1
}

echo "== SocialOS Demo Bootstrap (one command) =="

echo "[1/3] Install + seed local DB"
"${REPO_ROOT}/scripts/install.sh"

echo "[2/3] Deploy runtime profile"
if "${REPO_ROOT}/scripts/deploy_runtime.sh" >"${DEPLOY_LOG}" 2>&1; then
  DEPLOY_STATUS="PASS"
else
  DEPLOY_STATUS="WARN"
fi

echo "[3/3] Validate runtime safety policy"
node "${REPO_ROOT}/scripts/tests/runtime_policy_check.mjs" >"${POLICY_LOG}" 2>&1
cat "${POLICY_LOG}"

echo "[4/4] Start local API + Web"
if ! "${NODE_BIN}" --input-type=module -e "await import('node:sqlite')" >/dev/null 2>&1; then
  echo "ERROR: node binary does not support node:sqlite: ${NODE_BIN}" >&2
  echo "Use a newer Node runtime (>=22) before running demo."
  exit 1
fi

node "${CONTROL_SCRIPT}" start

if wait_for_http "${API_URL}/health"; then
  API_HEALTH="PASS"
else
  API_HEALTH="WARN"
fi

if wait_for_http "${WEB_URL}/quick-capture"; then
  WEB_HEALTH="PASS"
else
  WEB_HEALTH="WARN"
fi

echo ""
echo "== Demo Ready =="
echo "bootstrap: PASS"
if [[ "${DEPLOY_STATUS}" == "PASS" ]]; then
  echo "runtime deploy: PASS (details: ${DEPLOY_LOG})"
else
  echo "runtime deploy: WARN (validation failed; inspect ${DEPLOY_LOG})"
fi
echo "api health: ${API_HEALTH} (${API_URL}/health)"
echo "web health: ${WEB_HEALTH} (${WEB_URL}/quick-capture)"

echo ""
echo "Safety defaults (unchanged):"
echo "- local-first posture"
echo "- API loopback-only (127.0.0.1)"
echo "- default publish mode: dry-run"
echo "- no widening of gateway.bind / gateway.tailscale / gateway.auth"

echo ""
echo "Next steps:"
echo "- Demo status: bash ${REPO_ROOT}/scripts/demo_status.sh"
echo "- Stop demo: bash ${REPO_ROOT}/scripts/stop_demo.sh"
echo "- Run full checks: bash ${REPO_ROOT}/scripts/test.sh"
echo "- Follow runbook: ${REPO_ROOT}/socialos/docs/DEMO_SCRIPT.md"
echo "- Workspace: ${WEB_URL}/quick-capture"
echo "- Settings / Ops Digest: ${WEB_URL}/settings?panel=ops"
echo "- API ops: ${API_URL}/ops/status"
echo "- Run one automation pass: bash ${REPO_ROOT}/scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE"
echo "- Public evidence: ${REPO_ROOT}/socialos/docs/EVIDENCE.md"
