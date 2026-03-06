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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-people-detail-'));
  const dbPath = path.join(tempDir, 'people.detail.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const person = await requestJson(api.baseUrl, '/people/upsert', {
      method: 'POST',
      body: {
        name: 'Alice Evidence',
        tags: ['growth', 'community'],
        notes: 'Met at a builder dinner and talked about growth loops.',
      },
    });

    const personId = person.person.personId;
    await requestJson(api.baseUrl, `/people/${encodeURIComponent(personId)}/identity`, {
      method: 'POST',
      body: {
        platform: 'linkedin',
        handle: 'alice-evidence',
        url: 'https://linkedin.com/in/alice-evidence',
        note: 'Primary professional profile',
      },
    });
    await requestJson(api.baseUrl, `/people/${encodeURIComponent(personId)}/interaction`, {
      method: 'POST',
      body: {
        summary: 'Discussed founder-led growth experiments',
        evidence: 'Alice shared how they use narrative updates to close loops with community members.',
      },
    });

    const detail = await requestJson(api.baseUrl, `/people/${encodeURIComponent(personId)}`);
    assert(detail.identities.length === 1, 'people detail should include identities');
    assert(detail.interactions.length === 1, 'people detail should include interactions');
    assert(detail.evidence.length >= 2, 'people detail should expose evidence rows');
    assert(
      typeof detail.suggestion.followUpMessage === 'string' &&
        detail.suggestion.followUpMessage.includes('Alice Evidence'),
      'people detail should generate follow-up suggestion'
    );

    const search = await requestJson(api.baseUrl, '/people?query=builder%20growth&limit=5');
    assert(search.count >= 1, 'people search should still return keyword-backed hits');
    assert(search.results.some((result) => result.personId === personId), 'people search should include saved person');

    console.log('people_detail_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`people_detail_smoke: FAIL ${error.message}`);
  process.exit(1);
});
