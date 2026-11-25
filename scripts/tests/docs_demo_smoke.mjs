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
assert(readme.includes('## See it'), 'README must include a public verification section');
assert(readme.includes('## Run it locally'), 'README must include a single local run section');
assert(readme.includes('socialos/docs/evidence/socialos-demo-step01.png'), 'README must show the Workspace screenshot');
assert(readme.includes('## Architecture Overview'), 'README must include an Architecture Overview section');
assert(readme.includes('## Bounty-Specific Integration'), 'README must include a Bounty-Specific Integration section');
assert(/loopback-only/i.test(readme), 'README must mention loopback-only posture');
assert(readme.includes('dry-run'), 'README must mention dry-run safety default');
assert(
  readme.includes('gateway.bind') && readme.includes('gateway.tailscale') && readme.includes('gateway.auth'),
  'README must keep gateway exposure constraints explicit'
);
assert(readme.includes('/demo') && readme.includes('/hackathon') && readme.includes('/buddy'), 'README should mention the hackathon routes');
assert(readme.includes('socialos/docs/HACKATHON_BOUNTIES.md'), 'README should link to the hackathon bounty guide');
assert(readme.includes('Hackathon materials: [socialos/docs/pitch/]'), 'README should point to the pitch materials');
assert(!readme.includes('## Demo Flow'), 'README should not include an archived recording instruction section');
assert(!readme.includes('cp .env.example .env'), 'README should not describe a conflicting environment setup');

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
