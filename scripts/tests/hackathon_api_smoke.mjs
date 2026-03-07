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

  try {
    const overview = await getJson(api.baseUrl, '/hackathon/overview');
    assert(Array.isArray(overview.bounties), 'hackathon overview should expose bounty cards');
    assert(overview.bounties.length === 5, 'hackathon overview should expose the 5 active bounty tracks');
    assert(Array.isArray(overview.integrations), 'hackathon overview should expose integration status');

    const proofs = await getJson(api.baseUrl, '/proofs?limit=12');
    assert(Array.isArray(proofs.proofs), 'proofs endpoint should expose proof cards');
    assert(proofs.proofs.some((proof) => proof.kind === 'openclaw'), 'proofs should include OpenClaw evidence');

    const glm = await postJson(api.baseUrl, '/integrations/glm/generate', {
      taskType: 'bilingual-summary',
      prompt: 'Summarize why SocialOS fits Z.AI General.',
      context: { audience: 'hackathon judges' },
      bountyMode: 'z-ai-general',
    });
    assert(typeof glm.answer === 'string' && glm.answer.length > 0, 'glm generate should return an answer');
    assert(typeof glm.proof?.provider === 'string', 'glm generate should return provider proof');
    assert(typeof glm.auditId === 'string' && glm.auditId.length > 0, 'glm generate should write audit evidence');

    const flock = await postJson(api.baseUrl, '/integrations/flock/sdg-triage', {
      text: 'We need to organize a community mentor workshop for students next week.',
    });
    assert(typeof flock.sdg === 'string' && flock.sdg.length > 0, 'flock triage should return an SDG label');
    assert(typeof flock.urgency === 'string', 'flock triage should return urgency');
    assert(typeof flock.proof?.provider === 'string', 'flock triage should expose provider proof');
    assert(typeof flock.auditId === 'string' && flock.auditId.length > 0, 'flock triage should write audit evidence');

    const workspace = await postJson(api.baseUrl, '/workspace/chat', {
      text: 'Help me remember the new friend I met at the workshop and prepare a follow-up.',
      provider: 'glm',
      bountyMode: 'z-ai-general',
      source: 'hackathon_api_smoke',
    });
    assert(workspace.bountyMode === 'z-ai-general', 'workspace chat should retain bountyMode');
    assert(typeof workspace.modelRouting?.effectiveProvider === 'string', 'workspace chat should expose model routing');

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

    const filteredProofs = await getJson(api.baseUrl, '/proofs?bounty=z-ai-general&limit=12');
    assert(filteredProofs.proofs.length > 0, 'filtered proofs should return the bounty-specific proof set');

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
