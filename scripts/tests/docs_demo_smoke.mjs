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
assert(/loopback-only/i.test(readme), 'README must mention loopback-only posture');
assert(readme.includes('dry-run'), 'README must mention dry-run safety default');
assert(
  readme.includes('gateway.bind') && readme.includes('gateway.tailscale') && readme.includes('gateway.auth'),
  'README must keep gateway exposure constraints explicit'
);

const demoDoc = read('socialos/docs/DEMO_SCRIPT.md');
for (const cmd of ['bash scripts/demo.sh', 'bash scripts/test.sh', 'bash scripts/devloop_once.sh']) {
  assert(demoDoc.includes(cmd), `DEMO_SCRIPT must include command: ${cmd}`);
}
assert(demoDoc.includes('reports/LATEST.md'), 'DEMO_SCRIPT should point to digest evidence');

const demoScript = read('scripts/demo.sh');
assert(demoScript.includes('runtime_policy_check.mjs'), 'demo.sh must run runtime policy smoke check');

console.log('docs_demo_smoke: PASS');
