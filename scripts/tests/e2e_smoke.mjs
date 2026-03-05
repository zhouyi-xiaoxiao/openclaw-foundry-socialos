import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LOOPBACK_HOST, startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(raw, label) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`${label} is empty`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON: ${raw}`);
  }
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

async function getJson(baseUrl, route) {
  const response = await fetch(`${baseUrl}${route}`);
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`${route} failed (${response.status}): ${raw || 'no body'}`);
  }

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`non-JSON response from ${route}: ${raw}`);
  }
}

async function main() {
  const tag = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-e2e-'));
  const dbPath = path.join(tempDir, 'socialos.e2e.db');

  const previousPublishMode = process.env.PUBLISH_MODE;
  const previousLiveOverride = process.env.SOCIALOS_ENABLE_LIVE_PUBLISH;
  const previousEmbeddingsProvider = process.env.EMBEDDINGS_PROVIDER;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL;
  const previousLocalEmbeddingModel = process.env.LOCAL_EMBEDDING_MODEL;

  delete process.env.PUBLISH_MODE;
  delete process.env.SOCIALOS_ENABLE_LIVE_PUBLISH;
  delete process.env.EMBEDDINGS_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_EMBEDDING_MODEL;
  delete process.env.LOCAL_EMBEDDING_MODEL;

  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  let db;

  try {
    assert(api.host === LOOPBACK_HOST, `API host must stay loopback-only (${LOOPBACK_HOST})`);

    const capture = await postJson(api.baseUrl, '/capture', {
      text: `quick capture ${tag}`,
      source: 'e2e_smoke',
    });
    assert(typeof capture.captureId === 'string', 'captureId missing');

    const event = await postJson(api.baseUrl, '/events', {
      captureId: capture.captureId,
      title: `Event ${tag}`,
      payload: { flow: 'capture->event->queue->approve' },
    });
    assert(typeof event.eventId === 'string', 'eventId missing');

    const queue = await postJson(api.baseUrl, '/publish/queue', {
      eventId: event.eventId,
      platform: 'x',
      language: 'en',
      content: `Draft content ${tag}`,
    });

    assert(typeof queue.taskId === 'string', 'taskId missing');
    assert(typeof queue.draftId === 'string', 'draftId missing');
    assert(queue.mode === 'dry-run', 'queue default mode must remain dry-run');

    const approve = await postJson(api.baseUrl, '/publish/approve', {
      taskId: queue.taskId,
      approvedBy: 'e2e_smoke',
    });

    assert(approve.taskId === queue.taskId, 'approve taskId mismatch');
    assert(approve.draftId === queue.draftId, 'approve draftId mismatch');
    assert(approve.status === 'executed', 'approve status mismatch');
    assert(approve.mode === 'dry-run', 'approve mode should remain dry-run by default');
    assert(Array.isArray(approve.auditIds) && approve.auditIds.length === 2, 'approve audit IDs missing');
    assert(typeof approve.digestId === 'string', 'approve digestId missing');
    assert(typeof approve.runId === 'string', 'approve runId missing');
    assert(approve.delivery?.noDeliver === true, 'dry-run task must be no-deliver');
    assert(approve.delivery?.dispatched === false, 'dry-run task must not be externally dispatched');

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
      .prepare('SELECT id, draft_id, status, mode, result FROM PublishTask WHERE id = ? LIMIT 1')
      .get(queue.taskId);
    assert(queueRow?.id === queue.taskId, 'queue row not written to PublishTask');
    assert(queueRow?.draft_id === queue.draftId, 'queue draft_id mismatch');
    assert(queueRow?.status === 'executed', 'queue status should advance to executed after approve');
    assert(queueRow?.mode === 'dry-run', 'queue mode should remain dry-run by default');

    const queueResult = parseJson(queueRow.result, 'PublishTask.result');
    assert(queueResult.execution?.runId === approve.runId, 'PublishTask.result runId mismatch');
    assert(queueResult.digestId === approve.digestId, 'PublishTask.result digestId mismatch');

    const approveAudit = db
      .prepare('SELECT id, action, payload FROM Audit WHERE id = ? LIMIT 1')
      .get(approve.auditIds[0]);
    assert(approveAudit?.action === 'publish_approve', 'publish_approve audit row missing');

    const executeAudit = db
      .prepare('SELECT id, action, payload FROM Audit WHERE id = ? LIMIT 1')
      .get(approve.auditIds[1]);
    assert(executeAudit?.action === 'publish_execute', 'publish_execute audit row missing');

    const executePayload = parseJson(executeAudit.payload, 'publish_execute payload');
    assert(executePayload.taskId === queue.taskId, 'publish_execute payload taskId mismatch');
    assert(executePayload.delivery?.noDeliver === true, 'publish_execute payload noDeliver mismatch');

    const digestRow = db
      .prepare('SELECT id, run_id, what, verify FROM DevDigest WHERE id = ? LIMIT 1')
      .get(approve.digestId);
    assert(digestRow?.id === approve.digestId, 'digest row not written to DevDigest');
    assert(digestRow?.run_id === approve.runId, 'digest run_id mismatch');
    assert(digestRow?.what?.includes(queue.taskId), 'digest.what should reference publish task');
    assert(digestRow?.verify?.includes('noDeliver=true'), 'digest.verify should capture noDeliver');

    const personId = `person_${tag}`;
    const personTimestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO Person(id, name, tags, notes, next_follow_up_at, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    ).run(
      personId,
      `Alice ${tag}`,
      JSON.stringify(['ml', 'embeddings']),
      `Vector retrieval check ${tag}`,
      null,
      personTimestamp,
      personTimestamp
    );

    process.env.EMBEDDINGS_PROVIDER = 'auto';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.LOCAL_EMBEDDING_MODEL = 'strong';
    delete process.env.OPENAI_API_KEY;

    const settingsWithoutKey = await getJson(api.baseUrl, '/settings/embeddings');
    assert(settingsWithoutKey.effectiveProvider === 'local', 'no-key settings should resolve to local provider');
    assert(
      settingsWithoutKey.retrievalMode === 'hybrid-keyword',
      'no-key settings should expose hybrid-keyword retrieval mode'
    );
    assert(settingsWithoutKey.semanticBoostEnabled === false, 'no-key settings should disable semantic boost');

    const searchWithoutKey = await postJson(api.baseUrl, '/people/search', {
      query: 'vector',
      limit: 5,
    });
    assert(searchWithoutKey.count >= 1, 'no-key search should still return keyword matches');
    assert(
      searchWithoutKey.retrieval?.mode === 'hybrid-keyword',
      'no-key search should report hybrid-keyword mode'
    );

    process.env.OPENAI_API_KEY = 'test-openai-key';

    const settingsWithKey = await getJson(api.baseUrl, '/settings/embeddings');
    assert(settingsWithKey.effectiveProvider === 'openai', 'keyed settings should resolve to openai provider');
    assert(
      settingsWithKey.retrievalMode === 'hybrid-semantic',
      'keyed settings should expose hybrid-semantic retrieval mode'
    );
    assert(settingsWithKey.semanticBoostEnabled === true, 'keyed settings should enable semantic boost');

    const searchWithKey = await postJson(api.baseUrl, '/people/search', {
      query: 'vector',
      limit: 5,
    });
    assert(searchWithKey.count >= 1, 'keyed search should return results');
    assert(
      searchWithKey.retrieval?.mode === 'hybrid-semantic',
      'keyed search should report hybrid-semantic mode'
    );

    process.env.PUBLISH_MODE = 'live';
    process.env.SOCIALOS_ENABLE_LIVE_PUBLISH = '1';

    const highFrequencyQueue = await postJson(api.baseUrl, '/publish/queue', {
      eventId: event.eventId,
      platform: 'x',
      mode: 'live',
      frequency: 'high-frequency',
      language: 'en',
      content: `High-frequency draft ${tag}`,
    });

    assert(highFrequencyQueue.mode === 'live', 'high-frequency queue should preserve explicit live mode');
    assert(highFrequencyQueue.delivery?.highFrequency === true, 'high-frequency queue flag missing');
    assert(highFrequencyQueue.delivery?.noDeliver === true, 'high-frequency queue should default no-deliver');

    const highFrequencyApprove = await postJson(api.baseUrl, '/publish/approve', {
      taskId: highFrequencyQueue.taskId,
      approvedBy: 'e2e_smoke',
      mode: 'live',
      liveEnabled: true,
      credentialsReady: true,
    });

    assert(highFrequencyApprove.mode === 'live', 'live-enabled high-frequency approve should remain live');
    assert(
      highFrequencyApprove.delivery?.highFrequency === true,
      'high-frequency approve must carry highFrequency flag'
    );
    assert(highFrequencyApprove.delivery?.noDeliver === true, 'high-frequency approve must remain no-deliver');
    assert(
      highFrequencyApprove.delivery?.dispatchEligible === false,
      'high-frequency approve must not be eligible for external dispatch'
    );
    assert(
      highFrequencyApprove.delivery?.dispatched === false,
      'high-frequency approve must not be externally dispatched'
    );

    const highFrequencyRow = db
      .prepare('SELECT id, status, mode, result FROM PublishTask WHERE id = ? LIMIT 1')
      .get(highFrequencyQueue.taskId);
    assert(highFrequencyRow?.status === 'executed', 'high-frequency task should reach executed status');
    assert(highFrequencyRow?.mode === 'live', 'high-frequency task mode should stay live when explicitly enabled');

    const highFrequencyResult = parseJson(highFrequencyRow.result, 'high-frequency PublishTask.result');
    assert(
      highFrequencyResult.execution?.delivery?.reason === 'high_frequency_no_deliver',
      'high-frequency execution should be tagged as no-deliver reason'
    );

    const highFrequencyExecuteAudit = db
      .prepare('SELECT payload FROM Audit WHERE id = ? LIMIT 1')
      .get(highFrequencyApprove.auditIds[1]);
    const highFrequencyExecutePayload = parseJson(
      highFrequencyExecuteAudit.payload,
      'high-frequency publish_execute payload'
    );
    assert(
      highFrequencyExecutePayload.delivery?.reason === 'high_frequency_no_deliver',
      'high-frequency publish_execute audit reason mismatch'
    );

    console.log(
      `e2e_smoke: PASS capture=${capture.captureId} event=${event.eventId} queue=${queue.taskId} approve=${approve.taskId} hf=${highFrequencyQueue.taskId}`
    );
  } finally {
    if (db) db.close();
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (typeof previousPublishMode === 'string') {
      process.env.PUBLISH_MODE = previousPublishMode;
    } else {
      delete process.env.PUBLISH_MODE;
    }

    if (typeof previousLiveOverride === 'string') {
      process.env.SOCIALOS_ENABLE_LIVE_PUBLISH = previousLiveOverride;
    } else {
      delete process.env.SOCIALOS_ENABLE_LIVE_PUBLISH;
    }

    if (typeof previousEmbeddingsProvider === 'string') {
      process.env.EMBEDDINGS_PROVIDER = previousEmbeddingsProvider;
    } else {
      delete process.env.EMBEDDINGS_PROVIDER;
    }

    if (typeof previousOpenAiKey === 'string') {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }

    if (typeof previousOpenAiEmbeddingModel === 'string') {
      process.env.OPENAI_EMBEDDING_MODEL = previousOpenAiEmbeddingModel;
    } else {
      delete process.env.OPENAI_EMBEDDING_MODEL;
    }

    if (typeof previousLocalEmbeddingModel === 'string') {
      process.env.LOCAL_EMBEDDING_MODEL = previousLocalEmbeddingModel;
    } else {
      delete process.env.LOCAL_EMBEDDING_MODEL;
    }
  }
}

main().catch((error) => {
  console.error(`e2e_smoke: FAIL ${error.message}`);
  process.exit(1);
});
