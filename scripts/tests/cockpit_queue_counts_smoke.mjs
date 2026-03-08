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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-cockpit-counts-'));
  const dbPath = path.join(tempDir, 'cockpit.counts.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const event = await requestJson(api.baseUrl, '/events', {
      method: 'POST',
      body: {
        title: 'Cockpit queue count regression',
        audience: 'operators',
        languageStrategy: 'platform-native',
        tone: 'clear',
        payload: { focus: 'queue count regression' },
      },
    });

    const platforms = ['x', 'linkedin', 'zhihu', 'xiaohongshu', 'wechat_moments'];
    const generated = await requestJson(api.baseUrl, '/drafts/generate', {
      method: 'POST',
      body: {
        eventId: event.eventId,
        platforms,
        languages: ['platform-native'],
      },
    });
    assert(Array.isArray(generated.drafts), 'draft generation should return drafts');

    const draftIdsByPlatform = new Map();
    for (const draft of generated.drafts) {
      if (!draftIdsByPlatform.has(draft.platform)) {
        draftIdsByPlatform.set(draft.platform, draft.draftId);
      }
    }

    for (const platform of platforms) {
      const draftId = draftIdsByPlatform.get(platform);
      assert(draftId, `missing generated draft for platform ${platform}`);
      await requestJson(api.baseUrl, '/publish/queue', {
        method: 'POST',
        body: { draftId, mode: 'dry-run' },
      });
    }

    const cockpit = await requestJson(api.baseUrl, '/cockpit/summary');
    assert(
      cockpit.counts?.queued === platforms.length,
      `cockpit queued count should reflect all queued tasks (expected ${platforms.length}, got ${cockpit.counts?.queued})`
    );
    assert(
      Array.isArray(cockpit.queue?.awaitingApproval) && cockpit.queue.awaitingApproval.length === 4,
      'cockpit queue awaitingApproval preview should remain capped at 4 cards'
    );

    console.log('cockpit_queue_counts_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`cockpit_queue_counts_smoke: FAIL ${error.message}`);
  process.exit(1);
});
