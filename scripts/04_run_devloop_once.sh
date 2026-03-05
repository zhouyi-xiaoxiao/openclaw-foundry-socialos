#!/usr/bin/env bash
set -euo pipefail
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/foundry_dispatch.sh" RUN_DEVLOOP_ONCE
