#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}" exec node "${REPO_ROOT}/scripts/studio_cli.mjs" "$@"
