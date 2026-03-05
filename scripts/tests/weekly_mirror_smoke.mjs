import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
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
    await postJson(api.baseUrl, '/capture', {
      text: '今天推进了协作流程，精力还不错，也有一点压力。',
      source: 'weekly_mirror_smoke',
    });

    const generated = await postJson(api.baseUrl, '/self-mirror/generate', {});
    assert(typeof generated.mirrorId === 'string', 'mirrorId missing');
    assert(typeof generated.content === 'string' && generated.content.length > 0, 'mirror content missing');

    const current = await getJson(api.baseUrl, '/self-mirror');
    assert(current.latestMirror?.mirrorId === generated.mirrorId, 'latest mirror mismatch');
    assert(Array.isArray(current.checkins), 'checkins should be array');

    console.log('weekly_mirror_smoke: PASS');
  } finally {
    await api.close();
  }
}

main().catch((error) => {
  console.error(`weekly_mirror_smoke: FAIL ${error.message}`);
  process.exit(1);
});
