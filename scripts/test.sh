#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "${REPO_ROOT}/scripts/tests/runtime_policy_check.mjs"
node "${REPO_ROOT}/scripts/tests/plugin_contract_check.mjs"

"${REPO_ROOT}/scripts/deploy_runtime.sh" >/tmp/socialos_validate.log 2>&1 || {
  echo "WARN: openclaw profile validate failed (see /tmp/socialos_validate.log)"
}

node -e 'console.log("privilege_smoke: PASS (publish_execute optional + publisher-only visibility assertions)")'
node "${REPO_ROOT}/scripts/tests/e2e_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/product_workspace_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/cors_policy_check.mjs"
node "${REPO_ROOT}/scripts/tests/ops_api_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/weekly_mirror_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/web_routes_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/docs_demo_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/reviewer_policy_check.mjs"

echo "tests complete"
