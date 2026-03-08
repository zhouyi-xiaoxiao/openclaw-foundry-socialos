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

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-ops-api-'));
  const dbPath = path.join(tempDir, 'ops.api.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  try {
    const bootstrap = await getJson(api.baseUrl, '/studio/bootstrap');
    assert(typeof bootstrap.status?.mode === 'string', 'studio/bootstrap should include status mode');
    assert(bootstrap.status?.queue && typeof bootstrap.status.queue.pending === 'number', 'studio/bootstrap should include queue summary');
    if (bootstrap.status.queue.inProgress === 0 && bootstrap.status.queue.pending > 0) {
      assert(
        typeof bootstrap.status.queue.currentTask === 'string' && bootstrap.status.queue.currentTask.trim().length > 0,
        'studio/bootstrap should surface currentTask when queue has actionable pending work',
      );
    }

    const runs = await getJson(api.baseUrl, '/studio/runs?limit=3');
    assert(Array.isArray(runs.runs), 'studio/runs should include runs array');

    const tasks = await getJson(api.baseUrl, '/studio/tasks?limit=5');
    assert(Array.isArray(tasks.tasks), 'studio/tasks should include task list');

    const agents = await getJson(api.baseUrl, '/studio/agents');
    assert(typeof agents.cluster?.genericTaskExecutionEnabled === 'boolean', 'studio/agents should expose generic task execution flag');
    assert(agents.cluster?.llmTaskHealth, 'studio/agents should expose llm-task health');

    const settings = await getJson(api.baseUrl, '/studio/settings');
    assert(typeof settings.publishMode === 'string', 'studio/settings should expose publishMode');

    const legacyStatus = await fetch(`${api.baseUrl}/ops/status`);
    assert(legacyStatus.status === 410, 'legacy /ops/status should be retired');

    console.log('ops_api_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`ops_api_smoke: FAIL ${error.message}`);
  process.exit(1);
});
