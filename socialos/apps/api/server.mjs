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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(process.env.SOCIALOS_REPO_ROOT || path.resolve(__dirname, '../../..'));
const DOTENV_PATH = path.join(REPO_ROOT, '.env');
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

function formatPlatformLabel(platformId) {
  return PLATFORM_COMPLIANCE_RULES[platformId]?.label || platformId;
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

function localizeCapability(capability, platformId, language) {
  if (language !== 'zh') return capability;

  const supportLevelMap = {
    'L0 Draft': 'L0 草稿',
    'L1 Assisted': 'L1 辅助发布',
    'L1 Assisted+': 'L1 增强辅助发布',
    'L1.5 Rich Article Package': 'L1.5 图文稿包',
    'L2 Auto Publish (credentials gated)': 'L2 自动发布（需凭据）',
  };

  const entryTargetMap = {
    instagram: 'Instagram 发布器',
    x: 'X 发布入口',
    linkedin: 'LinkedIn 发布入口',
    zhihu: '知乎编辑器',
    xiaohongshu: '小红书移动端发布页',
    wechat_moments: '微信朋友圈发布页',
    wechat_official: '微信公众号后台',
  };

  const blockedByMap = {
    'final publish stays manual': '最终发布仍需手动完成',
    'requires live mode + credentials': '需要开启 live 模式并提供凭据',
    'manual media + final publish step': '需要手动处理素材并完成最终发布',
    'manual mobile-only publish': '仅支持手机端手动发布',
    'manual article assembly + final publish': '需要手动组装图文并完成最终发布',
    'manual completion required': '需要手动完成发布',
  };

  return {
    ...capability,
    supportLevel: supportLevelMap[capability.supportLevel] || capability.supportLevel,
    entryTarget: entryTargetMap[platformId] || capability.entryTarget,
    blockedBy: blockedByMap[capability.blockedBy] || capability.blockedBy,
  };
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
    evidenceSnippet,
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
  let firstQueuedTask = null;

  for (const line of lines) {
    const taskMatch = line.match(/^- \[([ xX!\-])\] (.+)$/u);
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

function searchPeopleMatches(statements, query, limit = 4) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return [];
  const embeddingsSettings = resolveEmbeddingsSettings();
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
  return statements.listAllPeople
    .all()
    .filter(isDisplayablePersonRow)
    .map((row) => buildSearchResultRow(row, terms, embeddingsSettings))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}

function searchEventMatches(statements, query, limit = 4) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);

  return statements.listRecentEvents
    .all(60)
    .map(formatEventRow)
    .map((event) => {
      const haystack = cleanText(
        [
          event.title,
          event.payload?.audience,
          event.payload?.tone,
          event.payload?.languageStrategy,
          summarizeEventPayload(event.payload || {}),
        ]
          .filter(Boolean)
          .join(' ')
      ).toLowerCase();
      const score = computeKeywordScore(terms, haystack);
      return {
        ...event,
        score,
        snippet: truncateText(summarizeEventPayload(event.payload || {}) || event.title, 180),
      };
    })
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
  if (/(找|搜索|search|who|哪个人|哪位|回忆|记得)/u.test(source)) return 'search';
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

function buildWorkspaceSummary({
  preferredChinese,
  hasUntypedVoiceOnly,
  hasTranscribedAudio,
  intent,
  relatedPeople,
  relatedEvents,
  captureDraft,
}) {
  const personName = cleanText(captureDraft?.personDraft?.name || '');
  const requiresNameConfirmation = Boolean(captureDraft?.personDraft?.requiresNameConfirmation);
  if (hasUntypedVoiceOnly) {
    return preferredChinese
      ? '我收到了这段语音，但现在还没有 transcript，所以先不乱回复。只要浏览器语音识别可用，或者配置好 OPENAI_API_KEY，这里就能像正常聊天一样直接语音转文字。'
      : 'I got the voice note, but there is no transcript yet, so I will not guess. Once browser speech recognition or OPENAI_API_KEY transcription is available, this chat can behave like a normal voice turn.';
  }

  if (intent === 'search') {
    if (relatedPeople.length || relatedEvents.length) {
      return preferredChinese
        ? `我先找到了最相关的 ${relatedPeople.length} 个联系人和 ${relatedEvents.length} 条事件线索，先给你看最值得开的结果。`
        : `I found the strongest contact and event context first, and I am only surfacing the hits most worth opening.`;
    }
    return preferredChinese
      ? '我先查了联系人和事件，但这次还没有特别稳的命中。再补一个名字、主题词或时间点会更准。'
      : 'I checked contacts and events first, but nothing is strong enough yet. Add a name, topic, or time clue and I can narrow it down.';
  }

  if (intent === 'campaign') {
    return preferredChinese
      ? '这条更像内容或活动请求。我先保持简洁，只在你真的要推进时再给 event 和 drafts 动作。'
      : 'This reads like a content or event request. I am keeping it compact and only surfacing event or draft actions when they help.';
  }

  if (hasTranscribedAudio) {
    return preferredChinese
      ? '我已经把这段语音并进当前对话了。你先看看提取出来的人和要点对不对，确认后再存进记忆就行。'
      : 'I merged that voice note into the current chat turn. Check that the extracted person and next step look right, then save it to memory if you want.';
  }

  if (requiresNameConfirmation) {
    return preferredChinese
      ? '我先整理出了一张联系人草稿，但名字还需要你确认。先改对名字，再保存会更稳。'
      : 'I drafted a contact card, but the name still needs your confirmation. Edit that first, then save it.';
  }

  if (personName) {
    return preferredChinese
      ? `我先从这句话里提了一个联系人草稿：${personName}。方向对的话就保存，不急着一下子展开更多流程。`
      : `I pulled a contact draft out of this message: ${personName}. Save it if it looks right, or keep talking to refine it.`;
  }

  return preferredChinese
    ? '我先把这条消息接住，保持正常聊天。需要查人、建 event 或出 drafts 时再往前走。'
    : 'I captured the message and kept the reply lightweight. I will only branch into memory, events, or drafts when you need that next step.';
}

function buildSuggestedEventPayload(text, draft, relatedPeople = []) {
  const combined = cleanText(draft?.combinedText || text);
  const personName = cleanText(draft?.personDraft?.name || relatedPeople[0]?.name || '');
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
    kicker: 'Contact draft',
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
    kicker,
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
    kicker: 'Suggested event',
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
    kicker,
    title: `${draft.platformLabel || draft.platform || 'Draft'} · ${draft.eventTitle || draft.eventId || ''}`.trim(),
    body: truncateText(draft.snippet || draft.content || 'A platform package already exists for this topic.', 200),
    href: `/drafts?eventId=${encodeURIComponent(draft.eventId || '')}`,
    badges: [draft.language, draft.publishPackage?.supportLevel || draft.capability?.supportLevel],
    detailLines: [
      draft.publishPackage?.entryTarget ? `Entry: ${draft.publishPackage.entryTarget}` : '',
    ],
  });
}

