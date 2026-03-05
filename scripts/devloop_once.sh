#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_FILE="${REPO_ROOT}/QUEUE.md"
LOCK_DIR="${REPO_ROOT}/.locks/devloop.lock"
LOCK_META="${LOCK_DIR}/meta.env"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
MODE_FILE="${REPO_ROOT}/.foundry/PUBLISH_MODE"

REPORT_DIR="${REPO_ROOT}/reports/runs"
LATEST_FILE="${REPO_ROOT}/reports/LATEST.md"
AUTO_OPT_REPORT="${REPO_ROOT}/reports/auto_opt/latest.md"
DB_PATH="${REPO_ROOT}/infra/db/socialos.db"

LOCK_STALE_SEC="${FOUNDRY_LOCK_STALE_SEC:-120}"
LOCK_HEARTBEAT_SEC="${FOUNDRY_LOCK_HEARTBEAT_SEC:-5}"

RUN_TS="$(date +%Y%m%d_%H%M%S)"
RUN_START_EPOCH="$(date +%s)"
RUN_START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "${REPO_ROOT}/.locks" "${REPO_ROOT}/.foundry" "${REPORT_DIR}" "${REPO_ROOT}/reports/auto_opt"

TASK_ID="NO_TASK"
TASK_TEXT=""
TASK_LINE_NO=""
RUN_ID="${RUN_TS}_${TASK_ID}"
PLAN_SPEC_FILE="${REPORT_DIR}/${RUN_ID}.planspec.json"
REPORT_MD_FILE="${REPORT_DIR}/${RUN_ID}.md"
REPORT_JSON_FILE="${REPORT_DIR}/${RUN_ID}.json"

RUN_STATUS="noop"
RUN_SUMMARY="No operation"
RUN_WHY="Not started"
RUN_RISK="low"
RUN_VERIFY="n/a"
RUN_NEXT="await next cycle"

STAGE_PLAN="pending"
STAGE_CODER="pending"
STAGE_TESTER="pending"
STAGE_REVIEWER="pending"
STAGE_GIT_SYNC="pending"
STAGE_PUSH="pending"

LOCK_STATUS="not-acquired"
LOCK_OWNER_PID=""
LOCK_OWNER_ALIVE="unknown"
LOCK_OWNER_HEARTBEAT_AGE_SEC=""
LOCK_STALE_RECOVERED="false"
HEARTBEAT_PID=""

AUTO_OPT_TASKS=(
  "AUTO-OPT-TEST-DEBT"
  "AUTO-OPT-PERF-DEBT"
  "AUTO-OPT-DOC-DEBT"
  "AUTO-OPT-OBS-DEBT"
  "AUTO-OPT-BLOCKED-TRIAGE"
)

json_escape() {
  JSON_ESC_INPUT="${1:-}" node -e 'process.stdout.write(JSON.stringify(process.env.JSON_ESC_INPUT || ""))'
}

run_duration_ms() {
  echo $(( ($(date +%s) - RUN_START_EPOCH) * 1000 ))
}

write_lock_meta() {
  local now_epoch
  now_epoch="$(date +%s)"
  cat > "${LOCK_META}" <<EOF
pid=$$
run_id=${RUN_ID}
started_at=${RUN_START_ISO}
started_epoch=${RUN_START_EPOCH}
heartbeat_epoch=${now_epoch}
heartbeat_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
}

start_heartbeat() {
  (
    while [[ -d "${LOCK_DIR}" ]]; do
      write_lock_meta
      sleep "${LOCK_HEARTBEAT_SEC}"
    done
  ) >/dev/null 2>&1 &
  HEARTBEAT_PID="$!"
}

stop_heartbeat() {
  if [[ -n "${HEARTBEAT_PID}" ]]; then
    kill "${HEARTBEAT_PID}" >/dev/null 2>&1 || true
    wait "${HEARTBEAT_PID}" 2>/dev/null || true
  fi
}

