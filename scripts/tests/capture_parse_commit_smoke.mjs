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
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${raw}`);
  }
  return payload;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-capture-parse-'));
  const dbPath = path.join(tempDir, 'capture.parse.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const asset = await requestJson(api.baseUrl, '/capture/assets', {
      method: 'POST',
      body: {
        kind: 'image',
        mimeType: 'image/png',
        fileName: 'business-card.png',
        extractedText: '认识了李雷，做增长，微信 lylei_growth，下周二跟进',
        source: 'capture_parse_commit_smoke',
      },
    });

    const parsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '今天在 hackathon 认识了李雷，做增长，在伦敦。',
        source: 'capture_parse_commit_smoke',
        assetIds: [asset.asset.assetId],
      },
    });

    assert(parsed.captureDraft.personDraft.name === '李雷', 'capture parse should infer person name');
    assert(parsed.captureDraft.personDraft.requiresNameConfirmation === false, 'known contact name should not require confirmation');
    assert(parsed.captureDraft.personDraft.identities.length >= 1, 'capture parse should infer identities');
    assert(parsed.captureDraft.selfCheckinDraft.reflection.includes('李雷'), 'reflection should include combined text');

    const chinesePatternParsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '有一个叫王章的联系人，他做金融，我想下周联系他。',
        source: 'capture_parse_commit_smoke',
      },
    });
    assert(chinesePatternParsed.captureDraft.personDraft.name === '王章', 'capture parse should support richer Chinese naming patterns');

    const mixedLanguageParsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '今天我在 one cs 遇到了很多人，打桌游，比如 sam，他是 pdra，博后到 staff rep。',
        source: 'capture_parse_commit_smoke',
      },
    });
    assert(mixedLanguageParsed.captureDraft.personDraft.name === 'Sam', 'capture parse should prefer the explicitly named person in mixed-language notes');
    assert(mixedLanguageParsed.captureDraft.personDraft.requiresNameConfirmation === false, 'mixed-language explicit names should not require confirmation');

    const unresolvedParsed = await requestJson(api.baseUrl, '/capture/parse', {
      method: 'POST',
      body: {
        text: '帮我新建一个联系人吧，我们在聚会里见到了他，聊了很多金融和伦敦的事情。',
        source: 'capture_parse_commit_smoke',
      },
    });
    assert(unresolvedParsed.captureDraft.personDraft.requiresNameConfirmation === true, 'missing name should require confirmation instead of fabricating a placeholder');
    assert(unresolvedParsed.captureDraft.personDraft.name === '', 'missing name should stay empty');

    const committed = await requestJson(api.baseUrl, '/capture/commit', {
      method: 'POST',
      body: {
        text: parsed.captureDraft.rawText,
        source: parsed.captureDraft.source,
        combinedText: parsed.captureDraft.combinedText,
        assetIds: [asset.asset.assetId],
        personDraft: {
          ...parsed.captureDraft.personDraft,
          tags: [...parsed.captureDraft.personDraft.tags, 'hackathon'],
          notes: `${parsed.captureDraft.personDraft.notes} Need to follow up about growth loops.`,
        },
        selfCheckinDraft: parsed.captureDraft.selfCheckinDraft,
        interactionDraft: parsed.captureDraft.interactionDraft,
      },
    });

    assert(typeof committed.capture.captureId === 'string', 'capture commit should persist capture');
    assert(typeof committed.person.personId === 'string', 'capture commit should persist person');
    assert(committed.detail.identities.length >= 1, 'committed person detail should include identities');

    const personDetail = await requestJson(
      api.baseUrl,
      `/people/${encodeURIComponent(committed.person.personId)}`
    );
    assert(personDetail.person.name === '李雷', 'people detail should expose committed person');
    assert(
      personDetail.interactions.some((item) => item.summary.includes('李雷') || item.evidence.includes('李雷')),
      'people detail should expose the committed interaction'
    );

    const invalidResponse = await fetch(`${api.baseUrl}/capture/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: unresolvedParsed.captureDraft.rawText,
        source: unresolvedParsed.captureDraft.source,
        combinedText: unresolvedParsed.captureDraft.combinedText,
        personDraft: unresolvedParsed.captureDraft.personDraft,
        selfCheckinDraft: unresolvedParsed.captureDraft.selfCheckinDraft,
        interactionDraft: unresolvedParsed.captureDraft.interactionDraft,
      }),
    });
    const invalidPayload = await invalidResponse.json();
    assert(invalidResponse.status === 400, 'placeholder or missing names should be blocked at commit time');
    assert(invalidPayload.error === 'name confirmation required', 'blocked commit should explain that name confirmation is required');

    console.log('capture_parse_commit_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`capture_parse_commit_smoke: FAIL ${error.message}`);
  process.exit(1);
});
