#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

eval "$("${SCRIPT_DIR}/00_discover_gateway.sh" --exports-only)"
LOCAL_WS="ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT}"

echo "Checking gateway service status..."
if ! openclaw gateway status --json >/tmp/openclaw_gateway_status.json 2>/tmp/openclaw_gateway_status.err; then
  echo "Gateway status check failed; attempting to start service..."
  openclaw gateway start
  sleep 2
fi

echo "Probing discovered gateway URL: ${OPENCLAW_GATEWAY_WSURL}"
if ! openclaw gateway probe --json --url "${OPENCLAW_GATEWAY_WSURL}" >/tmp/openclaw_gateway_probe.json 2>/tmp/openclaw_gateway_probe.err; then
  echo "Probe on discovered URL failed; retrying loopback URL ${LOCAL_WS}"
  openclaw gateway probe --json --url "${LOCAL_WS}" >/tmp/openclaw_gateway_probe.json
fi

echo "Gateway is reachable. Control UI: http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/"
