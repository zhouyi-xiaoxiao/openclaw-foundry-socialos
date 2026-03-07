#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${SOCIALOS_API_PORT:-8787}"
WEB_PORT="${SOCIALOS_WEB_PORT:-4173}"
LOCAL_API="http://127.0.0.1:${API_PORT}"
LOCAL_WEB="http://127.0.0.1:${WEB_PORT}"
PUBLIC_WEB="${SOCIALOS_PUBLIC_WEB_URL:-https://zhouyixiaoxiao.org}"

check_url() {
  local url="$1"
  if ! curl -fsS "$url" >/dev/null; then
    echo "Preflight failed: ${url} is not healthy" >&2
    exit 1
  fi
}

echo "== SocialOS Hackathon Preflight =="

echo "[1/5] Restarting demo services into a clean record-ready state"
bash "${REPO_ROOT}/scripts/stop_demo.sh" >/dev/null 2>&1 || true
bash "${REPO_ROOT}/scripts/demo.sh" >/dev/null

echo "[2/5] Verifying local routes"
bash "${REPO_ROOT}/scripts/demo_status.sh"
check_url "${LOCAL_API}/health"
check_url "${LOCAL_WEB}/quick-capture"
check_url "${LOCAL_WEB}/demo"
check_url "${LOCAL_WEB}/hackathon"
check_url "${LOCAL_WEB}/buddy"

echo "[3/5] Capturing stable hackathon proof files"
node "${REPO_ROOT}/scripts/capture_hackathon_proofs.mjs"

echo "[4/5] Exporting the public static proof site"
node "${REPO_ROOT}/scripts/export_vc_deck.mjs"

echo "[5/5] Final URLs"
echo "- Local Workspace: ${LOCAL_WEB}/quick-capture"
echo "- Local Demo: ${LOCAL_WEB}/demo"
echo "- Local Hackathon Hub: ${LOCAL_WEB}/hackathon"
echo "- Local Buddy Mode: ${LOCAL_WEB}/buddy"
echo "- Public Deck: ${PUBLIC_WEB}/"
echo "- Public Demo Proof: ${PUBLIC_WEB}/demo/"
echo "- Public Hackathon Hub: ${PUBLIC_WEB}/hackathon/"
echo "- Public Buddy Proof: ${PUBLIC_WEB}/buddy/"
echo "- Public Proof JSON: ${PUBLIC_WEB}/data/proofs/all.json"
