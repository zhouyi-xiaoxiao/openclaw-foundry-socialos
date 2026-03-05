#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_LOG="/tmp/socialos_deploy.log"
POLICY_LOG="/tmp/socialos_demo_policy.log"

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

echo ""
echo "== Demo Ready =="
echo "bootstrap: PASS"
if [[ "${DEPLOY_STATUS}" == "PASS" ]]; then
  echo "runtime deploy: PASS (details: ${DEPLOY_LOG})"
else
  echo "runtime deploy: WARN (validation failed; inspect ${DEPLOY_LOG})"
fi

echo ""
echo "Safety defaults (unchanged):"
echo "- local-first posture"
echo "- API loopback-only (127.0.0.1)"
echo "- default publish mode: dry-run"
echo "- no widening of gateway.bind / gateway.tailscale / gateway.auth"

echo ""
echo "Next steps:"
echo "- Run full checks: bash ${REPO_ROOT}/scripts/test.sh"
echo "- Follow runbook: ${REPO_ROOT}/socialos/docs/DEMO_SCRIPT.md"
echo "- Run one automation pass: bash ${REPO_ROOT}/scripts/devloop_once.sh"
echo "- Inspect latest digest: ${REPO_ROOT}/reports/LATEST.md"
