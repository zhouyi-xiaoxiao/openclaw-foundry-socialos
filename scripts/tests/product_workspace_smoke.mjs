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

    const workspace = await postJson(api.baseUrl, '/workspace/chat', {
      text: 'I met Product Workspace Tester and want to turn this into an event plus a follow-up.',
      source: 'product_workspace_smoke',
    });
    assert(typeof workspace.responseId === 'string', 'workspace chat should return a response id');
    assert(Array.isArray(workspace.agentLanes) && workspace.agentLanes.length >= 4, 'workspace chat should expose agent lanes');
    assert(workspace.suggestedEvent?.title, 'workspace chat should return an event suggestion');
    assert(typeof workspace.presentation?.mode === 'string', 'workspace chat should expose presentation mode');
    assert(typeof workspace.presentation?.answer === 'string', 'workspace chat should expose presentation answer');
    assert(typeof workspace.extraction?.method === 'string', 'workspace chat should expose extraction method');
    assert(typeof workspace.extraction?.model === 'string', 'workspace chat should expose extraction model');
    assert(workspace.presentation?.primaryCard?.type === 'contact', 'capture-like workspace input should foreground a contact card');
    assert(Array.isArray(workspace.presentation?.actions), 'workspace chat should expose lightweight actions');
    assert((workspace.presentation?.actions || []).length <= 3, 'workspace chat should cap lightweight actions');
    assert(
      workspace.presentation.actions.some((action) => action.action === 'review-contact'),
      'workspace contact drafts should be reviewed before saving'
    );
    assert(
      workspace.captureDraft?.personDraft?.isConfirmedName === true,
      'named workspace contact drafts should be marked as confirmed'
    );

    const searchWorkspace = await postJson(api.baseUrl, '/workspace/chat', {
      text: 'Who is the product workspace tester?',
      source: 'product_workspace_smoke',
    });
    assert(searchWorkspace.presentation?.mode === 'search', 'search-like workspace input should switch to search mode');
    assert(
      ['contact', 'event', 'draft', 'mirror', 'mixed'].includes(searchWorkspace.presentation?.primaryCard?.type),
      'search-like workspace input should expose a primary presentation card'
    );
    assert(
      (searchWorkspace.presentation?.secondaryCards || []).length <= 3,
      'workspace presentation should cap secondary cards'
    );
    assert(
      (searchWorkspace.presentation?.actions || []).length <= 3,
      'workspace presentation should cap actions for search turns'
    );

    const reviewWorkspace = await postJson(api.baseUrl, '/workspace/chat', {
      text: '帮我新建一个联系人吧，我在聚会里遇到了他，聊了很多金融和伦敦的事情。',
      source: 'product_workspace_smoke',
    });
    assert(
      reviewWorkspace.captureDraft?.personDraft?.requiresNameConfirmation === true,
      'unnamed workspace capture should require name confirmation'
    );
    assert(
      reviewWorkspace.presentation?.actions?.some((action) => action.label === 'Review Contact'),
      'unnamed workspace capture should guide the user into review first'
    );

    const capture = await postJson(api.baseUrl, '/capture', {
      text: 'I met Product Workspace Tester again and want to create an event plus drafts from that follow-up.',
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
      languages: ['platform-native'],
    });
    assert(generated.count === 5, `expected 5 drafts, got ${generated.count}`);
    const instagramDraft = generated.drafts.find((draft) => draft.platform === 'instagram');
    assert(instagramDraft?.language === 'en', 'instagram should default to English in platform-native mode');
    assert(
      instagramDraft?.publishPackage?.visualStoryboard?.length === 4,
      'instagram package should include a 4-step visual storyboard'
    );
    const xiaohongshuDraft = generated.drafts.find((draft) => draft.platform === 'xiaohongshu');
    assert(xiaohongshuDraft?.language === 'zh', 'xiaohongshu should default to Chinese in platform-native mode');
    assert(
      xiaohongshuDraft?.publishPackage?.coverHooks?.length === 3,
      'xiaohongshu package should include cover hooks'
    );
    const momentsDraft = generated.drafts.find((draft) => draft.platform === 'wechat_moments');
    assert(momentsDraft?.language === 'zh', 'wechat moments should default to Chinese in platform-native mode');
    assert(
      momentsDraft?.publishPackage?.captionVariants?.length === 3,
      'wechat moments package should include caption variants'
    );
    const wechatDraft = generated.drafts.find((draft) => draft.platform === 'wechat_official');
    assert(wechatDraft?.language === 'zh', 'wechat official should default to Chinese in platform-native mode');
    assert(wechatDraft?.publishPackage?.articleOutline?.length === 3, 'wechat package should include article outline');
    const xDraft = generated.drafts.find((draft) => draft.platform === 'x');
    assert(xDraft?.language === 'en', 'x should default to English in platform-native mode');
    assert(
      String(xDraft?.capability?.supportLevel || '').includes('L2'),
      'x draft should surface L2 support level'
    );
    assert(
      xDraft?.content !== xiaohongshuDraft?.content &&
        xDraft?.content !== wechatDraft?.content &&
        xiaohongshuDraft?.content !== wechatDraft?.content,
      'platform-native drafts should not collapse into the same content'
    );
    assert(
      /^https?:\/\//.test(String(xDraft?.publishPackage?.entryUrl || '')) &&
        /^https?:\/\//.test(String(wechatDraft?.publishPackage?.entryUrl || '')),
      'publish packages should expose platform entry URLs'
    );

    const listedDrafts = await getJson(api.baseUrl, `/drafts?eventId=${encodeURIComponent(event.eventId)}&limit=10`);
    assert(listedDrafts.count >= 3, 'draft list should include generated drafts');

    const legacyWorkspaceEvent = await postJson(api.baseUrl, '/events', {
      title: 'Follow-up with 陈一',
      payload: {
        focus: 'chat-derived event suggestion',
        source: 'workspace-chat',
        personName: '陈一',
        summary:
          '今天在 London 的 AI builder meetup 认识了陈一，做产品增长和社区运营，微信是 chenyi_growth。我们聊了 SocialOS、agent workflow 和 demo 扩散，我当时挺兴奋，想这周末跟进。顺便帮我把这条后面变成一个 event，再准备多平台草稿。',
        details: {
          combinedText:
            '今天在 London 的 AI builder meetup 认识了陈一，做产品增长和社区运营，微信是 chenyi_growth。我们聊了 SocialOS、agent workflow 和 demo 扩散，我当时挺兴奋，想这周末跟进。顺便帮我把这条后面变成一个 event，再准备多平台草稿。',
          followUpSuggestion:
            'Message 陈一 with one growth experiment you mentioned and invite a quick compare-notes follow-up.',
        },
      },
    });
    const cleanedDrafts = await postJson(api.baseUrl, '/drafts/generate', {
      eventId: legacyWorkspaceEvent.eventId,
      platforms: ['linkedin', 'x', 'xiaohongshu', 'wechat_official'],
      languages: ['platform-native'],
    });
    const cleanedLinkedIn = cleanedDrafts.drafts.find((draft) => draft.platform === 'linkedin');
    const cleanedX = cleanedDrafts.drafts.find((draft) => draft.platform === 'x');
    const cleanedXiaohongshu = cleanedDrafts.drafts.find((draft) => draft.platform === 'xiaohongshu');
    const cleanedOfficial = cleanedDrafts.drafts.find((draft) => draft.platform === 'wechat_official');
    assert(cleanedLinkedIn?.language === 'en', 'legacy workspace events should keep LinkedIn in English');
    assert(cleanedXiaohongshu?.language === 'zh', 'legacy workspace events should keep 小红书 in Chinese');
    assert(
      !/focus:|source:|personName:|summary:/i.test(cleanedLinkedIn?.content || '') &&
        !/workspace-chat/i.test(cleanedLinkedIn?.content || '') &&
        !/focus:|source:|personName:|summary:/i.test(cleanedX?.content || ''),
      'English drafts should not leak internal workspace metadata'
    );
    assert(
      !/focus:|source:|personName:|summary:/i.test(cleanedXiaohongshu?.content || '') &&
        !/\bMessage\b/u.test(cleanedXiaohongshu?.content || '') &&
        !/\bMessage\b/u.test(cleanedOfficial?.content || ''),
      'Chinese drafts should not leak metadata or English follow-up copy'
    );
    assert(
      String(cleanedXiaohongshu?.publishPackage?.title || '').includes('和陈一的后续跟进') &&
        String(cleanedOfficial?.publishPackage?.title || '').includes('和陈一的后续跟进'),
      'Chinese platform packages should localize follow-up titles'
    );

    const queued = await postJson(api.baseUrl, '/publish/queue', {
      draftId: generated.drafts[0].draftId,
      mode: 'dry-run',
    });
    assert(typeof queued.taskId === 'string', 'queue from draft should return task id');
    assert(queued.draftId === generated.drafts[0].draftId, 'queue should reuse existing draft');
    const queuedRetry = await postJson(api.baseUrl, '/publish/queue', {
      draftId: generated.drafts[0].draftId,
      mode: 'dry-run',
    });
    assert(typeof queuedRetry.taskId === 'string', 'second queue from same draft should return a task id');
    assert(queuedRetry.taskId !== queued.taskId, 'second queue should create a distinct task row');

    const queueTasks = await getJson(api.baseUrl, '/queue/tasks?limit=10');
    assert(Array.isArray(queueTasks.queueTasks), 'queue/tasks should return queue task list');
    assert(queueTasks.queueTasks.some((task) => task.taskId === queued.taskId), 'queued task should appear in queue list');
    assert(
      queueTasks.queueTasks.some((task) => task.taskId === queuedRetry.taskId),
      'second queued task should appear in queue list history'
    );

    const cluster = await getJson(api.baseUrl, '/ops/cluster');
    assert(Array.isArray(cluster.foundry?.agents), 'ops/cluster should expose foundry agents');
    assert(Array.isArray(cluster.codex?.canOwn), 'ops/cluster should expose codex responsibilities');
    assert(Array.isArray(cluster.foundry?.supportedScopes), 'ops/cluster should expose supported scopes');
    assert(typeof cluster.foundry?.defaultAutonomyMode === 'string', 'ops/cluster should expose autonomy mode');

    const runtime = await getJson(api.baseUrl, '/settings/runtime');
    assert(runtime.publishMode === 'dry-run' || runtime.publishMode === 'live', 'settings/runtime should include publish mode');
    assert(runtime.foundry?.agents?.length >= 1, 'settings/runtime should include foundry cluster summary');
    assert(runtime.foundry?.llmTaskHealth, 'settings/runtime should expose llm-task health');

    const cockpit = await getJson(api.baseUrl, '/cockpit/summary');
    assert(typeof cockpit.summaryText === 'string' && cockpit.summaryText.length > 0, 'cockpit should expose an action summary');
    assert(Array.isArray(cockpit.actions), 'cockpit should expose action cards');
    assert(Array.isArray(cockpit.followUps), 'cockpit should expose follow-up candidates');
    const queuedForDraft = cockpit.queue.awaitingApproval.filter((task) => task.draftId === generated.drafts[0].draftId);
    assert(
      queuedForDraft.length === 1,
      'cockpit queue summary should dedupe repeated queue rows for the same draft/platform'
    );

    const bootstrap = await getJson(api.baseUrl, '/workspace/bootstrap');
    assert(typeof bootstrap.summaryText === 'string' && bootstrap.summaryText.length > 0, 'workspace bootstrap should expose a summary');
    assert(Array.isArray(bootstrap.topActions), 'workspace bootstrap should expose top actions');
    assert(Array.isArray(bootstrap.recentContacts), 'workspace bootstrap should expose recent contacts');
    assert(Array.isArray(bootstrap.recentEvents), 'workspace bootstrap should expose recent events');
    assert(typeof bootstrap.systemStatus?.summary === 'string', 'workspace bootstrap should expose system status');
    assert(Array.isArray(bootstrap.queuePreview), 'workspace bootstrap should expose queue preview');
    const previewForDraft = bootstrap.queuePreview.filter((task) => task.draftId === generated.drafts[0].draftId);
    assert(previewForDraft.length === 1, 'workspace queue preview should avoid duplicate queue rows');
    assert(typeof bootstrap.voiceReadiness?.summary === 'string', 'workspace bootstrap should expose voice readiness');

    const eventDetail = await getJson(api.baseUrl, `/events/${encodeURIComponent(event.eventId)}`);
    assert(eventDetail.event?.eventId === event.eventId, 'event detail endpoint should return the requested event');
    assert(Array.isArray(eventDetail.relatedDrafts), 'event detail endpoint should expose related drafts');

    const ask = await getJson(
      api.baseUrl,
      `/ask/search?query=${encodeURIComponent('Who is the product workspace tester?')}`
    );
    assert(typeof ask.answer === 'string' && ask.answer.length > 0, 'ask/search should return an answer');
    assert(Array.isArray(ask.people) && ask.people.some((entry) => entry.name === 'Product Workspace Tester'), 'ask/search should surface matched people');
    assert(Array.isArray(ask.actions), 'ask/search should return suggested actions');

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
