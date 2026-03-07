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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-studio-api-'));
  const dbPath = path.join(tempDir, 'studio.api.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  try {
    const bootstrap = await getJson(api.baseUrl, '/studio/bootstrap');
    assert(typeof bootstrap.summaryText === 'string', 'studio/bootstrap should include summaryText');
    assert(typeof bootstrap.status?.mode === 'string', 'studio/bootstrap should expose mode');

    const settings = await getJson(api.baseUrl, '/studio/settings');
    assert(typeof settings.publishMode === 'string', 'studio/settings should include publishMode');
    assert(typeof settings.loopMode === 'string', 'studio/settings should include loopMode');

    const tasks = await getJson(api.baseUrl, '/studio/tasks?limit=5');
    assert(Array.isArray(tasks.tasks), 'studio/tasks should include task list');

    const runs = await getJson(api.baseUrl, '/studio/runs?limit=3');
    assert(Array.isArray(runs.runs), 'studio/runs should include runs array');

    const agents = await getJson(api.baseUrl, '/studio/agents');
    assert(Array.isArray(agents.agents), 'studio/agents should include agent list');
    assert(Array.isArray(agents.cluster?.agents), 'studio/agents should include cluster summary');

    const legacy = await fetch(`${api.baseUrl}/ops/status`);
    assert(legacy.status === 410, 'legacy /ops/status should be retired');

    console.log('studio_api_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`studio_api_smoke: FAIL ${error.message}`);
  process.exit(1);
});