release_lock() {
  stop_heartbeat
  if [[ -d "${LOCK_DIR}" ]]; then
    rm -rf "${LOCK_DIR}"
  fi
}

set_queue_marker() {
  local line_no="$1"
  local marker="$2"
  [[ -n "${line_no}" ]] || return 0
  sed -i '' -E "${line_no}s/^- \\[[^]]\\]/- [${marker}]/" "${QUEUE_FILE}"
}

append_digest() {
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local digest_id="digest_${RUN_ID}"

  cat > "${LATEST_FILE}" <<EOF
Run: ${RUN_ID}
What: ${RUN_SUMMARY}
Why: ${RUN_WHY}
Risk: ${RUN_RISK}
Verify: ${RUN_VERIFY}
Next: ${RUN_NEXT}
EOF

  if command -v sqlite3 >/dev/null 2>&1 && [[ -f "${DB_PATH}" ]]; then
    sqlite3 "${DB_PATH}" <<SQL >/dev/null 2>&1 || true
INSERT OR REPLACE INTO DevDigest(id,run_id,what,why,risk,verify,next,created_at)
VALUES('${digest_id}','${RUN_ID//\'/}','${RUN_SUMMARY//\'/}','${RUN_WHY//\'/}','${RUN_RISK//\'/}','${RUN_VERIFY//\'/}','${RUN_NEXT//\'/}','${now}');
SQL
  fi
}

write_reports() {
  local finish_iso duration_ms
  finish_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  duration_ms="$(run_duration_ms)"

  REPORT_MD_FILE="${REPORT_DIR}/${RUN_ID}.md"
  REPORT_JSON_FILE="${REPORT_DIR}/${RUN_ID}.json"
  PLAN_SPEC_FILE="${REPORT_DIR}/${RUN_ID}.planspec.json"

  cat > "${REPORT_MD_FILE}" <<EOF
# Devloop Run Report

- run_id: ${RUN_ID}
- task: ${TASK_ID}
- task_text: ${TASK_TEXT}
- status: ${RUN_STATUS}
- summary: ${RUN_SUMMARY}
- why: ${RUN_WHY}
- risk: ${RUN_RISK}
- verify: ${RUN_VERIFY}
- next: ${RUN_NEXT}
- started_at: ${RUN_START_ISO}
- finished_at: ${finish_iso}
- duration_ms: ${duration_ms}

## Stages
- plan: ${STAGE_PLAN}
- coder: ${STAGE_CODER}
- tester: ${STAGE_TESTER}
- reviewer: ${STAGE_REVIEWER}
- git_sync: ${STAGE_GIT_SYNC}
- push: ${STAGE_PUSH}

## Lock
- status: ${LOCK_STATUS}
- stale_recovered: ${LOCK_STALE_RECOVERED}
- owner_pid: ${LOCK_OWNER_PID}
- owner_alive: ${LOCK_OWNER_ALIVE}
- owner_heartbeat_age_sec: ${LOCK_OWNER_HEARTBEAT_AGE_SEC}
EOF

  cat > "${REPORT_JSON_FILE}" <<EOF
{
  "runId": $(json_escape "${RUN_ID}"),
  "taskId": $(json_escape "${TASK_ID}"),
  "taskText": $(json_escape "${TASK_TEXT}"),
  "status": $(json_escape "${RUN_STATUS}"),
  "summary": $(json_escape "${RUN_SUMMARY}"),
  "why": $(json_escape "${RUN_WHY}"),
  "risk": $(json_escape "${RUN_RISK}"),
  "verify": $(json_escape "${RUN_VERIFY}"),
  "next": $(json_escape "${RUN_NEXT}"),
  "startedAt": $(json_escape "${RUN_START_ISO}"),
  "finishedAt": $(json_escape "${finish_iso}"),
  "durationMs": ${duration_ms},
  "stages": {
    "plan": $(json_escape "${STAGE_PLAN}"),
    "coder": $(json_escape "${STAGE_CODER}"),
    "tester": $(json_escape "${STAGE_TESTER}"),
    "reviewer": $(json_escape "${STAGE_REVIEWER}"),
    "gitSync": $(json_escape "${STAGE_GIT_SYNC}"),
    "push": $(json_escape "${STAGE_PUSH}")
  },
  "lock": {
    "status": $(json_escape "${LOCK_STATUS}"),
    "staleRecovered": $(json_escape "${LOCK_STALE_RECOVERED}"),
    "ownerPid": $(json_escape "${LOCK_OWNER_PID}"),
    "ownerAlive": $(json_escape "${LOCK_OWNER_ALIVE}"),
    "ownerHeartbeatAgeSec": $(json_escape "${LOCK_OWNER_HEARTBEAT_AGE_SEC}")
  }
}
EOF
}

