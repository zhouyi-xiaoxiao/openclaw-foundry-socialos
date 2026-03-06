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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-manual-publish-'));
  const dbPath = path.join(tempDir, 'manual.publish.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const event = await requestJson(api.baseUrl, '/events', {
      method: 'POST',
      body: { title: 'Manual publish event', payload: { focus: 'queue flow' } },
    });
    const drafts = await requestJson(api.baseUrl, '/drafts/generate', {
      method: 'POST',
      body: { eventId: event.eventId, platforms: ['x', 'wechat_official'], languages: ['en'] },
    });

    const queued = await requestJson(api.baseUrl, '/publish/queue', {
      method: 'POST',
      body: { draftId: drafts.drafts[0].draftId, mode: 'dry-run' },
    });
    const approved = await requestJson(api.baseUrl, '/publish/approve', {
      method: 'POST',
      body: { taskId: queued.taskId, approvedBy: 'manual_publish_flow_smoke' },
    });
    assert(approved.status === 'manual_step_needed', 'approve should move queue into manual step');
    assert(approved.preflight?.note, 'approve should expose preflight note');

    const posted = await requestJson(api.baseUrl, '/publish/complete', {
      method: 'POST',
      body: {
        taskId: queued.taskId,
        outcome: 'posted',
        link: 'https://example.com/post/123',
        note: 'Operator completed the flow.',
      },
    });
    assert(posted.status === 'posted', 'manual completion should update queue to posted');

    const queuedSecond = await requestJson(api.baseUrl, '/publish/queue', {
      method: 'POST',
      body: { draftId: drafts.drafts[1].draftId, mode: 'dry-run' },
    });
    await requestJson(api.baseUrl, '/publish/approve', {
      method: 'POST',
      body: { taskId: queuedSecond.taskId, approvedBy: 'manual_publish_flow_smoke' },
    });
    const failed = await requestJson(api.baseUrl, '/publish/complete', {
      method: 'POST',
      body: {
        taskId: queuedSecond.taskId,
        outcome: 'failed',
        note: 'Operator could not complete the article assembly.',
      },
    });
    assert(failed.status === 'failed', 'manual completion should support failed outcome');

    const queuedHighFrequency = await requestJson(api.baseUrl, '/publish/queue', {
      method: 'POST',
      body: {
        draftId: drafts.drafts[0].draftId,
        mode: 'live',
        highFrequency: true,
      },
    });
    assert(queuedHighFrequency.delivery?.highFrequency === true, 'queue should echo high-frequency delivery flag');
    assert(queuedHighFrequency.delivery?.noDeliver === true, 'high-frequency queue should default no-deliver');

    const approvedHighFrequency = await requestJson(api.baseUrl, '/publish/approve', {
      method: 'POST',
      body: { taskId: queuedHighFrequency.taskId, approvedBy: 'manual_publish_flow_smoke' },
    });
    assert(
      approvedHighFrequency.delivery?.highFrequency === true,
      'approve should retain high-frequency hint for existing draft queue tasks'
    );
    assert(
      approvedHighFrequency.delivery?.noDeliver === true,
      'approve should keep no-deliver sticky when queued as high-frequency'
    );
    assert(
      approvedHighFrequency.mode === 'dry-run',
      'approve should still enforce dry-run mode without live gates'
    );

    const tasks = await requestJson(api.baseUrl, '/queue/tasks?limit=10');
    const first = tasks.queueTasks.find((item) => item.taskId === queued.taskId);
    const second = tasks.queueTasks.find((item) => item.taskId === queuedSecond.taskId);
    const third = tasks.queueTasks.find((item) => item.taskId === queuedHighFrequency.taskId);
    assert(first?.status === 'posted', 'queue/tasks should expose posted status');
    assert(second?.status === 'failed', 'queue/tasks should expose failed status');
    assert(third?.status === 'manual_step_needed', 'queue/tasks should expose high-frequency approval status');

    console.log('manual_publish_flow_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`manual_publish_flow_smoke: FAIL ${error.message}`);
  process.exit(1);
});
