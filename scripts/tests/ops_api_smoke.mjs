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
    const status = await getJson(api.baseUrl, '/ops/status');
    assert(typeof status.mode === 'string', 'ops/status should include mode');
    assert(status.queue && typeof status.queue.pending === 'number', 'ops/status should include queue summary');
    if (status.queue.inProgress === 0 && status.queue.pending + status.queue.blocked > 0) {
      assert(
        typeof status.queue.currentTask === 'string' && status.queue.currentTask.trim().length > 0,
        'ops/status should surface currentTask when queue has actionable pending/blocked work',
      );
    }

    const runs = await getJson(api.baseUrl, '/ops/runs?limit=3');
    assert(Array.isArray(runs.runs), 'ops/runs should include runs array');

    const blocked = await getJson(api.baseUrl, '/ops/blocked');
    assert(Array.isArray(blocked.blockedTasks), 'ops/blocked should include blockedTasks');

    const tasks = await getJson(api.baseUrl, '/ops/tasks?limit=5');
    assert(Array.isArray(tasks.tasks), 'ops/tasks should include structured task list');

    const cluster = await getJson(api.baseUrl, '/ops/cluster');
    assert(typeof cluster.foundry?.genericTaskExecutionEnabled === 'boolean', 'ops/cluster should expose generic task execution flag');
    assert(cluster.foundry?.llmTaskHealth, 'ops/cluster should expose llm-task health');

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