finish_run() {
  write_reports
  append_digest
  release_lock
  echo "${RUN_STATUS}: ${RUN_ID}"
  exit 0
}

create_autofix_task() {
  local reason="$1"

  if grep -F -- "${reason}" "${QUEUE_FILE}" >/dev/null 2>&1; then
    return 0
  fi

  local autofix_id
  autofix_id="AUTOFIX-${TASK_ID//[^A-Za-z0-9]/_}-$(date +%H%M%S)"

  if ! grep -q '^## AutoFix Backlog' "${QUEUE_FILE}" >/dev/null 2>&1; then
    {
      echo
      echo "## AutoFix Backlog"
    } >> "${QUEUE_FILE}"
  fi

  {
    echo "- [ ] ${autofix_id} ${reason}"
    echo "  - Done When:"
    echo "    - blocker root cause is fixed"
    echo "    - related tests and reviewer checks pass"
  } >> "${QUEUE_FILE}"
}

ensure_auto_opt_pool() {
  if grep -q '^## Auto Optimization Pool' "${QUEUE_FILE}" >/dev/null 2>&1; then
    return 0
  fi

  cat >> "${QUEUE_FILE}" <<'EOF'

## Auto Optimization Pool
- [ ] AUTO-OPT-TEST-DEBT 自动执行测试债清理循环
  - Done When:
    - `scripts/test.sh` 通过并记录最新报告
- [ ] AUTO-OPT-PERF-DEBT 自动执行 embedding 基准与性能复盘
  - Done When:
    - `scripts/bench_embeddings.sh` 完成并更新 bench 报告
- [ ] AUTO-OPT-DOC-DEBT 自动执行文档与 demo 入口体检
  - Done When:
    - README/demo/docs 冒烟检查通过
- [ ] AUTO-OPT-OBS-DEBT 自动执行可观测性端点体检
  - Done When:
    - `/ops/status` + `/ops/runs` + `/ops/blocked` 冒烟通过
- [ ] AUTO-OPT-BLOCKED-TRIAGE 自动处理 blocked 任务并生成 autofix
  - Done When:
    - 至少生成 1 条可执行 autofix 项或确认无 blocked
EOF
}

reopen_auto_opt_if_idle() {
  local pending_count
  pending_count="$(grep -cE '^- \[ \] ' "${QUEUE_FILE}" || true)"
  if [[ "${pending_count}" != "0" ]]; then
    return 0
  fi

  for task in "${AUTO_OPT_TASKS[@]}"; do
    local line_no
    line_no="$(grep -nE "^- \\[[x!]\\] ${task}" "${QUEUE_FILE}" | head -n1 | cut -d: -f1 || true)"
    if [[ -n "${line_no}" ]]; then
      set_queue_marker "${line_no}" " "
      return 0
    fi
  done
}

attempt_unblock_p0_5() {
  local line_no
  line_no="$(grep -nE '^- \[!\] P0-5' "${QUEUE_FILE}" | head -n1 | cut -d: -f1 || true)"
  if [[ -z "${line_no}" ]]; then
    return 0
  fi
  if node "${REPO_ROOT}/scripts/tests/cors_policy_check.mjs" >/tmp/socialos_cors_gate.log 2>&1; then
    set_queue_marker "${line_no}" " "
  fi
}

