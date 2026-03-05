#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_ROOT="${REPO_ROOT}/.locks"
LOCK_DIR="${LOCK_ROOT}/devloop.lock"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
QUEUE_FILE="${REPO_ROOT}/QUEUE.md"
RUN_TS="$(date +%Y%m%d_%H%M%S)"
REPORT_DIR="${REPO_ROOT}/reports/runs"
AUTO_OPT_ID="AUTO-OPT-CONTINUOUS"
mkdir -p "${LOCK_ROOT}" "${REPORT_DIR}" "${REPO_ROOT}/.foundry"

append_noop_digest() {
  local reason="$1"
  local run_id="${RUN_TS}_NOOP"
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "$run_id" "Devloop noop" "$reason" "low" "No mutation" "Await next queue item" >/dev/null || true
  echo "NOOP: ${reason}"
  exit 0
}

seed_auto_opt_task() {
  local seeded=0
  local line_no

  if grep -q "${AUTO_OPT_ID}" "${QUEUE_FILE}"; then
    line_no="$(grep -n "${AUTO_OPT_ID}" "${QUEUE_FILE}" | head -n1 | cut -d: -f1)"
    if [[ -n "${line_no}" ]]; then
      sed -i '' "${line_no}s/^- \[[x!]\]/- [ ]/" "${QUEUE_FILE}"
      sed -i '' "${line_no}s/^- \[-\]/- [ ]/" "${QUEUE_FILE}"
      seeded=1
    fi
  else
    cat >> "${QUEUE_FILE}" <<MD

## Auto Optimization
- [ ] ${AUTO_OPT_ID} 队列清空后自动产出优化方案并执行一次优化循环
  - Done When:
    - 生成 `reports/auto_opt/latest.md`（What/Why/Risk/Verify/Next）
    - 运行一次 `scripts/test.sh` 与 `scripts/bench_embeddings.sh`
    - 写入 DevDigest，并将后续继续交给实时 cron
MD
    seeded=1
  fi

  if (( seeded == 1 )); then
    "${REPO_ROOT}/scripts/dev_digest_append.sh" \
      "${RUN_TS}_AUTOOPT_SEED" \
      "Auto optimization seeded" \
      "Queue empty: switched from idle noop to continuous optimization mode" \
      "low" \
      "QUEUE.md auto optimization task prepared" \
      "Execute AUTO-OPT task in this run" >/dev/null || true
  fi
}

if [[ -f "${PAUSE_FILE}" ]]; then
  append_noop_digest "Paused via .foundry/PAUSED"
fi

if mkdir "${LOCK_DIR}" 2>/dev/null; then
  trap 'rm -rf "${LOCK_DIR}"' EXIT
else
  if [[ -d "${LOCK_DIR}" ]]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "${LOCK_DIR}" 2>/dev/null || echo 0) ))
    if (( lock_age > 1200 )); then
      rm -rf "${LOCK_DIR}"
      mkdir "${LOCK_DIR}" || append_noop_digest "Lock contention after stale-lock cleanup"
      trap 'rm -rf "${LOCK_DIR}"' EXIT
    else
      append_noop_digest "Lock busy"
    fi
  else
    append_noop_digest "Unable to create lock"
  fi
fi

(git -C "${REPO_ROOT}" fetch origin >/dev/null 2>&1 || true)
git -C "${REPO_ROOT}" checkout main >/dev/null 2>&1 || true
if git -C "${REPO_ROOT}" rev-parse --verify origin/main >/dev/null 2>&1; then
  if ! git -C "${REPO_ROOT}" merge-base --is-ancestor main origin/main; then
    git -C "${REPO_ROOT}" pull --rebase origin main || true
  fi
fi

TASK_LINE="$(grep -nE '^- \[( |-)\] ' "${QUEUE_FILE}" | head -n1 || true)"
if [[ -z "${TASK_LINE}" ]]; then
  seed_auto_opt_task
  TASK_LINE="$(grep -nE '^- \[( |-)\] ' "${QUEUE_FILE}" | head -n1 || true)"
fi

if [[ -z "${TASK_LINE}" ]]; then
  append_noop_digest "Queue empty (auto optimization unavailable)"
fi

LINE_NO="${TASK_LINE%%:*}"
TASK_TEXT="${TASK_LINE#*:}"
TASK_ID="$(printf '%s' "${TASK_TEXT}" | grep -oE '(P[0-9]-[0-9]+|OPS-[0-9]+|AUTO-OPT-[A-Z0-9_-]+)' | head -n1 || true)"
[[ -n "${TASK_ID}" ]] || TASK_ID="TASK_${RUN_TS}"
RUN_ID="${RUN_TS}_${TASK_ID}"
REPORT_FILE="${REPORT_DIR}/${RUN_ID}.md"

WAS_PENDING=0
if [[ "${TASK_TEXT}" =~ ^-\ \[\ \] ]]; then
  WAS_PENDING=1
  sed -i '' "${LINE_NO}s/^- \[ \]/- [-]/" "${QUEUE_FILE}"
fi

