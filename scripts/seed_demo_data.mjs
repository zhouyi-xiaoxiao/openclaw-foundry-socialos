#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildStructuredMirror } from '../socialos/lib/product-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.resolve(process.env.SOCIALOS_DB_PATH || path.join(REPO_ROOT, 'infra/db/socialos.db'));
const SCHEMA_PATH = path.join(REPO_ROOT, 'infra/db/schema.sql');

function nowIso(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function writeRow(db, sql, params) {
  db.prepare(sql).run(...params);
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const personId = 'person_demo_lilei';
  const now = nowIso();
  const earlier = nowIso(-180);
  const eventId = 'event_demo_campaign';
  const mirrorId = 'mirror_demo_weekly';

  writeRow(
    db,
    `INSERT OR REPLACE INTO Person(id,name,tags,notes,next_follow_up_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?)`,
    [
      personId,
      'Li Lei',
      JSON.stringify(['growth', 'founder', 'hackathon']),
      'Met at a London builders meetup, talked about growth loops and operator dashboards.',
      nowIso(24 * 60),
      earlier,
      now,
    ]
  );

  const identities = [
    ['identity_demo_x', personId, 'x', '@lilei_growth', 'https://x.com/lilei_growth', 'prefers short follow-ups'],
    ['identity_demo_linkedin', personId, 'linkedin', 'li-lei-growth', 'https://linkedin.com/in/li-lei-growth', 'best for professional updates'],
    ['identity_demo_wechat', personId, 'wechat_moments', 'lilei_wechat', '', 'shared during meetup'],
  ];

  for (const identity of identities) {
    writeRow(
      db,
      `INSERT OR REPLACE INTO Identity(id,person_id,platform,handle,url,note,created_at)
       VALUES(?,?,?,?,?,?,?)`,
      [...identity, earlier]
    );
  }

  const interactionRows = [
    ['interaction_demo_1', personId, 'Talked about growth experiments for creator tools.', earlier, 'met at builders meetup'],
    ['interaction_demo_2', personId, 'Agreed to compare notes next Tuesday about operator dashboards.', nowIso(-120), 'follow-up promise captured'],
  ];

  for (const interaction of interactionRows) {
    writeRow(
      db,
      `INSERT OR REPLACE INTO Interaction(id,person_id,summary,happened_at,evidence)
       VALUES(?,?,?,?,?)`,
      interaction
    );
  }

  const captureId = 'capture_demo_1';
  writeRow(
    db,
    `INSERT OR REPLACE INTO Audit(id,action,payload,created_at)
     VALUES(?,?,?,?)`,
    [
      captureId,
      'capture',
      JSON.stringify({
        text: 'Met Li Lei from a growth startup, exchanged WeChat and agreed to compare notes next Tuesday.',
        source: 'seed_demo',
        personId,
      }),
      earlier,
    ]
  );

  writeRow(
    db,
    `INSERT OR REPLACE INTO CaptureAsset(id,kind,mime_type,file_name,extracted_text,metadata,created_at)
     VALUES(?,?,?,?,?,?,?)`,
    [
      'asset_demo_card',
      'image',
      'image/png',
      'business-card-demo.png',
      'Li Lei | Growth Founder | WeChat lilei_wechat | X @lilei_growth',
      JSON.stringify({ source: 'seed_demo', previewText: 'Demo business card asset' }),
      earlier,
    ]
  );

  const checkins = [
    ['checkin_demo_1', 1, ['energized', 'social'], 'hackathon debrief', '今天见完几个做产品的人，脑子很亮，想把 follow-up 快点接起来。', nowIso(-240)],
    ['checkin_demo_2', -1, ['stretched'], 'back-to-back meetings', '下午连续聊天以后有点空，需要留一个恢复时间，不然晚上写东西会散。', nowIso(-60)],
  ];

  for (const [id, energy, emotions, trigger, reflection, createdAt] of checkins) {
    writeRow(
      db,
      `INSERT OR REPLACE INTO SelfCheckin(id,energy,emotions,trigger_text,reflection,created_at)
       VALUES(?,?,?,?,?,?)`,
      [id, energy, JSON.stringify(emotions), trigger, reflection, createdAt]
    );
  }

  writeRow(
    db,
    `INSERT OR REPLACE INTO Event(id,title,payload,created_at)
     VALUES(?,?,?,?)`,
    [
      eventId,
      'Operator update for builders',
      JSON.stringify({
        audience: 'builders and collaborators',
        language: 'bilingual',
        tone: 'clear',
        links: ['https://socialos.demo/operator-update'],
        assets: ['asset_demo_card'],
        details: {
          focus: 'growth, people memory, and SocialOS operator workflows',
        },
      }),
      nowIso(-90),
    ]
  );

  const platforms = [
      'instagram',
      'x',
      'linkedin',
    'zhihu',
    'xiaohongshu',
    'wechat_moments',
    'wechat_official',
  ];

  let queueDraftId = null;
  for (const platform of platforms) {
    const draftId = `draft_demo_${platform}`;
    if (!queueDraftId) queueDraftId = draftId;
    writeRow(
      db,
      `INSERT OR REPLACE INTO PostDraft(id,event_id,platform,language,content,metadata,created_at)
       VALUES(?,?,?,?,?,?,?)`,
      [
        draftId,
        eventId,
        platform,
        platform === 'zhihu' || platform.startsWith('wechat') || platform === 'xiaohongshu' ? 'zh' : 'en',
        platform === 'instagram'
          ? 'Spent tonight turning scattered notes into a SocialOS workspace that remembers people and keeps follow-ups alive.'
          : platform === 'x'
            ? 'SocialOS now turns one real-world interaction into people memory, drafts, and a weekly mirror. Still local-first, still dry-run by default.'
            : platform === 'linkedin'
              ? 'Built a local-first SocialOS flow that starts from one conversation and ends in reusable relationship memory, campaign drafts, and a structured weekly mirror.'
              : platform === 'zhihu'
                ? '这次我把 SocialOS 从“能跑”推进成了“可演示的产品工作台”：一次输入，能落到人脉记忆、内容草稿和每周自我镜像。'
                : platform === 'xiaohongshu'
                  ? '最近把一个“认识新朋友就记住”的工具做顺了：像发消息一样记一条，后面自动帮我整理成联系人卡和内容灵感。'
                  : platform === 'wechat_moments'
                    ? '这两天把自己的 SocialOS 做顺了一点：聊天、跟进、发内容、做复盘，终于能串起来了。'
                    : '这不是又一个内容工具，而是把“认识人、记住人、持续跟进、形成输出”串成一个系统的工作台。',
        JSON.stringify({
          capability: {
            supportLevel: platform === 'wechat_official' ? 'L1.5 Rich Article Package' : platform === 'x' || platform === 'linkedin' ? 'L2 Auto Publish (credentials gated)' : 'L1 Assisted',
            entryTarget: `${platform} publish surface`,
          },
          publishPackage: {
            title: platform === 'wechat_official' ? '把一次认识新朋友，变成一个可持续的 SocialOS' : `${platform} demo package`,
            body: `A reusable ${platform} package for the demo event.`,
            hashtags: ['#SocialOS', '#OpenClaw'],
            cta: 'Reply if you want to compare notes.',
            entryTarget: `${platform} publish surface`,
            supportLevel: platform === 'wechat_official' ? 'L1.5 Rich Article Package' : 'L1 Assisted',
            assetChecklist: ['1 hero visual', '1 follow-up note'],
            steps: ['Copy content', 'Open platform entry', 'Post or mark manual complete'],
          },
          validation: null,
        }),
        nowIso(-80),
      ]
    );
  }

  writeRow(
    db,
    `INSERT OR REPLACE INTO PublishTask(id,draft_id,platform,mode,status,result,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [
      'queue_demo_1',
      queueDraftId,
      'instagram',
      'dry-run',
      'queued',
      JSON.stringify({ delivery: { state: 'drafted' } }),
      nowIso(-30),
      nowIso(-30),
    ]
  );

  const structuredMirror = buildStructuredMirror({
    checkins: checkins.map(([id, energy, emotions, trigger, reflection, createdAt]) => ({
      checkinId: id,
      energy,
      emotions,
      triggerText: trigger,
      reflection,
      createdAt,
    })),
    captures: [
      {
        captureId,
        text: 'Met Li Lei from a growth startup, exchanged WeChat and agreed to compare notes next Tuesday.',
      },
    ],
    interactions: interactionRows.map(([id, , summary, happenedAt, evidence]) => ({
      interactionId: id,
      summary,
      evidence,
      happenedAt,
    })),
  });

  writeRow(
    db,
    `INSERT OR REPLACE INTO Mirror(id,range_label,content,created_at)
     VALUES(?,?,?,?)`,
    [mirrorId, 'last-7d', JSON.stringify(structuredMirror), now]
  );

  structuredMirror.conclusions.forEach((conclusion, index) => {
    (conclusion.evidence?.evidence || []).forEach((evidence, evidenceIndex) => {
      writeRow(
        db,
        `INSERT OR REPLACE INTO MirrorEvidence(id,mirror_id,claim_key,source_type,source_id,snippet,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        [
          `mirror_evidence_${index}_${evidenceIndex}`,
          mirrorId,
          conclusion.title,
          evidence.sourceType,
          evidence.sourceId,
          evidence.snippet,
          now,
        ]
      );
    });
  });

  console.log(`Demo data seeded into ${DB_PATH}`);
}

main();