acquire_lock() {
  if mkdir "${LOCK_DIR}" 2>/dev/null; then
    LOCK_STATUS="acquired"
    write_lock_meta
    start_heartbeat
    return 0
  fi

  LOCK_STATUS="busy"
  if [[ ! -f "${LOCK_META}" ]]; then
    RUN_STATUS="skipped_locked"
    RUN_SUMMARY="SKIPPED_LOCKED"
    RUN_WHY="lock exists without metadata"
    RUN_RISK="low"
    RUN_VERIFY="${LOCK_DIR}"
    RUN_NEXT="retry next cron run"
    finish_run
  fi

  LOCK_OWNER_PID="$(grep -E '^pid=' "${LOCK_META}" | head -n1 | cut -d= -f2- || true)"
  owner_hb="$(grep -E '^heartbeat_epoch=' "${LOCK_META}" | head -n1 | cut -d= -f2- || true)"

  if [[ -n "${LOCK_OWNER_PID}" ]] && kill -0 "${LOCK_OWNER_PID}" >/dev/null 2>&1; then
    LOCK_OWNER_ALIVE="true"
  else
    LOCK_OWNER_ALIVE="false"
  fi

  if [[ "${owner_hb:-}" =~ ^[0-9]+$ ]]; then
    LOCK_OWNER_HEARTBEAT_AGE_SEC="$(( $(date +%s) - owner_hb ))"
  fi

  if [[ "${LOCK_OWNER_ALIVE}" == "false" ]] || [[ -n "${LOCK_OWNER_HEARTBEAT_AGE_SEC}" && "${LOCK_OWNER_HEARTBEAT_AGE_SEC}" -gt "${LOCK_STALE_SEC}" ]]; then
    rm -rf "${LOCK_DIR}"
    LOCK_STALE_RECOVERED="true"
    if mkdir "${LOCK_DIR}" 2>/dev/null; then
      LOCK_STATUS="recovered"
      write_lock_meta
      start_heartbeat
      return 0
    fi
  fi

  RUN_STATUS="skipped_locked"
  RUN_SUMMARY="SKIPPED_LOCKED"
  RUN_WHY="active lock owner exists"
  RUN_RISK="low"
  RUN_VERIFY="${LOCK_META}"
  RUN_NEXT="retry next cron run"
  finish_run
}

sync_git() {
  STAGE_GIT_SYNC="running"
  if git -C "${REPO_ROOT}" fetch origin >/tmp/socialos_git_fetch.log 2>&1; then
    STAGE_GIT_SYNC="fetched"
  else
    STAGE_GIT_SYNC="fetch-failed"
    return 0
  fi

  current_branch="$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo unknown)"
  if [[ "${current_branch}" == "main" ]] && git -C "${REPO_ROOT}" rev-parse --verify origin/main >/dev/null 2>&1; then
    if ! git -C "${REPO_ROOT}" merge-base --is-ancestor main origin/main; then
      if git -C "${REPO_ROOT}" pull --rebase origin main >/tmp/socialos_git_rebase.log 2>&1; then
        STAGE_GIT_SYNC="fetched+rebased"
      else
        STAGE_GIT_SYNC="fetched+rebase-failed"
      fi
    fi
  fi
}

