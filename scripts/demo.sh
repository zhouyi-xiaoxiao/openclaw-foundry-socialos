#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${REPO_ROOT}/scripts/install.sh"
"${REPO_ROOT}/scripts/deploy_runtime.sh" >/tmp/socialos_deploy.log 2>&1 || true

echo "== SocialOS Demo Boot =="
echo "1) Runtime config deployed (see /tmp/socialos_deploy.log)"
echo "2) SQLite seeded"
echo "3) Dashboard/API scaffolds are under socialos/apps/{web,api}"
echo ""
echo "Demo flow (current P0 baseline):"
echo "- Open docs: ${REPO_ROOT}/socialos/docs/DEMO_SCRIPT.md"
echo "- Inspect latest digest: ${REPO_ROOT}/reports/LATEST.md"
echo "- Run one automation pass: ${REPO_ROOT}/scripts/devloop_once.sh"
