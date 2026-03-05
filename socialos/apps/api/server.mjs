import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'infra/db/schema.sql');
const QUEUE_PATH = path.join(REPO_ROOT, 'QUEUE.md');
const RUN_REPORT_DIR = path.join(REPO_ROOT, 'reports/runs');
const LATEST_DIGEST_PATH = path.join(REPO_ROOT, 'reports/LATEST.md');
const LOCK_DIR_PATH = path.join(REPO_ROOT, '.locks/devloop.lock');
const LOCK_META_PATH = path.join(REPO_ROOT, '.locks/devloop.lock/meta.env');
const PAUSE_FLAG_PATH = path.join(REPO_ROOT, '.foundry/PAUSED');
const MODE_OVERRIDE_PATH = path.join(REPO_ROOT, '.foundry/PUBLISH_MODE');
const FOUNDRY_CONFIG_PATH = path.join(REPO_ROOT, 'foundry/openclaw.foundry.json5');
const FOUNDRY_DISPATCH_PATH = path.join(REPO_ROOT, 'scripts/foundry_dispatch.sh');

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
export const DEFAULT_DB_PATH = path.resolve(
  process.env.SOCIALOS_DB_PATH || path.join(REPO_ROOT, 'infra/db/socialos.db')
);
export const DEFAULT_WEB_PORT = Number(process.env.SOCIALOS_WEB_PORT || 4173);

