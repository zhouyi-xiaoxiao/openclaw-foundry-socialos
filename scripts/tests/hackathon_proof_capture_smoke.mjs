import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const evidenceDir = path.join(root, 'socialos', 'docs', 'evidence');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function containsHan(value) {
  return /[\p{Script=Han}]/u.test(String(value || ''));
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
    'hackathon-telegram-status.json',
    'hackathon-telegram-send.json',
    'hackathon-proof-summary.md',
    'socialos-demo-step01.png',
    'socialos-demo-step02-contacts.png',
    'socialos-demo-step04.png',
    'socialos-demo-step08.png',
    'hackathon-public-hub.png',
    'buddy-public-proof.png',
    'ai-agents-for-good-telegram-proof.png',
  ]) {
    assert(fs.existsSync(path.join(tempEvidenceDir, fileName)), `${fileName} should exist after proof capture`);
  }

  const readTempJson = (fileName) => JSON.parse(fs.readFileSync(path.join(tempEvidenceDir, fileName), 'utf8'));
  const overview = readTempJson('hackathon-overview.json');
  const glm = readTempJson('hackathon-glm-generate.json');
  const flock = readTempJson('hackathon-flock-triage.json');
  const telegramStatus = readTempJson('hackathon-telegram-status.json');
  const proofsAll = readTempJson('hackathon-proofs-all.json');

  assert(Array.isArray(overview.bounties) && overview.bounties.length === 5, 'proof overview should include the 5 active bounties');
  assert(overview.bounties.every((bounty) => typeof bounty.publicAnchor === 'string' && bounty.publicAnchor.includes('#bounty-')), 'proof overview should expose public anchors');
  assert(overview.bounties.every((bounty) => typeof bounty.proofJsonUrl === 'string' && bounty.proofJsonUrl.includes('/data/proofs/')), 'proof overview should expose public proof JSON links');
  assert(overview.bounties.every((bounty) => typeof bounty.sponsor === 'string' && bounty.sponsor.length > 0), 'proof overview should expose sponsor metadata');
  assert(proofsAll.id === undefined, 'all-proofs snapshot should stay a catalog without a single bounty id');
  assert(typeof glm.proof?.provider === 'string', 'GLM proof snapshot should expose provider metadata');
  assert(typeof glm.proof?.live === 'boolean', 'GLM proof snapshot should expose live metadata');
  assert(typeof flock.proof?.provider === 'string', 'FLock proof snapshot should expose provider metadata');
  assert(typeof flock.proof?.live === 'boolean', 'FLock proof snapshot should expose live metadata');
  assert(flock.proof?.openSourceModel === true, 'FLock proof snapshot should preserve the open-source model flag');
  assert(telegramStatus.channel === 'telegram', 'telegram status snapshot should preserve channel metadata');
  assert(Array.isArray(proofsAll.proofs) && proofsAll.proofs.length > 0, 'proof snapshot catalog should include proof cards');
  assert(proofsAll.proofs.some((proof) => proof.kind === 'telegram'), 'proof snapshot catalog should include Telegram proof metadata');
  const zaiProofs = readTempJson('hackathon-proofs-z-ai-general.json');
  assert(zaiProofs.id === 'z-ai-general', 'Z.AI proof snapshot should expose top-level bounty metadata');
  assert(zaiProofs.partnerLabel === 'Z.AI GLM', 'Z.AI proof snapshot should expose the partner label');
  assert(!containsHan(JSON.stringify(glm)), 'GLM proof snapshot should stay English-only');
  assert(!containsHan(JSON.stringify(proofsAll)), 'public proof snapshot should stay English-only');

  console.log('hackathon_proof_capture_smoke: PASS');
  fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`hackathon_proof_capture_smoke: FAIL ${error.message}`);
  process.exit(1);
});
