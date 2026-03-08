import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${raw}`);
  return payload;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-standalone-drafts-'));
  const dbPath = path.join(tempDir, 'standalone.drafts.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(
        `
          INSERT INTO PostDraft (id, event_id, platform, language, content, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        'draft-standalone-1',
        null,
        'linkedin',
        'en',
        'Standalone draft alpha',
        JSON.stringify({ source: 'standalone-test' }),
        '2026-03-08T00:00:01.000Z'
      );
      db.prepare(
        `
          INSERT INTO PostDraft (id, event_id, platform, language, content, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        'draft-standalone-2',
        null,
        'linkedin',
        'en',
        'Standalone draft beta',
        JSON.stringify({ source: 'standalone-test' }),
        '2026-03-08T00:00:02.000Z'
      );
    } finally {
      db.close();
    }

    const listed = await requestJson(api.baseUrl, '/drafts?limit=10');
    const standaloneDrafts = listed.drafts.filter((draft) => !draft.eventId);

    assert(
      standaloneDrafts.length === 2,
      'drafts list should keep multiple standalone drafts even with the same platform/language'
    );
    assert(
      standaloneDrafts.some((draft) => draft.draftId === 'draft-standalone-1'),
      'drafts list should include the first standalone draft'
    );
    assert(
      standaloneDrafts.some((draft) => draft.draftId === 'draft-standalone-2'),
      'drafts list should include the second standalone draft'
    );

    console.log('drafts_standalone_coherence_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`drafts_standalone_coherence_smoke: FAIL ${error.message}`);
  process.exit(1);
});
