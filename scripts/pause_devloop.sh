#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${REPO_ROOT}/.foundry"
: > "${REPO_ROOT}/.foundry/PAUSED"
echo "Devloop paused."
