import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { PRIMARY_DEMO_EVENT_ID, DEMO_NETWORK_CONTACTS } from '../../socialos/lib/demo-network.mjs';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts/seed_demo_data.mjs');
const STALE_TERMS = Object.freeze([
  'Peter Machona',
  'Zane',
  '刘洋丁朵',
  '赵敏',
  '陈一',
  'New contact',
  'Yanzhen Li',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function containsHan(value) {
  return /[\p{Script=Han}]/u.test(String(value || ''));
}

function loadTextRows(db, tableName, columnName) {
  return db
    .prepare(`SELECT ${columnName} AS value FROM ${tableName}`)
    .all()
    .map((row) => String(row.value || ''));
}

function assertNoStaleTerms(values, label) {
  const joined = values.join('\n');
  for (const term of STALE_TERMS) {
    assert(!joined.includes(term), `${label} should not include stale term: ${term}`);
  }
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

async function requestHtml(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const html = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed (${response.status})`);
  return html;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-review-demo-'));
  const dbPath = path.join(tempDir, 'review.demo.db');
  const seed = spawnSync(process.execPath, [SEED_SCRIPT, '--reset-review-demo'], {
    cwd: REPO_ROOT,
    env: { ...process.env, SOCIALOS_DB_PATH: dbPath },
    encoding: 'utf8',
  });

  assert(seed.status === 0, `review seed should pass: ${seed.stderr || seed.stdout}`);

  const db = new DatabaseSync(dbPath);
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  process.env.SOCIALOS_API_BASE_URL = api.baseUrl;
  process.env.SOCIALOS_API_PORT = String(api.port);
  const { startWebServer } = await import('../../socialos/apps/web/server.mjs');
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    const personCount = Number(db.prepare('SELECT count(*) AS count FROM Person').get().count || 0);
    const draftCount = Number(db.prepare('SELECT count(*) AS count FROM PostDraft').get().count || 0);
    const mirrorCount = Number(db.prepare('SELECT count(*) AS count FROM Mirror').get().count || 0);
    const auditCount = Number(db.prepare("SELECT count(*) AS count FROM Audit WHERE action = 'capture'").get().count || 0);

    assert(personCount === DEMO_NETWORK_CONTACTS.length, `expected ${DEMO_NETWORK_CONTACTS.length} seeded people, got ${personCount}`);
    assert(draftCount === 7, `expected 7 seeded drafts, got ${draftCount}`);
    assert(mirrorCount === 1, `expected exactly 1 seeded mirror, got ${mirrorCount}`);
    assert(auditCount === 4, `expected 4 seeded capture audit rows, got ${auditCount}`);

    const primaryDraftCount = Number(
      db.prepare('SELECT count(*) AS count FROM PostDraft WHERE event_id = ?').get(PRIMARY_DEMO_EVENT_ID).count || 0
    );
    assert(primaryDraftCount === 7, `primary review event should expose 7 drafts, got ${primaryDraftCount}`);

    const platformRows = db
      .prepare('SELECT platform, language FROM PostDraft ORDER BY platform ASC')
      .all()
      .map((row) => `${row.platform}:${row.language}`);
    assert(
      platformRows.join('|') ===
        [
          'instagram:en',
          'linkedin:en',
          'wechat_moments:zh',
          'wechat_official:zh',
          'x:en',
          'xiaohongshu:zh',
          'zhihu:zh',
        ].join('|'),
      `unexpected draft language split: ${platformRows.join(', ')}`
    );

    assertNoStaleTerms(loadTextRows(db, 'Person', 'name'), 'Person');
    assertNoStaleTerms(loadTextRows(db, 'Audit', 'payload'), 'Audit');
    assertNoStaleTerms(loadTextRows(db, 'PostDraft', 'content'), 'PostDraft');
    assertNoStaleTerms(loadTextRows(db, 'Mirror', 'content'), 'Mirror');

    const mirrorRow = db.prepare('SELECT content FROM Mirror ORDER BY created_at DESC LIMIT 1').get();
    assert(mirrorRow?.content, 'seeded mirror should exist');
    assert(!containsHan(mirrorRow.content), 'seeded mirror content should be English-only');

    const bootstrap = await requestJson(api.baseUrl, '/workspace/bootstrap');
    assert(
      (bootstrap.recentContacts || []).some((person) => person.name === 'Minghan Xiao'),
      'workspace bootstrap should foreground the approved review contacts'
    );
    assert(
      (bootstrap.recentCaptures || []).some((capture) => String(capture.text || capture.combinedText || '').includes('Minghan Xiao')),
      'workspace bootstrap should use the new seeded review captures'
    );

    const drafts = await requestJson(api.baseUrl, `/drafts?eventId=${encodeURIComponent(PRIMARY_DEMO_EVENT_ID)}&limit=12`);
    assert(drafts.count === 7, `draft API should expose 7 review drafts, got ${drafts.count}`);
    assert(
      drafts.drafts.filter((draft) => draft.language === 'en').length === 3 &&
        drafts.drafts.filter((draft) => draft.language === 'zh').length === 4,
      'draft API should preserve the intentional 3/4 language split'
    );

    const mirrorPayload = await requestJson(api.baseUrl, '/self-mirror?cadence=weekly');
    assert(mirrorPayload.latestMirror?.summaryText, 'weekly mirror payload should include a summary');
    assert(!containsHan(mirrorPayload.latestMirror?.summaryText || ''), 'weekly mirror summary should stay English');

    const queuePayload = await requestJson(api.baseUrl, '/queue/tasks?limit=8');
    assert(Array.isArray(queuePayload.queueTasks) && queuePayload.queueTasks.length === 1, 'review seed should expose one queue task');

    const quickCaptureHtml = await requestHtml(web.baseUrl, '/quick-capture');
    const peopleHtml = await requestHtml(web.baseUrl, '/people');
    const draftsHtml = await requestHtml(web.baseUrl, '/drafts');
    const queueHtml = await requestHtml(web.baseUrl, '/queue');
    const mirrorHtml = await requestHtml(web.baseUrl, '/self-mirror');
    const deckHtml = await requestHtml(web.baseUrl, '/deck');

    assert(quickCaptureHtml.includes('Minghan Xiao'), 'workspace page should show the approved review network');
    assert(!quickCaptureHtml.includes('Peter Machona'), 'workspace page should not leak stale contacts');
    assert(peopleHtml.includes('Candice Tang'), 'people page should show seeded review contacts');
    assert(!peopleHtml.includes('Zane'), 'people page should not leak stale contacts');
    assert(draftsHtml.includes('Rednote'), 'drafts page should use the English-facing Rednote label');
    assert(queueHtml.includes('Safe rehearsal') || queueHtml.includes('Queue'), 'queue page should render review queue state');
    assert(mirrorHtml.includes('Weekly Mirror'), 'self-mirror page should render the review mirror');
    assert(!containsHan(mirrorHtml), 'self-mirror page should stay English in the review seed');
    assert(deckHtml.includes('Minghan Xiao'), 'deck should stay aligned with the approved review network');

    console.log('review_demo_seed_smoke: PASS');
  } finally {
    await web.close();
    await api.close();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`review_demo_seed_smoke: FAIL ${error.message}`);
  process.exit(1);
});
