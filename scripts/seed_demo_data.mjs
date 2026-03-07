#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildStructuredMirror } from '../socialos/lib/product-core.mjs';
import {
  DEMO_NETWORK_CONTACTS,
  DEMO_NETWORK_EVENTS,
  PRIMARY_DEMO_CONTACT_ID,
  PRIMARY_DEMO_EVENT_ID,
} from '../socialos/lib/demo-network.mjs';

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

function deletePersonSeed(db, personId) {
  writeRow(db, 'DELETE FROM Identity WHERE person_id = ?', [personId]);
  writeRow(db, 'DELETE FROM Interaction WHERE person_id = ?', [personId]);
  writeRow(db, 'DELETE FROM EventPersonLink WHERE person_id = ?', [personId]);
  writeRow(db, 'DELETE FROM Person WHERE id = ?', [personId]);
}

function deleteEventSeed(db, eventId) {
  writeRow(db, 'DELETE FROM EventPersonLink WHERE event_id = ?', [eventId]);
  writeRow(db, 'DELETE FROM PostDraft WHERE event_id = ?', [eventId]);
  writeRow(db, 'DELETE FROM Event WHERE id = ?', [eventId]);
}

function seedNetworkContacts(db) {
  for (const contact of DEMO_NETWORK_CONTACTS) {
    const createdAt = nowIso((contact.updatedAtOffsetMinutes || -180) - 90);
    const updatedAt = nowIso(contact.updatedAtOffsetMinutes || -90);
    const nextFollowUpAt =
      typeof contact.nextFollowUpOffsetMinutes === 'number' ? nowIso(contact.nextFollowUpOffsetMinutes) : null;

    deletePersonSeed(db, contact.personId);
    writeRow(
      db,
      `INSERT OR REPLACE INTO Person(id,name,tags,notes,next_follow_up_at,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)`,
      [
        contact.personId,
        contact.name,
        JSON.stringify(contact.tags || []),
        contact.notes,
        nextFollowUpAt,
        createdAt,
        updatedAt,
      ]
    );

    for (const identity of contact.identities || []) {
      writeRow(
        db,
        `INSERT OR REPLACE INTO Identity(id,person_id,platform,handle,url,note,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        [
          identity.identityId,
          contact.personId,
          identity.platform,
          identity.handle || null,
          identity.url || null,
          identity.note || '',
          createdAt,
        ]
      );
    }

    for (const interaction of contact.interactions || []) {
      writeRow(
        db,
        `INSERT OR REPLACE INTO Interaction(id,person_id,summary,happened_at,evidence)
         VALUES(?,?,?,?,?)`,
        [
          interaction.interactionId,
          contact.personId,
          interaction.summary,
          nowIso(interaction.happenedAtOffsetMinutes || -120),
          interaction.evidence || '',
        ]
      );
    }
  }
}

function seedNetworkEvents(db) {
  for (const event of DEMO_NETWORK_EVENTS) {
    const createdAt = nowIso(event.createdAtOffsetMinutes || -120);
    deleteEventSeed(db, event.eventId);
    writeRow(
      db,
      `INSERT OR REPLACE INTO Event(id,title,payload,created_at)
       VALUES(?,?,?,?)`,
      [event.eventId, event.title, JSON.stringify(event.payload), createdAt]
    );

    for (const personId of event.people || []) {
      const linkId = `link_${event.eventId}_${personId}`.replace(/[^a-z0-9_]/giu, '_');
      writeRow(
        db,
        `INSERT OR REPLACE INTO EventPersonLink(id,event_id,person_id,role,source_type,source_id,weight,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [linkId, event.eventId, personId, 'participant', 'seed_demo', event.eventId, 1, createdAt, createdAt]
      );
    }
  }
}

function buildPrimaryDemoDraftContent(platform) {
  if (platform === 'instagram') {
    return 'Today I turned one real conversation with London hackathon organiser Minghan Xiao into a SocialOS loop that keeps people, context, and follow-up alive.';
  }
  if (platform === 'x') {
    return 'SocialOS now turns one real London hackathon organiser conversation with Minghan Xiao into people memory, linked events, 7 platform-native drafts, and a weekly mirror. Still local-first, still dry-run by default.';
  }
  if (platform === 'linkedin') {
    return 'I turned a real conversation with Minghan Xiao and the London hackathon organiser circle into a local-first SocialOS flow: one note becomes relationship memory, linked events, platform-native drafts, and an evidence-backed mirror.';
  }
  if (platform === 'zhihu') {
    return '这次我把和 Minghan Xiao 的一次真实线下交流，推进成一个能演示的 SocialOS 工作流：一条记录能落到联系人、人脉上下文、内容草稿和每周自我镜像。';
  }
  if (platform === 'xiaohongshu') {
    return '最近把和伦敦 hackathon organiser 圈子的一次真实对话做成了 SocialOS 演示：像发消息一样记一条，后面就能变成人脉卡、事件和内容灵感。';
  }
  if (platform === 'wechat_moments') {
    return '这两天把和 Minghan Xiao 的一条真实 follow-up 跑顺了：聊天、联系人、内容和复盘，终于能在一个系统里串起来。';
  }
  return '这不是又一个内容工具，而是把“认识人、记住人、持续跟进、形成输出”串成一个系统工作台。我这次用 London hackathon organiser 圈子的真实关系来演示 SocialOS。';
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const now = nowIso();
  const earlier = nowIso(-180);
  const mirrorId = 'mirror_demo_weekly';
  const primaryContact = DEMO_NETWORK_CONTACTS.find((contact) => contact.personId === PRIMARY_DEMO_CONTACT_ID);

  deletePersonSeed(db, 'person_demo_alex');
  seedNetworkContacts(db);
  seedNetworkEvents(db);

  const interactionRows = (primaryContact?.interactions || []).map((interaction) => [
    interaction.interactionId,
    PRIMARY_DEMO_CONTACT_ID,
    interaction.summary,
    nowIso(interaction.happenedAtOffsetMinutes || -120),
    interaction.evidence || '',
  ]);

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
        text: 'Met Minghan Xiao in the London hackathon organiser circle at Imperial College, exchanged X and LinkedIn, and want to follow up about builder communities and operator dashboards.',
        source: 'seed_demo',
        personId: PRIMARY_DEMO_CONTACT_ID,
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
      'Minghan Xiao | London Hackathon Organiser | IC | X @mingthemerxiles | LinkedIn minghan-xiao-b36678236',
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
        PRIMARY_DEMO_EVENT_ID,
        platform,
        platform === 'zhihu' || platform.startsWith('wechat') || platform === 'xiaohongshu' ? 'zh' : 'en',
        buildPrimaryDemoDraftContent(platform),
        JSON.stringify({
          capability: {
            supportLevel: platform === 'wechat_official' ? 'L1.5 Rich Article Package' : platform === 'x' || platform === 'linkedin' ? 'L2 Auto Publish (credentials gated)' : 'L1 Assisted',
            entryTarget: `${platform} publish surface`,
          },
          publishPackage: {
            title: platform === 'wechat_official' ? '把一次真实 follow-up 做成可持续的 SocialOS' : `${platform} demo package`,
            body: `A reusable ${platform} package for the London organiser follow-up event.`,
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
        text: 'Met Minghan Xiao in the London hackathon organiser circle at Imperial College, exchanged X and LinkedIn, and want to follow up about builder communities and operator dashboards.',
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