write_plan_spec() {
  STAGE_PLAN="running"
  PLAN_SPEC_FILE="${REPORT_DIR}/${RUN_ID}.planspec.json"
  PLAN_TASK_ID="${TASK_ID}" PLAN_TASK_TEXT="${TASK_TEXT}" PLAN_OUTPUT_PATH="${PLAN_SPEC_FILE}" node - <<'NODE'
const fs = require('fs');

const taskId = process.env.PLAN_TASK_ID || 'UNKNOWN_TASK';
const taskText = process.env.PLAN_TASK_TEXT || taskId;
const outputPath = process.env.PLAN_OUTPUT_PATH;

const spec = {
  summary: taskText,
  filesToChange: [],
  commands: ['bash scripts/test.sh'],
  tests: ['bash scripts/test.sh'],
  rollback: ['Mark blocked and create autofix task'],
  digestBullets: ['single queue item', 'policy gate', 'digest+run report'],
};

if (taskId === 'P0-5') {
  spec.filesToChange = ['socialos/apps/api/server.mjs', 'scripts/tests/cors_policy_check.mjs'];
  spec.commands = ['node scripts/tests/cors_policy_check.mjs', 'node scripts/tests/e2e_smoke.mjs'];
  spec.tests = ['node scripts/tests/cors_policy_check.mjs', 'node scripts/tests/e2e_smoke.mjs', 'bash scripts/test.sh'];
}

if (taskId === 'P1-2') {
  spec.filesToChange = ['socialos/apps/api/server.mjs', 'scripts/tests/e2e_smoke.mjs'];
}

if (taskId === 'P1-3') {
  spec.filesToChange = ['socialos/apps/api/server.mjs', 'scripts/tests/weekly_mirror_smoke.mjs'];
}

if (taskId === 'P1-4') {
  spec.filesToChange = ['README.md', 'socialos/docs/DEMO_SCRIPT.md', 'scripts/demo.sh'];
}

if (taskId === 'P2-2' || taskId === 'P2-3') {
  spec.filesToChange = [
    'socialos/apps/api/server.mjs',
    'socialos/apps/web/server.mjs',
    'scripts/tests/product_workspace_smoke.mjs',
  ];
  spec.commands = ['node scripts/tests/product_workspace_smoke.mjs', 'node scripts/tests/web_routes_smoke.mjs'];
  spec.tests = ['node scripts/tests/product_workspace_smoke.mjs', 'node scripts/tests/web_routes_smoke.mjs', 'bash scripts/test.sh'];
}

if (taskId.startsWith('AUTO-OPT-')) {
  spec.filesToChange = ['reports/auto_opt/latest.md', 'QUEUE.md'];
  spec.commands = ['bash scripts/test.sh', 'bash scripts/bench_embeddings.sh'];
}

fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
NODE
  STAGE_PLAN="pass"
}

