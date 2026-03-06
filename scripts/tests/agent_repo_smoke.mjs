import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseLooseObject(relPath) {
  const raw = read(relPath);
  return Function(`"use strict"; return (${raw});`)();
}

const agentDoc = read('AGENTS.md');
for (const ref of [
  'socialos/apps/web/server.mjs',
  'socialos/apps/api/server.mjs',
  'socialos/openclaw/runtime.openclaw.json5',
  'foundry/openclaw.foundry.json5',
  'bash scripts/demo.sh',
  'bash scripts/test.sh',
]) {
  assert(agentDoc.includes(ref), `AGENTS.md must reference ${ref}`);
}

const playbook = read('socialos/docs/AGENT_PLAYBOOK.md');
for (const cmd of ['bash scripts/demo.sh', 'bash scripts/demo_status.sh', 'bash scripts/test.sh']) {
  assert(playbook.includes(cmd), `AGENT_PLAYBOOK must include ${cmd}`);
}

const manifest = JSON.parse(read('socialos/docs/SYSTEM_MANIFEST.json'));
assert(Array.isArray(manifest.surfaces) && manifest.surfaces.length >= 6, 'manifest must list product surfaces');
assert(Array.isArray(manifest.runtimeAgents) && manifest.runtimeAgents.length === 5, 'manifest must list 5 runtime agents');
assert(Array.isArray(manifest.foundryAgents) && manifest.foundryAgents.length === 4, 'manifest must list 4 Foundry agents');
assert(Array.isArray(manifest.keyEndpoints) && manifest.keyEndpoints.includes('POST /workspace/chat'), 'manifest must list workspace/chat');
assert(Array.isArray(manifest.safetyInvariants) && manifest.safetyInvariants.length >= 4, 'manifest must list safety invariants');

const runtime = parseLooseObject('socialos/openclaw/runtime.openclaw.json5');
const runtimeIds = runtime.agents.list.map((agent) => agent.id).sort();
const manifestRuntimeIds = manifest.runtimeAgents.map((agent) => agent.id).sort();
assert(
  JSON.stringify(runtimeIds) === JSON.stringify(manifestRuntimeIds),
  `manifest runtime agents must match runtime config (${runtimeIds.join(', ')})`
);

const foundry = parseLooseObject('foundry/openclaw.foundry.json5');
const foundryIds = foundry.agents.list.map((agent) => agent.id).sort();
const manifestFoundryIds = manifest.foundryAgents.map((agent) => agent.id).sort();
assert(
  JSON.stringify(foundryIds) === JSON.stringify(manifestFoundryIds),
  `manifest Foundry agents must match Foundry config (${foundryIds.join(', ')})`
);

for (const relPath of [
  'socialos/docs/EVIDENCE.md',
  'socialos/docs/evidence/socialos-demo.gif',
  'socialos/docs/evidence/sample-run-report.md',
  'socialos/docs/evidence/sample-run-report.json',
  'socialos/docs/evidence/sample-digest.md',
  'scripts/demo_status.sh',
  'scripts/stop_demo.sh',
]) {
  assert(exists(relPath), `${relPath} must exist`);
}

console.log('agent_repo_smoke: PASS');
