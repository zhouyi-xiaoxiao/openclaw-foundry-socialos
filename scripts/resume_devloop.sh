#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rm -f "${REPO_ROOT}/.foundry/PAUSED"
echo "Devloop resumed."
