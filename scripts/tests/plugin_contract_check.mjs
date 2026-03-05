import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const schemaPath = path.join(root, 'socialos/openclaw/plugins/socialos-tools/tools.schema.json');
const manifestPath = path.join(root, 'socialos/openclaw/plugins/socialos-tools/tool-manifest.json');
const runtimePath = path.join(root, 'socialos/openclaw/runtime.openclaw.json5');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const runtime = Function(`"use strict"; return (${fs.readFileSync(runtimePath, 'utf8')});`)();

const requiredTools = [
  'crm_upsert_person', 'crm_search_person', 'crm_link_identity',
  'self_log_checkin', 'self_generate_weekly_mirror',
  'event_create', 'event_update', 'draft_create', 'draft_list',
  'publish_queue_task', 'publish_execute',
  'audit_log_append', 'dev_digest_append'
];

for (const tool of requiredTools) {
  if (!schema.properties?.[tool]) throw new Error(`schema missing ${tool}`);
  if (!manifest.tools?.some((t) => t.name === tool)) throw new Error(`manifest missing ${tool}`);
}

const publishEntry = manifest.tools.find((t) => t.name === 'publish_execute');
if (!publishEntry?.optional) throw new Error('publish_execute must be optional in manifest');

const agents = new Map((runtime?.agents?.list || []).map((a) => [a.id, a]));
for (const id of ['orchestrator', 'people-memory', 'self-model', 'compliance']) {
  const deny = new Set(agents.get(id)?.tools?.deny || []);
  if (!deny.has('publish_execute')) throw new Error(`${id} must deny publish_execute`);
}
const publisher = agents.get('publisher');
const allowed = new Set([...(publisher?.tools?.allow || []), ...(publisher?.tools?.alsoAllow || [])]);
if (!allowed.has('publish_execute')) throw new Error('publisher must allow publish_execute');

console.log('plugin_contract_check: PASS');
