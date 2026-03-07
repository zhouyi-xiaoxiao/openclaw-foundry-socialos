import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-hackathon-api-'));
  const dbPath = path.join(tempDir, 'hackathon.api.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  const liveKeysPresent = Boolean(process.env.GLM_API_KEY && process.env.FLOCK_API_KEY);

  try {
    const overview = await getJson(api.baseUrl, '/hackathon/overview');
    assert(Array.isArray(overview.bounties), 'hackathon overview should expose bounty cards');
    assert(overview.bounties.length === 5, 'hackathon overview should expose the 5 active bounty tracks');
    assert(Array.isArray(overview.integrations), 'hackathon overview should expose integration status');
    for (const bounty of overview.bounties) {
      assert(typeof bounty.localRecordRoute === 'string' && bounty.localRecordRoute.length > 0, 'bounty cards should expose local recording routes');
      assert(typeof bounty.publicAnchor === 'string' && bounty.publicAnchor.includes('#bounty-'), 'bounty cards should expose public anchors');
      assert(typeof bounty.proofJsonUrl === 'string' && bounty.proofJsonUrl.includes('/data/proofs/'), 'bounty cards should expose proof JSON URLs');
      assert(typeof bounty.provider === 'string', 'bounty cards should expose provider metadata');
      assert(typeof bounty.live === 'boolean', 'bounty cards should expose live metadata');
      assert(typeof bounty.fallbackUsed === 'boolean', 'bounty cards should expose fallback metadata');
      assert(typeof bounty.deckAppendixSlide === 'string' && bounty.deckAppendixSlide.length > 0, 'bounty cards should expose deck appendix slide labels');
    }

    const proofs = await getJson(api.baseUrl, '/proofs?limit=12');
    assert(Array.isArray(proofs.proofs), 'proofs endpoint should expose proof cards');
    assert(proofs.proofs.some((proof) => proof.kind === 'openclaw'), 'proofs should include OpenClaw evidence');
    assert(proofs.proofs.every((proof) => typeof proof.live === 'boolean'), 'proof cards should expose live metadata');
    assert(proofs.proofs.every((proof) => typeof proof.fallbackUsed === 'boolean'), 'proof cards should expose fallback metadata');

    const glm = await postJson(api.baseUrl, '/integrations/glm/generate', {
      taskType: 'bilingual-summary',
      prompt: 'Summarize why SocialOS fits Z.AI General.',
      context: { audience: 'hackathon judges' },
      bountyMode: 'z-ai-general',
    });
    assert(typeof glm.answer === 'string' && glm.answer.length > 0, 'glm generate should return an answer');
    assert(typeof glm.proof?.provider === 'string', 'glm generate should return provider proof');
    assert(typeof glm.proof?.model === 'string', 'glm generate should return model proof');
    assert(typeof glm.proof?.live === 'boolean', 'glm generate should return live proof metadata');
    assert(typeof glm.proof?.fallbackUsed === 'boolean', 'glm generate should return fallback proof metadata');
    assert(typeof glm.auditId === 'string' && glm.auditId.length > 0, 'glm generate should write audit evidence');

    const flock = await postJson(api.baseUrl, '/integrations/flock/sdg-triage', {
      text: 'We need to organize a community mentor workshop for students next week.',
    });
    assert(typeof flock.sdg === 'string' && flock.sdg.length > 0, 'flock triage should return an SDG label');
    assert(typeof flock.urgency === 'string', 'flock triage should return urgency');
    assert(typeof flock.proof?.provider === 'string', 'flock triage should expose provider proof');
    assert(typeof flock.proof?.model === 'string', 'flock triage should expose model proof');
    assert(typeof flock.proof?.live === 'boolean', 'flock triage should expose live proof metadata');
    assert(typeof flock.proof?.fallbackUsed === 'boolean', 'flock triage should expose fallback proof metadata');
    assert(typeof flock.auditId === 'string' && flock.auditId.length > 0, 'flock triage should write audit evidence');

    const workspace = await postJson(api.baseUrl, '/workspace/chat', {
      text: 'Help me remember the new friend I met at the workshop and prepare a follow-up.',
      provider: 'glm',
      bountyMode: 'z-ai-general',
      source: 'hackathon_api_smoke',
    });
    assert(workspace.bountyMode === 'z-ai-general', 'workspace chat should retain bountyMode');
    assert(typeof workspace.modelRouting?.effectiveProvider === 'string', 'workspace chat should expose model routing');
    assert(typeof workspace.modelRouting?.fallbackUsed === 'boolean', 'workspace chat should expose routing fallback metadata');

    const event = await postJson(api.baseUrl, '/events', {
      title: 'Hackathon Community Workshop Follow-up',
      audience: 'student mentors',
      languageStrategy: 'platform-native',
      tone: 'warm and practical',
    });
    const drafts = await postJson(api.baseUrl, '/drafts/generate', {
      eventId: event.eventId,
      provider: 'glm',
      bountyMode: 'z-ai-general',
      platforms: ['linkedin', 'x'],
      languages: ['platform-native'],
    });
    assert(Array.isArray(drafts.drafts) && drafts.drafts.length >= 2, 'draft generation should return the requested drafts');
    assert(Array.isArray(drafts.proof?.generations), 'draft generation should expose generation proof data');
    assert(typeof drafts.proof?.provider === 'string', 'draft generation should expose provider proof metadata');
    assert(typeof drafts.proof?.live === 'boolean', 'draft generation should expose live proof metadata');
    assert(typeof drafts.proof?.fallbackUsed === 'boolean', 'draft generation should expose fallback proof metadata');

    const filteredProofs = await getJson(api.baseUrl, '/proofs?bounty=z-ai-general&limit=12');
    assert(filteredProofs.proofs.length > 0, 'filtered proofs should return the bounty-specific proof set');
    assert(filteredProofs.proofs.every((proof) => typeof proof.proofJsonUrl === 'string' && proof.proofJsonUrl.length > 0), 'filtered proofs should expose public proof JSON links');

    if (liveKeysPresent) {
      assert(glm.proof.fallbackUsed === false, 'glm proof should be live when GLM_API_KEY is present');
      assert(flock.proof.fallbackUsed === false, 'flock proof should be live when FLOCK_API_KEY is present');
    }

    console.log('hackathon_api_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`hackathon_api_smoke: FAIL ${error.message}`);
  process.exit(1);
});
