#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TZ_NAME="Europe/London"

eval "$("${SCRIPT_DIR}/00_discover_gateway.sh" --exports-only)"

get_job_id_by_name() {
  local target_name="$1"
  local cron_json
  cron_json="$(openclaw cron list --all --json)"
  printf '%s' "${cron_json}" | node -e '
const fs = require("fs");
const name = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const jobs = Array.isArray(data.jobs) ? data.jobs : [];
const match = jobs.find((j) => j && j.name === name);
if (match && match.id) process.stdout.write(String(match.id));
' "${target_name}"
}

upsert_job() {
  local name="$1"
  local cron_expr="$2"
  local message="$3"
  local timeout_seconds="$4"
  local session_key="$5"
  local id

  id="$(get_job_id_by_name "${name}")"
  if [[ -n "${id}" ]]; then
    echo "Updating existing cron job ${name} (${id})"
    openclaw cron edit "${id}" \
      --name "${name}" \
      --cron "${cron_expr}" \
      --tz "${TZ_NAME}" \
      --agent "forge_orchestrator" \
      --light-context \
      --thinking minimal \
      --session isolated \
      --session-key "${session_key}" \
      --message "${message}" \
      --timeout-seconds "${timeout_seconds}" \
      --no-deliver \
      --enable >/dev/null
  else
    echo "Creating cron job ${name}"
    openclaw cron add \
      --name "${name}" \
      --cron "${cron_expr}" \
      --tz "${TZ_NAME}" \
      --agent "forge_orchestrator" \
      --light-context \
      --thinking minimal \
      --session isolated \
      --session-key "${session_key}" \
      --message "${message}" \
      --timeout-seconds "${timeout_seconds}" \
      --no-deliver \
      --exact >/dev/null
  fi
}

upsert_job "DEVLOOP_REALTIME" "*/30 * * * * *" "Execute exactly: bash ${REPO_ROOT}/scripts/foundry_dispatch.sh RUN_DEVLOOP_ONCE" "90" "agent:forge_orchestrator:dispatch-v3"
upsert_job "DIGEST_PERIODIC" "0 */15 * * * *" "Execute exactly: bash ${REPO_ROOT}/scripts/foundry_dispatch.sh SEND_DIGEST_NOTIFICATION" "45" "agent:forge_orchestrator:digest-v3"

echo "Cron jobs configured."
openclaw cron list --all --json
