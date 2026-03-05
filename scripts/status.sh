#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LATEST="${REPO_ROOT}/reports/LATEST.md"

echo "== Foundry Status =="
if [[ -f "${REPO_ROOT}/.foundry/PAUSED" ]]; then
  echo "mode: PAUSED"
else
  echo "mode: RUNNING"
fi

echo
echo "Current queue head:"
grep -nE '^- \[( |-|!)\] ' "${REPO_ROOT}/QUEUE.md" | head -n 5 || true

echo
echo "Latest digest:"
if [[ -f "${LATEST}" ]]; then
  sed -n '1,8p' "${LATEST}"
else
  echo "No digest yet."
fi
