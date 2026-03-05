#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
      --session isolated \
      --session-key "${session_key}" \
      --message "${message}" \
      --timeout-seconds "${timeout_seconds}" \
      --no-deliver \
      --exact >/dev/null
  fi
}

upsert_job "DEVLOOP_REALTIME" "*/30 * * * * *" "RUN_DEVLOOP_ONCE" "900" "agent:forge_orchestrator:main"
upsert_job "DIGEST_PERIODIC" "0 */15 * * * *" "SEND_DIGEST_NOTIFICATION" "120" "agent:forge_orchestrator:main"

echo "Cron jobs configured."
openclaw cron list --all --json
