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
  'bash scripts/hackathon_preflight.sh',
  'bash scripts/overnight_supervisor.sh',
  'node scripts/capture_hackathon_proofs.mjs',
  'node scripts/refresh_public_docs.mjs',
  'node scripts/export_vc_deck.mjs',
  'bash scripts/test.sh',
]) {
  assert(agentDoc.includes(ref), `AGENTS.md must reference ${ref}`);
}

const playbook = read('socialos/docs/AGENT_PLAYBOOK.md');
for (const cmd of ['bash scripts/demo.sh', 'bash scripts/demo_status.sh', 'bash scripts/overnight_supervisor.sh', 'bash scripts/test.sh']) {
  assert(playbook.includes(cmd), `AGENT_PLAYBOOK must include ${cmd}`);
}
assert(playbook.includes('socialos/docs/DOCS_INDEX.md'), 'AGENT_PLAYBOOK should point to DOCS_INDEX');
assert(playbook.includes('node scripts/refresh_public_docs.mjs'), 'AGENT_PLAYBOOK should include generated docs refresh command');

const manifest = JSON.parse(read('socialos/docs/SYSTEM_MANIFEST.json'));
assert(Array.isArray(manifest.surfaces) && manifest.surfaces.length >= 6, 'manifest must list product surfaces');
assert(Array.isArray(manifest.runtimeAgents) && manifest.runtimeAgents.length === 5, 'manifest must list 5 runtime agents');
assert(Array.isArray(manifest.foundryAgents) && manifest.foundryAgents.length === 4, 'manifest must list 4 Foundry agents');
assert(Array.isArray(manifest.keyEndpoints) && manifest.keyEndpoints.includes('POST /workspace/chat'), 'manifest must list workspace/chat');
assert(Array.isArray(manifest.safetyInvariants) && manifest.safetyInvariants.length >= 4, 'manifest must list safety invariants');
assert(typeof manifest.entrypoints?.docsIndex === 'string', 'manifest must include docs index entrypoint');
assert(typeof manifest.entrypoints?.deckRoute === 'string', 'manifest must include deck route entrypoint');
assert(Array.isArray(manifest.pitchPack) && manifest.pitchPack.length === 3, 'manifest must include 3 pitch pack files');
assert(Array.isArray(manifest.generatedStatusFiles) && manifest.generatedStatusFiles.length >= 4, 'manifest must include generated status files');
assert(typeof manifest.deckRoute === 'string', 'manifest must include deck route');
assert(typeof manifest.deckSpec === 'string', 'manifest must include deck spec');
assert(typeof manifest.deckMaintenance === 'string', 'manifest must include deck maintenance doc');
assert(typeof manifest.deckStatusFile === 'string', 'manifest must include generated deck status file');
assert(typeof manifest.deckExportScript === 'string', 'manifest must include deck export script');
assert(typeof manifest.pagesWorkflow === 'string', 'manifest must include deck pages workflow');
assert(Array.isArray(manifest.deckVendorAssets) && manifest.deckVendorAssets.length >= 3, 'manifest must include deck vendor assets');
assert(typeof manifest.refreshScript === 'string', 'manifest must include refresh script');

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
  'socialos/docs/DOCS_INDEX.md',
  'socialos/docs/EVIDENCE.md',
  'socialos/docs/pitch/PITCH_5_MIN.md',
  'socialos/docs/pitch/JUDGE_BRIEF.md',
  'socialos/docs/pitch/DEMO_TALK_TRACK.md',
  'socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md',
  'socialos/docs/pitch/DORAHACKS_BOUNTY_SWAPS.md',
  'socialos/docs/pitch/REHEARSAL_CUES_CN.md',
  'socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md',
  'socialos/docs/pitch/VC_DECK_SPEC.md',
  'socialos/docs/pitch/DECK_MAINTENANCE.md',
  'socialos/docs/pitch/DECK_STATUS.json',
  '.github/workflows/deploy-deck.yml',
  'socialos/docs/HACKATHON_BOUNTIES.md',
  'socialos/docs/IMPORT_INBOX_SPEC.md',
  'socialos/docs/MULTI_ENTITY_CAPTURE.md',
  'socialos/docs/LINKEDIN_MENTION_STRATEGY.md',
  'socialos/docs/STATUS.md',
  'socialos/docs/agent/REPO_STATE.md',
  'socialos/docs/evidence/LATEST_VALIDATION.md',
  'socialos/docs/evidence/socialos-demo.gif',
  'socialos/docs/evidence/sample-run-report.md',
  'socialos/docs/evidence/sample-run-report.json',
  'socialos/docs/evidence/sample-digest.md',
  'scripts/demo_status.sh',
  'scripts/hackathon_preflight.sh',
  'scripts/capture_hackathon_proofs.mjs',
  'scripts/export_vc_deck.mjs',
  'scripts/overnight_supervisor.sh',
  'scripts/refresh_public_docs.mjs',
  'scripts/stop_demo.sh',
  'socialos/apps/web/vendor/reveal/reveal.min.css',
  'socialos/apps/web/vendor/reveal/reveal.min.js',
  'socialos/apps/web/vendor/reveal/notes.min.js',
]) {
  assert(exists(relPath), `${relPath} must exist`);
}

console.log('agent_repo_smoke: PASS');
