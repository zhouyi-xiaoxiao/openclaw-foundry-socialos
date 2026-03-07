import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${raw}`);
  return payload;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-draft-validate-'));
  const dbPath = path.join(tempDir, 'draft.validate.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const event = await requestJson(api.baseUrl, '/events', {
      method: 'POST',
      body: {
        title: 'Validation event',
        audience: 'operators',
        languageStrategy: 'en',
        tone: 'clear',
        payload: { focus: 'validation' },
      },
    });

    const generated = await requestJson(api.baseUrl, '/drafts/generate', {
      method: 'POST',
      body: {
        eventId: event.eventId,
        platforms: ['linkedin'],
        languages: ['en'],
        variants: ['conservative', 'stronger hook'],
      },
    });

    const draftId = generated.drafts[0].draftId;
    await requestJson(api.baseUrl, `/drafts/${encodeURIComponent(draftId)}`, {
      method: 'PATCH',
      body: {
        content: 'Confidential launch note. Reach me at alice@example.com and wechat alice_growth.',
        variants: ['edited', 'reviewed'],
      },
    });

    const validation = await requestJson(api.baseUrl, `/drafts/${encodeURIComponent(draftId)}/validate`, {
      method: 'POST',
      body: {},
    });

    assert(validation.validation.ok === false, 'validation should fail on pii/sensitive content');
    assert(validation.validation.categories.pii.length >= 1, 'validation should detect pii');
    assert(validation.validation.categories.sensitive.length >= 1, 'validation should detect sensitive terms');
    assert((validation.draft.variants || []).length === 2, 'draft edit should persist variants');

    const queueResponse = await fetch(`${api.baseUrl}/publish/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId,
        mode: 'dry-run',
      }),
    });
    const queuePayload = await queueResponse.json();
    assert(queueResponse.status === 422, 'queue should reject drafts that fail validation checks');
    assert(queuePayload.error === 'draft validation failed', 'queue rejection should explain validation failure');
    assert(Array.isArray(queuePayload.issues) && queuePayload.issues.length >= 1, 'queue rejection should return issues');

    const listed = await requestJson(api.baseUrl, `/drafts?eventId=${encodeURIComponent(event.eventId)}&limit=5`);
    assert(listed.drafts[0].validation?.ok === false, 'draft list should expose stored validation');

    console.log('draft_validation_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`draft_validation_smoke: FAIL ${error.message}`);
  process.exit(1);
});
