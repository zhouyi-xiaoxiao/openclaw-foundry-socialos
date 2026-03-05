#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_FILE="${REPO_ROOT}/QUEUE.md"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
MODE_FILE="${REPO_ROOT}/.foundry/PUBLISH_MODE"
LATEST_FILE="${REPO_ROOT}/reports/LATEST.md"

mkdir -p "${REPO_ROOT}/.foundry"

usage() {
  cat <<'EOF'
Usage:
  scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE
  scripts/foundry_dispatch.sh STATUS
  scripts/foundry_dispatch.sh ADD_TASK:<text>
  scripts/foundry_dispatch.sh PAUSE_DEVLOOP
  scripts/foundry_dispatch.sh RESUME_DEVLOOP
  scripts/foundry_dispatch.sh SET_PUBLISH_MODE:dry-run|live
  scripts/foundry_dispatch.sh SEND_DIGEST_NOTIFICATION
EOF
}

cmd="${1:-}"
if [[ -z "${cmd}" ]]; then
  usage
  exit 1
fi

add_task() {
  local raw="${1:-}"
  if [[ -z "${raw// }" ]]; then
    echo "ADD_TASK requires non-empty text"
    exit 1
  fi

  local output
  output="$(node "${REPO_ROOT}/scripts/foundry_tasks.mjs" create --text "${raw}")"
  local task_id
  task_id="$(printf '%s' "${output}" | node -e 'let data="";process.stdin.on("data",(chunk)=>data+=chunk);process.stdin.on("end",()=>{const parsed=JSON.parse(data);process.stdout.write(parsed.task?.taskId || "");});')"
  if [[ -z "${task_id}" ]]; then
    echo "Task added, but task id could not be resolved"
    exit 1
  fi
  echo "Task added: ${task_id}"
}

set_publish_mode() {
  local mode="${1:-}"
  case "${mode}" in
    dry-run|live)
      printf '%s\n' "${mode}" > "${MODE_FILE}"
      echo "PUBLISH_MODE override set to ${mode}"
      ;;
    *)
      echo "SET_PUBLISH_MODE only supports dry-run|live"
      exit 1
      ;;
  esac
}

send_digest_notification() {
  local excerpt
  excerpt="No digest available yet."

  if [[ -f "${LATEST_FILE}" ]]; then
    excerpt="$(sed -n '1,3p' "${LATEST_FILE}" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-220)"
  fi

  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${excerpt}\" with title \"OpenClaw Foundry Digest\"" >/dev/null 2>&1 || true
  fi
  echo "Digest notification refreshed."
}

case "${cmd}" in
  RUN_DEVLOOP_ONCE)
    exec "${REPO_ROOT}/scripts/devloop_once.sh"
    ;;
  STATUS)
    exec "${REPO_ROOT}/scripts/status.sh"
    ;;
  PAUSE_DEVLOOP)
    touch "${PAUSE_FILE}"
    echo "Devloop paused."
    ;;
  RESUME_DEVLOOP)
    rm -f "${PAUSE_FILE}"
    echo "Devloop resumed."
    ;;
  SEND_DIGEST_NOTIFICATION)
    send_digest_notification
    ;;
  ADD_TASK:*)
    add_task "${cmd#ADD_TASK:}"
    ;;
  SET_PUBLISH_MODE:*)
    set_publish_mode "${cmd#SET_PUBLISH_MODE:}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
