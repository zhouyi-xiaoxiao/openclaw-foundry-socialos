#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_FILE="${SOCIALOS_QUEUE_FILE:-${REPO_ROOT}/QUEUE.md}"
STUDIO_STATUS_JSON_OVERRIDE="${SOCIALOS_STUDIO_STATUS_JSON:-}"
PAUSE_FILE="${REPO_ROOT}/.foundry/PAUSED"
LOCK_DIR="${REPO_ROOT}/.locks/devloop.lock"
LOCK_META="${LOCK_DIR}/meta.env"
RUN_DIR="${SOCIALOS_RUN_DIR:-${REPO_ROOT}/reports/runs}"
LATEST="${SOCIALOS_LATEST_DIGEST_FILE:-${REPO_ROOT}/reports/LATEST.md}"
run_dir_notice=""
if [[ ! -d "${RUN_DIR}" ]]; then
  run_dir_notice="missing (${RUN_DIR})"
else
  run_report_count="$(find "${RUN_DIR}" -maxdepth 1 -type f -name '*.json' ! -name '*.planspec.json' | wc -l | tr -d ' ')"
  if [[ "${run_report_count}" == "0" ]]; then
    run_dir_notice="empty (${RUN_DIR})"
  fi
fi

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
studio_status_json=""
studio_status_ok="0"
if [[ -z "${SOCIALOS_QUEUE_FILE:-}" ]]; then
  if [[ -n "${STUDIO_STATUS_JSON_OVERRIDE}" ]]; then
    studio_status_json="${STUDIO_STATUS_JSON_OVERRIDE}"
  else
    studio_status_json="$(bash "${REPO_ROOT}/scripts/studio.sh" status 2>/dev/null || true)"
  fi

  if [[ -n "${studio_status_json}" ]]; then
    studio_queue_summary="$(printf '%s' "${studio_status_json}" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(data);
    const queue = payload && typeof payload.queue === "object" ? payload.queue : {};
    const pending = Number.isFinite(Number(queue.pending)) ? Number(queue.pending) : 0;
    const inProgress = Number.isFinite(Number(queue.inProgress)) ? Number(queue.inProgress) : 0;
    const blocked = Number.isFinite(Number(queue.blocked)) ? Number(queue.blocked) : 0;
    const done = Number.isFinite(Number(queue.done)) ? Number(queue.done) : 0;
    const currentTask = typeof queue.currentTask === "string" && queue.currentTask.trim() ? queue.currentTask.trim() : "none";
    process.stdout.write(`${pending}\t${inProgress}\t${blocked}\t${done}\t${currentTask}`);
  } catch {
    process.stdout.write("");
  }
});
')"
    if [[ -n "${studio_queue_summary}" ]]; then
      IFS=$'\t' read -r pending_count in_progress_count blocked_count done_count current_task <<< "${studio_queue_summary}"
      studio_status_ok="1"
    fi
  fi
fi

if [[ "${studio_status_ok}" != "1" ]]; then
  if [[ -f "${QUEUE_FILE}" ]]; then
    pending_count="$(grep -cE '^[[:space:]]*-[[:space:]]+\[ \][[:space:]]+' "${QUEUE_FILE}" || true)"
    in_progress_count="$(grep -cE '^[[:space:]]*-[[:space:]]+\[-\][[:space:]]+' "${QUEUE_FILE}" || true)"
    blocked_count="$(grep -cE '^[[:space:]]*-[[:space:]]+\[!\][[:space:]]+' "${QUEUE_FILE}" || true)"
    # Keep queue accounting aligned with API parsing, which treats both [x] and [X] as done.
    done_count="$(grep -cE '^[[:space:]]*-[[:space:]]+\[[xX]\][[:space:]]+' "${QUEUE_FILE}" || true)"
    # Prefer in-progress work as the active task, then fall back to pending work.
    current_task="$(grep -E '^[[:space:]]*-[[:space:]]+\[-\][[:space:]]+' "${QUEUE_FILE}" | head -n 1 | sed -E 's/^[[:space:]]*-[[:space:]]+\[[^]]\][[:space:]]+//' || true)"
    if [[ -z "${current_task}" ]]; then
      current_task="$(grep -E '^[[:space:]]*-[[:space:]]+\[ \][[:space:]]+' "${QUEUE_FILE}" | head -n 1 | sed -E 's/^[[:space:]]*-[[:space:]]+\[[^]]\][[:space:]]+//' || true)"
    fi
    [[ -z "${current_task}" ]] && current_task="none"
  else
    queue_notice="missing (${QUEUE_FILE})"
  fi
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
[[ -n "${run_dir_notice}" ]] && echo "run_reports_dir: ${run_dir_notice}"
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
elif [[ -f "${LATEST}" ]]; then
  node - "${LATEST}" <<'NODE'
const fs = require('fs');
const digestPath = process.argv[2];
try {
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  const readValue = (label) => {
    const prefix = `${label}:`;
    const line = lines.find((entry) => entry.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : '';
  };
  const runId = readValue('Run') || 'unknown';
  const summary = readValue('What') || 'unknown';
  const next = readValue('Next') || 'unknown';
  console.log(`run_id: ${runId}`);
  console.log('status: unknown (digest-only)');
  console.log(`summary: ${summary}`);
  console.log('duration_ms: unknown');
  console.log('push: unknown');
  console.log(`next: ${next}`);
} catch {
  console.log(`unable to parse digest fallback: ${digestPath}`);
}
NODE
else
  echo "No run report JSON found."
fi
echo
echo "Blocked queue head:"
if [[ "${studio_status_ok}" == "1" ]]; then
  blocked_head="$(printf '%s' "${studio_status_json}" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(data);
    const blockedHead = Array.isArray(payload?.blockedHead) ? payload.blockedHead : [];
    const lines = blockedHead
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object" && typeof entry.task === "string") {
          const task = entry.task.trim();
          const reason = typeof entry.blockedBy === "string"
            ? entry.blockedBy.replace(/^blocked by:\s*/iu, "").trim()
            : "";
          return reason ? `${task} (blocked by: ${reason})` : task;
        }
        return "";
      })
      .filter(Boolean)
      .slice(0, 5);
    process.stdout.write(lines.join("\n"));
  } catch {
    process.stdout.write("");
  }
});
')"
  if [[ -n "${blocked_head}" ]]; then
    printf '%s\n' "${blocked_head}"
  else
    echo "none"
  fi
elif [[ -f "${QUEUE_FILE}" ]]; then
  blocked_head="$(grep -E '^[[:space:]]*-[[:space:]]+\[!\][[:space:]]+' "${QUEUE_FILE}" | head -n 5 | sed -E 's/^[[:space:]]*-[[:space:]]+\[!\][[:space:]]+//' || true)"
  if [[ -n "${blocked_head}" ]]; then
    printf '%s\n' "${blocked_head}"
  else
    echo "none"
  fi
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
