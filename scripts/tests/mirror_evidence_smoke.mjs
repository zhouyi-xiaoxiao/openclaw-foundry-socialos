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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-mirror-evidence-'));
  const dbPath = path.join(tempDir, 'mirror.evidence.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    await requestJson(api.baseUrl, '/capture', {
      method: 'POST',
      body: {
        text: '今天推进了产品工作台，感觉很有进展，也有一点压力。',
        source: 'mirror_evidence_smoke',
      },
    });

    const mirror = await requestJson(api.baseUrl, '/self-mirror/generate', {
      method: 'POST',
      body: { range: 'last-7d' },
    });
    assert(Array.isArray(mirror.conclusions) && mirror.conclusions.length === 3, 'mirror should expose structured conclusions');
    assert(Array.isArray(mirror.evidence), 'mirror should expose flattened evidence rows');

    const claimKey = mirror.conclusions[0].title;
    const evidence = await requestJson(
      api.baseUrl,
      `/self-mirror/evidence?mirrorId=${encodeURIComponent(mirror.mirrorId)}&claimKey=${encodeURIComponent(claimKey)}`
    );
    assert(evidence.count >= 1, 'mirror evidence endpoint should return evidence for a claim');
    assert(
      evidence.evidence.every((item) => item.claimKey === claimKey),
      'mirror evidence endpoint should filter by claim key'
    );

    const latest = await requestJson(api.baseUrl, '/self-mirror');
    assert(latest.latestMirror?.mirrorId === mirror.mirrorId, 'latest self mirror should return the new mirror');

    console.log('mirror_evidence_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`mirror_evidence_smoke: FAIL ${error.message}`);
  process.exit(1);
});
