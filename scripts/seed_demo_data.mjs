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
const RESET_REVIEW_DEMO = process.argv.includes('--reset-review-demo');
const REVIEW_RESET_TABLES = Object.freeze([
  'MirrorEvidence',
  'Mirror',
  'SelfCheckin',
  'PublishTask',
  'PostDraft',
  'CaptureAsset',
  'Audit',
  'EventPersonLink',
  'Event',
  'Interaction',
  'Identity',
  'Person',
]);

function nowIso(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function writeRow(db, sql, params) {
  db.prepare(sql).run(...params);
}

function wipeReviewDemoTables(db) {
  for (const tableName of REVIEW_RESET_TABLES) {
    db.exec(`DELETE FROM ${tableName}`);
  }
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

function formatSeedPlatformLabel(platform) {
  const labels = {
    instagram: 'Instagram',
    x: 'X',
    linkedin: 'LinkedIn',
    zhihu: 'Zhihu',
    xiaohongshu: 'Rednote',
    wechat_moments: 'WeChat Moments',
    wechat_official: 'WeChat Official Account',
  };
  return labels[platform] || platform;
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
    return 'This Zhihu-ready draft explains how one real conversation with Minghan Xiao became a SocialOS workflow for people memory, linked context, reusable drafts, and a weekly mirror.';
  }
  if (platform === 'xiaohongshu') {
    return 'This Rednote-ready draft turns one real London hackathon organiser conversation into a visual SocialOS story: one note becomes a contact card, an event trail, and fresh content ideas.';
  }
  if (platform === 'wechat_moments') {
    return 'This WeChat Moments-ready draft captures the strongest update from the demo week: the same follow-up now flows through chat, contacts, content, and reflection inside one system.';
  }
  return 'This is not just another content tool. It is a relationship operating system that helps you meet people, remember context, follow through, and turn the work into clear output. The demo uses a real London hackathon organiser thread to show that loop end to end.';
}

function buildRecentCaptureSeeds() {
  return [
    {
      captureId: 'capture_real_network_1',
      source: 'workspace-chat',
      personId: PRIMARY_DEMO_CONTACT_ID,
      createdAt: nowIso(-1),
      text: 'Minghan Xiao is a London hackathon organiser at Imperial College from Tianjin. He shared his X and LinkedIn. Shafi Maahe is another Imperial organiser who interviewed Peter, the creator of OpenClaw.',
    },
    {
      captureId: 'capture_real_network_2',
      source: 'workspace-chat',
      personId: 'person_demo_candice_tang',
      createdAt: nowIso(-2),
      text: 'Candice Tang is an independent lawyer focused on cross-border and IP work. We met at a Chengdu Chamber event, I later visited her office, and she treated me to a meal. James Wu is Vice President at NVIDIA and a Tianjin University alumnus I met at iHealth in San Francisco.',
    },
    {
      captureId: 'capture_real_network_3',
      source: 'workspace-chat',
      personId: 'person_demo_daniel_dandrea',
      createdAt: nowIso(-3),
      text: "Daniel D'Andrea, Alan Champneys, Matt Hennessy, James Sibson, and Clare Rees-Zimmerman belong to my Bristol and Exeter teaching and research-industrial circle around MDM3, Data Science: Methods and Practice, and the mini-drones programme.",
    },
    {
      captureId: 'capture_real_network_4',
      source: 'workspace-chat',
      personId: 'person_demo_xiyue_zhang',
      createdAt: nowIso(-4),
      text: 'Xiyue Zhang, Michele Barbour, and Stefan Dienstag are active Bristol relationships I want SocialOS to remember across workshop follow-up, Early Career Enterprise Fellows, and the Nucleate AI community.',
    },
  ];
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  if (RESET_REVIEW_DEMO) {
    wipeReviewDemoTables(db);
  }

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

  const recentCaptureSeeds = buildRecentCaptureSeeds();

  for (const capture of recentCaptureSeeds) {
    writeRow(
      db,
      `INSERT OR REPLACE INTO Audit(id,action,payload,created_at)
       VALUES(?,?,?,?)`,
      [
        capture.captureId,
        'capture',
        JSON.stringify({
          text: capture.text,
          source: capture.source,
          personId: capture.personId,
        }),
        capture.createdAt,
      ]
    );
  }

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
    [
      'checkin_demo_1',
      1,
      ['energized', 'social'],
      'hackathon debrief',
      'After a day of strong product conversations, I felt energized and wanted to lock in the follow-up quickly.',
      nowIso(-240),
    ],
    [
      'checkin_demo_2',
      -1,
      ['stretched'],
      'back-to-back meetings',
      'After a run of back-to-back conversations, I felt stretched and needed a recovery block before writing again.',
      nowIso(-60),
    ],
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
            title: `${formatSeedPlatformLabel(platform)} demo package`,
            body: `A reusable ${platform} package for the London organiser follow-up event.`,
            hashtags: ['#SocialOS', '#OpenClaw'],
            cta: 'Reply if you want to compare notes.',
            entryTarget: `${formatSeedPlatformLabel(platform)} publish surface`,
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
    captures: recentCaptureSeeds.map((capture) => ({
      captureId: capture.captureId,
      text: capture.text,
    })),
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

  console.log(`Demo data seeded into ${DB_PATH}${RESET_REVIEW_DEMO ? ' (review reset mode)' : ''}`);
}

main();
