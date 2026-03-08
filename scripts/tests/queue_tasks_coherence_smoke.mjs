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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-queue-coherence-'));
  const dbPath = path.join(tempDir, 'queue.coherence.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const event = await requestJson(api.baseUrl, '/events', {
      method: 'POST',
      body: {
        title: 'Queue coherence event',
        audience: 'operators',
        languageStrategy: 'en',
        tone: 'clear',
        payload: { focus: 'queue coherence' },
      },
    });

    const generated = await requestJson(api.baseUrl, '/drafts/generate', {
      method: 'POST',
      body: {
        eventId: event.eventId,
        platforms: ['linkedin'],
        languages: ['en'],
      },
    });
    const draftId = generated.drafts[0].draftId;

    const firstTask = await requestJson(api.baseUrl, '/publish/queue', {
      method: 'POST',
      body: { draftId, mode: 'dry-run' },
    });
    await requestJson(api.baseUrl, '/publish/approve', {
      method: 'POST',
      body: {
        taskId: firstTask.taskId,
        mode: 'dry-run',
        liveEnabled: false,
        credentialsReady: false,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondTask = await requestJson(api.baseUrl, '/publish/queue', {
      method: 'POST',
      body: { draftId, mode: 'dry-run' },
    });

    const defaultView = await requestJson(api.baseUrl, '/queue/tasks?limit=10');
    assert(defaultView.count >= 2, 'queue/tasks should keep historical task entries by default');
    assert(
      defaultView.queueTasks.some((task) => task.taskId === firstTask.taskId && task.status === 'manual_step_needed'),
      'default queue view should retain historical manual_step_needed task state'
    );

    const latestOnlyView = await requestJson(api.baseUrl, '/queue/tasks?latestOnly=true&limit=10');
    assert(latestOnlyView.count === 1, 'queue/tasks latestOnly=true should keep one latest task per draft/platform');
    assert(
      latestOnlyView.queueTasks[0].taskId === secondTask.taskId,
      'latestOnly queue view should keep only the newest task'
    );
    assert(latestOnlyView.queueTasks[0].status === 'queued', 'latestOnly queue view should reflect latest status');

    const filteredLatestOnly = await requestJson(api.baseUrl, '/queue/tasks?latestOnly=true&status=manual_step_needed&limit=10');
    assert(filteredLatestOnly.count === 0, 'latestOnly status filter should only inspect latest task state');

    const history = await requestJson(api.baseUrl, '/queue/tasks?includeHistory=true&limit=10');
    assert(history.count >= 2, 'includeHistory=true should return full queue task history');
    assert(
      history.queueTasks.some((task) => task.taskId === firstTask.taskId && task.status === 'manual_step_needed'),
      'history mode should retain prior manual_step_needed task state'
    );
    assert(
      history.queueTasks.some((task) => task.taskId === secondTask.taskId && task.status === 'queued'),
      'history mode should include the latest queued task'
    );

    const filteredHistory = await requestJson(
      api.baseUrl,
      '/queue/tasks?latestOnly=true&includeHistory=true&status=manual_step_needed&limit=10'
    );
    assert(filteredHistory.count >= 1, 'status filter with includeHistory=true should surface historical statuses');
    assert(
      filteredHistory.queueTasks.every((task) => task.status === 'manual_step_needed'),
      'history status filter should only return requested status'
    );

    console.log('queue_tasks_coherence_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`queue_tasks_coherence_smoke: FAIL ${error.message}`);
  process.exit(1);
});
