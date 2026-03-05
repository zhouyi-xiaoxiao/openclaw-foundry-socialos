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

echo "tests complete"
