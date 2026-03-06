#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_FILE="${SOCIALOS_QUEUE_FILE:-${REPO_ROOT}/QUEUE.md}"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
LOCK_DIR="${REPO_ROOT}/.locks/devloop.lock"
LOCK_META="${LOCK_DIR}/meta.env"
RUN_DIR="${SOCIALOS_RUN_DIR:-${REPO_ROOT}/reports/runs}"
LATEST="${SOCIALOS_LATEST_DIGEST_FILE:-${REPO_ROOT}/reports/LATEST.md}"

mode="RUNNING"
[[ -f "${PAUSE_FILE}" ]] && mode="PAUSED"

lock_status="none"
lock_owner_pid=""
lock_heartbeat_age_sec=""
if [[ -d "${LOCK_DIR}" ]]; then
  lock_status="present"
  if [[ -f "${LOCK_META}" ]]; then
    lock_owner_pid="$(grep -E '^pid=' "${LOCK_META}" | head -n1 | cut -d= -f2- || true)"
    hb_epoch="$(grep -E '^heartbeat_epoch=' "${LOCK_META}" | head -n1 | cut -d= -f2- || true)"
    if [[ "${hb_epoch:-}" =~ ^[0-9]+$ ]]; then
      lock_heartbeat_age_sec="$(( $(date +%s) - hb_epoch ))"
    fi
  fi
fi

pending_count="0"
in_progress_count="0"
blocked_count="0"
done_count="0"
current_task="none"
queue_notice=""
if [[ -f "${QUEUE_FILE}" ]]; then
  pending_count="$(grep -cE '^- \[ \] ' "${QUEUE_FILE}" || true)"
  in_progress_count="$(grep -cE '^- \[-\] ' "${QUEUE_FILE}" || true)"
  blocked_count="$(grep -cE '^- \[!\] ' "${QUEUE_FILE}" || true)"
  # Keep queue accounting aligned with API parsing, which treats both [x] and [X] as done.
  done_count="$(grep -cE '^- \[[xX]\] ' "${QUEUE_FILE}" || true)"
  current_task="$(grep -E '^- \[( |-|!)\] ' "${QUEUE_FILE}" | head -n 1 | sed -E 's/^- \[[^]]\] //' || true)"
  [[ -z "${current_task}" ]] && current_task="none"
else
  queue_notice="missing (${QUEUE_FILE})"
fi

latest_json="$(node - "${RUN_DIR}" <<'NODE'
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
let files = [];
try {
  files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.planspec.json'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
} catch {
  process.stdout.write('');
  process.exit(0);
}
for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(path.join(dir, file.name), 'utf8'));
    process.stdout.write(path.join(dir, file.name));
    process.exit(0);
  } catch {
    continue;
  }
}
process.stdout.write('');
NODE
)"

consecutive_failures="0"
if [[ -n "${latest_json}" ]]; then
  consecutive_failures="$(node - "${RUN_DIR}" <<'NODE'
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
let files = [];
try {
  files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.planspec.json'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 30)
    .map((item) => item.name);
} catch {
  process.stdout.write('0');
  process.exit(0);
}
let count = 0;
for (const file of files) {
  try {
    const run = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (run.status === 'success' || run.status === 'noop') break;
    count += 1;
  } catch {
    count += 1;
  }
}
process.stdout.write(String(count));
NODE
)"
fi

echo "== Foundry Status =="
echo "mode: ${mode}"
echo "lock: ${lock_status}"
[[ -n "${lock_owner_pid}" ]] && echo "lock_owner_pid: ${lock_owner_pid}"
[[ -n "${lock_heartbeat_age_sec}" ]] && echo "lock_heartbeat_age_sec: ${lock_heartbeat_age_sec}"
echo
echo "Queue:"
echo "pending=${pending_count} in_progress=${in_progress_count} blocked=${blocked_count} done=${done_count}"
echo "current_task: ${current_task}"
[[ -n "${queue_notice}" ]] && echo "queue_file: ${queue_notice}"
echo
echo "Consecutive failures: ${consecutive_failures}"
echo
echo "Latest run:"
if [[ -n "${latest_json}" ]]; then
  node - "${latest_json}" <<'NODE'
const fs = require('fs');
const runPath = process.argv[2];
try {
  const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  console.log(`run_id: ${run.runId}`);
  console.log(`status: ${run.status}`);
  console.log(`summary: ${run.summary}`);
  console.log(`duration_ms: ${run.durationMs}`);
  console.log(`push: ${run?.stages?.push || 'unknown'}`);
  console.log(`next: ${run.next}`);
} catch {
  console.log(`unable to parse: ${runPath}`);
}
NODE
else
  echo "No run report JSON found."
fi
echo
echo "Blocked queue head:"
if [[ -f "${QUEUE_FILE}" ]]; then
  grep -E '^- \[!\] ' "${QUEUE_FILE}" | head -n 5 | sed -E 's/^- \[!\] //' || true
else
  echo "none (queue file missing)"
fi
echo
echo "Latest digest:"
if [[ -f "${LATEST}" ]]; then
  sed -n '1,8p' "${LATEST}"
else
  echo "No digest yet."
fi
