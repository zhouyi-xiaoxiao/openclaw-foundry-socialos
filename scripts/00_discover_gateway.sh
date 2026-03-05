#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"  # optional: --exports-only

DISCOVER_JSON="$(openclaw gateway discover --json)"
PARSED="$(printf '%s' "${DISCOVER_JSON}" | node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8");
const data = JSON.parse(raw);
const beacons = Array.isArray(data.beacons) ? data.beacons : [];
if (beacons.length === 0) {
  process.exit(10);
}
const b = beacons[0] || {};
const port = Number(b.gatewayPort || b.port || 0);
const wsUrl = typeof b.wsUrl === "string" ? b.wsUrl : "";
if (!port || !wsUrl) {
  process.exit(11);
}
process.stdout.write(String(port) + "\t" + wsUrl);
')" || true

if [[ -z "${PARSED}" ]]; then
  STATUS_JSON="$(openclaw gateway status --json)"
  PARSED="$(printf '%s' "${STATUS_JSON}" | node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8");
const data = JSON.parse(raw);
const port = Number(data?.gateway?.port || data?.port?.port || 0);
let wsUrl = "";
if (typeof data?.gateway?.probeUrl === "string" && data.gateway.probeUrl.trim()) {
  wsUrl = data.gateway.probeUrl.trim();
} else if (port > 0) {
  wsUrl = `ws://127.0.0.1:${port}`;
}
if (!port || !wsUrl) {
  process.stderr.write("Gateway discovery failed (discover + status fallback).\n");
  process.exit(4);
}
process.stdout.write(String(port) + "\t" + wsUrl);
')"
fi

OPENCLAW_GATEWAY_PORT="${PARSED%%$'\t'*}"
OPENCLAW_GATEWAY_WSURL="${PARSED#*$'\t'}"

if [[ "${MODE}" == "--exports-only" ]]; then
  echo "export OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}"
  echo "export OPENCLAW_GATEWAY_WSURL=${OPENCLAW_GATEWAY_WSURL}"
  exit 0
fi

echo "export OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}"
echo "export OPENCLAW_GATEWAY_WSURL=${OPENCLAW_GATEWAY_WSURL}"
echo "Control UI: http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/"
