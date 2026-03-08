import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  buildCaptureDraft,
  buildDraftValidation,
  buildStructuredMirror,
  cleanList,
  cleanText,
  inferTagsFromText,
  inferEmotionTags as inferEmotionTagsCore,
  inferEnergyFromText as inferEnergyFromTextCore,
  isPlaceholderContactName,
  sanitizeContactDraftText,
} from '../../lib/product-core.mjs';
import {
  createStructuredTask,
  DEFAULT_AUTONOMY_MODE,
  listStructuredTasks,
  readLlmTaskHealthSnapshot,
  resolveFoundryRuntimePaths,
  SUPPORTED_TASK_SCOPES,
} from '../../lib/foundry-tasks.mjs';
import { createStudioControlPlane, STUDIO_COMMANDS } from '../../lib/studio-control-plane.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(process.env.SOCIALOS_REPO_ROOT || path.resolve(__dirname, '../../..'));
const DOTENV_PATH = path.join(REPO_ROOT, '.env');
const SCHEMA_PATH = path.join(REPO_ROOT, 'infra/db/schema.sql');
const ASSET_STORAGE_DIR = path.join(REPO_ROOT, 'infra/assets');
const QUEUE_PATH = path.join(REPO_ROOT, 'QUEUE.md');
const RUN_REPORT_DIR = path.join(REPO_ROOT, 'reports/runs');
const LATEST_DIGEST_PATH = path.join(REPO_ROOT, 'reports/LATEST.md');
const LOCK_DIR_PATH = path.join(REPO_ROOT, '.locks/devloop.lock');
const LOCK_META_PATH = path.join(REPO_ROOT, '.locks/devloop.lock/meta.env');
const PAUSE_FLAG_PATH = path.join(REPO_ROOT, '.foundry/PAUSED');
const MODE_OVERRIDE_PATH = path.join(REPO_ROOT, '.foundry/PUBLISH_MODE');
const FOUNDRY_CONFIG_PATH = path.join(REPO_ROOT, 'foundry/openclaw.foundry.json5');
const FOUNDRY_DISPATCH_PATH = path.join(REPO_ROOT, 'scripts/foundry_dispatch.sh');
const FOUNDRY_RUNTIME_PATHS = resolveFoundryRuntimePaths({ repoRoot: REPO_ROOT });

loadDotEnvFile(DOTENV_PATH);

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
export const DEFAULT_DB_PATH = path.resolve(
  process.env.SOCIALOS_DB_PATH || path.join(REPO_ROOT, 'infra/db/socialos.db')
);
export const DEFAULT_WEB_PORT = Number(process.env.SOCIALOS_WEB_PORT || 4173);

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const DEFAULT_PUBLISH_MODE = 'dry-run';
const LIVE_PUBLISH_MODE = 'live';
const HIGH_FREQUENCY_MARKERS = new Set([
  'high',
  'high-frequency',
  'high_frequency',
  'realtime',
  'real-time',
  'cron',
  'burst',
]);

const EMBEDDINGS_PROVIDER_AUTO = 'auto';
const EMBEDDINGS_PROVIDER_OPENAI = 'openai';
const EMBEDDINGS_PROVIDER_LOCAL = 'local';
const SUPPORTED_EMBEDDINGS_PROVIDERS = new Set([
  EMBEDDINGS_PROVIDER_AUTO,
  EMBEDDINGS_PROVIDER_OPENAI,
  EMBEDDINGS_PROVIDER_LOCAL,
]);

const FORMAT_RULES = Object.freeze({
  markdown_link: Object.freeze({
    description: 'markdown links ([text](url)) are not supported',
    pattern: /\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\)/iu,
  }),
  fenced_code: Object.freeze({
    description: 'fenced code blocks (```...```) are not supported',
    pattern: /```/u,
  }),
  html_tag: Object.freeze({
    description: 'raw HTML tags are not supported',
    pattern: /<[^>]+>/u,
  }),
});

const PLATFORM_COMPLIANCE_RULES = Object.freeze({
  instagram: Object.freeze({
    id: 'instagram',
    label: 'Instagram',
    maxLength: 2200,
    maxHashtags: 30,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  x: Object.freeze({
    id: 'x',
    label: 'X',
    maxLength: 280,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  linkedin: Object.freeze({
    id: 'linkedin',
    label: 'LinkedIn',
    maxLength: 3000,
    maxHashtags: 5,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  zhihu: Object.freeze({
    id: 'zhihu',
    label: 'Zhihu',
    maxLength: 20000,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  xiaohongshu: Object.freeze({
    id: 'xiaohongshu',
    label: 'Rednote',
    maxLength: 1000,
    maxHashtags: 20,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  wechat_moments: Object.freeze({
    id: 'wechat_moments',
    label: 'WeChat Moments',
    maxLength: 2000,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  wechat_official: Object.freeze({
    id: 'wechat_official',
    label: 'WeChat Official Account',
    maxLength: 20000,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
});

const PLATFORM_ALIASES = Object.freeze({
  instagram: ['instagram', 'ig', 'ins'],
  x: ['x', 'twitter', 'x.com'],
  linkedin: ['linkedin', 'linked-in'],
  zhihu: ['zhihu', '知乎'],
  xiaohongshu: ['xiaohongshu', 'xhs', 'xiao_hong_shu', 'xiao hong shu', '小红书'],
  wechat_moments: [
    'wechat_moments',
    'wechat-moments',
    'wechat moments',
    'moments',
    '朋友圈',
    '微信朋友圈',
  ],
  wechat_official: [
    'wechat_official',
    'wechat-official',
    'wechat official',
    'official-account',
    'official account',
    '公众号',
    '微信公众号',
  ],
});

const SUPPORTED_QUEUE_PLATFORMS = Object.freeze(Object.keys(PLATFORM_COMPLIANCE_RULES));

const PLATFORM_ALIAS_TO_ID = (() => {
  const aliasMap = new Map();

  for (const [platformId, aliases] of Object.entries(PLATFORM_ALIASES)) {
    aliasMap.set(platformId, platformId);
    for (const alias of aliases) {
      aliasMap.set(alias.toLowerCase(), platformId);
    }
  }

  return aliasMap;
})();

const PLATFORM_PRODUCT_CAPABILITIES = Object.freeze({
  instagram: Object.freeze({
    supportLevel: 'L1 Assisted',
    lane: 'publish-package',
    entryTarget: 'Instagram app composer',
    liveEligible: false,
    blockedBy: 'final publish stays manual',
  }),
  x: Object.freeze({
    supportLevel: 'L2 Auto Publish (credentials gated)',
    lane: 'publisher',
    entryTarget: 'X web/API publishing lane',
    liveEligible: true,
    blockedBy: 'requires live mode + credentials',
  }),
  linkedin: Object.freeze({
    supportLevel: 'L2 Auto Publish (credentials gated)',
    lane: 'publisher',
    entryTarget: 'LinkedIn post workflow',
    liveEligible: true,
    blockedBy: 'requires live mode + credentials',
  }),
  zhihu: Object.freeze({
    supportLevel: 'L1 Assisted',
    lane: 'publish-package',
    entryTarget: 'Zhihu editor',
    liveEligible: false,
    blockedBy: 'final publish stays manual',
  }),
  xiaohongshu: Object.freeze({
    supportLevel: 'L1 Assisted+',
    lane: 'publish-package',
    entryTarget: 'Rednote mobile composer',
    liveEligible: false,
    blockedBy: 'manual media + final publish step',
  }),
  wechat_moments: Object.freeze({
    supportLevel: 'L1 Assisted+',
    lane: 'publish-package',
    entryTarget: 'WeChat Moments mobile composer',
    liveEligible: false,
    blockedBy: 'manual mobile-only publish',
  }),
  wechat_official: Object.freeze({
    supportLevel: 'L1.5 Rich Article Package',
    lane: 'publish-package',
    entryTarget: 'WeChat Official Account backend',
    liveEligible: false,
    blockedBy: 'manual article assembly + final publish',
  }),
});

const PLATFORM_NATIVE_LANGUAGES = Object.freeze({
  instagram: 'en',
  x: 'en',
  linkedin: 'en',
  zhihu: 'zh',
  xiaohongshu: 'zh',
  wechat_moments: 'zh',
  wechat_official: 'zh',
});

const PLATFORM_ENTRY_URLS = Object.freeze({
  instagram: 'https://www.instagram.com/',
  x: 'https://x.com/compose/post',
  linkedin: 'https://www.linkedin.com/feed/',
  zhihu: 'https://zhuanlan.zhihu.com/write',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  wechat_moments: 'https://weixin.qq.com/',
  wechat_official: 'https://mp.weixin.qq.com/',
});

const MODEL_PROVIDER_AUTO = 'auto';
const MODEL_PROVIDER_OPENAI = 'openai';
const MODEL_PROVIDER_GLM = 'glm';
const MODEL_PROVIDER_FLOCK = 'flock';
const MODEL_PROVIDER_LOCAL = 'local';
const SUPPORTED_MODEL_PROVIDERS = new Set([
  MODEL_PROVIDER_AUTO,
  MODEL_PROVIDER_OPENAI,
  MODEL_PROVIDER_GLM,
  MODEL_PROVIDER_FLOCK,
  MODEL_PROVIDER_LOCAL,
]);

const DEFAULT_GLM_MODEL_ID = 'glm-4.7';
const DEFAULT_FLOCK_MODEL_ID = 'qwen3-30b-a3b-instruct-2507';
const DEFAULT_STRUCTURED_MODEL_TIMEOUT_MS = 20000;
const HACKATHON_DECK_APPENDIX_START_SLIDE = 9;

const HACKATHON_BOUNTIES = Object.freeze([
  Object.freeze({
    id: 'claw-for-human',
    label: 'Claw for Human',
    prize: '$500 USD',
    sponsor: 'Imperial Blockchain',
    route: '/demo',
    localRecordRoute: '/demo',
    partnerLabel: 'OpenClaw Runtime',
    apiSurface: 'GET /proofs?bounty=claw-for-human',
    infrastructure: 'OpenClaw runtime lanes + loopback-only SocialOS UI + public proof export',
    audience: 'judges who want a human-ready product surface',
    problem: 'OpenClaw is powerful for builders, but judges still need to see it translated into a calm, human-readable end-user workflow.',
    hook: 'Bring Claw out of the shell and into a guided relationship workspace.',
    fit: 'SocialOS already turns OpenClaw-powered agent orchestration into a calm interface with memory, drafts, queue, and reflection.',
    uniqueAngle: 'Explainable relationship OS instead of a generic assistant shell.',
    integrationSummary: 'OpenClaw runs the orchestration, memory, compliance, and publishing lanes while SocialOS exposes one guided loop across Workspace, Contacts, Drafts, Queue, and Mirror.',
    technicalImplementation: 'The Node API persists people, events, drafts, queue state, and mirror evidence in SQLite while the OpenClaw runtime keeps the product lanes separated behind the same UI.',
    judgeClosing: 'This is Claw translated into a usable relationship operating system, not left as a shell-only interface.',
    eligibilityChecklist: [
      'Show a real OpenClaw-powered product instead of a shell-only workflow.',
      'Use the shared demo route to make the orchestration legible to non-technical judges.',
      'Close on the public hub anchor and proof JSON so the submission stays reviewable after the video.',
    ],
    integrations: ['openclaw', 'workspace', 'deck'],
    proofKinds: ['openclaw', 'ui', 'deck'],
    demoSteps: ['Open /demo', 'Launch /quick-capture', 'Show agent trace + evidence cards'],
  }),
  Object.freeze({
    id: 'animoca',
    label: 'Animoca Bounty',
    prize: '$1,000 USD',
    sponsor: 'Animoca Brands',
    route: '/hackathon?bounty=animoca',
    localRecordRoute: '/hackathon?bounty=animoca',
    partnerLabel: 'Animoca-style Identity, Memory, and Cognition',
    apiSurface: 'GET /proofs?bounty=animoca',
    infrastructure: 'SQLite identity graph + event memory + OpenClaw lane coordination for long-horizon agent work',
    audience: 'judges looking for identity, memory, and multi-agent coordination',
    problem: 'Creator and community workflows break when identity, relationship memory, and long-horizon coordination are not persistent across sessions.',
    hook: 'Position SocialOS as an identity-rich agent system for creator, operator, and community workflows.',
    fit: 'The repo already has persistent people memory, linked identities, event continuity, and explicit agent lanes for memory, compliance, and publishing.',
    uniqueAngle: 'Persistent identity and long-horizon memory instead of a one-shot agent demo.',
    integrationSummary: 'The same product loop already links Person, Identity, Interaction, Event, Draft, and Mirror state while OpenClaw coordinates the memory, compliance, and publishing jobs needed to keep that identity graph actionable.',
    technicalImplementation: 'The schema keeps linked people and event context first-class, and the runtime splits memory, compliance, and publishing responsibilities into visible lanes instead of a monolithic chatbot. That gives SocialOS the identity, memory, and cognition posture Animoca is asking for.',
    judgeClosing: 'This is persistent identity and memory for creator-community operations, not a one-task assistant demo.',
    eligibilityChecklist: [
      'Show identity, memory, and cognition working together across the same person or community thread.',
      'Keep the demo focused on long-horizon continuity, not one-off generation.',
      'Use the agent-lane trace to make the multi-agent shape explicit to judges.',
    ],
    integrations: ['openclaw', 'workspace', 'deck'],
    proofKinds: ['openclaw', 'memory', 'ui'],
    demoSteps: ['Open /hackathon', 'Inspect Animoca card', 'Jump into Contacts and Studio agents'],
  }),
  Object.freeze({
    id: 'human-for-claw',
    label: 'Human for Claw',
    prize: '$500 USD',
    sponsor: 'Imperial Blockchain',
    route: '/buddy',
    localRecordRoute: '/buddy',
    partnerLabel: 'Buddy Guardrails on OpenClaw',
    apiSurface: 'GET /proofs?bounty=human-for-claw',
    infrastructure: 'Buddy UI mode + dry-run safety defaults + OpenClaw-backed memory loop',
    audience: 'judges evaluating kid-friendly or family-friendly Claw experiences',
    problem: 'Agent products are often too open-ended for students, younger users, or trust-sensitive first-time users.',
    hook: 'Offer a friendship and gratitude coach with guardrails instead of an unrestricted agent.',
    fit: 'SocialOS already captures people, follow-up, and reflection. Buddy mode narrows that loop to safe, supportive actions.',
    uniqueAngle: 'Positive social coaching with explicit boundaries and no risky publishing surface.',
    integrationSummary: 'Buddy mode keeps the same SocialOS memory loop but narrows users into four safe tasks and removes any pressure to publish or configure complex automation.',
    technicalImplementation: 'The web layer hides risky controls, keeps the product loop loopback-only and dry-run, and routes users into capture, memory, follow-up, and reflection flows instead of open-ended execution.',
    judgeClosing: 'Buddy mode is intentionally narrower, safer, and easier to trust than a general-purpose agent.',
    eligibilityChecklist: [
      'Show the four constrained Buddy tasks instead of the full operator surface.',
      'Make the safety rails visible: dry-run only, trust-first defaults, and simpler language.',
      'Keep the route emotionally approachable for younger or first-time users.',
    ],
    integrations: ['openclaw', 'buddy', 'workspace'],
    proofKinds: ['ui', 'safety', 'memory'],
    demoSteps: ['Open /buddy', 'Pick a safe task card', 'Jump into a prefilled Workspace flow'],
  }),
  Object.freeze({
    id: 'z-ai-general',
    label: 'Z.AI General',
    prize: '$4,000 USD',
    sponsor: 'Z.AI',
    route: '/hackathon?bounty=z-ai-general',
    localRecordRoute: '/hackathon?bounty=z-ai-general',
    partnerLabel: 'Z.AI GLM',
    apiSurface: 'POST /integrations/glm/generate',
    infrastructure: 'GLM model routing inside Workspace support, judge summaries, and production draft generation',
    audience: 'judges who want a real GLM-powered prototype',
    problem: 'Production agent workflows often bolt a model onto a demo page instead of making that model a core part of the real product loop.',
    hook: 'Use GLM in the core SocialOS workflow, not as a side widget.',
    fit: 'Workspace support, judge summaries, and draft generation all map naturally onto the current product loop, so GLM can become a first-class provider instead of a decorative plug-in.',
    uniqueAngle: 'GLM is a core production path for summaries, reasoning, and content generation, not a checkbox integration.',
    integrationSummary: 'GLM is routed through the native SocialOS flow: judge-facing summary generation, Workspace support, and platform-native draft generation all call the same GLM path instead of a mock adapter.',
    technicalImplementation: 'The API exposes a live GLM endpoint, records proof metadata into audit evidence, and reuses the same provider-aware routing path inside Workspace and Draft generation so the bounty is part of the product, not a side panel.',
    judgeClosing: 'GLM is integrated into the real SocialOS loop and captured as live proof, not demonstrated as a decorative plug-in.',
    eligibilityChecklist: [
      'Keep GLM as a core product dependency in the live demo and proof JSON.',
      'Show the real generation path inside Workspace or Drafts, not an isolated API call only.',
      'Close on a runnable prototype, a public repo, and a live proof surface.',
    ],
    integrations: ['glm', 'workspace', 'deck'],
    proofKinds: ['glm', 'ui', 'deck'],
    demoSteps: ['Open /hackathon', 'Call GLM router', 'Show GLM-tagged Workspace or Draft flow'],
  }),
  Object.freeze({
    id: 'ai-agents-for-good',
    label: 'AI Agents for Good',
    prize: '$5,000 USDT',
    sponsor: 'FLock.io',
    route: '/hackathon?bounty=ai-agents-for-good',
    localRecordRoute: '/hackathon?bounty=ai-agents-for-good',
    partnerLabel: 'FLock SDG Triage + OpenClaw + Multi-channel Outreach',
    apiSurface: 'POST /integrations/flock/sdg-triage + POST /integrations/telegram/send',
    infrastructure: 'FLock SDG triage + OpenClaw memory loop + outreach lanes + Telegram volunteer channel',
    audience: 'judges looking for impact-focused agent workflows',
    problem: 'Impact workflows usually stop at categorization instead of carrying urgency and next action into a real coordination loop.',
    hook: 'Turn SocialOS into a community support and volunteer coordination operating system.',
    fit: 'Contacts, events, follow-up drafts, and evidence-backed coordination already exist; FLock adds SDG triage and urgency scoring while SocialOS already ships multi-channel outreach lanes.',
    uniqueAngle: 'Long-term relationship memory and follow-through for impact work, not a one-turn charity chatbot.',
    integrationSummary: 'FLock adds live SDG labeling, urgency scoring, and next-step guidance, then SocialOS promotes that result into contacts, events, follow-up drafts, queue-visible coordination, and a Telegram volunteer channel when credentials are present.',
    technicalImplementation: 'The API calls the live FLock structured-model path, marks the route as open-source-model-backed, records provider metadata into proof evidence, and keeps the resulting action inside the same OpenClaw-orchestrated relationship-memory workflow used elsewhere in the product. The impact track also exposes a Telegram send/status/webhook surface plus the existing outreach lanes for multi-channel deployment.',
    judgeClosing: 'This is not a charity chatbot. It is impact triage plus relationship memory and actual follow-through.',
    eligibilityChecklist: [
      'Show OpenClaw, FLock, and the SDG-aligned triage result inside the same workflow.',
      'Expose the multi-channel story through outreach lanes and the Telegram volunteer channel.',
      'Make the open-source model requirement explicit in the proof metadata.',
    ],
    integrations: ['openclaw', 'flock', 'channels', 'workspace'],
    proofKinds: ['flock', 'openclaw', 'memory', 'multi-channel', 'telegram'],
    demoSteps: ['Open /hackathon', 'Run SDG triage', 'Show channel proof', 'Promote the result into follow-up actions and drafts'],
  }),
]);

const HACKATHON_BOUNTY_ALIAS_TO_ID = (() => {
  const aliasMap = new Map();

  for (const bounty of HACKATHON_BOUNTIES) {
    aliasMap.set(bounty.id, bounty.id);
    aliasMap.set(bounty.label.toLowerCase(), bounty.id);
  }

  aliasMap.set('human for claw', 'human-for-claw');
  aliasMap.set('claw for human', 'claw-for-human');
  aliasMap.set('animoca bounty', 'animoca');
  aliasMap.set('z.ai', 'z-ai-general');
  aliasMap.set('z ai', 'z-ai-general');
  aliasMap.set('z.ai general', 'z-ai-general');
  aliasMap.set('ai agents for good', 'ai-agents-for-good');

  return aliasMap;
})();

function buildHackathonProofJsonPath(bountyId = '') {
  const normalized = normalizeBountyMode(bountyId);
  return normalized ? `/data/proofs/${encodeURIComponent(normalized)}.json` : '/data/proofs/all.json';
}

function buildHackathonPublicAnchor(bountyId = '') {
  const normalized = normalizeBountyMode(bountyId);
  return normalized ? `/hackathon/#bounty-${encodeURIComponent(normalized)}` : '/hackathon/';
}

function buildHackathonDeckAppendixSlide(index) {
  return `Slide ${HACKATHON_DECK_APPENDIX_START_SLIDE + index}`;
}

function loadDotEnvFile(filePath) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const FOUNDRY_AGENT_RESPONSIBILITIES = Object.freeze({
  forge_orchestrator: Object.freeze({
    title: 'Orchestrator',
    responsibility: 'Break product work into prioritized, executable units for orchestrator, coder, tester, and reviewer lanes.',
  }),
  forge_coder: Object.freeze({
    title: 'Coder',
    responsibility: 'Implement API, UI, runtime, and documentation changes.',
  }),
  forge_tester: Object.freeze({
    title: 'Tester',
    responsibility: 'Run smoke, e2e, and review gates to confirm the product loop still holds.',
  }),
  forge_reviewer: Object.freeze({
    title: 'Reviewer',
    responsibility: 'Review policy, safety boundaries, regression risk, and quality gates.',
  }),
});

const CODEX_PARTICIPATION = Object.freeze({
  canOwn: [
    'Cross-file architecture refactors',
    'Workspace UI productization',
    'API design and implementation',
    'Foundry orchestration and control-plane integration',
    'Test completion and regression debugging',
    'Blocked-task root cause analysis and dry-run unlocks',
  ],
  goodAt: [
    'Turning ambiguous asks into executable backlog items',
    'Making incremental changes without breaking the working loop',
    'Keeping runtime, UI, docs, and tests consistent end to end',
  ],
  stillNeedsHuman: [
    'Real platform credentials and active login sessions',
    'Business decisions about whether live publish is allowed',
    'Final brand voice and publication judgment calls',
  ],
});

let ACTIVE_STUDIO = null;

class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendNoContent(res, statusCode = 204, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end();
}

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function readOptionalBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readBooleanLike(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readOptionalPositiveInteger(value, fallback) {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePublishMode(value, fallback = DEFAULT_PUBLISH_MODE) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === LIVE_PUBLISH_MODE ? LIVE_PUBLISH_MODE : DEFAULT_PUBLISH_MODE;
}

function safeParseJsonObject(value, fallback = {}) {
  if (typeof value !== 'string' || !value.trim()) return { ...fallback };

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return { ...fallback };
  }

  return { ...fallback };
}

function safeParseJsonArray(value, fallback = []) {
  if (typeof value !== 'string' || !value.trim()) return [...fallback];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return [...parsed];
  } catch {
    return [...fallback];
  }

  return [...fallback];
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [...fallback];
}

function normalizeModelProvider(value, fallback = MODEL_PROVIDER_AUTO) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_MODEL_PROVIDERS.has(normalized) ? normalized : fallback;
}

function normalizeBountyMode(value) {
  if (typeof value !== 'string') return '';
  return HACKATHON_BOUNTY_ALIAS_TO_ID.get(value.trim().toLowerCase()) || '';
}

function readHackathonMode() {
  return readOptionalString(process.env.HACKATHON_MODE, 'off').toLowerCase();
}

function hasConfiguredOpenAi() {
  return Boolean(readOptionalString(process.env.OPENAI_API_KEY, ''));
}

function hasConfiguredGlm() {
  return Boolean(readOptionalString(process.env.GLM_API_KEY, ''));
}

function hasConfiguredFlock() {
  return Boolean(readOptionalString(process.env.FLOCK_API_KEY, ''));
}

function readTelegramBotToken() {
  return readOptionalString(process.env.TELEGRAM_BOT_TOKEN, '');
}

function readTelegramDefaultChatId() {
  return readOptionalString(process.env.TELEGRAM_DEFAULT_CHAT_ID, '');
}

function readTelegramWebhookSecret() {
  return readOptionalString(process.env.TELEGRAM_WEBHOOK_SECRET, '');
}

function readTelegramBotUsername() {
  return readOptionalString(process.env.TELEGRAM_BOT_USERNAME, '');
}

function hasConfiguredTelegram() {
  return Boolean(readTelegramBotToken() && readTelegramDefaultChatId());
}

function maskTelegramChatId(chatId = '') {
  const safeChatId = readOptionalString(chatId, '');
  if (!safeChatId) return '';
  if (safeChatId.length <= 4) return safeChatId;
  return `${safeChatId.slice(0, 2)}***${safeChatId.slice(-2)}`;
}

function inferOpenSourceModelFlag(provider = '', model = '') {
  const normalizedProvider = readOptionalString(provider, '').toLowerCase();
  const normalizedModel = readOptionalString(model, '').toLowerCase();
  if (normalizedProvider === MODEL_PROVIDER_FLOCK || normalizedProvider === MODEL_PROVIDER_LOCAL) return true;
  return /(?:qwen|llama|mistral|deepseek|gemma|yi|open.?source|mixtral)/u.test(normalizedModel);
}

function resolveRequestedModelProvider({ requestedProvider = MODEL_PROVIDER_AUTO, bountyMode = '' } = {}) {
  const normalizedBounty = normalizeBountyMode(bountyMode);
  const explicitProvider = normalizeModelProvider(requestedProvider);
  const preferredProvider =
    explicitProvider !== MODEL_PROVIDER_AUTO
      ? explicitProvider
      : normalizedBounty === 'z-ai-general'
        ? MODEL_PROVIDER_GLM
        : normalizedBounty === 'ai-agents-for-good'
          ? MODEL_PROVIDER_FLOCK
        : MODEL_PROVIDER_AUTO;

  if (preferredProvider === MODEL_PROVIDER_GLM) {
    return hasConfiguredGlm()
      ? { requested: explicitProvider, effective: MODEL_PROVIDER_GLM, configured: true, fallbackUsed: false, reason: 'glm-configured' }
      : { requested: explicitProvider, effective: MODEL_PROVIDER_LOCAL, configured: false, fallbackUsed: true, reason: 'glm-not-configured' };
  }

  if (preferredProvider === MODEL_PROVIDER_OPENAI) {
    return hasConfiguredOpenAi()
      ? { requested: explicitProvider, effective: MODEL_PROVIDER_OPENAI, configured: true, fallbackUsed: false, reason: 'openai-configured' }
      : { requested: explicitProvider, effective: MODEL_PROVIDER_LOCAL, configured: false, fallbackUsed: true, reason: 'openai-not-configured' };
  }

  if (preferredProvider === MODEL_PROVIDER_FLOCK) {
    return hasConfiguredFlock()
      ? { requested: explicitProvider, effective: MODEL_PROVIDER_FLOCK, configured: true, fallbackUsed: false, reason: 'flock-configured' }
      : { requested: explicitProvider, effective: MODEL_PROVIDER_LOCAL, configured: false, fallbackUsed: true, reason: 'flock-not-configured' };
  }

  if (hasConfiguredOpenAi()) {
    return { requested: explicitProvider, effective: MODEL_PROVIDER_OPENAI, configured: true, fallbackUsed: false, reason: 'auto-openai' };
  }

  if (hasConfiguredGlm()) {
    return { requested: explicitProvider, effective: MODEL_PROVIDER_GLM, configured: true, fallbackUsed: false, reason: 'auto-glm' };
  }

  if (hasConfiguredFlock()) {
    return { requested: explicitProvider, effective: MODEL_PROVIDER_FLOCK, configured: true, fallbackUsed: false, reason: 'auto-flock' };
  }

  return { requested: explicitProvider, effective: MODEL_PROVIDER_LOCAL, configured: false, fallbackUsed: true, reason: 'local-fallback' };
}

function formatPlatformLabel(platformId) {
  return PLATFORM_COMPLIANCE_RULES[platformId]?.label || platformId;
}

function formatPlatformShellLabel(platformId) {
  const labels = {
    instagram: 'Instagram',
    x: 'X',
    linkedin: 'LinkedIn',
    zhihu: 'Zhihu',
    xiaohongshu: 'Rednote',
    wechat_moments: 'WeChat Moments',
    wechat_official: 'WeChat Official Account',
  };
  return labels[platformId] || formatPlatformLabel(platformId);
}

function getPlatformCapability(platformId) {
  return PLATFORM_PRODUCT_CAPABILITIES[platformId] || {
    supportLevel: 'L0 Draft',
    lane: 'publish-package',
    entryTarget: 'manual publish flow',
    liveEligible: false,
    blockedBy: 'manual completion required',
  };
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function runSchemaMigrations(db) {
  ensureColumn(db, 'Mirror', 'cadence', "TEXT NOT NULL DEFAULT 'weekly'");
  ensureColumn(db, 'Mirror', 'period_key', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'CaptureAsset', 'local_path', "TEXT NOT NULL DEFAULT ''");
}

function localizeCapability(capability, platformId, language) {
  return capability;
}

function truncateText(value, maxLength) {
  const text = readOptionalString(value, '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactNotes(value, maxLength = 220) {
  return truncateText(sanitizeContactDraftText(value) || readOptionalString(value, ''), maxLength);
}

function isDisplayablePersonName(value) {
  return !isPlaceholderContactName(value);
}

function isDisplayablePersonRow(row) {
  return isDisplayablePersonName(row?.name);
}

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getEventPayloadLayers(payload) {
  const source = normalizeRecord(payload);
  const details = normalizeRecord(source.details);
  const nested = normalizeRecord(details.details);
  return { source, details, nested };
}

function sanitizeEventNarrative(value, language = 'en', maxLength = 220) {
  let text = sanitizeContactDraftText(readOptionalString(value, ''));
  if (!text) return '';

  text = text
    .replace(/\b(?:focus|source|sourceType|sourceFocus|personName|summary)\s*:\s*[^|]+(?:\|\s*)?/giu, ' ')
    .replace(/\b(?:chat-derived event suggestion|workspace-chat)\b/giu, ' ')
    .replace(/[|]/gu, ' ')
    .replace(
      /(?:顺便|然后|再)\s*帮我把这条后面变成一个\s*event(?:，|,)?\s*再准备多平台草稿。?/gu,
      ''
    )
    .replace(
      /(?:and|then)\s*(?:help me )?(?:turn this into an event|prepare multi-platform drafts).*$/iu,
      ''
    )
    .replace(
      /(?:wechat|微信)\s*(?:是|[:：])\s*[A-Za-z0-9_.-]{3,40}/giu,
      language === 'zh' ? '交换了微信' : 'we exchanged contact details'
    )
    .replace(
      /linkedin\s*[:：]?\s*(?:https?:\/\/\S+|[A-Za-z0-9_.-]{3,60})/giu,
      language === 'zh' ? '互留了 LinkedIn' : 'we exchanged LinkedIn profiles'
    );

  return truncateText(cleanText(text), maxLength);
}

function getEventPersonName(payload) {
  const { source, details, nested } = getEventPayloadLayers(payload);
  return cleanText(details.personName || nested.personName || source.personName || '');
}

function getEventNarrativeText(payload, language = 'en', maxLength = 220) {
  const { source, details, nested } = getEventPayloadLayers(payload);
  const candidates = [
    nested.combinedText,
    details.combinedText,
    details.summary,
    source.summary,
    details.description,
    source.description,
    details.focus,
    source.focus,
  ];

  for (const candidate of candidates) {
    const next = sanitizeEventNarrative(candidate, language, maxLength);
    if (next) return next;
  }

  return '';
}

function normalizeEventPayloadDetails(value) {
  const source = normalizeRecord(value);
  const details = normalizeRecord(source.details);
  const nested = normalizeRecord(details.details);
  const passthrough = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (
      ['details', 'summary', 'combinedText', 'followUpSuggestion', 'personName', 'source', 'sourceType'].includes(key)
    ) {
      continue;
    }
    if (typeof rawValue === 'string' && cleanText(rawValue)) {
      passthrough[key] = cleanText(rawValue);
      continue;
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      passthrough[key] = rawValue;
    }
  }

  const personName = cleanText(source.personName || details.personName || nested.personName || '');
  const combinedText = getEventNarrativeText(
    {
      combinedText: source.combinedText,
      summary: source.summary,
      focus: source.focus,
      details: {
        combinedText: details.combinedText,
        summary: details.summary,
        focus: details.focus,
        details: {
          combinedText: nested.combinedText,
        },
      },
    },
    hasHanCharacters(personName) ? 'zh' : 'en',
    280
  );
  const summary = sanitizeEventNarrative(
    source.summary || details.summary || combinedText,
    hasHanCharacters(personName) ? 'zh' : 'en',
    220
  );
  const followUpSuggestion = sanitizeContactDraftText(
    readOptionalString(source.followUpSuggestion || details.followUpSuggestion || nested.followUpSuggestion, '')
  );
  const focus = cleanText(source.focus || details.focus || '');
  const sourceType = cleanText(source.sourceType || source.source || details.sourceType || details.source || '');

  return {
    ...passthrough,
    ...(focus ? { focus } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(personName ? { personName } : {}),
    ...(summary ? { summary } : {}),
    ...(combinedText ? { combinedText } : {}),
    ...(followUpSuggestion ? { followUpSuggestion } : {}),
  };
}

function summarizeEventPayload(payload) {
  const source = normalizeRecord(payload);
  const preferredLanguage = hasHanCharacters(JSON.stringify(source)) ? 'zh' : 'en';
  const summary = getEventNarrativeText(source, preferredLanguage, 180);
  if (summary) return summary;

  const personName = getEventPersonName(source);
  if (personName) {
    return preferredLanguage === 'zh' ? `和${personName}有关的后续推进` : `A follow-up conversation with ${personName}`;
  }

  return cleanText(readOptionalString(source.focus, ''));
}

function hasHanCharacters(value) {
  return /[\u4e00-\u9fff]/u.test(readOptionalString(value, ''));
}

function hasLatinLetters(value) {
  return /[A-Za-z]/u.test(readOptionalString(value, ''));
}

function inferLocation(rawText) {
  const source = cleanText(rawText).toLowerCase();
  if (source.includes('london')) return 'London';
  if (source.includes('singapore')) return 'Singapore';
  if (source.includes('new york')) return 'New York';
  if (source.includes('san francisco')) return 'San Francisco';
  if (source.includes('shanghai')) return 'Shanghai';
  if (source.includes('beijing')) return 'Beijing';
  return '';
}

function localizeLocationLabel(location, language) {
  if (language !== 'zh') return location;
  const locationMap = new Map([
    ['London', '伦敦'],
    ['Singapore', '新加坡'],
    ['New York', '纽约'],
    ['San Francisco', '旧金山'],
    ['Shanghai', '上海'],
    ['Beijing', '北京'],
  ]);
  return locationMap.get(location) || location;
}

function inferScenePhrase(rawText, language) {
  const source = cleanText(rawText).toLowerCase();
  const location = localizeLocationLabel(inferLocation(source), language);
  if (source.includes('hackathon')) {
    return language === 'zh'
      ? `${location ? `${location}的` : ''}黑客松现场`
      : `${location ? `a hackathon in ${location}` : 'a hackathon'}`;
  }
  if (source.includes('meetup') || source.includes('builder meetup')) {
    return language === 'zh'
      ? `${location ? `${location}的` : ''}开发者聚会`
      : `${location ? `a builder meetup in ${location}` : 'a builder meetup'}`;
  }
  if (source.includes('conference') || source.includes('summit')) {
    return language === 'zh'
      ? `${location ? `${location}的` : ''}活动交流`
      : `${location ? `a conference conversation in ${location}` : 'a conference conversation'}`;
  }
  return language === 'zh' ? '最近的一次交流' : 'a recent conversation';
}

function inferRolePhrase(rawText, language) {
  const source = cleanText(rawText).toLowerCase();
  const roles = [];

  if (source.includes('growth') || source.includes('增长')) {
    roles.push(language === 'zh' ? '增长' : 'growth');
  }
  if (
    source.includes('community') ||
    source.includes('社区') ||
    source.includes('运营')
  ) {
    roles.push(language === 'zh' ? '社区运营' : 'community');
  }
  if (source.includes('product') || source.includes('产品')) {
    roles.push(language === 'zh' ? '产品' : 'product');
  }
  if (
    source.includes('content') ||
    source.includes('内容') ||
    source.includes('distribution') ||
    source.includes('分发')
  ) {
    roles.push(language === 'zh' ? '内容分发' : 'content distribution');
  }
  if (source.includes('investor') || source.includes('投资')) {
    roles.push(language === 'zh' ? '投资' : 'investing');
  }

  return [...new Set(roles)].slice(0, 3);
}

function inferTopicPhrase(rawText, language) {
  const source = cleanText(rawText).toLowerCase();
  const topics = [];
  const push = (zh, en) => {
    topics.push(language === 'zh' ? zh : en);
  };

  if (source.includes('socialos')) push('SocialOS', 'SocialOS');
  if (source.includes('agent workflow') || source.includes('agent') || source.includes('agents')) {
    push('多智能体工作流', 'agent workflows');
  }
  if (source.includes('demo')) push('演示扩散', 'demo distribution');
  if (source.includes('content')) push('内容策略', 'content strategy');
  if (source.includes('community') || source.includes('社区')) push('社区运营', 'community building');
  if (source.includes('growth') || source.includes('增长')) push('增长动作', 'growth loops');
  if (source.includes('product') || source.includes('产品')) push('产品推进', 'product execution');

  if (!topics.length) {
    const inferred = inferTagsFromText(rawText);
    for (const tag of inferred) {
      if (tag === 'growth') push('增长动作', 'growth loops');
      if (tag === 'community') push('社区运营', 'community building');
      if (tag === 'product') push('产品推进', 'product execution');
      if (tag === 'engineering') push('工程落地', 'engineering execution');
    }
  }

  return [...new Set(topics)].slice(0, 4);
}

function joinPhrases(items, language) {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (language === 'zh') return values.join('、');
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function buildLocalizedEventTitle(event, language, payload = {}) {
  const rawTitle = cleanText(event?.title || '');
  const personName = cleanText(payload.personName || getEventPersonName(payload) || '');
  const followUpMatch = rawTitle.match(/^follow-up with\s+(.+)$/iu);

  if (followUpMatch?.[1]) {
    const subject = cleanText(personName || followUpMatch[1]);
    return language === 'zh' ? `和${subject}的后续跟进` : `Follow-up with ${subject}`;
  }

  if (language === 'zh') {
    if (rawTitle && hasHanCharacters(rawTitle) && !hasLatinLetters(rawTitle)) return rawTitle;
    if (personName) return `和${personName}的后续跟进`;
    return rawTitle && hasHanCharacters(rawTitle) ? rawTitle : '这次推进的后续跟进';
  }

  if (rawTitle && !hasHanCharacters(rawTitle)) return rawTitle;
  if (personName) return `Follow-up with ${personName}`;
  return 'Campaign follow-up';
}

function buildLocalizedEventContext(event, language) {
  const eventPayload = safeParseJsonObject(event.payload, {});
  const rawContext = getEventNarrativeText(eventPayload, language, 240);
  const scene = inferScenePhrase(rawContext, language);
  const roles = inferRolePhrase(rawContext, language);
  const topics = inferTopicPhrase(rawContext, language);
  const localizedTitle = buildLocalizedEventTitle(event, language, eventPayload);
  const personName = getEventPersonName(eventPayload);
  const roleText = joinPhrases(roles, language);
  const topicText = joinPhrases(topics, language);

  const contextLead = language === 'zh'
    ? personName
      ? `这次内容来自最近和${personName}的一次交流，场景是在${scene}。`
      : `这次内容来自${scene}。`
    : personName
      ? `This came out of ${scene} with ${personName}.`
      : `This came out of ${scene}.`;

  const detailLine = language === 'zh'
    ? [
        roleText ? `对方主要在做${roleText}。` : '',
        topicText ? `这次聊到的重点是${topicText}。` : '',
        !roleText && !topicText && rawContext ? `这次最值得延展的是：${truncateText(rawContext, 64)}。` : '',
        !roleText && !topicText && !rawContext ? '这次内容会围绕关系跟进、内容表达和下一步动作展开。' : '',
      ]
        .filter(Boolean)
        .join('')
    : [
        roleText ? `The conversation was grounded in ${roleText}.` : '',
        topicText ? `We focused on ${topicText}.` : '',
        !roleText && !topicText && rawContext ? `The clearest thread here was ${truncateText(rawContext, 100)}.` : '',
        !roleText && !topicText && !rawContext
          ? 'The draft centers on relationship follow-up, content expression, and the next concrete step.'
          : '',
      ]
        .filter(Boolean)
        .join(' ');

  return {
    localizedTitle,
    contextLead,
    detailLine,
    personName,
  };
}

function isTextAlignedWithLanguage(text, language) {
  const value = cleanText(text);
  if (!value) return false;
  const hasHan = hasHanCharacters(value);
  const hasLatin = hasLatinLetters(value);

  if (language === 'zh') return hasHan && !hasLatin;
  if (language === 'en') return hasLatin && !hasHan;
  return true;
}

function buildDefaultCta(platformRule, language) {
  if (language === 'zh') {
    switch (platformRule.id) {
      case 'xiaohongshu':
        return '如果你也在做类似流程，欢迎评论区告诉我你最卡的一步。';
      case 'wechat_moments':
        return '如果你也在折腾类似的事，欢迎来聊聊。';
      case 'wechat_official':
        return '如果你也在做类似方向，欢迎留言交流。';
      default:
        return '如果你也在做类似方向，欢迎交流。';
    }
  }

  switch (platformRule.id) {
    case 'instagram':
      return 'Comment if you want the workflow notes behind this build.';
    case 'x':
      return 'Reply if you want the short operator notes behind this workflow.';
    default:
      return 'Reply if you want to compare notes on a similar workflow.';
  }
}

function getPlatformNativeLanguage(platformId) {
  return PLATFORM_NATIVE_LANGUAGES[platformId] || 'en';
}

function resolveDraftLanguagesForPlatform(platformId, value) {
  const requested = normalizeStringList(value);
  const nativeLanguage = getPlatformNativeLanguage(platformId);
  const out = [];

  if (!requested.length) {
    return [nativeLanguage];
  }

  for (const item of requested) {
    const normalized = item.toLowerCase();
    if (
      normalized === 'platform-native' ||
      normalized === 'native' ||
      normalized === 'auto' ||
      normalized === 'platform_native'
    ) {
      out.push(nativeLanguage);
      continue;
    }
    if (normalized === 'bilingual' || normalized === 'both') {
      out.push(nativeLanguage, nativeLanguage === 'zh' ? 'en' : 'zh');
      continue;
    }
    if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'cn' || normalized === 'chinese') {
      out.push('zh');
      continue;
    }
    if (normalized === 'en' || normalized === 'en-us' || normalized === 'english') {
      out.push('en');
    }
  }

  return [...new Set(out.length ? out : [nativeLanguage])];
}

function normalizePlatformList(value) {
  const requested = normalizeStringList(value);
  if (!requested.length) return [...SUPPORTED_QUEUE_PLATFORMS];

  const normalized = [];
  for (const entry of requested) {
    const platformId = PLATFORM_ALIAS_TO_ID.get(entry.toLowerCase()) || entry.toLowerCase();
    if (!PLATFORM_COMPLIANCE_RULES[platformId]) continue;
    normalized.push(platformId);
  }

  return [...new Set(normalized)];
}

function buildHashtags(platformRule, language, tone) {
  const base =
    language === 'zh'
      ? ['#社交系统', '#行动复盘', '#内容实验', '#增长']
      : ['#socialos', '#builder', '#campaign', '#ship'];

  if (platformRule.id === 'linkedin') {
    base.push(language === 'zh' ? '#职业成长' : '#leadership');
  }
  if (platformRule.id === 'xiaohongshu') {
    base.push(language === 'zh' ? '#生活记录' : '#routine');
  }
  if (platformRule.id === 'wechat_official') {
    base.push(language === 'zh' ? '#长文' : '#deepdive');
  }
  if (tone) {
    base.push(`#${tone.replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'update'}`);
  }

  return base.slice(0, platformRule.maxHashtags);
}

function buildNativeTone(platformRule, language, options = {}) {
  const requestedTone = readOptionalString(options.tone, '');
  if (requestedTone) return requestedTone;

  if (platformRule.id === 'linkedin') {
    return language === 'zh' ? '专业、克制、清晰' : 'clear, operator-first, professional';
  }
  if (platformRule.id === 'x') {
    return language === 'zh' ? '直接、有判断' : 'sharp, concise, conviction-led';
  }
  if (platformRule.id === 'instagram') {
    return language === 'zh' ? '轻松、真诚、有画面感' : 'warm, visual, behind-the-scenes';
  }
  if (platformRule.id === 'wechat_moments') {
    return language === 'zh' ? '像近况更新一样自然' : 'casual and close to a friend update';
  }
  if (platformRule.id === 'wechat_official') {
    return language === 'zh' ? '完整、可复用、带结构' : 'structured, reusable, editorial';
  }
  if (platformRule.id === 'xiaohongshu') {
    return language === 'zh' ? '经验分享、结论先行、真诚' : 'advice-led, practical, clear';
  }
  if (platformRule.id === 'zhihu') {
    return language === 'zh' ? '解释充分、逻辑清楚' : 'explanatory and thoughtful';
  }
  return language === 'zh' ? '清晰' : 'clear';
}

function buildNativeAngle(platformRule, language, options = {}) {
  const requestedAngle = readOptionalString(options.angle, '');
  if (requestedAngle) return requestedAngle;

  if (platformRule.id === 'x' || platformRule.id === 'linkedin') {
    return language === 'zh' ? '阶段性进展' : 'operator update';
  }
  if (platformRule.id === 'instagram') {
    return language === 'zh' ? '现场感与过程感' : 'behind-the-scenes progress';
  }
  if (platformRule.id === 'zhihu') {
    return language === 'zh' ? '拆解思路' : 'explainer';
  }
  if (platformRule.id === 'xiaohongshu') {
    return language === 'zh' ? '经验总结' : 'practical notes';
  }
  if (platformRule.id === 'wechat_moments') {
    return language === 'zh' ? '近况记录' : 'personal update';
  }
  if (platformRule.id === 'wechat_official') {
    return language === 'zh' ? '系统复盘' : 'editorial recap';
  }
  return language === 'zh' ? '进展更新' : 'progress update';
}

function buildNativeAudience(platformRule, language, options = {}) {
  const requestedAudience = readOptionalString(options.audience, '');
  if (requestedAudience) return requestedAudience;

  if (platformRule.id === 'linkedin') {
    return language === 'zh' ? '合作伙伴和职业圈子' : 'peers, collaborators, and future partners';
  }
  if (platformRule.id === 'x') {
    return language === 'zh' ? '关注产品和 AI 的朋友' : 'builders shipping product and AI workflows';
  }
  if (platformRule.id === 'instagram') {
    return language === 'zh' ? '愿意看真实过程的人' : 'people who follow the visual making process';
  }
  if (platformRule.id === 'zhihu') {
    return language === 'zh' ? '想看完整拆解的人' : 'readers who want the full breakdown';
  }
  if (platformRule.id === 'xiaohongshu') {
    return language === 'zh' ? '想少走弯路的人' : 'people looking for practical shortcuts';
  }
  if (platformRule.id === 'wechat_moments') {
    return language === 'zh' ? '熟人朋友' : 'people already close to the work';
  }
  if (platformRule.id === 'wechat_official') {
    return language === 'zh' ? '愿意收藏和复用方法的人' : 'readers who will save and reuse the method';
  }
  return language === 'zh' ? '熟悉你的人脉圈' : 'people following your work';
}

function buildPublishSteps(platformId, capability, language) {
  const common = language === 'zh' ? '检查语气、标签、封面建议后再发布。' : 'Review tone, tags, and media notes before publishing.';

  if (language === 'zh') {
    switch (platformId) {
      case 'x':
        return ['先在 SocialOS 中排队等待审核。', '如果 live 模式和凭据都已就绪，再交给 publisher 推进。', common];
      case 'linkedin':
        return ['先检查长文语气和 CTA。', '如果 live 模式和凭据都已就绪，再交给 publisher 推进。', common];
      case 'instagram':
      case 'xiaohongshu':
      case 'wechat_moments':
        return ['复制正文和标签块。', `打开${capability.entryTarget}。`, common];
      case 'wechat_official':
        return ['整理标题、导语、正文结构和封面图。', `打开${capability.entryTarget}。`, common];
      default:
        return ['复制准备好的正文和说明。', `打开${capability.entryTarget}。`, common];
    }
  }

  switch (platformId) {
    case 'x':
      return [
        'Queue for review in SocialOS.',
        'If live mode + credentials are ready, promote through publisher.',
        common,
      ];
    case 'linkedin':
      return [
        'Review long-form tone and CTA.',
        'If live mode + credentials are ready, promote through publisher.',
        common,
      ];
    case 'instagram':
    case 'xiaohongshu':
    case 'wechat_moments':
      return [
        'Copy caption + hashtag block.',
        `Open ${capability.entryTarget}.`,
        common,
      ];
    case 'wechat_official':
      return [
        'Assemble title, lead, body sections, and cover image.',
        `Open ${capability.entryTarget}.`,
        common,
      ];
    default:
      return [
        'Copy the prepared draft and notes.',
        `Open ${capability.entryTarget}.`,
        common,
      ];
  }
}

function buildPackageSections(platformRule, event, language, options) {
  const localizedContext = buildLocalizedEventContext(event, language);
  const tone = buildNativeTone(platformRule, language, options);
  const angle = buildNativeAngle(platformRule, language, options);
  const audience = buildNativeAudience(platformRule, language, options);
  const requestedCta = readOptionalString(options.cta, '');
  const cta = isTextAlignedWithLanguage(requestedCta, language)
    ? requestedCta
    : buildDefaultCta(platformRule, language);

  const headline = (() => {
    switch (platformRule.id) {
      case 'x':
        return language === 'zh'
          ? `${localizedContext.localizedTitle}，这次我只想说 1 个判断。`
          : `${localizedContext.localizedTitle}: one operator takeaway after shipping this.`;
      case 'linkedin':
        return language === 'zh'
          ? `${localizedContext.localizedTitle}：一次更像系统升级的推进`
          : `${localizedContext.localizedTitle}: an operational upgrade, not just a feature update`;
      case 'instagram':
        return language === 'zh'
          ? `${localizedContext.localizedTitle}，用几张图讲清楚这次推进`
          : `${localizedContext.localizedTitle}, told like a visual build log`;
      case 'zhihu':
        return language === 'zh'
          ? `如果把“${localizedContext.localizedTitle}”讲透，最值得说的是哪几件事？`
          : `What matters most if we unpack ${localizedContext.localizedTitle}?`;
      case 'xiaohongshu':
        return language === 'zh'
          ? `做完「${localizedContext.localizedTitle}」后，我最想提醒大家的 3 件事`
          : `3 practical notes after shipping ${localizedContext.localizedTitle}`;
      case 'wechat_moments':
        return language === 'zh'
          ? `关于「${localizedContext.localizedTitle}」的一个近况`
          : `A quick update on ${localizedContext.localizedTitle}`;
      case 'wechat_official':
        return language === 'zh'
          ? `「${localizedContext.localizedTitle}」：这次推进里最值得复用的方法`
          : `${localizedContext.localizedTitle}: the method worth reusing`;
      default:
        return language === 'zh'
          ? `${formatPlatformLabel(platformRule.id)}更新：${localizedContext.localizedTitle}`
          : `${formatPlatformLabel(platformRule.id)} update: ${localizedContext.localizedTitle}`;
    }
  })();
  const bodyLead =
    language === 'zh'
      ? `这次我想用“${angle}”的角度，面向${audience}分享这次进展。`
      : `Sharing this for ${audience}, framed as ${angle}.`;
  const detailLine = localizedContext.detailLine;
  const contextLead = localizedContext.contextLead;
  const closing =
    language === 'zh'
      ? `整体语气保持${tone}，最后用一句明确 CTA 收口。`
      : `Keep the tone ${tone} and end with a direct CTA.`;

  return {
    headline,
    bodyLead,
    contextLead,
    detailLine,
    closing,
    cta,
    localizedTitle: localizedContext.localizedTitle,
  };
}

function buildDraftContent(platformRule, event, language, options = {}) {
  const sections = buildPackageSections(platformRule, event, language, options);
  const hashtags = buildHashtags(platformRule, language, readOptionalString(options.tone, ''));
  const lines = (() => {
    switch (platformRule.id) {
      case 'x':
        return language === 'zh'
          ? [
              sections.headline,
              sections.contextLead,
              `${sections.detailLine}`,
              '我现在更在意的不是“多做一个页面”，而是让整条 SocialOS 流程真的能跑起来。',
              sections.cta,
              hashtags.slice(0, 4).join(' '),
            ]
          : [
              sections.headline,
              sections.contextLead,
              sections.detailLine,
              'What matters now is not another screen. It is whether the whole SocialOS loop actually operates end to end.',
              sections.cta,
              hashtags.slice(0, 4).join(' '),
            ];
      case 'linkedin':
        return language === 'zh'
          ? [
              sections.headline,
              '',
              sections.contextLead,
              '这轮不是 UI 打磨而已，而是把 Quick Capture、People、Drafts、Queue 和 Self Mirror 真正串起来。',
              `核心信息：${sections.detailLine}`,
              '为什么这很重要：它把“内容写作”变成了“持续运营流程”。',
              `下一步：${sections.cta}`,
              '',
              hashtags.slice(0, 5).join(' '),
            ]
          : [
              sections.headline,
              '',
              sections.contextLead,
              'This was not just a UI refresh. The goal was to make Quick Capture, People, Drafts, Queue, and Self Mirror operate as one workflow.',
              `Context: ${sections.detailLine}`,
              'Why it matters: this turns content writing into an operating loop instead of a pile of drafts.',
              `What next: ${sections.cta}`,
              '',
              hashtags.slice(0, 5).join(' '),
            ];
      case 'instagram':
        return language === 'zh'
          ? [
              sections.headline,
              '',
              sections.contextLead,
              '这次我最想保留下来的，是从一个想法到真正能演示的工作台过程。',
              sections.detailLine,
              '如果你也喜欢看“怎么一步一步做出来”的过程，这组图会比较有代入感。',
              sections.cta,
              '',
              hashtags.join(' '),
            ]
          : [
              sections.headline,
              '',
              sections.contextLead,
              'The part I wanted to keep was the shift from a rough idea to something you can actually demo as a working workspace.',
              sections.detailLine,
              'If you like seeing how something gets built step by step, this package leans into that.',
              sections.cta,
              '',
              hashtags.join(' '),
            ];
      case 'zhihu':
        return language === 'zh'
          ? [
              sections.headline,
              '',
              sections.contextLead,
              '先给结论：如果一个 SocialOS 真的要能用，最重要的不是功能列表，而是录入、检索、生成和发布之间的数据连续性。',
              `围绕「${sections.localizedTitle}」的关键背景是：${sections.detailLine}`,
              '我会重点展开 3 个部分：为什么这样设计、哪些地方卡住、现在怎么让它至少能稳定演示。',
              sections.cta,
              '',
              hashtags.slice(0, 6).join(' '),
            ]
          : [
              sections.headline,
              '',
              sections.contextLead,
              'The short answer: a usable SocialOS depends less on feature count and more on continuity between capture, retrieval, generation, and publishing.',
              `Context: ${sections.detailLine}`,
              'I would unpack the design logic, the real bottlenecks, and how to make the system demo reliably.',
              sections.cta,
              '',
              hashtags.slice(0, 6).join(' '),
            ];
      case 'xiaohongshu':
        return language === 'zh'
          ? [
              sections.headline,
              '',
              sections.contextLead,
              '先说结论：这次最有用的不是“多写几篇内容”，而是把整个内容动作做成了能复用的流程。',
              '1. 录入必须足够轻，不然根本没人会用',
              '2. 每个平台都要有自己的语气和结构，不能一稿平推',
              '3. 最后一定要给到能直接复制粘贴的发布包',
              sections.cta,
              '',
              hashtags.join(' '),
            ]
          : [
              sections.headline,
              '',
              sections.contextLead,
              'Short version: the win was not more content, it was turning the whole motion into a reusable workflow.',
              '1. Capture has to feel light or people stop using it',
              '2. Each platform needs its own voice and structure',
              '3. The last mile has to be a copy-ready publish package',
              sections.cta,
              '',
              hashtags.join(' '),
            ];
      case 'wechat_moments':
        return language === 'zh'
          ? [
              sections.headline,
              sections.contextLead,
              sections.detailLine,
              '这次终于不只是“有个界面”，而是真的把流程跑顺了一些。',
              sections.cta,
            ]
          : [
              sections.headline,
              sections.contextLead,
              sections.detailLine,
              'This finally feels less like a mockup and more like a loop that can actually run.',
              sections.cta,
            ];
      case 'wechat_official':
        return language === 'zh'
          ? [
              sections.headline,
              '',
              '导语',
              `${sections.bodyLead} ${sections.contextLead} ${sections.detailLine}`,
              '',
              '正文结构',
              '一、为什么这次不再只是做页面',
              '二、平台内容为什么必须拆成不同语言和不同风格',
              '三、为什么最后一公里一定要变成可复制的发布动作',
              '',
              `结尾：${sections.cta}`,
            ]
          : [
              sections.headline,
              '',
              'Lead',
              `${sections.bodyLead} ${sections.contextLead} ${sections.detailLine}`,
              '',
              'Body structure',
              '1. Why this can no longer be treated as a UI-only project',
              '2. Why platform-native language and tone matter',
              '3. Why the last mile must turn into copy-ready publishing actions',
              '',
              `Closing: ${sections.cta}`,
            ];
      default:
        return [
          sections.headline,
          '',
          sections.bodyLead,
          sections.contextLead,
          sections.detailLine,
          sections.closing,
          '',
          sections.cta,
          '',
          hashtags.join(' '),
        ];
    }
  })();

  return truncateText(lines.join('\n'), platformRule.maxLength);
}

async function buildDraftContentWithProvider(platformRule, event, language, options = {}) {
  const fallbackContent = buildDraftContent(platformRule, event, language, options);
  const requestedProvider = normalizeModelProvider(readOptionalString(options.provider, MODEL_PROVIDER_AUTO));
  const bountyMode = normalizeBountyMode(options.bountyMode);
  const shouldUseModelGeneration =
    requestedProvider !== MODEL_PROVIDER_AUTO || bountyMode === 'z-ai-general';

  if (!shouldUseModelGeneration) {
    return {
      content: fallbackContent,
      provider: MODEL_PROVIDER_LOCAL,
      model: '',
      fallbackUsed: false,
      reason: 'template-default',
    };
  }

  const providerSelection = resolveRequestedModelProvider({
    requestedProvider,
    bountyMode,
  });
  if (providerSelection.effective === MODEL_PROVIDER_LOCAL) {
    return {
      content: fallbackContent,
      provider: MODEL_PROVIDER_LOCAL,
      model: '',
      fallbackUsed: true,
      reason: providerSelection.reason,
    };
  }

  const prompt = [
    'You are writing one platform-native SocialOS post.',
    'Return compact JSON only.',
    'Schema:',
    '{"content":"","language":"","reasoning":"","cta":""}',
    'Rules:',
    '- Match the requested platform and language.',
    '- Keep the content grounded in the event details and current SocialOS product loop.',
    '- Do not use markdown links, code fences, or HTML.',
    '- Keep the answer publication-ready.',
  ].join('\n');

  const response = await runStructuredModelTask({
    provider: providerSelection.effective,
    systemPrompt: prompt,
    userPayload: {
      platform: platformRule.id,
      platformLabel: formatPlatformLabel(platformRule.id),
      language,
      bountyMode,
      audience: readOptionalString(options.audience, ''),
      tone: readOptionalString(options.tone, ''),
      angle: readOptionalString(options.angle, ''),
      cta: readOptionalString(options.cta, ''),
      event: {
        title: readOptionalString(event.title, ''),
        payload: safeParseJsonObject(event.payload, {}),
      },
      fallbackContent,
    },
    openAiModelEnvKey: 'OPENAI_WORKSPACE_RESPONSE_MODEL',
    openAiModelFallback: 'gpt-5.4',
  });

  const generatedContent = cleanText(response.parsed?.content || response.parsed?.answer || '');
  if (!response.ok || !generatedContent) {
    return {
      content: fallbackContent,
      provider: MODEL_PROVIDER_LOCAL,
      model: '',
      fallbackUsed: true,
      reason: response.error || 'provider-empty',
    };
  }

  return {
    content: truncateText(generatedContent, platformRule.maxLength),
    provider: response.provider,
    model: response.model,
    fallbackUsed: false,
    reason: 'provider-generated',
  };
}

function buildPlatformPackageAdditions(platformRule, event, language, sections) {
  switch (platformRule.id) {
    case 'instagram':
      return language === 'zh'
        ? {
            coverHooks: [
              `${sections.headline}：先给结果感`,
              `把“${sections.localizedTitle}”做成第一屏结论`,
              '用一句反差感标题把人停住',
            ],
            visualStoryboard: [
              '第 1 张：结果/主视觉',
              '第 2 张：背景或问题定义',
              '第 3 张：关键动作或过程截图',
              '第 4 张：下一步 CTA 或评论引导',
            ],
            assetChecklist: ['封面图 1 张', '过程图/截图 2-3 张', '首评文案 1 条'],
            firstComment: `如果你也在推进类似动作，回复“${sections.localizedTitle}”我把版本思路整理给你。`,
          }
        : {
            coverHooks: [
              `${sections.headline} with the result up front`,
              `Open with the clearest proof from ${sections.localizedTitle}`,
              'Use one contrast-led line to stop the scroll',
            ],
            visualStoryboard: [
              'Slide 1: result or hero visual',
              'Slide 2: context or problem setup',
              'Slide 3: process screenshot or proof',
              'Slide 4: CTA / comment prompt',
            ],
            assetChecklist: ['1 cover visual', '2-3 support images/screenshots', '1 first-comment prompt'],
            firstComment: `Reply with "${sections.localizedTitle}" if you want the operator notes behind this post.`,
          };
    case 'xiaohongshu':
      return language === 'zh'
        ? {
            coverHooks: [
              `关于“${sections.localizedTitle}”，我只想先说这 1 件事`,
              `${sections.localizedTitle} 之后，我最想提醒大家的 3 个点`,
              `如果你也在做 ${sections.localizedTitle}，这篇可以少走弯路`,
            ],
            visualStoryboard: [
              '封面：一句结论 + 强信息差',
              '第 2 屏：场景背景与前提',
              '第 3 屏：拆 3 个关键动作',
              '第 4 屏：补充避坑和评论引导',
            ],
            assetChecklist: ['封面标题 3 版', '配图/截图 4-6 张', '评论区追问句 1 条', '收藏导向 CTA 1 条'],
            commentPrompt: '你现在最卡的是哪一步？我可以继续把这个流程拆细。',
          }
        : {
            coverHooks: [
              `One thing I would say first about ${sections.localizedTitle}`,
              `Three takeaways after shipping ${sections.localizedTitle}`,
              `If you are building something similar, this can save a detour`,
            ],
            visualStoryboard: [
              'Cover: one conclusion with a curiosity gap',
              'Card 2: scene and why it matters',
              'Card 3: three concrete moves',
              'Card 4: pitfalls and comment prompt',
            ],
            assetChecklist: ['3 cover-title options', '4-6 visuals/screens', '1 comment prompt', '1 save/share CTA'],
            commentPrompt: 'What part feels hardest right now? I can break the workflow down further.',
          };
    case 'wechat_moments':
      return language === 'zh'
        ? {
            captionVariants: [
              `${sections.headline}。今天最深的感受是：${sections.detailLine}`,
              `刚处理完“${sections.localizedTitle}”，比结果更重要的是过程里的判断。`,
              `关于${sections.localizedTitle}，这次我最想记住的一句是：${sections.bodyLead}`,
            ],
            visualStoryboard: ['首图：结果或现场', '第二张：细节/过程', '第三张：补充说明或截图'],
            assetChecklist: ['手机可读短文案 2-3 版', '图片 3 张以内', '评论区跟进句 1 条'],
          }
        : {
            captionVariants: [
              `${sections.headline}. What stayed with me most: ${sections.detailLine}`,
              `Just wrapped ${sections.localizedTitle}; the judgment calls mattered as much as the result.`,
              `The one line I want to remember from ${sections.localizedTitle}: ${sections.bodyLead}`,
            ],
            visualStoryboard: ['Photo 1: result or scene', 'Photo 2: supporting detail', 'Photo 3: screenshot / proof'],
            assetChecklist: ['2-3 short caption options', 'up to 3 mobile-friendly images', '1 follow-up comment line'],
          };
    case 'wechat_official':
      return language === 'zh'
        ? {
            articleOutline: ['开头：为什么现在写这篇', '中段：3 个关键观察', '结尾：下一步行动与邀请'],
            sectionBullets: [
              `先讲清楚 ${sections.localizedTitle} 的背景与目标`,
              '拆出 3 个可以直接复用的动作',
              '收束到一个明确的行动邀请',
            ],
            coverHooks: [
              `${sections.localizedTitle}：一次值得展开写的推进`,
              `如果把 ${sections.localizedTitle} 讲透，最重要的是这 3 点`,
            ],
            leadParagraph: `${sections.bodyLead} 这不是一条快讯，而是一段值得拆开的过程。`,
          }
        : {
            articleOutline: [
              'Opening: why this matters now',
              'Middle: three concrete observations',
              'Closing: next move and invitation',
            ],
            sectionBullets: [
              `Frame the context and goal behind ${sections.localizedTitle}`,
              'Break out three reusable moves or observations',
              'Close with a single concrete invitation',
            ],
            coverHooks: [
              `${sections.localizedTitle}: the operator story worth unpacking`,
              `If we unpack ${sections.localizedTitle}, these are the three points that matter`,
            ],
            leadParagraph: `${sections.bodyLead} This deserves more than a short post, so the package opens as a narrative.`,
          };
    default:
      return {};
  }
}

function buildPublishPackage(platformRule, event, language, content, options = {}) {
  const capability = localizeCapability(getPlatformCapability(platformRule.id), platformRule.id, language);
  const sections = buildPackageSections(platformRule, event, language, options);
  const hashtags = buildHashtags(platformRule, language, readOptionalString(options.tone, ''));
  const imageIdeas =
    language === 'zh'
      ? [
          `一张能体现“${sections.localizedTitle}”现场感或结果感的主图`,
          '一张细节图或过程图，帮助解释背景',
        ]
      : [
          `A lead image that makes ${sections.localizedTitle} feel tangible`,
          'A supporting detail shot or screenshot for context',
        ];

  const packagePayload = {
    supportLevel: capability.supportLevel,
    lane: capability.lane,
    entryTarget: capability.entryTarget,
    entryUrl: PLATFORM_ENTRY_URLS[platformRule.id] || '',
    liveEligible: capability.liveEligible,
    blockedBy: capability.blockedBy,
    localizedTitle: sections.localizedTitle,
    title: sections.headline,
    hook: sections.bodyLead,
    body: sections.detailLine,
    cta: sections.cta,
    hashtags,
    imageIdeas,
    steps: buildPublishSteps(platformRule.id, capability, language),
    codexAssist:
      language === 'zh'
        ? ['可以继续帮你改语气、改结构、补 CTA、补图文大纲']
        : ['Codex can further refine tone, structure, CTA, and media notes.'],
    preview: content,
    ...buildPlatformPackageAdditions(platformRule, event, language, sections),
  };

  return packagePayload;
}

function readFoundryConfig() {
  const raw = readTextFileOrDefault(FOUNDRY_CONFIG_PATH, '');
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readLastGenericTaskRun() {
  const genericRun = listRecentRunReports(50).find((run) => /^TASK-/u.test(readOptionalString(run?.taskId, '')));
  if (!genericRun) return null;
  return {
    runId: genericRun.runId,
    taskId: genericRun.taskId,
    status: genericRun.status,
    summary: genericRun.summary,
    verify: genericRun.verify,
    finishedAt: genericRun.finishedAt,
  };
}

function buildFoundryTaskCapabilities() {
  return {
    genericTaskExecutionEnabled:
      fs.existsSync(path.join(REPO_ROOT, 'scripts/foundry_generic_task.mjs')) &&
      fs.existsSync(FOUNDRY_RUNTIME_PATHS.tasksDir),
    llmTaskHealth: readLlmTaskHealthSnapshot({ repoRoot: REPO_ROOT }),
    supportedScopes: [...SUPPORTED_TASK_SCOPES],
    lastGenericTaskRun: readLastGenericTaskRun(),
    defaultAutonomyMode: DEFAULT_AUTONOMY_MODE,
  };
}

function buildFoundryClusterSummary() {
  if (ACTIVE_STUDIO) {
    return ACTIVE_STUDIO.getClusterSummary();
  }

  const config = readFoundryConfig();
  const agents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const capabilities = buildFoundryTaskCapabilities();

  return {
    enabled: agents.length > 0,
    configPath: FOUNDRY_CONFIG_PATH,
    dispatchScript: FOUNDRY_DISPATCH_PATH,
    taskDirectory: FOUNDRY_RUNTIME_PATHS.tasksDir,
    genericTaskExecutionEnabled: capabilities.genericTaskExecutionEnabled,
    llmTaskHealth: capabilities.llmTaskHealth,
    supportedScopes: capabilities.supportedScopes,
    lastGenericTaskRun: capabilities.lastGenericTaskRun,
    defaultAutonomyMode: capabilities.defaultAutonomyMode,
    agents: agents.map((agent) => {
      const role = FOUNDRY_AGENT_RESPONSIBILITIES[agent.id] || {
        title: agent.name || agent.id,
        responsibility: 'custom lane',
      };
      return {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        workspace: agent.workspace,
        toolProfile: agent.tools?.profile || 'unknown',
        roleTitle: role.title,
        responsibility: role.responsibility,
      };
    }),
  };
}

function buildCodexLayerSummary() {
  return {
    layer: 'Codex',
    canOwn: [...CODEX_PARTICIPATION.canOwn],
    goodAt: [...CODEX_PARTICIPATION.goodAt],
    stillNeedsHuman: [...CODEX_PARTICIPATION.stillNeedsHuman],
  };
}

function resolveDispatchCommand(body) {
  const command = readOptionalString(body.command, '').toUpperCase();
  if (!command) throw new HttpError(400, 'command is required');

  if (command === 'ADD_TASK') {
    const taskText = readOptionalString(body.taskText ?? body.text, '').replace(/\s+/g, ' ').trim();
    if (!taskText) throw new HttpError(400, 'taskText is required for ADD_TASK');
    return `ADD_TASK:${taskText}`;
  }

  if (command === 'SET_PUBLISH_MODE') {
    const mode = readOptionalString(body.mode, DEFAULT_PUBLISH_MODE).toLowerCase();
    if (mode !== DEFAULT_PUBLISH_MODE && mode !== LIVE_PUBLISH_MODE) {
      throw new HttpError(400, 'mode must be dry-run or live');
    }
    return `SET_PUBLISH_MODE:${mode}`;
  }

  if (
    !new Set([
      'STATUS',
      'RUN_DEVLOOP_ONCE',
      'PAUSE_DEVLOOP',
      'RESUME_DEVLOOP',
      'SEND_DIGEST_NOTIFICATION',
    ]).has(command)
  ) {
    throw new HttpError(400, 'unsupported dispatch command');
  }

  return command;
}

function createOpsTaskFromBody(body) {
  const hasStructuredFields =
    typeof body.goal === 'string' ||
    typeof body.scope === 'string' ||
    typeof body.acceptanceCriteria === 'string' ||
    Array.isArray(body.acceptanceCriteria) ||
    typeof body.constraints === 'string' ||
    Array.isArray(body.constraints) ||
    typeof body.repoTargets === 'string' ||
    Array.isArray(body.repoTargets) ||
    typeof body.preferredTests === 'string' ||
    Array.isArray(body.preferredTests);

  try {
    return createStructuredTask(
      {
        intakeMode: hasStructuredFields ? 'structured' : readOptionalString(body.intakeMode, 'quick'),
        title: body.title,
        goal: body.goal,
        taskText: body.taskText ?? body.text,
        acceptanceCriteria: body.acceptanceCriteria,
        constraints: body.constraints,
        scope: body.scope,
        repoTargets: body.repoTargets,
        preferredTests: body.preferredTests,
      },
      { repoRoot: REPO_ROOT }
    );
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'task creation failed');
  }
}

function getStudioControlPlane() {
  if (!ACTIVE_STUDIO) {
    throw new HttpError(503, 'Studio control plane is unavailable');
  }
  return ACTIVE_STUDIO;
}

function createStudioTaskFromBody(body) {
  const studio = getStudioControlPlane();
  try {
    return studio.createTask({
      taskId: body.taskId,
      title: body.title,
      goal: body.goal,
      taskText: body.taskText ?? body.text,
      acceptanceCriteria: body.acceptanceCriteria,
      constraints: body.constraints,
      scope: body.scope,
      repoTargets: body.repoTargets,
      preferredTests: body.preferredTests,
      priority: body.priority,
      source: 'studio.api',
      metadata: {
        section: readOptionalString(body.section, 'Studio Ops'),
      },
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'studio task creation failed');
  }
}

function runFoundryDispatch(command) {
  try {
    const output = execFileSync('bash', [FOUNDRY_DISPATCH_PATH, command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 180000,
    });
    return {
      ok: true,
      output: output.trim(),
    };
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error ? String(error.stdout || '') : '';
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr || '') : '';
    throw new HttpError(500, 'dispatch command failed', {
      command,
      output: output.trim(),
      stderr: stderr.trim(),
    });
  }
}

function readEnvFlag(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isLiveEnvironmentEnabled() {
  const publishMode = readOptionalString(process.env.PUBLISH_MODE, '').toLowerCase();
  if (publishMode === LIVE_PUBLISH_MODE) return true;
  return readEnvFlag('SOCIALOS_ENABLE_LIVE_PUBLISH');
}

function isHighFrequencyText(value) {
  if (typeof value !== 'string') return false;
  return HIGH_FREQUENCY_MARKERS.has(value.trim().toLowerCase());
}

function readHighFrequencyHint(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

  const tags = Array.isArray(payload.tags) ? payload.tags : [];

  return (
    readOptionalBoolean(payload.highFrequency, false) ||
    isHighFrequencyText(payload.frequency) ||
    isHighFrequencyText(payload.cadence) ||
    isHighFrequencyText(payload.schedule) ||
    tags.some((tag) => isHighFrequencyText(tag))
  );
}

function buildQueueMetadata(body) {
  const highFrequency = readHighFrequencyHint(body);
  const requestedNoDeliver = readOptionalBoolean(body.noDeliver, false);
  const frequency = readOptionalString(body.frequency, highFrequency ? 'high-frequency' : 'normal');
  const cadence = readOptionalString(body.cadence, frequency);

  return {
    source: 'api.publish_queue',
    frequency,
    cadence,
    highFrequency,
    noDeliver: highFrequency || requestedNoDeliver,
  };
}

function resolvePlatformRule(rawPlatform) {
  const requestedPlatform = readOptionalString(rawPlatform, 'x');
  const lookupKey = requestedPlatform.toLowerCase();
  const platformId = PLATFORM_ALIAS_TO_ID.get(lookupKey) || lookupKey;
  const rule = PLATFORM_COMPLIANCE_RULES[platformId];

  if (!rule) {
    throw new HttpError(400, 'unsupported platform', {
      platform: requestedPlatform,
      supportedPlatforms: SUPPORTED_QUEUE_PLATFORMS,
    });
  }

  return {
    ...rule,
    requestedPlatform,
  };
}

function countCharacters(value) {
  return Array.from(value).length;
}

function countHashSymbols(value) {
  const matches = value.match(/#/g);
  return matches ? matches.length : 0;
}

function extractHashtags(value) {
  return Array.from(value.matchAll(/#([\p{L}\p{N}_]{1,64})/gu), (match) => match[1]);
}

function detectForbiddenFormatIssues(content, forbiddenFormats) {
  const issues = [];

  for (const formatId of forbiddenFormats) {
    const rule = FORMAT_RULES[formatId];
    if (!rule) continue;

    if (rule.pattern.test(content)) {
      issues.push({
        code: `format_${formatId}_not_allowed`,
        message: rule.description,
      });
    }
  }

  return issues;
}

function validateQueueContentCompliance(platformRule, content) {
  const characterCount = countCharacters(content);
  const hashtags = extractHashtags(content);
  const hashtagCount = hashtags.length;
  const hashSymbolCount = countHashSymbols(content);

  const issues = [];

  if (characterCount > platformRule.maxLength) {
    issues.push({
      code: 'content_too_long',
      message: `content exceeds ${platformRule.maxLength} characters for ${platformRule.id}`,
    });
  }

  if (hashtagCount > platformRule.maxHashtags) {
    issues.push({
      code: 'hashtag_limit_exceeded',
      message: `hashtag count exceeds ${platformRule.maxHashtags} for ${platformRule.id}`,
    });
  }

  if (hashSymbolCount > hashtagCount) {
    issues.push({
      code: 'hashtag_format_invalid',
      message: 'hashtags must match #<letters|numbers|underscore> without spaces',
    });
  }

  issues.push(...detectForbiddenFormatIssues(content, platformRule.forbiddenFormats));

  return {
    ok: issues.length === 0,
    characterCount,
    hashtagCount,
    issues,
  };
}

function resolveEmbeddingsSettings() {
  const rawProvider = readOptionalString(process.env.EMBEDDINGS_PROVIDER, EMBEDDINGS_PROVIDER_AUTO)
    .toLowerCase();

  const requestedProvider = SUPPORTED_EMBEDDINGS_PROVIDERS.has(rawProvider)
    ? rawProvider
    : EMBEDDINGS_PROVIDER_AUTO;

  const openaiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  const openaiKeyPresent = Boolean(openaiKey);

  let effectiveProvider = requestedProvider;
  if (requestedProvider === EMBEDDINGS_PROVIDER_AUTO) {
    effectiveProvider = openaiKeyPresent ? EMBEDDINGS_PROVIDER_OPENAI : EMBEDDINGS_PROVIDER_LOCAL;
  }

  const semanticBoostEnabled =
    effectiveProvider === EMBEDDINGS_PROVIDER_OPENAI && openaiKeyPresent;

  return {
    requestedProvider,
    effectiveProvider,
    semanticBoostEnabled,
    retrievalMode: semanticBoostEnabled ? 'hybrid-semantic' : 'hybrid-keyword',
    openaiKeyPresent,
    openaiEmbeddingModel: readOptionalString(
      process.env.OPENAI_EMBEDDING_MODEL,
      'text-embedding-3-small'
    ),
    localEmbeddingModel: readOptionalString(process.env.LOCAL_EMBEDDING_MODEL, 'strong'),
  };
}

function normalizeSearchLimit(value, fallback = 8) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, 25);
}

function parseJsonStringArray(value) {
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  } catch {
    return [];
  }
}

function computeKeywordScore(terms, text) {
  if (!terms.length) return 0;
  const matches = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  return matches / terms.length;
}

function buildSearchResultRow(row, terms, embeddingsSettings) {
  const tags = parseJsonStringArray(row.tags);
  const notes = compactNotes(row.notes, 220);
  const haystack = `${row.name} ${notes} ${tags.join(' ')}`.toLowerCase();
  const keywordScore = computeKeywordScore(terms, haystack);
  const evidenceSnippet = terms.find((term) => haystack.includes(term))
    ? truncateText(notes || row.name, 180)
    : truncateText(notes || row.name, 120);

  const semanticScore = embeddingsSettings.semanticBoostEnabled
    ? keywordScore > 0
      ? Math.min(1, keywordScore + Math.min(notes.length / 240, 0.25))
      : 0
    : 0;

  const blendedScore = embeddingsSettings.semanticBoostEnabled
    ? keywordScore * 0.65 + semanticScore * 0.35
    : keywordScore;

  return {
    personId: row.id,
    name: row.name,
    tags,
    notes,
    nextFollowUpAt: row.next_follow_up_at,
    updatedAt: row.updated_at,
    score: Number(blendedScore.toFixed(4)),
    evidenceSnippet,
  };
}

function tokenizeNaturalQuery(value) {
  return cleanText(value)
    .toLowerCase()
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSearchTerms(parts = []) {
  return [...new Set(parts.flatMap((part) => tokenizeNaturalQuery(part)).filter(Boolean))];
}

function hasSearchIntent(value) {
  const source = cleanText(value).toLowerCase();
  return /(?:^|\b)(?:who|find|search|open|show|which|where|look up|recall|the person who|the one from|找|搜索|查一下|查找|打开|看看|哪个|哪位|谁|是谁|那个人|那个做|那个来自|来自.*的人|做.*的人|回忆)(?:\b|$)/u.test(
    source
  );
}

function hasUpdateIntent(value) {
  const source = cleanText(value).toLowerCase();
  return /(?:^|\b)(?:update|edit|change|rename|modify|revise|补充|更新|修改|改一下|改成|补一下|完善)(?:\b|$)/u.test(
    source
  );
}

function hasCreateIntent(value) {
  const source = cleanText(value).toLowerCase();
  return /(?:^|\b)(?:create|add|save|new|log|record|turn .* into|建一个|新建|保存|记录|整理成|变成)(?:\b|$)/u.test(
    source
  );
}

function hasContactCaptureIntent(value) {
  const source = cleanText(value).toLowerCase();
  return /(?:认识了|遇到了|我遇到|met |met at|talked to|聊到|他叫|她叫|有个叫|叫.*的联系人|微信是|linkedin|instagram|x是|x handle|follow up with)/u.test(
    source
  );
}

function hasEventIntent(value) {
  const source = cleanText(value).toLowerCase();
  return /(?:event|meetup|demo day|hackathon|活动|事件|聚会|分享会|meet|recap|follow-up|follow up)/u.test(
    source
  );
}

function extractPlatformHint(value) {
  const source = cleanText(value).toLowerCase();
  const candidates = ['linkedin', 'instagram', 'x', 'wechat', 'zhihu', 'xiaohongshu'];
  return candidates.find((item) => source.includes(item)) || '';
}

function inferPersonSearchAssistFallback(query, captureDraft = null) {
  const source = cleanText(query);
  const lowerSource = source.toLowerCase();
  const personDraft = captureDraft?.personDraft || {};
  const directName = cleanText(personDraft.name || personDraft.displayName || '');
  const quotedName =
    source.match(/[“"'「『]([A-Za-z][A-Za-z .'-]{1,40}|[\u3400-\u9fff]{2,12})[”"'」』]/u)?.[1] || '';
  const explicitName =
    source.match(/(?:叫|named|name is|比如|for example)\s*([A-Za-z][A-Za-z .'-]{1,40}|[\u3400-\u9fff]{2,12})/iu)?.[1] ||
    source.match(/([A-Za-z][A-Za-z .'-]{1,40}|[\u3400-\u9fff]{2,12})\s*(?:他是|她是|做|来自|from)\b/iu)?.[1] ||
    '';
  const placeMatches = [
    ...source.matchAll(/(?:来自|from|in|at)\s*([A-Za-z][A-Za-z .'-]{1,40}|[\u3400-\u9fff]{2,12})/giu),
  ]
    .map((match) => cleanText(match[1] || ''))
    .filter(Boolean);
  const roleMatches = [
    ...source.matchAll(/(?:做|works as|working on|role is|是)\s*([A-Za-z][A-Za-z .'-]{2,40}|[\u3400-\u9fff]{2,18})/giu),
  ]
    .map((match) => cleanText(match[1] || ''))
    .filter(Boolean);
  const topicMatches = [
    ...source.matchAll(/(?:聊|about|on|topic|主题是)\s*([A-Za-z][A-Za-z .'-]{2,40}|[\u3400-\u9fff]{2,18})/giu),
  ]
    .map((match) => cleanText(match[1] || ''))
    .filter(Boolean);
  const handles = [...source.matchAll(/@([a-z0-9_.-]{2,40})/giu)].map((match) => cleanText(match[1] || '')).filter(Boolean);
  const platformHint = extractPlatformHint(query);
  const directNameCandidate = cleanText(directName || quotedName || explicitName);
  return {
    directName: isPlaceholderContactName(directNameCandidate) ? '' : directNameCandidate,
    aliases: [],
    handles,
    roles: roleMatches.slice(0, 3),
    topics: topicMatches.slice(0, 4),
    places: placeMatches.slice(0, 3),
    platforms: platformHint ? [platformHint] : [],
    followUpHint: /(?:follow.?up|next step|follow up|联系|跟进)/iu.test(lowerSource),
    extraction: { method: 'heuristic', model: '' },
  };
}

async function buildPersonSearchAssist({ query, source = 'people-search', captureDraft = null }) {
  const fallback = inferPersonSearchAssistFallback(query, captureDraft);
  if (!shouldUseModelCaptureAssist(source)) {
    return fallback;
  }

  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  const model = readOptionalString(process.env.OPENAI_PEOPLE_SEARCH_MODEL, 'gpt-5.4');
  const cleanedQuery = cleanText(query);
  if (!apiKey || !cleanedQuery) {
    return fallback;
  }

  const prompt = [
    'Extract search hints for finding an existing contact in a relationship workspace.',
    'Do not create or draft a new contact. This is a recall/search task.',
    'Return compact JSON only.',
    'Use these fields:',
    '{"directName":"","aliases":[],"handles":[],"roles":[],"topics":[],"places":[],"platforms":[],"followUpHint":false}',
    'Rules:',
    '- Prefer a real person name when one is implied, even if the user says "比如 sam" or "someone like Sam".',
    '- Generic group words like "很多人", "some people", "团队", "group" must never become a directName.',
    '- Put hometowns, cities, schools, labs, and countries in places.',
    '- Put job titles and roles in roles.',
    '- Put conversation topics and product themes in topics.',
    '- If the user is asking who someone is from a fuzzy description, directName may be empty and the other fields should carry the search intent.',
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: JSON.stringify({
              query: cleanedQuery,
              fallback,
            }),
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return fallback;
    }
    const rawContent = payload?.choices?.[0]?.message?.content;
    const parsed = parseLooseJsonObject(
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((item) =>
                typeof item === 'string'
                  ? item
                  : typeof item?.text === 'string'
                    ? item.text
                    : typeof item?.content === 'string'
                      ? item.content
                      : ''
              )
              .join('\n')
          : ''
    );
    if (!parsed) {
      return fallback;
    }
    const directName = cleanText(parsed.directName || fallback.directName || '');
    return {
      directName: isPlaceholderContactName(directName) ? '' : directName,
      aliases: cleanList(parsed.aliases || fallback.aliases || []).slice(0, 4),
      handles: cleanList(parsed.handles || fallback.handles || []).slice(0, 4),
      roles: cleanList(parsed.roles || fallback.roles || []).slice(0, 4),
      topics: cleanList(parsed.topics || fallback.topics || []).slice(0, 5),
      places: cleanList(parsed.places || fallback.places || []).slice(0, 4),
      platforms: cleanList(parsed.platforms || fallback.platforms || []).slice(0, 4),
      followUpHint: readOptionalBoolean(parsed.followUpHint, fallback.followUpHint),
      extraction: { method: 'model', model },
    };
  } catch {
    return fallback;
  }
}

function buildPersonSearchContext(query, captureDraft = null, searchAssist = null) {
  const personDraft = captureDraft?.personDraft || {};
  const interactionDraft = captureDraft?.interactionDraft || {};
  const directName = cleanText(searchAssist?.directName || personDraft.name || personDraft.displayName || '');
  const tags = cleanList([
    ...(personDraft.tags || []),
    ...(searchAssist?.roles || []),
    ...(searchAssist?.topics || []),
  ]);
  const notes = cleanText(
    [
      personDraft.notes || '',
      interactionDraft.summary || '',
      interactionDraft.evidence || '',
      ...(searchAssist?.places || []),
      ...(searchAssist?.roles || []),
      ...(searchAssist?.topics || []),
    ]
      .filter(Boolean)
      .join(' ')
  );
  const platformHint = extractPlatformHint(query) || cleanList(searchAssist?.platforms || [])[0] || '';
  return {
    query: cleanText(query),
    directName,
    aliases: cleanList(searchAssist?.aliases || []),
    handles: cleanList(searchAssist?.handles || []),
    roles: cleanList(searchAssist?.roles || []),
    topics: cleanList(searchAssist?.topics || []),
    places: cleanList(searchAssist?.places || []),
    tags,
    notes,
    platformHint,
    followUpHint: Boolean(searchAssist?.followUpHint) || /(?:follow.?up|next step|follow up|联系|跟进)/iu.test(query),
    terms: uniqueSearchTerms([
      query,
      directName,
      ...cleanList(searchAssist?.aliases || []),
      ...cleanList(searchAssist?.handles || []),
      ...cleanList(searchAssist?.roles || []),
      ...cleanList(searchAssist?.topics || []),
      ...cleanList(searchAssist?.places || []),
      ...tags,
      notes,
      platformHint,
    ]),
  };
}

function computeRecencyBoost(updatedAt) {
  const timestamp = Date.parse(updatedAt || '');
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 0.2;
  if (ageDays <= 30) return 0.12;
  if (ageDays <= 90) return 0.06;
  return 0;
}

function buildEnhancedPersonSearchResult(statements, row, queryContext, embeddingsSettings) {
  const tags = parseJsonStringArray(row.tags);
  const identities = statements.listIdentitiesByPersonId.all(row.id).map(formatIdentityRow);
  const interactions = statements.listInteractionsByPersonId.all(row.id).slice(0, 6).map(formatInteractionRow);
  const relatedEvents = listRelatedEventsForPerson(statements, row.id).slice(0, 4);
  const notes = compactNotes(row.notes, 220);
  const identityText = identities
    .map((item) => [item.platform, item.handle, item.url, item.note].filter(Boolean).join(' '))
    .join(' ');
  const interactionText = interactions
    .map((item) => [item.summary, item.evidence].filter(Boolean).join(' '))
    .join(' ');
  const relatedEventText = relatedEvents
    .map((event) => [event.title, summarizeEventPayload(event.payload || {})].filter(Boolean).join(' '))
    .join(' ');
  const haystack = cleanText(
    [row.name, notes, tags.join(' '), identityText, interactionText, relatedEventText].filter(Boolean).join(' ')
  ).toLowerCase();
  const identityLower = identityText.toLowerCase();
  const keywordScore = computeKeywordScore(queryContext.terms, haystack);
  const directName = cleanText(queryContext.directName).toLowerCase();
  const normalizedName = cleanText(row.name).toLowerCase();
  const exactNameBoost = directName
    ? normalizedName === directName
      ? 2.8
      : normalizedName.startsWith(directName)
        ? 1.6
        : normalizedName.includes(directName)
          ? 1.05
          : 0
    : 0;
  const platformBoost =
    queryContext.platformHint && identityText.toLowerCase().includes(queryContext.platformHint.toLowerCase()) ? 0.5 : 0;
  const handleBoost =
    (queryContext.directName
      ? identities.some((identity) => cleanText(identity.handle).toLowerCase() === directName.toLowerCase())
      : false) ||
    queryContext.handles.some((handle) => identityLower.includes(cleanText(handle).toLowerCase()))
      ? 1.2
      : 0;
  const aliasBoost = queryContext.aliases.some((alias) => {
    const normalizedAlias = cleanText(alias).toLowerCase();
    return normalizedAlias && (normalizedName.includes(normalizedAlias) || identityLower.includes(normalizedAlias));
  })
    ? 0.9
    : 0;
  const placeBoost = queryContext.places.some((place) => {
    const normalizedPlace = cleanText(place).toLowerCase();
    return normalizedPlace && haystack.includes(normalizedPlace);
  })
    ? 0.55
    : 0;
  const roleBoost = queryContext.roles.some((role) => {
    const normalizedRole = cleanText(role).toLowerCase();
    return normalizedRole && haystack.includes(normalizedRole);
  })
    ? 0.42
    : 0;
  const topicBoost = queryContext.topics.some((topic) => {
    const normalizedTopic = cleanText(topic).toLowerCase();
    return normalizedTopic && haystack.includes(normalizedTopic);
  })
    ? 0.28
    : 0;
  const followUpBoost = queryContext.followUpHint && row.next_follow_up_at ? 0.24 : 0;
  const semanticScore = embeddingsSettings.semanticBoostEnabled
    ? keywordScore > 0
      ? Math.min(1, keywordScore + Math.min(notes.length / 260, 0.2))
      : 0
    : 0;
  const score =
    keywordScore * 1.35 +
    exactNameBoost +
    platformBoost +
    handleBoost +
    aliasBoost +
    placeBoost +
    roleBoost +
    topicBoost +
    followUpBoost +
    computeRecencyBoost(row.updated_at) +
    semanticScore * 0.25;
  const evidenceSource =
    interactions.find((item) =>
      queryContext.terms.some((term) => cleanText(`${item.summary} ${item.evidence}`).toLowerCase().includes(term))
    )?.summary ||
    relatedEvents.find((item) =>
      queryContext.terms.some((term) =>
        cleanText(`${item.title} ${summarizeEventPayload(item.payload || {})}`).toLowerCase().includes(term)
      )
    )?.title ||
    notes ||
    row.name;

  return {
    personId: row.id,
    name: row.name,
    tags,
    notes,
    nextFollowUpAt: row.next_follow_up_at,
    updatedAt: row.updated_at,
    score: Number(score.toFixed(4)),
    evidenceSnippet: truncateText(evidenceSource, 180),
  };
}

function inferEventDraftFallback(query, statements) {
  const source = cleanText(query);
  const existingPeople = statements
    .listAllPeople
    .all()
    .filter(isDisplayablePersonRow)
    .map(formatPersonRow);
  const hintedPerson =
    existingPeople.find((person) => source.toLowerCase().includes(cleanText(person.name).toLowerCase())) || null;
  const likelyCreate = hasCreateIntent(source) || (!hasSearchIntent(source) && hasEventIntent(source));
  const summary = sanitizeEventNarrative(source, hasHanCharacters(source) ? 'zh' : 'en', 220);
  const title = hintedPerson
    ? hasHanCharacters(source)
      ? `和${hintedPerson.name}的后续`
      : `Follow-up with ${hintedPerson.name}`
    : truncateText(summary || source || 'New event', 72);
  return {
    intent: likelyCreate ? 'create' : 'search',
    title,
    summary,
    audience: '',
    languageStrategy: hasHanCharacters(source) ? 'zh' : '',
    tone: hasHanCharacters(source) ? '清晰、自然' : 'clear, warm',
    people: hintedPerson ? [hintedPerson.name] : [],
    links: [],
    assets: [],
  };
}

async function buildEventCommandAssist({ query, source = 'events-command', statements }) {
  const fallback = inferEventDraftFallback(query, statements);
  if (!shouldUseModelCaptureAssist(source)) {
    return { ...fallback, extraction: { method: 'heuristic', model: '' } };
  }

  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  const model = readOptionalString(process.env.OPENAI_EVENT_COMMAND_MODEL, 'gpt-5.4');
  if (!apiKey || !cleanText(query)) {
    return { ...fallback, extraction: { method: 'heuristic', model: '' } };
  }

  const responseSchema = [
    'You are shaping a natural-language event command for a local-first relationship workspace.',
    'Return JSON only.',
    'Choose intent from: search, create, open.',
    'If the user is describing a new event or wants to turn a conversation into an event, choose create.',
    'If the user is trying to find/open an existing event, choose search or open.',
    'Keep fields concise and grounded in the user note.',
    'Schema:',
    '{"intent":"search","title":"","summary":"","audience":"","languageStrategy":"","tone":"","people":[],"links":[],"assets":[]}',
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: responseSchema },
          { role: 'user', content: JSON.stringify({ query: cleanText(query) }) },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ...fallback, extraction: { method: 'heuristic', model: '' } };
    }
    const rawContent = payload?.choices?.[0]?.message?.content;
    const parsed = parseLooseJsonObject(
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((item) =>
                typeof item === 'string'
                  ? item
                  : typeof item?.text === 'string'
                    ? item.text
                    : typeof item?.content === 'string'
                      ? item.content
                      : ''
              )
              .join('\n')
          : ''
    );
    if (!parsed) {
      return { ...fallback, extraction: { method: 'heuristic', model: '' } };
    }
    return {
      ...fallback,
      ...parsed,
      people: cleanList(parsed.people || fallback.people),
      links: normalizeStringList(parsed.links, fallback.links),
      assets: normalizeStringList(parsed.assets, fallback.assets),
      extraction: { method: 'model', model },
    };
  } catch {
    return { ...fallback, extraction: { method: 'heuristic', model: '' } };
  }
}

function buildEventSearchContext(query, eventAssist = {}) {
  return {
    query: cleanText(query),
    directTitle: cleanText(eventAssist.title || ''),
    people: cleanList(eventAssist.people || []),
    audience: cleanText(eventAssist.audience || ''),
    tone: cleanText(eventAssist.tone || ''),
    languageStrategy: cleanText(eventAssist.languageStrategy || ''),
    summary: cleanText(eventAssist.summary || ''),
    terms: uniqueSearchTerms([
      query,
      eventAssist.title || '',
      ...(Array.isArray(eventAssist.people) ? eventAssist.people : []),
      eventAssist.summary || '',
      eventAssist.audience || '',
      eventAssist.tone || '',
      eventAssist.languageStrategy || '',
    ]),
  };
}

function buildEnhancedEventSearchResult(statements, event, queryContext) {
  const relatedPeople = listRelatedPeopleForEvent(statements, event.eventId).slice(0, 5);
  const relatedDrafts = dedupeLatestDrafts(statements.listDraftsByEventId.all(event.eventId).map(formatDraftRow), 5);
  const snippet = truncateText(summarizeEventPayload(event.payload || {}) || event.title, 180);
  const relatedPeopleText = relatedPeople
    .map((person) => [person.name, ...(person.tags || [])].filter(Boolean).join(' '))
    .join(' ');
  const relatedDraftText = relatedDrafts
    .map((draft) => [draft.platformLabel || draft.platform, draft.eventTitle, draft.content].filter(Boolean).join(' '))
    .join(' ');
  const haystack = cleanText(
    [
      event.title,
      event.payload?.audience,
      event.payload?.tone,
      event.payload?.languageStrategy,
      snippet,
      relatedPeopleText,
      relatedDraftText,
    ]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase();
  const keywordScore = computeKeywordScore(queryContext.terms, haystack);
  const directTitle = cleanText(queryContext.directTitle).toLowerCase();
  const eventTitle = cleanText(event.title).toLowerCase();
  const titleBoost = directTitle
    ? eventTitle === directTitle
      ? 2.6
      : eventTitle.startsWith(directTitle)
        ? 1.5
        : eventTitle.includes(directTitle)
          ? 0.95
          : 0
    : 0;
  const peopleBoost = queryContext.people.reduce((boost, personName) => {
    const normalized = cleanText(personName).toLowerCase();
    return boost + (normalized && relatedPeople.some((person) => cleanText(person.name).toLowerCase() === normalized) ? 0.8 : 0);
  }, 0);
  const score = keywordScore * 1.35 + titleBoost + peopleBoost + computeRecencyBoost(event.createdAt);
  return {
    ...event,
    score: Number(score.toFixed(4)),
    snippet,
  };
}

function readTextFileOrDefault(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

export function parseQueueSummary(queueMarkdown) {
  const source = typeof queueMarkdown === 'string' ? queueMarkdown : '';
  const lines = source.split(/\r?\n/u);
  const summary = {
    pending: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    currentTask: null,
  };
  let firstQueuedTask = null;

  for (const line of lines) {
    const taskMatch = line.match(/^\s*-\s+\[([ xX!\-])\]\s+(.+)$/u);
    if (!taskMatch) continue;
    const marker = taskMatch[1];
    const taskText = taskMatch[2].trim();
    const isQueued = marker === ' ' || marker === '-';
    if (isQueued && !firstQueuedTask) firstQueuedTask = taskText;

    if (marker === ' ') summary.pending += 1;
    if (marker === '-') {
      summary.inProgress += 1;
      if (!summary.currentTask) summary.currentTask = taskText;
    }
    if (marker === '!') summary.blocked += 1;
    if (marker === 'x' || marker === 'X') summary.done += 1;
  }

  if (!summary.currentTask) summary.currentTask = firstQueuedTask;
  return summary;
}

export function parseBlockedTasks(queueMarkdown, limit = 20) {
  const source = typeof queueMarkdown === 'string' ? queueMarkdown : '';
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 20;
  if (normalizedLimit === 0) return [];

  const lines = source.split(/\r?\n/u);
  const blocked = [];
  const normalizeBlockedByReason = (value) => {
    const text = cleanText(value);
    if (!text) return '';
    return text.replace(/^blocked by:\s*/iu, '').trim();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-\s+\[!\]\s+(.+)$/u);
    if (!match) continue;
    let blockedBy = '';
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      if (/^##\s+/u.test(next) || /^\s*-\s+\[[ xX!\-]\]\s+/u.test(next)) break;
      const detail = cleanText(next.replace(/^\s*-\s*/u, ''));
      if (detail && /^blocked by:/iu.test(detail)) {
        blockedBy = normalizeBlockedByReason(detail);
        break;
      }
      cursor += 1;
    }
    blocked.push({
      line: index + 1,
      task: match[1].trim(),
      blockedBy,
    });
    if (blocked.length >= normalizedLimit) break;
  }

  return blocked;
}

function normalizeOpsLimit(rawValue, fallback = 10, max = 100) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function listRecentRunReports(limit = 10) {
  if (ACTIVE_STUDIO) {
    return ACTIVE_STUDIO.getRuns(limit);
  }

  let files = [];
  try {
    files = fs
      .readdirSync(RUN_REPORT_DIR)
      .filter((name) => name.endsWith('.json') && !name.endsWith('.planspec.json'))
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }

  const runs = [];
  for (const fileName of files) {
    if (runs.length >= limit) break;
    try {
      const filePath = path.join(RUN_REPORT_DIR, fileName);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      runs.push({
        ...parsed,
        fileName,
      });
    } catch {
      // Ignore malformed run report files so /ops endpoints stay available.
    }
  }
  return runs;
}

function countConsecutiveFailures(runs) {
  let count = 0;
  for (const run of runs) {
    const status = readOptionalString(run?.status, 'unknown').toLowerCase();
    if (status === 'success' || status === 'noop') break;
    count += 1;
  }
  return count;
}

function parseLockMeta() {
  const raw = readTextFileOrDefault(LOCK_META_PATH, '');
  if (!raw) {
    return {
      present: fs.existsSync(LOCK_DIR_PATH),
      ownerPid: null,
      ownerAlive: false,
      heartbeatAgeSec: null,
      runId: null,
      startedAt: null,
    };
  }

  const rows = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const map = new Map();
  for (const row of rows) {
    const index = row.indexOf('=');
    if (index <= 0) continue;
    const key = row.slice(0, index);
    const value = row.slice(index + 1);
    map.set(key, value);
  }

  const ownerPid = Number(map.get('pid'));
  const heartbeatEpoch = Number(map.get('heartbeat_epoch'));
  const nowSec = Math.floor(Date.now() / 1000);
  let ownerAlive = false;

  if (Number.isInteger(ownerPid) && ownerPid > 0) {
    try {
      process.kill(ownerPid, 0);
      ownerAlive = true;
    } catch {
      ownerAlive = false;
    }
  }

  return {
    present: true,
    ownerPid: Number.isInteger(ownerPid) && ownerPid > 0 ? ownerPid : null,
    ownerAlive,
    heartbeatAgeSec:
      Number.isInteger(heartbeatEpoch) && heartbeatEpoch > 0 ? Math.max(0, nowSec - heartbeatEpoch) : null,
    runId: map.get('run_id') || null,
    startedAt: map.get('started_at') || null,
  };
}

function readDigestPreview(maxLines = 6) {
  const raw = readTextFileOrDefault(LATEST_DIGEST_PATH, '').trim();
  if (!raw) return '';
  return raw
    .split(/\r?\n/u)
    .slice(0, maxLines)
    .join('\n');
}

function readMode() {
  if (ACTIVE_STUDIO) {
    return ACTIVE_STUDIO.getPublishMode();
  }

  const override = readTextFileOrDefault(MODE_OVERRIDE_PATH, '').trim().toLowerCase();
  if (override === LIVE_PUBLISH_MODE || override === DEFAULT_PUBLISH_MODE) {
    return override;
  }

  const fromEnv = readOptionalString(process.env.PUBLISH_MODE, DEFAULT_PUBLISH_MODE).toLowerCase();
  return fromEnv === LIVE_PUBLISH_MODE ? LIVE_PUBLISH_MODE : DEFAULT_PUBLISH_MODE;
}

function buildOpsStatus() {
  if (ACTIVE_STUDIO) {
    return ACTIVE_STUDIO.getStatus();
  }

  const queueMarkdown = readTextFileOrDefault(QUEUE_PATH, '');
  const queue = parseQueueSummary(queueMarkdown);
  const blockedTasks = parseBlockedTasks(queueMarkdown, 100);
  const runs = listRecentRunReports(30);
  const latestRun = runs[0] || null;
  const lock = parseLockMeta();
  const paused = fs.existsSync(PAUSE_FLAG_PATH);

  return {
    mode: paused ? 'PAUSED' : 'ACTIVE',
    publishMode: readMode(),
    lock,
    queue: {
      pending: queue.pending,
      inProgress: queue.inProgress,
      blocked: queue.blocked,
      done: queue.done,
      currentTask: queue.currentTask,
    },
    health: {
      consecutiveFailures: countConsecutiveFailures(runs),
      latestRunDurationMs: typeof latestRun?.durationMs === 'number' ? latestRun.durationMs : null,
    },
    latestRun,
    blockedHead: blockedTasks.slice(0, 5),
    latestDigest: readDigestPreview(),
  };
}

function buildHackathonIntegrationStates() {
  const foundry = buildFoundryClusterSummary();
  const ops = buildOpsStatus();

  return {
    openclaw: {
      id: 'openclaw',
      label: 'OpenClaw Runtime',
      configured: Boolean(foundry.enabled),
      status: foundry.enabled ? 'ready' : 'partial',
      summary: foundry.enabled
        ? `${(foundry.agents || []).length} lanes active for orchestrator, memory, compliance, and publishing.`
        : 'Runtime lanes are not available yet.',
      provider: 'openclaw',
      model: '',
      live: Boolean(foundry.enabled),
      fallbackUsed: false,
      route: '/studio?panel=agents',
    },
    workspace: {
      id: 'workspace',
      label: 'Workspace UI',
      configured: true,
      status: 'ready',
      summary: 'Judge-facing capture, memory, drafts, queue, and mirror loop.',
      provider: 'workspace-ui',
      model: '',
      live: true,
      fallbackUsed: false,
      route: '/demo',
    },
    buddy: {
      id: 'buddy',
      label: 'Buddy Guardrails',
      configured: true,
      status: ops.publishMode === DEFAULT_PUBLISH_MODE ? 'ready' : 'warn',
      summary: 'Friendship and gratitude mode keeps the experience narrow and trust-first.',
      provider: 'openclaw',
      model: '',
      live: true,
      fallbackUsed: false,
      route: '/buddy',
    },
    deck: {
      id: 'deck',
      label: 'Pitch Deck',
      configured: true,
      status: 'ready',
      summary: 'Public deck now carries the shared story plus bounty-specific appendix slides.',
      provider: 'deck',
      model: '',
      live: true,
      fallbackUsed: false,
      route: '/deck',
    },
    glm: {
      id: 'glm',
      label: 'Z.AI GLM',
      configured: hasConfiguredGlm(),
      status: hasConfiguredGlm() ? 'ready' : 'pending',
      summary: hasConfiguredGlm()
        ? `Live GLM routing is active for chat and draft generation using ${readOptionalString(process.env.GLM_MODEL_ID, DEFAULT_GLM_MODEL_ID)}.`
        : 'Add GLM_API_KEY to activate live Z.AI routing for Workspace and Drafts.',
      provider: MODEL_PROVIDER_GLM,
      model: hasConfiguredGlm() ? readOptionalString(process.env.GLM_MODEL_ID, DEFAULT_GLM_MODEL_ID) : '',
      live: hasConfiguredGlm(),
      fallbackUsed: !hasConfiguredGlm(),
      route: '/hackathon?bounty=z-ai-general',
    },
    flock: {
      id: 'flock',
      label: 'FLock',
      configured: hasConfiguredFlock(),
      status: hasConfiguredFlock() ? 'ready' : 'pending',
      summary: hasConfiguredFlock()
        ? `Live FLock SDG triage is active using ${readOptionalString(process.env.FLOCK_MODEL_ID, DEFAULT_FLOCK_MODEL_ID)}.`
        : 'Add FLOCK_API_KEY to activate live SDG triage for AI Agents for Good.',
      provider: MODEL_PROVIDER_FLOCK,
      model: hasConfiguredFlock() ? readOptionalString(process.env.FLOCK_MODEL_ID, DEFAULT_FLOCK_MODEL_ID) : '',
      live: hasConfiguredFlock(),
      fallbackUsed: !hasConfiguredFlock(),
      route: '/hackathon?bounty=ai-agents-for-good',
    },
    channels: {
      id: 'channels',
      label: 'Multi-channel Outreach',
      configured: true,
      status: 'ready',
      summary: 'SocialOS already ships outreach lanes for LinkedIn, X, Instagram, Zhihu, Rednote, WeChat Moments, and WeChat Official Account.',
      provider: 'social-channels',
      model: '',
      live: true,
      fallbackUsed: false,
      route: '/drafts',
    },
    telegram: {
      id: 'telegram',
      label: 'Telegram Volunteer Channel',
      configured: hasConfiguredTelegram(),
      status: hasConfiguredTelegram() ? 'ready' : 'pending',
      summary: hasConfiguredTelegram()
        ? `Telegram bot delivery is ready for volunteer follow-through via ${maskTelegramChatId(readTelegramDefaultChatId())}.`
        : 'Add TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHAT_ID to activate the Telegram volunteer channel.',
      provider: 'telegram',
      model: readTelegramBotUsername(),
      live: hasConfiguredTelegram(),
      fallbackUsed: !hasConfiguredTelegram(),
      route: '/hackathon?bounty=ai-agents-for-good',
    },
  };
}

function sortHackathonProofsByCaptureTime(proofs = []) {
  return [...proofs].sort((left, right) => {
    const leftTime = Date.parse(left.capturedAt || left.createdAt || 0);
    const rightTime = Date.parse(right.capturedAt || right.createdAt || 0);
    return rightTime - leftTime;
  });
}

function getBountyById(bountyId = '') {
  const normalized = normalizeBountyMode(bountyId);
  return HACKATHON_BOUNTIES.find((bounty) => bounty.id === normalized) || null;
}

function buildBountyPublicMetadata(bountyId = '') {
  const bounty = getBountyById(bountyId);
  const index = bounty ? HACKATHON_BOUNTIES.findIndex((item) => item.id === bounty.id) : -1;
  return {
    localRecordRoute: bounty?.localRecordRoute || bounty?.route || '/hackathon',
    publicAnchor: buildHackathonPublicAnchor(bounty?.id || bountyId),
    proofJsonUrl: buildHackathonProofJsonPath(bounty?.id || bountyId),
    deckAppendixSlide: index >= 0 ? buildHackathonDeckAppendixSlide(index) : '',
  };
}

function buildProofResponseMetadata(bountyId = '', proofs = []) {
  const bounty = getBountyById(bountyId);
  if (!bounty) return null;
  const integrations = buildHackathonIntegrationStates();
  const liveProof = buildBountyLiveProofMetadata(bounty, integrations, proofs);
  const publicMetadata = buildBountyPublicMetadata(bounty.id);
  return {
    id: bounty.id,
    label: bounty.label,
    sponsor: bounty.sponsor,
    partnerLabel: bounty.partnerLabel,
    localRecordRoute: publicMetadata.localRecordRoute,
    publicAnchor: publicMetadata.publicAnchor,
    proofJsonUrl: publicMetadata.proofJsonUrl,
    deckAppendixSlide: publicMetadata.deckAppendixSlide,
    provider: liveProof.provider,
    model: liveProof.model,
    live: liveProof.live,
    fallbackUsed: liveProof.fallbackUsed,
    capturedAt: liveProof.capturedAt,
  };
}

function buildBountyLiveProofMetadata(bounty, integrations, bountyProofs = []) {
  if (bounty.id === 'ai-agents-for-good') {
    const latestFlock = sortHackathonProofsByCaptureTime(bountyProofs).find(
      (proof) => proof.kind === 'flock' || proof.provider === MODEL_PROVIDER_FLOCK
    );
    const latestTelegram = sortHackathonProofsByCaptureTime(bountyProofs).find(
      (proof) => proof.kind === 'telegram' || proof.channel === 'telegram' || proof.provider === 'telegram'
    );
    const multiChannelSummary =
      latestTelegram && latestTelegram.fallbackUsed === false
        ? 'Live FLock triage and Telegram volunteer handoff are both captured in the public proof pack.'
        : 'Live FLock triage is captured and the product also exposes multi-channel outreach lanes for volunteer follow-through.';

    return {
      provider: readOptionalString(latestFlock?.provider, MODEL_PROVIDER_FLOCK),
      model: readOptionalString(latestFlock?.model, readOptionalString(integrations.flock?.model, '')),
      live: readOptionalBoolean(latestFlock?.live, Boolean(integrations.flock?.live)),
      fallbackUsed: readOptionalBoolean(latestFlock?.fallbackUsed, readOptionalBoolean(integrations.flock?.fallbackUsed, false)),
      capturedAt: readOptionalString(latestFlock?.capturedAt || latestTelegram?.capturedAt, ''),
      liveProofSummary: multiChannelSummary,
    };
  }

  const latestCaptured = sortHackathonProofsByCaptureTime(bountyProofs).find(
    (proof) => proof.provider || proof.model || proof.capturedAt || proof.createdAt
  );

  if (latestCaptured) {
    return {
      provider: readOptionalString(latestCaptured.provider, 'openclaw'),
      model: readOptionalString(latestCaptured.model, ''),
      live: !readOptionalBoolean(latestCaptured.fallbackUsed, false),
      fallbackUsed: readOptionalBoolean(latestCaptured.fallbackUsed, false),
      capturedAt: readOptionalString(latestCaptured.capturedAt || latestCaptured.createdAt, ''),
      liveProofSummary: readOptionalString(latestCaptured.summary, ''),
    };
  }

  if (bounty.id === 'z-ai-general') {
    return {
      provider: MODEL_PROVIDER_GLM,
      model: readOptionalString(integrations.glm?.model, ''),
      live: Boolean(integrations.glm?.live),
      fallbackUsed: readOptionalBoolean(integrations.glm?.fallbackUsed, !integrations.glm?.live),
      capturedAt: '',
      liveProofSummary: readOptionalString(integrations.glm?.summary, ''),
    };
  }

  if (bounty.id === 'ai-agents-for-good') {
    return {
      provider: MODEL_PROVIDER_FLOCK,
      model: readOptionalString(integrations.flock?.model, ''),
      live: Boolean(integrations.flock?.live),
      fallbackUsed: readOptionalBoolean(integrations.flock?.fallbackUsed, !integrations.flock?.live),
      capturedAt: '',
      liveProofSummary: readOptionalString(integrations.flock?.summary, ''),
    };
  }

  return {
    provider: 'openclaw',
    model: '',
    live: true,
    fallbackUsed: false,
    capturedAt: '',
    liveProofSummary: readOptionalString(bounty.integrationSummary, ''),
  };
}

function attachHackathonProofMetadata(proof) {
  const primaryBountyId = normalizeBountyMode((proof.bounties || [])[0] || '');
  const bountyMetadata =
    Array.isArray(proof.bounties) && proof.bounties.length === 1
      ? buildBountyPublicMetadata(primaryBountyId)
      : {
          localRecordRoute: '/hackathon',
          publicAnchor: '/hackathon/',
          proofJsonUrl: buildHackathonProofJsonPath(''),
          deckAppendixSlide: 'Shared appendix',
        };
  return {
    ...proof,
    label: readOptionalString(proof.label, readOptionalString(proof.title, proof.id)),
    bountyId: primaryBountyId,
    localRecordRoute: readOptionalString(proof.localRecordRoute, bountyMetadata.localRecordRoute),
    publicAnchor: readOptionalString(proof.publicAnchor, bountyMetadata.publicAnchor),
    proofJsonUrl: readOptionalString(proof.proofJsonUrl, bountyMetadata.proofJsonUrl),
    deckAppendixSlide: readOptionalString(proof.deckAppendixSlide, bountyMetadata.deckAppendixSlide),
    provider: readOptionalString(proof.provider, ''),
    model: readOptionalString(proof.model, ''),
    channel: readOptionalString(proof.channel, ''),
    transport: readOptionalString(proof.transport, ''),
    openSourceModel:
      typeof proof.openSourceModel === 'boolean'
        ? proof.openSourceModel
        : inferOpenSourceModelFlag(proof.provider, proof.model),
    live: readOptionalBoolean(proof.live, !readOptionalBoolean(proof.fallbackUsed, false)),
    fallbackUsed: readOptionalBoolean(proof.fallbackUsed, false),
    capturedAt: readOptionalString(proof.capturedAt || proof.createdAt, ''),
  };
}

function buildHackathonStaticProofs() {
  const integrations = buildHackathonIntegrationStates();
  const foundry = buildFoundryClusterSummary();
  const ops = buildOpsStatus();

  return [
    attachHackathonProofMetadata({
      id: 'proof-openclaw-runtime',
      kind: 'openclaw',
      status: integrations.openclaw.status,
      title: 'OpenClaw runtime powers the product lanes',
      summary: integrations.openclaw.summary,
      bounties: ['claw-for-human', 'animoca', 'ai-agents-for-good', 'human-for-claw'],
      route: integrations.openclaw.route,
      source: 'socialos/openclaw/runtime.openclaw.json5',
      provider: integrations.openclaw.provider,
      model: integrations.openclaw.model,
      live: integrations.openclaw.live,
      fallbackUsed: integrations.openclaw.fallbackUsed,
      localRecordRoute: '/demo',
    }),
    attachHackathonProofMetadata({
      id: 'proof-workspace-loop',
      kind: 'ui',
      status: 'ready',
      title: 'Judge-ready Workspace loop already exists',
      summary: 'Quick Capture, Contacts, Drafts, Queue, and Mirror already operate inside one loopback-only product surface.',
      bounties: ['claw-for-human', 'animoca', 'z-ai-general'],
      route: '/demo',
      source: 'socialos/apps/web/server.mjs',
      provider: 'workspace-ui',
      model: '',
      live: true,
      fallbackUsed: false,
      localRecordRoute: '/demo',
    }),
    attachHackathonProofMetadata({
      id: 'proof-memory-identity',
      kind: 'memory',
      status: 'ready',
      title: 'Persistent identity and relationship memory are first-class',
      summary: 'Person, Identity, Interaction, Event, SelfCheckin, Mirror, and MirrorEvidence rows already power recall and follow-up.',
      bounties: ['animoca', 'human-for-claw', 'ai-agents-for-good'],
      route: '/people',
      source: 'infra/db/schema.sql',
      provider: 'memory-graph',
      model: '',
      live: true,
      fallbackUsed: false,
      localRecordRoute: '/hackathon?bounty=animoca',
    }),
    attachHackathonProofMetadata({
      id: 'proof-buddy-guardrails',
      kind: 'safety',
      status: ops.publishMode === DEFAULT_PUBLISH_MODE ? 'ready' : 'warn',
      title: 'Buddy mode keeps the experience safe and narrow',
      summary: 'The product stays loopback-only, dry-run by default, and Buddy mode funnels users into four friendly tasks.',
      bounties: ['human-for-claw', 'claw-for-human'],
      route: '/buddy',
      source: 'socialos/apps/web/server.mjs',
      provider: 'openclaw',
      model: '',
      live: true,
      fallbackUsed: false,
      localRecordRoute: '/buddy',
    }),
    attachHackathonProofMetadata({
      id: 'proof-glm-router',
      kind: 'glm',
      status: integrations.glm.status,
      title: 'GLM router is wired into Workspace and Draft generation',
      summary: integrations.glm.summary,
      bounties: ['z-ai-general'],
      route: integrations.glm.route,
      source: 'socialos/apps/api/server.mjs',
      provider: integrations.glm.provider,
      model: integrations.glm.model,
      live: integrations.glm.live,
      fallbackUsed: integrations.glm.fallbackUsed,
      localRecordRoute: '/hackathon?bounty=z-ai-general',
    }),
    attachHackathonProofMetadata({
      id: 'proof-flock-triage',
      kind: 'flock',
      status: integrations.flock.status,
      title: 'FLock SDG triage is ready for impact workflows',
      summary: integrations.flock.summary,
      bounties: ['ai-agents-for-good'],
      route: integrations.flock.route,
      source: 'socialos/apps/api/server.mjs',
      provider: integrations.flock.provider,
      model: integrations.flock.model,
      openSourceModel: true,
      live: integrations.flock.live,
      fallbackUsed: integrations.flock.fallbackUsed,
      localRecordRoute: '/hackathon?bounty=ai-agents-for-good',
    }),
    attachHackathonProofMetadata({
      id: 'proof-social-channels',
      kind: 'multi-channel',
      status: integrations.channels.status,
      title: 'SocialOS already ships multi-channel outreach lanes',
      summary: integrations.channels.summary,
      bounties: ['ai-agents-for-good', 'z-ai-general'],
      route: integrations.channels.route,
      source: 'socialos/apps/api/server.mjs',
      provider: integrations.channels.provider,
      model: integrations.channels.model,
      channel: 'web-workspace + outreach drafts',
      transport: 'http + publish-package',
      live: integrations.channels.live,
      fallbackUsed: integrations.channels.fallbackUsed,
      localRecordRoute: '/hackathon?bounty=ai-agents-for-good',
    }),
    attachHackathonProofMetadata({
      id: 'proof-telegram-channel',
      kind: 'telegram',
      status: integrations.telegram.status,
      title: 'Telegram volunteer handoff is available for impact follow-through',
      summary: integrations.telegram.summary,
      bounties: ['ai-agents-for-good'],
      route: integrations.telegram.route,
      source: 'socialos/apps/api/server.mjs',
      provider: integrations.telegram.provider,
      model: integrations.telegram.model,
      channel: 'telegram',
      transport: 'bot-api',
      live: integrations.telegram.live,
      fallbackUsed: integrations.telegram.fallbackUsed,
      localRecordRoute: '/hackathon?bounty=ai-agents-for-good',
    }),
    attachHackathonProofMetadata({
      id: 'proof-pitch-pack',
      kind: 'deck',
      status: 'ready',
      title: 'Deck and public evidence stay submission-ready',
      summary: `The shared pitch pack stays repo-native, with ${(foundry.agents || []).length || 0} runtime lanes and public evidence snapshots available for judges.`,
      bounties: HACKATHON_BOUNTIES.map((bounty) => bounty.id),
      route: '/deck',
      source: 'socialos/docs/pitch/VC_DECK_SPEC.md',
      provider: 'deck',
      model: '',
      live: true,
      fallbackUsed: false,
      localRecordRoute: '/deck',
    }),
  ];
}

function buildRecentHackathonProofs(statements, limit = 12) {
  if (!statements?.listRecentAudits) return [];

  return statements.listRecentAudits
    .all(limit)
    .filter((row) => /^hackathon_/u.test(readOptionalString(row.action, '')))
    .map((row) => {
      const payload = safeParseJsonObject(row.payload, {});
      const bounty = normalizeBountyMode(payload.bounty);
      const kind = readOptionalString(payload.proofKind, readOptionalString(payload.provider, 'proof'));
      return {
        id: row.id,
        kind,
        status: payload.fallbackUsed ? 'fallback' : 'captured',
        title: readOptionalString(payload.title, `${kind.toUpperCase()} evidence captured`),
        summary: readOptionalString(payload.summary, truncateText(JSON.stringify(payload.output || {}), 200)),
        bounties: bounty ? [bounty] : [],
        route: readOptionalString(payload.route, '/hackathon'),
        source: `Audit ${row.id}`,
        createdAt: row.created_at,
        provider: readOptionalString(payload.provider, ''),
        model: readOptionalString(payload.model, ''),
        channel: readOptionalString(payload.channel, ''),
        transport: readOptionalString(payload.transport, ''),
        openSourceModel:
          typeof payload.openSourceModel === 'boolean'
            ? payload.openSourceModel
            : inferOpenSourceModelFlag(payload.provider, payload.model),
        live: readOptionalBoolean(payload.live, !readOptionalBoolean(payload.fallbackUsed, false)),
        fallbackUsed: readOptionalBoolean(payload.fallbackUsed, false),
        capturedAt: readOptionalString(payload.capturedAt, row.created_at),
      };
    })
    .map((proof) => attachHackathonProofMetadata(proof));
}

function buildHackathonProofCatalog(statements) {
  return [...sortHackathonProofsByCaptureTime(buildRecentHackathonProofs(statements, 16)), ...buildHackathonStaticProofs()];
}

function buildHackathonOverviewPayload(statements) {
  const integrations = buildHackathonIntegrationStates();
  const proofs = buildHackathonProofCatalog(statements);
  const routes = [
    { id: 'demo', label: 'Judge Demo', path: '/demo' },
    { id: 'hackathon', label: 'Hackathon Hub', path: '/hackathon' },
    { id: 'buddy', label: 'Buddy Mode', path: '/buddy' },
    { id: 'deck', label: 'Pitch Deck', path: '/deck' },
  ];

  const bountyCards = HACKATHON_BOUNTIES.map((bounty) => {
    const index = HACKATHON_BOUNTIES.findIndex((item) => item.id === bounty.id);
    const requiredIntegrations = bounty.integrations.map((id) => integrations[id]).filter(Boolean);
    const blockingIntegrations = requiredIntegrations.filter(
      (integration) => !integration.configured && !new Set(['workspace', 'buddy', 'deck']).has(integration.id)
    );
    const bountyProofs = proofs.filter((proof) => proof.bounties.includes(bounty.id));
    const liveProof = buildBountyLiveProofMetadata(bounty, integrations, bountyProofs);
    return {
      ...bounty,
      status: liveProof.fallbackUsed ? 'warn' : blockingIntegrations.length ? 'partial' : 'ready',
      requiredIntegrations,
      proofCount: bountyProofs.length,
      recommendedRoute: bounty.route,
      localRecordRoute: readOptionalString(bounty.localRecordRoute, bounty.route),
      publicAnchor: buildHackathonPublicAnchor(bounty.id),
      proofJsonUrl: buildHackathonProofJsonPath(bounty.id),
      deckAppendixSlide: buildHackathonDeckAppendixSlide(index),
      provider: liveProof.provider,
      model: liveProof.model,
      live: liveProof.live,
      fallbackUsed: liveProof.fallbackUsed,
      capturedAt: liveProof.capturedAt,
      liveProofSummary: liveProof.liveProofSummary,
      proofs: bountyProofs.slice(0, 4),
    };
  });

  return {
    mode: readHackathonMode(),
    generatedAt: nowIso(),
    integrations: Object.values(integrations),
    routes,
    bounties: bountyCards,
    proofsPreview: proofs.slice(0, 8),
  };
}

function recordHackathonEvidence(
  statements,
  {
    action,
    bounty = '',
    provider = '',
    model = '',
    proofKind = '',
    title = '',
    summary = '',
    route = '/hackathon',
    channel = '',
    transport = '',
    openSourceModel,
    input = {},
    output = {},
    live = true,
    fallbackUsed = false,
  }
) {
  const createdAt = nowIso();
  const auditId = makeId('audit');
  const digestId = makeId('digest');
  const normalizedBounty = normalizeBountyMode(bounty);
  const payload = {
    bounty: normalizedBounty,
    provider,
    model,
    proofKind,
    title,
    summary,
    route,
    channel,
    transport,
    openSourceModel:
      typeof openSourceModel === 'boolean' ? openSourceModel : inferOpenSourceModelFlag(provider, model),
    live,
    fallbackUsed,
    capturedAt: createdAt,
    publicAnchor: buildHackathonPublicAnchor(normalizedBounty),
    proofJsonUrl: buildHackathonProofJsonPath(normalizedBounty),
    input,
    output,
  };

  statements.insertAudit.run(auditId, action, JSON.stringify(payload), createdAt);
  statements.insertDigest.run(
    digestId,
    `hackathon:${normalizedBounty || action}`,
    title || action,
    'Capture reusable bounty proof in repo-native evidence surfaces.',
    fallbackUsed ? 'Provider fallback needs attention before judge recording.' : 'Live integration proof captured successfully.',
    `GET /proofs?bounty=${encodeURIComponent(normalizedBounty || '')}`,
    `Open ${route} to present the latest proof.`,
    createdAt
  );

  return { auditId, digestId, createdAt };
}

function normalizeUrgency(value) {
  const normalized = readOptionalString(value, '').toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) return normalized;
  return 'medium';
}

function buildHeuristicSdgTriage(text, { person = null, event = null } = {}) {
  const haystack = cleanText(
    [
      text,
      readOptionalString(person?.name, ''),
      readOptionalString(person?.notes, ''),
      readOptionalString(event?.title, ''),
      typeof event?.payload === 'string' ? event.payload : '',
    ].join(' ')
  ).toLowerCase();

  if (/(clinic|health|wellbeing|mental|care|support group|caregiver)/u.test(haystack)) {
    return {
      sdg: 'SDG 3: Good Health and Well-being',
      urgency: /urgent|asap|today|immediately/u.test(haystack) ? 'high' : 'medium',
      suggestedAction: 'Create a follow-up event, tag the relevant contact, and draft a supportive outreach message within SocialOS.',
      reasoning: 'The request centers on health or wellbeing support, so the impact workflow aligns with SDG 3.',
    };
  }

  if (/(student|school|teach|education|mentor|learning|workshop)/u.test(haystack)) {
    return {
      sdg: 'SDG 4: Quality Education',
      urgency: /deadline|tomorrow|today|urgent/u.test(haystack) ? 'high' : 'medium',
      suggestedAction: 'Capture the learner or volunteer context, create an event, and generate a follow-up pack for coordination.',
      reasoning: 'The request points to mentoring, workshops, or learning access, which maps best to SDG 4.',
    };
  }

  if (/(community|neighbourhood|housing|local|city|volunteer|mutual aid)/u.test(haystack)) {
    return {
      sdg: 'SDG 11: Sustainable Cities and Communities',
      urgency: /urgent|today|shelter/u.test(haystack) ? 'high' : 'medium',
      suggestedAction: 'Use SocialOS to record the organiser network, log the community event, and prepare follow-up drafts for partners.',
      reasoning: 'This looks like local community coordination, which fits SDG 11.',
    };
  }

  if (/(job|creator|income|employment|small business|founder)/u.test(haystack)) {
    return {
      sdg: 'SDG 8: Decent Work and Economic Growth',
      urgency: 'medium',
      suggestedAction: 'Turn the request into a coordination event and generate a clear opportunity-sharing draft package.',
      reasoning: 'The workflow is tied to livelihoods, founder support, or economic participation.',
    };
  }

  return {
    sdg: 'SDG 17: Partnerships for the Goals',
    urgency: /urgent|today|critical/u.test(haystack) ? 'high' : 'medium',
    suggestedAction: 'Create a partnership follow-up event, link the relevant contacts, and keep the next action visible in the queue.',
    reasoning: 'The request is collaborative and multi-party, so partnership coordination is the safest default.',
  };
}

async function buildFlockSdgTriage(statements, { text, personId = '', eventId = '' } = {}) {
  const safeText = cleanText(text || '');
  const capturedAt = nowIso();
  if (!safeText) {
    throw new HttpError(400, 'text is required');
  }

  const person = personId ? statements.selectPersonById.get(personId) : null;
  const event = eventId ? statements.selectEventDetailById.get(eventId) : null;
  if (personId && !person) throw new HttpError(404, 'personId not found');
  if (eventId && !event) throw new HttpError(404, 'eventId not found');

  const fallback = buildHeuristicSdgTriage(safeText, { person, event });
  if (!hasConfiguredFlock()) {
    return {
      ...fallback,
      proof: {
        provider: MODEL_PROVIDER_LOCAL,
        requestedProvider: MODEL_PROVIDER_FLOCK,
        model: '',
        live: false,
        fallbackUsed: true,
        openSourceModel: true,
        reason: 'flock-not-configured',
        capturedAt,
      },
    };
  }

  const prompt = [
    'You are an SDG triage assistant for SocialOS.',
    'Return compact JSON only.',
    'Schema:',
    '{"sdg":"","urgency":"medium","suggestedAction":"","reasoning":"","proofNotes":[]}',
    'Rules:',
    '- Pick the best-fit SDG label.',
    '- Urgency must be one of critical, high, medium, low.',
    '- Keep the suggested action grounded in relationship memory, event creation, and follow-up coordination.',
  ].join('\n');

  const response = await runStructuredModelTask({
    provider: MODEL_PROVIDER_FLOCK,
    systemPrompt: prompt,
    userPayload: {
      text: safeText,
      person: person ? formatPersonRow(person) : null,
      event: event ? formatEventRow(event) : null,
      fallback,
    },
  });

  const triage = response.ok && response.parsed
    ? {
        sdg: readOptionalString(response.parsed.sdg, fallback.sdg),
        urgency: normalizeUrgency(response.parsed.urgency),
        suggestedAction: cleanText(response.parsed.suggestedAction || fallback.suggestedAction),
        reasoning: cleanText(response.parsed.reasoning || fallback.reasoning),
      }
    : fallback;

  return {
    ...triage,
    proof: {
      provider: response.ok ? response.provider : MODEL_PROVIDER_LOCAL,
      requestedProvider: MODEL_PROVIDER_FLOCK,
      model: response.ok ? response.model : '',
      live: response.ok,
      fallbackUsed: !response.ok,
      openSourceModel: true,
      reason: response.ok ? 'flock-generated' : response.error || 'local-fallback',
      capturedAt,
    },
  };
}

function buildLocalGlmFallback(taskType, prompt, context = {}) {
  const normalizedType = readOptionalString(taskType, 'generation').toLowerCase();
  const safePrompt = cleanText(prompt || '');
  const contextText = cleanText(
    typeof context === 'string'
      ? context
      : context && typeof context === 'object' && !Array.isArray(context)
        ? JSON.stringify(context)
        : ''
  );

  if (normalizedType === 'bilingual-summary') {
    return `EN: ${safePrompt || 'SocialOS keeps relationships, drafts, and reflection in one loop.'}\nZH: ${contextText || 'SocialOS 把人脉记忆、内容跟进和反思放进同一条工作流。'}`;
  }

  if (normalizedType === 'reasoning') {
    return `SocialOS should route this through its trust-first loop: capture context, recover the right people/event memory, then produce the smallest next action. ${safePrompt}`.trim();
  }

  if (normalizedType === 'coding') {
    return `Use the existing Workspace -> Event -> Draft -> Queue path first, then layer the bounty-specific provider proof on top. ${safePrompt}`.trim();
  }

  return `SocialOS generation fallback: ${safePrompt || contextText || 'Turn one relationship note into a reusable next action.'}`;
}

async function buildGlmGenerationResult({ taskType = 'generation', prompt = '', context = {}, bountyMode = '' } = {}) {
  const safePrompt = cleanText(prompt || '');
  const capturedAt = nowIso();
  if (!safePrompt) {
    throw new HttpError(400, 'prompt is required');
  }

  const fallbackAnswer = buildLocalGlmFallback(taskType, safePrompt, context);
  if (!hasConfiguredGlm()) {
    return {
      answer: fallbackAnswer,
      proof: {
        provider: MODEL_PROVIDER_LOCAL,
        requestedProvider: MODEL_PROVIDER_GLM,
        model: '',
        live: false,
        fallbackUsed: true,
        reason: 'glm-not-configured',
        capturedAt,
      },
    };
  }

  const response = await runStructuredModelTask({
    provider: MODEL_PROVIDER_GLM,
    systemPrompt: [
      'You are the GLM routing layer inside SocialOS.',
      'Return compact JSON only.',
      'Schema:',
      '{"answer":"","reasoning":"","language":"","proofNotes":[]}',
      'Rules:',
      '- Keep the answer concise and practical.',
      '- Respect the taskType and available context.',
      '- If the taskType is bilingual-summary, include both English and Chinese inside answer.',
    ].join('\n'),
    userPayload: {
      taskType,
      prompt: safePrompt,
      context,
      bountyMode: normalizeBountyMode(bountyMode),
      fallbackAnswer,
    },
    openAiModelEnvKey: 'OPENAI_WORKSPACE_RESPONSE_MODEL',
    openAiModelFallback: 'gpt-5.4',
  });

  return {
    answer: cleanText(response.parsed?.answer || '') || fallbackAnswer,
    proof: {
      provider: response.ok ? response.provider : MODEL_PROVIDER_LOCAL,
      requestedProvider: MODEL_PROVIDER_GLM,
      model: response.ok ? response.model : '',
      live: response.ok,
      fallbackUsed: !response.ok,
      reason: response.ok ? 'glm-generated' : response.error || 'local-fallback',
      capturedAt,
    },
  };
}

async function fetchTelegramBotProfile() {
  const token = readTelegramBotToken();
  if (!token) {
    return {
      ok: false,
      username: readTelegramBotUsername(),
      displayName: '',
      error: 'telegram-not-configured',
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      return {
        ok: false,
        username: readTelegramBotUsername(),
        displayName: '',
        error: readOptionalString(payload?.description, `status ${response.status}`),
      };
    }
    const result = normalizeRecord(payload.result);
    return {
      ok: true,
      username: readOptionalString(result.username, readTelegramBotUsername()),
      displayName: cleanText([readOptionalString(result.first_name, ''), readOptionalString(result.last_name, '')].filter(Boolean).join(' ')),
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      username: readTelegramBotUsername(),
      displayName: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildTelegramStatusPayload(profile = {}) {
  const tokenPresent = Boolean(readTelegramBotToken());
  const defaultChatId = readTelegramDefaultChatId();
  const readyForSend = Boolean(tokenPresent && defaultChatId);
  return {
    channel: 'telegram',
    transport: 'bot-api',
    configured: readyForSend,
    tokenPresent,
    defaultChatIdConfigured: Boolean(defaultChatId),
    defaultChatIdMasked: maskTelegramChatId(defaultChatId),
    webhookSecretConfigured: Boolean(readTelegramWebhookSecret()),
    botUsername: readOptionalString(profile.username, readTelegramBotUsername()),
    botDisplayName: readOptionalString(profile.displayName, ''),
    provider: 'telegram',
    model: readOptionalString(profile.username, readTelegramBotUsername()),
    live: readyForSend && Boolean(profile.ok || !tokenPresent),
    fallbackUsed: !readyForSend,
    openSourceModel: false,
    capturedAt: nowIso(),
    error: readOptionalString(profile.error, ''),
  };
}

function extractTelegramUpdateSummary(update = {}) {
  const message = normalizeRecord(update.message || update.edited_message || update.channel_post || {});
  const chat = normalizeRecord(message.chat);
  const from = normalizeRecord(message.from);
  const text = cleanText(message.text || message.caption || '');
  return {
    messageId: message.message_id || null,
    chatId: readOptionalString(chat.id ? String(chat.id) : '', ''),
    chatType: readOptionalString(chat.type, ''),
    fromName: cleanText(
      [readOptionalString(from.first_name, ''), readOptionalString(from.last_name, '')].filter(Boolean).join(' ')
    ),
    fromUsername: readOptionalString(from.username, ''),
    text,
  };
}

async function sendTelegramMessage({ text, chatId = '' } = {}) {
  const safeText = cleanText(text || '');
  if (!safeText) {
    throw new HttpError(400, 'text is required');
  }

  const token = readTelegramBotToken();
  const targetChatId = readOptionalString(chatId, readTelegramDefaultChatId());
  if (!token || !targetChatId) {
    throw new HttpError(503, 'telegram channel is not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: safeText,
      disable_web_page_preview: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new HttpError(502, 'telegram send failed', {
      error: readOptionalString(payload?.description, `status ${response.status}`),
    });
  }

  const result = normalizeRecord(payload.result);
  return {
    ok: true,
    chatId: readOptionalString(result.chat?.id ? String(result.chat.id) : targetChatId, targetChatId),
    messageId: result.message_id || null,
    text: safeText,
    provider: 'telegram',
    model: readTelegramBotUsername(),
    channel: 'telegram',
    transport: 'bot-api',
    live: true,
    fallbackUsed: false,
    capturedAt: nowIso(),
  };
}

function normalizeOrigin(originHeader) {
  if (typeof originHeader !== 'string') return null;
  const origin = originHeader.trim();
  if (!origin) return null;
  return origin;
}

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function buildCorsAllowlist() {
  const allowlist = new Set([
    `http://localhost:${DEFAULT_WEB_PORT}`,
    `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]);

  const raw = readOptionalString(process.env.SOCIALOS_CORS_ORIGINS, '');
  for (const item of raw.split(',')) {
    const candidate = item.trim();
    if (!candidate) continue;
    if (isLoopbackOrigin(candidate)) allowlist.add(candidate);
  }

  return allowlist;
}

function applyCorsPolicy(req, res, corsAllowlist) {
  const method = req.method || 'GET';
  const origin = normalizeOrigin(req.headers.origin);

  if (!origin) {
    if (method === 'OPTIONS') {
      sendNoContent(res, 204, { allow: 'GET, POST, PATCH, OPTIONS' });
      return { handled: true };
    }
    return { handled: false };
  }

  if (!corsAllowlist.has(origin)) {
    sendJson(res, 403, {
      error: 'origin not allowed',
      details: { origin, policy: 'loopback-allowlist' },
    });
    return { handled: true };
  }

  const requestedHeaders = readOptionalString(
    req.headers['access-control-request-headers'],
    'content-type'
  );
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('access-control-allow-headers', requestedHeaders);
  res.setHeader('access-control-max-age', '600');

  if (method === 'OPTIONS') {
    sendNoContent(res, 204);
    return { handled: true };
  }

  return { handled: false };
}

function inferEnergyFromText(text) {
  return inferEnergyFromTextCore(text);
}

function inferEmotionTags(text) {
  return inferEmotionTagsCore(text);
}

function summarizeMirror(checkins) {
  if (!checkins.length) {
    return 'There is not enough recent check-in data yet. Add at least three Quick Captures before generating a Self Mirror.';
  }

  const avgEnergy =
    checkins.reduce((total, checkin) => total + Number(checkin.energy || 0), 0) / checkins.length;
  const topTags = new Map();
  for (const checkin of checkins) {
    const tags = parseJsonStringArray(checkin.emotions);
    for (const tag of tags) {
      topTags.set(tag, (topTags.get(tag) || 0) + 1);
    }
  }

  const sortedTags = [...topTags.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const evidencePreview = checkins
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${readOptionalString(item.reflection, '').slice(0, 80)}`)
    .join('\n');

  return [
    `Weekly Self Mirror`,
    `- checkins: ${checkins.length}`,
    `- average energy: ${avgEnergy.toFixed(2)} (-2..+2)`,
    `- dominant emotions: ${sortedTags.join(', ') || 'neutral'}`,
    '',
    'Evidence sample:',
    evidencePreview || '1. (no evidence)',
    '',
    'Next experiment:',
    '- Schedule one high-energy outreach block and one recovery block this week.',
  ].join('\n');
}

// Intentional Chinese strings below are limited to Chinese-platform draft generation
// and Chinese-input parsing support. Review-facing UI chrome stays English.

function parseDynamicId(match) {
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function buildFollowUpMessage(person, interactions = []) {
  const topicHint = cleanText(interactions[0]?.summary || person.notes || '').slice(0, 120);
  return topicHint
    ? `Follow up with ${person.name} and anchor the note on: ${topicHint}`
    : `Follow up with ${person.name} while the context is still fresh.`;
}

function searchPeopleMatches(statements, query, limit = 4, captureDraft = null, searchAssist = null) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return [];
  const embeddingsSettings = resolveEmbeddingsSettings();
  const queryContext = buildPersonSearchContext(query, captureDraft, searchAssist);
  return statements.listAllPeople
    .all()
    .filter(isDisplayablePersonRow)
    .map((row) => buildEnhancedPersonSearchResult(statements, row, queryContext, embeddingsSettings))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}

function searchEventMatches(statements, query, limit = 4, eventAssist = null) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return [];
  const queryContext = buildEventSearchContext(query, eventAssist || {});
  return statements.listRecentEvents
    .all(120)
    .map(formatEventRow)
    .map((event) => buildEnhancedEventSearchResult(statements, event, queryContext))
    .filter((event) => event.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, limit);
}

function inferWorkspaceIntent(text, assets = []) {
  const source = cleanText(text).toLowerCase();
  if (!source && assets.length) return 'capture';
  if (/(能量|情绪|状态|self|mirror|最近.*状态|我最近|最近的我|who am i|energy|theme)/u.test(source)) return 'self';
  if (/(找|搜索|search|who|which|who was|the person who|the one from|哪个人|哪位|谁|是谁|那个人|那个做|那个来自|来自.*的人|做.*的人|回忆|记得)/u.test(source)) return 'search';
  if (/(认识|聊了|met|talked to|voice note|名片|business card)/u.test(source)) return 'capture';
  if (/(event|campaign|draft|内容|发布|平台|活动|战役)/u.test(source)) return 'campaign';
  return 'mixed';
}

function prefersChineseWorkspaceReply(text) {
  return /[\u3400-\u9fff]/u.test(cleanText(text));
}

function shouldShowWorkspaceEventSuggestion(intent, text) {
  if (intent === 'campaign') return true;
  const source = cleanText(text).toLowerCase();
  return /(create event|make an event|turn .* into .*event|生成event|生成活动|生成事件|写成内容|生成草稿|出草稿|做内容|发帖|campaign)/u.test(
    source
  );
}

function shouldUseModelWorkspaceAssist(source = 'workspace-chat') {
  return shouldUseModelCaptureAssist(source);
}

function hasWorkspaceContactSignal(captureDraft) {
  const personDraft = captureDraft?.personDraft || {};
  const interactionDraft = captureDraft?.interactionDraft || {};
  return Boolean(
    cleanText(personDraft.name || '') ||
      (cleanText(personDraft.displayName || '') &&
        !isPlaceholderContactName(personDraft.displayName || '')) ||
      cleanList(personDraft.tags || []).length ||
      (Array.isArray(personDraft.identities) && personDraft.identities.length) ||
      cleanText(interactionDraft.summary || '').length >= 18 ||
      cleanText(interactionDraft.evidence || '').length >= 24
  );
}

function isWorkspaceCasualTurn({
  intent,
  text,
  captureDraft,
  relatedPeople,
  relatedEvents,
  relatedDrafts,
  showEventSuggestion,
  hasUntypedVoiceOnly,
}) {
  const source = cleanText(captureDraft?.combinedText || text);
  const personDraft = captureDraft?.personDraft || {};
  const hasStructuredPersonFocus = Boolean(
    cleanText(personDraft.name || '') ||
      ((cleanText(personDraft.displayName || '') &&
        !isPlaceholderContactName(personDraft.displayName || '')) ||
        cleanList(personDraft.tags || []).length ||
        (Array.isArray(personDraft.identities) && personDraft.identities.length))
  );
  if (!source || intent !== 'mixed') return false;
  if (hasSearchIntent(source) || hasCreateIntent(source) || hasContactCaptureIntent(source) || hasEventIntent(source)) {
    return false;
  }
  if (showEventSuggestion || hasUntypedVoiceOnly) return false;
  if (hasStructuredPersonFocus) return false;
  return source.length <= 120;
}

function buildWorkspaceSummary({
  preferredChinese,
  hasUntypedVoiceOnly,
  hasTranscribedAudio,
  intent,
  relatedPeople,
  relatedEvents,
  captureDraft,
  isCasualConversation,
}) {
  const personName = cleanText(captureDraft?.personDraft?.name || '');
  const requiresNameConfirmation = Boolean(captureDraft?.personDraft?.requiresNameConfirmation);
  if (hasUntypedVoiceOnly) {
    return preferredChinese
      ? '我先收到了这段语音，但现在还没有可靠转写，所以先不乱猜。你可以继续补一句文字，或者等转写准备好再发。'
      : 'I have the voice note, but not a reliable transcript yet, so I do not want to guess. You can add a quick text note now or wait for transcription to be ready.';
  }

  if (intent === 'search') {
    if (relatedPeople.length || relatedEvents.length) {
      return preferredChinese
        ? '我先把最像的结果放在前面，你先看这一条对不对；如果方向还不够准，我们再一起收窄。'
        : 'I pulled the strongest match to the front first. If it is close but not quite right, we can narrow it down together.';
    }
    return preferredChinese
      ? '我还没有抓到特别稳的结果。再补一个名字、主题词，或者时间点，我就能更快收窄。'
      : 'I do not have a confident match yet. Add a name, topic, or time clue and I can narrow it down quickly.';
  }

  if (intent === 'campaign') {
    return preferredChinese
      ? '这条更像是要推进内容或事件。我先把下一步收得很轻，只给你最值得开的入口。'
      : 'This reads like an event or content push. I am keeping the next step light and only surfacing the one or two actions that matter.';
  }

  if (hasTranscribedAudio) {
    return preferredChinese
      ? '我已经把语音转进当前对话了。你先顺手看看人名和重点对不对，没问题再保存就行。'
      : 'I folded the voice note into this turn. Take a quick look at the person and the key point, then save it if it feels right.';
  }

  if (isCasualConversation) {
    return preferredChinese
      ? '我先顺着这句话接住，保持正常聊天。真要找人、记事、起草内容的时候，我再往前推一步。'
      : 'I am keeping this as a natural back-and-forth for now. When you want a contact, event, draft, or mirror view, I can bring it in gently.';
  }

  if (requiresNameConfirmation) {
    return preferredChinese
      ? '我先整理出一张联系人草稿，但名字还需要你点一下确认。先把名字改准，再保存会更稳。'
      : 'I drafted the contact for you, but the name still needs a quick confirmation. Edit that first, then save it.';
  }

  if (personName) {
    return preferredChinese
      ? `我先把 ${personName} 整理成了一张联系人草稿。方向对的话就保存；如果还差一点，我们就继续顺着聊。`
      : `I turned ${personName} into a contact draft first. Save it if it looks right, or keep talking and we can refine it together.`;
  }

  return preferredChinese
    ? '我先把这条消息接住，保持正常聊天。真的需要查人、建事件，或者起草内容时，我再往前推一步。'
    : 'I have this turn in context now. We can stay in a natural chat flow, and only branch into contacts, events, drafts, or mirror when it is actually useful.';
}

function buildSuggestedEventPayload(text, draft, relatedPeople = []) {
  const combined = cleanText(draft?.combinedText || text);
  const personName = cleanText(draft?.personDraft?.name || relatedPeople[0]?.name || '');
  const personId = cleanText(draft?.personDraft?.personId || relatedPeople[0]?.personId || '');
  const preferredLanguage = hasHanCharacters(combined) || hasHanCharacters(personName) ? 'zh' : 'en';
  const cleanCombined = sanitizeEventNarrative(combined, preferredLanguage, 280);
  const followUpSuggestion = sanitizeContactDraftText(readOptionalString(draft?.personDraft?.followUpSuggestion, ''));
  const firstSentence = combined.split(/[。！？.!?]/u).map((item) => item.trim()).find(Boolean) || combined;
  const baseTitle =
    personName && !isPlaceholderContactName(personName)
      ? `Follow-up with ${personName}`
      : firstSentence
        ? truncateText(firstSentence, 48)
        : 'New SocialOS event';

  return {
    title: baseTitle,
    audience: draft?.personDraft?.tags?.length
      ? `people interested in ${draft.personDraft.tags.join(', ')}`
      : 'builders, collaborators, future users',
    languageStrategy: 'platform-native',
    tone: 'platform-native',
    payload: {
      focus: 'contact follow-up',
      sourceType: 'workspace-chat',
      personName,
      personId,
      summary: truncateText(cleanCombined || combined, 220),
      combinedText: cleanCombined || truncateText(combined, 280),
      followUpSuggestion,
    },
  };
}

function buildWorkspaceAgentLanes({ intent, draft, relatedPeople, relatedEvents }) {
  return [
    {
      id: 'memory',
      label: 'People Memory Agent',
      status: relatedPeople.length ? 'matched' : draft?.personDraft?.isConfirmedName ? 'drafted' : draft?.personDraft ? 'review' : 'idle',
      summary: relatedPeople.length
        ? `Found ${relatedPeople.length} contact match(es) connected to this message.`
        : draft?.personDraft?.isConfirmedName
          ? `Prepared a contact draft for ${readOptionalString(draft?.personDraft?.name, 'this message')}.`
          : 'Prepared a contact draft that still needs name confirmation before saving.',
    },
    {
      id: 'self',
      label: 'Self Mirror Agent',
      status: draft?.selfCheckinDraft ? 'updated' : 'idle',
      summary: draft?.selfCheckinDraft
        ? `Energy ${draft.selfCheckinDraft.energy} with ${cleanList(draft.selfCheckinDraft.emotions).join(', ') || 'neutral'} signal.`
        : 'No self-signal inferred yet.',
    },
    {
      id: 'campaign',
      label: 'Campaign Agent',
      status: relatedEvents.length ? 'linked' : 'ready',
      summary: relatedEvents.length
        ? `Matched ${relatedEvents.length} event/logbook item(s) you may want to reuse.`
        : 'Event suggestion is ready to turn this chat into a campaign record.',
    },
    {
      id: 'publisher',
      label: 'Publisher Agent',
      status: 'ready',
      summary:
        intent === 'campaign'
          ? 'Platform-native draft generation can start once you confirm or create an event.'
          : 'Publisher stays staged until a chat turn is promoted into an event and drafts are generated.',
    },
  ];
}

function buildPresentationCard(type, options = {}) {
  const badges = Array.isArray(options.badges) ? options.badges.filter(Boolean).slice(0, 4) : [];
  const detailLines = Array.isArray(options.detailLines)
    ? options.detailLines.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
    : [];
  return {
    type,
    kicker: readOptionalString(options.kicker, ''),
    title: readOptionalString(options.title, ''),
    body: readOptionalString(options.body, ''),
    subtitle: readOptionalString(options.subtitle, ''),
    href: readOptionalString(options.href, ''),
    badges,
    detailLines,
  };
}

function buildWorkspaceContactDraftCard(captureDraft) {
  const personDraft = captureDraft?.personDraft || {};
  const interactionDraft = captureDraft?.interactionDraft || {};
  const name = cleanText(personDraft.name || '');
  const displayName = cleanText(personDraft.displayName || '') || name || 'Unconfirmed contact';
  const summary = cleanText(
    personDraft.followUpSuggestion ||
      interactionDraft.summary ||
      interactionDraft.evidence ||
      captureDraft?.combinedText ||
      ''
  );
  if (!name && !summary) return null;
  return buildPresentationCard('contact', {
    kicker: 'Ready to review',
    title: displayName,
    subtitle: personDraft.requiresNameConfirmation ? 'Confirm the name before saving' : 'Ready to review before saving',
    body: truncateText(summary || 'Keep chatting if you want to refine the person and follow-up context.', 200),
    badges: cleanList(personDraft.tags).slice(0, 3),
    detailLines: [
      personDraft.requiresNameConfirmation ? 'Name confirmation required' : '',
      personDraft.nextFollowUpAt ? `Next follow-up: ${personDraft.nextFollowUpAt}` : '',
      cleanText(interactionDraft.summary || '') ? `Context: ${truncateText(interactionDraft.summary, 90)}` : '',
    ],
  });
}

function buildWorkspacePersonMatchCard(person, kicker = 'Memory match') {
  if (!person?.personId) return null;
  return buildPresentationCard('contact', {
    kicker: kicker === 'Memory match' ? 'Best contact fit' : kicker,
    title: person.name || 'Contact',
    body: truncateText(person.evidenceSnippet || person.notes || 'This looks like the closest contact match.', 200),
    href: `/people/${encodeURIComponent(person.personId)}`,
    badges: Array.isArray(person.tags) ? person.tags.slice(0, 3) : [],
    detailLines: [
      person.nextFollowUpAt ? `Next follow-up: ${person.nextFollowUpAt}` : '',
      person.updatedAt ? `Updated: ${person.updatedAt}` : '',
    ],
  });
}

function buildWorkspaceEventCard(event, kicker = 'Related event') {
  if (!event?.eventId) return null;
  return buildPresentationCard('event', {
    kicker,
    title: event.title || 'Event',
    body: truncateText(event.snippet || summarizeEventPayload(event.payload || {}) || 'Open this logbook item for campaign context.', 200),
    href: `/drafts?eventId=${encodeURIComponent(event.eventId)}`,
    badges: [
      readOptionalString(event.payload?.languageStrategy, ''),
      readOptionalString(event.payload?.audience, ''),
    ],
    detailLines: [
      event.createdAt ? `Created: ${event.createdAt}` : '',
    ],
  });
}

function buildWorkspaceSuggestedEventCard(eventSuggestion) {
  if (!eventSuggestion?.title) return null;
  return buildPresentationCard('event', {
    kicker: 'Good next step',
    title: eventSuggestion.title,
    body: truncateText(readOptionalString(eventSuggestion.payload?.summary, ''), 200),
    badges: [
      readOptionalString(eventSuggestion.languageStrategy, ''),
      readOptionalString(eventSuggestion.tone, ''),
    ],
    detailLines: [
      eventSuggestion.audience ? `Audience: ${eventSuggestion.audience}` : '',
    ],
  });
}

function buildWorkspaceDraftCard(draft, kicker = 'Related draft') {
  if (!draft?.draftId) return null;
  return buildPresentationCard('draft', {
    kicker: kicker === 'Related draft' ? 'Draft ready' : kicker,
    title: `${draft.platformShellLabel || draft.platformLabel || draft.platform || 'Draft'} · ${draft.eventTitle || draft.eventId || ''}`.trim(),
    body: truncateText(draft.snippet || draft.content || 'A platform package already exists for this topic.', 200),
    href: `/drafts?eventId=${encodeURIComponent(draft.eventId || '')}`,
    badges: [draft.language, draft.publishPackage?.supportLevel || draft.capability?.supportLevel],
    detailLines: [
      draft.publishPackage?.entryTarget ? `Entry: ${draft.publishPackage.entryTarget}` : '',
    ],
  });
}

function buildWorkspaceMirrorCard(latestMirror, fallback = false) {
  if (!latestMirror?.mirrorId && !fallback) return null;
  if (!latestMirror?.mirrorId && fallback) {
    return buildPresentationCard('mirror', {
      kicker: 'Mirror',
      title: 'Today’s reflection',
      body: 'Open Mirror to review today’s signals and the weekly pattern in one calm place.',
      href: '/self-mirror',
      badges: [],
      detailLines: [],
    });
  }
  return buildPresentationCard('mirror', {
    kicker: 'Mirror',
    title: latestMirror.cadence === 'daily' ? 'Today’s reflection' : 'Weekly reflection',
    body: truncateText(latestMirror.summaryText || latestMirror.content || 'Open the mirror for evidence-backed self patterns.', 200),
    href: '/self-mirror',
    badges: Array.isArray(latestMirror.topThemes)
      ? latestMirror.topThemes.map((item) => item?.theme || '').filter(Boolean).slice(0, 3)
      : [],
    detailLines: [
      latestMirror.createdAt ? `Updated: ${latestMirror.createdAt}` : '',
    ],
  });
}

function dedupePresentationCards(cards, limit = 3) {
  const seen = new Set();
  const output = [];
  for (const card of cards) {
    if (!card?.title) continue;
    const signature = [card.type, card.title, card.href].filter(Boolean).join('::').toLowerCase();
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    output.push(card);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeWorkspacePresentationMode(value, fallback = 'mixed') {
  const normalized = cleanText(value).toLowerCase();
  return ['capture', 'search', 'campaign', 'self', 'mixed'].includes(normalized) ? normalized : fallback;
}

function normalizeWorkspaceCardTarget(value) {
  const normalized = cleanText(value).toLowerCase();
  const aliases = new Map([
    ['contactdraft', 'contactDraft'],
    ['contact-draft', 'contactDraft'],
    ['contact_draft', 'contactDraft'],
    ['contactdraftcard', 'contactDraft'],
    ['contact', 'contact'],
    ['person', 'contact'],
    ['personmatch', 'contact'],
    ['event', 'event'],
    ['relatedevent', 'event'],
    ['suggestedevent', 'suggestedEvent'],
    ['suggested-event', 'suggestedEvent'],
    ['suggested_event', 'suggestedEvent'],
    ['draft', 'draft'],
    ['relateddraft', 'draft'],
    ['mirror', 'mirror'],
    ['selfmirror', 'mirror'],
    ['self-mirror', 'mirror'],
    ['none', 'none'],
  ]);
  return aliases.get(normalized) || '';
}

function normalizeWorkspaceActionId(value) {
  const normalized = cleanText(value).toLowerCase();
  const aliases = new Map([
    ['review-contact', 'review-contact'],
    ['reviewcontact', 'review-contact'],
    ['save-contact', 'review-contact'],
    ['savecontact', 'review-contact'],
    ['open-contact', 'open-contact'],
    ['opencontact', 'open-contact'],
    ['create-event', 'create-event'],
    ['createevent', 'create-event'],
    ['review-drafts', 'review-drafts'],
    ['reviewdrafts', 'review-drafts'],
    ['open-self-mirror', 'open-self-mirror'],
    ['openselfmirror', 'open-self-mirror'],
    ['open-event', 'open-event'],
    ['openevent', 'open-event'],
  ]);
  return aliases.get(normalized) || '';
}

async function buildWorkspaceModelAssist({
  text,
  source,
  provider = MODEL_PROVIDER_AUTO,
  preferredChinese,
  captureDraft,
  relatedPeople,
  relatedEvents,
  relatedDrafts,
  suggestedEvent,
  latestMirror,
  showMemoryAction,
  showEventSuggestion,
  minimalPresentationHint,
}) {
  if (!shouldUseModelWorkspaceAssist(source)) {
    return { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL, plan: null };
  }

  const combinedText = cleanText(captureDraft?.combinedText || text);
  const providerSelection = resolveRequestedModelProvider({ requestedProvider: provider });
  if (!combinedText || providerSelection.effective === MODEL_PROVIDER_LOCAL) {
    return { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL, plan: null };
  }

  const prompt = [
    'You are shaping a response for a local-first relationship and identity workspace.',
    'Return compact JSON only.',
    'Goals:',
    '- Choose the best mode: capture, search, campaign, self, or mixed.',
    '- Write one calm, concise answer in the same language as the user note.',
    '- Choose one primaryTarget and up to three secondaryTargets.',
    '- Choose up to three lightweight actions.',
    '- If the user is describing a newly met person, prioritize the contact draft instead of unrelated memory hits.',
    '- If the user is trying to identify, recall, or search for an existing person or event, do not choose contactDraft unless they explicitly ask to create or update.',
    '- If the user is simply chatting, acknowledging, or continuing the conversation without asking for structure, choose primaryTarget none, no secondaryTargets, and no actions.',
    '- Do not sound like an internal system or a log.',
    'Valid primaryTarget/secondaryTargets values:',
    'contactDraft, contact, event, suggestedEvent, draft, mirror, none',
    'Valid actions:',
    'review-contact, open-contact, create-event, review-drafts, open-self-mirror, open-event',
    'Schema:',
    '{"mode":"capture","answer":"","primaryTarget":"contactDraft","secondaryTargets":[],"actions":[]}',
  ].join('\n');

  const userPayload = {
    language: preferredChinese ? 'zh' : 'en',
    text: combinedText,
    extraction: captureDraft?.extraction || { method: 'heuristic', model: '' },
    contactDraft: {
      name: captureDraft?.personDraft?.name || '',
      displayName: captureDraft?.personDraft?.displayName || '',
      requiresNameConfirmation: Boolean(captureDraft?.personDraft?.requiresNameConfirmation),
      tags: captureDraft?.personDraft?.tags || [],
      notes: captureDraft?.personDraft?.notes || '',
      followUpSuggestion: captureDraft?.personDraft?.followUpSuggestion || '',
    },
    interactionDraft: {
      summary: captureDraft?.interactionDraft?.summary || '',
      evidence: captureDraft?.interactionDraft?.evidence || '',
    },
    selfSignal: {
      energy: captureDraft?.selfCheckinDraft?.energy ?? 0,
      emotions: captureDraft?.selfCheckinDraft?.emotions || [],
    },
    available: {
      relatedPeople: relatedPeople.slice(0, 2).map((person) => ({
        name: person.name,
        tags: person.tags || [],
        snippet: person.evidenceSnippet || person.notes || '',
      })),
      relatedEvents: relatedEvents.slice(0, 2).map((event) => ({
        title: event.title,
        snippet: event.snippet || '',
      })),
      relatedDrafts: relatedDrafts.slice(0, 2).map((draft) => ({
        platform: draft.platformLabel || draft.platform,
        eventTitle: draft.eventTitle || '',
      })),
      latestMirror: latestMirror
        ? {
            summaryText: latestMirror.summaryText || latestMirror.content || '',
            themes: Array.isArray(latestMirror.topThemes)
              ? latestMirror.topThemes.map((item) => item?.theme || '').filter(Boolean)
              : [],
          }
        : null,
      suggestedEvent: suggestedEvent?.title
        ? {
            title: suggestedEvent.title,
            summary: suggestedEvent.payload?.summary || '',
          }
        : null,
    },
    gates: {
      showMemoryAction,
      showEventSuggestion,
      minimalPresentationHint,
    },
  };

  const response = await runStructuredModelTask({
    provider: providerSelection.effective,
    systemPrompt: prompt,
    userPayload,
    openAiModelEnvKey: 'OPENAI_WORKSPACE_RESPONSE_MODEL',
    openAiModelFallback: 'gpt-5.4',
  });

  if (!response.ok || !response.parsed) {
    return { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL, plan: null };
  }

  return {
    method: 'model',
    model: response.model,
    provider: response.provider,
    plan: response.parsed,
  };
}

function buildWorkspacePresentation({
  intent,
  summary,
  captureDraft,
  relatedPeople,
  relatedEvents,
  relatedDrafts,
  suggestedEvent,
  latestMirror,
  showMemoryAction,
  showEventSuggestion,
  modelAssist,
  minimalPresentationHint,
}) {
  const fallbackMode = ['capture', 'search', 'campaign', 'self'].includes(intent) ? intent : 'mixed';
  const draftCard = buildWorkspaceContactDraftCard(captureDraft);
  const personCard = buildWorkspacePersonMatchCard(relatedPeople[0], 'Contact');
  const eventCard = buildWorkspaceEventCard(relatedEvents[0], 'Event');
  const suggestedEventCard = showEventSuggestion ? buildWorkspaceSuggestedEventCard(suggestedEvent) : null;
  const draftResultCard = buildWorkspaceDraftCard(relatedDrafts[0]);
  const mirrorCard = buildWorkspaceMirrorCard(latestMirror, intent === 'self');
  const mode = normalizeWorkspacePresentationMode(modelAssist?.plan?.mode, fallbackMode);
  const allowDraftCard = mode !== 'search';
  const captureCard = allowDraftCard ? draftCard : null;
  const availableCards = {
    contactDraft: captureCard,
    contact: personCard,
    event: eventCard,
    suggestedEvent: suggestedEventCard,
    draft: draftResultCard,
    mirror: mirrorCard,
  };

  let primaryCard = null;
  if (mode === 'capture') {
    primaryCard = captureCard || personCard || suggestedEventCard || mirrorCard;
  } else if (mode === 'search') {
    primaryCard = personCard || eventCard || draftResultCard || mirrorCard;
  } else if (mode === 'campaign') {
    primaryCard = suggestedEventCard || draftResultCard || eventCard || captureCard;
  } else if (mode === 'self') {
    primaryCard = mirrorCard || captureCard || personCard;
  } else {
    primaryCard = captureCard || personCard || suggestedEventCard || draftResultCard || mirrorCard;
  }

  const modelPrimaryTarget = normalizeWorkspaceCardTarget(modelAssist?.plan?.primaryTarget);
  if (modelPrimaryTarget && modelPrimaryTarget !== 'none' && availableCards[modelPrimaryTarget]) {
    primaryCard = availableCards[modelPrimaryTarget];
  } else if (modelPrimaryTarget === 'none') {
    primaryCard = null;
  }

  let secondaryCards = dedupePresentationCards(
    [
      primaryCard === captureCard ? personCard : captureCard,
      primaryCard === personCard ? eventCard : personCard,
      primaryCard === eventCard ? draftResultCard : eventCard,
      primaryCard === suggestedEventCard ? mirrorCard : suggestedEventCard,
      primaryCard === draftResultCard ? mirrorCard : draftResultCard,
      primaryCard === mirrorCard ? personCard : mirrorCard,
    ].filter(Boolean),
    3
  );
  const modelSecondaryTargets = Array.isArray(modelAssist?.plan?.secondaryTargets)
    ? modelAssist.plan.secondaryTargets.map(normalizeWorkspaceCardTarget).filter(Boolean)
    : [];
  if (modelSecondaryTargets.length) {
    secondaryCards = dedupePresentationCards(
      [
        ...modelSecondaryTargets
          .map((target) => availableCards[target])
          .filter((card) => card && card !== primaryCard),
        ...secondaryCards.filter((card) => card && card !== primaryCard),
      ],
      3
    );
  }
  const modelWantsMinimal =
    modelPrimaryTarget === 'none' &&
    modelSecondaryTargets.length === 0 &&
    !(Array.isArray(modelAssist?.plan?.actions) && modelAssist.plan.actions.length);
  const preferMinimalPresentation =
    modelWantsMinimal || (minimalPresentationHint && !modelSecondaryTargets.length && !modelPrimaryTarget);
  if (preferMinimalPresentation) {
    primaryCard = null;
  }

  const availableActions = [];
  if (showMemoryAction && !preferMinimalPresentation) {
    availableActions.push({
      id: 'review-contact',
      kind: 'mutation',
      action: 'review-contact',
      label: captureDraft?.personDraft?.requiresNameConfirmation ? 'Review Contact' : 'Review & Save',
    });
  }
  if (personCard?.href) {
    availableActions.push({ id: 'open-contact', kind: 'link', href: personCard.href, label: 'Open Contact' });
  }
  if (relatedEvents[0]?.eventId) {
    availableActions.push({
      id: 'open-event',
      kind: 'link',
      href: `/events/${encodeURIComponent(relatedEvents[0].eventId)}`,
      label: 'Open Event',
    });
  }
  if (showEventSuggestion && suggestedEvent?.title && !captureDraft?.personDraft?.requiresNameConfirmation) {
    availableActions.push({ id: 'create-event', kind: 'mutation', action: 'create-event', label: 'Create Event' });
  }
  if (draftResultCard?.href) {
    availableActions.push({ id: 'review-drafts', kind: 'link', href: draftResultCard.href, label: 'Review Drafts' });
  }
  if (mirrorCard?.href) {
    availableActions.push({ id: 'open-self-mirror', kind: 'link', href: mirrorCard.href, label: 'Open Self Mirror' });
  }

  let actions = availableActions;
  const modelActionIds = Array.isArray(modelAssist?.plan?.actions)
    ? modelAssist.plan.actions.map(normalizeWorkspaceActionId).filter(Boolean)
    : [];
  if (modelActionIds.length) {
    actions = modelActionIds
      .map((actionId) => availableActions.find((action) => action.id === actionId))
      .filter(Boolean);
  }
  actions = actions
    .filter((action, index, list) => list.findIndex((entry) => entry.id === action.id) === index)
    .slice(0, 3);

  const related = preferMinimalPresentation
    ? { people: [], events: [], drafts: [], mirror: [] }
    : {
        people: dedupePresentationCards(
          relatedPeople
            .slice(0, 3)
            .map((person) => buildWorkspacePersonMatchCard(person, 'Contact')),
          3
        ),
        events: dedupePresentationCards(
          [
            ...relatedEvents.slice(0, 2).map((event) => buildWorkspaceEventCard(event, 'Event')),
            suggestedEventCard,
          ].filter(Boolean),
          3
        ),
        drafts: dedupePresentationCards(
          relatedDrafts.slice(0, 3).map((draft) => buildWorkspaceDraftCard(draft, 'Draft')),
          3
        ),
        mirror: dedupePresentationCards(mirrorCard ? [mirrorCard] : [], 1),
      };

  return {
    mode,
    answer: truncateText(
      readOptionalString(summary, '')
        .split(/\n{2,}/u)
        .map((part) => cleanText(part))
        .filter(Boolean)[0] || '',
      240
    ),
    primaryCard,
    related,
    secondaryCards: preferMinimalPresentation ? [] : dedupePresentationCards(secondaryCards, 3),
    actions: preferMinimalPresentation ? [] : actions,
  };
}

async function buildWorkspaceChatPayload(statements, body = {}) {
  const source = readOptionalString(body.source, 'workspace-chat');
  const text = cleanText(body.text || '');
  const bountyMode = normalizeBountyMode(body.bountyMode);
  const requestedProvider = normalizeModelProvider(
    bountyMode === 'z-ai-general' && !readOptionalString(body.provider, '')
      ? MODEL_PROVIDER_GLM
      : readOptionalString(body.provider, MODEL_PROVIDER_AUTO)
  );
  const providerSelection = resolveRequestedModelProvider({
    requestedProvider,
    bountyMode,
  });
  const assetIds = cleanList(body.assetIds);
  const sourceAssetIds = cleanList(body.sourceAssetIds);
  const visibleAssets = selectCaptureAssetsByIds(statements, assetIds);
  const hiddenSourceAssets = selectCaptureAssetsByIds(statements, sourceAssetIds).filter(
    (asset) => !visibleAssets.some((visibleAsset) => visibleAsset.assetId === asset.assetId)
  );
  const assets = [...visibleAssets, ...hiddenSourceAssets];
  const captureDraft = await buildCaptureDraftWithModelAssist({ text, source, assets, provider: requestedProvider });
  const combinedText = cleanText(captureDraft.combinedText || text);
  const audioAssets = assets.filter((asset) => asset.kind === 'audio');
  const imageAssets = assets.filter((asset) => asset.kind === 'image');
  const hasTranscribedAudio = audioAssets.some((asset) => cleanText(asset.extractedText || asset.previewText));
  const hasUntypedVoiceOnly = !cleanText(text) && audioAssets.length > 0 && !hasTranscribedAudio;
  const intent = inferWorkspaceIntent(combinedText, assets);
  const personSearchAssist = intent === 'search'
    ? providerSelection.effective === MODEL_PROVIDER_GLM
      ? null
      : await buildPersonSearchAssist({ query: combinedText, source: 'workspace-search', captureDraft })
    : null;
  const relatedPeople = searchPeopleMatches(statements, combinedText, 4, captureDraft, personSearchAssist);
  const relatedEvents = searchEventMatches(statements, combinedText, 4);
  const relatedDrafts = searchDraftMatches(statements, combinedText, 3);
  const suggestedEvent = buildSuggestedEventPayload(text, captureDraft, relatedPeople);
  const latestMirrorRow =
    statements.selectLatestMirrorByCadence.get('daily') || statements.selectLatestMirrorByCadence.get('weekly');
  const latestMirror = latestMirrorRow
    ? formatMirrorPayload(latestMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestMirrorRow.id))
    : null;
  const preferredChinese = prefersChineseWorkspaceReply(combinedText);
  const showEventSuggestion = shouldShowWorkspaceEventSuggestion(intent, combinedText);
  const hasContactSignal = hasWorkspaceContactSignal(captureDraft);
  const showMemoryAction =
    intent === 'capture' &&
    hasContactSignal;
  const minimalPresentationHint = isWorkspaceCasualTurn({
    intent,
    text,
    captureDraft,
    relatedPeople,
    relatedEvents,
    relatedDrafts,
    showEventSuggestion,
    hasUntypedVoiceOnly,
  });
  const modelAssist = await buildWorkspaceModelAssist({
    text,
    source,
    provider: requestedProvider,
    preferredChinese,
    captureDraft,
    relatedPeople,
    relatedEvents,
    relatedDrafts,
    suggestedEvent,
    latestMirror: latestMirror
      ? {
          summaryText: latestMirror.summaryText,
          content: latestMirror.content,
          topThemes: Array.isArray(latestMirror.themes) ? latestMirror.themes.slice(0, 3) : [],
        }
      : null,
    showMemoryAction,
    showEventSuggestion,
    minimalPresentationHint,
  });
  const compactPeople = intent === 'search' ? relatedPeople.slice(0, 3) : relatedPeople.slice(0, 1);
  const compactEvents =
    intent === 'search' || showEventSuggestion ? relatedEvents.slice(0, showEventSuggestion ? 2 : 1) : [];
  const coordination = buildWorkspaceAgentLanes({
    intent,
    draft: captureDraft,
    relatedPeople,
    relatedEvents,
  }).map((lane) => ({
    id: lane.id,
    label: lane.label,
    status: lane.status,
  }));

  const transcription = {
    openAiConfigured: Boolean(readOptionalString(process.env.OPENAI_API_KEY, '')),
    audioAssets: audioAssets.length,
    imageAssets: imageAssets.length,
    transcribedAudioAssets: audioAssets.filter((asset) => cleanText(asset.extractedText || asset.previewText)).length,
    needsTranscription: hasUntypedVoiceOnly,
    message: hasUntypedVoiceOnly
      ? 'Voice note received, but no transcript is available yet. Enable browser speech recognition or set OPENAI_API_KEY in .env for automatic transcription.'
      : hasTranscribedAudio
        ? 'Voice note transcribed and merged into the current chat turn.'
        : imageAssets.length
          ? 'Image/card attachment parsed and merged into the current chat turn.'
          : '',
  };

  const summary = buildWorkspaceSummary({
    preferredChinese,
    hasUntypedVoiceOnly,
    hasTranscribedAudio,
    intent,
    relatedPeople,
    relatedEvents,
    captureDraft,
    isCasualConversation: minimalPresentationHint,
  });
  const answer = cleanText(modelAssist?.plan?.answer || '') || summary;

  const presentation = buildWorkspacePresentation({
    intent,
    summary: answer,
    captureDraft,
    relatedPeople,
    relatedEvents,
    relatedDrafts,
    suggestedEvent,
    latestMirror: latestMirror
      ? {
          mirrorId: latestMirror.mirrorId,
          summaryText: latestMirror.summaryText,
          topThemes: Array.isArray(latestMirror.themes) ? latestMirror.themes.slice(0, 3) : [],
          createdAt: latestMirror.createdAt,
          content: latestMirror.content,
        }
      : null,
    showMemoryAction,
    showEventSuggestion,
    modelAssist,
    minimalPresentationHint,
  });
  const evidence = bountyMode
    ? recordHackathonEvidence(statements, {
        action: 'hackathon_workspace_chat',
        bounty: bountyMode,
        provider: modelAssist?.provider || captureDraft?.extraction?.provider || MODEL_PROVIDER_LOCAL,
        model: modelAssist?.model || captureDraft?.extraction?.model || '',
        proofKind: bountyMode === 'z-ai-general' ? 'glm' : 'ui',
        title: 'Workspace hackathon run',
        summary: truncateText(answer, 180),
        route:
          bountyMode === 'human-for-claw'
            ? '/buddy'
            : bountyMode === 'claw-for-human'
              ? '/demo'
              : `/hackathon?bounty=${encodeURIComponent(bountyMode)}`,
        input: {
          text,
          requestedProvider,
        },
        output: {
          intent,
          routing: {
            captureProvider: captureDraft?.extraction?.provider || MODEL_PROVIDER_LOCAL,
            workspaceProvider: modelAssist?.provider || MODEL_PROVIDER_LOCAL,
            captureFallbackUsed: captureDraft?.extraction?.provider === MODEL_PROVIDER_LOCAL,
            workspaceFallbackUsed:
              modelAssist?.provider === MODEL_PROVIDER_LOCAL || providerSelection.fallbackUsed,
          },
        },
        live:
          modelAssist?.provider !== MODEL_PROVIDER_LOCAL && !providerSelection.fallbackUsed,
        fallbackUsed:
          modelAssist?.provider === MODEL_PROVIDER_LOCAL || providerSelection.fallbackUsed,
      })
    : null;

  return {
    responseId: makeId('workspace'),
    intent,
    bountyMode,
    summary: answer,
    presentation,
    text,
    assets,
    captureDraft,
    extraction:
      (intent === 'search' ? personSearchAssist?.extraction : null) ||
      captureDraft.extraction ||
      { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL },
    relatedPeople,
    relatedEvents,
    relatedDrafts,
    related: presentation.related,
    suggestedEvent,
    ui: {
      showMemoryAction,
      showEventSuggestion,
      people: compactPeople,
      events: compactEvents,
      coordination,
    },
    modelRouting: {
      requestedProvider,
      effectiveProvider: modelAssist?.provider || captureDraft?.extraction?.provider || MODEL_PROVIDER_LOCAL,
      captureProvider: captureDraft?.extraction?.provider || MODEL_PROVIDER_LOCAL,
      workspaceProvider: modelAssist?.provider || MODEL_PROVIDER_LOCAL,
      captureModel: captureDraft?.extraction?.model || '',
      workspaceModel: modelAssist?.model || '',
      captureFallbackUsed: captureDraft?.extraction?.provider === MODEL_PROVIDER_LOCAL,
      workspaceFallbackUsed:
        modelAssist?.provider === MODEL_PROVIDER_LOCAL || providerSelection.fallbackUsed,
      fallbackUsed: modelAssist?.provider === MODEL_PROVIDER_LOCAL || providerSelection.fallbackUsed,
      reason: providerSelection.reason,
    },
    proofs: [
      {
        id: 'workspace-routing',
        bountyMode: bountyMode || 'core',
        provider: modelAssist?.provider || captureDraft?.extraction?.provider || MODEL_PROVIDER_LOCAL,
        summary:
          bountyMode === 'z-ai-general'
            ? 'Workspace routing is ready for GLM-backed capture and answer shaping.'
            : 'Workspace routing stays aligned to the hackathon mode and available providers.',
      },
    ],
    commitPayload: {
      text,
      source,
      assetIds: [...new Set([...assetIds, ...sourceAssetIds])],
      combinedText: captureDraft.combinedText,
      personDraft: captureDraft.personDraft,
      selfCheckinDraft: captureDraft.selfCheckinDraft,
      interactionDraft: captureDraft.interactionDraft,
      provider: requestedProvider,
      bountyMode,
    },
    recommendedDraftRequest: {
      platforms: [...SUPPORTED_QUEUE_PLATFORMS],
      languages: ['platform-native'],
      cta: '',
      provider: requestedProvider,
      bountyMode,
    },
    transcription,
    agentLanes: buildWorkspaceAgentLanes({
      intent,
      draft: captureDraft,
      relatedPeople,
      relatedEvents,
    }),
    latestMirror: latestMirror
      ? {
          mirrorId: latestMirror.mirrorId,
          summaryText: latestMirror.summaryText,
          topThemes: Array.isArray(latestMirror.themes) ? latestMirror.themes.slice(0, 3) : [],
        }
      : null,
    auditId: evidence?.auditId || '',
    digestId: evidence?.digestId || '',
  };
}

function shouldOpenPeopleSearchMatch(result, queryContext) {
  if (!result?.personId) return false;
  const directName = cleanText(queryContext?.directName || '').toLowerCase();
  if (directName && cleanText(result.name).toLowerCase() === directName) return true;
  return Number(result.score || 0) >= 2.6;
}

function shouldOpenEventSearchMatch(result, queryContext) {
  if (!result?.eventId) return false;
  const directTitle = cleanText(queryContext?.directTitle || '').toLowerCase();
  if (directTitle && cleanText(result.title).toLowerCase() === directTitle) return true;
  return Number(result.score || 0) >= 2.4;
}

function buildEventCommandDraftCard(reviewDraft) {
  if (!reviewDraft?.title && !reviewDraft?.summary) return null;
  return buildPresentationCard('event', {
    kicker: 'Ready to review',
    title: reviewDraft.title || 'Event draft',
    subtitle: 'Review before saving',
    body: truncateText(reviewDraft.summary || 'Keep refining the event before you save it into the logbook.', 200),
    badges: [reviewDraft.audience, reviewDraft.languageStrategy].filter(Boolean),
    detailLines: [reviewDraft.tone ? `Tone: ${reviewDraft.tone}` : ''],
  });
}

async function buildPeopleCommandPayload(statements, query, source = 'people-command') {
  const cleanedQuery = cleanText(query);
  const captureDraft = await buildCaptureDraftWithModelAssist({ text: cleanedQuery, source });
  const personSearchAssist = await buildPersonSearchAssist({ query: cleanedQuery, source, captureDraft });
  const mutationIntent =
    !hasSearchIntent(cleanedQuery) &&
    (hasCreateIntent(cleanedQuery) || hasUpdateIntent(cleanedQuery) || hasContactCaptureIntent(cleanedQuery));
  const queryContext = buildPersonSearchContext(cleanedQuery, mutationIntent ? captureDraft : null, personSearchAssist);
  const results = searchPeopleMatches(
    statements,
    cleanedQuery,
    8,
    mutationIntent ? captureDraft : null,
    personSearchAssist
  );
  const matchedExistingPerson =
    cleanText(captureDraft?.personDraft?.name || '')
      ? findExistingPersonByName(statements, captureDraft.personDraft.name)
      : null;
  const matchedExistingDetail = matchedExistingPerson
    ? buildPeopleDetailPayload(statements, matchedExistingPerson.id)
    : null;
  const primaryCard = mutationIntent
    ? buildWorkspaceContactDraftCard(captureDraft) || buildWorkspacePersonMatchCard(results[0], 'Contact')
    : buildWorkspacePersonMatchCard(results[0], 'Contact');
  const relatedEvents = matchedExistingDetail?.relatedEvents || [];
  const answer = mutationIntent
    ? matchedExistingPerson
      ? `I pulled ${matchedExistingPerson.name} into review so you can update the contact before saving.`
      : cleanText(captureDraft?.personDraft?.displayName || captureDraft?.personDraft?.name)
        ? `I turned that into a contact draft first so you can review it before saving.`
        : 'I drafted the contact as far as I safely could. Confirm the key details before saving.'
    : results.length
      ? `I put the clearest contact match first so you can confirm it quickly.`
      : 'I do not have a confident contact yet. Add one sharper clue like a name, handle, place, or topic.';

  return {
    query: cleanedQuery,
    intent: mutationIntent ? (matchedExistingPerson ? 'update' : 'review') : 'search',
    answer,
    extraction:
      (mutationIntent ? captureDraft.extraction : personSearchAssist?.extraction) ||
      captureDraft.extraction ||
      { method: 'heuristic', model: '' },
    presentation: {
      answer,
      primaryCard,
      related: {
        people: mutationIntent
          ? results
              .filter((item) => item.personId !== matchedExistingPerson?.id)
              .slice(0, 3)
              .map((item) => buildWorkspacePersonMatchCard(item, 'Related contact'))
          : results.slice(1, 4).map((item) => buildWorkspacePersonMatchCard(item, 'Related contact')),
        events: relatedEvents.slice(0, 3).map((event) => buildWorkspaceEventCard(event, 'Related event')),
        drafts: [],
        mirror: [],
      },
      actions: mutationIntent
        ? [{ id: 'review-contact', kind: 'mutation', action: 'review-contact', label: matchedExistingPerson ? 'Review update' : 'Review contact' }]
        : results[0]?.personId
          ? [{ id: 'open-contact', kind: 'link', href: `/people/${encodeURIComponent(results[0].personId)}`, label: 'Open Contact' }]
          : [],
    },
    results,
    reviewDraft: mutationIntent
      ? {
          captureDraft,
          matchedPersonId: matchedExistingPerson?.id || '',
          matchedPerson: matchedExistingDetail?.person || null,
        }
      : null,
    openMatchId: !mutationIntent && shouldOpenPeopleSearchMatch(results[0], queryContext) ? results[0].personId : '',
  };
}

async function buildEventsCommandPayload(statements, query, source = 'events-command') {
  const cleanedQuery = cleanText(query);
  const eventAssist = await buildEventCommandAssist({ query: cleanedQuery, source, statements });
  const queryContext = buildEventSearchContext(cleanedQuery, eventAssist);
  const results = searchEventMatches(statements, cleanedQuery, 8, eventAssist);
  const mutationIntent =
    eventAssist.intent === 'create' ||
    (!hasSearchIntent(cleanedQuery) && (hasCreateIntent(cleanedQuery) || hasEventIntent(cleanedQuery)));
  const openMatchId = !mutationIntent && shouldOpenEventSearchMatch(results[0], queryContext) ? results[0].eventId : '';
  const primaryCard = mutationIntent
    ? buildEventCommandDraftCard(eventAssist)
    : buildWorkspaceEventCard(results[0], 'Event');
  const primaryEventDetail = openMatchId ? buildEventDetailPayload(statements, openMatchId) : null;
  const linkedPeople = cleanList(eventAssist.people || [])
    .map((name) => findExistingPersonByName(statements, name))
    .filter(Boolean)
    .map((row) => formatPersonRow(row));
  const answer = mutationIntent
    ? `I drafted the event first so you can review it before it lands in the logbook.`
    : results.length
      ? `I brought the clearest event match forward so you can open it quickly.`
      : 'I do not have a confident event yet. Add a person, place, time clue, or topic and I can narrow it down.';

  return {
    query: cleanedQuery,
    intent: mutationIntent ? 'review' : openMatchId ? 'open' : 'search',
    answer,
    extraction: eventAssist.extraction || { method: 'heuristic', model: '' },
    presentation: {
      answer,
      primaryCard,
      related: {
        people: mutationIntent
          ? linkedPeople.slice(0, 3).map((person) => buildWorkspacePersonMatchCard(person, 'Related person'))
          : (primaryEventDetail?.relatedPeople || []).slice(0, 3).map((person) => buildWorkspacePersonMatchCard(person, 'Related person')),
        events: mutationIntent
          ? results.slice(0, 3).map((event) => buildWorkspaceEventCard(event, 'Related event'))
          : results.slice(1, 4).map((event) => buildWorkspaceEventCard(event, 'Related event')),
        drafts: (primaryEventDetail?.relatedDrafts || []).slice(0, 3).map((draft) => buildWorkspaceDraftCard(draft, 'Related draft')),
        mirror: [],
      },
      actions: mutationIntent
        ? []
        : openMatchId
          ? [{ id: 'open-event', kind: 'link', href: `/events/${encodeURIComponent(openMatchId)}`, label: 'Open Event' }]
          : [],
    },
    results,
    reviewDraft: mutationIntent
      ? {
          title: eventAssist.title || '',
          audience: eventAssist.audience || '',
          languageStrategy: eventAssist.languageStrategy || '',
          tone: eventAssist.tone || '',
          links: normalizeStringList(eventAssist.links),
          assets: normalizeStringList(eventAssist.assets),
          relatedPeople: linkedPeople.map((person) => person.personId),
          personName: cleanList(eventAssist.people || [])[0] || '',
          payload: {
            details: {
              summary: eventAssist.summary || '',
              personName: cleanList(eventAssist.people || [])[0] || '',
            },
          },
        }
      : null,
    openMatchId,
  };
}

function toTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNoiseCheckinRow(row) {
  const triggerText = cleanText(row?.trigger_text || row?.triggerText || '').toLowerCase();
  const reflection = cleanText(row?.reflection || '').toLowerCase();
  return (
    triggerText.includes('weekly_mirror_smoke') ||
    triggerText.includes('product_workspace_smoke') ||
    reflection.includes('weekly_mirror_smoke') ||
    reflection.includes('product workspace smoke')
  );
}

function isLikelySelfReflection(row) {
  const reflection = cleanText(row?.reflection || '');
  if (!reflection) return false;

  const lowered = reflection.toLowerCase();
  const emotions = Array.isArray(row?.emotions) ? row.emotions : parseJsonStringArray(row?.emotions);
  const energy = Number(row?.energy || 0);
  const normalizedEmotions = emotions.map((item) => cleanText(item).toLowerCase()).filter(Boolean);
  const hasMeaningfulEmotion = normalizedEmotions.some(
    (emotion) => !['neutral', 'social', 'general'].includes(emotion)
  );

  if (energy !== 0 || hasMeaningfulEmotion) return true;

  if (/[?？]/u.test(reflection)) return false;

  if (
    /(联系人|认识了|遇到了|见到了|叫.+联系人|wechat|微信是|小红书|linkedin|model|大模型|event|草稿|draft)/iu.test(
      reflection
    ) &&
    !/(我觉得|我当时|我有点|我很|我想|让我|心里|情绪|能量|压力|兴奋|开心|疲惫|累|焦虑|紧张|放松|恢复|耗电|充电|很棒|还不错|有点空|脑子很亮)/iu.test(
      reflection
    )
  ) {
    return false;
  }

  return /(我觉得|我当时|我有点|我很|我想|让我|心里|情绪|能量|压力|兴奋|开心|疲惫|累|焦虑|紧张|放松|恢复|耗电|充电|很棒|还不错|有点空|energized|excited|tired|stretched|drained|overwhelmed|calm|neutral)/iu.test(
    lowered
  );
}

function normalizeCheckinRow(row) {
  const reflection = sanitizeContactDraftText(readOptionalString(row.reflection, ''));
  return {
    checkinId: row.id || row.checkinId || '',
    energy: Number(row.energy || 0),
    emotions: Array.isArray(row.emotions) ? row.emotions : parseJsonStringArray(row.emotions),
    triggerText: row.trigger_text || row.triggerText || '',
    reflection,
    createdAt: row.created_at || row.createdAt || '',
  };
}

function dedupeMeaningfulCheckins(rows, limit = 8) {
  const seen = new Set();
  const results = [];

  for (const row of rows) {
    if (isNoiseCheckinRow(row)) continue;
    if (!isLikelySelfReflection(row)) continue;
    const normalized = normalizeCheckinRow(row);
    const normalizedEmotions = normalized.emotions.map((item) => cleanText(item).toLowerCase()).filter(Boolean);
    const hasSelfCue =
      normalized.energy !== 0 ||
      normalizedEmotions.some((emotion) => !['neutral', 'social', 'general'].includes(emotion)) ||
      /(我觉得|我当时|我有点|我很|我想|让我|心里|情绪|能量|压力|兴奋|开心|疲惫|累|焦虑|紧张|放松|恢复|耗电|充电|很棒|还不错|有点空|脑子很亮)/iu.test(
        normalized.reflection
      );
    const looksLikeContactOrProductLog =
      /[?？]/u.test(normalized.reflection) ||
      /(联系人|认识了|遇到了|见到了|微信是|小红书|linkedin|wechat|event|草稿|draft|模型|大模型)/iu.test(
        normalized.reflection
      );
    if (looksLikeContactOrProductLog && !hasSelfCue) continue;
    const signature = [
      normalized.energy,
      normalized.emotions.join('|'),
      cleanText(normalized.reflection).toLowerCase(),
    ].join('::');
    if (!signature.replace(/[:]/g, '').trim()) continue;
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(normalized);
    if (results.length >= limit) break;
  }

  return results;
}

function isNoiseCaptureRow(row) {
  const payload = safeParseJsonObject(row?.payload, {});
  const source = readOptionalString(payload.source, '').toLowerCase();
  const text = readOptionalString(payload.text, '').toLowerCase();

  return (
    source.includes('smoke') ||
    source.includes('seed') ||
    source.includes('demo') ||
    source.includes('backfill') ||
    text.includes('weekly_mirror_smoke') ||
    text.includes('product workspace smoke')
  );
}

function dedupeMeaningfulCaptureRows(rows, limit = 2) {
  const seen = new Set();
  const results = [];

  for (const row of rows) {
    if (isNoiseCaptureRow(row)) continue;
    const formatted = formatCaptureRow(row);
    const signature = cleanText(formatted.text || formatted.combinedText || '').toLowerCase();
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    results.push(formatted);
    if (results.length >= limit) break;
  }

  return results;
}

function classifyFollowUpState(nextFollowUpAt, fallbackAt) {
  const now = Date.now();
  const dueTs = toTimestamp(nextFollowUpAt);
  const warmTs = toTimestamp(fallbackAt);

  if (dueTs) {
    if (dueTs <= now) return 'due now';
    if (dueTs <= now + 3 * 24 * 60 * 60 * 1000) return 'up next';
    return 'scheduled';
  }

  if (warmTs >= now - 5 * 24 * 60 * 60 * 1000) return 'warm';
  return 'revisit';
}

function compareFollowUpCandidates(left, right) {
  const stateRank = {
    'due now': 0,
    'up next': 1,
    warm: 2,
    scheduled: 3,
    revisit: 4,
  };
  const leftRank = stateRank[left.followUpState] ?? 9;
  const rightRank = stateRank[right.followUpState] ?? 9;

  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftTime = toTimestamp(left.nextFollowUpAt || left.lastInteractionAt || left.updatedAt);
  const rightTime = toTimestamp(right.nextFollowUpAt || right.lastInteractionAt || right.updatedAt);
  return rightTime - leftTime;
}

function buildFollowUpCandidates(statements, limit = 6) {
  const people = statements.listRecentPeople
    .all(Math.max(limit * 3, 12))
    .filter(isDisplayablePersonRow)
    .map(formatPersonRow);

  return people
    .map((person) => {
      const detail = buildPeopleDetailPayload(statements, person.personId);
      const lastInteraction = detail?.interactions?.[0] || null;
      const evidenceSnippet =
        detail?.evidence?.[0]?.snippet || lastInteraction?.summary || person.notes || '';

      return {
        personId: person.personId,
        name: person.name,
        tags: person.tags,
        updatedAt: person.updatedAt,
        nextFollowUpAt: person.nextFollowUpAt,
        lastInteractionAt: lastInteraction?.happenedAt || null,
        followUpState: classifyFollowUpState(person.nextFollowUpAt, lastInteraction?.happenedAt || person.updatedAt),
        followUpMessage: detail?.suggestion?.followUpMessage || buildFollowUpMessage(person, detail?.interactions || []),
        evidenceSnippet: truncateText(evidenceSnippet, 180),
      };
    })
    .sort(compareFollowUpCandidates)
    .slice(0, limit);
}

function searchDraftMatches(statements, query, limit = 4) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);

  return dedupeLatestDrafts(
    statements.listRecentDrafts
      .all(60)
      .map(formatDraftRow),
    60
  )
    .map((draft) => {
      const haystack = cleanText(
        [
          draft.eventTitle,
          draft.platformLabel,
          draft.platform,
          draft.language,
          draft.content,
          draft.publishPackage?.hook,
          draft.publishPackage?.preview,
          Array.isArray(draft.publishPackage?.hashtags) ? draft.publishPackage.hashtags.join(' ') : '',
        ]
          .filter(Boolean)
          .join(' ')
      ).toLowerCase();
      const score = computeKeywordScore(terms, haystack);
      return {
        ...draft,
        score,
        snippet: truncateText(draft.publishPackage?.preview || draft.content || '', 180),
      };
    })
    .filter((draft) => draft.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, limit);
}

function inferAskIntent(query) {
  const source = cleanText(query).toLowerCase();
  if (!source) return 'mixed';
  if (/(能量|自我|主题|最近.*状态|self|mirror|energy|theme|who am i)/u.test(source)) return 'self';
  if (/(发帖|草稿|发布|campaign|draft|event|活动|content|post|demo|launch|扩散|distribution)/u.test(source)) return 'campaign';
  if (/(谁|哪个人|哪位|who|contact|person|认识|聊到|investor|founder|增长|designer|联系谁)/u.test(source)) return 'people';
  return 'mixed';
}

function scoreAskContactCandidate(candidate, query) {
  const terms = cleanText(query).toLowerCase().split(/\s+/u).filter(Boolean);
  const haystack = cleanText(
    [
      candidate.name,
      Array.isArray(candidate.tags) ? candidate.tags.join(' ') : '',
      candidate.followUpMessage,
      candidate.evidenceSnippet,
    ]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase();

  let score = computeKeywordScore(terms, haystack);
  if (candidate.followUpState === 'due now') score += 0.35;
  if (candidate.followUpState === 'up next') score += 0.22;
  if (/(demo|launch|spread|distribution|content|增长|扩散|发帖|合作)/u.test(query) && /(growth|content|launch|distribution|增长|内容|合作|demo)/u.test(haystack)) {
    score += 0.35;
  }
  return score;
}

function buildAskActions({ intent, people, events, drafts, followUps, latestMirror }) {
  const actions = [];

  if (people[0]?.personId) {
    actions.push({
      label: `Open ${people[0].name}`,
      href: `/people/${encodeURIComponent(people[0].personId)}`,
      reason: 'Best memory match from this query.',
    });
  }

  if (events[0]?.eventId) {
    actions.push({
      label: 'Open related event',
      href: `/drafts?eventId=${encodeURIComponent(events[0].eventId)}`,
      reason: 'This logbook item is closest to your query.',
    });
  }

  if (drafts[0]?.eventId) {
    actions.push({
      label: `Review ${drafts[0].platformLabel} draft`,
      href: `/drafts?eventId=${encodeURIComponent(drafts[0].eventId)}`,
      reason: 'There is already content material connected to this topic.',
    });
  }

  if ((intent === 'self' || !actions.length) && latestMirror?.mirrorId) {
    actions.push({
      label: 'Open Self Mirror',
      href: '/self-mirror',
      reason: 'Use the mirror evidence to inspect the current pattern.',
    });
  }

  if (!actions.length && followUps[0]?.personId) {
    actions.push({
      label: `Follow up with ${followUps[0].name}`,
      href: `/people/${encodeURIComponent(followUps[0].personId)}`,
      reason: 'This is the warmest relationship action in the current workspace.',
    });
  }

  return actions.slice(0, 4);
}

function buildAskAnswer({
  query,
  intent,
  people,
  events,
  drafts,
  followUps,
  latestMirror,
  checkins,
}) {
  const topPeople = people.slice(0, 3).map((person) => person.name);
  const topEvents = events.slice(0, 2).map((event) => event.title);
  const topDrafts = drafts.slice(0, 2).map((draft) => `${draft.platformLabel} draft`);

  if (intent === 'self') {
    if (!latestMirror) {
      return 'I do not have a recent self mirror yet. Generate one after a few more captures or check-ins so this answer can point to evidence instead of guessing.';
    }
    const themes = Array.isArray(latestMirror.themes)
      ? latestMirror.themes.slice(0, 3).map((item) => item.theme).filter(Boolean)
      : [];
    return [
      `Your strongest current self signal is: ${latestMirror.summaryText || 'still forming'}.`,
      themes.length ? `Themes showing up most often: ${themes.join(', ')}.` : '',
      checkins[0]?.reflection ? `Most recent check-in evidence: ${truncateText(checkins[0].reflection, 120)}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (/(联系谁|reach out|follow up|demo|launch|扩散|spread)/u.test(query) && followUps.length) {
    return [
      `Best people to move on next: ${followUps.slice(0, 3).map((person) => person.name).join(', ')}.`,
      followUps[0]?.followUpMessage ? `Start with: ${followUps[0].followUpMessage}` : '',
      topEvents.length ? `Relevant event context: ${topEvents.join(' / ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (intent === 'campaign') {
    return [
      topEvents.length ? `Closest event context: ${topEvents.join(' / ')}.` : 'I do not see a strong event match yet.',
      topDrafts.length ? `Draft material already exists in: ${topDrafts.join(', ')}.` : 'No draft package exists yet for this topic.',
      topPeople.length ? `People memory connected to this theme: ${topPeople.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (people.length) {
    return [
      `Strongest people memory match: ${people[0].name}.`,
      people[0].evidenceSnippet ? `Why it matched: ${people[0].evidenceSnippet}` : '',
      followUps[0]?.followUpMessage ? `Suggested next step: ${followUps[0].followUpMessage}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (events.length) {
    return [
      `I did not find a strong person match, but this event is close: ${events[0].title}.`,
      events[0].snippet ? `Context: ${events[0].snippet}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return 'I searched people, events, drafts, and your recent self signals, but I do not have a strong match yet. Add one more clue like a name, company, topic, platform, or time window and I can narrow it down.';
}

function buildAskSearchPayload(statements, query) {
  const cleanedQuery = cleanText(query);
  const intent = inferAskIntent(cleanedQuery);
  const people = searchPeopleMatches(statements, cleanedQuery, 5);
  const events = searchEventMatches(statements, cleanedQuery, 4);
  const drafts = searchDraftMatches(statements, cleanedQuery, 4);
  const latestMirrorRow = statements.selectLatestMirror.get();
  const latestMirror = latestMirrorRow
    ? formatMirrorPayload(latestMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestMirrorRow.id))
    : null;
  const checkins = dedupeMeaningfulCheckins(statements.listRecentSelfCheckins.all(18), 6);
  const followUps = buildFollowUpCandidates(statements, 6)
    .map((candidate) => ({
      ...candidate,
      score: scoreAskContactCandidate(candidate, cleanedQuery),
    }))
    .filter((candidate) => candidate.score > 0 || !cleanedQuery)
    .sort((left, right) => right.score - left.score || compareFollowUpCandidates(left, right))
    .slice(0, 4);

  return {
    query: cleanedQuery,
    intent,
    answer: buildAskAnswer({
      query: cleanedQuery,
      intent,
      people,
      events,
      drafts,
      followUps,
      latestMirror,
      checkins,
    }),
    retrieval: {
      mode: resolveEmbeddingsSettings().retrievalMode,
      effectiveProvider: resolveEmbeddingsSettings().effectiveProvider,
      semanticBoostEnabled: resolveEmbeddingsSettings().semanticBoostEnabled,
    },
    people,
    events,
    drafts,
    contactsToReachOut: followUps,
    latestMirror,
    recentCheckins: checkins,
    actions: buildAskActions({
      intent,
      people,
      events,
      drafts,
      followUps,
      latestMirror,
    }),
  };
}

function buildCockpitSummary(statements) {
  const recentPeople = statements.listRecentPeople.all(8).filter(isDisplayablePersonRow).map(formatPersonRow);
  const recentEvents = statements.listRecentEvents.all(8).map(formatEventRow);
  const recentDrafts = dedupeLatestDrafts(statements.listRecentDrafts.all(40).map(formatDraftRow), 20);
  const recentQueueTasks = dedupeLatestQueueTasks(statements.listRecentQueueTasks.all(40).map(formatQueueTaskRow), 20);
  const recentCheckins = dedupeMeaningfulCheckins(statements.listRecentSelfCheckins.all(24), 8);
  const latestMirrorRow = statements.selectLatestMirror.get();
  const latestMirror = latestMirrorRow
    ? formatMirrorPayload(latestMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestMirrorRow.id))
    : null;
  const followUps = buildFollowUpCandidates(statements, 5);
  const draftEventIds = new Set(recentDrafts.map((draft) => draft.eventId).filter(Boolean));
  const eventsNeedingDrafts = recentEvents.filter((event) => !draftEventIds.has(event.eventId)).slice(0, 4);
  const queuedTasks = recentQueueTasks.filter((task) => task.status === 'queued').slice(0, 4);
  const manualSteps = recentQueueTasks.filter((task) => task.status === 'manual_step_needed').slice(0, 4);
  const postedTasks = recentQueueTasks.filter((task) => task.status === 'posted').slice(0, 4);
  const failedTasks = recentQueueTasks.filter((task) => task.status === 'failed').slice(0, 4);

  const actions = [];
  if (followUps[0]) {
    actions.push({
      title: `Follow up with ${followUps[0].name}`,
      href: `/people/${encodeURIComponent(followUps[0].personId)}`,
      reason: followUps[0].followUpMessage,
      tone: followUps[0].followUpState === 'due now' ? 'warn' : 'accent',
    });
  }
  if (queuedTasks[0]) {
    actions.push({
      title: `Approve ${queuedTasks[0].platformLabel}`,
      href: '/queue',
      reason: 'A draft is already queued and waiting for the next publish decision.',
      tone: 'warn',
    });
  }
  if (manualSteps[0]) {
    actions.push({
      title: `Record ${manualSteps[0].platformLabel} outcome`,
      href: '/queue',
      reason: 'There is a manual publish step ready to be completed and logged.',
      tone: 'accent',
    });
  }
  if (failedTasks[0]) {
    actions.push({
      title: `Review failed ${failedTasks[0].platformLabel} publish`,
      href: '/queue',
      reason: 'A publish attempt failed and needs manual review before retrying.',
      tone: 'warn',
    });
  }
  if (eventsNeedingDrafts[0]) {
    actions.push({
      title: `Generate drafts for ${eventsNeedingDrafts[0].title}`,
      href: `/drafts?eventId=${encodeURIComponent(eventsNeedingDrafts[0].eventId)}`,
      reason: 'This event exists in the logbook but is not yet connected to a platform package.',
      tone: 'soft',
    });
  }
  if (latestMirror?.mirrorId) {
    actions.push({
      title: 'Review this week’s mirror',
      href: '/self-mirror',
      reason: truncateText(latestMirror.summaryText || latestMirror.content || '', 140),
      tone: 'good',
    });
  }

  return {
    generatedAt: nowIso(),
    counts: {
      contacts: recentPeople.length,
      events: recentEvents.length,
      drafts: recentDrafts.length,
      queued: queuedTasks.length,
      manualSteps: manualSteps.length,
      posted: postedTasks.length,
      failed: failedTasks.length,
      checkins: recentCheckins.length,
    },
    summaryText: [
      followUps.length ? `${followUps.length} relationship follow-up${followUps.length > 1 ? 's' : ''} are warm right now.` : 'No follow-ups are staged yet.',
      queuedTasks.length ? `${queuedTasks.length} draft${queuedTasks.length > 1 ? 's' : ''} waiting in queue.` : 'No queued drafts are waiting.',
      failedTasks.length ? `${failedTasks.length} publish task${failedTasks.length > 1 ? 's need' : ' needs'} retry attention.` : 'No failed publish tasks need attention.',
      eventsNeedingDrafts.length ? `${eventsNeedingDrafts.length} logbook item${eventsNeedingDrafts.length > 1 ? 's' : ''} still need draft packages.` : 'Recent events already have content coverage.',
    ].join(' '),
    actions: actions.slice(0, 5),
    followUps,
    recentPeople: recentPeople.slice(0, 4),
    recentEvents: recentEvents.slice(0, 4),
    eventsNeedingDrafts,
    queue: {
      awaitingApproval: queuedTasks,
      manualSteps,
      failed: failedTasks,
      posted: postedTasks,
    },
    latestMirror,
    recentCheckins,
  };
}

function buildWorkspaceBootstrapPayload(statements) {
  const cockpit = buildCockpitSummary(statements);
  const cluster = buildFoundryClusterSummary();
  const codex = buildCodexLayerSummary();
  const embeddings = resolveEmbeddingsSettings();
  const drafts = dedupeLatestDrafts(statements.listRecentDrafts.all(30).map(formatDraftRow), 12).slice(0, 3);
  const captures = dedupeMeaningfulCaptureRows(statements.listRecentCaptures.all(12), 1);
  const publishMode = readMode();
  const latestDailyMirrorRow = statements.selectLatestMirrorByCadence.get('daily');
  const latestWeeklyMirrorRow = statements.selectLatestMirrorByCadence.get('weekly');
  const latestDailyMirror = latestDailyMirrorRow
    ? formatMirrorPayload(latestDailyMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestDailyMirrorRow.id))
    : null;
  const latestWeeklyMirror = latestWeeklyMirrorRow
    ? formatMirrorPayload(latestWeeklyMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestWeeklyMirrorRow.id))
    : null;
  const latestMirror = latestDailyMirror || latestWeeklyMirror || cockpit.latestMirror || null;
  const queuePreview = [
    ...cockpit.queue.manualSteps,
    ...cockpit.queue.awaitingApproval,
    ...cockpit.queue.failed,
    ...cockpit.queue.posted,
  ].slice(0, 3);

  return {
    generatedAt: nowIso(),
    summaryText: cockpit.summaryText,
    topActions: cockpit.actions.slice(0, 3),
    recentContacts: cockpit.recentPeople.slice(0, 3),
    recentEvents: cockpit.recentEvents.slice(0, 3),
    recentDrafts: drafts,
    queuePreview,
    latestMirror,
    latestDailyMirror,
    latestWeeklyMirror,
    recentCheckins: cockpit.recentCheckins.slice(0, 3),
    recentCaptures: captures.slice(0, 2),
    agentLaneSummary: Array.isArray(cluster.agents) ? cluster.agents.slice(0, 4) : [],
    foundry: cluster,
    codex,
    systemStatus: {
      publishMode,
      localFirst: true,
      loopbackOnly: true,
      foundryEnabled: Boolean(cluster.enabled),
      llmTaskHealth: cluster.llmTaskHealth?.status || 'unknown',
      summary: [
        publishMode === 'dry-run' ? 'Dry-run publish' : 'Live publish',
        'loopback only',
        cluster.enabled ? 'Studio ready' : 'Studio unavailable',
      ].join(' · '),
    },
    voiceReadiness: {
      openAiConfigured: Boolean(readOptionalString(process.env.OPENAI_API_KEY, '')),
      effectiveEmbeddingsProvider: embeddings.effectiveProvider,
      summary: readOptionalString(process.env.OPENAI_API_KEY, '')
        ? 'Server-side OpenAI transcription is configured for voice uploads.'
        : 'Voice uploads still depend on browser speech recognition unless OPENAI_API_KEY is configured.',
    },
  };
}

function buildEventDetailPayload(statements, eventId) {
  const eventRow = statements.selectEventDetailById.get(eventId);
  if (!eventRow) return null;

  const event = formatEventRow(eventRow);
  const payload = safeParseJsonObject(eventRow.payload, {});
  const relatedDrafts = dedupeLatestDrafts(
    statements.listDraftsByEventId.all(eventId).map(formatDraftRow),
    12
  );

  return {
    event,
    summaryText: truncateText(
      readOptionalString(
        payload?.details?.summary ||
          payload?.details?.combinedText ||
          payload?.summary ||
          summarizeEventPayload(payload),
        ''
      ),
      240
    ),
    audience: readOptionalString(payload.audience, ''),
    languageStrategy: readOptionalString(payload.languageStrategy, ''),
    tone: readOptionalString(payload.tone, ''),
    links: normalizeStringList(payload.links),
    assets: normalizeStringList(payload.assets),
    details: payload.details || {},
    relatedDrafts,
    relatedPeople: listRelatedPeopleForEvent(statements, eventId),
    graphOverview: buildGraphOverview(statements, { focusType: 'event', focusId: eventId }),
  };
}

function buildPeopleDetailPayload(statements, personId) {
  const personRow = statements.selectPersonById.get(personId);
  if (!personRow) return null;

  const person = formatPersonRow(personRow);
  const identities = statements.listIdentitiesByPersonId.all(personId).map(formatIdentityRow);
  const interactions = statements.listInteractionsByPersonId.all(personId).map(formatInteractionRow);
  const evidence = [
    ...interactions.slice(0, 3).map((interaction) => ({
      type: 'interaction',
      sourceId: interaction.interactionId,
      snippet: interaction.evidence || interaction.summary,
    })),
    ...(person.notes
      ? [
          {
            type: 'person_note',
            sourceId: person.personId,
            snippet: person.notes,
          },
        ]
      : []),
  ];

  return {
    person,
    identities,
    interactions,
    evidence,
    relatedEvents: listRelatedEventsForPerson(statements, personId),
    graphOverview: buildGraphOverview(statements, { focusType: 'person', focusId: personId }),
    suggestion: {
      followUpMessage: buildFollowUpMessage(person, interactions),
      nextFollowUpAt: person.nextFollowUpAt,
    },
  };
}

function formatEventPersonLinkRow(row) {
  return {
    linkId: row.id,
    eventId: row.event_id,
    personId: row.person_id,
    role: readOptionalString(row.role, 'participant'),
    sourceType: readOptionalString(row.source_type, 'manual'),
    sourceId: readOptionalString(row.source_id, ''),
    weight: Number(row.weight || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listRelatedPeopleForEvent(statements, eventId) {
  return statements.listEventPersonLinksByEventId
    .all(eventId)
    .map((row) => {
      const personRow = statements.selectPersonById.get(row.person_id);
      if (!personRow || !isDisplayablePersonRow(personRow)) return null;
      return {
        ...formatPersonRow(personRow),
        link: formatEventPersonLinkRow(row),
      };
    })
    .filter(Boolean);
}

function listRelatedEventsForPerson(statements, personId) {
  return statements.listEventPersonLinksByPersonId
    .all(personId)
    .map((row) => {
      const eventRow = statements.selectEventDetailById.get(row.event_id);
      if (!eventRow) return null;
      return {
        ...formatEventRow(eventRow),
        link: formatEventPersonLinkRow(row),
      };
    })
    .filter(Boolean);
}

function buildGraphOverview(statements, { focusType, focusId }) {
  const nodes = [];
  const edges = [];
  const nodeById = new Map();

  function upsertNode(node) {
    if (!node?.id || nodeById.has(node.id)) return;
    nodeById.set(node.id, node);
    nodes.push(node);
  }

  function addEdge(edge) {
    if (!edge?.id) return;
    edges.push(edge);
  }

  if (focusType === 'person') {
    const person = statements.selectPersonById.get(focusId);
    if (!person) return { focusType, focusId, nodes: [], edges: [] };
    upsertNode({
      id: `person:${person.id}`,
      entityType: 'person',
      entityId: person.id,
      label: readOptionalString(person.name, 'Contact'),
      x: 0.5,
      y: 0.5,
    });
    const relatedEvents = listRelatedEventsForPerson(statements, focusId).slice(0, 6);
    relatedEvents.forEach((event, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(relatedEvents.length, 1);
      upsertNode({
        id: `event:${event.eventId}`,
        entityType: 'event',
        entityId: event.eventId,
        label: readOptionalString(event.title, 'Event'),
        x: 0.5 + Math.cos(angle) * 0.28,
        y: 0.5 + Math.sin(angle) * 0.28,
      });
      addEdge({
        id: `${focusId}:${event.eventId}`,
        from: `person:${focusId}`,
        to: `event:${event.eventId}`,
        role: event.link?.role || 'participant',
      });
    });
  } else if (focusType === 'event') {
    const event = statements.selectEventDetailById.get(focusId);
    if (!event) return { focusType, focusId, nodes: [], edges: [] };
    upsertNode({
      id: `event:${event.id}`,
      entityType: 'event',
      entityId: event.id,
      label: readOptionalString(event.title, 'Event'),
      x: 0.5,
      y: 0.5,
    });
    const relatedPeople = listRelatedPeopleForEvent(statements, focusId).slice(0, 6);
    relatedPeople.forEach((person, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(relatedPeople.length, 1);
      upsertNode({
        id: `person:${person.personId}`,
        entityType: 'person',
        entityId: person.personId,
        label: readOptionalString(person.name, 'Contact'),
        x: 0.5 + Math.cos(angle) * 0.28,
        y: 0.5 + Math.sin(angle) * 0.28,
      });
      addEdge({
        id: `${focusId}:${person.personId}`,
        from: `event:${focusId}`,
        to: `person:${person.personId}`,
        role: person.link?.role || 'participant',
      });
    });
  }

  return {
    focusType,
    focusId,
    nodes,
    edges,
  };
}

function parseMirrorContent(rawContent) {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      summaryText: '',
      themes: [],
      energizers: [],
      drainers: [],
      conclusions: [],
    };
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        summaryText: readOptionalString(parsed.summaryText, rawContent),
        themes: Array.isArray(parsed.themes) ? parsed.themes : [],
        energizers: Array.isArray(parsed.energizers) ? parsed.energizers : [],
        drainers: Array.isArray(parsed.drainers) ? parsed.drainers : [],
        conclusions: Array.isArray(parsed.conclusions) ? parsed.conclusions : [],
      };
    }
  } catch {
    // plain text legacy mirror
  }

  return {
    summaryText: rawContent,
    themes: [],
    energizers: [],
    drainers: [],
    conclusions: [],
  };
}

function formatMirrorPayload(row, evidenceRows = []) {
  const structured = parseMirrorContent(row.content);
  return {
    mirrorId: row.id,
    rangeLabel: row.range_label,
    cadence: readOptionalString(row.cadence, 'weekly'),
    periodKey: readOptionalString(row.period_key, ''),
    content: row.content,
    createdAt: row.created_at,
    ...structured,
    evidence: evidenceRows.map(formatMirrorEvidenceRow),
  };
}

function selectCaptureAssetsByIds(statements, assetIds = []) {
  return cleanList(assetIds)
    .map((assetId) => statements.selectCaptureAssetById.get(assetId))
    .filter(Boolean)
    .map(formatCaptureAssetRow);
}

function decodeDataUrl(dataUrl) {
  const normalized = readOptionalString(dataUrl, '');
  if (!normalized.includes(',')) return Buffer.from('', 'utf8');
  return Buffer.from(normalized.split(',').pop() || '', 'base64');
}

function inferAssetExtension(mimeType = '', fileName = '', kind = 'asset') {
  const requestedExtension = path.extname(readOptionalString(fileName, '')).replace(/[^.a-z0-9]/giu, '');
  if (requestedExtension) return requestedExtension.toLowerCase();

  const normalized = readOptionalString(mimeType, '').toLowerCase();
  if (normalized.includes('webm')) return '.webm';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
  if (normalized.includes('wav')) return '.wav';
  if (normalized.includes('m4a') || normalized.includes('mp4')) return '.m4a';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('pdf')) return '.pdf';
  return kind === 'audio' ? '.webm' : '.bin';
}

function sanitizeAssetBaseName(fileName = '', fallback = 'asset') {
  const rawBase = path.basename(readOptionalString(fileName, ''), path.extname(readOptionalString(fileName, ''))) || fallback;
  const sanitized = rawBase
    .normalize('NFKD')
    .replace(/[^\w.-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48);
  return sanitized || fallback;
}

function persistCaptureAssetOriginal({ assetId, kind, mimeType, fileName, contentBase64 }) {
  const buffer = decodeDataUrl(contentBase64);
  if (!buffer.length) return '';

  const targetDir = path.join(ASSET_STORAGE_DIR, kind || 'asset');
  fs.mkdirSync(targetDir, { recursive: true });

  const extension = inferAssetExtension(mimeType, fileName, kind);
  const baseName = sanitizeAssetBaseName(fileName, kind === 'audio' ? 'voice-note' : 'capture-asset');
  const localPath = path.join(targetDir, `${assetId}-${baseName}${extension}`);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

function buildImageUnderstandingFallbackText(parsed = {}) {
  const summary = cleanText(parsed.summary || '');
  const extractedText = cleanText(parsed.extractedText || '');
  const people = Array.isArray(parsed.people) ? parsed.people : [];
  const identities = Array.isArray(parsed.identities) ? parsed.identities : [];
  const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
  const parts = [
    extractedText,
    summary,
    people
      .map((person) => {
        const values = [
          cleanText(person.name || ''),
          cleanText(person.role || ''),
          cleanText(person.company || ''),
          Array.isArray(person.handles) ? person.handles.map((handle) => cleanText(handle)).filter(Boolean).join(' ') : '',
        ].filter(Boolean);
        return values.join(' ');
      })
      .filter(Boolean)
      .join(' '),
    identities
      .map((identity) => {
        const values = [
          cleanText(identity.platform || ''),
          cleanText(identity.handle || ''),
          cleanText(identity.url || ''),
        ].filter(Boolean);
        return values.join(' ');
      })
      .filter(Boolean)
      .join(' '),
    topics.map((topic) => cleanText(topic)).filter(Boolean).join(' '),
    cleanText(parsed.place || ''),
  ]
    .filter(Boolean)
    .join('\n');

  return cleanText(parts);
}

async function runOpenAiImageUnderstanding({ mimeType, contentBase64 }) {
  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  if (!apiKey || !contentBase64) {
    return { text: '', provider: apiKey ? 'openai-skipped' : 'disabled', parsed: null };
  }

  const model = readOptionalString(
    process.env.OPENAI_IMAGE_UNDERSTAND_MODEL,
    readOptionalString(process.env.OPENAI_CAPTURE_DRAFT_MODEL, 'gpt-5.4')
  );

  const prompt = [
    'You are reading a personal capture asset such as a business card, contact screenshot, event flyer, or note image.',
    'Extract useful relationship and event clues, not just OCR text.',
    'Return compact JSON only.',
    'Schema:',
    '{"summary":"","extractedText":"","people":[{"name":"","role":"","company":"","handles":[]}],"identities":[{"platform":"","handle":"","url":""}],"topics":[],"place":"","confidence":"medium"}',
    'Rules:',
    '- Prefer concise factual extraction.',
    '- If this looks like a business card, capture person name, role, company, and handles.',
    '- If this is not a card, still summarize the useful relationship or event context.',
    '- Do not invent details.',
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Read this image and extract the useful relationship, contact, and event details.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: contentBase64,
                },
              },
            ],
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        text: '',
        provider: 'openai-error',
        error: readOptionalString(payload?.error?.message, `status ${response.status}`),
        parsed: null,
      };
    }

    const rawContent = payload?.choices?.[0]?.message?.content;
    const parsed = parseLooseJsonObject(
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((item) =>
                typeof item === 'string'
                  ? item
                  : typeof item?.text === 'string'
                    ? item.text
                    : typeof item?.content === 'string'
                      ? item.content
                      : ''
              )
              .join('\n')
          : ''
    );

    const text = parsed ? buildImageUnderstandingFallbackText(parsed) : '';
    return {
      text,
      provider: parsed ? 'openai-vision' : 'openai-empty-image',
      parsed,
    };
  } catch (error) {
    return {
      text: '',
      provider: 'openai-error',
      error: error instanceof Error ? error.message : String(error),
      parsed: null,
    };
  }
}

function runLocalImageOcr({ mimeType, contentBase64 }) {
  const tesseractAvailable = (() => {
    try {
      execFileSync('bash', ['-lc', 'command -v tesseract'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  if (!tesseractAvailable || !contentBase64) return '';

  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const tempPath = path.join(os.tmpdir(), `socialos-capture-${randomUUID()}.${extension}`);
  try {
    fs.writeFileSync(tempPath, decodeDataUrl(contentBase64));
    const output = execFileSync('tesseract', [tempPath, 'stdout'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return cleanText(output);
  } catch {
    return '';
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function runOpenAiAudioTranscription({ mimeType, contentBase64 }) {
  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  if (!apiKey || !contentBase64) return { text: '', provider: apiKey ? 'openai-skipped' : 'disabled' };

  const audioBuffer = decodeDataUrl(contentBase64);
  if (!audioBuffer.length) return { text: '', provider: 'openai-empty-audio' };

  const extension = mimeType.includes('mp3')
    ? 'mp3'
    : mimeType.includes('wav')
      ? 'wav'
      : mimeType.includes('m4a')
        ? 'm4a'
        : 'webm';

  const form = new FormData();
  form.set(
    'file',
    new Blob([audioBuffer], { type: mimeType || 'audio/webm' }),
    `capture-note.${extension}`
  );
  form.set(
    'model',
    readOptionalString(process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL, 'gpt-4o-mini-transcribe')
  );

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        text: '',
        provider: 'openai-error',
        error: readOptionalString(payload?.error?.message, `status ${response.status}`),
      };
    }
    return {
      text: cleanText(payload.text || ''),
      provider: 'openai',
    };
  } catch (error) {
    return {
      text: '',
      provider: 'openai-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function shouldUseModelCaptureAssist(source = 'manual') {
  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  if (!apiKey) return false;

  const normalizedSource = readOptionalString(source, '').toLowerCase();
  if (!normalizedSource) return true;

  return !/(?:smoke|check|test|ci|autodev|seed|fixture)/u.test(normalizedSource);
}

function parseLooseJsonObject(value) {
  const source = readOptionalString(value, '');
  if (!source) return null;

  const directAttempt = (() => {
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  })();
  if (directAttempt && typeof directAttempt === 'object' && !Array.isArray(directAttempt)) {
    return directAttempt;
  }

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]+?)\s*```/iu);
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Ignore and continue to brace scan.
    }
  }

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

function extractChatCompletionText(payload) {
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (typeof rawContent === 'string') return rawContent;
  if (!Array.isArray(rawContent)) return '';
  return rawContent
    .map((item) =>
      typeof item === 'string'
        ? item
        : typeof item?.text === 'string'
          ? item.text
          : typeof item?.content === 'string'
            ? item.content
            : ''
    )
    .join('\n');
}

function resolveStructuredProviderRequest(provider, { openAiModelEnvKey = '', openAiModelFallback = 'gpt-5.4' } = {}) {
  const normalizedProvider = normalizeModelProvider(provider, MODEL_PROVIDER_LOCAL);

  if (normalizedProvider === MODEL_PROVIDER_OPENAI) {
    const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
    if (!apiKey) return null;
    return {
      provider: MODEL_PROVIDER_OPENAI,
      model: readOptionalString(process.env[openAiModelEnvKey], openAiModelFallback),
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
    };
  }

  if (normalizedProvider === MODEL_PROVIDER_GLM) {
    const apiKey = readOptionalString(process.env.GLM_API_KEY, '');
    if (!apiKey) return null;
    return {
      provider: MODEL_PROVIDER_GLM,
      model: readOptionalString(process.env.GLM_MODEL_ID, DEFAULT_GLM_MODEL_ID),
      endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
    };
  }

  if (normalizedProvider === MODEL_PROVIDER_FLOCK) {
    const apiKey = readOptionalString(process.env.FLOCK_API_KEY, '');
    if (!apiKey) return null;
    return {
      provider: MODEL_PROVIDER_FLOCK,
      model: readOptionalString(process.env.FLOCK_MODEL_ID, DEFAULT_FLOCK_MODEL_ID),
      endpoint: 'https://api.flock.io/v1/chat/completions',
      headers: {
        'x-litellm-api-key': apiKey,
        'content-type': 'application/json',
      },
    };
  }

  return null;
}

async function runStructuredModelTask({
  provider,
  systemPrompt,
  userPayload,
  openAiModelEnvKey = '',
  openAiModelFallback = 'gpt-5.4',
}) {
  const requestConfig = resolveStructuredProviderRequest(provider, {
    openAiModelEnvKey,
    openAiModelFallback,
  });

  if (!requestConfig) {
    return {
      ok: false,
      provider: MODEL_PROVIDER_LOCAL,
      model: '',
      parsed: null,
      rawContent: '',
      error: `${provider} not configured`,
    };
  }

  const timeoutMs = readOptionalPositiveInteger(
    process.env.STRUCTURED_MODEL_TIMEOUT_MS,
    DEFAULT_STRUCTURED_MODEL_TIMEOUT_MS
  );
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutHandle = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(requestConfig.endpoint, {
      method: 'POST',
      headers: requestConfig.headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: requestConfig.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const rawContent = extractChatCompletionText(payload);
    const parsed = parseLooseJsonObject(rawContent);

    if (!response.ok) {
      return {
        ok: false,
        provider: requestConfig.provider,
        model: requestConfig.model,
        parsed,
        rawContent,
        error: readOptionalString(payload?.error?.message, `status ${response.status}`),
      };
    }

    if (!parsed) {
      return {
        ok: false,
        provider: requestConfig.provider,
        model: requestConfig.model,
        parsed: null,
        rawContent,
        error: 'provider returned non-JSON content',
      };
    }

    return {
      ok: true,
      provider: requestConfig.provider,
      model: requestConfig.model,
      parsed,
      rawContent,
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      provider: requestConfig.provider,
      model: requestConfig.model,
      parsed: null,
      rawContent: '',
      error: didTimeout
        ? `provider request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeModelIdentityList(value, fallback = []) {
  const normalized = Array.isArray(value) ? value : [];
  const output = [];
  const seen = new Set();

  for (const item of normalized) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const platform = cleanText(item.platform || item.label || '');
    const handle = cleanText(item.handle || item.username || '');
    const url = cleanText(item.url || '');
    const note = cleanText(item.note || '');
    if (!platform && !handle && !url) continue;
    const signature = `${platform}::${handle}::${url}`.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push({ platform, handle, url, note });
  }

  for (const item of Array.isArray(fallback) ? fallback : []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const platform = cleanText(item.platform || '');
    const handle = cleanText(item.handle || '');
    const url = cleanText(item.url || '');
    const note = cleanText(item.note || '');
    if (!platform && !handle && !url) continue;
    const signature = `${platform}::${handle}::${url}`.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push({ platform, handle, url, note });
  }

  return output;
}

function mergeModelCaptureDraft(fallbackDraft, parsed = {}, providerMeta = {}) {
  const fallbackPersonDraft = fallbackDraft?.personDraft || {};
  const fallbackInteractionDraft = fallbackDraft?.interactionDraft || {};
  const fallbackSelfCheckinDraft = fallbackDraft?.selfCheckinDraft || {};
  const fallbackName = cleanText(fallbackPersonDraft.name || '');
  const modelName = cleanText(parsed.name || parsed.personName || '');
  const requestedConfirmation = Boolean(parsed.requiresNameConfirmation);
  const finalName = modelName || fallbackName;
  const isConfirmedName = !requestedConfirmation && !isPlaceholderContactName(finalName);
  const displayName = isConfirmedName ? finalName : 'Unconfirmed contact';
  const combinedTags = cleanList([
    ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    ...(Array.isArray(fallbackPersonDraft.tags) ? fallbackPersonDraft.tags : []),
  ]);
  const notes = sanitizeContactDraftText(
    readOptionalString(parsed.notes, fallbackPersonDraft.notes || fallbackDraft?.combinedText || '')
  );
  const interactionSummary = sanitizeContactDraftText(
    readOptionalString(
      parsed.interactionSummary,
      fallbackInteractionDraft.summary || fallbackDraft?.combinedText || ''
    )
  );
  const interactionEvidence = sanitizeContactDraftText(
    readOptionalString(
      parsed.interactionEvidence,
      fallbackInteractionDraft.evidence || fallbackDraft?.combinedText || ''
    )
  );

  return {
    ...fallbackDraft,
    extraction: {
      method: providerMeta.method || 'heuristic',
      model: providerMeta.model || '',
      provider: providerMeta.provider || MODEL_PROVIDER_LOCAL,
    },
    personDraft: {
      ...fallbackPersonDraft,
      name: isConfirmedName ? finalName : '',
      displayName,
      isConfirmedName,
      requiresNameConfirmation: !isConfirmedName,
      tags: combinedTags,
      notes: truncateText(notes || fallbackPersonDraft.notes || '', 220),
      nextFollowUpAt: cleanText(parsed.nextFollowUpAt || fallbackPersonDraft.nextFollowUpAt || ''),
      followUpSuggestion: cleanText(
        parsed.followUpSuggestion || fallbackPersonDraft.followUpSuggestion || ''
      ),
      identities: normalizeModelIdentityList(parsed.identities, fallbackPersonDraft.identities),
    },
    interactionDraft: {
      ...fallbackInteractionDraft,
      summary: truncateText(interactionSummary || fallbackInteractionDraft.summary || '', 220),
      evidence: interactionEvidence || fallbackInteractionDraft.evidence || '',
    },
    selfCheckinDraft: {
      ...fallbackSelfCheckinDraft,
      emotions: cleanList(
        Array.isArray(parsed.emotions) && parsed.emotions.length
          ? parsed.emotions
          : fallbackSelfCheckinDraft.emotions
      ),
      energy: Number.isFinite(Number(parsed.energy))
        ? Math.max(-2, Math.min(2, Number(parsed.energy)))
        : fallbackSelfCheckinDraft.energy,
    },
  };
}

async function buildCaptureDraftWithModelAssist({ text, source = 'manual', assets = [], provider = MODEL_PROVIDER_AUTO }) {
  const fallbackDraft = buildCaptureDraft({ text, source, assets });
  if (!shouldUseModelCaptureAssist(source)) {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL });
  }

  const combinedText = cleanText(fallbackDraft.combinedText || text);
  const providerSelection = resolveRequestedModelProvider({ requestedProvider: provider });
  if (!combinedText || providerSelection.effective === MODEL_PROVIDER_LOCAL) {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL });
  }

  const prompt = [
    'Extract one primary contact draft from the user note.',
    'Rules:',
    '- Choose a named person, not a generic group like "很多人" or "some people".',
    '- If the note says "比如 sam" or "for example sam", the primary contact is Sam.',
    '- If no reliable person name is present, return an empty name and requiresNameConfirmation=true.',
    '- Keep tags short and useful.',
    '- Keep notes and interaction fields concise and de-noised.',
    '- Return JSON only.',
    'Schema:',
    '{"name":"","requiresNameConfirmation":true,"tags":[],"notes":"","interactionSummary":"","interactionEvidence":"","followUpSuggestion":"","nextFollowUpAt":"","identities":[],"energy":0,"emotions":[]}',
  ].join('\n');

  const response = await runStructuredModelTask({
    provider: providerSelection.effective,
    systemPrompt: prompt,
    userPayload: {
      text: combinedText,
      source,
      assets: assets.map((asset) => ({
        kind: asset.kind,
        fileName: asset.fileName,
        extractedText: cleanText(asset.extractedText || asset.previewText || ''),
      })),
    },
    openAiModelEnvKey: 'OPENAI_CAPTURE_DRAFT_MODEL',
    openAiModelFallback: 'gpt-5.4',
  });

  if (!response.ok || !response.parsed) {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '', provider: MODEL_PROVIDER_LOCAL });
  }

  return mergeModelCaptureDraft(fallbackDraft, response.parsed, {
    method: 'model',
    model: response.model,
    provider: response.provider,
  });
}

function normalizeTimestampInput(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const trimmed = value.trim();
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(trimmed)
      ? `${trimmed}:00`
      : /^\d{4}-\d{2}-\d{2}$/u.test(trimmed)
        ? `${trimmed}T00:00:00`
        : trimmed;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function findExistingPersonByName(statements, name) {
  const normalizedName = cleanText(name).toLowerCase();
  if (!normalizedName || isPlaceholderContactName(normalizedName)) return null;
  return statements
    .listAllPeople
    .all()
    .find((person) => cleanText(person.name).toLowerCase() === normalizedName) || null;
}

function touchExistingPerson(statements, personRow, overrides = {}) {
  const now = nowIso();
  const mergedTags = cleanList([
    ...parseJsonStringArray(personRow.tags),
    ...(Array.isArray(overrides.tags) ? overrides.tags : []),
  ]);
  const mergedNotes = cleanText(
    [sanitizeContactDraftText(readOptionalString(personRow.notes, '')), sanitizeContactDraftText(readOptionalString(overrides.notes, ''))]
      .filter(Boolean)
      .join('\n\n')
  );
  const nextFollowUpAt =
    normalizeTimestampInput(overrides.nextFollowUpAt, null) || personRow.next_follow_up_at || null;
  const safeName = isPlaceholderContactName(overrides.name)
    ? personRow.name
    : readOptionalString(overrides.name, personRow.name);

  statements.updatePerson.run(
    safeName,
    JSON.stringify(mergedTags),
    mergedNotes,
    nextFollowUpAt,
    now,
    personRow.id
  );

  return statements.selectPersonById.get(personRow.id);
}

function ensurePersonRecord(statements, personDraft = {}, preferredPersonId = '') {
  const requestedPersonId = cleanText(preferredPersonId || personDraft.personId || '');
  const existingById = requestedPersonId ? statements.selectPersonById.get(requestedPersonId) : null;

  if (requestedPersonId && !existingById) {
    throw new HttpError(404, 'personId not found', {
      field: 'personId',
      reason: 'missing_person',
    });
  }

  if (isPlaceholderContactName(personDraft.name) && !existingById) {
    throw new HttpError(400, 'name confirmation required', {
      field: 'personDraft.name',
      reason: 'placeholder_name',
    });
  }

  if (existingById) {
    return touchExistingPerson(statements, existingById, personDraft);
  }

  const existingByName = findExistingPersonByName(statements, personDraft.name);
  if (existingByName) {
    return touchExistingPerson(statements, existingByName, personDraft);
  }

  const now = nowIso();
  const personId = requestedPersonId || makeId('person');
  statements.insertPerson.run(
    personId,
    readOptionalString(personDraft.name, ''),
    JSON.stringify(cleanList(personDraft.tags)),
    sanitizeContactDraftText(personDraft.notes || ''),
    normalizeTimestampInput(personDraft.nextFollowUpAt, null),
    now,
    now
  );
  return statements.selectPersonById.get(personId);
}

function syncPersonIdentities(statements, personId, identities = []) {
  const existingRows = statements.listIdentitiesByPersonId.all(personId);
  const seen = new Set(
    existingRows.map((row) =>
      `${row.platform}::${cleanText(row.handle).toLowerCase()}::${cleanText(row.url).toLowerCase()}`
    )
  );

  const inserted = [];
  const normalizedIdentities = Array.isArray(identities)
    ? identities.filter((identity) => identity && typeof identity === 'object')
    : [];

  for (const identity of normalizedIdentities) {
    const platform = readOptionalString(identity.platform, '').toLowerCase();
    const handle = cleanText(identity.handle || '');
    const url = cleanText(identity.url || '');
    if (!platform || (!handle && !url)) continue;
    const dedupeKey = `${platform}::${handle.toLowerCase()}::${url.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    const identityId = makeId('identity');
    statements.insertIdentity.run(
      identityId,
      personId,
      platform,
      handle || null,
      url || null,
      cleanText(identity.note || ''),
      nowIso()
    );
    seen.add(dedupeKey);
    inserted.push(statements.listIdentitiesByPersonId.all(personId).find((row) => row.id === identityId));
  }

  return inserted.filter(Boolean);
}

function upsertEventPersonLink(
  statements,
  { eventId, personId, role = 'participant', sourceType = 'manual', sourceId = '', weight = 1 }
) {
  if (!eventId || !personId) return null;
  const existing = statements.selectEventPersonLinkByEventAndPerson.get(eventId, personId);
  const updatedAt = nowIso();
  if (existing) {
    statements.updateEventPersonLink.run(
      readOptionalString(role, 'participant'),
      readOptionalString(sourceType, 'manual'),
      readOptionalString(sourceId, ''),
      Number.isFinite(Number(weight)) ? Number(weight) : 1,
      updatedAt,
      existing.id
    );
    return formatEventPersonLinkRow(
      statements.selectEventPersonLinkByEventAndPerson.get(eventId, personId)
    );
  }

  const createdAt = updatedAt;
  const linkId = makeId('event_person');
  statements.insertEventPersonLink.run(
    linkId,
    eventId,
    personId,
    readOptionalString(role, 'participant'),
    readOptionalString(sourceType, 'manual'),
    readOptionalString(sourceId, ''),
    Number.isFinite(Number(weight)) ? Number(weight) : 1,
    createdAt,
    updatedAt
  );
  return formatEventPersonLinkRow(statements.selectEventPersonLinkByEventAndPerson.get(eventId, personId));
}

function resolvePeopleForEventLinking(statements, body = {}, normalizedPayload = {}) {
  const candidates = [];
  const explicitIds = cleanList(body.relatedPeople || normalizedPayload.relatedPeople);
  explicitIds.forEach((personId) => {
    const row = statements.selectPersonById.get(personId);
    if (row) candidates.push({ personId: row.id, role: 'participant', sourceType: 'manual', sourceId: '' });
  });

  const hintedPersonId = cleanText(body.personId || normalizedPayload.personId || '');
  if (hintedPersonId) {
    const row = statements.selectPersonById.get(hintedPersonId);
    if (row) candidates.push({ personId: row.id, role: 'subject', sourceType: 'suggestion', sourceId: '' });
  }

  const hintedName = cleanText(body.personName || normalizedPayload.personName || normalizedPayload.details?.personName || '');
  if (hintedName) {
    const row = findExistingPersonByName(statements, hintedName);
    if (row) candidates.push({ personId: row.id, role: 'subject', sourceType: 'suggestion', sourceId: '' });
  }

  const deduped = new Map();
  for (const candidate of candidates) {
    if (!candidate.personId || deduped.has(candidate.personId)) continue;
    deduped.set(candidate.personId, candidate);
  }
  return [...deduped.values()];
}

function toDateKey(value = nowIso()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return nowIso().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function isRowInDateRange(value, startInclusive, endExclusive) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= startInclusive && timestamp < endExclusive;
}

function insertPersonInteraction(statements, personId, interactionDraft = {}) {
  const summary = cleanText(interactionDraft.summary || '');
  const evidence = sanitizeContactDraftText(interactionDraft.evidence || summary);
  if (!summary && !evidence) return null;
  const interactionId = makeId('interaction');
  const happenedAt = normalizeTimestampInput(interactionDraft.happenedAt, nowIso());
  statements.insertInteraction.run(
    interactionId,
    personId,
    summary || evidence.slice(0, 220),
    happenedAt,
    evidence
  );
  const personRow = statements.selectPersonById.get(personId);
  if (personRow) {
    touchExistingPerson(statements, personRow, {});
  }
  return statements.listInteractionsByPersonId.all(personId).find((row) => row.id === interactionId) || null;
}

function insertSelfCheckinRow(statements, selfCheckinDraft = {}, fallbackTriggerText = 'manual') {
  const checkinId = makeId('checkin');
  const createdAt = nowIso();
  statements.insertSelfCheckin.run(
    checkinId,
    Number.isFinite(Number(selfCheckinDraft.energy)) ? Math.max(-2, Math.min(2, Number(selfCheckinDraft.energy))) : 0,
    JSON.stringify(cleanList(selfCheckinDraft.emotions)),
    cleanText(selfCheckinDraft.triggerText || fallbackTriggerText),
    cleanText(selfCheckinDraft.reflection || ''),
    createdAt
  );

  return {
    checkinId,
    energy: Number.isFinite(Number(selfCheckinDraft.energy)) ? Math.max(-2, Math.min(2, Number(selfCheckinDraft.energy))) : 0,
    emotions: cleanList(selfCheckinDraft.emotions),
    triggerText: cleanText(selfCheckinDraft.triggerText || fallbackTriggerText),
    reflection: cleanText(selfCheckinDraft.reflection || ''),
    createdAt,
  };
}

function commitCaptureDraft(statements, body = {}) {
  const source = readOptionalString(body.source, 'manual');
  const rawText = cleanText(body.text || body.rawText || '');
  const assetIds = cleanList(body.assetIds);
  const assets = selectCaptureAssetsByIds(statements, assetIds);
  const draft =
    body.personDraft || body.selfCheckinDraft || body.interactionDraft
      ? {
          rawText,
          combinedText: cleanText(body.combinedText || rawText || assets.map((asset) => asset.extractedText).join(' ')),
          source,
          personDraft:
            body.personDraft && typeof body.personDraft === 'object' && !Array.isArray(body.personDraft)
              ? body.personDraft
              : {},
          selfCheckinDraft:
            body.selfCheckinDraft && typeof body.selfCheckinDraft === 'object' && !Array.isArray(body.selfCheckinDraft)
              ? body.selfCheckinDraft
              : {},
          interactionDraft:
            body.interactionDraft && typeof body.interactionDraft === 'object' && !Array.isArray(body.interactionDraft)
              ? body.interactionDraft
              : {},
          assets,
        }
      : buildCaptureDraft({ text: rawText, source, assets });

  const captureId = makeId('capture');
  const createdAt = nowIso();
  let personRow;
  let interactionRow;
  let checkinRow;
  const requestedPersonId = cleanText(body.personId || draft.personDraft?.personId || '');
  const existingPersonTarget = requestedPersonId ? statements.selectPersonById.get(requestedPersonId) : null;

  if (requestedPersonId && !existingPersonTarget) {
    throw new HttpError(404, 'personId not found', {
      field: 'personId',
      reason: 'missing_person',
    });
  }

  if (isPlaceholderContactName(draft.personDraft?.name) && !existingPersonTarget) {
    throw new HttpError(400, 'name confirmation required', {
      field: 'personDraft.name',
      reason: 'placeholder_name',
    });
  }

  statements.db.exec('BEGIN');
  try {
    personRow = ensurePersonRecord(statements, draft.personDraft, body.personId);
    syncPersonIdentities(statements, personRow.id, draft.personDraft.identities);
    interactionRow = insertPersonInteraction(statements, personRow.id, draft.interactionDraft);
    checkinRow = insertSelfCheckinRow(statements, draft.selfCheckinDraft, source);

    const auditPayload = {
      text: draft.rawText,
      combinedText: draft.combinedText,
      source,
      personId: personRow.id,
      interactionId: interactionRow?.id || null,
      checkinId: checkinRow.checkinId,
      assetIds: assets.map((asset) => asset.assetId),
      personDraft: draft.personDraft,
      selfCheckinDraft: draft.selfCheckinDraft,
      interactionDraft: draft.interactionDraft,
    };

    statements.insertAudit.run(captureId, 'capture', JSON.stringify(auditPayload), createdAt);
    statements.db.exec('COMMIT');
  } catch (error) {
    statements.db.exec('ROLLBACK');
    throw error;
  }

  return {
    capture: formatCaptureRow({
      id: captureId,
      payload: JSON.stringify({
        text: draft.rawText,
        combinedText: draft.combinedText,
        source,
        personId: personRow.id,
        assetIds: assets.map((asset) => asset.assetId),
      }),
      created_at: createdAt,
    }),
    person: formatPersonRow(statements.selectPersonById.get(personRow.id)),
    detail: buildPeopleDetailPayload(statements, personRow.id),
    interaction: interactionRow ? formatInteractionRow(interactionRow) : null,
    checkin: checkinRow,
    assets,
    createdAt,
  };
}

function upsertMirrorEvidenceRows(statements, mirrorId, structuredMirror) {
  statements.deleteMirrorEvidenceByMirrorId.run(mirrorId);
  const conclusions = Array.isArray(structuredMirror.conclusions) ? structuredMirror.conclusions : [];

  for (const conclusion of conclusions) {
    const claimKey = cleanText(conclusion.title || '');
    const evidence = Array.isArray(conclusion.evidence?.evidence) ? conclusion.evidence.evidence : [];
    for (const evidenceItem of evidence) {
      statements.insertMirrorEvidence.run(
        makeId('mirror_evidence'),
        mirrorId,
        claimKey || 'evidence',
        readOptionalString(evidenceItem.sourceType, 'unknown'),
        readOptionalString(evidenceItem.sourceId, ''),
        cleanText(evidenceItem.snippet || ''),
        nowIso()
      );
    }
  }
}

function buildMirrorWindow(cadence, periodKey = '') {
  if (cadence === 'daily') {
    const key = readOptionalString(periodKey, toDateKey());
    const start = Date.parse(`${key}T00:00:00.000Z`);
    const end = start + 24 * 60 * 60 * 1000;
    return {
      cadence: 'daily',
      periodKey: key,
      rangeLabel: `daily:${key}`,
      startInclusive: start,
      endExclusive: end,
    };
  }

  const todayKey = toDateKey();
  const end = Date.parse(`${todayKey}T23:59:59.999Z`) + 1;
  const start = end - 7 * 24 * 60 * 60 * 1000;
  return {
    cadence: 'weekly',
    periodKey: readOptionalString(periodKey, todayKey),
    rangeLabel: 'last-7d',
    startInclusive: start,
    endExclusive: end,
  };
}

function filterMirrorSourceRows(rows, fieldName, window) {
  return rows.filter((row) => isRowInDateRange(row?.[fieldName], window.startInclusive, window.endExclusive));
}

function buildMirrorPayloadFromWindow(statements, { cadence = 'weekly', periodKey = '' } = {}) {
  const window = buildMirrorWindow(cadence, periodKey);
  const checkins = dedupeMeaningfulCheckins(
    filterMirrorSourceRows(statements.listRecentSelfCheckins.all(80), 'created_at', window),
    cadence === 'daily' ? 12 : 24
  );
  const captures = filterMirrorSourceRows(
    statements.listRecentCaptures.all(80).map(formatCaptureRow),
    'createdAt',
    window
  );
  const interactions = filterMirrorSourceRows(
    statements.listRecentInteractions.all(80).map(formatInteractionRow),
    'happenedAt',
    window
  );

  const structuredMirror = buildStructuredMirror({ checkins, captures, interactions });

  if (cadence === 'daily') {
    structuredMirror.summaryText =
      structuredMirror.summaryText && !structuredMirror.summaryText.includes('本周')
        ? structuredMirror.summaryText
        : 'Today reflected a lighter loop of people, progress, and self signal.';
  }

  return {
    window,
    structuredMirror,
    checkins,
    captures,
    interactions,
  };
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) {
      throw new HttpError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
  }

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}

function initDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  runSchemaMigrations(db);
  return db;
}

function buildStatements(db) {
  return {
    db,

    insertAudit: db.prepare('INSERT INTO Audit(id, action, payload, created_at) VALUES(?, ?, ?, ?)'),
    selectAuditById: db.prepare('SELECT id FROM Audit WHERE id = ? LIMIT 1'),
    selectAuditDetailById: db.prepare(`
      SELECT id, action, payload, created_at
      FROM Audit
      WHERE id = ?
      LIMIT 1
    `),
    listRecentCaptures: db.prepare(`
      SELECT id, payload, created_at
      FROM Audit
      WHERE action = 'capture'
      ORDER BY created_at DESC
      LIMIT ?
    `),
    listRecentAudits: db.prepare(`
      SELECT id, action, payload, created_at
      FROM Audit
      ORDER BY created_at DESC
      LIMIT ?
    `),

    insertCaptureAsset: db.prepare(`
      INSERT INTO CaptureAsset(id, kind, mime_type, file_name, local_path, extracted_text, metadata, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `),
    selectCaptureAssetById: db.prepare(`
      SELECT id, kind, mime_type, file_name, local_path, extracted_text, metadata, created_at
      FROM CaptureAsset
      WHERE id = ?
      LIMIT 1
    `),
    listRecentCaptureAssets: db.prepare(`
      SELECT id, kind, mime_type, file_name, local_path, extracted_text, metadata, created_at
      FROM CaptureAsset
      ORDER BY created_at DESC
      LIMIT ?
    `),

    insertEvent: db.prepare('INSERT INTO Event(id, title, payload, created_at) VALUES(?, ?, ?, ?)'),
    selectEventById: db.prepare('SELECT id, title FROM Event WHERE id = ? LIMIT 1'),
    selectEventDetailById: db.prepare('SELECT id, title, payload, created_at FROM Event WHERE id = ? LIMIT 1'),
    listRecentEvents: db.prepare(`
      SELECT id, title, payload, created_at
      FROM Event
      ORDER BY created_at DESC
      LIMIT ?
    `),
    insertEventPersonLink: db.prepare(`
      INSERT INTO EventPersonLink(id, event_id, person_id, role, source_type, source_id, weight, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    selectEventPersonLinkByEventAndPerson: db.prepare(`
      SELECT id, event_id, person_id, role, source_type, source_id, weight, created_at, updated_at
      FROM EventPersonLink
      WHERE event_id = ? AND person_id = ?
      LIMIT 1
    `),
    updateEventPersonLink: db.prepare(`
      UPDATE EventPersonLink
      SET role = ?, source_type = ?, source_id = ?, weight = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteEventPersonLinkByEventAndPerson: db.prepare(`
      DELETE FROM EventPersonLink
      WHERE event_id = ? AND person_id = ?
    `),
    listEventPersonLinksByEventId: db.prepare(`
      SELECT id, event_id, person_id, role, source_type, source_id, weight, created_at, updated_at
      FROM EventPersonLink
      WHERE event_id = ?
      ORDER BY updated_at DESC
    `),
    listEventPersonLinksByPersonId: db.prepare(`
      SELECT id, event_id, person_id, role, source_type, source_id, weight, created_at, updated_at
      FROM EventPersonLink
      WHERE person_id = ?
      ORDER BY updated_at DESC
    `),

    insertPerson: db.prepare(`
      INSERT INTO Person(id, name, tags, notes, next_follow_up_at, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `),
    updatePerson: db.prepare(`
      UPDATE Person
      SET name = ?, tags = ?, notes = ?, next_follow_up_at = ?, updated_at = ?
      WHERE id = ?
    `),
    selectPersonById: db.prepare(`
      SELECT id, name, tags, notes, next_follow_up_at, created_at, updated_at
      FROM Person
      WHERE id = ?
      LIMIT 1
    `),
    listRecentPeople: db.prepare(`
      SELECT id, name, tags, notes, next_follow_up_at, created_at, updated_at
      FROM Person
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    listAllPeople: db.prepare(`
      SELECT id, name, tags, notes, next_follow_up_at, created_at, updated_at
      FROM Person
      ORDER BY updated_at DESC
    `),

    searchPeopleByKeyword: db.prepare(`
      SELECT id, name, tags, notes, next_follow_up_at, updated_at
      FROM Person
      WHERE lower(name) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    insertIdentity: db.prepare(`
      INSERT INTO Identity(id, person_id, platform, handle, url, note, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `),
    listIdentitiesByPersonId: db.prepare(`
      SELECT id, person_id, platform, handle, url, note, created_at
      FROM Identity
      WHERE person_id = ?
      ORDER BY created_at DESC
    `),
    insertInteraction: db.prepare(`
      INSERT INTO Interaction(id, person_id, summary, happened_at, evidence)
      VALUES(?, ?, ?, ?, ?)
    `),
    listInteractionsByPersonId: db.prepare(`
      SELECT id, person_id, summary, happened_at, evidence
      FROM Interaction
      WHERE person_id = ?
      ORDER BY happened_at DESC
    `),
    listRecentInteractions: db.prepare(`
      SELECT id, person_id, summary, happened_at, evidence
      FROM Interaction
      ORDER BY happened_at DESC
      LIMIT ?
    `),

    insertDraft: db.prepare(
      'INSERT INTO PostDraft(id, event_id, platform, language, content, metadata, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)'
    ),
    selectDraftById: db.prepare(`
      SELECT id, event_id, platform, language, content, metadata, created_at
      FROM PostDraft
      WHERE id = ?
      LIMIT 1
    `),
    updateDraftContentMetadata: db.prepare(`
      UPDATE PostDraft
      SET content = ?, metadata = ?
      WHERE id = ?
    `),
    listRecentDrafts: db.prepare(`
      SELECT
        draft.id,
        draft.event_id,
        draft.platform,
        draft.language,
        draft.content,
        draft.metadata,
        draft.created_at,
        event.title AS event_title
      FROM PostDraft AS draft
      LEFT JOIN Event AS event ON event.id = draft.event_id
      ORDER BY draft.created_at DESC
      LIMIT ?
    `),
    listDraftsByEventId: db.prepare(`
      SELECT
        draft.id,
        draft.event_id,
        draft.platform,
        draft.language,
        draft.content,
        draft.metadata,
        draft.created_at,
        event.title AS event_title
      FROM PostDraft AS draft
      LEFT JOIN Event AS event ON event.id = draft.event_id
      WHERE draft.event_id = ?
      ORDER BY draft.created_at DESC
    `),

    insertQueueTask: db.prepare(
      'INSERT INTO PublishTask(id, draft_id, platform, mode, status, result, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    listRecentQueueTasks: db.prepare(`
      SELECT
        task.id,
        task.draft_id,
        task.platform,
        task.mode,
        task.status,
        task.result,
        task.created_at,
        task.updated_at,
        draft.event_id,
        draft.language,
        draft.content,
        draft.metadata,
        event.title AS event_title
      FROM PublishTask AS task
      INNER JOIN PostDraft AS draft ON draft.id = task.draft_id
      LEFT JOIN Event AS event ON event.id = draft.event_id
      ORDER BY task.updated_at DESC
      LIMIT ?
    `),

    selectQueueTaskById: db.prepare(`
      SELECT
        task.id,
        task.draft_id,
        task.platform,
        task.mode,
        task.status,
        task.result,
        task.created_at,
        task.updated_at,
        draft.event_id,
        draft.language,
        draft.content,
        draft.metadata
      FROM PublishTask AS task
      INNER JOIN PostDraft AS draft ON draft.id = task.draft_id
      WHERE task.id = ?
      LIMIT 1
    `),

    updateQueueTaskExecution: db.prepare(
      'UPDATE PublishTask SET mode = ?, status = ?, result = ?, updated_at = ? WHERE id = ?'
    ),

    insertDigest: db.prepare(
      'INSERT INTO DevDigest(id, run_id, what, why, risk, verify, next, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    listRecentDigests: db.prepare(`
      SELECT id, run_id, what, why, risk, verify, next, created_at
      FROM DevDigest
      ORDER BY created_at DESC
      LIMIT ?
    `),

    insertSelfCheckin: db.prepare(
      'INSERT INTO SelfCheckin(id, energy, emotions, trigger_text, reflection, created_at) VALUES(?, ?, ?, ?, ?, ?)'
    ),
    listRecentSelfCheckins: db.prepare(`
      SELECT id, energy, emotions, trigger_text, reflection, created_at
      FROM SelfCheckin
      ORDER BY created_at DESC
      LIMIT ?
    `),

    insertMirror: db.prepare(
      'INSERT INTO Mirror(id, range_label, cadence, period_key, content, created_at) VALUES(?, ?, ?, ?, ?, ?)'
    ),
    selectMirrorById: db.prepare(`
      SELECT id, range_label, cadence, period_key, content, created_at
      FROM Mirror
      WHERE id = ?
      LIMIT 1
    `),
    selectLatestMirror: db.prepare(`
      SELECT id, range_label, cadence, period_key, content, created_at
      FROM Mirror
      ORDER BY created_at DESC
      LIMIT 1
    `),
    selectLatestMirrorByCadence: db.prepare(`
      SELECT id, range_label, cadence, period_key, content, created_at
      FROM Mirror
      WHERE cadence = ?
      ORDER BY created_at DESC
      LIMIT 1
    `),
    listRecentMirrorsByCadence: db.prepare(`
      SELECT id, range_label, cadence, period_key, content, created_at
      FROM Mirror
      WHERE cadence = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    insertMirrorEvidence: db.prepare(`
      INSERT INTO MirrorEvidence(id, mirror_id, claim_key, source_type, source_id, snippet, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `),
    deleteMirrorEvidenceByMirrorId: db.prepare(`
      DELETE FROM MirrorEvidence
      WHERE mirror_id = ?
    `),
    listMirrorEvidenceByMirrorId: db.prepare(`
      SELECT id, mirror_id, claim_key, source_type, source_id, snippet, created_at
      FROM MirrorEvidence
      WHERE mirror_id = ?
      ORDER BY created_at ASC
    `),
  };
}

function formatCaptureRow(row) {
  const payload = safeParseJsonObject(row.payload, {});
  return {
    captureId: row.id,
    text: readOptionalString(payload.text, ''),
    source: readOptionalString(payload.source, 'manual'),
    personId: readOptionalString(payload.personId, ''),
    assetIds: Array.isArray(payload.assetIds) ? payload.assetIds : [],
    combinedText: readOptionalString(payload.combinedText, ''),
    createdAt: row.created_at,
  };
}

function formatCaptureAssetRow(row) {
  const metadata = safeParseJsonObject(row.metadata, {});
  return {
    assetId: row.id,
    kind: row.kind,
    mimeType: readOptionalString(row.mime_type, ''),
    fileName: readOptionalString(row.file_name, ''),
    localPath: readOptionalString(row.local_path, ''),
    extractedText: readOptionalString(row.extracted_text, ''),
    metadata,
    previewText: readOptionalString(metadata.previewText, ''),
    status: readOptionalString(metadata.status, 'parsed'),
    deliveryMode: readOptionalString(metadata.deliveryMode, row.kind === 'audio' ? 'voice' : 'asset'),
    analysisMethod: readOptionalString(metadata.analysisMethod, ''),
    hasOriginalFile: Boolean(readOptionalString(row.local_path, '')),
    originalUrl: readOptionalString(row.local_path, '') ? `/capture/assets/${encodeURIComponent(row.id)}/original` : '',
    createdAt: row.created_at,
  };
}

function formatEventRow(row) {
  return {
    eventId: row.id,
    title: row.title,
    payload: safeParseJsonObject(row.payload, {}),
    createdAt: row.created_at,
  };
}

function formatPersonRow(row) {
  return {
    personId: row.id,
    name: row.name,
    tags: parseJsonStringArray(row.tags),
    notes: sanitizeContactDraftText(readOptionalString(row.notes, '')),
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatIdentityRow(row) {
  return {
    identityId: row.id,
    personId: row.person_id,
    platform: row.platform,
    platformLabel: formatPlatformLabel(row.platform),
    handle: readOptionalString(row.handle, ''),
    url: readOptionalString(row.url, ''),
    note: readOptionalString(row.note, ''),
    createdAt: row.created_at,
  };
}

function formatInteractionRow(row) {
  return {
    interactionId: row.id,
    personId: row.person_id,
    summary: sanitizeContactDraftText(readOptionalString(row.summary, '')),
    happenedAt: row.happened_at,
    evidence: sanitizeContactDraftText(readOptionalString(row.evidence, '')),
  };
}

function formatDraftRow(row) {
  const metadata = safeParseJsonObject(row.metadata, {});
  return {
    draftId: row.id,
    eventId: row.event_id,
    eventTitle: readOptionalString(row.event_title, ''),
    platform: row.platform,
    platformLabel: formatPlatformLabel(row.platform),
    platformShellLabel: formatPlatformShellLabel(row.platform),
    language: row.language,
    content: row.content,
    metadata,
    capability: metadata.capability || getPlatformCapability(row.platform),
    publishPackage: metadata.publishPackage || null,
    validation: metadata.validation || null,
    variants: normalizeStringList(metadata.variants),
    createdAt: row.created_at,
  };
}

function dedupeLatestDrafts(drafts, limit = drafts.length) {
  const latestByKey = new Map();

  for (const draft of drafts) {
    const scopeKey = draft.eventId
      ? `event:${draft.eventId}`
      : `draft:${draft.draftId || `${draft.createdAt || ''}:${cleanText(draft.content || '').slice(0, 32)}`}`;
    const key = [scopeKey, draft.platform || '', draft.language || ''].join('::');
    const existing = latestByKey.get(key);
    const draftTime = Date.parse(draft.createdAt || 0);
    const existingTime = existing ? Date.parse(existing.createdAt || 0) : 0;

    if (!existing || draftTime >= existingTime) {
      latestByKey.set(key, draft);
    }
  }

  return [...latestByKey.values()]
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
    .slice(0, limit);
}

function dedupeLatestQueueTasks(queueTasks, limit = queueTasks.length) {
  const latestByKey = new Map();

  for (const task of queueTasks) {
    const key = [task.draftId || '', task.platform || ''].join('::');
    const existing = latestByKey.get(key);
    const taskTime = Date.parse(task.updatedAt || task.createdAt || 0);
    const existingTime = existing ? Date.parse(existing.updatedAt || existing.createdAt || 0) : 0;

    if (!existing || taskTime >= existingTime) {
      latestByKey.set(key, task);
    }
  }

  return [...latestByKey.values()]
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0)
    )
    .slice(0, limit);
}

function formatQueueTaskRow(row) {
  const metadata = safeParseJsonObject(row.metadata, {});
  const result = safeParseJsonObject(row.result, {});
  return {
    taskId: row.id,
    draftId: row.draft_id,
    eventId: row.event_id,
    eventTitle: readOptionalString(row.event_title, ''),
    platform: row.platform,
    platformLabel: formatPlatformLabel(row.platform),
    language: row.language,
    mode: row.mode,
    status: row.status,
    content: row.content,
    metadata,
    result,
    capability: metadata.capability || getPlatformCapability(row.platform),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMirrorEvidenceRow(row) {
  return {
    evidenceId: row.id,
    mirrorId: row.mirror_id,
    claimKey: row.claim_key,
    sourceType: row.source_type,
    sourceId: row.source_id,
    snippet: readOptionalString(row.snippet, ''),
    createdAt: row.created_at,
  };
}

async function routeRequest(req, res, statements) {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;
  const peopleDetailMatch = pathname.match(/^\/people\/([^/]+)$/u);
  const peopleIdentityMatch = pathname.match(/^\/people\/([^/]+)\/identity$/u);
  const peopleInteractionMatch = pathname.match(/^\/people\/([^/]+)\/interaction$/u);
  const draftDetailMatch = pathname.match(/^\/drafts\/([^/]+)$/u);
  const draftValidateMatch = pathname.match(/^\/drafts\/([^/]+)\/validate$/u);

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/hackathon/overview') {
    sendJson(res, 200, buildHackathonOverviewPayload(statements));
    return;
  }

  if (method === 'GET' && pathname === '/proofs') {
    const bounty = normalizeBountyMode(requestUrl.searchParams.get('bounty'));
    const kind = readOptionalString(requestUrl.searchParams.get('kind'), '').toLowerCase();
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 20, 100);
    const proofs = buildHackathonProofCatalog(statements)
      .filter((proof) => !bounty || proof.bounties.includes(bounty))
      .filter((proof) => !kind || proof.kind === kind)
      .slice(0, limit);
    const proofMetadata = buildProofResponseMetadata(bounty, proofs);
    sendJson(res, 200, {
      bounty,
      kind,
      limit,
      count: proofs.length,
      ...(proofMetadata || {}),
      proofs,
    });
    return;
  }

  if (method === 'GET' && pathname === '/captures') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 50);
    const captures = statements.listRecentCaptures.all(limit).map(formatCaptureRow);
    sendJson(res, 200, { limit, count: captures.length, captures });
    return;
  }

  if (method === 'GET' && pathname === '/capture/assets') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 50);
    const assets = statements.listRecentCaptureAssets.all(limit).map(formatCaptureAssetRow);
    sendJson(res, 200, { limit, count: assets.length, assets });
    return;
  }

  const captureAssetOriginalMatch = pathname.match(/^\/capture\/assets\/([^/]+)\/original$/u);
  if (method === 'GET' && captureAssetOriginalMatch) {
    const assetId = decodeURIComponent(captureAssetOriginalMatch[1] || '');
    const asset = statements.selectCaptureAssetById.get(assetId);
    if (!asset) throw new HttpError(404, 'asset not found');
    const localPath = readOptionalString(asset.local_path, '');
    if (!localPath || !fs.existsSync(localPath)) throw new HttpError(404, 'original asset file not found');

    res.writeHead(200, {
      'content-type': readOptionalString(asset.mime_type, 'application/octet-stream'),
      'content-disposition': `inline; filename="${encodeURIComponent(
        readOptionalString(
          asset.file_name,
          `${assetId}${inferAssetExtension(readOptionalString(asset.mime_type, ''), '', readOptionalString(asset.kind, 'asset'))}`
        )
      )}"`,
      'cache-control': 'private, max-age=0, must-revalidate',
    });
    res.end(fs.readFileSync(localPath));
    return;
  }

  if (method === 'GET' && pathname === '/cockpit/summary') {
    sendJson(res, 200, buildCockpitSummary(statements));
    return;
  }

  if (method === 'GET' && pathname === '/ask/search') {
    const query = readOptionalString(requestUrl.searchParams.get('query'), '');
    sendJson(res, 200, buildAskSearchPayload(statements, query));
    return;
  }

  if (method === 'GET' && pathname === '/workspace/bootstrap') {
    sendJson(res, 200, buildWorkspaceBootstrapPayload(statements));
    return;
  }

  if (method === 'GET' && pathname === '/graph/overview') {
    const focusType = readOptionalString(requestUrl.searchParams.get('focusType'), '');
    const focusId = readOptionalString(requestUrl.searchParams.get('focusId'), '');
    if (!focusType || !focusId) throw new HttpError(400, 'focusType and focusId are required');
    sendJson(res, 200, buildGraphOverview(statements, { focusType, focusId }));
    return;
  }

  if ((method === 'GET' || method === 'POST') && pathname === '/events/command') {
    const body = method === 'POST' ? await readJsonBody(req) : null;
    const query = readOptionalString(method === 'POST' ? body?.query : requestUrl.searchParams.get('query'), '');
    const limit = normalizeSearchLimit(method === 'POST' ? body?.limit : requestUrl.searchParams.get('limit'), 8);
    const payload = await buildEventsCommandPayload(statements, query, 'events-command');
    sendJson(res, 200, {
      ...payload,
      count: payload.results.slice(0, limit).length,
      results: payload.results.slice(0, limit),
    });
    return;
  }

  if (method === 'GET' && pathname === '/events') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 50);
    const query = readOptionalString(requestUrl.searchParams.get('query'), '');
    if (!query) {
      const events = statements.listRecentEvents.all(limit).map(formatEventRow);
      sendJson(res, 200, { limit, query: '', count: events.length, events, results: events, retrieval: null });
      return;
    }
    const eventAssist = await buildEventCommandAssist({ query, source: 'events-search', statements });
    const results = searchEventMatches(statements, query, limit, eventAssist);
    sendJson(res, 200, {
      limit,
      query,
      count: results.length,
      events: results,
      results,
      retrieval: {
        mode: 'model-first-hybrid',
        effectiveProvider: eventAssist.extraction?.model ? 'openai' : 'local',
        semanticBoostEnabled: false,
        fallback: 'keyword + graph + recency',
      },
      extraction: eventAssist.extraction || { method: 'heuristic', model: '' },
    });
    return;
  }

  const eventDetailMatch = pathname.match(/^\/events\/([^/]+)$/u);
  if (method === 'GET' && eventDetailMatch) {
    const eventId = decodeURIComponent(eventDetailMatch[1]);
    const payload = buildEventDetailPayload(statements, eventId);
    if (!payload) throw new HttpError(404, 'eventId not found');
    sendJson(res, 200, payload);
    return;
  }

  if ((method === 'GET' || method === 'POST') && pathname === '/people/command') {
    const body = method === 'POST' ? await readJsonBody(req) : null;
    const query = readOptionalString(method === 'POST' ? body?.query : requestUrl.searchParams.get('query'), '');
    const limit = normalizeSearchLimit(method === 'POST' ? body?.limit : requestUrl.searchParams.get('limit'), 8);
    const payload = await buildPeopleCommandPayload(statements, query, 'people-command');
    sendJson(res, 200, {
      ...payload,
      count: payload.results.slice(0, limit).length,
      results: payload.results.slice(0, limit),
    });
    return;
  }

  if (method === 'GET' && pathname === '/people') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 8, 50);
    const query = readOptionalString(requestUrl.searchParams.get('query'), '');
    const embeddingsSettings = resolveEmbeddingsSettings();

    if (!query) {
      const people = statements.listRecentPeople.all(limit * 3).filter(isDisplayablePersonRow).map(formatPersonRow).slice(0, limit);
      sendJson(res, 200, { query: '', count: people.length, people, retrieval: null });
      return;
    }

    const searchAssist = await buildPersonSearchAssist({ query, source: 'people-search' });
    const results = searchPeopleMatches(statements, query, limit, null, searchAssist);

    sendJson(res, 200, {
      query,
      retrieval: {
        mode: embeddingsSettings.retrievalMode,
        effectiveProvider: embeddingsSettings.effectiveProvider,
        semanticBoostEnabled: embeddingsSettings.semanticBoostEnabled,
        fallback: 'keyword + graph + recency',
      },
      extraction: searchAssist.extraction || { method: 'heuristic', model: '' },
      count: results.length,
      results,
    });
    return;
  }

  if (method === 'GET' && peopleDetailMatch) {
    const personId = parseDynamicId(peopleDetailMatch);
    const detail = buildPeopleDetailPayload(statements, personId);
    if (!detail) throw new HttpError(404, 'personId not found');
    sendJson(res, 200, detail);
    return;
  }

  const eventPeopleMatch = pathname.match(/^\/events\/([^/]+)\/people$/u);
  if (method === 'POST' && eventPeopleMatch) {
    const eventId = decodeURIComponent(eventPeopleMatch[1]);
    const event = statements.selectEventById.get(eventId);
    if (!event) throw new HttpError(404, 'eventId not found');
    const body = await readJsonBody(req);
    const personId = requireString(body.personId, 'personId');
    const person = statements.selectPersonById.get(personId);
    if (!person) throw new HttpError(404, 'personId not found');
    const link = upsertEventPersonLink(statements, {
      eventId,
      personId,
      role: readOptionalString(body.role, 'participant'),
      sourceType: readOptionalString(body.sourceType, 'manual'),
      sourceId: readOptionalString(body.sourceId, ''),
      weight: Number(body.weight || 1),
    });
    sendJson(res, 201, {
      link,
      event: buildEventDetailPayload(statements, eventId),
      person: buildPeopleDetailPayload(statements, personId),
    });
    return;
  }

  const eventPersonDeleteMatch = pathname.match(/^\/events\/([^/]+)\/people\/([^/]+)$/u);
  if (method === 'DELETE' && eventPersonDeleteMatch) {
    const eventId = decodeURIComponent(eventPersonDeleteMatch[1]);
    const personId = decodeURIComponent(eventPersonDeleteMatch[2]);
    statements.deleteEventPersonLinkByEventAndPerson.run(eventId, personId);
    sendJson(res, 200, {
      ok: true,
      event: buildEventDetailPayload(statements, eventId),
      person: buildPeopleDetailPayload(statements, personId),
    });
    return;
  }

  if (method === 'GET' && pathname === '/drafts') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 24, 100);
    const eventId = readOptionalString(requestUrl.searchParams.get('eventId'), '');
    const platform = readOptionalString(requestUrl.searchParams.get('platform'), '').toLowerCase();
    const drafts = dedupeLatestDrafts(
      statements.listRecentDrafts
        .all(limit * 6)
        .map(formatDraftRow),
      limit * 3
    )
      .filter((draft) => !eventId || draft.eventId === eventId)
      .filter((draft) => !platform || draft.platform === platform)
      .slice(0, limit);
    sendJson(res, 200, { limit, count: drafts.length, drafts });
    return;
  }

  if (method === 'GET' && pathname === '/queue/tasks') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 24, 100);
    const statusFilter = readOptionalString(requestUrl.searchParams.get('status'), '').toLowerCase();
    const includeHistory = readBooleanLike(requestUrl.searchParams.get('includeHistory'), false);
    const latestOnly = readBooleanLike(requestUrl.searchParams.get('latestOnly'), false);
    const dedupeLatestOnly = latestOnly && !includeHistory;
    const queueTaskRows = statements.listRecentQueueTasks.all(limit * 6).map(formatQueueTaskRow);
    const queueTasks = (dedupeLatestOnly ? dedupeLatestQueueTasks(queueTaskRows, limit * 3) : queueTaskRows)
      .filter((task) => !statusFilter || task.status.toLowerCase() === statusFilter)
      .slice(0, limit);
    sendJson(res, 200, { limit, count: queueTasks.length, queueTasks });
    return;
  }

  if (method === 'GET' && pathname === '/studio/bootstrap') {
    sendJson(res, 200, getStudioControlPlane().buildBootstrap());
    return;
  }

  if (method === 'GET' && pathname === '/studio/tasks') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 100);
    const statusFilter = readOptionalString(requestUrl.searchParams.get('status'), '');
    const studio = getStudioControlPlane();
    const tasks = studio.listTasks({ limit, status: statusFilter });
    sendJson(res, 200, {
      limit,
      count: tasks.length,
      tasks,
      studio: studio.buildBootstrap(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/studio/tasks') {
    const body = await readJsonBody(req);
    const task = createStudioTaskFromBody(body);
    sendJson(res, 201, {
      task,
      studio: getStudioControlPlane().buildBootstrap(),
    });
    return;
  }

  const studioTaskDetailMatch = pathname.match(/^\/studio\/tasks\/([^/]+)$/u);
  if (studioTaskDetailMatch && method === 'GET') {
    const taskId = decodeURIComponent(studioTaskDetailMatch[1]);
    const studio = getStudioControlPlane();
    const task = studio.getTask(taskId);
    if (!task) throw new HttpError(404, 'task not found');
    sendJson(res, 200, {
      task,
      runs: studio.getRuns(20).filter((run) => run.taskId === taskId),
    });
    return;
  }

  if (studioTaskDetailMatch && method === 'PATCH') {
    const taskId = decodeURIComponent(studioTaskDetailMatch[1]);
    const body = await readJsonBody(req);
    const task = getStudioControlPlane().updateTask(taskId, body);
    sendJson(res, 200, { task });
    return;
  }

  const studioTaskRunMatch = pathname.match(/^\/studio\/tasks\/([^/]+)\/run$/u);
  if (studioTaskRunMatch && method === 'POST') {
    const taskId = decodeURIComponent(studioTaskRunMatch[1]);
    const execution = getStudioControlPlane().runTask(taskId);
    sendJson(res, 200, execution);
    return;
  }

  if (method === 'GET' && pathname === '/studio/runs') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 10, 100);
    const runs = getStudioControlPlane().getRuns(limit);
    sendJson(res, 200, { limit, count: runs.length, runs });
    return;
  }

  const studioRunDetailMatch = pathname.match(/^\/studio\/runs\/([^/]+)$/u);
  if (studioRunDetailMatch && method === 'GET') {
    const runId = decodeURIComponent(studioRunDetailMatch[1]);
    const run = getStudioControlPlane().getRun(runId);
    if (!run) throw new HttpError(404, 'run not found');
    sendJson(res, 200, run);
    return;
  }

  if (method === 'GET' && pathname === '/studio/agents') {
    const studio = getStudioControlPlane();
    sendJson(res, 200, {
      agents: studio.getAgents(),
      cluster: studio.getClusterSummary(),
      codex: buildCodexLayerSummary(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/studio/settings') {
    const studio = getStudioControlPlane();
    sendJson(res, 200, {
      ...studio.getSettingsPayload(),
      cluster: studio.getClusterSummary(),
      status: studio.getStatus(),
      codex: buildCodexLayerSummary(),
      embeddings: resolveEmbeddingsSettings(),
    });
    return;
  }

  if (method === 'PATCH' && pathname === '/studio/settings') {
    const body = await readJsonBody(req);
    const settings = getStudioControlPlane().patchSettings(body);
    sendJson(res, 200, {
      ...settings,
      cluster: buildFoundryClusterSummary(),
      status: buildOpsStatus(),
    });
    return;
  }

  const studioCommandMatch = pathname.match(/^\/studio\/commands\/([^/]+)$/u);
  if (studioCommandMatch && method === 'POST') {
    const command = decodeURIComponent(studioCommandMatch[1]).toLowerCase();
    if (!STUDIO_COMMANDS.includes(command)) {
      throw new HttpError(400, `unsupported Studio command: ${command}`);
    }
    const result = getStudioControlPlane().executeCommand(command);
    sendJson(res, 200, result);
    return;
  }

  if (pathname.startsWith('/ops/')) {
    throw new HttpError(410, 'legacy /ops endpoints were retired; use /studio/* instead');
  }

  if (method === 'GET' && pathname === '/ops/status') {
    sendJson(res, 200, buildOpsStatus());
    return;
  }

  if (method === 'GET' && pathname === '/ops/cluster') {
    sendJson(res, 200, {
      foundry: buildFoundryClusterSummary(),
      codex: buildCodexLayerSummary(),
      blocked: parseBlockedTasks(readTextFileOrDefault(QUEUE_PATH, ''), 20),
    });
    return;
  }

  if (method === 'GET' && pathname === '/ops/tasks') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 100);
    const tasks = listStructuredTasks({ repoRoot: REPO_ROOT, limit });
    sendJson(res, 200, {
      limit,
      count: tasks.length,
      tasks,
      foundry: buildFoundryClusterSummary(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/ops/runs') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 10, 100);
    const runs = listRecentRunReports(limit);
    sendJson(res, 200, { limit, count: runs.length, runs });
    return;
  }

  if (method === 'GET' && pathname === '/ops/blocked') {
    const queueMarkdown = readTextFileOrDefault(QUEUE_PATH, '');
    const blockedTasks = parseBlockedTasks(queueMarkdown, 100);
    sendJson(res, 200, { count: blockedTasks.length, blockedTasks });
    return;
  }

  if (method === 'GET' && pathname === '/settings/embeddings') {
    sendJson(res, 200, resolveEmbeddingsSettings());
    return;
  }

  if (method === 'GET' && pathname === '/settings/runtime') {
    const studio = getStudioControlPlane();
    sendJson(res, 200, {
      publishMode: studio.getPublishMode(),
      liveEnvironmentEnabled: isLiveEnvironmentEnabled(),
      embeddings: resolveEmbeddingsSettings(),
      foundry: buildFoundryClusterSummary(),
      studio: studio.buildBootstrap(),
      codex: buildCodexLayerSummary(),
      ops: buildOpsStatus(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/dev-digest') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 20, 100);
    const digests = statements.listRecentDigests.all(limit);
    sendJson(res, 200, { limit, count: digests.length, digests });
    return;
  }

  if (method === 'GET' && pathname === '/self-mirror') {
    const cadence = readOptionalString(requestUrl.searchParams.get('cadence'), 'weekly') || 'weekly';
    const periodKey = readOptionalString(requestUrl.searchParams.get('periodKey'), '');
    const latestMirror =
      periodKey
        ? statements.listRecentMirrorsByCadence
            .all(cadence, 24)
            .find((row) => readOptionalString(row.period_key, '') === periodKey)
        : statements.selectLatestMirrorByCadence.get(cadence);
    const latestDailyMirrorRow = statements.selectLatestMirrorByCadence.get('daily');
    const latestWeeklyMirrorRow = statements.selectLatestMirrorByCadence.get('weekly');
    const checkins = dedupeMeaningfulCheckins(statements.listRecentSelfCheckins.all(40), 20);
    const evidenceRows = latestMirror ? statements.listMirrorEvidenceByMirrorId.all(latestMirror.id) : [];
    sendJson(res, 200, {
      cadence,
      latestDailyMirror: latestDailyMirrorRow
        ? formatMirrorPayload(latestDailyMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestDailyMirrorRow.id))
        : null,
      latestWeeklyMirror: latestWeeklyMirrorRow
        ? formatMirrorPayload(latestWeeklyMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestWeeklyMirrorRow.id))
        : null,
      latestMirror: latestMirror ? formatMirrorPayload(latestMirror, evidenceRows) : null,
      checkins,
    });
    return;
  }

  if (method === 'GET' && pathname === '/self-mirror/evidence') {
    const mirrorId = readOptionalString(requestUrl.searchParams.get('mirrorId'), '');
    const claimKey = readOptionalString(requestUrl.searchParams.get('claimKey'), '');
    if (!mirrorId) throw new HttpError(400, 'mirrorId is required');
    const mirror = statements.selectMirrorById.get(mirrorId);
    if (!mirror) throw new HttpError(404, 'mirrorId not found');
    const evidence = statements.listMirrorEvidenceByMirrorId
      .all(mirrorId)
      .map(formatMirrorEvidenceRow)
      .filter((item) => !claimKey || item.claimKey === claimKey);
    sendJson(res, 200, {
      mirror: formatMirrorPayload(mirror, statements.listMirrorEvidenceByMirrorId.all(mirrorId)),
      claimKey,
      count: evidence.length,
      evidence,
    });
    return;
  }

  if (method === 'POST' && pathname === '/self-mirror/generate') {
    const body = await readJsonBody(req);
    const cadence = readOptionalString(body.cadence, body.range === 'today' ? 'daily' : 'weekly') || 'weekly';
    const periodKey = readOptionalString(body.periodKey, cadence === 'daily' ? toDateKey() : toDateKey());
    const bountyMode = normalizeBountyMode(body.bountyMode);
    const requestedProvider = normalizeModelProvider(readOptionalString(body.provider, MODEL_PROVIDER_AUTO));
    let checkins = statements.listRecentSelfCheckins.all(12);

    if (checkins.length === 0) {
      const captures = statements.listRecentCaptures.all(12);
      const generatedCheckins = [];

      for (const capture of captures) {
        const payload = safeParseJsonObject(capture.payload, {});
        const text = readOptionalString(payload.text, '');
        if (!text) continue;
        const checkinId = makeId('checkin');
        const createdAt = nowIso();
        const energy = inferEnergyFromText(text);
        const emotions = inferEmotionTags(text);
        statements.insertSelfCheckin.run(
          checkinId,
          energy,
          JSON.stringify(emotions),
          'capture_backfill',
          text,
          createdAt
        );
        generatedCheckins.push({
          id: checkinId,
          energy,
          emotions: JSON.stringify(emotions),
          trigger_text: 'capture_backfill',
          reflection: text,
          created_at: createdAt,
        });
      }

      if (generatedCheckins.length > 0) {
        checkins = statements.listRecentSelfCheckins.all(12);
      }
    }

    const mirrorPayload = buildMirrorPayloadFromWindow(statements, { cadence, periodKey });
    const structuredMirror = mirrorPayload.structuredMirror;
    const mirrorId = makeId('mirror');
    const createdAt = nowIso();
    statements.db.exec('BEGIN');
    try {
      statements.insertMirror.run(
        mirrorId,
        mirrorPayload.window.rangeLabel,
        cadence,
        mirrorPayload.window.periodKey,
        JSON.stringify(structuredMirror),
        createdAt
      );
      upsertMirrorEvidenceRows(statements, mirrorId, structuredMirror);
      statements.db.exec('COMMIT');
    } catch (error) {
      statements.db.exec('ROLLBACK');
      throw error;
    }

    sendJson(res, 201, {
      ...formatMirrorPayload(
        {
          id: mirrorId,
          range_label: mirrorPayload.window.rangeLabel,
          cadence,
          period_key: mirrorPayload.window.periodKey,
          content: JSON.stringify(structuredMirror),
          created_at: createdAt,
        },
        statements.listMirrorEvidenceByMirrorId.all(mirrorId)
      ),
      bountyMode,
      modelRouting: {
        requestedProvider,
        effectiveProvider: MODEL_PROVIDER_LOCAL,
        fallbackUsed: requestedProvider !== MODEL_PROVIDER_AUTO,
      },
    });
    return;
  }

  if (method === 'POST' && pathname === '/people/upsert') {
    const body = await readJsonBody(req);
    const now = nowIso();
    const personId =
      typeof body.personId === 'string' && body.personId.trim() ? body.personId.trim() : makeId('person');
    const name = requireString(body.name, 'name');
    if (isPlaceholderContactName(name)) {
      throw new HttpError(400, 'name confirmation required', {
        field: 'name',
        reason: 'placeholder_name',
      });
    }
    const tags = normalizeStringList(body.tags);
    const notes = sanitizeContactDraftText(readOptionalString(body.notes, ''));
    const nextFollowUpAt = readOptionalString(body.nextFollowUpAt, '') || null;
    const existing = statements.selectPersonById.get(personId);

    if (existing) {
      statements.updatePerson.run(
        name,
        JSON.stringify(tags),
        notes,
        nextFollowUpAt,
        now,
        personId
      );
    } else {
      statements.insertPerson.run(
        personId,
        name,
        JSON.stringify(tags),
        notes,
        nextFollowUpAt,
        now,
        now
      );
    }

    const row = statements.selectPersonById.get(personId);
    sendJson(res, existing ? 200 : 201, {
      person: formatPersonRow(row),
      action: existing ? 'updated' : 'created',
    });
    return;
  }

  if (method === 'POST' && peopleIdentityMatch) {
    const personId = parseDynamicId(peopleIdentityMatch);
    const person = statements.selectPersonById.get(personId);
    if (!person) throw new HttpError(404, 'personId not found');
    const body = await readJsonBody(req);
    const platform = requireString(body.platform, 'platform').toLowerCase();
    const handle = cleanText(body.handle || '');
    const url = cleanText(body.url || '');
    if (!handle && !url) throw new HttpError(400, 'handle or url is required');
    const identityId = makeId('identity');
    statements.insertIdentity.run(
      identityId,
      personId,
      platform,
      handle || null,
      url || null,
      cleanText(body.note || ''),
      nowIso()
    );
    touchExistingPerson(statements, person, {});
    sendJson(res, 201, {
      identity: formatIdentityRow(statements.listIdentitiesByPersonId.all(personId).find((row) => row.id === identityId)),
      detail: buildPeopleDetailPayload(statements, personId),
    });
    return;
  }

  if (method === 'POST' && peopleInteractionMatch) {
    const personId = parseDynamicId(peopleInteractionMatch);
    const person = statements.selectPersonById.get(personId);
    if (!person) throw new HttpError(404, 'personId not found');
    const body = await readJsonBody(req);
    const interactionRow = insertPersonInteraction(statements, personId, {
      summary: body.summary,
      evidence: body.evidence,
      happenedAt: body.happenedAt,
    });
    if (!interactionRow) throw new HttpError(400, 'summary or evidence is required');
    sendJson(res, 201, {
      interaction: formatInteractionRow(interactionRow),
      detail: buildPeopleDetailPayload(statements, personId),
    });
    return;
  }

  if (method === 'POST' && pathname === '/capture/assets') {
    const body = await readJsonBody(req);
    const kind = readOptionalString(body.kind, '').toLowerCase() || (readOptionalString(body.mimeType, '').startsWith('audio/') ? 'audio' : 'image');
    const mimeType = readOptionalString(body.mimeType, kind === 'audio' ? 'audio/webm' : 'image/png');
    const fileName = readOptionalString(body.fileName, `${kind}-${Date.now()}`);
    const deliveryMode = readOptionalString(
      body.deliveryMode,
      kind === 'audio'
        ? cleanText(body.transcript || body.extractedText || body.previewText)
          ? 'transcript'
          : 'voice'
        : 'asset'
    );
    const inlineText = cleanText(body.extractedText || body.transcript || body.previewText || '');
    const contentBase64 = readOptionalString(body.contentBase64, '') || readOptionalString(body.dataUrl, '');
    const assetId = makeId('asset');
    const createdAt = nowIso();
    const localPath = persistCaptureAssetOriginal({ assetId, kind, mimeType, fileName, contentBase64 });
    const openAiTranscription =
      !inlineText && kind === 'audio'
        ? await runOpenAiAudioTranscription({ mimeType, contentBase64 })
        : { text: '', provider: 'skipped' };
    const openAiImageUnderstanding =
      !inlineText && kind === 'image'
        ? await runOpenAiImageUnderstanding({ mimeType, contentBase64 })
        : { text: '', provider: 'skipped', parsed: null };
    const fallbackOcrText =
      !inlineText && kind === 'image' && !cleanText(openAiImageUnderstanding.text)
        ? runLocalImageOcr({ mimeType, contentBase64 })
        : '';
    const extractedText =
      inlineText ||
      (kind === 'audio' ? openAiTranscription.text : '') ||
      (kind === 'image' ? openAiImageUnderstanding.text || fallbackOcrText : '');
    const status = extractedText ? 'parsed' : 'manual_review';
    const analysisMethod =
      kind === 'audio'
        ? extractedText
          ? openAiTranscription.provider === 'openai'
            ? 'openai-transcription'
            : 'browser-or-manual-transcript'
          : 'manual-required'
        : extractedText
          ? cleanText(openAiImageUnderstanding.text)
            ? 'openai-vision'
            : fallbackOcrText
              ? 'local-ocr'
              : 'manual-provided'
          : 'manual-required';
    const metadata = {
      source: readOptionalString(body.source, 'dashboard'),
      deliveryMode,
      transcriptMethod:
        kind === 'audio'
          ? extractedText
            ? openAiTranscription.provider === 'openai'
              ? 'openai-transcription'
              : 'browser_or_manual'
            : 'manual_required'
          : readOptionalString(
              body.ocrMethod,
              analysisMethod === 'openai-vision' ? 'openai-vision' : extractedText ? 'local-ocr' : 'manual_required'
            ),
      analysisMethod,
      previewText: truncateText(extractedText, 280),
      status,
      transcriptionProvider: kind === 'audio' ? openAiTranscription.provider : null,
      transcriptionError: kind === 'audio' ? readOptionalString(openAiTranscription.error, '') : '',
      imageUnderstandingProvider: kind === 'image' ? openAiImageUnderstanding.provider : null,
      imageUnderstandingError: kind === 'image' ? readOptionalString(openAiImageUnderstanding.error, '') : '',
      imageUnderstanding: kind === 'image' ? normalizeRecord(openAiImageUnderstanding.parsed) : {},
      originalStoredLocally: Boolean(localPath),
      contentBytes: decodeDataUrl(contentBase64).length,
    };

    statements.insertCaptureAsset.run(
      assetId,
      kind,
      mimeType,
      fileName,
      localPath,
      extractedText,
      JSON.stringify(metadata),
      createdAt
    );

    sendJson(res, 201, {
      asset: formatCaptureAssetRow({
        id: assetId,
        kind,
        mime_type: mimeType,
        file_name: fileName,
        local_path: localPath,
        extracted_text: extractedText,
        metadata: JSON.stringify(metadata),
        created_at: createdAt,
      }),
      refineAvailable: Boolean(readOptionalString(process.env.OPENAI_API_KEY, '')),
    });
    return;
  }

  if (method === 'GET' && pathname === '/integrations/telegram/status') {
    const profile = await fetchTelegramBotProfile();
    sendJson(res, 200, buildTelegramStatusPayload(profile));
    return;
  }

  if (method === 'POST' && pathname === '/integrations/telegram/send') {
    const body = await readJsonBody(req);
    const result = await sendTelegramMessage({
      text: body.text,
      chatId: readOptionalString(body.chatId, ''),
    });
    const evidence = recordHackathonEvidence(statements, {
      action: 'hackathon_telegram_send',
      bounty: 'ai-agents-for-good',
      provider: result.provider,
      model: result.model,
      proofKind: 'telegram',
      title: 'Telegram volunteer channel send',
      summary: truncateText(result.text, 180),
      route: '/hackathon?bounty=ai-agents-for-good',
      channel: result.channel,
      transport: result.transport,
      openSourceModel: false,
      input: {
        requestedChatId: readOptionalString(body.chatId, ''),
        text: cleanText(body.text || ''),
      },
      output: {
        chatId: result.chatId,
        messageId: result.messageId,
        botUsername: readTelegramBotUsername(),
      },
      live: true,
      fallbackUsed: false,
    });
    sendJson(res, 200, {
      ...result,
      auditId: evidence.auditId,
      digestId: evidence.digestId,
      createdAt: evidence.createdAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/integrations/telegram/webhook') {
    const expectedSecret = readTelegramWebhookSecret();
    const providedSecret = readOptionalString(req.headers['x-telegram-bot-api-secret-token'], '');
    if (expectedSecret && providedSecret !== expectedSecret) {
      throw new HttpError(403, 'telegram webhook secret mismatch');
    }

    const body = await readJsonBody(req);
    const summary = extractTelegramUpdateSummary(body);
    const evidence = summary.text
      ? recordHackathonEvidence(statements, {
          action: 'hackathon_telegram_webhook',
          bounty: 'ai-agents-for-good',
          provider: 'telegram',
          model: readTelegramBotUsername(),
          proofKind: 'telegram',
          title: 'Telegram volunteer channel receive',
          summary: truncateText(summary.text, 180),
          route: '/hackathon?bounty=ai-agents-for-good',
          channel: 'telegram',
          transport: 'bot-api',
          openSourceModel: false,
          input: {
            chatId: summary.chatId,
            fromUsername: summary.fromUsername,
          },
          output: summary,
          live: true,
          fallbackUsed: false,
        })
      : null;

    sendJson(res, 200, {
      ok: true,
      received: Boolean(summary.text),
      updateId: body?.update_id || null,
      summary,
      auditId: evidence?.auditId || '',
      digestId: evidence?.digestId || '',
    });
    return;
  }

  if (method === 'POST' && pathname === '/integrations/glm/generate') {
    const body = await readJsonBody(req);
    const result = await buildGlmGenerationResult({
      taskType: readOptionalString(body.taskType, 'generation'),
      prompt: body.prompt,
      context: body.context,
      bountyMode: body.bountyMode,
    });
    const evidence = recordHackathonEvidence(statements, {
      action: 'hackathon_glm_generate',
      bounty: 'z-ai-general',
      provider: result.proof.provider,
      model: result.proof.model,
      proofKind: 'glm',
      title: 'GLM generation run',
      summary: cleanText(result.answer).slice(0, 180),
      route: '/hackathon?bounty=z-ai-general',
      input: {
        taskType: readOptionalString(body.taskType, 'generation'),
        prompt: cleanText(body.prompt || ''),
      },
      output: {
        answer: result.answer,
        proof: result.proof,
      },
      live: !result.proof.fallbackUsed,
      fallbackUsed: result.proof.fallbackUsed,
    });
    sendJson(res, 200, {
      ...result,
      auditId: evidence.auditId,
      digestId: evidence.digestId,
      createdAt: evidence.createdAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/integrations/flock/sdg-triage') {
    const body = await readJsonBody(req);
    const result = await buildFlockSdgTriage(statements, {
      text: body.text,
      personId: readOptionalString(body.personId, ''),
      eventId: readOptionalString(body.eventId, ''),
    });
    const evidence = recordHackathonEvidence(statements, {
      action: 'hackathon_flock_triage',
      bounty: 'ai-agents-for-good',
      provider: result.proof.provider,
      model: result.proof.model,
      proofKind: 'flock',
      title: 'FLock SDG triage run',
      summary: `${result.sdg} · ${result.urgency} · ${result.suggestedAction}`,
      route: '/hackathon?bounty=ai-agents-for-good',
      channel: 'web-workspace',
      transport: 'http',
      openSourceModel: true,
      input: {
        text: cleanText(body.text || ''),
        personId: readOptionalString(body.personId, ''),
        eventId: readOptionalString(body.eventId, ''),
      },
      output: result,
      live: !result.proof.fallbackUsed,
      fallbackUsed: result.proof.fallbackUsed,
    });
    sendJson(res, 200, {
      ...result,
      auditId: evidence.auditId,
      digestId: evidence.digestId,
      createdAt: evidence.createdAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/capture/parse') {
    const body = await readJsonBody(req);
    const source = readOptionalString(body.source, 'manual');
    const text = cleanText(body.text || '');
    const assetIds = cleanList(body.assetIds);
    const assets = selectCaptureAssetsByIds(statements, assetIds);
    if (!text && !assets.length) throw new HttpError(400, 'text or assetIds is required');
    const captureDraft = await buildCaptureDraftWithModelAssist({ text, source, assets });
    sendJson(res, 200, {
      captureDraft,
      foundPersonMatch: findExistingPersonByName(statements, captureDraft.personDraft.name)
        ? formatPersonRow(findExistingPersonByName(statements, captureDraft.personDraft.name))
        : null,
    });
    return;
  }

  if (method === 'POST' && pathname === '/workspace/chat') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await buildWorkspaceChatPayload(statements, body));
    return;
  }

  if (method === 'POST' && pathname === '/capture/commit') {
    const body = await readJsonBody(req);
    const committed = commitCaptureDraft(statements, body);
    sendJson(res, 201, committed);
    return;
  }

  if (method === 'POST' && pathname === '/drafts/generate') {
    const body = await readJsonBody(req);
    const eventId = requireString(body.eventId, 'eventId');
    const event = statements.selectEventDetailById.get(eventId);
    if (!event) throw new HttpError(404, 'eventId not found');

    const platforms = normalizePlatformList(body.platforms);
    const languageStrategy = body.languages || body.language || body.languageStrategy || 'platform-native';
    const bountyMode = normalizeBountyMode(body.bountyMode);
    const requestedProvider = normalizeModelProvider(
      bountyMode === 'z-ai-general' && !readOptionalString(body.provider, '')
        ? MODEL_PROVIDER_GLM
        : readOptionalString(body.provider, MODEL_PROVIDER_AUTO)
    );
    const generatedDrafts = [];
    const generationProofs = [];

    for (const platformId of platforms) {
      const platformRule = resolvePlatformRule(platformId);
      const languages = resolveDraftLanguagesForPlatform(platformRule.id, languageStrategy);
      for (const language of languages) {
        const generation = await buildDraftContentWithProvider(platformRule, event, language, {
          ...body,
          provider: requestedProvider,
          bountyMode,
        });
        const content = generation.content;
        const capability = getPlatformCapability(platformRule.id);
        const publishPackage = buildPublishPackage(platformRule, event, language, content, body);
        const draftId = makeId('draft');
        const createdAt = nowIso();
        const metadata = {
          source: 'api.drafts_generate',
          capability,
          publishPackage,
          variants: cleanList(body.variants),
          validation: null,
          generation: {
            provider: generation.provider,
            model: generation.model,
            bountyMode,
            fallbackUsed: generation.fallbackUsed,
            reason: generation.reason,
            tone: readOptionalString(body.tone, ''),
            angle: readOptionalString(body.angle, ''),
            audience: readOptionalString(body.audience, ''),
            languageStrategy: Array.isArray(languageStrategy) ? languageStrategy.join(',') : readOptionalString(languageStrategy, ''),
            links: normalizeStringList(body.links),
            assets: normalizeStringList(body.assets),
          },
        };

        statements.insertDraft.run(
          draftId,
          eventId,
          platformRule.id,
          language,
          content,
          JSON.stringify(metadata),
          createdAt
        );

        generatedDrafts.push(
          formatDraftRow({
            id: draftId,
            event_id: eventId,
            event_title: event.title,
            platform: platformRule.id,
            language,
            content,
            metadata: JSON.stringify(metadata),
            created_at: createdAt,
          })
        );

        generationProofs.push({
          draftId,
          platform: platformRule.id,
          language,
          provider: generation.provider,
          model: generation.model,
          live: generation.provider !== MODEL_PROVIDER_LOCAL,
          fallbackUsed: generation.fallbackUsed,
          reason: generation.reason,
        });
      }
    }
    const evidence = bountyMode
      ? recordHackathonEvidence(statements, {
          action: 'hackathon_draft_generate',
          bounty: bountyMode,
          provider:
            generationProofs.find((item) => item.provider && item.provider !== MODEL_PROVIDER_LOCAL)?.provider ||
            MODEL_PROVIDER_LOCAL,
          model:
            generationProofs.find((item) => item.model && item.provider && item.provider !== MODEL_PROVIDER_LOCAL)?.model ||
            '',
          proofKind: bountyMode === 'z-ai-general' ? 'glm' : 'ui',
          title: 'Hackathon draft package generated',
          summary: `${generatedDrafts.length} drafts generated for ${event.title}.`,
          route: bountyMode === 'z-ai-general' ? '/hackathon?bounty=z-ai-general' : '/drafts',
          input: {
            eventId,
            requestedProvider,
            platforms,
          },
          output: {
            count: generatedDrafts.length,
            generations: generationProofs,
          },
          live: generationProofs.some((item) => item.provider !== MODEL_PROVIDER_LOCAL),
          fallbackUsed: generationProofs.every((item) => item.provider === MODEL_PROVIDER_LOCAL),
        })
      : null;

    sendJson(res, 201, {
      eventId,
      bountyMode,
      provider: requestedProvider,
      count: generatedDrafts.length,
      drafts: generatedDrafts,
      auditId: evidence?.auditId || '',
      digestId: evidence?.digestId || '',
      proof: {
        requestedProvider,
        bountyMode,
        routes: bountyMode === 'z-ai-general' ? ['/hackathon?bounty=z-ai-general', '/drafts'] : ['/drafts'],
        provider:
          generationProofs.find((item) => item.provider && item.provider !== MODEL_PROVIDER_LOCAL)?.provider ||
          MODEL_PROVIDER_LOCAL,
        model:
          generationProofs.find((item) => item.model && item.provider && item.provider !== MODEL_PROVIDER_LOCAL)?.model ||
          '',
        live: generationProofs.some((item) => item.provider !== MODEL_PROVIDER_LOCAL),
        fallbackUsed: generationProofs.every((item) => item.provider === MODEL_PROVIDER_LOCAL),
        capturedAt: evidence?.createdAt || nowIso(),
        generations: generationProofs,
      },
    });
    return;
  }

  if (method === 'PATCH' && draftDetailMatch) {
    const draftId = parseDynamicId(draftDetailMatch);
    const draft = statements.selectDraftById.get(draftId);
    if (!draft) throw new HttpError(404, 'draftId not found');
    const body = await readJsonBody(req);
    const content = cleanText(body.content || draft.content);
    const metadata = {
      ...safeParseJsonObject(draft.metadata, {}),
      variants:
        body.variants !== undefined
          ? cleanList(body.variants)
          : safeParseJsonObject(draft.metadata, {}).variants || [],
      validation: null,
      lastEditedAt: nowIso(),
    };

    if (metadata.publishPackage && typeof metadata.publishPackage === 'object') {
      metadata.publishPackage = {
        ...metadata.publishPackage,
        preview: content,
      };
    }

    statements.updateDraftContentMetadata.run(content, JSON.stringify(metadata), draftId);
    const updated = statements.selectDraftById.get(draftId);
    sendJson(res, 200, { draft: formatDraftRow(updated) });
    return;
  }

  if (method === 'POST' && draftValidateMatch) {
    const draftId = parseDynamicId(draftValidateMatch);
    const draft = statements.selectDraftById.get(draftId);
    if (!draft) throw new HttpError(404, 'draftId not found');
    const platformRule = resolvePlatformRule(draft.platform);
    const compliance = validateQueueContentCompliance(platformRule, draft.content);
    const validation = buildDraftValidation(platformRule, draft.content, compliance.issues);
    const metadata = {
      ...safeParseJsonObject(draft.metadata, {}),
      validation,
      lastValidatedAt: nowIso(),
    };
    statements.updateDraftContentMetadata.run(draft.content, JSON.stringify(metadata), draftId);
    sendJson(res, 200, {
      draft: formatDraftRow({
        ...draft,
        metadata: JSON.stringify(metadata),
      }),
      validation,
    });
    return;
  }

  if (method === 'POST' && pathname === '/ops/dispatch') {
    const body = await readJsonBody(req);
    const command = resolveDispatchCommand(body);
    if (command.startsWith('ADD_TASK:')) {
      const task = createOpsTaskFromBody({
        taskText: command.slice('ADD_TASK:'.length),
        intakeMode: 'quick',
      });
      sendJson(res, 201, {
        command,
        output: `Task added: ${task.taskId}`,
        task,
        ops: buildOpsStatus(),
        cluster: buildFoundryClusterSummary(),
      });
      return;
    }

    const result = runFoundryDispatch(command);
    sendJson(res, 200, {
      command,
      output: result.output,
      ops: buildOpsStatus(),
      cluster: buildFoundryClusterSummary(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/ops/tasks') {
    const body = await readJsonBody(req);
    const task = createOpsTaskFromBody(body);
    sendJson(res, 201, {
      task,
      foundry: buildFoundryClusterSummary(),
      ops: buildOpsStatus(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/capture') {
    const body = await readJsonBody(req);
    const committed = commitCaptureDraft(statements, {
      text: body.text,
      source: body.source,
      assetIds: body.assetIds,
    });
    sendJson(res, 201, {
      captureId: committed.capture.captureId,
      checkinId: committed.checkin.checkinId,
      personId: committed.person.personId,
      createdAt: committed.createdAt,
      committed,
    });
    return;
  }

  if (method === 'POST' && pathname === '/events') {
    const body = await readJsonBody(req);
    const title = requireString(body.title, 'title');

    const captureId =
      typeof body.captureId === 'string' && body.captureId.trim() ? body.captureId.trim() : null;

    if (captureId) {
      const captureRow = statements.selectAuditById.get(captureId);
      if (!captureRow) throw new HttpError(404, 'captureId not found');
    }

    const eventId = makeId('event');
    const createdAt = nowIso();
    const payloadDetails =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? normalizeEventPayloadDetails(body.payload)
        : {};
    const normalizedPayload = {
      captureId,
      audience: readOptionalString(body.audience, ''),
      languageStrategy: readOptionalString(body.languageStrategy, ''),
      tone: readOptionalString(body.tone, ''),
      links: normalizeStringList(body.links),
      assets: normalizeStringList(body.assets),
      details: payloadDetails,
    };
    const payload = JSON.stringify({
      ...normalizedPayload,
    });

    statements.insertEvent.run(eventId, title, payload, createdAt);
    const linkedPeople = resolvePeopleForEventLinking(statements, body, normalizedPayload);
    linkedPeople.forEach((link) => {
      upsertEventPersonLink(statements, {
        eventId,
        personId: link.personId,
        role: link.role,
        sourceType: link.sourceType,
        sourceId: captureId || link.sourceId || '',
      });
    });

    const detail = buildEventDetailPayload(statements, eventId);
    sendJson(res, 201, {
      eventId,
      createdAt,
      event: detail?.event || formatEventRow({
        id: eventId,
        title,
        payload,
        created_at: createdAt,
      }),
      detail,
    });
    return;
  }

  if (method === 'POST' && pathname === '/people/search') {
    const body = await readJsonBody(req);
    const query = requireString(body.query, 'query');
    const limit = normalizeSearchLimit(body.limit, 8);
    const searchAssist = await buildPersonSearchAssist({ query, source: 'people-search' });
    const results = searchPeopleMatches(statements, query, limit, null, searchAssist);
    const embeddingsSettings = resolveEmbeddingsSettings();

    sendJson(res, 200, {
      query,
      retrieval: {
        mode: embeddingsSettings.retrievalMode,
        effectiveProvider: embeddingsSettings.effectiveProvider,
        semanticBoostEnabled: embeddingsSettings.semanticBoostEnabled,
        fallback: 'keyword + graph + recency',
      },
      extraction: searchAssist.extraction || { method: 'heuristic', model: '' },
      count: results.length,
      results,
    });
    return;
  }

  if (method === 'POST' && pathname === '/publish/queue') {
    const body = await readJsonBody(req);
    const draftIdInput =
      typeof body.draftId === 'string' && body.draftId.trim() ? body.draftId.trim() : null;
    const queueMetadata = buildQueueMetadata(body);

    let eventId = null;
    let platformRule;
    let platform;
    let language;
    let content;
    let draftId = draftIdInput;
    let existingMetadata = null;
    let nextDraftMetadata = null;
    let existingHighFrequency = false;
    let existingNoDeliver = false;

    if (draftIdInput) {
      const existingDraft = statements.selectDraftById.get(draftIdInput);
      if (!existingDraft) throw new HttpError(404, 'draftId not found');
      eventId = existingDraft.event_id;
      platformRule = resolvePlatformRule(existingDraft.platform);
      platform = platformRule.id;
      language = existingDraft.language;
      content = existingDraft.content;

      existingMetadata = safeParseJsonObject(existingDraft.metadata, {});
      existingHighFrequency = readOptionalBoolean(existingMetadata.highFrequency, false);
      existingNoDeliver = readOptionalBoolean(existingMetadata.noDeliver, false);
      nextDraftMetadata = {
        ...existingMetadata,
        highFrequency: existingHighFrequency || queueMetadata.highFrequency,
        noDeliver: existingNoDeliver || queueMetadata.noDeliver,
      };
    } else {
      eventId = requireString(body.eventId, 'eventId');
      const event = statements.selectEventById.get(eventId);
      if (!event) throw new HttpError(404, 'eventId not found');
      platformRule = resolvePlatformRule(body.platform);
      platform = platformRule.id;
      language = readOptionalString(body.language, getPlatformNativeLanguage(platformRule.id));
      content = readOptionalString(body.content, event.title);
    }

    const mode = normalizePublishMode(body.mode);
    const compliance = validateQueueContentCompliance(platformRule, content);
    const validation = buildDraftValidation(platformRule, content, compliance.issues);

    if (draftIdInput && nextDraftMetadata) {
      nextDraftMetadata.validation = validation;
      const previousValidation = existingMetadata?.validation || null;
      const validationChanged = JSON.stringify(previousValidation) !== JSON.stringify(validation);
      if (
        validationChanged ||
        nextDraftMetadata.highFrequency !== existingHighFrequency ||
        nextDraftMetadata.noDeliver !== existingNoDeliver
      ) {
        statements.updateDraftContentMetadata.run(content, JSON.stringify(nextDraftMetadata), draftIdInput);
      }
    }

    if (!compliance.ok) {
      sendJson(res, 422, {
        error: 'platform compliance failed',
        platform,
        issues: compliance.issues,
      });
      return;
    }

    if (!validation.ok) {
      sendJson(res, 422, {
        error: 'draft validation failed',
        platform,
        issues: validation.issues,
        categories: validation.categories,
      });
      return;
    }

    const createdAt = nowIso();

    if (!draftIdInput) {
      draftId = makeId('draft');
      const eventDetail = statements.selectEventDetailById.get(eventId);
      const capability = getPlatformCapability(platform);
      const publishPackage = eventDetail
        ? buildPublishPackage(platformRule, eventDetail, language, content, body)
        : null;
      const draftMetadataToStore = {
        ...queueMetadata,
        capability,
        publishPackage,
        validation,
        variants: cleanList(body.variants),
      };
      statements.insertDraft.run(
        draftId,
        eventId,
        platform,
        language,
        content,
        JSON.stringify(draftMetadataToStore),
        createdAt
      );
    }

    const taskId = makeId('queue');
    statements.insertQueueTask.run(
      taskId,
      draftId,
      platform,
      mode,
      'queued',
      '{}',
      createdAt,
      createdAt
    );

    sendJson(res, 201, {
      taskId,
      draftId,
      status: 'queued',
      mode,
      delivery: {
        noDeliver: queueMetadata.noDeliver,
        highFrequency: queueMetadata.highFrequency,
      },
    });
    return;
  }

  if (method === 'POST' && pathname === '/publish/approve') {
    const body = await readJsonBody(req);
    const taskId = requireString(body.taskId, 'taskId');

    const task = statements.selectQueueTaskById.get(taskId);
    if (!task) throw new HttpError(404, 'taskId not found');

    if (task.status !== 'queued') {
      throw new HttpError(409, `task is not approvable (status=${task.status})`);
    }

    const requestedMode = normalizePublishMode(
      typeof body.mode === 'string' ? body.mode : task.mode,
      DEFAULT_PUBLISH_MODE
    );

    const liveGate = {
      envEnabled: isLiveEnvironmentEnabled(),
      uiEnabled: readOptionalBoolean(body.liveEnabled, false),
      credentialsReady: readOptionalBoolean(body.credentialsReady, false),
    };

    const liveAllowed =
      requestedMode === LIVE_PUBLISH_MODE &&
      liveGate.envEnabled &&
      liveGate.uiEnabled &&
      liveGate.credentialsReady;

    const effectiveMode = liveAllowed ? LIVE_PUBLISH_MODE : DEFAULT_PUBLISH_MODE;
    const liveFallbackReason =
      requestedMode === LIVE_PUBLISH_MODE && !liveAllowed
        ? {
            envEnabled: liveGate.envEnabled,
            uiEnabled: liveGate.uiEnabled,
            credentialsReady: liveGate.credentialsReady,
          }
        : null;

    const draftMetadata = safeParseJsonObject(task.metadata);
    const highFrequency = readHighFrequencyHint(draftMetadata) || readHighFrequencyHint(body);
    const stickyNoDeliver =
      readOptionalBoolean(draftMetadata.noDeliver, false) || readOptionalBoolean(body.noDeliver, false);
    const noDeliver = highFrequency || stickyNoDeliver || effectiveMode !== LIVE_PUBLISH_MODE;

    const capability = draftMetadata.capability || getPlatformCapability(task.platform);
    const dispatchEligible = effectiveMode === LIVE_PUBLISH_MODE && !noDeliver;
    const dispatched = false;

    let dispatchReason = 'p1_manual_confirmation_required';
    if (noDeliver) {
      if (highFrequency) {
        dispatchReason = 'high_frequency_no_deliver';
      } else if (effectiveMode !== LIVE_PUBLISH_MODE) {
        dispatchReason = 'dry_run_default';
      } else {
        dispatchReason = 'no_deliver_flagged';
      }
    } else if (dispatchEligible && capability.liveEligible) {
      dispatchReason = 'connector_preflight_ready';
    }

    const nextStatus = 'manual_step_needed';
    const preflight = {
      platform: task.platform,
      supportLevel: capability.supportLevel || 'L1 Assisted',
      connectorReady: Boolean(dispatchEligible && capability.liveEligible),
      entryTarget: capability.entryTarget || 'manual composer',
      liveGate,
      note:
        task.platform === 'x' || task.platform === 'linkedin'
          ? 'P1 only performs connector preflight and operator handoff, not live auto-post.'
          : 'Manual publish package is ready for operator completion.',
    };

    const timestamp = nowIso();
    const runId = makeId('publishrun');
    const approveAuditId = makeId('audit');
    const executeAuditId = makeId('audit');
    const digestId = makeId('digest');
    const approvedBy = readOptionalString(body.approvedBy, 'api');

    const executionPayload = {
      taskId,
      draftId: task.draft_id,
      platform: task.platform,
      runId,
      status: nextStatus,
      requestedMode,
      mode: effectiveMode,
      approvedBy,
      approvedAt: timestamp,
      publisher: 'publisher.workflow',
      liveGate,
      preflight,
      delivery: {
        noDeliver,
        highFrequency,
        dispatchEligible,
        dispatched,
        reason: dispatchReason,
      },
    };

    const mergedResult = {
      ...safeParseJsonObject(task.result),
      approval: {
        approvedBy,
        approvedAt: timestamp,
        auditId: approveAuditId,
      },
      execution: {
        ...executionPayload,
        auditId: executeAuditId,
        liveFallbackReason,
      },
      digestId,
      auditIds: [approveAuditId, executeAuditId],
    };

    statements.db.exec('BEGIN');
    try {
      statements.insertAudit.run(
        approveAuditId,
        'publish_approve',
        JSON.stringify({
          taskId,
          draftId: task.draft_id,
          approvedBy,
          requestedMode,
          approvedAt: timestamp,
        }),
        timestamp
      );

      statements.updateQueueTaskExecution.run(
        effectiveMode,
        nextStatus,
        JSON.stringify(mergedResult),
        timestamp,
        taskId
      );

      statements.insertAudit.run(executeAuditId, 'publish_execute', JSON.stringify(executionPayload), timestamp);

      statements.insertDigest.run(
        digestId,
        runId,
        `Approve→manual handoff prepared for ${taskId}`,
        'Approved task promoted into manual/assisted publish workflow with preflight details',
        noDeliver ? 'low' : 'medium',
        `PublishTask status=${nextStatus} mode=${effectiveMode} noDeliver=${noDeliver}`,
        `Inspect Audit ${executeAuditId} for delivery trace`,
        timestamp
      );

      statements.db.exec('COMMIT');
    } catch (error) {
      statements.db.exec('ROLLBACK');
      throw error;
    }

    sendJson(res, 200, {
      taskId,
      draftId: task.draft_id,
      runId,
      mode: effectiveMode,
      status: nextStatus,
      auditIds: [approveAuditId, executeAuditId],
      digestId,
      liveFallbackReason,
      delivery: {
        noDeliver,
        highFrequency,
        dispatchEligible,
        dispatched,
      },
      preflight,
    });
    return;
  }

  if (method === 'POST' && pathname === '/publish/complete') {
    const body = await readJsonBody(req);
    const taskId = requireString(body.taskId, 'taskId');
    const outcome = readOptionalString(body.outcome || body.status, '').toLowerCase();
    if (!new Set(['posted', 'manual_step_needed', 'failed']).has(outcome)) {
      throw new HttpError(400, 'outcome must be posted, manual_step_needed, or failed');
    }
    const task = statements.selectQueueTaskById.get(taskId);
    if (!task) throw new HttpError(404, 'taskId not found');
    if (task.status === 'queued') {
      throw new HttpError(409, 'task must be approved before completion');
    }
    if (new Set(['posted', 'failed']).has(task.status) && task.status === outcome) {
      sendJson(res, 200, { taskId, status: task.status, result: safeParseJsonObject(task.result) });
      return;
    }
    if (new Set(['posted', 'failed']).has(task.status) && task.status !== outcome) {
      throw new HttpError(409, `task is already terminal (status=${task.status})`);
    }
    if (task.status === 'manual_step_needed' && outcome === 'manual_step_needed') {
      sendJson(res, 200, { taskId, status: task.status, result: safeParseJsonObject(task.result) });
      return;
    }

    const timestamp = nowIso();
    const auditId = makeId('audit');
    const digestId = makeId('digest');
    const operator = readOptionalString(body.operator, 'dashboard');
    const result = {
      ...safeParseJsonObject(task.result),
      manualCompletion: {
        outcome,
        operator,
        completedAt: timestamp,
        link: readOptionalString(body.link, ''),
        note: cleanText(body.note || ''),
        screenshotUrl: readOptionalString(body.screenshotUrl, ''),
        auditId,
      },
    };

    statements.db.exec('BEGIN');
    try {
      statements.updateQueueTaskExecution.run(task.mode, outcome, JSON.stringify(result), timestamp, taskId);
      statements.insertAudit.run(
        auditId,
        'publish_manual_complete',
        JSON.stringify({
          taskId,
          outcome,
          operator,
          link: readOptionalString(body.link, ''),
          note: cleanText(body.note || ''),
        }),
        timestamp
      );
      statements.insertDigest.run(
        digestId,
        makeId('publishrun'),
        `Manual publish outcome recorded for ${taskId}`,
        'Operator updated the assisted publish flow outcome',
        outcome === 'failed' ? 'medium' : 'low',
        `PublishTask status=${outcome}`,
        outcome === 'posted' ? 'Review the post link and audit trail.' : 'Inspect notes and retry path.',
        timestamp
      );
      statements.db.exec('COMMIT');
    } catch (error) {
      statements.db.exec('ROLLBACK');
      throw error;
    }

    sendJson(res, 200, {
      taskId,
      status: outcome,
      auditId,
      digestId,
      result,
    });
    return;
  }

  throw new HttpError(404, 'route not found');
}

export function createApiServer({ dbPath = DEFAULT_DB_PATH } = {}) {
  const db = initDb(dbPath);
  const statements = buildStatements(db);
  const sockets = new Set();
  ACTIVE_STUDIO = createStudioControlPlane({
    db,
    repoRoot: REPO_ROOT,
    dbPath,
  });
  const corsAllowlist = buildCorsAllowlist();

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => {
        const cors = applyCorsPolicy(req, res, corsAllowlist);
        if (cors.handled) return;
        return routeRequest(req, res, statements);
      })
      .catch((error) => {
        const statusCode = error instanceof HttpError ? error.statusCode : 500;
        const message = error instanceof HttpError ? error.message : 'internal server error';
        if (statusCode === 500) {
          console.error('[socialos-api] uncaught error:', error);
        }

        const payload = { error: message };
        if (error instanceof HttpError && error.details !== undefined) {
          payload.details = error.details;
        }

        sendJson(res, statusCode, payload);
      });
  });

  server.on('close', () => {
    ACTIVE_STUDIO = null;
    db.close();
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  return { server, dbPath, sockets };
}

export async function startApiServer({
  port = DEFAULT_PORT,
  dbPath = DEFAULT_DB_PATH,
  quiet = false,
} = {}) {
  const { server, sockets } = createApiServer({ dbPath });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const listenPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${LOOPBACK_HOST}:${listenPort}`;

  if (!quiet) {
    console.log(`socialos-api listening on ${baseUrl}`);
    console.log(`db: ${dbPath}`);
  }

  const close = async () => {
    await new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
      for (const socket of sockets) {
        socket.destroy();
      }
    });
  };

  return {
    server,
    dbPath,
    host: LOOPBACK_HOST,
    port: listenPort,
    baseUrl,
    close,
  };
}

function printHelp() {
  console.log(`SocialOS local API (loopback-only)

Usage:
  node socialos/apps/api/server.mjs [--port <port>] [--db <sqlite_path>]

Endpoints:
  GET  /health
  GET  /capture/assets
  POST /capture/assets
  POST /capture/parse
  POST /capture/commit
  GET  /studio/bootstrap    -> unified Studio overview
  GET  /studio/tasks?limit=N -> Studio tasks
  POST /studio/tasks        -> create a Studio task
  POST /studio/tasks/:id/run -> execute one Studio task
  GET  /studio/runs?limit=N -> recent Studio run summaries
  GET  /studio/agents       -> Studio agent state + cluster summary
  GET  /studio/settings     -> Studio policies and status
  POST /studio/commands/:command -> run-once, pause, resume, notify
  GET  /settings/embeddings -> resolves embedding provider + retrieval mode
  GET  /dev-digest?limit=N  -> latest DevDigest rows
  GET  /self-mirror         -> latest mirror + recent checkins + structured evidence
  GET  /self-mirror/evidence?mirrorId=... -> claim/evidence drill-down
  POST /self-mirror/generate -> generate and persist weekly mirror summary
  POST /capture             -> compatibility capture commit path
  POST /events              -> writes structured Event row
  POST /people/search       -> keyword/hybrid search with auto semantic enhancement when key exists
  GET  /people/:id          -> unified people detail payload
  POST /people/:id/identity -> append platform identity
  POST /people/:id/interaction -> append timeline event
  PATCH /drafts/:id         -> edit draft content + variants
  POST /drafts/:id/validate -> persist validation result
  POST /publish/queue       -> validates platform compliance + writes PostDraft + PublishTask rows
  POST /publish/approve     -> assisted/manual publish handoff + preflight
  POST /publish/complete    -> records posted/failed/manual outcome

Defaults:
  host: ${LOOPBACK_HOST}
  port: ${DEFAULT_PORT}
  db:   ${DEFAULT_DB_PATH}
`);
}

function parseCliArgs(argv) {
  const parsed = {
    help: false,
    port: DEFAULT_PORT,
    dbPath: DEFAULT_DB_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--port') {
      const value = argv[index + 1];
      if (!value) throw new Error('--port requires a value');
      const parsedPort = Number(value);
      if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        throw new Error('--port must be an integer between 1 and 65535');
      }
      parsed.port = parsedPort;
      index += 1;
      continue;
    }

    if (arg === '--db') {
      const value = argv[index + 1];
      if (!value) throw new Error('--db requires a value');
      parsed.dbPath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function runCli(argv) {
  const options = parseCliArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  const api = await startApiServer({
    port: options.port,
    dbPath: options.dbPath,
  });

  const shutdown = async (signal) => {
    if (signal) {
      console.log(`\nreceived ${signal}, shutting down...`);
    }
    await api.close();
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').then(() => process.exit(0));
  });
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`socialos-api: ${error.message}`);
    process.exit(1);
  });
}