run_handler() {
  STAGE_CODER="running"
  local log_file="/tmp/socialos_${RUN_ID}.log"
  local test_log="/tmp/socialos_test_${RUN_ID}.log"
  local bench_log="/tmp/socialos_bench_${RUN_ID}.log"

  case "${TASK_ID}" in
    P0-5)
      if node "${REPO_ROOT}/scripts/tests/cors_policy_check.mjs" >"${log_file}" 2>&1 && node "${REPO_ROOT}/scripts/tests/e2e_smoke.mjs" >>"${log_file}" 2>&1; then
        RUN_SUMMARY="P0-5 unblocked: loopback CORS policy + 7-platform draft path validated"
        RUN_WHY="Cleared reviewer CORS blocker before continuing roadmap items"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue with next pending queue item"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P1-2)
      if node "${REPO_ROOT}/scripts/tests/e2e_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="P1-2 hybrid people search verified"
        RUN_WHY="Verified keyword/vector retrieval behavior and evidence payload"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue with P1-3"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P1-3)
      if node "${REPO_ROOT}/scripts/tests/weekly_mirror_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="P1-3 weekly mirror flow verified"
        RUN_WHY="Ensured self mirror generation and evidence retrieval are operational"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue with P1-4"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P1-4)
      if node "${REPO_ROOT}/scripts/tests/docs_demo_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="P1-4 demo/docs reproducibility check passed"
        RUN_WHY="Keeps evaluator one-command demo path stable"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="proceed to P2 or auto optimization pool"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P2-2)
      if node "${REPO_ROOT}/scripts/tests/product_workspace_smoke.mjs" >"${log_file}" 2>&1 && node "${REPO_ROOT}/scripts/tests/web_routes_smoke.mjs" >>"${log_file}" 2>&1; then
        RUN_SUMMARY="P2-2 assisted publish packages verified for Instagram / Xiaohongshu / Moments"
        RUN_WHY="Local-first package generation now covers the richer operator bundles without waiting on live credentials"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue with P2-3 rich article package"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P2-3)
      if node "${REPO_ROOT}/scripts/tests/product_workspace_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="P2-3 WeChat official rich article package verified"
        RUN_WHY="公众号图文增强已可在本地产品工作台生成并回归验证"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue with next pending queue item"
        STAGE_CODER="pass"
        return 0
      fi
      ;;
    P2-1|P2-4)
      RUN_SUMMARY="${TASK_ID} deferred by policy (external credentials/integration dependency)"
      RUN_WHY="Live/external publish work requires explicit credentials and higher-risk integration pass"
      RUN_RISK="medium"
      RUN_VERIFY="QUEUE.md + runtime dry-run policy"
      RUN_NEXT="autofix task created; continue with lower-risk backlog in next run"
      STAGE_CODER="fail"
      return 2
      ;;
    AUTO-OPT-TEST-DEBT)
      if bash "${REPO_ROOT}/scripts/test.sh" >"${test_log}" 2>&1; then
        RUN_SUMMARY="AUTO-OPT test debt sweep completed"
        RUN_WHY="Continuous loop validates quality gates instead of idle spinning"
        RUN_RISK="low"
        RUN_VERIFY="${test_log}"
        RUN_NEXT="continue auto optimization pool"
        STAGE_CODER="pass"
      else
        STAGE_CODER="fail"
        return 1
      fi
      ;;
    AUTO-OPT-PERF-DEBT)
      if bash "${REPO_ROOT}/scripts/bench_embeddings.sh" >"${bench_log}" 2>&1; then
        RUN_SUMMARY="AUTO-OPT performance bench completed"
        RUN_WHY="Collects recall/latency/cost snapshot for provider decision"
        RUN_RISK="low"
        RUN_VERIFY="${bench_log}"
        RUN_NEXT="continue auto optimization pool"
        STAGE_CODER="pass"
      else
        STAGE_CODER="fail"
        return 1
      fi
      ;;
    AUTO-OPT-DOC-DEBT)
      if node "${REPO_ROOT}/scripts/tests/docs_demo_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="AUTO-OPT doc debt sweep completed"
        RUN_WHY="Prevents drift between runnable scripts and demo documentation"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue auto optimization pool"
        STAGE_CODER="pass"
      else
        STAGE_CODER="fail"
        return 1
      fi
      ;;
    AUTO-OPT-OBS-DEBT)
      if node "${REPO_ROOT}/scripts/tests/ops_api_smoke.mjs" >"${log_file}" 2>&1; then
        RUN_SUMMARY="AUTO-OPT observability sweep completed"
        RUN_WHY="Ensures ops health endpoints remain queryable"
        RUN_RISK="low"
        RUN_VERIFY="${log_file}"
        RUN_NEXT="continue auto optimization pool"
        STAGE_CODER="pass"
      else
        STAGE_CODER="fail"
        return 1
      fi
      ;;
    AUTO-OPT-BLOCKED-TRIAGE)
      blocked_line="$(grep -nE '^- \[!\] ' "${QUEUE_FILE}" | head -n1 || true)"
      if [[ -n "${blocked_line}" ]]; then
        create_autofix_task "Auto-triage from blocked item: ${blocked_line#*:}"
      fi
      RUN_SUMMARY="AUTO-OPT blocked triage completed"
      RUN_WHY="Transforms blocked items into executable autofix backlog"
      RUN_RISK="low"
      RUN_VERIFY="${QUEUE_FILE}"
      RUN_NEXT="continue auto optimization pool"
      STAGE_CODER="pass"
      ;;
    AUTOFIX-*)
      if bash "${REPO_ROOT}/scripts/test.sh" >"${test_log}" 2>&1; then
        RUN_SUMMARY="${TASK_ID} validation sweep completed"
        RUN_WHY="Autofix item run under tester/reviewer gates"
        RUN_RISK="low"
        RUN_VERIFY="${test_log}"
        RUN_NEXT="continue with next pending task"
        STAGE_CODER="pass"
      else
        STAGE_CODER="fail"
        return 1
      fi
      ;;
    *)
      RUN_SUMMARY="No handler implemented for ${TASK_ID}"
      RUN_WHY="Task executor mapping is missing"
      RUN_RISK="medium"
      RUN_VERIFY="scripts/devloop_once.sh"
      RUN_NEXT="autofix task created to implement missing executor"
      STAGE_CODER="fail"
      return 3
      ;;
  esac

  cat > "${AUTO_OPT_REPORT}" <<EOF
