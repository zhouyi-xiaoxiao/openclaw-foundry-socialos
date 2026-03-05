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
  const api = await startApiServer({ port: 0, quiet: true });
  try {
    const status = await getJson(api.baseUrl, '/ops/status');
    assert(typeof status.mode === 'string', 'ops/status should include mode');
    assert(status.queue && typeof status.queue.pending === 'number', 'ops/status should include queue summary');

    const runs = await getJson(api.baseUrl, '/ops/runs?limit=3');
    assert(Array.isArray(runs.runs), 'ops/runs should include runs array');

    const blocked = await getJson(api.baseUrl, '/ops/blocked');
    assert(Array.isArray(blocked.blockedTasks), 'ops/blocked should include blockedTasks');

    console.log('ops_api_smoke: PASS');
  } finally {
    await api.close();
  }
}

main().catch((error) => {
  console.error(`ops_api_smoke: FAIL ${error.message}`);
  process.exit(1);
});
