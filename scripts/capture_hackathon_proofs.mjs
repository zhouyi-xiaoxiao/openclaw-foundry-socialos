#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startApiServer } from '../socialos/apps/api/server.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const evidenceDir = process.env.SOCIALOS_HACKATHON_EVIDENCE_DIR
  ? path.resolve(process.env.SOCIALOS_HACKATHON_EVIDENCE_DIR)
  : path.join(repoRoot, 'socialos', 'docs', 'evidence');
const bountyIds = ['claw-for-human', 'animoca', 'human-for-claw', 'z-ai-general', 'ai-agents-for-good'];
const requireLiveProofs = process.env.REQUIRE_LIVE_HACKATHON_PROOFS === '1';

async function ensureDir(target) {
  await fsp.mkdir(target, { recursive: true });
}

async function writeJson(fileName, payload) {
  await ensureDir(evidenceDir);
  const target = path.join(evidenceDir, fileName);
  await fsp.writeFile(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return target;
}

async function writeText(fileName, content) {
  await ensureDir(evidenceDir);
  const target = path.join(evidenceDir, fileName);
  await fsp.writeFile(target, content, 'utf8');
  return target;
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

function seedTempDemo(dbPath) {
  const result = spawnSync('node', ['scripts/seed_demo_data.mjs', '--reset-review-demo'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SOCIALOS_DB_PATH: dbPath,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`seed_demo_data failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

function assertLive(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isLiveProof(proof = {}) {
  return Boolean(proof && proof.live === true && proof.fallbackUsed === false);
}

function formatProofLine(label, proof = {}) {
  const provider = proof.provider || 'unknown';
  const model = proof.model || 'unknown';
  const capturedAt = proof.capturedAt || 'n/a';
  return `${label}: provider=${provider}, model=${model}, live=${Boolean(proof.live)}, fallbackUsed=${Boolean(proof.fallbackUsed)}, capturedAt=${capturedAt}`;
}

function logStep(message) {
  console.log(`capture_hackathon_proofs: ${message}`);
}

function buildSummary({ overview, glmGenerate, flockTriage, workspaceChat, drafts }) {
  const integrationLines = Array.isArray(overview.integrations)
    ? overview.integrations.map(
        (item) =>
          `- ${item.label}: status=${item.status}, provider=${item.provider || 'n/a'}, model=${item.model || 'n/a'}, live=${Boolean(item.live)}, fallbackUsed=${Boolean(item.fallbackUsed)}`
      )
    : [];

  return `# Hackathon Proof Snapshot

- Generated: ${new Date().toISOString()}
- Proof mode: ${requireLiveProofs ? 'live-required' : 'capture'}
- Bounties: ${Array.isArray(overview.bounties) ? overview.bounties.length : 0}
- ${formatProofLine('GLM generation', glmGenerate.proof)}
- ${formatProofLine('FLock SDG triage', flockTriage.proof)}
- Workspace routing: provider=${workspaceChat.modelRouting?.effectiveProvider || 'unknown'}, model=${workspaceChat.modelRouting?.workspaceModel || 'unknown'}, fallbackUsed=${Boolean(workspaceChat.modelRouting?.fallbackUsed)}
- ${formatProofLine('Draft generation', drafts.proof)}

## Integration status
${integrationLines.join('\n') || '- No integration summary available.'}

## Stable evidence files
- hackathon-overview.json
- hackathon-proofs-all.json
- hackathon-proofs-claw-for-human.json
- hackathon-proofs-animoca.json
- hackathon-proofs-human-for-claw.json
- hackathon-proofs-z-ai-general.json
- hackathon-proofs-ai-agents-for-good.json
- hackathon-glm-generate.json
- hackathon-workspace-zai.json
- hackathon-drafts-zai.json
- hackathon-flock-triage.json
`;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-hackathon-proofs-'));
  const dbPath = path.join(tempDir, 'hackathon-proofs.db');
  seedTempDemo(dbPath);
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    logStep(`starting mode=${requireLiveProofs ? 'live-required' : 'capture'} evidenceDir=${evidenceDir}`);
    const glmGenerate = await postJson(api.baseUrl, '/integrations/glm/generate', {
      taskType: 'bilingual-summary',
      prompt: 'Summarize why SocialOS fits Z.AI General for judges in one short bilingual answer.',
      context: {
        audience: 'DoraHacks judges',
        languages: ['en', 'zh'],
      },
      bountyMode: 'z-ai-general',
    });
    logStep(`glm provider=${glmGenerate.proof?.provider || 'unknown'} fallbackUsed=${Boolean(glmGenerate.proof?.fallbackUsed)}`);

    const workspaceChat = await postJson(api.baseUrl, '/workspace/chat', {
      text: 'Help me remember the organizer I met at the hackathon and prepare a bilingual follow-up.',
      provider: 'glm',
      bountyMode: 'z-ai-general',
      source: 'hackathon_proof_capture',
    });
    logStep(`workspace provider=${workspaceChat.modelRouting?.effectiveProvider || 'unknown'} fallbackUsed=${Boolean(workspaceChat.modelRouting?.fallbackUsed)}`);

    const event = await postJson(api.baseUrl, '/events', {
      title: 'Community Mentor Follow-up',
      audience: 'student organizers and mentors',
      languageStrategy: 'platform-native',
      tone: 'warm and practical',
      payload: {
        summary: 'Follow-up event for student mentors and organizers after the community workshop.',
      },
    });

    const drafts = await postJson(api.baseUrl, '/drafts/generate', {
      eventId: event.eventId,
      provider: 'glm',
      bountyMode: 'z-ai-general',
      platforms: ['linkedin', 'zhihu'],
      languages: ['platform-native'],
    });
    logStep(`drafts provider=${drafts.proof?.provider || 'unknown'} fallbackUsed=${Boolean(drafts.proof?.fallbackUsed)} count=${drafts.count || 0}`);

    const flockTriage = await postJson(api.baseUrl, '/integrations/flock/sdg-triage', {
      text: 'We need to coordinate volunteer mentors for a community workshop and help students follow up afterwards.',
    });
    logStep(`flock provider=${flockTriage.proof?.provider || 'unknown'} fallbackUsed=${Boolean(flockTriage.proof?.fallbackUsed)}`);

    if (requireLiveProofs) {
      assertLive(isLiveProof(glmGenerate.proof), 'GLM proof capture stayed in fallback mode');
      assertLive(isLiveProof(flockTriage.proof), 'FLock proof capture stayed in fallback mode');
      assertLive(isLiveProof(drafts.proof), 'Draft generation stayed in fallback mode');
      assertLive(
        Array.isArray(drafts.proof?.generations) &&
          drafts.proof.generations.length > 0 &&
          drafts.proof.generations.every((item) => item.provider === 'glm' && item.fallbackUsed === false),
        'At least one draft generation did not use live GLM output'
      );
    }

    const overview = await getJson(api.baseUrl, '/hackathon/overview');
    const proofsAll = await getJson(api.baseUrl, '/proofs?limit=24');
    const proofsByBounty = Object.fromEntries(
      await Promise.all(
        bountyIds.map(async (bountyId) => [bountyId, await getJson(api.baseUrl, `/proofs?limit=24&bounty=${encodeURIComponent(bountyId)}`)])
      )
    );

    if (requireLiveProofs) {
      const zAiBounty = Array.isArray(overview.bounties) ? overview.bounties.find((item) => item.id === 'z-ai-general') : null;
      const goodBounty = Array.isArray(overview.bounties) ? overview.bounties.find((item) => item.id === 'ai-agents-for-good') : null;
      assertLive(zAiBounty && zAiBounty.live === true && zAiBounty.fallbackUsed === false, 'Hackathon overview still marks Z.AI General as fallback');
      assertLive(goodBounty && goodBounty.live === true && goodBounty.fallbackUsed === false, 'Hackathon overview still marks AI Agents for Good as fallback');
      assertLive(
        proofsByBounty['z-ai-general']?.proofs?.some((item) => item.provider === 'glm' && item.fallbackUsed === false),
        'Z.AI General proof catalog is missing a live GLM proof card'
      );
      assertLive(
        proofsByBounty['ai-agents-for-good']?.proofs?.some((item) => item.provider === 'flock' && item.fallbackUsed === false),
        'AI Agents for Good proof catalog is missing a live FLock proof card'
      );
    }

    await writeJson('hackathon-overview.json', overview);
    await writeJson('hackathon-proofs-all.json', proofsAll);
    for (const bountyId of bountyIds) {
      await writeJson(`hackathon-proofs-${bountyId}.json`, proofsByBounty[bountyId]);
    }
    await writeJson('hackathon-glm-generate.json', glmGenerate);
    await writeJson('hackathon-workspace-zai.json', workspaceChat);
    await writeJson('hackathon-drafts-zai.json', drafts);
    await writeJson('hackathon-flock-triage.json', flockTriage);
    await writeText(
      'hackathon-proof-summary.md',
      buildSummary({
        overview,
        glmGenerate,
        flockTriage,
        workspaceChat,
        drafts,
      })
    );

    console.log(`capture_hackathon_proofs: PASS dir=${evidenceDir}`);
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`capture_hackathon_proofs: FAIL ${error.message}`);
  process.exit(1);
});
