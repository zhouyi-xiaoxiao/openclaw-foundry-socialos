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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-business-card-'));
  const dbPath = path.join(tempDir, 'business.card.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const ocrAsset = await requestJson(api.baseUrl, '/capture/assets', {
      method: 'POST',
      body: {
        kind: 'image',
        mimeType: 'image/png',
        fileName: 'card.png',
        contentBase64: 'data:image/png;base64,ZmFrZQ==',
        extractedText: '李雷 Growth Lead wechat lylei_growth @lilei',
      },
    });
    assert(ocrAsset.asset.status === 'parsed', 'ocr asset should be parsed when extracted text exists');
    assert(ocrAsset.asset.hasOriginalFile === true, 'image asset should keep the original file locally');
    assert(typeof ocrAsset.asset.originalUrl === 'string' && ocrAsset.asset.originalUrl.length > 0, 'image asset should expose the original asset route');

    const parsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '今天交换了一张名片',
        source: 'business_card_ocr_smoke',
        assetIds: [ocrAsset.asset.assetId],
      },
    });
    assert(parsed.captureDraft.personDraft.identities.length >= 1, 'ocr capture should infer identities');

    const committed = await requestJson(api.baseUrl, '/capture/commit', {
      method: 'POST',
      body: {
        text: parsed.captureDraft.rawText,
        source: parsed.captureDraft.source,
        combinedText: parsed.captureDraft.combinedText,
        assetIds: [ocrAsset.asset.assetId],
        personDraft: parsed.captureDraft.personDraft,
        selfCheckinDraft: parsed.captureDraft.selfCheckinDraft,
        interactionDraft: parsed.captureDraft.interactionDraft,
      },
    });
    assert(typeof committed.person.personId === 'string', 'ocr capture should commit person');

    const manualAsset = await requestJson(api.baseUrl, '/capture/assets', {
      method: 'POST',
      body: {
        kind: 'image',
        mimeType: 'image/png',
        fileName: 'manual-review.png',
        contentBase64: 'data:image/png;base64,ZmFrZQ==',
      },
    });
    assert(
      manualAsset.asset.status === 'manual_review',
      'image without extracted text should fall back to manual review'
    );
    assert(manualAsset.asset.hasOriginalFile === true, 'manual review image should still keep the original file locally');

    console.log('business_card_ocr_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`business_card_ocr_smoke: FAIL ${error.message}`);
  process.exit(1);
});
