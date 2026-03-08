import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const readme = read('README.md');
assert(readme.includes('## Project Overview'), 'README must include a Project Overview section');
assert(readme.includes('## Setup & Installation'), 'README must include a Setup & Installation section');
assert(readme.includes('## Architecture Overview'), 'README must include an Architecture Overview section');
assert(readme.includes('## Bounty-Specific Integration'), 'README must include a Bounty-Specific Integration section');
assert(readme.includes('bash scripts/demo.sh'), 'README must expose one-command demo bootstrap command');
assert(readme.includes('bash scripts/demo_status.sh'), 'README must expose demo status command');
assert(readme.includes('bash scripts/stop_demo.sh'), 'README must expose demo stop command');
assert(/loopback-only/i.test(readme), 'README must mention loopback-only posture');
assert(readme.includes('dry-run'), 'README must mention dry-run safety default');
assert(
  readme.includes('gateway.bind') && readme.includes('gateway.tailscale') && readme.includes('gateway.auth'),
  'README must keep gateway exposure constraints explicit'
);
assert(readme.includes('AGENTS.md'), 'README should link to repo-level AGENTS.md');
assert(readme.includes('socialos/docs/SYSTEM_MANIFEST.json'), 'README should link to the system manifest');
assert(readme.includes('socialos/docs/EVIDENCE.md'), 'README should link to curated evidence');
assert(readme.includes('socialos/docs/DOCS_INDEX.md'), 'README should link to the docs index');
assert(readme.includes('socialos/docs/pitch/PITCH_5_MIN.md'), 'README should link to the 5-minute pitch');
assert(readme.includes('socialos/docs/pitch/VC_DECK_SPEC.md'), 'README should link to the VC deck spec');
assert(readme.includes('socialos/docs/pitch/DECK_MAINTENANCE.md'), 'README should link to the deck maintenance doc');
assert(readme.includes('/deck'), 'README should mention the deck route');
assert(readme.includes('/demo') && readme.includes('/hackathon') && readme.includes('/buddy'), 'README should mention the hackathon routes');
assert(readme.includes('node scripts/export_vc_deck.mjs'), 'README should expose the deck export command');
assert(readme.includes('bash scripts/hackathon_preflight.sh'), 'README should expose the hackathon preflight command');
assert(readme.includes('node scripts/capture_hackathon_proofs.mjs'), 'README should expose the hackathon proof capture command');
assert(readme.includes('socialos/docs/STATUS.md'), 'README should link to generated public status');
assert(readme.includes('node scripts/refresh_public_docs.mjs'), 'README should expose the public docs refresh command');
assert(readme.includes('socialos/docs/HACKATHON_BOUNTIES.md'), 'README should link to the hackathon bounty guide');
assert(readme.includes('socialos/docs/pitch/DORAHACKS_MASTER_SCRIPT.md'), 'README should link to the DoraHacks master script');
assert(readme.includes('socialos/docs/pitch/RECORDING_AND_SUBMISSION_RUNBOOK.md'), 'README should link to the recording runbook');
assert(readme.includes('socialos/docs/API_SETUP.md'), 'README should link to the API setup guide');
assert(readme.includes('socialos/docs/REUSE_SOCIALOS.md'), 'README should link to the reuse guide');
assert(readme.includes('socialos/docs/EMBEDDINGS.md'), 'README should link to the embeddings guide');
assert(readme.includes('bash scripts/provider_doctor.sh'), 'README should expose the provider doctor command');
assert(readme.includes('5 independent `5-8 minute` videos'), 'README should explain the five independent DoraHacks videos');
assert(readme.includes('Canonical Bounty Hub'), 'README should position /hackathon as the canonical public bounty hub');

const demoDoc = read('socialos/docs/DEMO_SCRIPT.md');
for (const cmd of ['bash scripts/demo.sh', 'bash scripts/demo_status.sh', 'bash scripts/test.sh', 'bash scripts/stop_demo.sh']) {
  assert(demoDoc.includes(cmd), `DEMO_SCRIPT must include command: ${cmd}`);
}
assert(demoDoc.includes('socialos/docs/EVIDENCE.md'), 'DEMO_SCRIPT should point to curated evidence');
assert(demoDoc.includes('/demo') && demoDoc.includes('/hackathon') && demoDoc.includes('/buddy'), 'DEMO_SCRIPT should mention the hackathon routes');
assert(demoDoc.includes('5-10 minutes'), 'DEMO_SCRIPT should still explain the pitch-length demo arc');

const demoScript = read('scripts/demo.sh');
assert(demoScript.includes('runtime_policy_check.mjs'), 'demo.sh must run runtime policy smoke check');
assert(demoScript.includes('demo_service_control.mjs'), 'demo.sh should use demo service control helper');
assert(read('socialos/docs/DEMO_SCRIPT.md').includes('bash scripts/hackathon_preflight.sh'), 'DEMO_SCRIPT should include the hackathon preflight command');

console.log('docs_demo_smoke: PASS');
