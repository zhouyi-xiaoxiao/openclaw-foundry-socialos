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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-workspace-contact-review-'));
  const dbPath = path.join(tempDir, 'workspace.contact.review.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const workspace = await requestJson(api.baseUrl, '/workspace/chat', {
      method: 'POST',
      body: {
        text: '帮我新建一个联系人吧，我在聚会里遇到了他，聊了很多金融和伦敦的事情。',
        source: 'workspace_contact_review_smoke',
      },
    });

    assert(workspace.presentation?.primaryCard?.type === 'contact', 'workspace should still foreground a contact draft');
    assert(workspace.captureDraft?.personDraft?.requiresNameConfirmation === true, 'draft should require name confirmation when extraction is unresolved');
    assert(workspace.captureDraft?.personDraft?.name === '', 'workspace draft should not fabricate a placeholder contact name');
    assert(
      workspace.presentation?.actions?.some((action) => action.action === 'review-contact'),
      'workspace should expose a review action instead of direct save'
    );

    const blockedResponse = await fetch(`${api.baseUrl}/capture/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workspace.commitPayload),
    });
    const blockedPayload = await blockedResponse.json();
    assert(blockedResponse.status === 400, 'unconfirmed contact drafts must be blocked at commit time');
    assert(blockedPayload.error === 'name confirmation required', 'blocked drafts should explain why saving is disabled');

    const saved = await requestJson(api.baseUrl, '/capture/commit', {
      method: 'POST',
      body: {
        ...workspace.commitPayload,
        personDraft: {
          ...workspace.commitPayload.personDraft,
          name: '王章',
          tags: ['investor', 'london'],
          notes: '在聚会里遇到，聊了金融和伦敦的事情。适合下周继续 follow-up。',
        },
      },
    });
    assert(saved.person.name === '王章', 'edited contact review should save the confirmed name');
    assert(!saved.person.notes.includes('帮我新建一个联系人'), 'saved notes should not persist raw command noise');

    const detail = await requestJson(api.baseUrl, `/people/${encodeURIComponent(saved.person.personId)}`);
    assert(detail.person.name === '王章', 'saved review flow should create a real person detail');

    console.log('workspace_contact_review_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`workspace_contact_review_smoke: FAIL ${error.message}`);
  process.exit(1);
});
