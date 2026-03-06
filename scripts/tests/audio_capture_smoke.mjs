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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-audio-capture-'));
  const dbPath = path.join(tempDir, 'audio.capture.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const transcriptAsset = await requestJson(api.baseUrl, '/capture/assets', {
      method: 'POST',
      body: {
        kind: 'audio',
        mimeType: 'audio/webm',
        fileName: 'note.webm',
        transcript: 'Met Casey after the builder meetup and want to follow up on growth experiments.',
        contentBase64: 'data:audio/webm;base64,ZmFrZQ==',
      },
    });
    assert(transcriptAsset.asset.status === 'parsed', 'audio asset with transcript should parse immediately');

    const parsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '',
        source: 'audio_capture_smoke',
        assetIds: [transcriptAsset.asset.assetId],
      },
    });
    assert(parsed.captureDraft.personDraft.name, 'audio parse should still create a person draft');

    const committed = await requestJson(api.baseUrl, '/capture/commit', {
      method: 'POST',
      body: {
        text: parsed.captureDraft.rawText,
        source: parsed.captureDraft.source,
        combinedText: parsed.captureDraft.combinedText,
        assetIds: [transcriptAsset.asset.assetId],
        personDraft: {
          ...parsed.captureDraft.personDraft,
          name: 'Casey Audio',
        },
        selfCheckinDraft: parsed.captureDraft.selfCheckinDraft,
        interactionDraft: parsed.captureDraft.interactionDraft,
      },
    });
    assert(committed.person.name === 'Casey Audio', 'audio commit should allow manual confirmation edits');

    const fallbackAsset = await requestJson(api.baseUrl, '/capture/assets', {
      method: 'POST',
      body: {
        kind: 'audio',
        mimeType: 'audio/webm',
        fileName: 'manual-review.webm',
        contentBase64: 'data:audio/webm;base64,ZmFrZQ==',
      },
    });
    assert(
      fallbackAsset.asset.status === 'manual_review',
      'audio asset without transcript should fall back to manual review'
    );

    const workspaceFallback = await requestJson(api.baseUrl, '/workspace/chat', {
      method: 'POST',
      body: {
        text: '',
        source: 'audio_capture_smoke',
        assetIds: [fallbackAsset.asset.assetId],
      },
    });
    assert(
      workspaceFallback.transcription?.needsTranscription === true,
      'workspace chat should explicitly mark missing transcription for voice-only input'
    );
    assert(
      String(workspaceFallback.summary || '').toLowerCase().includes('transcript'),
      'workspace chat should explain that it cannot reason over a voice note without a transcript'
    );

    console.log('audio_capture_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`audio_capture_smoke: FAIL ${error.message}`);
  process.exit(1);
});
