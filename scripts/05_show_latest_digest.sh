#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LATEST_FILE="${REPO_ROOT}/reports/LATEST.md"

echo "Latest digest file: ${LATEST_FILE}"
if [[ ! -f "${LATEST_FILE}" ]]; then
  echo "LATEST.md does not exist yet."
  exit 1
fi

cat "${LATEST_FILE}"

echo
echo "Recent run reports:"
ls -1t "${REPO_ROOT}/reports/runs" | head -n 10