# Auto Optimization Latest

- run_id: ${RUN_ID}
- task: ${TASK_ID}
- status: ${RUN_STATUS}
- verify: ${RUN_VERIFY}
- updated_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## What
Auto optimization processed one lane.

## Why
Prevent idle no-op loops while keeping safety gates active.

## Risk
${RUN_RISK}

## Verify
${RUN_VERIFY}

## Next
${RUN_NEXT}
EOF

  return 0
}

run_tester_gate() {
  STAGE_TESTER="running"
  if bash "${REPO_ROOT}/scripts/test.sh" >/tmp/socialos_test_gate_${RUN_ID}.log 2>&1; then
    STAGE_TESTER="pass"
    return 0
  fi
  STAGE_TESTER="fail"
  RUN_STATUS="blocked"
  RUN_SUMMARY="Tester gate failed for ${TASK_ID}"
  RUN_WHY="scripts/test.sh failed after coder stage"
  RUN_RISK="medium"
  RUN_VERIFY="/tmp/socialos_test_gate_${RUN_ID}.log"
  RUN_NEXT="autofix task created; retry next cron cycle"
  return 1
}

run_reviewer_gate() {
  STAGE_REVIEWER="running"
  if node "${REPO_ROOT}/scripts/tests/reviewer_policy_check.mjs" >/tmp/socialos_reviewer_${RUN_ID}.log 2>&1; then
    STAGE_REVIEWER="pass"
    return 0
  fi
  STAGE_REVIEWER="fail"
  RUN_STATUS="blocked"
  RUN_SUMMARY="Reviewer gate failed for ${TASK_ID}"
  RUN_WHY="policy review detected safety regression"
  RUN_RISK="high"
  RUN_VERIFY="/tmp/socialos_reviewer_${RUN_ID}.log"
  RUN_NEXT="autofix task created; retry next cron cycle"
  return 1
}

attempt_push() {
  STAGE_PUSH="running"

  if [[ "${FOUNDRY_SKIP_GIT_PUSH:-0}" == "1" ]]; then
    STAGE_PUSH="skipped:env"
    return 0
  fi

  if ! git -C "${REPO_ROOT}" diff --quiet || ! git -C "${REPO_ROOT}" diff --cached --quiet; then
    git -C "${REPO_ROOT}" add -A
    git -C "${REPO_ROOT}" commit -m "[autodev] ${TASK_ID}: ${RUN_SUMMARY}" >/tmp/socialos_git_commit.log 2>&1 || true
  fi

  current_branch="$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo unknown)"
  if [[ "${current_branch}" != "main" ]]; then
    STAGE_PUSH="blocked:not-on-main(${current_branch})"
    RUN_RISK="medium"
    RUN_NEXT="switch to main for auto push or keep this branch as staging"
    return 0
  fi

  if ! git -C "${REPO_ROOT}" remote get-url origin >/dev/null 2>&1; then
    STAGE_PUSH="skipped:no-origin"
    RUN_NEXT="configure git remote 'origin' to enable auto push"
    return 0
  fi

  if git -C "${REPO_ROOT}" push origin main >/tmp/socialos_push.log 2>&1; then
    git -C "${REPO_ROOT}" push --tags origin >/tmp/socialos_push_tags.log 2>&1 || true
    STAGE_PUSH="pass"
    return 0
  fi

  STAGE_PUSH="blocked:push-failed"
  RUN_RISK="medium"
  RUN_SUMMARY="push blocked"
  RUN_WHY="git push origin main failed"
  RUN_VERIFY="/tmp/socialos_push.log"
  RUN_NEXT="fix remote/auth and retry in next cron cycle"
}

