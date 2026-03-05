#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/socialos/openclaw/runtime.openclaw.json5"
DEST_DIR="${HOME}/.openclaw-socialos"
DEST="${DEST_DIR}/openclaw.json"

mkdir -p "${DEST_DIR}"
cp "${SRC}" "${DEST}"

echo "Deployed runtime config to ${DEST}"
openclaw --profile socialos config validate --json
