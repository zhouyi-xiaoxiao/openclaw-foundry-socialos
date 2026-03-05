#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_CONFIG="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
PATCH_FILE="${REPO_ROOT}/foundry/openclaw.foundry.json5"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR_HOME="${HOME}/.openclaw/backups"
BACKUP_DIR_REPO="${REPO_ROOT}/foundry/backups"

mkdir -p "${BACKUP_DIR_HOME}" "${BACKUP_DIR_REPO}"

if [[ ! -f "${TARGET_CONFIG}" ]]; then
  echo "OpenClaw config not found at ${TARGET_CONFIG}" >&2
  exit 1
fi

cp "${TARGET_CONFIG}" "${BACKUP_DIR_HOME}/openclaw.json.${STAMP}.bak"
cp "${TARGET_CONFIG}" "${BACKUP_DIR_REPO}/openclaw.json.${STAMP}.bak"

echo "Backups written:"
echo "  ${BACKUP_DIR_HOME}/openclaw.json.${STAMP}.bak"
echo "  ${BACKUP_DIR_REPO}/openclaw.json.${STAMP}.bak"

TARGET_CONFIG="${TARGET_CONFIG}" PATCH_FILE="${PATCH_FILE}" node <<'NODE'
const fs = require("fs");

const targetPath = process.env.TARGET_CONFIG;
const patchPath = process.env.PATCH_FILE;

const current = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));

function isObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, extra) {
  if (Array.isArray(extra)) {
    return extra.slice();
  }
  if (!isObject(extra)) {
    return extra;
  }
  const out = isObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(extra)) {
    if (isObject(v)) {
      out[k] = deepMerge(out[k], v);
    } else if (Array.isArray(v)) {
      out[k] = v.slice();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function upsertAgents(existingAgents, patchAgents) {
  const list = Array.isArray(existingAgents) ? existingAgents.slice() : [];
  for (const agent of patchAgents) {
    if (!agent || typeof agent.id !== "string") {
      continue;
    }
    const idx = list.findIndex((x) => x && x.id === agent.id);
    if (idx >= 0) {
      list[idx] = deepMerge(list[idx], agent);
    } else {
      list.push(agent);
    }
    const target = idx >= 0 ? list[idx] : list[list.length - 1];
    if (
      target &&
      isObject(target.tools) &&
      Array.isArray(target.tools.alsoAllow) &&
      Array.isArray(target.tools.allow)
    ) {
      delete target.tools.allow;
    }
  }
  return list;
}

const next = deepMerge(current, {});
next.agents = isObject(next.agents) ? next.agents : {};
next.agents.list = upsertAgents(next.agents.list, patch?.agents?.list || []);

next.plugins = isObject(next.plugins) ? next.plugins : {};
next.plugins.entries = isObject(next.plugins.entries) ? next.plugins.entries : {};
if (patch?.plugins?.entries) {
  for (const [pluginId, pluginCfg] of Object.entries(patch.plugins.entries)) {
    next.plugins.entries[pluginId] = deepMerge(next.plugins.entries[pluginId], pluginCfg);
  }
}

next.cron = deepMerge(next.cron, patch?.cron || {});

fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n", "utf8");
NODE

openclaw config validate

echo "Foundry config merged and validated successfully."
