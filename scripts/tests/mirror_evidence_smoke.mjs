import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

// This smoke stays fully English because it validates review-facing mirror output.

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
        text: 'I met Jamie Li today, advanced the product workspace, felt real momentum, and also noticed some pressure.',
        source: 'mirror_evidence_smoke',
      },
    });

    const dailyMirror = await requestJson(api.baseUrl, '/self-mirror/generate', {
      method: 'POST',
      body: { cadence: 'daily' },
    });
    assert(dailyMirror.cadence === 'daily', 'daily mirror generation should mark cadence');
    assert(Array.isArray(dailyMirror.conclusions) && dailyMirror.conclusions.length === 3, 'daily mirror should expose structured conclusions');
    assert(Array.isArray(dailyMirror.evidence), 'daily mirror should expose flattened evidence rows');

    const weeklyMirror = await requestJson(api.baseUrl, '/self-mirror/generate', {
      method: 'POST',
      body: { cadence: 'weekly' },
    });
    assert(weeklyMirror.cadence === 'weekly', 'weekly mirror generation should mark cadence');
    assert(Array.isArray(weeklyMirror.conclusions) && weeklyMirror.conclusions.length === 3, 'weekly mirror should expose structured conclusions');

    const claimKey = weeklyMirror.conclusions[0].title;
    const evidence = await requestJson(
      api.baseUrl,
      `/self-mirror/evidence?mirrorId=${encodeURIComponent(weeklyMirror.mirrorId)}&claimKey=${encodeURIComponent(claimKey)}`
    );
    assert(evidence.count >= 1, 'mirror evidence endpoint should return evidence for a claim');
    assert(
      evidence.evidence.every((item) => item.claimKey === claimKey),
      'mirror evidence endpoint should filter by claim key'
    );

    const latestDaily = await requestJson(api.baseUrl, '/self-mirror?cadence=daily');
    assert(latestDaily.latestMirror?.mirrorId === dailyMirror.mirrorId, 'daily self mirror should return the new daily mirror');
    const latestWeekly = await requestJson(api.baseUrl, '/self-mirror?cadence=weekly');
    assert(latestWeekly.latestMirror?.mirrorId === weeklyMirror.mirrorId, 'weekly self mirror should return the new weekly mirror');
    assert(latestWeekly.latestDailyMirror?.mirrorId === dailyMirror.mirrorId, 'self mirror payload should expose latest daily mirror alongside weekly view');

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