function buildWorkspaceMirrorCard(latestMirror) {
  if (!latestMirror?.mirrorId) return null;
  return buildPresentationCard('mirror', {
    kicker: 'Mirror',
    title: 'Latest self signal',
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
  preferredChinese,
  captureDraft,
  relatedPeople,
  relatedEvents,
  relatedDrafts,
  suggestedEvent,
  latestMirror,
  showMemoryAction,
  showEventSuggestion,
}) {
  if (!shouldUseModelWorkspaceAssist(source)) {
    return { method: 'heuristic', model: '', plan: null };
  }

  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  const model = readOptionalString(process.env.OPENAI_WORKSPACE_RESPONSE_MODEL, 'gpt-5.4');
  const combinedText = cleanText(captureDraft?.combinedText || text);
  if (!apiKey || !combinedText) {
    return { method: 'heuristic', model: '', plan: null };
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
    },
  };

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
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { method: 'heuristic', model: '', plan: null };
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
      return { method: 'heuristic', model: '', plan: null };
    }
    return { method: 'model', model, plan: parsed };
  } catch {
    return { method: 'heuristic', model: '', plan: null };
  }
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
}) {
  const fallbackMode = ['capture', 'search', 'campaign', 'self'].includes(intent) ? intent : 'mixed';
  const draftCard = buildWorkspaceContactDraftCard(captureDraft);
  const personCard = buildWorkspacePersonMatchCard(
    relatedPeople[0],
    fallbackMode === 'search' ? 'Best contact match' : 'Contact memory'
  );
  const eventCard = buildWorkspaceEventCard(
    relatedEvents[0],
    fallbackMode === 'campaign' ? 'Relevant event' : fallbackMode === 'search' ? 'Event match' : 'Event context'
  );
  const suggestedEventCard = buildWorkspaceSuggestedEventCard(suggestedEvent);
  const draftResultCard = buildWorkspaceDraftCard(relatedDrafts[0]);
  const mirrorCard = buildWorkspaceMirrorCard(latestMirror);
  const availableCards = {
    contactDraft: draftCard,
    contact: personCard,
    event: eventCard,
    suggestedEvent: suggestedEventCard,
    draft: draftResultCard,
    mirror: mirrorCard,
  };
  const mode = normalizeWorkspacePresentationMode(modelAssist?.plan?.mode, fallbackMode);

  let primaryCard = null;
  if (mode === 'capture') {
    primaryCard = draftCard || personCard || suggestedEventCard || mirrorCard;
  } else if (mode === 'search') {
    primaryCard = personCard || eventCard || draftResultCard || mirrorCard;
  } else if (mode === 'campaign') {
    primaryCard = suggestedEventCard || draftResultCard || eventCard || draftCard;
  } else if (mode === 'self') {
    primaryCard = mirrorCard || draftCard || personCard;
  } else {
    primaryCard = draftCard || personCard || suggestedEventCard || draftResultCard || mirrorCard;
  }

  const modelPrimaryTarget = normalizeWorkspaceCardTarget(modelAssist?.plan?.primaryTarget);
  if (modelPrimaryTarget && modelPrimaryTarget !== 'none' && availableCards[modelPrimaryTarget]) {
    primaryCard = availableCards[modelPrimaryTarget];
  }

  let secondaryCards = dedupePresentationCards(
    [
      primaryCard === draftCard ? personCard : draftCard,
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

  const availableActions = [];
  if (showMemoryAction) {
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

  return {
    mode,
    answer: readOptionalString(summary, ''),
    primaryCard,
    secondaryCards: dedupePresentationCards(secondaryCards, 3),
    actions,
  };
}

async function buildWorkspaceChatPayload(statements, body = {}) {
  const source = readOptionalString(body.source, 'workspace-chat');
  const text = cleanText(body.text || '');
  const assetIds = cleanList(body.assetIds);
  const assets = selectCaptureAssetsByIds(statements, assetIds);
  const captureDraft = await buildCaptureDraftWithModelAssist({ text, source, assets });
  const combinedText = cleanText(captureDraft.combinedText || text);
  const audioAssets = assets.filter((asset) => asset.kind === 'audio');
  const imageAssets = assets.filter((asset) => asset.kind === 'image');
  const hasTranscribedAudio = audioAssets.some((asset) => cleanText(asset.extractedText || asset.previewText));
  const hasUntypedVoiceOnly = !cleanText(text) && audioAssets.length > 0 && !hasTranscribedAudio;
  const intent = inferWorkspaceIntent(combinedText, assets);
  const relatedPeople = searchPeopleMatches(statements, combinedText, 4);
  const relatedEvents = searchEventMatches(statements, combinedText, 4);
  const relatedDrafts = searchDraftMatches(statements, combinedText, 3);
  const suggestedEvent = buildSuggestedEventPayload(text, captureDraft, relatedPeople);
  const latestMirrorRow = statements.selectLatestMirror.get();
  const latestMirror = latestMirrorRow
    ? formatMirrorPayload(latestMirrorRow, statements.listMirrorEvidenceByMirrorId.all(latestMirrorRow.id))
    : null;
  const preferredChinese = prefersChineseWorkspaceReply(combinedText);
  const showEventSuggestion = shouldShowWorkspaceEventSuggestion(intent, combinedText);
  const showMemoryAction =
    intent !== 'search' &&
    Boolean(
      cleanText(captureDraft.personDraft?.displayName || captureDraft.personDraft?.name || '') ||
        cleanText(captureDraft.interactionDraft?.summary || '') ||
        combinedText
    );
  const modelAssist = await buildWorkspaceModelAssist({
    text,
    source,
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
  });

  return {
    responseId: makeId('workspace'),
    intent,
    summary: answer,
    presentation,
    text,
    assets,
    captureDraft,
    extraction: captureDraft.extraction || { method: 'heuristic', model: '' },
    relatedPeople,
    relatedEvents,
    relatedDrafts,
    suggestedEvent,
    ui: {
      showMemoryAction,
      showEventSuggestion,
      people: compactPeople,
      events: compactEvents,
      coordination,
    },
    commitPayload: {
      text,
      source,
      assetIds,
      combinedText: captureDraft.combinedText,
      personDraft: captureDraft.personDraft,
      selfCheckinDraft: captureDraft.selfCheckinDraft,
      interactionDraft: captureDraft.interactionDraft,
    },
      recommendedDraftRequest: {
      platforms: [...SUPPORTED_QUEUE_PLATFORMS],
      languages: ['platform-native'],
      cta: '',
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
      checkins: recentCheckins.length,
    },
    summaryText: [
      followUps.length ? `${followUps.length} relationship follow-up${followUps.length > 1 ? 's' : ''} are warm right now.` : 'No follow-ups are staged yet.',
      queuedTasks.length ? `${queuedTasks.length} draft${queuedTasks.length > 1 ? 's' : ''} waiting in queue.` : 'No queued drafts are waiting.',
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

  return {
    generatedAt: nowIso(),
    summaryText: cockpit.summaryText,
    topActions: cockpit.actions.slice(0, 3),
    recentContacts: cockpit.recentPeople.slice(0, 3),
    recentEvents: cockpit.recentEvents.slice(0, 3),
    recentDrafts: drafts,
    queuePreview: [
      ...cockpit.queue.awaitingApproval,
      ...cockpit.queue.manualSteps,
    ].slice(0, 3),
    latestMirror: cockpit.latestMirror,
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
        cluster.enabled ? 'Foundry ready' : 'Foundry unavailable',
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
    suggestion: {
      followUpMessage: buildFollowUpMessage(person, interactions),
      nextFollowUpAt: person.nextFollowUpAt,
    },
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

async function buildCaptureDraftWithModelAssist({ text, source = 'manual', assets = [] }) {
  const fallbackDraft = buildCaptureDraft({ text, source, assets });
  if (!shouldUseModelCaptureAssist(source)) {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '' });
  }

  const apiKey = readOptionalString(process.env.OPENAI_API_KEY, '');
  const model = readOptionalString(process.env.OPENAI_CAPTURE_DRAFT_MODEL, 'gpt-5.4');
  const combinedText = cleanText(fallbackDraft.combinedText || text);
  if (!apiKey || !combinedText) {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '' });
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
              text: combinedText,
              source,
              assets: assets.map((asset) => ({
                kind: asset.kind,
                fileName: asset.fileName,
                extractedText: cleanText(asset.extractedText || asset.previewText || ''),
              })),
            }),
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '' });
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
      return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '' });
    }

    return mergeModelCaptureDraft(fallbackDraft, parsed, { method: 'model', model });
  } catch {
    return mergeModelCaptureDraft(fallbackDraft, {}, { method: 'heuristic', model: '' });
  }
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
  if (isPlaceholderContactName(personDraft.name)) {
    throw new HttpError(400, 'name confirmation required', {
      field: 'personDraft.name',
      reason: 'placeholder_name',
    });
  }
  const requestedPersonId = cleanText(preferredPersonId || personDraft.personId || '');
  const existingById = requestedPersonId ? statements.selectPersonById.get(requestedPersonId) : null;

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

  if (isPlaceholderContactName(draft.personDraft?.name)) {
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

    insertCaptureAsset: db.prepare(`
      INSERT INTO CaptureAsset(id, kind, mime_type, file_name, extracted_text, metadata, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `),
    selectCaptureAssetById: db.prepare(`
      SELECT id, kind, mime_type, file_name, extracted_text, metadata, created_at
      FROM CaptureAsset
      WHERE id = ?
      LIMIT 1
    `),
    listRecentCaptureAssets: db.prepare(`
      SELECT id, kind, mime_type, file_name, extracted_text, metadata, created_at
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
      'INSERT INTO Mirror(id, range_label, content, created_at) VALUES(?, ?, ?, ?)'
    ),
    selectMirrorById: db.prepare(`
      SELECT id, range_label, content, created_at
      FROM Mirror
      WHERE id = ?
      LIMIT 1
    `),
    selectLatestMirror: db.prepare(`
      SELECT id, range_label, content, created_at
      FROM Mirror
      ORDER BY created_at DESC
      LIMIT 1
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
    extractedText: readOptionalString(row.extracted_text, ''),
    metadata,
    previewText: readOptionalString(metadata.previewText, ''),
    status: readOptionalString(metadata.status, 'parsed'),
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
    language: row.language,
    content: row.content,
    metadata,
    capability: metadata.capability || getPlatformCapability(row.platform),
    publishPackage: metadata.publishPackage || null,
    validation: metadata.validation || null,
    variants: metadata.variants || [],
    createdAt: row.created_at,
  };
}

