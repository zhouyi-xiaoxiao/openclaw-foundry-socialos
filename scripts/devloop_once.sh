#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_ROOT="${REPO_ROOT}/.locks"
LOCK_DIR="${LOCK_ROOT}/devloop.lock"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
QUEUE_FILE="${REPO_ROOT}/QUEUE.md"
RUN_TS="$(date +%Y%m%d_%H%M%S)"
REPORT_DIR="${REPO_ROOT}/reports/runs"
mkdir -p "${LOCK_ROOT}" "${REPORT_DIR}" "${REPO_ROOT}/.foundry"

noop() {
  local reason="$1"
  local run_id="${RUN_TS}_NOOP"
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "$run_id" "Devloop noop" "$reason" "low" "No mutation" "Await next queue item" >/dev/null || true
  echo "NOOP: ${reason}"
  exit 0
}

if [[ -f "${PAUSE_FILE}" ]]; then
  noop "Paused via .foundry/PAUSED"
fi

if mkdir "${LOCK_DIR}" 2>/dev/null; then
  trap 'rm -rf "${LOCK_DIR}"' EXIT
else
  if [[ -d "${LOCK_DIR}" ]]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "${LOCK_DIR}" 2>/dev/null || echo 0) ))
    if (( lock_age > 1200 )); then
      rm -rf "${LOCK_DIR}"
      mkdir "${LOCK_DIR}" || noop "Lock contention after stale-lock cleanup"
      trap 'rm -rf "${LOCK_DIR}"' EXIT
    else
      noop "Lock busy"
    fi
  else
    noop "Unable to create lock"
  fi
fi

(git -C "${REPO_ROOT}" fetch origin >/dev/null 2>&1 || true)
if git -C "${REPO_ROOT}" rev-parse --verify origin/main >/dev/null 2>&1; then
  if ! git -C "${REPO_ROOT}" merge-base --is-ancestor main origin/main; then
    git -C "${REPO_ROOT}" checkout main >/dev/null 2>&1 || true
    git -C "${REPO_ROOT}" pull --rebase origin main || true
  fi
fi

TASK_LINE="$(grep -nE '^- \[( |-)\] ' "${QUEUE_FILE}" | head -n1 || true)"
if [[ -z "${TASK_LINE}" ]]; then
  noop "Queue empty"
fi

LINE_NO="${TASK_LINE%%:*}"
TASK_TEXT="${TASK_LINE#*:}"
TASK_ID="$(printf '%s' "${TASK_TEXT}" | sed -E 's/^.*(P[0-9]-[0-9]+|OPS-[0-9]+).*/\1/')"
[[ -n "${TASK_ID}" ]] || TASK_ID="TASK_${RUN_TS}"
RUN_ID="${RUN_TS}_${TASK_ID}"
REPORT_FILE="${REPORT_DIR}/${RUN_ID}.md"

if [[ "${TASK_TEXT}" =~ ^-\ \[\ \] ]]; then
  sed -i '' "${LINE_NO}s/^- \[ \]/- [-]/" "${QUEUE_FILE}"
fi

status="success"
summary=""

case "${TASK_ID}" in
  P0-1)
    if "${REPO_ROOT}/scripts/test.sh" >/tmp/socialos_test.log 2>&1; then
      sed -i '' "${LINE_NO}s/^- \[-\]/- [x]/" "${QUEUE_FILE}"
      summary="P0-1 runtime skeleton validated"
    else
      status="blocked"
      sed -i '' "${LINE_NO}s/^- \[-\]/- [!]/" "${QUEUE_FILE}"
      summary="P0-1 failed test gate"
    fi
    ;;
  *)
    status="blocked"
    sed -i '' "${LINE_NO}s/^- \[-\]/- [!]/" "${QUEUE_FILE}"
    summary="No executor implemented yet for ${TASK_ID}"
    ;;
esac

cat > "${REPORT_FILE}" <<MD
# Devloop Run Report

- run_id: ${RUN_ID}
- task: ${TASK_ID}
- status: ${status}
- summary: ${summary}
- test_log: /tmp/socialos_test.log
MD

if [[ "${status}" == "success" ]]; then
  git -C "${REPO_ROOT}" add .
  git -C "${REPO_ROOT}" commit -m "[autodev] ${TASK_ID}: ${summary}" >/dev/null 2>&1 || true
  git -C "${REPO_ROOT}" push origin main >/tmp/socialos_push.log 2>&1 || {
    "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "push blocked" "git push origin main failed" "medium" "See /tmp/socialos_push.log" "Fix remote/auth, next cron retries" >/dev/null || true
    exit 0
  }
  git -C "${REPO_ROOT}" push --tags origin >/tmp/socialos_push_tags.log 2>&1 || true
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "${summary}" "Executed one queue item" "low" "reports/runs/${RUN_ID}.md" "Proceed to next pending task" >/dev/null
else
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "${summary}" "Single-run failure policy" "medium" "reports/runs/${RUN_ID}.md" "Fix blocker then retry next cron" >/dev/null
fi

echo "${status}: ${RUN_ID}"
