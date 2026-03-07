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
  const tempEvidenceDir = fs.mkdtempSync(path.join(root, '.tmp-hackathon-proof-capture-'));
  const result = spawnSync('node', ['scripts/capture_hackathon_proofs.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      SOCIALOS_HACKATHON_EVIDENCE_DIR: tempEvidenceDir,
    },
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
    assert(fs.existsSync(path.join(tempEvidenceDir, fileName)), `${fileName} should exist after proof capture`);
  }

  const readTempJson = (fileName) => JSON.parse(fs.readFileSync(path.join(tempEvidenceDir, fileName), 'utf8'));
  const overview = readTempJson('hackathon-overview.json');
  const glm = readTempJson('hackathon-glm-generate.json');
  const flock = readTempJson('hackathon-flock-triage.json');
  const proofsAll = readTempJson('hackathon-proofs-all.json');

  assert(Array.isArray(overview.bounties) && overview.bounties.length === 5, 'proof overview should include the 5 active bounties');
  assert(overview.bounties.every((bounty) => typeof bounty.publicAnchor === 'string' && bounty.publicAnchor.includes('#bounty-')), 'proof overview should expose public anchors');
  assert(overview.bounties.every((bounty) => typeof bounty.proofJsonUrl === 'string' && bounty.proofJsonUrl.includes('/data/proofs/')), 'proof overview should expose public proof JSON links');
  assert(typeof glm.proof?.provider === 'string', 'GLM proof snapshot should expose provider metadata');
  assert(typeof glm.proof?.live === 'boolean', 'GLM proof snapshot should expose live metadata');
  assert(typeof flock.proof?.provider === 'string', 'FLock proof snapshot should expose provider metadata');
  assert(typeof flock.proof?.live === 'boolean', 'FLock proof snapshot should expose live metadata');
  assert(Array.isArray(proofsAll.proofs) && proofsAll.proofs.length > 0, 'proof snapshot catalog should include proof cards');

  console.log('hackathon_proof_capture_smoke: PASS');
  fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`hackathon_proof_capture_smoke: FAIL ${error.message}`);
  process.exit(1);
});
