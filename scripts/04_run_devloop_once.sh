#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB_NAME="${1:-FOUNDY_DEVLOOP_REALTIME}"

eval "$("${SCRIPT_DIR}/00_discover_gateway.sh" --exports-only)"

JOB_ID="$(openclaw cron list --all --json | node -e '
const fs = require("fs");
const target = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const jobs = Array.isArray(data.jobs) ? data.jobs : [];
const job = jobs.find((j) => j && j.name === target);
if (!job || !job.id) process.exit(2);
process.stdout.write(String(job.id));
' "${JOB_NAME}")"

openclaw cron run "${JOB_ID}"
