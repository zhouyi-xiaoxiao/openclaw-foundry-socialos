#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { startApiServer } from '../socialos/apps/api/server.mjs';
import { startWebServer } from '../socialos/apps/web/server.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const evidenceDir = process.env.SOCIALOS_HACKATHON_EVIDENCE_DIR
  ? path.resolve(process.env.SOCIALOS_HACKATHON_EVIDENCE_DIR)
  : path.join(repoRoot, 'socialos', 'docs', 'evidence');
const bountyIds = ['claw-for-human', 'animoca', 'human-for-claw', 'z-ai-general', 'ai-agents-for-good'];
const requireLiveProofs = process.env.REQUIRE_LIVE_HACKATHON_PROOFS === '1';
const screenshotTargets = Object.freeze([
  { fileName: 'socialos-demo-step01.png', path: '/quick-capture', width: 1600, cropHeight: 1180 },
  { fileName: 'socialos-demo-step02-contacts.png', path: '/people', width: 1600, cropHeight: 1180 },
  { fileName: 'socialos-demo-step04.png', path: '/drafts', width: 1600, cropHeight: 1180 },
  { fileName: 'socialos-demo-step08.png', path: '/queue', width: 1600, cropHeight: 1180 },
  { fileName: 'hackathon-public-hub.png', path: '/hackathon?mode=public', width: 1680, cropHeight: 1360 },
  { fileName: 'buddy-public-proof.png', path: '/buddy?mode=public', width: 1680, cropHeight: 1360 },
  {
    fileName: 'ai-agents-for-good-telegram-proof.png',
    path: '/hackathon?mode=public&bounty=ai-agents-for-good#bounty-ai-agents-for-good',
    width: 1680,
    cropHeight: 1480,
  },
]);

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