if [[ -f "${MODE_FILE}" ]]; then
  export PUBLISH_MODE="$(tr -d '\n\r ' < "${MODE_FILE}")"
fi

if [[ -f "${PAUSE_FILE}" ]]; then
  RUN_STATUS="noop"
  RUN_SUMMARY="Devloop paused"
  RUN_WHY="Paused via .foundry/PAUSED"
  RUN_RISK="low"
  RUN_VERIFY="${PAUSE_FILE}"
  RUN_NEXT="remove pause flag to resume"
  finish_run
fi

acquire_lock
trap 'release_lock' EXIT

sync_git
ensure_auto_opt_pool
attempt_unblock_p0_5
reopen_auto_opt_if_idle

TASK_LINE="$(grep -nE '^- \[ \] ' "${QUEUE_FILE}" | head -n1 || true)"
if [[ -z "${TASK_LINE}" ]]; then
  RUN_STATUS="noop"
  RUN_SUMMARY="No pending queue task"
  RUN_WHY="queue has no actionable pending item"
  RUN_RISK="low"
  RUN_VERIFY="${QUEUE_FILE}"
  RUN_NEXT="next run will reopen auto optimization lane"
  finish_run
fi

TASK_LINE_NO="${TASK_LINE%%:*}"
TASK_TEXT="${TASK_LINE#*:}"
TASK_ID="$(printf '%s' "${TASK_TEXT}" | grep -oE '(P[0-9]-[0-9]+|OPS-[0-9]+|AUTO-OPT-[A-Z0-9_-]+|AUTOFIX-[A-Z0-9_-]+|TASK-[0-9]+)' | head -n1 || true)"
[[ -n "${TASK_ID}" ]] || TASK_ID="TASK_${RUN_TS}"

RUN_ID="${RUN_TS}_${TASK_ID}"
PLAN_SPEC_FILE="${REPORT_DIR}/${RUN_ID}.planspec.json"
REPORT_MD_FILE="${REPORT_DIR}/${RUN_ID}.md"
REPORT_JSON_FILE="${REPORT_DIR}/${RUN_ID}.json"

set_queue_marker "${TASK_LINE_NO}" "-"
write_lock_meta
write_plan_spec

if run_handler; then
  :
else
  handler_code="$?"
  RUN_STATUS="blocked"
  if [[ "${handler_code}" == "2" ]]; then
    :
  else
    RUN_SUMMARY="Coder stage failed for ${TASK_ID}"
    RUN_WHY="task handler command failed"
    RUN_RISK="medium"
    RUN_VERIFY="/tmp/socialos_${RUN_ID}.log"
    RUN_NEXT="autofix task created; retry next cron cycle"
  fi
  set_queue_marker "${TASK_LINE_NO}" "!"
  create_autofix_task "${RUN_SUMMARY}"
  finish_run
fi

if ! run_tester_gate; then
  set_queue_marker "${TASK_LINE_NO}" "!"
  create_autofix_task "${RUN_SUMMARY}"
  finish_run
fi

if ! run_reviewer_gate; then
  set_queue_marker "${TASK_LINE_NO}" "!"
  create_autofix_task "${RUN_SUMMARY}"
  finish_run
fi

RUN_STATUS="success"
set_queue_marker "${TASK_LINE_NO}" "x"
attempt_push
finish_run
