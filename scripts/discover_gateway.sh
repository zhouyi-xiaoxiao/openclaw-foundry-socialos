#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
DISCOVER_JSON="$(openclaw gateway discover --json 2>/dev/null || true)"
PARSED=""

if [[ -n "${DISCOVER_JSON}" ]]; then
  PARSED="$(printf '%s' "${DISCOVER_JSON}" | node -e '
const fs = require("fs");
try {
  const data = JSON.parse(fs.readFileSync(0, "utf8"));
  const b = (Array.isArray(data.beacons) && data.beacons[0]) || null;
  if (!b) process.exit(2);
  const port = Number(b.gatewayPort || b.port || 0);
  const ws = b.wsUrl || (port ? `ws://127.0.0.1:${port}` : "");
  if (!port || !ws) process.exit(3);
  process.stdout.write(`${port}\t${ws}`);
} catch {
  process.exit(4);
}
')" || true
fi

if [[ -z "${PARSED}" ]]; then
  STATUS_JSON="$(openclaw gateway status --json)"
  PARSED="$(printf '%s' "${STATUS_JSON}" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const port = Number(data?.gateway?.port || data?.port?.port || 0);
const ws = data?.gateway?.probeUrl || (port ? `ws://127.0.0.1:${port}` : "");
if (!port || !ws) process.exit(2);
process.stdout.write(`${port}\t${ws}`);
')"
fi

OPENCLAW_GATEWAY_PORT="${PARSED%%$'\t'*}"
OPENCLAW_GATEWAY_WSURL="${PARSED#*$'\t'}"

if [[ "${MODE}" == "--exports-only" ]]; then
  echo "export OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}"
  echo "export OPENCLAW_GATEWAY_WSURL=${OPENCLAW_GATEWAY_WSURL}"
  exit 0
fi

echo "Gateway port: ${OPENCLAW_GATEWAY_PORT}"
echo "Gateway ws:   ${OPENCLAW_GATEWAY_WSURL}"