const MAX_BODY_BYTES = 256 * 1024;
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
    label: '知乎',
    maxLength: 20000,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  xiaohongshu: Object.freeze({
    id: 'xiaohongshu',
    label: '小红书',
    maxLength: 1000,
    maxHashtags: 20,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  wechat_moments: Object.freeze({
    id: 'wechat_moments',
    label: '微信朋友圈',
    maxLength: 2000,
    maxHashtags: 10,
    forbiddenFormats: ['markdown_link', 'fenced_code', 'html_tag'],
  }),
  wechat_official: Object.freeze({
    id: 'wechat_official',
    label: '微信公众号',
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
    entryTarget: 'Xiaohongshu mobile composer',
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

const FOUNDRY_AGENT_RESPONSIBILITIES = Object.freeze({
  forge_orchestrator: Object.freeze({
    title: 'Orchestrator',
    responsibility: '拆目标、排优先级、把产品任务拆成 coder/tester/reviewer 可执行单元',
  }),
  forge_coder: Object.freeze({
    title: 'Coder',
    responsibility: '实现 API、UI、runtime、docs 等代码变更',
  }),
  forge_tester: Object.freeze({
    title: 'Tester',
    responsibility: '跑 smoke/e2e/reviewer gate，确认功能闭环没断',
  }),
  forge_reviewer: Object.freeze({
    title: 'Reviewer',
    responsibility: '检查策略、安全边界、回归风险和质量门',
  }),
});

const CODEX_PARTICIPATION = Object.freeze({
  canOwn: [
    '跨文件架构重构',
    'UI 工作台产品化',
    'API 设计与实现',
    'Foundry 编排与控制面接入',
    '测试补齐与回归定位',
    'blocked 根因分析与 dry-run 解锁',
  ],
  goodAt: [
    '把模糊需求拆成可执行 backlog',
    '在不破坏现有闭环的前提下增量改造',
    '补 runtime / UI / docs / tests 的整链路一致性',
  ],
  stillNeedsHuman: [
    '真实平台凭据与登录态',
    '是否允许 live publish 的业务决策',
    '需要你拍板的品牌表达和最终内容判断',
  ],
});

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
  const notes = readOptionalString(row.notes, '');
  const haystack = `${row.name} ${notes} ${tags.join(' ')}`.toLowerCase();
  const keywordScore = computeKeywordScore(terms, haystack);

  const semanticScore = embeddingsSettings.semanticBoostEnabled
    ? Math.min(1, keywordScore + Math.min(notes.length / 240, 0.25))
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
  };
}

function readTextFileOrDefault(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function parseQueueSummary(queueMarkdown) {
  const lines = queueMarkdown.split(/\r?\n/u);
  const summary = {
    pending: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    currentTask: null,
  };

  for (const line of lines) {
    const taskMatch = line.match(/^- \[([ x!\-])\] (.+)$/u);
    if (!taskMatch) continue;
    const marker = taskMatch[1];
    const taskText = taskMatch[2].trim();

    if (marker === ' ') summary.pending += 1;
    if (marker === '-') {
      summary.inProgress += 1;
      if (!summary.currentTask) summary.currentTask = taskText;
    }
    if (marker === '!') summary.blocked += 1;
    if (marker === 'x') summary.done += 1;
  }

  return summary;
}

function parseBlockedTasks(queueMarkdown, limit = 20) {
  const lines = queueMarkdown.split(/\r?\n/u);
  const blocked = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^- \[!\] (.+)$/u);
    if (!match) continue;
    blocked.push({
      line: index + 1,
      task: match[1].trim(),
    });
    if (blocked.length >= limit) break;
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
  const override = readTextFileOrDefault(MODE_OVERRIDE_PATH, '').trim().toLowerCase();
  if (override === LIVE_PUBLISH_MODE || override === DEFAULT_PUBLISH_MODE) {
    return override;
  }

  const fromEnv = readOptionalString(process.env.PUBLISH_MODE, DEFAULT_PUBLISH_MODE).toLowerCase();
  return fromEnv === LIVE_PUBLISH_MODE ? LIVE_PUBLISH_MODE : DEFAULT_PUBLISH_MODE;
}

function buildOpsStatus() {
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
      sendNoContent(res, 204, { allow: 'GET, POST, OPTIONS' });
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
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', requestedHeaders);
  res.setHeader('access-control-max-age', '600');

  if (method === 'OPTIONS') {
    sendNoContent(res, 204);
    return { handled: true };
  }

  return { handled: false };
}

function inferEnergyFromText(text) {
  const value = readOptionalString(text, '').toLowerCase();
  let energy = 0;

  if (/great|good|energ|excited|开心|不错|顺利|有收获/iu.test(value)) energy += 1;
  if (/stres|tired|drain|anx|压力|焦虑|疲惫|累/iu.test(value)) energy -= 1;

  return Math.max(-2, Math.min(2, energy));
}

function inferEmotionTags(text) {
  const value = readOptionalString(text, '').toLowerCase();
  const tags = [];
  if (/开心|great|good|excited|calm|顺利|有收获/iu.test(value)) tags.push('positive');
  if (/压力|焦虑|stres|anx|tired|疲惫|累/iu.test(value)) tags.push('stressed');
  if (!tags.length) tags.push('neutral');
  return tags;
}

function summarizeMirror(checkins) {
  if (!checkins.length) {
    return '本周暂无足够 check-in 数据。建议至少完成 3 次 Quick Capture 后再生成 Self Mirror。';
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
  return db;
}

function buildStatements(db) {
  return {
    db,

    insertAudit: db.prepare('INSERT INTO Audit(id, action, payload, created_at) VALUES(?, ?, ?, ?)'),
    selectAuditById: db.prepare('SELECT id FROM Audit WHERE id = ? LIMIT 1'),
    listRecentCaptures: db.prepare(`
      SELECT id, payload, created_at
      FROM Audit
      WHERE action = 'capture'
      ORDER BY created_at DESC
      LIMIT ?
    `),

    insertEvent: db.prepare('INSERT INTO Event(id, title, payload, created_at) VALUES(?, ?, ?, ?)'),
    selectEventById: db.prepare('SELECT id, title FROM Event WHERE id = ? LIMIT 1'),

    searchPeopleByKeyword: db.prepare(`
      SELECT id, name, tags, notes, next_follow_up_at, updated_at
      FROM Person
      WHERE lower(name) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),

    insertDraft: db.prepare(
      'INSERT INTO PostDraft(id, event_id, platform, language, content, metadata, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)'
    ),

    insertQueueTask: db.prepare(
      'INSERT INTO PublishTask(id, draft_id, platform, mode, status, result, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    ),

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
      'INSERT INTO Mirror(id, range_label, content, created_at) VALUES(?, ?, ?, ?)'
    ),
    selectLatestMirror: db.prepare(`
      SELECT id, range_label, content, created_at
      FROM Mirror
      ORDER BY created_at DESC
      LIMIT 1
    `),
  };
}

async function routeRequest(req, res, statements) {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/ops/status') {
    sendJson(res, 200, buildOpsStatus());
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

  if (method === 'GET' && pathname === '/dev-digest') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 20, 100);
    const digests = statements.listRecentDigests.all(limit);
    sendJson(res, 200, { limit, count: digests.length, digests });
    return;
  }

  if (method === 'GET' && pathname === '/self-mirror') {
    const latestMirror = statements.selectLatestMirror.get();
    const checkins = statements.listRecentSelfCheckins.all(20);
    sendJson(res, 200, {
      latestMirror: latestMirror
        ? {
            mirrorId: latestMirror.id,
            rangeLabel: latestMirror.range_label,
            content: latestMirror.content,
            createdAt: latestMirror.created_at,
          }
        : null,
      checkins: checkins.map((checkin) => ({
        checkinId: checkin.id,
        energy: checkin.energy,
        emotions: parseJsonStringArray(checkin.emotions),
        triggerText: checkin.trigger_text,
        reflection: checkin.reflection,
        createdAt: checkin.created_at,
      })),
    });
    return;
  }

  if (method === 'POST' && pathname === '/self-mirror/generate') {
    const body = await readJsonBody(req);
    const rangeLabel = readOptionalString(body.range, 'last-7d');
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

    const content = summarizeMirror(checkins);
    const mirrorId = makeId('mirror');
    const createdAt = nowIso();
    statements.insertMirror.run(mirrorId, rangeLabel, content, createdAt);

    sendJson(res, 201, {
      mirrorId,
      rangeLabel,
      content,
      evidenceCount: checkins.length,
      createdAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/capture') {
    const body = await readJsonBody(req);
    const text = requireString(body.text, 'text');
    const source = readOptionalString(body.source, 'manual');

    const captureId = makeId('capture');
    const createdAt = nowIso();
    const payload = JSON.stringify({ text, source });
    statements.insertAudit.run(captureId, 'capture', payload, createdAt);

    const checkinId = makeId('checkin');
    statements.insertSelfCheckin.run(
      checkinId,
      inferEnergyFromText(text),
      JSON.stringify(inferEmotionTags(text)),
      source,
      text,
      createdAt
    );

    sendJson(res, 201, { captureId, checkinId, createdAt });
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
    const payload = JSON.stringify({
      captureId,
      details: body.payload ?? {},
    });

    statements.insertEvent.run(eventId, title, payload, createdAt);

    sendJson(res, 201, { eventId, createdAt });
    return;
  }

  if (method === 'POST' && pathname === '/people/search') {
    const body = await readJsonBody(req);
    const query = requireString(body.query, 'query');
    const limit = normalizeSearchLimit(body.limit, 8);
    const pattern = `%${query.toLowerCase()}%`;

    const embeddingsSettings = resolveEmbeddingsSettings();

    const rows = statements.searchPeopleByKeyword.all(pattern, pattern, pattern, limit * 3);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const results = rows
      .map((row) => buildSearchResultRow(row, terms, embeddingsSettings))
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, limit);

    sendJson(res, 200, {
      query,
      retrieval: {
        mode: embeddingsSettings.retrievalMode,
        effectiveProvider: embeddingsSettings.effectiveProvider,
        semanticBoostEnabled: embeddingsSettings.semanticBoostEnabled,
        fallback: 'keyword',
      },
      count: results.length,
      results,
    });
    return;
  }

  if (method === 'POST' && pathname === '/publish/queue') {
    const body = await readJsonBody(req);
    const eventId = requireString(body.eventId, 'eventId');

    const event = statements.selectEventById.get(eventId);
    if (!event) throw new HttpError(404, 'eventId not found');

    const platformRule = resolvePlatformRule(body.platform);
    const platform = platformRule.id;
    const mode = normalizePublishMode(body.mode);
    const language = readOptionalString(body.language, 'en');
    const content = readOptionalString(body.content, event.title);
    const compliance = validateQueueContentCompliance(platformRule, content);

    if (!compliance.ok) {
      sendJson(res, 422, {
        error: 'platform compliance failed',
        platform,
        issues: compliance.issues,
      });
      return;
    }

    const metadata = buildQueueMetadata(body);

    const createdAt = nowIso();
    const draftId = makeId('draft');
    statements.insertDraft.run(
      draftId,
      eventId,
      platform,
      language,
      content,
      JSON.stringify(metadata),
      createdAt
    );

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
        noDeliver: metadata.noDeliver,
        highFrequency: metadata.highFrequency,
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

    const draftMetadata = safeParseJsonObject(task.metadata);
    const highFrequency = readHighFrequencyHint(draftMetadata) || readHighFrequencyHint(body);
    const stickyNoDeliver =
      readOptionalBoolean(draftMetadata.noDeliver, false) || readOptionalBoolean(body.noDeliver, false);
    const noDeliver = highFrequency || stickyNoDeliver || effectiveMode !== LIVE_PUBLISH_MODE;

    const dispatchEligible = effectiveMode === LIVE_PUBLISH_MODE && !noDeliver;
    const dispatched = false;

    let dispatchReason = 'publisher_execution_simulated';
    if (noDeliver) {
      if (highFrequency) {
        dispatchReason = 'high_frequency_no_deliver';
      } else if (effectiveMode !== LIVE_PUBLISH_MODE) {
        dispatchReason = 'dry_run_default';
      } else {
        dispatchReason = 'no_deliver_flagged';
      }
    }

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
      status: 'executed',
      requestedMode,
      mode: effectiveMode,
      approvedBy,
      approvedAt: timestamp,
      publisher: 'publisher.workflow',
      liveGate,
      delivery: {
        noDeliver,
        highFrequency,
        dispatchEligible,
        dispatched,
        reason: dispatchReason,
      },
    };

    const nextStatus = 'executed';
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
        `Approve→publish executed for ${taskId}`,
        'Approved task promoted through publisher workflow',
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
      delivery: {
        noDeliver,
        highFrequency,
        dispatchEligible,
        dispatched,
      },
    });
    return;
  }

  throw new HttpError(404, 'route not found');
}

export function createApiServer({ dbPath = DEFAULT_DB_PATH } = {}) {
  const db = initDb(dbPath);
  const statements = buildStatements(db);
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
    db.close();
  });

  return { server, dbPath };
}

export async function startApiServer({
  port = DEFAULT_PORT,
  dbPath = DEFAULT_DB_PATH,
  quiet = false,
} = {}) {
  const { server } = createApiServer({ dbPath });

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
  GET  /ops/status          -> runtime mode/lock/queue/health snapshot
  GET  /ops/runs?limit=N    -> recent devloop run JSON summaries
  GET  /ops/blocked         -> blocked queue entries
  GET  /settings/embeddings -> resolves embedding provider + retrieval mode
  GET  /dev-digest?limit=N  -> latest DevDigest rows
  GET  /self-mirror         -> latest mirror + recent checkins
  POST /self-mirror/generate -> generate and persist weekly mirror summary
  POST /capture             -> writes Audit row
  POST /events              -> writes Event row
  POST /people/search       -> keyword/hybrid search with auto semantic enhancement when key exists
  POST /publish/queue       -> validates platform compliance + writes PostDraft + PublishTask rows
  POST /publish/approve     -> executes publisher workflow + writes Audit + DevDigest

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