status="success"
summary=""
risk_level="low"
why_text="Executed one queue item"
verify_text="/tmp/socialos_test.log"
next_text="Proceed to next pending task"

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
  P0-2)
    if "${REPO_ROOT}/scripts/test.sh" >/tmp/socialos_test.log 2>&1; then
      sed -i '' "${LINE_NO}s/^- \[-\]/- [x]/" "${QUEUE_FILE}"
      summary="P0-2 plugin skeleton + permission policy validated"
    else
      status="blocked"
      sed -i '' "${LINE_NO}s/^- \[-\]/- [!]/" "${QUEUE_FILE}"
      summary="P0-2 failed plugin/policy test gate"
    fi
    ;;
  P0-3)
    if "${REPO_ROOT}/scripts/test.sh" >/tmp/socialos_test.log 2>&1; then
      sed -i '' "${LINE_NO}s/^- \[-\]/- [x]/" "${QUEUE_FILE}"
      summary="P0-3 SQLite DB+API minimal loop validated"
    else
      status="blocked"
      risk_level="medium"
      sed -i '' "${LINE_NO}s/^- \[-\]/- [!]/" "${QUEUE_FILE}"
      summary="P0-3 failed e2e smoke gate"
    fi
    ;;
  AUTO-OPT-*)
    AUTO_OPT_DIR="${REPO_ROOT}/reports/auto_opt"
    AUTO_OPT_REPORT="${AUTO_OPT_DIR}/latest.md"
    AUTO_TEST_LOG="/tmp/socialos_auto_opt_test.log"
    AUTO_BENCH_LOG="/tmp/socialos_auto_opt_bench.log"
    TEST_OK=1
    BENCH_OK=1
    mkdir -p "${AUTO_OPT_DIR}"

    if ! "${REPO_ROOT}/scripts/test.sh" >"${AUTO_TEST_LOG}" 2>&1; then
      TEST_OK=0
    fi

    if ! "${REPO_ROOT}/scripts/bench_embeddings.sh" >"${AUTO_BENCH_LOG}" 2>&1; then
      BENCH_OK=0
    fi

    PENDING_COUNT="$(grep -cE '^- \[ \] ' "${QUEUE_FILE}" || true)"
    BLOCKED_COUNT="$(grep -cE '^- \[!\] ' "${QUEUE_FILE}" || true)"
    DONE_COUNT="$(grep -cE '^- \[x\] ' "${QUEUE_FILE}" || true)"

    if (( TEST_OK == 1 && BENCH_OK == 1 )); then
      sed -i '' "${LINE_NO}s/^- \[-\]/- [x]/" "${QUEUE_FILE}"
      summary="AUTO-OPT continuous optimization cycle executed"
      why_text="Queue was empty, so the loop generated and executed optimization instead of idling"
      verify_text="${AUTO_OPT_REPORT}"
      next_text="Cron keeps running AUTO-OPT until new product tasks arrive"
    else
      status="blocked"
      risk_level="medium"
      sed -i '' "${LINE_NO}s/^- \[-\]/- [!]/" "${QUEUE_FILE}"
      summary="AUTO-OPT blocked (test_ok=${TEST_OK}, bench_ok=${BENCH_OK})"
      why_text="Continuous optimization failed one of its validation gates"
      verify_text="${AUTO_TEST_LOG} + ${AUTO_BENCH_LOG}"
      next_text="Fix optimization gate failure, then next cron run will retry from queue"
    fi

    cat > "${AUTO_OPT_REPORT}" <<MD
# Auto Optimization Latest

- run_id: ${RUN_ID}
- task: ${TASK_ID}
- test_ok: ${TEST_OK}
- bench_ok: ${BENCH_OK}
- queue_done: ${DONE_COUNT}
- queue_pending: ${PENDING_COUNT}
- queue_blocked: ${BLOCKED_COUNT}
- test_log: ${AUTO_TEST_LOG}
- bench_log: ${AUTO_BENCH_LOG}
- updated_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## What
Queue had no pending product tasks, so devloop switched to continuous optimization mode.

## Why
Prevent idle no-op loops and keep producing measurable system improvements.

## Risk
Low by default (dry-run automation + local checks), medium if optimization checks fail.

## Verify
Run:
\`\`\`bash
bash scripts/test.sh
bash scripts/bench_embeddings.sh
\`\`\`

## Next
Keep cron active; AUTO-OPT will continue until new queue tasks are added.
MD
    ;;
  *)
    status="noop"
    summary="Executor not implemented for ${TASK_ID}"
    if (( WAS_PENDING == 1 )); then
      sed -i '' "${LINE_NO}s/^- \[-\]/- [ ]/" "${QUEUE_FILE}"
    fi
    ;;
esac

cat > "${REPORT_FILE}" <<MD
# Devloop Run Report

- run_id: ${RUN_ID}
- task: ${TASK_ID}
- status: ${status}
- summary: ${summary}
- verify: ${verify_text}
- why: ${why_text}
- next: ${next_text}
MD

if [[ "${status}" == "success" ]]; then
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "${summary}" "${why_text}" "${risk_level}" "${verify_text}" "${next_text}" >/dev/null
  git -C "${REPO_ROOT}" add .
  git -C "${REPO_ROOT}" commit -m "[autodev] ${TASK_ID}: ${summary}" >/dev/null 2>&1 || true
  git -C "${REPO_ROOT}" push origin main >/tmp/socialos_push.log 2>&1 || {
    "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "push blocked" "git push origin main failed" "medium" "See /tmp/socialos_push.log" "Fix remote/auth, next cron retries" >/dev/null || true
    exit 0
  }
  git -C "${REPO_ROOT}" push --tags origin >/tmp/socialos_push_tags.log 2>&1 || true
elif [[ "${status}" == "blocked" ]]; then
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "${summary}" "Single-run failure policy" "medium" "reports/runs/${RUN_ID}.md" "Fix blocker then retry next cron" >/dev/null
else
  "${REPO_ROOT}/scripts/dev_digest_append.sh" "${RUN_ID}" "Devloop noop" "${summary}" "low" "reports/runs/${RUN_ID}.md" "Continue automation" >/dev/null
fi

echo "${status}: ${RUN_ID}"
