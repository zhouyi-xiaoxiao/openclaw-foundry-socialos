import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(baseUrl, route, payload) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let json = {};

  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`non-JSON response from ${route}: ${raw}`);
    }
  }

  if (!response.ok) {
    const detail = json.error || raw || `status ${response.status}`;
    throw new Error(`${route} failed (${response.status}): ${detail}`);
  }

  return json;
}

async function main() {
  const tag = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-e2e-'));
  const dbPath = path.join(tempDir, 'socialos.e2e.db');

  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  let db;

  try {
    const capture = await postJson(api.baseUrl, '/capture', {
      text: `quick capture ${tag}`,
      source: 'e2e_smoke',
    });
    assert(typeof capture.captureId === 'string', 'captureId missing');

    const event = await postJson(api.baseUrl, '/events', {
      captureId: capture.captureId,
      title: `Event ${tag}`,
      payload: { flow: 'capture->event' },
    });
    assert(typeof event.eventId === 'string', 'eventId missing');

    const queue = await postJson(api.baseUrl, '/publish/queue', {
      eventId: event.eventId,
      platform: 'x',
      mode: 'dry-run',
      language: 'en',
      content: `Draft content ${tag}`,
    });

    assert(typeof queue.taskId === 'string', 'taskId missing');
    assert(typeof queue.draftId === 'string', 'draftId missing');

    db = new DatabaseSync(dbPath);

    const captureRow = db
      .prepare('SELECT id, action FROM Audit WHERE id = ? LIMIT 1')
      .get(capture.captureId);
    assert(captureRow?.id === capture.captureId, 'capture row not written to Audit');
    assert(captureRow?.action === 'capture', 'capture action mismatch');

    const eventRow = db
      .prepare('SELECT id, title FROM Event WHERE id = ? LIMIT 1')
      .get(event.eventId);
    assert(eventRow?.id === event.eventId, 'event row not written to Event');

    const queueRow = db
      .prepare('SELECT id, draft_id, status, mode FROM PublishTask WHERE id = ? LIMIT 1')
      .get(queue.taskId);
    assert(queueRow?.id === queue.taskId, 'queue row not written to PublishTask');
    assert(queueRow?.draft_id === queue.draftId, 'queue draft_id mismatch');
    assert(queueRow?.status === 'queued', 'queue status mismatch');
    assert(queueRow?.mode === 'dry-run', 'queue mode mismatch');

    console.log(
      `e2e_smoke: PASS capture=${capture.captureId} event=${event.eventId} queue=${queue.taskId}`
    );
  } finally {
    if (db) db.close();
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`e2e_smoke: FAIL ${error.message}`);
  process.exit(1);
});
