import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-weekly-mirror-'));
  const dbPath = path.join(tempDir, 'weekly.mirror.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  try {
    await postJson(api.baseUrl, '/capture', {
      text: '今天推进了协作流程，精力还不错，也有一点压力。',
      source: 'weekly_mirror_smoke',
    });

    const generated = await postJson(api.baseUrl, '/self-mirror/generate', {});
    assert(typeof generated.mirrorId === 'string', 'mirrorId missing');
    assert(typeof generated.summaryText === 'string' && generated.summaryText.length > 0, 'mirror summary missing');
    assert(Array.isArray(generated.conclusions) && generated.conclusions.length === 3, 'mirror conclusions missing');

    const current = await getJson(api.baseUrl, '/self-mirror');
    assert(current.latestMirror?.mirrorId === generated.mirrorId, 'latest mirror mismatch');
    assert(Array.isArray(current.checkins), 'checkins should be array');
    assert(Array.isArray(current.latestMirror?.evidence), 'latest mirror should expose evidence');

    console.log('weekly_mirror_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`weekly_mirror_smoke: FAIL ${error.message}`);
  process.exit(1);
});
