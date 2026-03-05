import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const runtimePath = path.join(root, 'socialos/openclaw/runtime.openclaw.json5');
const manifestPath = path.join(root, 'socialos/openclaw/plugins/socialos-tools/tool-manifest.json');
const schemaPath = path.join(root, 'socialos/openclaw/plugins/socialos-tools/tools.schema.json');

const runtime = Function(`"use strict"; return (${fs.readFileSync(runtimePath, 'utf8')});`)();
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const expectedTools = [
  'crm_upsert_person',
  'crm_search_person',
  'crm_link_identity',
  'self_log_checkin',
  'self_generate_weekly_mirror',
  'event_create',
  'event_update',
  'draft_create',
  'draft_list',
  'publish_queue_task',
  'publish_execute',
  'audit_log_append',
  'dev_digest_append',
];

const manifestTools = new Map((manifest?.tools || []).map((tool) => [tool?.name, tool]));
for (const name of expectedTools) {
  if (!manifestTools.has(name)) throw new Error(`manifest missing ${name}`);
  if (!schema?.properties?.[name]) throw new Error(`schema missing ${name}`);
}

const publishManifest = manifestTools.get('publish_execute');
if (publishManifest?.optional !== true) {
  throw new Error('publish_execute must be optional in tool-manifest.json');
}
if (schema?.properties?.publish_execute?.['x-optional'] !== true) {
  throw new Error('publish_execute must set x-optional=true in tools.schema.json');
}
const requiredSchemaTools = new Set(Array.isArray(schema?.required) ? schema.required : []);
if (requiredSchemaTools.has('publish_execute')) {
  throw new Error('publish_execute must not be required in tools.schema.json');
}

const agents = new Map((runtime?.agents?.list || []).map((agent) => [agent.id, agent]));
for (const id of ['orchestrator', 'people-memory', 'self-model', 'compliance', 'publisher']) {
  if (!agents.has(id)) throw new Error(`missing agent ${id}`);
}

const orchestrator = agents.get('orchestrator');
const orchestratorDeny = new Set(orchestrator?.tools?.deny || []);
for (const deniedTool of ['browser', 'exec', 'publish_execute']) {
  if (!orchestratorDeny.has(deniedTool)) {
    throw new Error(`orchestrator must deny ${deniedTool}`);
  }
}

for (const [agentId, agent] of agents.entries()) {
  const deny = new Set(agent?.tools?.deny || []);
  const allowed = new Set([...(agent?.tools?.allow || []), ...(agent?.tools?.alsoAllow || [])]);

  if (agentId === 'publisher') {
    if (!allowed.has('publish_execute')) {
      throw new Error('publisher must allow publish_execute');
    }
    continue;
  }

  if (!deny.has('publish_execute')) {
    throw new Error(`${agentId} must deny publish_execute`);
  }
  if (allowed.has('publish_execute')) {
    throw new Error(`${agentId} must not allow publish_execute`);
  }
}

const envMode = runtime?.env?.vars?.PUBLISH_MODE;
if (envMode !== 'dry-run') throw new Error('default PUBLISH_MODE must be dry-run');

console.log('runtime_policy_check: PASS');
