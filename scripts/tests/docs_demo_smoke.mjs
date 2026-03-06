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

const demoDoc = read('socialos/docs/DEMO_SCRIPT.md');
for (const cmd of ['bash scripts/demo.sh', 'bash scripts/demo_status.sh', 'bash scripts/test.sh', 'bash scripts/stop_demo.sh']) {
  assert(demoDoc.includes(cmd), `DEMO_SCRIPT must include command: ${cmd}`);
}
assert(demoDoc.includes('socialos/docs/EVIDENCE.md'), 'DEMO_SCRIPT should point to curated evidence');

const demoScript = read('scripts/demo.sh');
assert(demoScript.includes('runtime_policy_check.mjs'), 'demo.sh must run runtime policy smoke check');
assert(demoScript.includes('demo_service_control.mjs'), 'demo.sh should use demo service control helper');

console.log('docs_demo_smoke: PASS');
