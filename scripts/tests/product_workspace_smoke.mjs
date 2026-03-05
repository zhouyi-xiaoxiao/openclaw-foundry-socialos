import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOOPBACK_HOST, startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(baseUrl, route) {
  const response = await fetch(`${baseUrl}${route}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${route} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postJson(baseUrl, route, payload) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(`${route} failed (${response.status}): ${raw}`);
  }
  return parsed;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-product-workspace-'));
  const dbPath = path.join(tempDir, 'socialos.workspace.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    assert(api.host === LOOPBACK_HOST, 'API must stay on loopback');

    const person = await postJson(api.baseUrl, '/people/upsert', {
      name: 'Product Workspace Tester',
      tags: ['design', 'launch'],
      notes: 'Needs operational workspace coverage.',
    });
    assert(person.person?.name === 'Product Workspace Tester', 'person upsert should echo saved person');

    const people = await getJson(api.baseUrl, '/people?query=workspace&limit=5');
    assert(Array.isArray(people.results), 'people query should return results');
    assert(people.results.some((entry) => entry.name === 'Product Workspace Tester'), 'saved person should be searchable');

    const capture = await postJson(api.baseUrl, '/capture', {
      text: 'Product workspace smoke capture for event and drafts',
      source: 'product_workspace_smoke',
    });
    const event = await postJson(api.baseUrl, '/events', {
      captureId: capture.captureId,
      title: 'Product workspace launch lane',
      payload: {
        audience: 'builders',
        details: {
          focus: 'operational ui + blocked unlocks',
        },
      },
    });

    const generated = await postJson(api.baseUrl, '/drafts/generate', {
      eventId: event.eventId,
      platforms: ['x', 'instagram', 'xiaohongshu', 'wechat_moments', 'wechat_official'],
      languages: ['en'],
      tone: 'clear',
      angle: 'operator update',
    });
    assert(generated.count === 5, `expected 5 drafts, got ${generated.count}`);
    const instagramDraft = generated.drafts.find((draft) => draft.platform === 'instagram');
    assert(
      instagramDraft?.publishPackage?.visualStoryboard?.length === 4,
      'instagram package should include a 4-step visual storyboard'
    );
    const xiaohongshuDraft = generated.drafts.find((draft) => draft.platform === 'xiaohongshu');
    assert(
      xiaohongshuDraft?.publishPackage?.coverHooks?.length === 3,
      'xiaohongshu package should include cover hooks'
    );
    const momentsDraft = generated.drafts.find((draft) => draft.platform === 'wechat_moments');
    assert(
      momentsDraft?.publishPackage?.captionVariants?.length === 3,
      'wechat moments package should include caption variants'
    );
    const wechatDraft = generated.drafts.find((draft) => draft.platform === 'wechat_official');
    assert(wechatDraft?.publishPackage?.articleOutline?.length === 3, 'wechat package should include article outline');
    const xDraft = generated.drafts.find((draft) => draft.platform === 'x');
    assert(
      String(xDraft?.capability?.supportLevel || '').includes('L2'),
      'x draft should surface L2 support level'
    );

    const listedDrafts = await getJson(api.baseUrl, `/drafts?eventId=${encodeURIComponent(event.eventId)}&limit=10`);
    assert(listedDrafts.count >= 3, 'draft list should include generated drafts');

    const queued = await postJson(api.baseUrl, '/publish/queue', {
      draftId: generated.drafts[0].draftId,
      mode: 'dry-run',
    });
    assert(typeof queued.taskId === 'string', 'queue from draft should return task id');
    assert(queued.draftId === generated.drafts[0].draftId, 'queue should reuse existing draft');

    const queueTasks = await getJson(api.baseUrl, '/queue/tasks?limit=10');
    assert(Array.isArray(queueTasks.queueTasks), 'queue/tasks should return queue task list');
    assert(queueTasks.queueTasks.some((task) => task.taskId === queued.taskId), 'queued task should appear in queue list');

    const cluster = await getJson(api.baseUrl, '/ops/cluster');
    assert(Array.isArray(cluster.foundry?.agents), 'ops/cluster should expose foundry agents');
    assert(Array.isArray(cluster.codex?.canOwn), 'ops/cluster should expose codex responsibilities');
    assert(Array.isArray(cluster.foundry?.supportedScopes), 'ops/cluster should expose supported scopes');
    assert(typeof cluster.foundry?.defaultAutonomyMode === 'string', 'ops/cluster should expose autonomy mode');

    const runtime = await getJson(api.baseUrl, '/settings/runtime');
    assert(runtime.publishMode === 'dry-run' || runtime.publishMode === 'live', 'settings/runtime should include publish mode');
    assert(runtime.foundry?.agents?.length >= 1, 'settings/runtime should include foundry cluster summary');
    assert(runtime.foundry?.llmTaskHealth, 'settings/runtime should expose llm-task health');

    const tasks = await getJson(api.baseUrl, '/ops/tasks?limit=10');
    assert(Array.isArray(tasks.tasks), 'ops/tasks should return a task list');

    const dispatch = await postJson(api.baseUrl, '/ops/dispatch', {
      command: 'STATUS',
    });
    assert(dispatch.command === 'STATUS', 'ops/dispatch should execute the requested status command');
    assert(dispatch.cluster?.agents?.length >= 1, 'ops/dispatch should return cluster summary after execution');

    console.log('product_workspace_smoke: PASS');
  } finally {
    await api.close();
  }
}

main().catch((error) => {
  console.error(`product_workspace_smoke: FAIL ${error.message}`);
  process.exit(1);
});
