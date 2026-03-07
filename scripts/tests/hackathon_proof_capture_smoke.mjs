import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const evidenceDir = path.join(root, 'socialos', 'docs', 'evidence');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(evidenceDir, fileName), 'utf8'));
}

async function main() {
  const result = spawnSync('node', ['scripts/capture_hackathon_proofs.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert(result.status === 0, `capture_hackathon_proofs should exit 0 (got ${result.status}): ${result.stderr || result.stdout}`);

  for (const fileName of [
    'hackathon-overview.json',
    'hackathon-proofs-all.json',
    'hackathon-proofs-z-ai-general.json',
    'hackathon-glm-generate.json',
    'hackathon-workspace-zai.json',
    'hackathon-drafts-zai.json',
    'hackathon-flock-triage.json',
    'hackathon-proof-summary.md',
  ]) {
    assert(fs.existsSync(path.join(evidenceDir, fileName)), `${fileName} should exist after proof capture`);
  }

  const overview = readJson('hackathon-overview.json');
  const glm = readJson('hackathon-glm-generate.json');
  const flock = readJson('hackathon-flock-triage.json');

  assert(Array.isArray(overview.bounties) && overview.bounties.length === 5, 'proof overview should include the 5 active bounties');
  assert(typeof glm.proof?.provider === 'string', 'GLM proof snapshot should expose provider metadata');
  assert(typeof flock.proof?.provider === 'string', 'FLock proof snapshot should expose provider metadata');

  console.log('hackathon_proof_capture_smoke: PASS');
}

main().catch((error) => {
  console.error(`hackathon_proof_capture_smoke: FAIL ${error.message}`);
  process.exit(1);
});