function commandExists(command) {
  try {
    execFileSync('bash', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDriver(baseUrl, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/status`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the driver is ready.
    }
    await delay(250);
  }
  throw new Error(`safaridriver did not become ready at ${baseUrl}`);
}

function normalizeScreenshot(outputPath, width, height) {
  if (!commandExists('magick')) {
    return;
  }

  const tempPath = `${outputPath}.normalized.png`;
  const result = spawnSync(
    'magick',
    [
      outputPath,
      '-resize',
      `${width}x${height}^`,
      '-gravity',
      'north',
      '-crop',
      `${width}x${height}+0+0`,
      '+repage',
      tempPath,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 20000,
    }
  );

  if (result.status !== 0) {
    throw new Error(`magick failed for ${path.basename(outputPath)}: ${result.stderr || result.stdout}`);
  }

  fs.renameSync(tempPath, outputPath);
}

function cleanupSafariAutomation() {
  spawnSync('bash', ['-lc', 'pkill -x safaridriver >/dev/null 2>&1 || true; pkill -x Safari >/dev/null 2>&1 || true'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  spawnSync('osascript', ['-e', 'tell application "Safari" to quit'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function captureScreenshot(baseUrl, target, outputPath) {
  const height = target.cropHeight || 1200;
  const width = target.width || 1600;
  const result = spawnSync(
    'wkhtmltoimage',
    [
      '--enable-local-file-access',
      '--disable-smart-width',
      '--disable-javascript',
      '--encoding',
      'utf-8',
      '--load-error-handling',
      'ignore',
      '--load-media-error-handling',
      'ignore',
      '--quality',
      '90',
      '--width',
      String(width),
      '--height',
      String(height),
      `${baseUrl}${target.path}`,
      outputPath,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 20000,
    }
  );

  if (result.error && result.error.code === 'ETIMEDOUT') {
    throw new Error(`wkhtmltoimage timed out for ${target.path}`);
  }

  if (result.status !== 0) {
    throw new Error(`wkhtmltoimage failed for ${target.path}: ${result.stderr || result.stdout}`);
  }

  normalizeScreenshot(outputPath, width, height);
}

class SafariScreenshotDriver {
  constructor() {
    this.port = 44000 + Math.floor(Math.random() * 1000);
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.process = null;
    this.sessionId = null;
  }

  async start() {
    cleanupSafariAutomation();
    await delay(800);
    this.process = spawn('safaridriver', ['-p', String(this.port)], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    await waitForDriver(this.baseUrl);
    const session = await this.request('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'Safari',
        },
      },
    });
    this.sessionId = session?.value?.sessionId;
    if (!this.sessionId) {
      throw new Error('safaridriver did not return a session id');
    }
  }

  async request(method, pathname, body) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`safaridriver ${method} ${pathname} failed (${response.status}): ${text}`);
    }
    return payload;
  }

  async capture(baseUrl, target, outputPath) {
    const height = target.cropHeight || 1200;
    const width = target.width || 1600;
    await this.request('POST', `/session/${this.sessionId}/window/rect`, {
      width,
      height,
      x: 0,
      y: 0,
    });
    await this.request('POST', `/session/${this.sessionId}/url`, {
      url: `${baseUrl}${target.path}`,
    });
    await delay(1800);
    const payload = await this.request('GET', `/session/${this.sessionId}/screenshot`);
    if (!payload?.value) {
      throw new Error(`safaridriver did not return screenshot data for ${target.path}`);
    }
    await fsp.writeFile(outputPath, Buffer.from(payload.value, 'base64'));
    normalizeScreenshot(outputPath, width, height);
  }

  async close() {
    if (this.sessionId) {
      try {
        await this.request('DELETE', `/session/${this.sessionId}`);
      } catch {
        // Best-effort cleanup.
      }
    }
    if (this.process) {
      this.process.kill('SIGTERM');
      await delay(300);
      if (!this.process.killed) {
        this.process.kill('SIGKILL');
      }
    }
    cleanupSafariAutomation();
  }
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

async function captureStableWorkspaceProof(baseUrl) {
  const prompts = [
    'Use one English paragraph to explain the next best follow-up for the organizer I met at the hackathon, including why that follow-up matters.',
    'Write one short English follow-up note to Minghan Xiao after the London hackathon. Mention builder communities and operator dashboards.',
    'Use one short English paragraph to recommend the next follow-up after a hackathon conversation about builder communities and operator dashboards.',
  ];

  let lastPayload = null;
  for (const [promptIndex, text] of prompts.entries()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = await postJson(baseUrl, '/workspace/chat', {
        text,
        provider: 'glm',
        bountyMode: 'z-ai-general',
        source: `hackathon_proof_capture_${promptIndex + 1}_${attempt + 1}`,
      });
      lastPayload = candidate;
      if (candidate?.modelRouting?.workspaceProvider === 'glm' && candidate?.modelRouting?.fallbackUsed === false) {
        return candidate;
      }
    }
  }

  return lastPayload;
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

function buildSummary({ overview, glmGenerate, flockTriage, workspaceChat, drafts, telegramStatus, telegramSend, screenshotsCaptured }) {
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
- Telegram status: configured=${Boolean(telegramStatus?.configured)}, bot=${telegramStatus?.botUsername || 'n/a'}, fallbackUsed=${Boolean(telegramStatus?.fallbackUsed)}
- Telegram send: ${telegramSend ? `provider=${telegramSend.provider}, live=${Boolean(telegramSend.live)}, messageId=${telegramSend.messageId || 'n/a'}` : 'not captured'}
- Workspace routing: provider=${workspaceChat.modelRouting?.effectiveProvider || 'unknown'}, model=${workspaceChat.modelRouting?.workspaceModel || 'unknown'}, fallbackUsed=${Boolean(workspaceChat.modelRouting?.fallbackUsed)}
- ${formatProofLine('Draft generation', drafts.proof)}
- Screenshots refreshed: ${screenshotsCaptured ? 'yes' : 'no'}

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
- hackathon-telegram-status.json
- hackathon-telegram-send.json
`;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-hackathon-proofs-'));
  const dbPath = path.join(tempDir, 'hackathon-proofs.db');
  seedTempDemo(dbPath);
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  const web = await startWebServer({ port: 0, quiet: true, apiBaseUrl: api.baseUrl });

  try {
    logStep(`starting mode=${requireLiveProofs ? 'live-required' : 'capture'} evidenceDir=${evidenceDir}`);
    const glmGenerate = await postJson(api.baseUrl, '/integrations/glm/generate', {
      taskType: 'generation',
      prompt: 'In one short English paragraph, explain why SocialOS is a production-ready GLM-powered agent system for DoraHacks judges.',
      context: {
        audience: 'DoraHacks judges',
        outputLanguage: 'en',
        reviewPack: 'english-only',
      },
      bountyMode: 'z-ai-general',
    });
    logStep(`glm provider=${glmGenerate.proof?.provider || 'unknown'} fallbackUsed=${Boolean(glmGenerate.proof?.fallbackUsed)}`);

    const workspaceChat = await captureStableWorkspaceProof(api.baseUrl);
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
      platforms: ['linkedin', 'x'],
      languages: ['platform-native'],
    });
    logStep(`drafts provider=${drafts.proof?.provider || 'unknown'} fallbackUsed=${Boolean(drafts.proof?.fallbackUsed)} count=${drafts.count || 0}`);

    const flockTriage = await postJson(api.baseUrl, '/integrations/flock/sdg-triage', {
      text: 'We need to coordinate volunteer mentors for a community workshop and help students follow up afterwards.',
    });
    logStep(`flock provider=${flockTriage.proof?.provider || 'unknown'} fallbackUsed=${Boolean(flockTriage.proof?.fallbackUsed)}`);

    const telegramStatus = await getJson(api.baseUrl, '/integrations/telegram/status');
    logStep(`telegram configured=${Boolean(telegramStatus.configured)} bot=${telegramStatus.botUsername || 'n/a'}`);
    const telegramSend = telegramStatus.configured
      ? await postJson(api.baseUrl, '/integrations/telegram/send', {
          text: 'SocialOS AI Agents for Good proof: SDG triage is ready and the next volunteer follow-up is now queued.',
        })
      : null;
    if (telegramSend) {
      logStep(`telegram send live=${Boolean(telegramSend.live)} messageId=${telegramSend.messageId || 'n/a'}`);
    }

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
      assertLive(
        workspaceChat.modelRouting?.workspaceProvider === 'glm' && workspaceChat.modelRouting?.fallbackUsed === false,
        'Workspace routing did not stabilize on live GLM output'
      );
      if (telegramStatus.configured) {
        assertLive(Boolean(telegramSend && telegramSend.live === true && telegramSend.fallbackUsed === false), 'Telegram send did not complete in live mode');
      }
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
    await writeJson('hackathon-telegram-status.json', telegramStatus);
    await writeJson('hackathon-telegram-send.json', telegramSend || {
      ok: false,
      provider: 'telegram',
      live: false,
      fallbackUsed: true,
      reason: 'telegram-not-configured',
      capturedAt: new Date().toISOString(),
    });

    let screenshotsCaptured = false;
    if (commandExists('safaridriver')) {
      const safari = new SafariScreenshotDriver();
      try {
        await safari.start();
        for (const target of screenshotTargets) {
          await safari.capture(web.baseUrl, target, path.join(evidenceDir, target.fileName));
        }
        screenshotsCaptured = true;
        logStep(`screenshots refreshed via safaridriver=${screenshotTargets.length}`);
      } finally {
        await safari.close();
      }
    } else if (commandExists('wkhtmltoimage')) {
      for (const target of screenshotTargets) {
        captureScreenshot(web.baseUrl, target, path.join(evidenceDir, target.fileName));
      }
      screenshotsCaptured = true;
      logStep(`screenshots refreshed via wkhtmltoimage=${screenshotTargets.length}`);
    } else {
      logStep('no screenshot tool available; screenshot refresh skipped');
    }

    await writeText(
      'hackathon-proof-summary.md',
      buildSummary({
        overview,
        glmGenerate,
        flockTriage,
        workspaceChat,
        drafts,
        telegramStatus,
        telegramSend,
        screenshotsCaptured,
      })
    );

    console.log(`capture_hackathon_proofs: PASS dir=${evidenceDir}`);
  } finally {
    await web.close();
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`capture_hackathon_proofs: FAIL ${error.message}`);
  process.exit(1);
});
