import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const runtimePath = path.join(root, 'socialos/openclaw/runtime.openclaw.json5');
const txt = fs.readFileSync(runtimePath, 'utf8');
const cfg = Function(`"use strict"; return (${txt});`)();

const agents = new Map((cfg?.agents?.list || []).map((a) => [a.id, a]));
const required = ['orchestrator', 'people-memory', 'self-model', 'compliance', 'publisher'];
for (const id of required) {
  if (!agents.has(id)) throw new Error(`missing agent ${id}`);
}

const orch = agents.get('orchestrator');
const orchDeny = new Set(orch?.tools?.deny || []);
for (const t of ['browser', 'exec', 'publish_execute']) {
  if (!orchDeny.has(t)) throw new Error(`orchestrator must deny ${t}`);
}

for (const id of ['people-memory', 'self-model', 'compliance']) {
  const deny = new Set((agents.get(id)?.tools?.deny) || []);
  if (!deny.has('publish_execute')) throw new Error(`${id} must deny publish_execute`);
}

const publisher = agents.get('publisher');
const pubAllow = new Set([...(publisher?.tools?.allow || []), ...(publisher?.tools?.alsoAllow || [])]);
if (!pubAllow.has('publish_execute')) throw new Error('publisher must allow publish_execute');

const envMode = cfg?.env?.vars?.PUBLISH_MODE;
if (envMode !== 'dry-run') throw new Error('default PUBLISH_MODE must be dry-run');

console.log('runtime_policy_check: PASS');