function dedupeLatestDrafts(drafts, limit = drafts.length) {
  const latestByKey = new Map();

  for (const draft of drafts) {
    const key = [draft.eventId || '', draft.platform || '', draft.language || ''].join('::');
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

  if (method === 'GET' && pathname === '/events') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 12, 50);
    const events = statements.listRecentEvents.all(limit).map(formatEventRow);
    sendJson(res, 200, { limit, count: events.length, events });
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

  if (method === 'GET' && pathname === '/people') {
    const limit = normalizeOpsLimit(requestUrl.searchParams.get('limit'), 8, 50);
    const query = readOptionalString(requestUrl.searchParams.get('query'), '');

    if (!query) {
      const people = statements.listRecentPeople.all(limit * 3).filter(isDisplayablePersonRow).map(formatPersonRow).slice(0, limit);
      sendJson(res, 200, { query: '', count: people.length, people, retrieval: null });
      return;
    }

    const pattern = `%${query.toLowerCase()}%`;
    const embeddingsSettings = resolveEmbeddingsSettings();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = statements.listAllPeople.all().filter(isDisplayablePersonRow);
    const results = rows
      .map((row) => buildSearchResultRow(row, terms, embeddingsSettings))
      .filter((row) => row.score > 0)
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

  if (method === 'GET' && peopleDetailMatch) {
    const personId = parseDynamicId(peopleDetailMatch);
    const detail = buildPeopleDetailPayload(statements, personId);
    if (!detail) throw new HttpError(404, 'personId not found');
    sendJson(res, 200, detail);
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
    const queueTasks = statements.listRecentQueueTasks
      .all(limit * 3)
      .map(formatQueueTaskRow)
      .filter((task) => !statusFilter || task.status.toLowerCase() === statusFilter)
      .slice(0, limit);
    sendJson(res, 200, { limit, count: queueTasks.length, queueTasks });
    return;
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
    sendJson(res, 200, {
      publishMode: readMode(),
      liveEnvironmentEnabled: isLiveEnvironmentEnabled(),
      embeddings: resolveEmbeddingsSettings(),
      foundry: buildFoundryClusterSummary(),
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
    const latestMirror = statements.selectLatestMirror.get();
    const checkins = dedupeMeaningfulCheckins(statements.listRecentSelfCheckins.all(40), 20);
    const evidenceRows = latestMirror ? statements.listMirrorEvidenceByMirrorId.all(latestMirror.id) : [];
    sendJson(res, 200, {
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

    const meaningfulCheckins = dedupeMeaningfulCheckins(checkins, 12);

    const captures = statements.listRecentCaptures.all(12).map(formatCaptureRow);
    const interactions = statements.listRecentInteractions.all(12).map(formatInteractionRow);
    const structuredMirror = buildStructuredMirror({
      checkins: meaningfulCheckins,
      captures,
      interactions,
    });
    const mirrorId = makeId('mirror');
    const createdAt = nowIso();
    statements.db.exec('BEGIN');
    try {
      statements.insertMirror.run(mirrorId, rangeLabel, JSON.stringify(structuredMirror), createdAt);
      upsertMirrorEvidenceRows(statements, mirrorId, structuredMirror);
      statements.db.exec('COMMIT');
    } catch (error) {
      statements.db.exec('ROLLBACK');
      throw error;
    }

    sendJson(
      res,
      201,
      formatMirrorPayload(
        {
          id: mirrorId,
          range_label: rangeLabel,
          content: JSON.stringify(structuredMirror),
          created_at: createdAt,
        },
        statements.listMirrorEvidenceByMirrorId.all(mirrorId)
      )
    );
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
    const inlineText = cleanText(body.extractedText || body.transcript || body.previewText || '');
    const contentBase64 = readOptionalString(body.contentBase64, '') || readOptionalString(body.dataUrl, '');
    const openAiTranscription =
      !inlineText && kind === 'audio'
        ? await runOpenAiAudioTranscription({ mimeType, contentBase64 })
        : { text: '', provider: 'skipped' };
    const extractedText =
      inlineText ||
      (kind === 'audio' ? openAiTranscription.text : '') ||
      (kind === 'image' ? runLocalImageOcr({ mimeType, contentBase64 }) : '');
    const status = extractedText ? 'parsed' : 'manual_review';
    const assetId = makeId('asset');
    const createdAt = nowIso();
    const metadata = {
      source: readOptionalString(body.source, 'dashboard'),
      transcriptMethod:
        kind === 'audio'
          ? extractedText
            ? openAiTranscription.provider === 'openai'
              ? 'openai-transcription'
              : 'browser_or_manual'
            : 'manual_required'
          : readOptionalString(body.ocrMethod, extractedText ? 'local-ocr' : 'manual_required'),
      previewText: truncateText(extractedText, 280),
      status,
      transcriptionProvider: kind === 'audio' ? openAiTranscription.provider : null,
      transcriptionError: kind === 'audio' ? readOptionalString(openAiTranscription.error, '') : '',
      contentBytes: contentBase64 ? Buffer.byteLength(contentBase64, 'utf8') : 0,
    };

    statements.insertCaptureAsset.run(
      assetId,
      kind,
      mimeType,
      fileName,
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
        extracted_text: extractedText,
        metadata: JSON.stringify(metadata),
        created_at: createdAt,
      }),
      refineAvailable: Boolean(readOptionalString(process.env.OPENAI_API_KEY, '')),
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
    const generatedDrafts = [];

    for (const platformId of platforms) {
      const platformRule = resolvePlatformRule(platformId);
      const languages = resolveDraftLanguagesForPlatform(platformRule.id, languageStrategy);
      for (const language of languages) {
        const content = buildDraftContent(platformRule, event, language, body);
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
      }
    }

    sendJson(res, 201, {
      eventId,
      count: generatedDrafts.length,
      drafts: generatedDrafts,
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

    sendJson(res, 201, {
      eventId,
      createdAt,
      event: formatEventRow({
        id: eventId,
        title,
        payload,
        created_at: createdAt,
      }),
    });
    return;
  }

  if (method === 'POST' && pathname === '/people/search') {
    const body = await readJsonBody(req);
    const query = requireString(body.query, 'query');
    const limit = normalizeSearchLimit(body.limit, 8);

    const embeddingsSettings = resolveEmbeddingsSettings();

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = statements.listAllPeople.all().filter(isDisplayablePersonRow);

    const results = rows
      .map((row) => buildSearchResultRow(row, terms, embeddingsSettings))
      .filter((row) => row.score > 0)
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
    const draftIdInput =
      typeof body.draftId === 'string' && body.draftId.trim() ? body.draftId.trim() : null;
    const queueMetadata = buildQueueMetadata(body);

    let eventId = null;
    let platformRule;
    let platform;
    let language;
    let content;
    let draftId = draftIdInput;

    if (draftIdInput) {
      const existingDraft = statements.selectDraftById.get(draftIdInput);
      if (!existingDraft) throw new HttpError(404, 'draftId not found');
      eventId = existingDraft.event_id;
      platformRule = resolvePlatformRule(existingDraft.platform);
      platform = platformRule.id;
      language = existingDraft.language;
      content = existingDraft.content;

      const existingMetadata = safeParseJsonObject(existingDraft.metadata, {});
      const existingHighFrequency = readOptionalBoolean(existingMetadata.highFrequency, false);
      const existingNoDeliver = readOptionalBoolean(existingMetadata.noDeliver, false);
      const nextDraftMetadata = {
        ...existingMetadata,
        highFrequency: existingHighFrequency || queueMetadata.highFrequency,
        noDeliver: existingNoDeliver || queueMetadata.noDeliver,
      };
      if (!nextDraftMetadata.validation) {
        const validation = buildDraftValidation(
          platformRule,
          content,
          validateQueueContentCompliance(platformRule, content).issues
        );
        nextDraftMetadata.validation = validation;
      }
      if (
        !existingMetadata.validation ||
        nextDraftMetadata.highFrequency !== existingHighFrequency ||
        nextDraftMetadata.noDeliver !== existingNoDeliver
      ) {
        statements.updateDraftContentMetadata.run(content, JSON.stringify(nextDraftMetadata), draftIdInput);
      }
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

    if (!compliance.ok) {
      sendJson(res, 422, {
        error: 'platform compliance failed',
        platform,
        issues: compliance.issues,
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
      const validation = buildDraftValidation(platformRule, content, compliance.issues);
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
    if (new Set(['posted', 'failed']).has(task.status) && task.status === outcome) {
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
  GET  /capture/assets
  POST /capture/assets
  POST /capture/parse
  POST /capture/commit
  GET  /ops/status          -> runtime mode/lock/queue/health snapshot
  GET  /ops/runs?limit=N    -> recent devloop run JSON summaries
  GET  /ops/blocked         -> blocked queue entries
  GET  /ops/tasks?limit=N   -> structured Foundry task intake surface
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
