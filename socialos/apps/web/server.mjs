import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_NETWORK_DECK_CLUSTERS } from '../../lib/demo-network.mjs';

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.SOCIALOS_WEB_PORT || 4173);
export const DEFAULT_API_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
export const DEFAULT_API_BASE_URL = `http://${LOOPBACK_HOST}:${DEFAULT_API_PORT}`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCS_DIR = path.join(REPO_ROOT, 'socialos', 'docs');
const EVIDENCE_DIR = path.join(DOCS_DIR, 'evidence');
const PITCH_DIR = path.join(DOCS_DIR, 'pitch');
const VENDOR_DIR = path.join(__dirname, 'vendor', 'reveal');
const REVEAL_CSS_PATH = path.join(VENDOR_DIR, 'reveal.min.css');
const REVEAL_JS_PATH = path.join(VENDOR_DIR, 'reveal.min.js');
const REVEAL_NOTES_PATH = path.join(VENDOR_DIR, 'notes.min.js');
const DECK_STATUS_PATH = path.join(PITCH_DIR, 'DECK_STATUS.json');
const EVIDENCE_STEP_ONE_PATH = path.join(EVIDENCE_DIR, 'socialos-demo-step01.png');
const EVIDENCE_STEP_TWO_CONTACTS_PATH = path.join(EVIDENCE_DIR, 'socialos-demo-step02-contacts.png');
const EVIDENCE_STEP_FOUR_PATH = path.join(EVIDENCE_DIR, 'socialos-demo-step04.png');
const EVIDENCE_STEP_EIGHT_PATH = path.join(EVIDENCE_DIR, 'socialos-demo-step08.png');
const EVIDENCE_HACKATHON_HUB_PATH = path.join(EVIDENCE_DIR, 'hackathon-public-hub.png');
const EVIDENCE_BUDDY_PUBLIC_PATH = path.join(EVIDENCE_DIR, 'buddy-public-proof.png');
const EVIDENCE_AI_GOOD_TELEGRAM_PATH = path.join(EVIDENCE_DIR, 'ai-agents-for-good-telegram-proof.png');
const HACKATHON_OVERVIEW_EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'hackathon-overview.json');
const HACKATHON_PROOFS_ALL_EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'hackathon-proofs-all.json');
const PUBLIC_REPO_URL = 'https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos';
const PUBLIC_REPO_QUICKSTART_URL = `${PUBLIC_REPO_URL}#quickstart`;
const PUBLIC_API_SETUP_URL = `${PUBLIC_REPO_URL}/blob/main/socialos/docs/API_SETUP.md`;
const PUBLIC_DECK_URL = 'https://zhouyixiaoxiao.org/';
let apiBaseUrlOverride = '';
const fileTextCache = new Map();
const dataUriCache = new Map();

const PAGE_DEFINITIONS = [
  {
    id: 'cockpit',
    title: 'Cockpit',
    path: '/cockpit',
    summary: 'Your relationship, content, and self operating system in one daily action surface.',
    nav: false,
  },
  {
    id: 'quick-capture',
    title: 'Workspace',
    path: '/quick-capture',
    summary: 'One unified home for capture, memory recall, event suggestions, and platform-ready next actions.',
  },
  {
    id: 'demo',
    title: 'Demo',
    path: '/demo',
    summary: 'Judge-ready walkthrough of the SocialOS loop for Claw for Human and the shared master demo.',
  },
  {
    id: 'hackathon',
    title: 'Hackathon',
    path: '/hackathon',
    summary: 'Bounty hub for fit, integrations, proof cards, and the fastest route through each submission story.',
  },
  {
    id: 'buddy',
    title: 'Buddy',
    path: '/buddy',
    summary: 'A friendlier, safer Friendship and Gratitude Coach mode for Human for Claw.',
  },
  {
    id: 'ask',
    title: 'Ask',
    path: '/ask',
    summary: 'Natural-language recall across contacts, events, drafts, and your recent self mirror.',
    nav: false,
  },
  {
    id: 'deck',
    title: 'Deck',
    path: '/deck',
    summary: 'VC-facing microsite deck for the public SocialOS pitch.',
    nav: false,
  },
  {
    id: 'people',
    title: 'Contacts',
    path: '/people',
    summary: 'A lighter directory view for people memory, identities, and follow-up context.',
  },
  {
    id: 'events',
    title: 'Logbook',
    path: '/events',
    summary: 'A structured record of campaign-worthy events and the timeline behind them.',
  },
  {
    id: 'drafts',
    title: 'Drafts',
    path: '/drafts',
    summary: 'Generate 7-platform publish packages, inspect support level, and queue the drafts that are ready.',
  },
  {
    id: 'queue',
    title: 'Queue',
    path: '/queue',
    summary: 'Approve queued drafts, watch dry-run versus live gates, and inspect execution traces.',
  },
  {
    id: 'self-mirror',
    title: 'Mirror',
    path: '/self-mirror',
    summary: 'Review recent check-ins and regenerate the weekly mirror when you want a fresh synthesis.',
  },
  {
    id: 'dev-digest',
    title: 'Dev Digest',
    path: '/dev-digest',
    summary: 'Track run reports, blocked items, and what the devloop is doing instead of idle spinning.',
    nav: false,
  },
  {
    id: 'studio',
    title: 'Studio',
    path: '/studio',
    summary: 'Operate the Studio control plane for tasks, runs, agents, and policies.',
  },
  {
    id: 'settings',
    title: 'Settings',
    path: '/settings',
    summary: 'Legacy shell that now hands off to Studio policies.',
    nav: false,
  },
];

const ROUTE_PAGES = PAGE_DEFINITIONS.map((page) => ({ ...page }));

export const DASHBOARD_PAGES = ROUTE_PAGES.filter((page) => page.nav !== false).map((page) => ({ ...page }));

const PAGE_BY_PATH = new Map(ROUTE_PAGES.map((page) => [page.path, page]));
const PUBLIC_NAV_LINKS = Object.freeze([
  Object.freeze({ title: 'Deck', path: '/' }),
  Object.freeze({ title: 'Demo', path: '/demo/' }),
  Object.freeze({ title: 'Hackathon', path: '/hackathon/' }),
  Object.freeze({ title: 'Buddy', path: '/buddy/' }),
  Object.freeze({ title: 'Repo', path: PUBLIC_REPO_URL }),
]);

const HACKATHON_PAGE_FALLBACK = Object.freeze([
  Object.freeze({
    id: 'claw-for-human',
    label: 'Claw for Human',
    status: 'ready',
    route: '/demo',
    localRecordRoute: '/demo',
    publicAnchor: '/hackathon/#bounty-claw-for-human',
    proofJsonUrl: '/data/proofs/claw-for-human.json',
    deckAppendixSlide: 'Slide 9',
    problem: 'Claw is powerful for builders, but judges need to see it translated into a guided end-user workflow.',
    uniqueAngle: 'Bring Claw into a human-readable relationship workspace.',
    integrationSummary: 'OpenClaw runs the orchestration and SocialOS turns it into one calm loop across memory, drafts, queue, and reflection.',
    liveProofSummary: 'OpenClaw lanes, the judge-facing demo route, and exported proof cards are all live inside the current product surface.',
    integrations: ['OpenClaw Runtime', 'Workspace UI', 'Pitch Deck'],
  }),
  Object.freeze({
    id: 'animoca',
    label: 'Animoca Bounty',
    status: 'ready',
    route: '/hackathon?bounty=animoca',
    localRecordRoute: '/hackathon?bounty=animoca',
    publicAnchor: '/hackathon/#bounty-animoca',
    proofJsonUrl: '/data/proofs/animoca.json',
    deckAppendixSlide: 'Slide 10',
    problem: 'Creator-community workflows need persistent identity, memory, and coordination instead of one-shot tasks.',
    uniqueAngle: 'Persistent identity, memory, and agent coordination for creator/community ops.',
    integrationSummary: 'The people graph, event graph, and OpenClaw lane separation already make identity and coordination persistent across sessions.',
    liveProofSummary: 'The judge route can move from bounty framing into real contacts, events, and lane coordination without changing products.',
    integrations: ['OpenClaw Runtime', 'People Memory', 'Studio Agents'],
  }),
  Object.freeze({
    id: 'human-for-claw',
    label: 'Human for Claw',
    status: 'ready',
    route: '/buddy',
    localRecordRoute: '/buddy',
    publicAnchor: '/hackathon/#bounty-human-for-claw',
    proofJsonUrl: '/data/proofs/human-for-claw.json',
    deckAppendixSlide: 'Slide 11',
    problem: 'General-purpose agent products are often too open-ended for trust-sensitive or younger users.',
    uniqueAngle: 'Friendship and gratitude coaching with visible guardrails.',
    integrationSummary: 'Buddy mode narrows SocialOS into four safe tasks and keeps the same memory loop without exposing risky publish or configuration surfaces.',
    liveProofSummary: 'Buddy stays a real product mode, not a mock skin, and the public proof layer points back to the same bounded workflow.',
    integrations: ['Buddy Guardrails', 'People Memory', 'Self Mirror'],
  }),
  Object.freeze({
    id: 'z-ai-general',
    label: 'Z.AI General',
    status: 'partial',
    route: '/hackathon?bounty=z-ai-general',
    localRecordRoute: '/hackathon?bounty=z-ai-general',
    publicAnchor: '/hackathon/#bounty-z-ai-general',
    proofJsonUrl: '/data/proofs/z-ai-general.json',
    deckAppendixSlide: 'Slide 12',
    problem: 'Multilingual relationship workflows usually split English-first product logic from Chinese-language generation tooling.',
    uniqueAngle: 'GLM inside multilingual Workspace and draft generation, not a side widget.',
    integrationSummary: 'GLM is called through the native SocialOS Workspace and Draft generation paths instead of a standalone demo panel.',
    liveProofSummary: 'The hub page points judges to the live GLM generation capture and the public Z.AI proof JSON.',
    integrations: ['GLM Router', 'Workspace Chat', 'Draft Generation'],
  }),
  Object.freeze({
    id: 'ai-agents-for-good',
    label: 'AI Agents for Good',
    status: 'partial',
    route: '/hackathon?bounty=ai-agents-for-good',
    localRecordRoute: '/hackathon?bounty=ai-agents-for-good',
    publicAnchor: '/hackathon/#bounty-ai-agents-for-good',
    proofJsonUrl: '/data/proofs/ai-agents-for-good.json',
    deckAppendixSlide: 'Slide 13',
    problem: 'Impact tooling often stops at classification instead of carrying urgency and next action into real coordination.',
    uniqueAngle: 'Impact workflows with SDG triage, long-term relationship memory, and multi-channel follow-through via Telegram.',
    integrationSummary: 'FLock supplies live SDG triage and SocialOS turns that result into contact memory, event context, outreach actions, and Telegram volunteer handoff.',
    liveProofSummary: 'The public hub surfaces the live FLock triage result, the OpenClaw coordination loop, and the Telegram channel proof for multi-channel follow-through.',
    integrations: ['FLock SDG Triage', 'OpenClaw Runtime', 'Events + Drafts', 'Telegram Volunteer Channel'],
  }),
]);

const BOUNTY_VIDEO_LINKS = Object.freeze({
  'claw-for-human':
    'https://uob-my.sharepoint.com/:v:/g/personal/ae23069_bristol_ac_uk/IQBxTqTsMkjiRIwRmASfUab4AQhI3v7SUjhmiQepmwrSYwo?e=o1CLyv',
  'human-for-claw':
    'https://uob-my.sharepoint.com/:v:/g/personal/ae23069_bristol_ac_uk/IQBZOh-shgqtRKYUyw2gwCg9Acdg5zKTWBVR28rgoSggaSQ?e=cBcMCA',
  animoca:
    'https://uob-my.sharepoint.com/:v:/g/personal/ae23069_bristol_ac_uk/IQBkixSJ3Ox2Rq29NsHWNFljAUBtqPL4wh3Uh0H0Eku_1p0?e=9FffwV',
  'z-ai-general':
    'https://uob-my.sharepoint.com/:v:/g/personal/ae23069_bristol_ac_uk/IQDy5eJ2myl1Q5C8wR4INiqXAcymJ0ZEsO16aEXniYiW55E?e=Ae6n3E',
  'ai-agents-for-good':
    'https://uob-my.sharepoint.com/:v:/g/personal/ae23069_bristol_ac_uk/IQDjSamRfhqPSbT8N3c-5l0uAWpsxEUjrk1k9bNtmZ0kBwk?e=yiZsDH',
});

function readOptionalString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function readOptionalBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function resolveApiBaseUrl() {
  return readOptionalString(apiBaseUrlOverride, readOptionalString(process.env.SOCIALOS_API_BASE_URL, DEFAULT_API_BASE_URL));
}

function setApiBaseUrlOverride(value) {
  apiBaseUrlOverride = readOptionalString(value, '');
}

function readFileTextCached(filePath, fallback = '') {
  if (fileTextCache.has(filePath)) return fileTextCache.get(filePath);
  try {
    const value = fs.readFileSync(filePath, 'utf8');
    fileTextCache.set(filePath, value);
    return value;
  } catch {
    fileTextCache.set(filePath, fallback);
    return fallback;
  }
}

function readJsonFileSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildEvidenceProofPath(bountyId = '') {
  const normalized = readOptionalString(bountyId, '');
  return normalized
    ? path.join(EVIDENCE_DIR, `hackathon-proofs-${normalized}.json`)
    : HACKATHON_PROOFS_ALL_EVIDENCE_PATH;
}

function readHackathonOverviewEvidence() {
  return readJsonFileSafe(HACKATHON_OVERVIEW_EVIDENCE_PATH, {
    generatedAt: '',
    integrations: [],
    bounties: HACKATHON_PAGE_FALLBACK,
    proofsPreview: [],
    routes: [],
  });
}

function readHackathonProofEvidence(bountyId = '') {
  return readJsonFileSafe(buildEvidenceProofPath(bountyId), { count: 0, proofs: [] });
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function readDataUriCached(filePath) {
  if (dataUriCache.has(filePath)) return dataUriCache.get(filePath);
  try {
    const buffer = fs.readFileSync(filePath);
    const value = `data:${detectMimeType(filePath)};base64,${buffer.toString('base64')}`;
    dataUriCache.set(filePath, value);
    return value;
  } catch {
    dataUriCache.set(filePath, '');
    return '';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateTime(value) {
  if (typeof value !== 'string' || !value.trim()) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'n/a';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function truncate(value, maxLength = 220) {
  const text = readOptionalString(value, '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function joinNaturalList(items = []) {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function normalizeInlineText(value) {
  return readOptionalString(value, '').replace(/\s+/g, ' ').trim();
}

function dedupeSentenceFragments(value) {
  const fragments = readOptionalString(value, '')
    .split(/(?<=[。！？!?;；])\s+|\s*\|\s*/u)
    .map((part) => normalizeInlineText(part))
    .filter(Boolean);
  const seen = new Set();
  return fragments.filter((fragment) => {
    const key = fragment.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanInstructionNoise(value) {
  let text = normalizeInlineText(value);
  if (!text) return '';
  text = text.replace(/^["'“”]+|["'“”]+$/gu, '');
  text = text.replace(/^(帮我|请帮我|顺便帮我|麻烦帮我)(新建|创建|记录|保存|整理|做成)?/u, '');
  text = text.replace(/^(i want to know|please help me|help me|can you)\s+/iu, '');
  text = text.replace(/\b(source|focus|personName|summary|audience|details):\s*/giu, '');
  text = text.replace(/[{}[\]]/g, '');
  return dedupeSentenceFragments(text).join(' · ');
}

function summarizeCardCopy(value, maxLength = 160, fallback = 'No details yet.') {
  const cleaned = cleanInstructionNoise(value);
  return truncate(cleaned || fallback, maxLength);
}

function summarizeStructuredValues(values) {
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.join(', ');
      if (value && typeof value === 'object') {
        return Object.entries(value)
          .slice(0, 3)
          .map(([key, nested]) => `${key} ${typeof nested === 'string' ? nested : JSON.stringify(nested)}`)
          .join(' ');
      }
      return String(value || '');
    })
    .join(' ');
}

function renderRichTextPreview(value, className = 'rich-preview') {
  const blocks = readOptionalString(value, '')
    .split(/\n{2,}/u)
    .map((block) => normalizeInlineText(block))
    .filter(Boolean);

  if (!blocks.length) {
    return `<div class="${escapeHtml(className)}"><p>No draft content yet.</p></div>`;
  }

  return `<div class="${escapeHtml(className)}">${blocks
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join('')}</div>`;
}

function safeJson(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value;
}

async function fetchJsonSafe(pathname) {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${pathname}`);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return {
        ok: false,
        error: `${pathname} failed (${response.status})`,
        payload,
      };
    }

    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: `${pathname} unavailable: ${error instanceof Error ? error.message : String(error)}`,
      payload: null,
    };
  }
}

function sendHtml(res, statusCode, html, headers = {}) {
  const body = String(html);
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendRedirect(res, statusCode, location) {
  const safeLocation = escapeHtml(location);
  sendHtml(
    res,
    statusCode,
    `<!doctype html><html><body>Redirecting to <a href="${safeLocation}">${safeLocation}</a></body></html>`,
    { location }
  );
}

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isPublicPageMode(requestUrl) {
  return readOptionalString(requestUrl?.searchParams?.get('mode'), '').toLowerCase() === 'public';
}

function buildPublicProofDataHref(bountyId = '') {
  const normalized = readOptionalString(bountyId, '');
  return normalized ? `/data/proofs/${encodeURIComponent(normalized)}.json` : '/data/proofs/all.json';
}

function buildVideoPlaceholderPath(bountyId = '', { trailingSlash = false } = {}) {
  const normalized = readOptionalString(bountyId, '');
  if (!normalized) return '';
  const basePath = `/videos/${encodeURIComponent(normalized)}`;
  return trailingSlash ? `${basePath}/` : basePath;
}

function getHackathonBountyById(bountyId = '') {
  const normalized = readOptionalString(bountyId, '');
  return HACKATHON_PAGE_FALLBACK.find((item) => item.id === normalized) || null;
}

function getBountyVideoHref(bountyId = '') {
  const normalized = readOptionalString(bountyId, '');
  return readOptionalString(BOUNTY_VIDEO_LINKS[normalized], '');
}

function buildPublicPageHref(route = '') {
  const raw = readOptionalString(route, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw, 'http://localhost');
    const pathname = normalizePath(parsed.pathname || '/');
    if (pathname === '/deck' || pathname === '/') return '/';
    if (pathname === '/demo') return '/demo/';
    if (pathname === '/buddy') return '/buddy/';
    if (pathname === '/hackathon') {
      const bounty = readOptionalString(parsed.searchParams.get('bounty'), '');
      return bounty ? `/hackathon/#bounty-${encodeURIComponent(bounty)}` : '/hackathon/';
    }
    if (/^\/videos\/[^/]+$/u.test(pathname)) {
      const bounty = decodeURIComponent(pathname.replace(/^\/videos\//u, ''));
      return buildVideoPlaceholderPath(bounty, { trailingSlash: true });
    }
    return '';
  } catch {
    return '';
  }
}

function buildWorkspaceHref(params = {}) {
  const url = new URL('/quick-capture', 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    const normalized = readOptionalString(String(value ?? ''), '');
    if (normalized) url.searchParams.set(key, normalized);
  }
  return `${url.pathname}${url.search}`;
}

function normalizeWorkspaceHref(href) {
  const raw = readOptionalString(href, '');
  if (!raw) return '/quick-capture';

  if (raw.startsWith('/people/')) {
    return buildWorkspaceHref({
      panel: 'people',
      contactId: decodeURIComponent(raw.replace(/^\/people\//u, '')),
    });
  }
  if (raw === '/people') return buildWorkspaceHref({ panel: 'people' });
  if (raw.startsWith('/events/')) {
    return buildWorkspaceHref({
      panel: 'events',
      eventId: decodeURIComponent(raw.replace(/^\/events\//u, '')),
    });
  }
  if (raw === '/events') return buildWorkspaceHref({ panel: 'events' });
  if (raw.startsWith('/self-mirror')) return buildWorkspaceHref({ panel: 'mirror' });
  if (raw.startsWith('/ask')) {
    try {
      const parsed = new URL(raw, 'http://localhost');
      return buildWorkspaceHref({
        q: readOptionalString(parsed.searchParams.get('q'), ''),
      });
    } catch {
      return buildWorkspaceHref();
    }
  }
  if (raw.startsWith('/drafts?')) return raw;
  return raw;
}

function resolveWorkspacePanel(rawPanel) {
  const panel = readOptionalString(rawPanel, '').toLowerCase();
  return ['people', 'events', 'drafts', 'mirror'].includes(panel) ? panel : 'people';
}

function buildWorkspaceStateHref(requestUrl, overrides = {}) {
  const nextPanel = Object.prototype.hasOwnProperty.call(overrides, 'panel')
    ? resolveWorkspacePanel(overrides.panel)
    : resolveWorkspacePanel(requestUrl?.searchParams?.get('panel'));
  const params = {
    q: Object.prototype.hasOwnProperty.call(overrides, 'q')
      ? overrides.q
      : readOptionalString(requestUrl?.searchParams?.get('q'), ''),
    panel: nextPanel,
    contactId: Object.prototype.hasOwnProperty.call(overrides, 'contactId')
      ? overrides.contactId
      : readOptionalString(requestUrl?.searchParams?.get('contactId'), ''),
    eventId: Object.prototype.hasOwnProperty.call(overrides, 'eventId')
      ? overrides.eventId
      : readOptionalString(requestUrl?.searchParams?.get('eventId'), ''),
  };

  if (nextPanel !== 'people' && !Object.prototype.hasOwnProperty.call(overrides, 'contactId')) {
    params.contactId = '';
  }
  if (nextPanel !== 'events' && !Object.prototype.hasOwnProperty.call(overrides, 'eventId')) {
    params.eventId = '';
  }

  return buildWorkspaceHref(params);
}

function renderNavigation(currentPath, { publicMode = false } = {}) {
  const pages = publicMode ? PUBLIC_NAV_LINKS : DASHBOARD_PAGES;
  return pages
    .map((page) => {
      const normalizedLinkPath = page.path.startsWith('http') ? page.path : normalizePath(page.path);
      const active = currentPath === page.path || currentPath === normalizedLinkPath ? 'nav-link active' : 'nav-link';
      const rel = page.path.startsWith('http') ? ' rel="noreferrer"' : '';
      return `<a class="${active}" href="${escapeHtml(page.path)}"${rel}>${escapeHtml(page.title)}</a>`;
    })
    .join('');
}

function renderPill(label, tone = 'neutral') {
  return `<span class="pill tone-${tone}">${escapeHtml(label)}</span>`;
}

function renderMetric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderPanel(title, body, subtitle = '') {
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="panel-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </div>
      ${body}
    </section>
  `;
}

function renderHero(page, metricsHtml = '', asideHtml = '') {
  return `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">SocialOS</p>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.summary)}</p>
      </div>
      <div class="hero-rail">
        ${metricsHtml ? `<div class="metric-strip">${metricsHtml}</div>` : ''}
        ${asideHtml}
      </div>
    </header>
  `;
}

function renderPublicProofNotice(label, detail) {
  return `
    <div class="info-callout">
      <strong>${escapeHtml(label)}</strong><br />
      ${escapeHtml(detail)}
    </div>
  `;
}

function renderWatchVideoCards({ currentBountyId = '', includeHostedLinks = false } = {}) {
  return `
    <div class="stack">
      <article class="stack-card compact-card">
        <div class="stack-meta">
          <strong>Start with the final video pack</strong>
          ${renderPill('judge-ready', 'accent')}
        </div>
        <p>Open the matching bounty recording directly, or use the canonical bounty hub if you want the full proof matrix first.</p>
        <div class="inline-actions">
          <a class="mini-link" href="/hackathon/">Open Bounty Hub</a>
          <a class="mini-link" href="/">Open Pitch Deck</a>
        </div>
      </article>
      ${HACKATHON_PAGE_FALLBACK.map((bounty) => {
        const videoPageHref = buildVideoPlaceholderPath(bounty.id, { trailingSlash: true });
        const hostedVideoHref = getBountyVideoHref(bounty.id);
        const isCurrent = bounty.id === currentBountyId;
        return `
          <article class="stack-card compact-card">
            <div class="stack-meta">
              <strong>${escapeHtml(bounty.label)}</strong>
              ${renderPill(readOptionalString(bounty.sponsor, 'DoraHacks'), 'soft')}
              ${isCurrent ? renderPill('current page', 'accent') : ''}
            </div>
            <p>${escapeHtml(readOptionalString(bounty.uniqueAngle, 'Watch the final recording, then open the matching proof JSON if needed.'))}</p>
            <div class="inline-actions">
              <a class="mini-link" href="${escapeHtml(videoPageHref)}">Watch final video</a>
              ${includeHostedLinks && hostedVideoHref ? `<a class="mini-link" href="${escapeHtml(hostedVideoHref)}">Open OneDrive</a>` : ''}
              <a class="mini-link" href="${escapeHtml(readOptionalString(bounty.publicAnchor, '/hackathon/'))}">Proof page</a>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderDeckVideoDock() {
  return `
    <aside class="deck-video-dock" aria-label="Watch final bounty videos">
      <div class="deck-video-dock-head">
        <span class="deck-video-dock-kicker">Judge-ready videos</span>
        <strong>Watch the 5 final bounty demos</strong>
        <p>Start with the matching video, then open the public proof hub if you want the full verification pack.</p>
      </div>
      <div class="deck-video-dock-links">
        <a class="deck-video-dock-primary" href="/hackathon/">Open bounty hub</a>
        ${HACKATHON_PAGE_FALLBACK.map((bounty) => {
          const href = buildVideoPlaceholderPath(bounty.id, { trailingSlash: true });
          return `<a class="deck-video-dock-link" href="${escapeHtml(href)}">${escapeHtml(bounty.label)}</a>`;
        }).join('')}
      </div>
      <div class="deck-video-dock-help">
        <span>Reuse SocialOS</span>
        <div class="deck-video-dock-help-links">
          <a href="${escapeHtml(PUBLIC_REPO_URL)}">View GitHub repo</a>
          <a href="${escapeHtml(PUBLIC_REPO_QUICKSTART_URL)}">Run locally</a>
          <a href="${escapeHtml(PUBLIC_API_SETUP_URL)}">API setup guide</a>
        </div>
      </div>
    </aside>
  `;
}

function renderPublicReuseLinks() {
  return `
    <div class="stack-card compact-card">
      <div class="stack-meta">
        <strong>Reuse SocialOS locally</strong>
        ${renderPill('builder path', 'soft')}
      </div>
      <p>The public site is proof-first. The interactive product is reusable on your own machine with quickstart and optional API keys.</p>
      <div class="inline-actions">
        <a class="mini-link" href="${escapeHtml(PUBLIC_REPO_URL)}">View GitHub repo</a>
        <a class="mini-link" href="${escapeHtml(PUBLIC_REPO_QUICKSTART_URL)}">Run locally</a>
        <a class="mini-link" href="${escapeHtml(PUBLIC_API_SETUP_URL)}">API setup guide</a>
      </div>
    </div>
  `;
}

function renderVideoPlaceholderPage(bounty) {
  const bountyId = readOptionalString(bounty?.id, '');
  const proofPageHref = readOptionalString(bounty?.publicAnchor, `/hackathon/#bounty-${encodeURIComponent(bountyId)}`);
  const proofJsonHref = readOptionalString(bounty?.proofJsonUrl, buildPublicProofDataHref(bountyId));
  const videoHref = buildVideoPlaceholderPath(bountyId, { trailingSlash: true });
  const hostedVideoHref = getBountyVideoHref(bountyId);
  const hasHostedVideo = Boolean(hostedVideoHref);
  const videoSwitcher = HACKATHON_PAGE_FALLBACK.map((item) => {
    const href = buildVideoPlaceholderPath(item.id, { trailingSlash: true });
    const isCurrent = item.id === bountyId;
    return `
      <a class="mini-link" href="${escapeHtml(href)}" aria-current="${isCurrent ? 'page' : 'false'}">
        ${escapeHtml(item.label)}
        ${isCurrent ? renderPill('current', 'accent') : ''}
      </a>
    `;
  }).join('');
  const heroMetrics = [
    renderMetric('5-8 min', 'planned demo'),
    renderMetric(readOptionalString(bounty?.sponsor, 'DoraHacks'), 'track sponsor'),
    renderMetric(hasHostedVideo ? 'ready' : 'pending', hasHostedVideo ? 'video host' : 'placeholder URL'),
  ].join('');
  const heroAside = `
    <div class="stack-card">
      <div class="stack-meta"><strong>Submit this URL</strong>${renderPill(videoHref, 'soft')}</div>
      <p>${
        hasHostedVideo
          ? 'This public watch page now routes judges to the final hosted demo while keeping the DoraHacks submission URL stable.'
          : 'This page is a stable video placeholder. Keep the same link in DoraHacks now, then replace the placeholder with the final uploaded demo later.'
      }</p>
    </div>
  `;
  return `
    ${renderHero(
      {
        title: `${readOptionalString(bounty?.label, 'Hackathon')} Video`,
        summary: hasHostedVideo
          ? 'Stable public watch page for the final SocialOS demo video, with public proof links kept alongside the hosted recording.'
          : 'Stable public placeholder page for the final SocialOS demo video while upload and hosting are still in progress.',
      },
      heroMetrics,
      heroAside,
    )}
    ${renderPublicProofNotice(
      hasHostedVideo ? 'Final video is live' : 'Demo video upload in progress',
      hasHostedVideo
        ? 'Use the watch button below to open the final hosted recording. The proof page, repo, deck, and structured JSON stay on this page for fast judge verification.'
        : 'This URL is reserved for the final SocialOS demo video for this bounty. Until the recording is uploaded, judges can review the proof page, repo, deck, and structured JSON below.'
    )}
    ${renderPanel(
      hasHostedVideo ? 'Watch Final Video Now' : 'Planned Video',
      `<div class="stack">
        <div class="stack-card">
          <strong>Video title</strong>
          <p>SocialOS for ${escapeHtml(readOptionalString(bounty?.label, 'this bounty'))}</p>
        </div>
        <div class="stack-card">
          <strong>${hasHostedVideo ? 'Hosted recording' : 'What the final video will cover'}</strong>
          <p>${
            hasHostedVideo
              ? `Open the final recording on OneDrive: ${escapeHtml(hostedVideoHref)}`
              : 'The final recording will show the problem, the SocialOS solution, the technical implementation, the bounty integration, and a short live demo.'
          }</p>
        </div>
        ${
          hasHostedVideo
            ? `<div class="stack-card">
          <strong>Watch now</strong>
          <p><a class="mini-link" href="${escapeHtml(hostedVideoHref)}">Open final video on OneDrive</a></p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(videoHref)}">Keep using stable /videos URL</a>
          </div>
        </div>`
            : ''
        }
        <div class="stack-card">
          <strong>Submission URL</strong>
          <p><a class="mini-link" href="${escapeHtml(videoHref)}">${escapeHtml(videoHref)}</a></p>
        </div>
      </div>`,
      hasHostedVideo
        ? 'Keep using this stable /videos/... URL in DoraHacks. It now routes judges to the final recording while preserving proof links on the same page.'
        : 'Use this public page in the submission form now. When the video is ready, embed it here or replace the placeholder content without changing the URL.'
    )}
    ${renderPanel(
      'All Bounty Videos',
      `${renderWatchVideoCards({ currentBountyId: bountyId, includeHostedLinks: true })}
      <div class="stack-card compact-card">
        <div class="stack-meta"><strong>Fast switcher</strong>${renderPill('same stable URLs', 'soft')}</div>
        <p>Each DoraHacks submission should still point to its own /videos/... page, but judges can switch tracks here if they land on the wrong recording.</p>
        <div class="inline-actions">${videoSwitcher}</div>
      </div>`,
      'Keep the watch experience obvious: one stable page per bounty, plus a fast switcher across all five final recordings.'
    )}
    ${renderPanel(
      'What Judges Can Review Now',
      `<div class="stack">
        <div class="stack-card">
          <strong>Proof page</strong>
          <p><a class="mini-link" href="${escapeHtml(proofPageHref)}">${escapeHtml(proofPageHref)}</a></p>
        </div>
        <div class="stack-card">
          <strong>Proof JSON</strong>
          <p><a class="mini-link" href="${escapeHtml(proofJsonHref)}">${escapeHtml(proofJsonHref)}</a></p>
        </div>
        <div class="stack-card">
          <strong>Public deck</strong>
          <p><a class="mini-link" href="${escapeHtml(PUBLIC_DECK_URL)}">${escapeHtml(PUBLIC_DECK_URL)}</a></p>
        </div>
        <div class="stack-card">
          <strong>GitHub repo</strong>
          <p><a class="mini-link" href="${escapeHtml(PUBLIC_REPO_URL)}">${escapeHtml(PUBLIC_REPO_URL)}</a></p>
        </div>
      </div>`,
      'These links already support the same submission story even before the final video file is uploaded.'
    )}
    ${renderPanel(
      'Track Framing',
      `<div class="stack">
        <div class="stack-card">
          <strong>Problem</strong>
          <p>${escapeHtml(readOptionalString(bounty?.problem, 'Track-specific problem framing will be added with the final video.'))}</p>
        </div>
        <div class="stack-card">
          <strong>Why SocialOS fits</strong>
          <p>${escapeHtml(readOptionalString(bounty?.uniqueAngle, 'SocialOS adapts one shared product loop into the exact review angle this bounty asks for.'))}</p>
        </div>
        <div class="stack-card">
          <strong>Integration summary</strong>
          <p>${escapeHtml(readOptionalString(bounty?.integrationSummary, 'The final video will show the same integration path already surfaced on the public proof pages.'))}</p>
        </div>
      </div>`,
      'This copy should stay aligned with the repo README, proof page, and final recording.'
    )}
  `;
}

function renderFormField(label, control, hint = '') {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      ${control}
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
    </label>
  `;
}

function renderEmptyState(message) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function isDemoNoiseCapture(capture) {
  const source = readOptionalString(capture?.source, '').toLowerCase();
  const text = readOptionalString(capture?.text, '').toLowerCase();
  return (
    source.includes('smoke') ||
    source.includes('seed') ||
    source.includes('demo') ||
    source.includes('backfill') ||
    text.includes('weekly_mirror_smoke') ||
    text.includes('e2e_') ||
    text.includes('product workspace smoke')
  );
}

function filterMeaningfulCaptures(captures, limit = 4) {
  const seen = new Set();
  return captures
    .filter((capture) => !isDemoNoiseCapture(capture))
    .filter((capture) => {
      const key = truncate(readOptionalString(capture.text, ''), 80).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function renderChatComposerIntro() {
  return `
    <article class="chat-bubble system workspace-welcome">
      <div class="stack-meta">
        <strong>Start here</strong>
      </div>
      <p>Say what happened, ask what you need, or drop in a voice note. We will keep the thread calm and only surface the next useful contact, event, draft, or mirror.</p>
    </article>
  `;
}

function renderAgentLaneSnapshot(cluster) {
  const agents = Array.isArray(cluster?.agents) ? cluster.agents : [];
  if (!agents.length) return renderEmptyState('No agent lanes available yet.');
  return `<div class="agent-lane-grid">${agents
    .slice(0, 4)
    .map(
      (agent) => `
        <article class="stack-card compact-card">
          <div class="stack-meta">
            <strong>${escapeHtml(agent.roleTitle || agent.name || agent.id)}</strong>
            ${renderPill(agent.toolProfile || 'tools', 'soft')}
          </div>
          <p>${escapeHtml(truncate(agent.responsibility || 'custom lane', 96))}</p>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderWorkspaceThreadSeed(captures) {
  const recent = filterMeaningfulCaptures(captures, 1);
  return `
    <div class="chat-shell workspace-thread" data-workspace-thread>
      ${
        recent.length
          ? recent
              .map(
                (capture) => `
                  <article class="workspace-context-note workspace-recent-note">
                    <div class="stack-meta">
                      <strong>Recent note</strong>
                      <span>${escapeHtml(formatDateTime(capture.createdAt))}</span>
                    </div>
                    <p>${escapeHtml(summarizeCardCopy(capture.text || capture.combinedText || '', 110, 'A recent note is already in this workspace.'))}</p>
                  </article>
                `
              )
              .join('')
          : `
            <article class="workspace-context-note workspace-context-note-empty">
              <p>Start with one natural message. We will stay light until you need something more structured.</p>
            </article>
          `
      }
    </div>
  `;
}

function renderWorkspaceHomeHeader(bootstrap = {}) {
  const topActions = Array.isArray(bootstrap.topActions) ? bootstrap.topActions : [];
  const voiceReadiness = safeJson(bootstrap.voiceReadiness, {});
  return `
    <section class="workspace-home-header">
      <div class="workspace-home-summary">
        <p class="eyebrow">Unified Workspace</p>
        <h1>Workspace</h1>
        <p class="workspace-home-title">One place to think, remember, and act.</p>
        <p>${escapeHtml(
          bootstrap.summaryText ||
            'Capture what just happened, recall the right person or event, and only then branch into drafts or follow-up.'
        )}</p>
        <div class="chip-row">
          ${renderPill(voiceReadiness.openAiConfigured ? 'voice ready' : 'browser voice', voiceReadiness.openAiConfigured ? 'good' : 'soft')}
          ${renderPill(`${(bootstrap.recentContacts || []).length} contacts`, 'soft')}
          ${renderPill(`${(bootstrap.recentEvents || []).length} events`, 'soft')}
          ${renderPill(`${(bootstrap.queuePreview || []).length} queue items`, 'soft')}
        </div>
      </div>
      <div class="workspace-home-actions">
        <h3>Today on deck</h3>
        ${topActions.length ? renderCockpitActionCards(topActions) : renderEmptyState('No action stack yet. Start by sending one chat turn.')}
      </div>
    </section>
  `;
}

function renderWorkspaceQueuePreview(queueTasks) {
  if (!Array.isArray(queueTasks) || !queueTasks.length) return renderEmptyState('No queue items waiting right now.');
  const toneForStatus = (status) => (status === 'manual_step_needed' || status === 'failed' ? 'warn' : 'soft');
  return `<div class="stack">${queueTasks
    .map(
      (task) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.eventTitle || task.platformLabel || 'Queue item')}</strong>
            ${renderPill(task.status || 'queued', toneForStatus(task.status))}
          </div>
          <p>${escapeHtml(summarizeCardCopy(task.content || task.metadata?.publishPackage?.preview || '', 136, 'Draft package is ready for the next publish step.'))}</p>
          <div class="chip-row">
            ${task.platformLabel ? renderPill(task.platformLabel, 'soft') : ''}
            ${task.language ? renderPill(formatLanguageLabel(task.language), 'neutral') : ''}
          </div>
          <div class="inline-actions">
            <a class="mini-link" href="/queue">Open Queue</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderWorkspaceTopActionCards(actions, requestUrl) {
  if (!Array.isArray(actions) || !actions.length) return renderEmptyState('Start with one message and SocialOS will suggest the next step.');
  return `<div class="workspace-action-grid">${actions
    .slice(0, 3)
    .map(
      (action) => `
        <article class="workspace-action-card">
          <div class="stack-meta">
            <strong>${escapeHtml(action.title || 'Next action')}</strong>
            ${renderPill(action.tone === 'warn' ? 'priority' : action.tone === 'good' ? 'ready' : 'next', action.tone || 'soft')}
          </div>
          <p>${escapeHtml(summarizeCardCopy(action.reason || '', 110, 'A useful next action is ready.'))}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(normalizeWorkspaceHref(action.href || buildWorkspaceStateHref(requestUrl)))}">Open</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderWorkspaceSystemStatus(bootstrap = {}) {
  const status = safeJson(bootstrap.systemStatus, {});
  const voiceReadiness = safeJson(bootstrap.voiceReadiness, {});
  const foundryTone = status.foundryEnabled ? 'good' : 'warn';
  const voiceTone = voiceReadiness.openAiConfigured ? 'good' : 'soft';
  return `
    <div class="workspace-status-cluster">
      <div class="workspace-status-grid">
        <article class="workspace-status-item">
          <span class="workspace-status-label">Publish</span>
          ${renderPill(formatHumanPublishMode(status.publishMode), status.publishMode === 'dry-run' ? 'soft' : 'warn')}
        </article>
        <article class="workspace-status-item">
          <span class="workspace-status-label">Network</span>
          ${renderPill(status.loopbackOnly ? 'loopback only' : 'network exposed', status.loopbackOnly ? 'good' : 'warn')}
        </article>
        <article class="workspace-status-item">
          <span class="workspace-status-label">Studio</span>
          ${renderPill(status.foundryEnabled ? 'ready' : 'offline', foundryTone)}
        </article>
        <article class="workspace-status-item">
          <span class="workspace-status-label">Voice</span>
          ${renderPill(voiceReadiness.openAiConfigured ? 'server-ready' : 'browser-only', voiceTone)}
        </article>
      </div>
      <p class="workspace-status-summary">${escapeHtml(status.summary || bootstrap.summaryText || 'Local-first workspace is ready.')}</p>
    </div>
  `;
}

function renderWorkspaceSummaryStrip(bootstrap = {}, requestUrl) {
  return `
    <section class="workspace-summary-strip">
      <div class="workspace-summary-copy">
        <p class="eyebrow">Workspace</p>
        <h1>Workspace</h1>
        <p>${escapeHtml(
          summarizeCardCopy(
            bootstrap.summaryText ||
            'Capture what just happened, recall the right person or event, and only then branch into drafts or follow-up.'
          , 118)
        )}</p>
        ${renderWorkspaceSystemStatus(bootstrap)}
      </div>
      <div class="workspace-summary-actions">
        <div class="stack-meta">
          <strong>Today</strong>
          <span>${escapeHtml(formatDateTime(bootstrap.generatedAt))}</span>
        </div>
        ${renderWorkspaceTopActionCards(bootstrap.topActions || [], requestUrl)}
      </div>
    </section>
  `;
}

function renderWorkspaceMirrorSnapshot(bootstrap = {}) {
  const latestMirror = bootstrap.latestDailyMirror || bootstrap.latestMirror || bootstrap.latestWeeklyMirror || null;
  if (latestMirror) {
    const themes = Array.isArray(latestMirror.themes) ? latestMirror.themes.slice(0, 3) : [];
    const energizer = summarizeCardCopy(latestMirror.energizers?.[0]?.snippet || '', 96, '');
    const drainer = summarizeCardCopy(latestMirror.drainers?.[0]?.snippet || '', 96, '');
    const summaryParts = [];
    if (themes.length) {
      summaryParts.push(`${latestMirror.cadence === 'daily' ? 'Today centered on' : 'This week centered on'} ${joinNaturalList(themes.map((item) => `${item.theme}`))}.`);
    }
    if (energizer) summaryParts.push(`Strongest lift: ${energizer}`);
    if (drainer) summaryParts.push(`Watch-out: ${drainer}`);
    return `
      <div class="stack">
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(latestMirror.cadence === 'daily' ? 'Today' : latestMirror.rangeLabel || 'Latest mirror')}</strong>
            <span>${escapeHtml(formatDateTime(latestMirror.createdAt))}</span>
          </div>
          <p>${escapeHtml(summaryParts.join(' ') || truncate(latestMirror.summaryText || latestMirror.content || '', 220))}</p>
          ${
            themes.length
              ? `<div class="chip-row">${themes
                  .slice(0, 4)
                  .map((item) => renderPill(`${item.theme} (${item.count})`, 'soft'))
                  .join('')}</div>`
              : ''
          }
          <div class="inline-actions">
            <a class="mini-link" href="/self-mirror?cadence=${encodeURIComponent(latestMirror.cadence || 'weekly')}">Open Mirror</a>
          </div>
        </article>
      </div>
    `;
  }
  return renderCheckinCards((bootstrap.recentCheckins || []).slice(0, 4));
}

function renderWorkspaceRailContent(activePanel, bootstrap = {}) {
  if (activePanel === 'events') {
    return renderEventCards(bootstrap.recentEvents || []);
  }
  if (activePanel === 'drafts') {
    return renderAskDraftCards(bootstrap.recentDrafts || []);
  }
  if (activePanel === 'mirror') {
    return renderWorkspaceMirrorSnapshot(bootstrap);
  }
  return renderPeopleCards(bootstrap.recentContacts || []);
}

function renderWorkspaceRail(activePanel, bootstrap = {}, requestUrl) {
  const tabs = [
    { id: 'people', label: 'People' },
    { id: 'events', label: 'Events' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'mirror', label: 'Mirror' },
  ];
  const titleByPanel = {
    people: 'People',
    events: 'Events',
    drafts: 'Drafts',
    mirror: 'Mirror',
  };
  const subtitleByPanel = {
    people: 'Recent contacts stay close without taking over the conversation.',
    events: 'Recent logbook entries stay close when you need context.',
    drafts: 'The latest draft packages stay nearby when you need to review or hand off.',
    mirror: 'Reflection stays nearby without getting louder than the conversation.',
  };

  return `
    <aside class="workspace-context-rail panel" data-mobile-context-sections>
      <div class="workspace-rail-tabs" data-workspace-rail-tabs>
        ${tabs
          .map((tab) => {
            const active = tab.id === activePanel ? 'workspace-rail-tab active' : 'workspace-rail-tab';
            return `<a class="${active}" href="${escapeHtml(buildWorkspaceStateHref(requestUrl, { panel: tab.id }))}">${escapeHtml(tab.label)}</a>`;
          })
          .join('')}
      </div>
      <div class="panel-head workspace-rail-head">
        <div>
          <h2>${escapeHtml(titleByPanel[activePanel] || 'Recent people')}</h2>
          <p class="panel-subtitle">${escapeHtml(subtitleByPanel[activePanel] || subtitleByPanel.people)}</p>
        </div>
      </div>
      <div class="workspace-rail-body">
        ${renderWorkspaceRailContent(activePanel, bootstrap)}
      </div>
    </aside>
  `;
}

function renderWorkspaceContactDrawer(detail, requestUrl) {
  if (!detail?.person?.personId) return '';
  const person = detail.person;
  const followUpValue = readOptionalString(person.nextFollowUpAt, '').replace(/:\d{2}\.\d{3}Z$/u, '').replace('Z', '');
  return `
    <section class="workspace-drawer panel" data-workspace-drawer="contact">
      <div class="workspace-drawer-head">
        <div>
          <p class="eyebrow">Contact detail</p>
          <h2>${escapeHtml(person.name)}</h2>
          <p class="panel-subtitle">${escapeHtml(person.notes || 'No notes yet.')}</p>
        </div>
        <a class="mini-link" href="${escapeHtml(buildWorkspaceStateHref(requestUrl, { panel: 'people', contactId: '' }))}">Close</a>
      </div>
      <div class="chip-row">
        ${(person.tags || []).length ? (person.tags || []).map((tag) => renderPill(tag, 'soft')).join('') : renderPill('no-tags', 'soft')}
        ${detail.suggestion?.nextFollowUpAt ? renderPill(`follow-up ${detail.suggestion.nextFollowUpAt}`, 'accent') : ''}
      </div>
      <div class="grid two-up workspace-drawer-grid">
        ${renderPanel(
          'Profile',
          `
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/people/upsert">
              <input type="hidden" name="personId" value="${escapeHtml(person.personId)}" />
              ${renderFormField('Name', `<input name="name" type="text" value="${escapeHtml(person.name)}" />`)}
              ${renderFormField('Tags', `<input name="tags" type="text" value="${escapeHtml((person.tags || []).join(', '))}" />`, 'Comma-separated')}
              ${renderFormField('Notes', `<textarea name="notes" rows="5">${escapeHtml(person.notes || '')}</textarea>`)}
              ${renderFormField('Next follow-up', `<input name="nextFollowUpAt" type="datetime-local" value="${escapeHtml(followUpValue)}" />`)}
              <div class="inline-actions"><button type="submit">Save Contact</button></div>
              <div class="form-result" data-form-result></div>
            </form>
          `,
          'Refine the memory card without leaving the main workspace.'
        )}
        ${renderPanel(
          'Relationship context',
          `
            <div class="stack">
              <article class="stack-card compact-card">
                <div class="stack-meta">
                  <strong>Suggested follow-up</strong>
                  <span>${escapeHtml(detail.suggestion?.nextFollowUpAt || 'not set')}</span>
                </div>
                <p>${escapeHtml(detail.suggestion?.followUpMessage || 'No follow-up suggestion yet.')}</p>
              </article>
              ${renderPanel('Identities', renderIdentityCards(detail.identities || []))}
            </div>
          `,
          'Keep identities, next steps, and the relationship tone visible while you edit.'
        )}
      </div>
      <div class="grid two-up workspace-drawer-grid">
        ${renderPanel('Timeline', renderInteractionCards(detail.interactions || []))}
        ${renderPanel('Evidence', renderEvidenceList(detail.evidence || []))}
      </div>
      <div class="grid two-up workspace-drawer-grid">
        ${renderPanel(
          'Related Events',
          renderEventCards(detail.relatedEvents || [], (event) => buildWorkspaceStateHref(requestUrl, { panel: 'events', eventId: event.eventId })),
          'Stay in the same conversation while following the event threads linked to this contact.'
        )}
        ${renderPanel('Graph Overview', renderGraphOverview(detail.graphOverview), 'A focused one-hop view of this contact and the events around it.')}
      </div>
    </section>
  `;
}

function renderWorkspaceEventDrawer(detail, requestUrl) {
  if (!detail?.event?.eventId) return '';
  const event = detail.event;
  const relatedDrafts = Array.isArray(detail.relatedDrafts) ? detail.relatedDrafts : [];
  return `
    <section class="workspace-drawer panel" data-workspace-drawer="event">
      <div class="workspace-drawer-head">
        <div>
          <p class="eyebrow">Event detail</p>
          <h2>${escapeHtml(event.title)}</h2>
          <p class="panel-subtitle">${escapeHtml(detail.summaryText || 'Structured event detail is ready for draft generation.')}</p>
        </div>
        <a class="mini-link" href="${escapeHtml(buildWorkspaceStateHref(requestUrl, { panel: 'events', eventId: '' }))}">Close</a>
      </div>
      <div class="chip-row">
        ${detail.audience ? renderPill(detail.audience, 'soft') : ''}
        ${detail.languageStrategy ? renderPill(detail.languageStrategy, 'accent') : ''}
        ${detail.tone ? renderPill(detail.tone, 'soft') : ''}
      </div>
      <div class="grid two-up workspace-drawer-grid">
        ${renderPanel(
          'Event context',
          `
            <div class="stack">
              <article class="stack-card compact-card">
                <div class="stack-meta">
                  <strong>Audience</strong>
                  <span>${escapeHtml(detail.audience || 'not set')}</span>
                </div>
                <p>${escapeHtml(detail.details?.summary || detail.summaryText || 'No event summary yet.')}</p>
              </article>
              ${
                detail.links?.length
                  ? `<article class="stack-card compact-card"><strong>Links</strong><ul class="compact-list">${detail.links
                      .map((item) => `<li>${escapeHtml(item)}</li>`)
                      .join('')}</ul></article>`
                  : ''
              }
            </div>
          `,
          'Use the event as the anchor before branching into platform-native drafts.'
        )}
        ${renderPanel(
          'Draft actions',
          `
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/drafts/generate">
              <input type="hidden" name="eventId" value="${escapeHtml(event.eventId)}" />
              <input type="hidden" name="languages" value="platform-native" />
              <input type="hidden" name="platforms" value="linkedin" />
              <input type="hidden" name="platforms" value="x" />
              <input type="hidden" name="platforms" value="instagram" />
              <input type="hidden" name="platforms" value="zhihu" />
              <input type="hidden" name="platforms" value="xiaohongshu" />
              <input type="hidden" name="platforms" value="wechat_moments" />
              <input type="hidden" name="platforms" value="wechat_official" />
              <div class="inline-actions">
                <button type="submit">Generate 7 Drafts</button>
                <a class="mini-link" href="/drafts?eventId=${encodeURIComponent(event.eventId)}">Open Drafts</a>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            ${relatedDrafts.length ? renderAskDraftCards(relatedDrafts.slice(0, 3)) : renderEmptyState('No draft packages exist for this event yet.')}
          `,
          'Generate and review draft packages without leaving the same operating surface.'
        )}
      </div>
      <div class="grid two-up workspace-drawer-grid">
        ${renderPanel(
          'Related People',
          renderPeopleCards(detail.relatedPeople || [], false, (person) => buildWorkspaceStateHref(requestUrl, { panel: 'people', contactId: person.personId })),
          'The people linked to this event stay close to the campaign context.'
        )}
        ${renderPanel('Graph Overview', renderGraphOverview(detail.graphOverview), 'A focused one-hop view of this event and its linked people.')}
      </div>
    </section>
  `;
}

function renderCaptureFeed(captures) {
  const meaningfulCaptures = filterMeaningfulCaptures(captures, 4);
  if (!meaningfulCaptures.length) return renderEmptyState('No demo-ready captures yet.');
  return `<div class="chat-shell">${meaningfulCaptures
    .map(
      (capture, index) => `
        <article class="chat-bubble ${index % 2 === 0 ? 'user' : 'system'}">
          <div class="stack-meta">
            ${renderPill(capture.source || 'manual', 'soft')}
            <span>${escapeHtml(formatDateTime(capture.createdAt))}</span>
          </div>
          <p>${escapeHtml(truncate(capture.text, 220))}</p>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderCaptureCards(captures) {
  if (!captures.length) return renderEmptyState('No captures yet.');
  return `<div class="stack">${captures
    .map(
      (capture) => `
        <article class="stack-card">
          <div class="stack-meta">
            ${renderPill(capture.source || 'manual', 'accent')}
            <span>${escapeHtml(formatDateTime(capture.createdAt))}</span>
          </div>
          <p>${escapeHtml(truncate(capture.text, 220))}</p>
          <code>${escapeHtml(capture.captureId)}</code>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderCheckinCards(checkins) {
  if (!checkins.length) return renderEmptyState('No self check-ins yet.');
  return `<div class="stack">${checkins
    .map(
      (checkin) => `
        <article class="stack-card">
          <div class="stack-meta">
            ${renderPill(`energy ${checkin.energy}`, checkin.energy >= 0 ? 'good' : 'warn')}
            <span>${escapeHtml(formatDateTime(checkin.createdAt))}</span>
          </div>
          <p>${escapeHtml(summarizeCardCopy(checkin.reflection, 112, 'Self reflection saved.'))}</p>
          <small>${escapeHtml((checkin.emotions || []).join(', ') || 'neutral')}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderCaptureAssetCards(assets) {
  if (!assets.length) return renderEmptyState('No capture assets yet.');
  return `<div class="stack">${assets
    .map(
      (asset) => `
        <article class="stack-card">
          <div class="stack-meta">
            ${renderPill(asset.kind || 'asset', asset.status === 'parsed' ? 'good' : 'warn')}
            <span>${escapeHtml(formatDateTime(asset.createdAt))}</span>
          </div>
          <strong>${escapeHtml(asset.fileName || asset.assetId)}</strong>
          <p>${escapeHtml(truncate(asset.extractedText || asset.previewText || 'No extracted text yet.', 220))}</p>
          <small>${escapeHtml(asset.mimeType || 'n/a')} · ${escapeHtml(asset.analysisMethod || 'manual')} · ${asset.hasOriginalFile ? 'original saved locally' : 'no original file saved'}${asset.originalUrl ? ' · original available' : ''}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderEvidenceList(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) return renderEmptyState('No evidence linked yet.');
  return `<div class="stack">${evidence
    .map(
      (item) => `
        <article class="stack-card">
          <div class="stack-meta">
            ${renderPill(item.type || item.sourceType || 'evidence', 'soft')}
            <span>${escapeHtml(item.sourceId || item.evidenceId || 'n/a')}</span>
          </div>
          <p>${escapeHtml(truncate(item.snippet || '', 180))}</p>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderIdentityCards(identities) {
  if (!Array.isArray(identities) || !identities.length) return renderEmptyState('No linked identities yet.');
  return `<div class="stack">${identities
    .map(
      (identity) => `
        <article class="stack-card">
          <div class="stack-meta">
            ${renderPill(identity.platformLabel || identity.platform || 'identity', 'accent')}
            <span>${escapeHtml(formatDateTime(identity.createdAt))}</span>
          </div>
          <p>${escapeHtml(identity.handle || identity.url || 'identity')}</p>
          <small>${escapeHtml(identity.note || identity.url || '')}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderInteractionCards(interactions) {
  if (!Array.isArray(interactions) || !interactions.length) return renderEmptyState('No interaction timeline yet.');
  return `<div class="stack">${interactions
    .map(
      (interaction) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(formatDateTime(interaction.happenedAt))}</strong>
            <span>${escapeHtml(interaction.interactionId || 'interaction')}</span>
          </div>
          <p>${escapeHtml(interaction.summary || '')}</p>
          <small>${escapeHtml(truncate(interaction.evidence || '', 160))}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderPeopleCards(people, showScore = false, hrefBuilder = (person) => buildWorkspaceHref({ panel: 'people', contactId: person.personId })) {
  if (!people.length) return renderEmptyState('No people cards match this query.');
  return `<div class="stack">${people
    .map((person) => {
      const tags = Array.isArray(person.tags) ? person.tags : [];
      const score = showScore && typeof person.score === 'number' ? person.score.toFixed(3) : null;
      const summary = summarizeCardCopy(person.evidenceSnippet || person.notes || '', 88, 'No notes yet.');
      const followUpLabel = readOptionalString(person.nextFollowUpAt, '')
        ? `follow-up ${formatDateTime(person.nextFollowUpAt)}`
        : '';
      return `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(person.name)}</strong>
            <span>${escapeHtml(formatDateTime(person.updatedAt || person.createdAt))}</span>
          </div>
          ${score ? `<p class="score">score ${escapeHtml(score)}</p>` : ''}
          <p>${escapeHtml(summary)}</p>
          ${(tags.length || followUpLabel)
            ? `<div class="chip-row">
            ${tags.slice(0, 3).map((tag) => renderPill(tag, 'soft')).join('')}
            ${followUpLabel ? renderPill(followUpLabel, 'accent') : ''}
          </div>`
            : ''}
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(hrefBuilder(person))}">Open Contact</a>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderEventCards(events, hrefBuilder = (event) => buildWorkspaceHref({ panel: 'events', eventId: event.eventId })) {
  if (!events.length) return renderEmptyState('No events yet.');
  return `<div class="stack">${events
    .map((event) => {
      const payload = safeJson(event.payload, {});
      const details = safeJson(payload.details, {});
      const detailPreview = summarizeCardCopy(
        details.summary ||
          details.focus ||
          payload.summary ||
          payload.description ||
          payload.audience ||
          summarizeStructuredValues(Object.values(details)),
        128,
        'Structured event details are ready for draft generation.'
      );
      const badges = [
        normalizeInlineText(payload.audience),
        normalizeInlineText(payload.languageStrategy || payload.language),
        normalizeInlineText(payload.tone),
      ].filter(Boolean).slice(0, 2);
      return `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
          </div>
          <p>${escapeHtml(detailPreview || 'No structured payload yet.')}</p>
          ${badges.length ? `<div class="chip-row">${badges.map((badge) => renderPill(badge, 'soft')).join('')}</div>` : ''}
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(hrefBuilder(event))}">Open Event</a>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderCommandBar({ action, value = '', placeholder, hint, submitLabel = 'Run' }) {
  return `
    <form class="query-form command-bar-form" method="GET" action="${escapeHtml(action)}">
      ${renderFormField(
        'Command bar',
        `<input name="q" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`,
        hint
      )}
      <div class="inline-actions">
        <button type="submit">${escapeHtml(submitLabel)}</button>
        <a class="mini-link" href="${escapeHtml(action)}">Reset</a>
        <a class="mini-link" href="/quick-capture">Open Workspace</a>
      </div>
    </form>
  `;
}

function renderPeopleCommandReview(reviewDraft = {}) {
  const draft = reviewDraft.captureDraft || {};
  const personDraft = draft.personDraft || {};
  const interactionDraft = draft.interactionDraft || {};
  const matchedPerson = reviewDraft.matchedPerson || null;
  const invalidName = !String(personDraft.name || '').trim();
  return `
    <div class="stack">
      <div class="info-callout">
        <strong>${escapeHtml(matchedPerson ? 'Review update' : 'Review contact')}</strong><br />
        ${escapeHtml(matchedPerson ? `We found ${matchedPerson.name} and drafted the update for review before saving.` : 'This draft stays review-first until you confirm the details and save it.')}
      </div>
      <form class="api-form" data-api-form="true" data-endpoint="/people/upsert">
        ${matchedPerson ? `<input type="hidden" name="personId" value="${escapeHtml(matchedPerson.personId)}" />` : ''}
        ${renderFormField('Name', `<input name="name" type="text" value="${escapeHtml(personDraft.name || '')}" placeholder="Sam" />`)}
        ${renderFormField('Tags', `<input name="tags" type="text" value="${escapeHtml((personDraft.tags || []).join(', '))}" />`, 'Comma-separated')}
        ${renderFormField('Notes', `<textarea name="notes" rows="5">${escapeHtml(personDraft.notes || '')}</textarea>`)}
        ${renderFormField(
          'Next follow-up',
          `<input name="nextFollowUpAt" type="datetime-local" value="${escapeHtml((personDraft.nextFollowUpAt || '').replace(/:\d{2}\.\d{3}Z$/u, '').replace('Z', ''))}" />`
        )}
        <details class="draft-details">
          <summary>Interaction context</summary>
          <div class="draft-details-body">
            ${renderFormField('Summary', `<textarea rows="3" readonly>${escapeHtml(interactionDraft.summary || '')}</textarea>`)}
            ${renderFormField('Evidence', `<textarea rows="4" readonly>${escapeHtml(interactionDraft.evidence || '')}</textarea>`)}
          </div>
        </details>
        <div class="inline-actions">
          <button type="submit"${invalidName ? ' disabled' : ''}>${escapeHtml(matchedPerson ? 'Save Update' : 'Save Contact')}</button>
        </div>
        <div class="form-result" data-form-result></div>
      </form>
    </div>
  `;
}

function renderEventCommandReview(reviewDraft = {}) {
  const payloadJson = {
    ...safeJson(reviewDraft.payload, {}),
  };
  const followUpTitle = readOptionalString(reviewDraft.title, '');
  const relatedPeople = Array.isArray(reviewDraft.relatedPeople) ? reviewDraft.relatedPeople : [];
  return `
    <div class="stack">
      <div class="info-callout">
        <strong>Review event</strong><br />
        SocialOS drafted the event first so you can review the logbook entry before it is saved.
      </div>
      <form class="api-form" data-api-form="true" data-endpoint="/events" data-json-fields="payload">
        ${renderFormField('Title', `<input name="title" type="text" value="${escapeHtml(followUpTitle)}" />`)}
        ${renderFormField('Audience', `<input name="audience" type="text" value="${escapeHtml(reviewDraft.audience || '')}" />`)}
        ${renderFormField('Language strategy', `<input name="languageStrategy" type="text" value="${escapeHtml(reviewDraft.languageStrategy || '')}" placeholder="en, zh, bilingual" />`)}
        ${renderFormField('Tone', `<input name="tone" type="text" value="${escapeHtml(reviewDraft.tone || '')}" />`)}
        ${relatedPeople.map((personId) => `<input type="hidden" name="relatedPeople" value="${escapeHtml(personId)}" />`).join('')}
        ${renderFormField('Links', `<textarea name="links" rows="3">${escapeHtml((reviewDraft.links || []).join('\n'))}</textarea>`, 'One per line')}
        ${renderFormField('Assets', `<textarea name="assets" rows="3">${escapeHtml((reviewDraft.assets || []).join('\n'))}</textarea>`, 'One per line')}
        ${renderFormField('Payload JSON', `<textarea name="payload" rows="8">${escapeHtml(JSON.stringify(payloadJson, null, 2))}</textarea>`)}
        <div class="inline-actions">
          <button type="submit"${followUpTitle ? '' : ' disabled'}>Save Event</button>
        </div>
        <div class="form-result" data-form-result></div>
      </form>
    </div>
  `;
}

function renderPackageHighlights(draft, publishPackage) {
  const detailGroups = [
    ['Image Ideas', publishPackage.imageIdeas],
    ['Asset Checklist', publishPackage.assetChecklist],
    ['Cover Hooks', publishPackage.coverHooks],
    ['Visual Storyboard', publishPackage.visualStoryboard],
    ['Caption Variants', publishPackage.captionVariants],
    ['Article Outline', publishPackage.articleOutline],
    ['Section Bullets', publishPackage.sectionBullets],
    ['Codex Assist', publishPackage.codexAssist],
  ].filter(([, items]) => Array.isArray(items) && items.length);

  const detailNotes = [
    ['Lead Paragraph', publishPackage.leadParagraph],
    ['Comment Prompt', publishPackage.commentPrompt],
    ['First Comment', publishPackage.firstComment],
  ].filter(([, value]) => typeof value === 'string' && value.trim());

  if (!detailGroups.length && !detailNotes.length) return '';

  return `
    <div class="package-highlights">
      ${detailGroups
        .map(
          ([title, items]) => `
            <section class="detail-card">
              <h4>${escapeHtml(title)}</h4>
              <ul class="compact-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </section>
          `
        )
        .join('')}
      ${detailNotes
        .map(
          ([title, value]) => `
            <section class="detail-card">
              <h4>${escapeHtml(title)}</h4>
              <p>${escapeHtml(value)}</p>
            </section>
          `
        )
        .join('')}
    </div>
  `;
}

function formatLanguageLabel(language) {
  switch (String(language || '').toLowerCase()) {
    case 'zh':
      return 'Chinese';
    case 'en':
      return 'English';
    default:
      return String(language || 'n/a');
  }
}

function formatMirrorCadenceLabel(cadence) {
  const normalized = readOptionalString(cadence, '').toLowerCase();
  if (normalized === 'daily') return 'Daily Mirror';
  if (normalized === 'weekly') return 'Weekly Mirror';
  return 'Mirror';
}

function formatPlatformShellLabel(platform) {
  const labels = {
    linkedin: 'LinkedIn',
    x: 'X',
    instagram: 'Instagram',
    zhihu: 'Zhihu',
    xiaohongshu: 'Rednote',
    wechat_moments: 'WeChat Moments',
    wechat_official: 'WeChat Official Account',
  };
  return labels[platform] || platform || 'Draft';
}

function buildEntityHref(entityType, entityId) {
  if (entityType === 'person') return `/people/${encodeURIComponent(entityId)}`;
  if (entityType === 'event') return `/events/${encodeURIComponent(entityId)}`;
  return '#';
}

function renderGraphOverview(graphOverview) {
  if (!graphOverview?.nodes?.length) return renderEmptyState('No linked graph context yet.');
  const width = 320;
  const height = 220;
  const nodes = Array.isArray(graphOverview.nodes) ? graphOverview.nodes : [];
  const edges = Array.isArray(graphOverview.edges) ? graphOverview.edges : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return `
    <div class="graph-shell">
      <svg viewBox="0 0 ${width} ${height}" class="graph-svg" role="img" aria-label="Relationship graph overview">
        ${edges
          .map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return '';
            return `<line x1="${Math.round(from.x * width)}" y1="${Math.round(from.y * height)}" x2="${Math.round(
              to.x * width
            )}" y2="${Math.round(to.y * height)}" class="graph-edge" />`;
          })
          .join('')}
        ${nodes
          .map((node) => {
            const x = Math.round(node.x * width);
            const y = Math.round(node.y * height);
            const radius = node.entityId === graphOverview.focusId ? 16 : 12;
            return `
              <a href="${escapeHtml(buildEntityHref(node.entityType, node.entityId))}">
                <circle cx="${x}" cy="${y}" r="${radius}" class="graph-node ${escapeHtml(node.entityType)} ${
                  node.entityId === graphOverview.focusId ? 'focus' : ''
                }" />
                <text x="${x}" y="${y + 32}" text-anchor="middle" class="graph-label">${escapeHtml(
                  truncate(node.label || '', 20)
                )}</text>
              </a>
            `;
          })
          .join('')}
      </svg>
    </div>
  `;
}

function isChineseDraftLanguage(language) {
  return String(language || '').toLowerCase() === 'zh';
}

function pickDraftUiCopy(draft, englishLabel) {
  return englishLabel;
}

function formatHumanPublishMode(mode) {
  return readOptionalString(mode, 'dry-run') === 'live' ? 'Live publish' : 'Safe rehearsal';
}

function buildClipboardText(draft, publishPackage, mode = 'body') {
  const hashtags = Array.isArray(publishPackage.hashtags) ? publishPackage.hashtags.join(' ') : '';
  const sections = [];

  if (mode === 'bundle') {
    sections.push(`${draft.platformLabel} Publish Package`);
    if (publishPackage.title) sections.push(`Title\n${publishPackage.title}`);
    if (publishPackage.hook) sections.push(`Hook\n${publishPackage.hook}`);
    if (publishPackage.preview || draft.content) sections.push(`Body\n${publishPackage.preview || draft.content}`);
    if (hashtags) sections.push(`Tags\n${hashtags}`);
    if (Array.isArray(publishPackage.assetChecklist) && publishPackage.assetChecklist.length) {
      sections.push(`Assets\n${publishPackage.assetChecklist.join('\n')}`);
    }
    if (Array.isArray(publishPackage.steps) && publishPackage.steps.length) {
      sections.push(`Publish Steps\n${publishPackage.steps.join('\n')}`);
    }
    return sections.filter(Boolean).join('\n\n');
  }

  if (publishPackage.title && draft.platform === 'wechat_official') {
    sections.push(publishPackage.title);
  }
  sections.push(publishPackage.preview || draft.content || '');
  if (hashtags) sections.push(hashtags);
  return sections.filter(Boolean).join('\n\n');
}

function buildDraftPreviewBody(draft, publishPackage) {
  const title = normalizeInlineText(publishPackage.title || '');
  const hook = normalizeInlineText(publishPackage.hook || '');
  const hashtagLine = normalizeInlineText(
    Array.isArray(publishPackage.hashtags) ? publishPackage.hashtags.join(' ') : ''
  );
  const lines = String(draft.content || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const cleaned = [...lines];

  while (cleaned.length) {
    const current = normalizeInlineText(cleaned[0]);
    if (!current) {
      cleaned.shift();
      continue;
    }
    if (title && current === title) {
      cleaned.shift();
      continue;
    }
    if (hook && current === hook) {
      cleaned.shift();
      continue;
    }
    break;
  }

  if (cleaned.length && hashtagLine && normalizeInlineText(cleaned.at(-1)) === hashtagLine) {
    cleaned.pop();
  }

  return cleaned.join('\n');
}

function renderPublishActions(draft, publishPackage) {
  const entryUrl = readOptionalString(publishPackage.entryUrl, '');
  const copyBody = buildClipboardText(draft, publishPackage, 'body');
  const copyBundle = buildClipboardText(draft, publishPackage, 'bundle');

  return `
    <div class="inline-actions action-strip">
      <button type="button" class="secondary-button" data-copy-text="${escapeHtml(copyBody)}">${escapeHtml(
        pickDraftUiCopy(draft, 'Copy Draft')
      )}</button>
      <button type="button" class="secondary-button" data-copy-text="${escapeHtml(copyBundle)}">${escapeHtml(
        pickDraftUiCopy(draft, 'Copy Package')
      )}</button>
      ${
        entryUrl
          ? `<a class="mini-link action-link" href="${escapeHtml(entryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
              pickDraftUiCopy(draft, 'Open Platform')
            )}</a>`
          : ''
      }
    </div>
  `;
}

const DRAFT_PLATFORM_DISPLAY_ORDER = Object.freeze([
  'linkedin',
  'x',
  'instagram',
  'zhihu',
  'xiaohongshu',
  'wechat_moments',
  'wechat_official',
]);

function sortDraftsForDisplay(drafts) {
  const rankMap = new Map(DRAFT_PLATFORM_DISPLAY_ORDER.map((platform, index) => [platform, index]));
  return [...drafts].sort((left, right) => {
    const leftRank = rankMap.get(left.platform) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rankMap.get(right.platform) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);
    return rightTime - leftTime;
  });
}

function renderDraftCards(drafts) {
  if (!drafts.length) return renderEmptyState('No drafts generated yet.');
  return `<div class="draft-grid">${sortDraftsForDisplay(drafts)
    .map((draft) => {
      const capability = safeJson(draft.capability, {});
      const publishPackage = safeJson(draft.publishPackage, {});
      const validation = safeJson(draft.validation, {});
      const steps = Array.isArray(publishPackage.steps) ? publishPackage.steps : [];
      const hashtags = Array.isArray(publishPackage.hashtags) ? publishPackage.hashtags : [];
      const previewBody = buildDraftPreviewBody(draft, publishPackage) || draft.content;
      const draftContextTitle = readOptionalString(
        publishPackage.localizedTitle || draft.eventTitle || draft.eventId || 'untitled event',
        'untitled event'
      );
      const hasIssues = validation && Object.keys(validation).length && validation.ok === false;
      const queueDisabled = hasIssues;
      const supportLabel = publishPackage.supportLevel || capability.supportLevel || 'L0 Draft';
      const entryLabel = publishPackage.entryTarget || capability.entryTarget || 'manual';
      const blockedLabel = publishPackage.blockedBy || capability.blockedBy || 'n/a';
      const shellPlatformLabel = readOptionalString(draft.platformShellLabel || draft.platformLabel, draft.platform || 'Draft');
      const displayTitle = readOptionalString(publishPackage.title, '');
      const displayHook = readOptionalString(publishPackage.hook, '');
      const showDisplayTitle = displayTitle && !/demo package/iu.test(displayTitle);
      const showDisplayHook = displayHook && !/demo package/iu.test(displayHook) && displayHook !== displayTitle;
      return `
        <article class="draft-card">
          <div class="draft-head">
            <div>
              <p class="card-kicker">${escapeHtml(draftContextTitle)}</p>
              <h3>${escapeHtml(shellPlatformLabel)}</h3>
              <p class="draft-subtitle">One localized card for this platform, ready to review, copy, and hand off.</p>
            </div>
            <div class="chip-row">
              ${renderPill(supportLabel, capability.liveEligible ? 'accent' : 'soft')}
              ${renderPill(entryLabel, 'neutral')}
            </div>
          </div>
          ${renderPublishActions(draft, publishPackage)}
          ${showDisplayTitle ? `<p class="draft-title">${escapeHtml(displayTitle)}</p>` : ''}
          ${showDisplayHook ? `<p class="draft-hook">${escapeHtml(displayHook)}</p>` : ''}
          ${renderRichTextPreview(previewBody, 'draft-preview')}
          ${
            hashtags.length
              ? `<p class="draft-tags">${escapeHtml(hashtags.join(' '))}</p>`
              : ''
          }
          ${
            hasIssues
              ? `<div class="result-block">
                  <p><strong>Validation:</strong> ${escapeHtml('needs review')}</p>
                  <small>${escapeHtml(
                    (validation.issues || []).map((issue) => issue.message).join(' | ') || 'No issues'
                  )}</small>
                </div>`
              : ''
          }
          <form class="api-form compact-form draft-queue-form" data-api-form="true" data-endpoint="/publish/queue">
            <input type="hidden" name="draftId" value="${escapeHtml(draft.draftId)}" />
            <input type="hidden" name="mode" value="dry-run" />
            <div class="inline-actions">
              <button type="submit"${queueDisabled ? ' disabled' : ''}>${escapeHtml(
                pickDraftUiCopy(draft, 'Queue Draft')
              )}</button>
            </div>
            ${
              queueDisabled
                ? `<small>Queue is blocked until validation issues are resolved.</small>`
                : ''
            }
            <div class="form-result" data-form-result></div>
          </form>
          <details class="draft-details">
            <summary>More options</summary>
            <div class="draft-details-body">
              <div class="package-meta">
                <p><strong>Entry:</strong> ${escapeHtml(entryLabel)}</p>
                <p><strong>Blocked by:</strong> ${escapeHtml(blockedLabel)}</p>
              </div>
              ${
                steps.length
                  ? `<ol class="step-list">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
                  : ''
              }
              ${renderPackageHighlights(draft, publishPackage)}
              <form class="api-form compact-form" data-api-form="true" data-method="PATCH" data-endpoint="/drafts/${encodeURIComponent(
                draft.draftId
              )}">
                ${renderFormField(
                  'Edit draft',
                  `<textarea name="content" rows="8">${escapeHtml(draft.content)}</textarea>`,
                  'Edit the final copy before publishing.'
                )}
                ${renderFormField(
                  'Variants',
                  `<textarea name="variants" rows="3">${escapeHtml((draft.variants || []).join('\n'))}</textarea>`,
                  'Optional notes, one line each.'
                )}
                <div class="inline-actions">
                  <button type="submit">Save edit</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/drafts/${encodeURIComponent(
                draft.draftId
              )}/validate">
                <div class="inline-actions">
                  <button type="submit">Run validation</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
            </div>
          </details>
        </article>
      `;
    })
    .join('')}</div>`;
}

function collapseQueueTasksForDisplay(queueTasks, limit = queueTasks.length) {
  const latestByKey = new Map();

  for (const task of queueTasks) {
    const key = [task.status || '', task.eventId || task.eventTitle || '', task.platform || ''].join('::');
    const existing = latestByKey.get(key);
    const taskTime = Date.parse(task.updatedAt || task.createdAt || 0);
    const existingTime = existing ? Date.parse(existing.updatedAt || existing.createdAt || 0) : 0;

    if (!existing || taskTime >= existingTime) {
      latestByKey.set(key, {
        ...task,
        duplicateCount: (existing?.duplicateCount || 0) + 1,
      });
      continue;
    }

    existing.duplicateCount = (existing.duplicateCount || 1) + 1;
  }

  return [...latestByKey.values()]
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0)
    )
    .slice(0, limit);
}

function renderQueueCards(queueTasks, publishMode) {
  if (!queueTasks.length) return renderEmptyState('No queue tasks yet.');
  const liveApprovalEnabled = String(publishMode || '').toLowerCase() === 'live';
  const statusTone = (status) => {
    if (status === 'queued' || status === 'manual_step_needed' || status === 'failed') return 'warn';
    return 'good';
  };
  const renderLiveFallback = (liveFallbackReason) =>
    Object.keys(liveFallbackReason).length
      ? `<p><strong>Live fallback:</strong> env=${escapeHtml(
          String(Boolean(liveFallbackReason.envEnabled))
        )} · ui=${escapeHtml(String(Boolean(liveFallbackReason.uiEnabled)))} · creds=${escapeHtml(
          String(Boolean(liveFallbackReason.credentialsReady))
        )}</p>`
      : '';
  return `<div class="stack">${queueTasks
    .map((task) => {
      const result = safeJson(task.result, {});
      const execution = safeJson(result.execution, {});
      const manualCompletion = safeJson(result.manualCompletion, {});
      const liveFallbackReason = safeJson(execution.liveFallbackReason, {});
      const publishPackage = safeJson(task.metadata?.publishPackage, {});
      const queued = task.status === 'queued';
      const needsManual = task.status === 'manual_step_needed';
      const taskPrefersLive = liveApprovalEnabled && String(task.mode || '').toLowerCase() === 'live';
      const supportLevel = task.capability?.supportLevel || 'L0 Draft';
      const entryTarget = execution.preflight?.entryTarget || task.capability?.entryTarget || 'manual';
      const summaryText = summarizeCardCopy(
        task.content || publishPackage.preview || publishPackage.title || '',
        118,
        queued
          ? 'This package is ready for the next handoff.'
          : needsManual
            ? 'This package is waiting for the real handoff outcome.'
            : 'This queue item is now closed.'
      );
      const nextStepText = queued
        ? taskPrefersLive
          ? 'Ready to review before a live handoff.'
          : 'Ready for Safe rehearsal or a manual handoff.'
        : needsManual
          ? `Next step: finish the handoff in ${entryTarget} and record what happened here.`
          : manualCompletion.outcome === 'failed'
            ? 'This handoff closed as failed. Open the details if you need the trail.'
            : 'This handoff is closed and the latest outcome is recorded below.';
      const liveControlsMessage = liveApprovalEnabled
        ? 'Only open live controls when you truly intend to post and the credentials are ready.'
        : 'Live publish stays gated until you switch Studio policies out of Safe rehearsal.';
      return `
        <article class="stack-card queue-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.eventTitle || 'Untitled event')}</strong>
            <span>${escapeHtml(task.platformLabel || task.platform || 'platform')}</span>
          </div>
          <div class="chip-row">
            ${renderPill(task.status, statusTone(task.status))}
            ${renderPill(supportLevel, supportLevel.includes('L2') ? 'accent' : 'soft')}
            ${renderPill(formatLanguageLabel(task.language), 'soft')}
            ${renderPill(task.mode === 'live' ? 'live intent' : 'safe rehearsal', task.mode === 'live' ? 'warn' : 'good')}
            ${task.duplicateCount > 1 ? renderPill(`${task.duplicateCount} recent attempts`, 'soft') : ''}
          </div>
          ${renderPublishActions(task, publishPackage)}
          <p>${escapeHtml(summaryText)}</p>
          <div class="result-block compact-card">
            <p><strong>Next step:</strong> ${escapeHtml(nextStepText)}</p>
            <small>${escapeHtml(`Updated ${formatDateTime(task.updatedAt)} · entry ${entryTarget}`)}</small>
          </div>
          ${
            queued
              ? `
                <form class="api-form compact-form" data-api-form="true" data-endpoint="/publish/approve">
                  <input type="hidden" name="taskId" value="${escapeHtml(task.taskId)}" />
                  <input type="hidden" name="approvedBy" value="dashboard" />
                  <input type="hidden" name="mode" value="dry-run" />
                  <div class="inline-actions">
                    <button type="submit">Start Safe rehearsal</button>
                  </div>
                  <div class="form-result" data-form-result></div>
                </form>
                <details class="details-shell queue-details">
                  <summary>Live options</summary>
                  <p>${escapeHtml(liveControlsMessage)}</p>
                  <form class="api-form compact-form" data-api-form="true" data-endpoint="/publish/approve">
                    <input type="hidden" name="taskId" value="${escapeHtml(task.taskId)}" />
                    <input type="hidden" name="approvedBy" value="dashboard" />
                    <div class="form-grid compact-grid">
                      ${renderFormField(
                        'Mode',
                        `<select name="mode">
                          <option value="dry-run"${taskPrefersLive ? '' : ' selected'}>dry-run</option>
                          <option value="live"${taskPrefersLive ? ' selected' : ''}${liveApprovalEnabled ? '' : ' disabled'}>live</option>
                        </select>`
                      )}
                      ${renderFormField(
                        'Live Gate',
                        `<label class="toggle"><input type="checkbox" name="liveEnabled" value="true"${taskPrefersLive ? ' checked' : ''}${liveApprovalEnabled ? '' : ' disabled'} /> <span>UI live intent</span></label>`
                      )}
                      ${renderFormField(
                        'Credentials',
                        `<label class="toggle"><input type="checkbox" name="credentialsReady" value="true"${taskPrefersLive ? ' checked' : ''}${liveApprovalEnabled ? '' : ' disabled'} /> <span>credentials ready</span></label>`
                      )}
                    </div>
                    <div class="inline-actions">
                      <button type="submit"${liveApprovalEnabled ? '' : ' disabled'}>Review live handoff</button>
                    </div>
                    <div class="form-result" data-form-result></div>
                  </form>
                </details>
              `
              : needsManual
                ? `
                  <div class="result-block">
                    <p><strong>Handoff note:</strong> ${escapeHtml(
                      execution.preflight?.note || execution.delivery?.reason || 'manual handoff ready'
                    )}</p>
                  </div>
                  <form class="api-form compact-form" data-api-form="true" data-endpoint="/publish/complete">
                    <input type="hidden" name="taskId" value="${escapeHtml(task.taskId)}" />
                    ${renderFormField(
                      'Outcome',
                      `<select name="outcome">
                        <option value="posted">posted</option>
                        <option value="manual_step_needed">manual_step_needed</option>
                        <option value="failed">failed</option>
                      </select>`
                    )}
                    ${renderFormField('Link', '<input name="link" type="url" placeholder="https://post-link" />')}
                    ${renderFormField('Note', '<textarea name="note" rows="3" placeholder="What happened in the manual step?"></textarea>')}
                    <div class="inline-actions">
                      <button type="submit">Record Outcome</button>
                    </div>
                    <div class="form-result" data-form-result></div>
                  </form>
                  ${
                    Object.keys(liveFallbackReason).length
                      ? `<details class="details-shell queue-details"><summary>Handoff details</summary>${renderLiveFallback(liveFallbackReason)}</details>`
                      : ''
                  }
                `
              : `
                <div class="result-block">
                  <p><strong>Latest outcome:</strong> ${escapeHtml(
                    manualCompletion.outcome || execution.delivery?.reason || result.execution?.delivery?.reason || 'n/a'
                  )}</p>
                  ${manualCompletion.link ? `<p><strong>Link:</strong> ${escapeHtml(manualCompletion.link)}</p>` : ''}
                </div>
                <details class="details-shell queue-details">
                  <summary>More details</summary>
                  <p><strong>Run:</strong> ${escapeHtml(execution.runId || 'n/a')}</p>
                  ${manualCompletion.note ? `<p><strong>Note:</strong> ${escapeHtml(manualCompletion.note)}</p>` : ''}
                  ${renderLiveFallback(liveFallbackReason)}
                </details>
              `
          }
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderCockpitActionCards(actions) {
  if (!Array.isArray(actions) || !actions.length) return renderEmptyState('No action stack yet.');
  return `<div class="stack">${actions
    .map(
      (action) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(action.title || 'Next action')}</strong>
            ${renderPill(action.tone === 'warn' ? 'priority' : action.tone === 'good' ? 'ready' : 'next', action.tone || 'soft')}
          </div>
          <p>${escapeHtml(summarizeCardCopy(action.reason || '', 132, 'A useful next action is ready.'))}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(normalizeWorkspaceHref(action.href || '/quick-capture'))}">Open</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderFollowUpCards(followUps) {
  if (!Array.isArray(followUps) || !followUps.length) return renderEmptyState('No relationship follow-ups are staged yet.');
  return `<div class="stack">${followUps
    .map(
      (item) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(item.name)}</strong>
            ${renderPill(item.followUpState || 'warm', item.followUpState === 'due now' ? 'warn' : item.followUpState === 'up next' ? 'accent' : 'soft')}
          </div>
          <p>${escapeHtml(summarizeCardCopy(item.followUpMessage || item.evidenceSnippet || '', 140, 'Keep the relationship warm.'))}</p>
          <div class="chip-row">
            ${(Array.isArray(item.tags) && item.tags.length ? item.tags : ['no-tags']).map((tag) => renderPill(tag, 'soft')).join('')}
          </div>
          <small>Last interaction: ${escapeHtml(formatDateTime(item.lastInteractionAt || item.updatedAt))}</small>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'people', contactId: item.personId }))}">Open Contact</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderAskActionCards(actions) {
  if (!Array.isArray(actions) || !actions.length) return renderEmptyState('No suggested action yet.');
  return `<div class="stack">${actions
    .map(
      (action) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(action.label || 'Open')}</strong>
            <span>${escapeHtml(normalizeWorkspaceHref(action.href || '/quick-capture'))}</span>
          </div>
          <p>${escapeHtml(action.reason || '')}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(normalizeWorkspaceHref(action.href || '/quick-capture'))}">Open</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderAskDraftCards(drafts) {
  if (!Array.isArray(drafts) || !drafts.length) return renderEmptyState('No draft matches yet.');
  return `<div class="stack">${drafts
    .map(
      (draft) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(draft.platformShellLabel || draft.platformLabel || draft.platform || 'Draft')}</strong>
            <span>${escapeHtml(truncate(draft.eventTitle || 'Current event', 42))}</span>
          </div>
          <p>${escapeHtml(summarizeCardCopy(draft.snippet || draft.content || '', 164, 'A platform-ready draft already exists for this event.'))}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'drafts', eventId: draft.eventId || '' }))}">Open Drafts</a>
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderMirrorBlock(mirrorPayload) {
  const latestMirror = mirrorPayload.latestMirror || null;
  const checkins = Array.isArray(mirrorPayload.checkins) ? mirrorPayload.checkins : [];
  const mirrorThemes = Array.isArray(latestMirror?.themes) ? latestMirror.themes.slice(0, 3) : [];
  const mirrorLeadParts = [];
  if (mirrorThemes.length) {
    mirrorLeadParts.push(`This week centered on ${joinNaturalList(mirrorThemes.map((item) => item.theme))}.`);
  }
  const mirrorEnergizer = summarizeCardCopy(latestMirror?.energizers?.[0]?.snippet || '', 92, '');
  const mirrorDrainer = summarizeCardCopy(latestMirror?.drainers?.[0]?.snippet || '', 92, '');
  if (mirrorEnergizer) mirrorLeadParts.push(`Strongest lift: ${mirrorEnergizer}`);
  if (mirrorDrainer) mirrorLeadParts.push(`Watch-out: ${mirrorDrainer}`);

  return `
    <div class="grid two-up">
      ${renderPanel(
        'Weekly Mirror',
        latestMirror
          ? `
              <div class="stack-card">
                <div class="stack-meta">
                  ${renderPill(latestMirror.rangeLabel || 'mirror', 'accent')}
                  <span>${escapeHtml(formatDateTime(latestMirror.createdAt))}</span>
                </div>
                <p>${escapeHtml(mirrorLeadParts.join(' ') || latestMirror.summaryText || latestMirror.content || '')}</p>
                ${
                  Array.isArray(latestMirror.themes) && latestMirror.themes.length
                    ? `<div class="chip-row">${latestMirror.themes
                        .map((item) => renderPill(`${item.theme} (${item.count})`, 'soft'))
                        .join('')}</div>`
                    : ''
                }
                <div class="grid two-up">
                  <div class="detail-card">
                    <h4>Energizers</h4>
                    <ul class="compact-list">${(latestMirror.energizers || [])
                      .map((row) => `<li>${escapeHtml(row.snippet || '')}</li>`)
                      .join('') || '<li>none yet</li>'}</ul>
                  </div>
                  <div class="detail-card">
                    <h4>Drainers</h4>
                    <ul class="compact-list">${(latestMirror.drainers || [])
                      .map((row) => `<li>${escapeHtml(row.snippet || '')}</li>`)
                      .join('') || '<li>none yet</li>'}</ul>
                  </div>
                </div>
                <div class="stack">
                  ${(latestMirror.conclusions || [])
                    .map(
                      (conclusion) => `
                        <details class="detail-card">
                          <summary>${escapeHtml(conclusion.title || 'Conclusion')}</summary>
                          <p>${escapeHtml(conclusion.summary || '')}</p>
                          ${renderEvidenceList(conclusion.evidence?.evidence || [])}
                        </details>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
          : renderEmptyState('No mirror generated yet.')
      )}
      ${renderPanel('Recent Check-Ins', renderCheckinCards(checkins.slice(0, 6)))}
    </div>
  `;
}

function renderAskResultBlock(payload) {
  if (!payload?.query) {
    return `
      <div class="stack">
        <article class="stack-card">
          <strong>Try asking things like:</strong>
          <ul class="compact-list">
            <li>Who was the growth person I met at the hackathon?</li>
            <li>Who is the best person to contact next for the demo?</li>
            <li>What event already has draft material?</li>
            <li>What kind of situation has been giving me the most energy lately?</li>
          </ul>
        </article>
      </div>
    `;
  }

  const mirror = payload.latestMirror || null;
  const mirrorThemes = Array.isArray(mirror?.themes) ? mirror.themes : [];

  return `
    <div class="stack">
      <article class="stack-card">
        <div class="stack-meta">
          <strong>Answer</strong>
          ${renderPill(payload.intent || 'mixed', 'accent')}
        </div>
        <p>${escapeHtml(payload.answer || 'No answer yet.')}</p>
        <div class="chip-row">
          ${renderPill(payload.retrieval?.mode || 'keyword', 'soft')}
          ${renderPill(payload.retrieval?.effectiveProvider || 'local', 'soft')}
        </div>
      </article>
      ${
        mirror
          ? `
            <article class="stack-card">
              <div class="stack-meta">
                <strong>Self Mirror Context</strong>
                <span>${escapeHtml(formatDateTime(mirror.createdAt))}</span>
              </div>
              <p>${escapeHtml(truncate(mirror.summaryText || mirror.content || '', 200))}</p>
              ${
                mirrorThemes.length
                  ? `<div class="chip-row">${mirrorThemes
                      .slice(0, 4)
                      .map((item) => renderPill(`${item.theme} (${item.count})`, 'soft'))
                      .join('')}</div>`
                  : ''
              }
            </article>
          `
          : ''
      }
    </div>
  `;
}

function renderDigestRunList(runs) {
  if (!runs.length) return renderEmptyState('No run history yet.');
  return `<div class="stack">${runs
    .map(
      (run) => `
        <article class="stack-card">
          <div class="stack-meta">
            <code>${escapeHtml(run.runId || 'unknown')}</code>
            <span>${escapeHtml(formatDuration(run.durationMs))}</span>
          </div>
          <div class="chip-row">
            ${renderPill(run.status || 'unknown', run.status === 'success' ? 'good' : 'warn')}
            ${renderPill(run.taskId || 'n/a', 'soft')}
          </div>
          <p>${escapeHtml(run.summary || 'n/a')}</p>
          <small>${escapeHtml(run.next || 'n/a')}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderBlockedList(blocked) {
  const normalized = normalizeBlockedItems(blocked);
  if (!normalized.length) return renderEmptyState('No blocked queue items right now.');
  return `<ul class="blocked-list">${normalized
    .map((item) => `<li><strong>line ${escapeHtml(String(item.line))}</strong> ${escapeHtml(item.task)}</li>`)
    .join('')}</ul>`;
}

function normalizeBlockedItems(...lists) {
  const normalized = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const fallbackLine = normalized.length + 1;
      if (typeof item === 'string') {
        const task = item.trim();
        if (task) normalized.push({ line: fallbackLine, task });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const task =
        readOptionalString(item.task, '') ||
        `${readOptionalString(item.taskId, '')} ${readOptionalString(item.title, '')}`.trim() ||
        readOptionalString(item.title, '');
      if (!task) continue;
      const blockedBy = readOptionalString(item.blockedBy, '').replace(/^blocked by:\s*/iu, '');
      const taskWithReason = blockedBy && !/\(blocked by:/iu.test(task) ? `${task} (blocked by: ${blockedBy})` : task;
      const line = Number.isFinite(Number(item.line)) && Number(item.line) > 0 ? Number(item.line) : fallbackLine;
      normalized.push({ line, task: taskWithReason });
    }
  }
  return normalized;
}

function renderClusterCards(cluster) {
  const agents = Array.isArray(cluster?.agents) ? cluster.agents : [];
  if (!agents.length) return renderEmptyState('Studio agent cluster is not configured.');
  return `<div class="cluster-grid">${agents
    .map(
      (agent) => `
        <article class="cluster-card">
          <p class="card-kicker">${escapeHtml(agent.roleTitle || agent.id)}</p>
          <h3>${escapeHtml(agent.name || agent.id)}</h3>
          <p>${escapeHtml(agent.responsibility || 'custom lane')}</p>
          <ul class="compact-list">
            <li><strong>Model:</strong> ${escapeHtml(agent.model || 'n/a')}</li>
            <li><strong>Tools:</strong> ${escapeHtml(agent.toolProfile || 'n/a')}</li>
            <li><strong>Workspace:</strong> ${escapeHtml(agent.workspace || 'n/a')}</li>
          </ul>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderFoundryTaskCards(tasks) {
  if (!tasks.length) return renderEmptyState('No Studio tasks yet.');
  return `<div class="stack">${tasks
    .map(
      (task) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.title || task.taskId)}</strong>
            <span>${escapeHtml(formatDateTime(task.createdAt))}</span>
          </div>
          <div class="chip-row">
            ${renderPill(task.status || 'pending', task.status === 'done' ? 'good' : task.status === 'blocked' ? 'warn' : 'soft')}
            ${renderPill(task.scope || 'socialos', 'accent')}
            ${renderPill(task.intakeMode || 'quick', 'soft')}
          </div>
          <p>${escapeHtml(task.goal || task.title || '')}</p>
          <small>${escapeHtml((task.preferredTests || []).join(' | ') || 'bash scripts/test.sh')}</small>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderStudioTaskCards(tasks) {
  if (!tasks.length) return renderEmptyState('No Studio tasks yet.');
  return `<div class="stack">${tasks
    .map((task) => {
      const canRun = ['draft', 'queued', 'blocked'].includes(String(task.status || '').toLowerCase());
      const statusTone =
        task.status === 'done' ? 'good' : task.status === 'blocked' ? 'warn' : ['planning', 'coding', 'testing', 'review'].includes(task.status) ? 'accent' : 'soft';
      return `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.title || task.taskId)}</strong>
            <span>${escapeHtml(formatDateTime(task.updatedAt || task.createdAt))}</span>
          </div>
          <div class="chip-row">
            ${renderPill(task.status || 'queued', statusTone)}
            ${renderPill(task.scope || 'socialos', 'accent')}
            ${renderPill(String(task.priority || 3), 'soft')}
          </div>
          <p>${escapeHtml(task.goal || task.title || '')}</p>
          <small>${escapeHtml((task.preferredTests || []).join(' | ') || 'bash scripts/test.sh')}</small>
          ${canRun ? `
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/tasks/${encodeURIComponent(task.taskId)}/run">
              <div class="inline-actions">
                <button type="submit">Run now</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
          ` : ''}
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderFoundryExecutionSurface(cluster) {
  const llmTaskHealth = cluster?.llmTaskHealth || {};
  const supportedScopes = Array.isArray(cluster?.supportedScopes) ? cluster.supportedScopes : [];
  const lastRun = cluster?.lastGenericTaskRun;
  const statusTone =
    llmTaskHealth.status === 'ok' || llmTaskHealth.status === 'mock'
      ? 'good'
      : llmTaskHealth.status === 'unknown'
        ? 'soft'
        : 'warn';

  return `
    <div class="grid two-up">
      <article class="panel inset-panel">
        <div class="panel-head">
          <div>
            <h3>Studio Responsibilities</h3>
          </div>
        </div>
        <ul class="compact-list">
          <li>Take one shared task stream and close it through the SQLite control plane.</li>
          <li>Drive orchestrator, coder, tester, and reviewer lanes as one execution chain.</li>
          <li>Export queue status, run reports, and digests as public evidence.</li>
        </ul>
      </article>
      <article class="panel inset-panel">
        <div class="panel-head">
          <div>
            <h3>Execution Health</h3>
          </div>
        </div>
        <div class="chip-row">
          ${renderPill(
            cluster?.genericTaskExecutionEnabled ? 'generic execute on' : 'generic execute off',
            cluster?.genericTaskExecutionEnabled ? 'good' : 'warn'
          )}
          ${renderPill(`llm-task ${llmTaskHealth.status || 'unknown'}`, statusTone)}
          ${renderPill(cluster?.defaultAutonomyMode || 'direct-execute', 'accent')}
        </div>
        <ul class="compact-list">
          <li><strong>Health:</strong> ${escapeHtml(llmTaskHealth.summary || 'No probe yet.')}</li>
          <li><strong>Reason:</strong> ${escapeHtml(llmTaskHealth.reason || 'waiting for first probe')}</li>
          <li><strong>Checked:</strong> ${escapeHtml(formatDateTime(llmTaskHealth.checkedAt))}</li>
          <li><strong>Supported scopes:</strong> ${escapeHtml(supportedScopes.join(', ') || 'socialos')}</li>
          <li><strong>Last generic run:</strong> ${escapeHtml(lastRun?.taskId || 'none yet')}</li>
        </ul>
      </article>
    </div>
  `;
}

function renderOperatingSplit(codex) {
  const canOwn = Array.isArray(codex?.canOwn) ? codex.canOwn : [];
  const goodAt = Array.isArray(codex?.goodAt) ? codex.goodAt : [];
  const stillNeedsHuman = Array.isArray(codex?.stillNeedsHuman) ? codex.stillNeedsHuman : [];

  return `
    <div class="grid three-up">
      ${renderPanel(
        'Codex Can Own',
        `<ul class="compact-list">${canOwn.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      )}
      ${renderPanel(
        'Codex Is Best At',
        `<ul class="compact-list">${goodAt.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      )}
      ${renderPanel(
        'Still Needs You',
        `<ul class="compact-list">${stillNeedsHuman.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      )}
    </div>
  `;
}

function renderCodexSummary(codex) {
  return renderOperatingSplit(codex);
}

async function renderCockpitPage(page) {
  const [cockpitRes, runtimeRes] = await Promise.all([
    fetchJsonSafe('/cockpit/summary'),
    fetchJsonSafe('/settings/runtime'),
  ]);
  const cockpit = cockpitRes.ok
    ? cockpitRes.payload
    : {
        counts: {},
        summaryText: 'Cockpit data is unavailable right now.',
        actions: [],
        followUps: [],
        recentPeople: [],
        recentEvents: [],
        queue: { awaitingApproval: [], manualSteps: [], posted: [] },
        latestMirror: null,
        recentCheckins: [],
      };
  const publishMode = runtimeRes.ok ? readOptionalString(runtimeRes.payload?.publishMode, 'dry-run') : 'dry-run';
  const queuePreview = [
    ...(cockpit.queue?.awaitingApproval || []),
    ...(cockpit.queue?.manualSteps || []),
  ].slice(0, 4);

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(cockpit.followUps?.length || 0), 'follow-ups'),
        renderMetric(String(cockpit.queue?.awaitingApproval?.length || 0), 'queued drafts'),
        renderMetric(String(cockpit.queue?.manualSteps?.length || 0), 'manual steps'),
        renderMetric(String(cockpit.recentEvents?.length || 0), 'recent events'),
      ].join(''),
      `<div class="info-card"><strong>Today on deck</strong><p>${escapeHtml(cockpit.summaryText || 'No cockpit summary yet.')}</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Quick Capture Launchpad',
        `
          <form class="query-form" method="GET" action="/quick-capture">
            ${renderFormField(
              'Start with a natural note',
              '<textarea name="prefill" rows="5" placeholder="I met someone doing growth at the hackathon, I felt energized, and I should follow up next Tuesday."></textarea>',
              'This opens the chat workspace with your note already loaded into the main composer.'
            )}
            <div class="inline-actions">
              <button type="submit">Open Workspace</button>
              <a class="mini-link" href="/ask">Ask Memory</a>
            </div>
          </form>
        `,
        'Home is now an action surface, not just a status wall.'
      )}
      ${renderPanel(
        'Top Actions',
        renderCockpitActionCards(cockpit.actions || []),
        'These are the next best moves across relationships, content, and self review.'
      )}
    </div>
    <div class="grid two-up">
      ${renderPanel(
        'People To Follow Up',
        renderFollowUpCards(cockpit.followUps || []),
        'These come from next follow-up dates, interaction recency, and existing contact evidence.'
      )}
      ${renderPanel(
        'Queue Snapshot',
        renderQueueCards(queuePreview, publishMode),
        'Draft approvals and manual publish steps stay visible from the cockpit.'
      )}
    </div>
    <div class="grid two-up">
      ${renderPanel('Recent Contacts', renderPeopleCards(cockpit.recentPeople || []))}
      ${renderPanel('Event Logbook', renderEventCards(cockpit.recentEvents || []))}
    </div>
    ${renderMirrorBlock({
      latestMirror: cockpit.latestMirror || null,
      checkins: cockpit.recentCheckins || [],
    })}
  `;
}

async function renderAskPage(page, requestUrl) {
  const query = readOptionalString(requestUrl.searchParams.get('q'), '');
  const askRes = query
    ? await fetchJsonSafe(`/ask/search?query=${encodeURIComponent(query)}`)
    : { ok: true, payload: { query: '', people: [], events: [], drafts: [], actions: [], latestMirror: null } };
  const payload = askRes.ok ? askRes.payload || {} : { query, answer: askRes.error || 'Ask is unavailable right now.' };

  return `
    ${renderHero(
      page,
      [
        renderMetric(String((payload.people || []).length), 'people hits'),
        renderMetric(String((payload.events || []).length), 'event hits'),
        renderMetric(String((payload.drafts || []).length), 'draft hits'),
        renderMetric(String((payload.contactsToReachOut || []).length), 'suggested contacts'),
      ].join(''),
      `<div class="info-card"><strong>Ask from memory</strong><p>Use natural language to recall people, events, content, and your recent self signals.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Ask SocialOS',
        `
          <form class="query-form" method="GET" action="/ask">
            ${renderFormField(
              'Question',
              `<textarea name="q" rows="5" placeholder="Who should I follow up with about the demo launch?">${escapeHtml(query)}</textarea>`,
              'You can ask about people, events, drafts, or your own recent energy patterns.'
            )}
            <div class="inline-actions">
              <button type="submit">Search Memory</button>
              <a class="mini-link" href="/ask">Reset</a>
            </div>
          </form>
        `,
        'This is the natural-language entrypoint over people memory, logbook, drafts, and mirror evidence.'
      )}
      ${renderPanel(
        'Response',
        renderAskResultBlock(payload),
        query ? 'Answer first, then evidence and actions.' : 'Try one of the sample questions to see how the memory layer responds.'
      )}
    </div>
    <div class="grid two-up">
      ${renderPanel('Suggested Actions', renderAskActionCards(payload.actions || []))}
      ${renderPanel('Suggested Contacts', renderFollowUpCards(payload.contactsToReachOut || []))}
    </div>
    <div class="grid two-up">
      ${renderPanel('People Matches', renderPeopleCards(payload.people || [], true))}
      ${renderPanel('Related Events', renderEventCards(payload.events || []))}
    </div>
    ${renderPanel('Draft Matches', renderAskDraftCards(payload.drafts || []), 'If content already exists around this topic, you can jump straight into the package library.')}
  `;
}

async function renderQuickCapturePage(page, requestUrl) {
  const requestedPanel = resolveWorkspacePanel(requestUrl.searchParams.get('panel'));
  const requestedContactId = readOptionalString(requestUrl.searchParams.get('contactId'), '');
  const requestedEventId = readOptionalString(requestUrl.searchParams.get('eventId'), '');
  const activePanel = requestedEventId ? 'events' : requestedContactId ? 'people' : requestedPanel;

  const [bootstrapRes, assetsRes, contactDetailRes, eventDetailRes] = await Promise.all([
    fetchJsonSafe('/workspace/bootstrap'),
    fetchJsonSafe('/capture/assets?limit=8'),
    requestedContactId ? fetchJsonSafe(`/people/${encodeURIComponent(requestedContactId)}`) : Promise.resolve(null),
    requestedEventId ? fetchJsonSafe(`/events/${encodeURIComponent(requestedEventId)}`) : Promise.resolve(null),
  ]);
  const bootstrap = bootstrapRes.ok
    ? bootstrapRes.payload || {}
    : {
        summaryText: 'Workspace bootstrap is unavailable right now.',
        topActions: [],
        recentContacts: [],
        recentEvents: [],
        recentDrafts: [],
        queuePreview: [],
        latestMirror: null,
        recentCheckins: [],
        recentCaptures: [],
        agentLaneSummary: [],
        systemStatus: { publishMode: 'dry-run', loopbackOnly: true, foundryEnabled: false, summary: 'Workspace bootstrap unavailable.' },
        voiceReadiness: { openAiConfigured: false },
      };
  const assets = assetsRes.ok ? assetsRes.payload.assets || [] : [];
  const contactDetail = contactDetailRes?.ok ? contactDetailRes.payload : null;
  const eventDetail = eventDetailRes?.ok ? eventDetailRes.payload : null;
  const openAiReady = Boolean(bootstrap.voiceReadiness?.openAiConfigured);
  const autoQuery = readOptionalString(requestUrl.searchParams.get('q'), '');
  const prefill = readOptionalString(requestUrl.searchParams.get('prefill'), autoQuery);
  const drawerHtml = activePanel === 'events'
    ? renderWorkspaceEventDrawer(eventDetail, requestUrl)
    : renderWorkspaceContactDrawer(contactDetail, requestUrl);

  return `
    ${renderWorkspaceSummaryStrip(bootstrap, requestUrl)}
    <div class="workspace-layout">
      <section class="panel workspace-main-panel">
        <div class="panel-head">
          <div>
            <h2>Conversation</h2>
            <p class="panel-subtitle">Keep the thread natural. SocialOS only opens the next useful contact, event, draft, or mirror when it helps.</p>
          </div>
        </div>
        ${renderWorkspaceThreadSeed(bootstrap.recentCaptures || [])}
        ${drawerHtml}
        <div class="workspace-composer-shell">
          <div class="workspace-asset-tray" data-workspace-assets>
            ${assets.length ? assets.slice(0, 3).map((asset) => `<span class="asset-chip tone-soft">${escapeHtml(asset.fileName || asset.assetId)}</span>`).join('') : ''}
          </div>
          <form class="workspace-composer" data-workspace-chat-form data-openai-transcription-ready="${openAiReady ? 'true' : 'false'}" data-initial-query="${escapeHtml(autoQuery)}">
            <input type="hidden" name="source" value="workspace-chat" />
            <input type="hidden" name="assetIds" value="" data-capture-asset-ids />
            <input type="hidden" name="sourceAssetIds" value="" data-source-asset-ids />
            <input type="hidden" name="voiceLang" value="" />
            <input type="file" data-workspace-file accept="image/*,audio/*" multiple hidden />
            <button type="button" class="secondary-button workspace-icon-button workspace-attach-button" data-workspace-attach>+</button>
            <textarea name="text" rows="2" data-workspace-input placeholder="Ask anything about people, follow-ups, events, or drafts.">${escapeHtml(prefill)}</textarea>
            <div class="workspace-composer-controls">
              <div class="audio-meter" data-audio-meter aria-hidden="true">
                ${Array.from({ length: 14 }, (_, index) => `<span class="audio-meter-bar" data-audio-meter-bar="${index}"></span>`).join('')}
              </div>
              <button type="button" class="secondary-button workspace-icon-button workspace-mic-button" data-audio-record-toggle aria-label="Record voice">
                <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M18 11.5a6 6 0 0 1-12 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <path d="M12 17.5v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <path d="M9.5 20.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
              <button type="submit" class="workspace-send-button">↗</button>
            </div>
          </form>
          <div class="workspace-transcript-preview" data-transcript-preview hidden></div>
          <div class="workspace-voice-source-actions" data-voice-source-actions hidden></div>
          <div class="workspace-composer-note" data-audio-status>Type, attach, or record. Transcripts stay editable before send.</div>
        </div>
        <div class="form-result" data-form-result hidden></div>
      </section>
      ${renderWorkspaceRail(activePanel, bootstrap, requestUrl)}
    </div>
  `;
}

async function renderPeoplePage(page, requestUrl) {
  const query = readOptionalString(requestUrl.searchParams.get('q'), '');
  const selectedPersonId =
    readOptionalString(requestUrl.searchParams.get('personId'), '') ||
    (/^\/people\/([^/]+)$/u.exec(requestUrl.pathname)?.[1] || '');
  const commandRes = query
    ? await fetchJsonSafe(`/people/command?query=${encodeURIComponent(query)}&limit=8`)
    : null;
  const commandPayload = commandRes?.ok ? commandRes.payload : null;
  const effectivePersonId =
    selectedPersonId || readOptionalString(commandPayload?.openMatchId, '') || readOptionalString(commandPayload?.reviewDraft?.matchedPersonId, '');
  const [recentRes, detailRes] = await Promise.all([
    fetchJsonSafe('/people?limit=12'),
    effectivePersonId
      ? fetchJsonSafe(`/people/${encodeURIComponent(effectivePersonId)}`)
      : Promise.resolve(null),
  ]);

  const recentPeople = recentRes?.ok ? recentRes.payload.people || [] : [];
  const detail = detailRes?.ok ? detailRes.payload : null;
  const visiblePeople = query ? commandPayload?.results || [] : recentPeople;
  const visibleFollowUps = recentPeople.filter((person) => readOptionalString(person.nextFollowUpAt, '')).length;
  const linkedEventCount = Array.isArray(detail?.relatedEvents) ? detail.relatedEvents.length : 0;
  const renderDetailBody = detail?.person?.personId
    ? `
        <div class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(detail.person.name)}</strong>
            <span>${escapeHtml(formatDateTime(detail.person.updatedAt || detail.person.createdAt))}</span>
          </div>
          <p>${escapeHtml(detail.person.notes || 'No notes yet.')}</p>
          <div class="chip-row">${(detail.person.tags || []).map((tag) => renderPill(tag, 'soft')).join('')}</div>
          <small>Next follow-up: ${escapeHtml(detail.suggestion?.nextFollowUpAt || 'not set')}</small>
          <p><strong>Suggested follow-up:</strong> ${escapeHtml(detail.suggestion?.followUpMessage || 'n/a')}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'people', contactId: detail.person.personId }))}">Open in Workspace</a>
          </div>
        </div>
        ${renderPanel(
          'Related Events',
          renderEventCards(detail.relatedEvents || [], (event) => `/events/${encodeURIComponent(event.eventId)}`),
          'See the event threads connected to this relationship.'
        )}
        ${renderPanel('Graph Overview', renderGraphOverview(detail.graphOverview), 'A focused one-hop view of this contact and linked events.')}
        ${renderPanel('Timeline', renderInteractionCards(detail.interactions || []))}
        ${renderPanel(
          'Edit Contact',
          `
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/people/upsert">
              <input type="hidden" name="personId" value="${escapeHtml(detail.person.personId)}" />
              ${renderFormField('Name', `<input name="name" type="text" value="${escapeHtml(detail.person.name)}" />`)}
              ${renderFormField(
                'Tags',
                `<input name="tags" type="text" value="${escapeHtml((detail.person.tags || []).join(', '))}" />`,
                'Comma-separated'
              )}
              ${renderFormField(
                'Notes',
                `<textarea name="notes" rows="4">${escapeHtml(detail.person.notes || '')}</textarea>`
              )}
              ${renderFormField(
                'Next Follow-up',
                `<input name="nextFollowUpAt" type="datetime-local" value="${escapeHtml(
                  (detail.person.nextFollowUpAt || '').replace(/:\d{2}\.\d{3}Z$/u, '').replace('Z', '')
                )}" />`
              )}
              <div class="inline-actions"><button type="submit">Save Contact</button></div>
              <div class="form-result" data-form-result></div>
            </form>
          `
        )}
        ${renderPanel('Identities', renderIdentityCards(detail.identities || []))}
        ${renderPanel('Evidence', renderEvidenceList(detail.evidence || []))}
        <div class="grid two-up">
          ${renderPanel(
            'Add Identity',
            `
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/people/${encodeURIComponent(
                detail.person.personId
              )}/identity">
                ${renderFormField('Platform', '<input name="platform" type="text" placeholder="linkedin" />')}
                ${renderFormField('Handle', '<input name="handle" type="text" placeholder="@handle" />')}
                ${renderFormField('URL', '<input name="url" type="url" placeholder="https://..." />')}
                ${renderFormField('Note', '<textarea name="note" rows="3"></textarea>')}
                <div class="inline-actions"><button type="submit">Add Identity</button></div>
                <div class="form-result" data-form-result></div>
              </form>
            `
          )}
          ${renderPanel(
            'Log Interaction',
            `
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/people/${encodeURIComponent(
                detail.person.personId
              )}/interaction">
                ${renderFormField('Summary', '<textarea name="summary" rows="3" placeholder="What happened?"></textarea>')}
                ${renderFormField('Evidence', '<textarea name="evidence" rows="4" placeholder="Optional detail or quote"></textarea>')}
                ${renderFormField('Happened At', '<input name="happenedAt" type="datetime-local" />')}
                <div class="inline-actions"><button type="submit">Log Interaction</button></div>
                <div class="form-result" data-form-result></div>
              </form>
            `
          )}
        </div>
      `
    : commandPayload?.reviewDraft
      ? renderPeopleCommandReview(commandPayload.reviewDraft)
      : `
          <form class="api-form" data-api-form="true" data-endpoint="/people/upsert">
            ${renderFormField('Name', '<input name="name" type="text" placeholder="Annie Case" />')}
            ${renderFormField('Tags', '<input name="tags" type="text" placeholder="growth, founder, london" />', 'Comma-separated')}
            ${renderFormField('Notes', '<textarea name="notes" rows="5" placeholder="Met at..., talked about..., follow up on..."></textarea>')}
            ${renderFormField('Next Follow-up', '<input name="nextFollowUpAt" type="datetime-local" />')}
            <div class="inline-actions">
              <button type="submit">Save Contact</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `;

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(recentPeople.length), 'contacts'),
        renderMetric(String(visibleFollowUps), 'follow-ups'),
        renderMetric(String(linkedEventCount), 'linked events'),
      ].join(''),
      `<div class="info-card"><strong>Contacts</strong><p>Keep the people you know searchable, scannable, and connected to the events they belong to.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Find or draft naturally',
        `
          ${renderCommandBar({
            action: '/people',
            value: query,
            placeholder: 'Find Sam from Bristol, update Alex follow-up, or describe a new contact naturally.',
            hint: 'Search, create, or update a contact with one natural sentence.',
            submitLabel: 'Search'
          })}
          ${commandPayload?.answer ? `<div class="info-callout"><strong>Contacts</strong><br />${escapeHtml(commandPayload.answer)}</div>` : ''}
          ${renderPeopleCards(visiblePeople, false, (person) => `/people/${encodeURIComponent(person.personId)}`)}
        `,
        'Use one natural sentence to find someone, draft a new contact, or review an update.'
      )}
      ${renderPanel(
        detail?.person?.personId ? 'Contact Detail' : commandPayload?.reviewDraft ? 'Review Contact' : 'Add Contact',
        renderDetailBody,
        detail?.person?.personId
          ? 'The contact opens with the relationship summary, then the connected event context, graph, and edit actions.'
          : commandPayload?.reviewDraft
            ? 'Natural-language entry stays review-first until you confirm the contact details.'
            : 'Add one contact directly if you do not want to start from the command bar.'
      )}
    </div>
  `;
}

async function renderEventsPage(page, requestUrl) {
  const query = readOptionalString(requestUrl.searchParams.get('q'), '');
  const selectedEventId =
    readOptionalString(requestUrl.searchParams.get('eventId'), '') ||
    (/^\/events\/([^/]+)$/u.exec(requestUrl.pathname)?.[1] || '');
  const commandRes = query
    ? await fetchJsonSafe(`/events/command?query=${encodeURIComponent(query)}&limit=8`)
    : null;
  const commandPayload = commandRes?.ok ? commandRes.payload : null;
  const effectiveEventId = selectedEventId || readOptionalString(commandPayload?.openMatchId, '');
  const [capturesRes, eventsRes, detailRes] = await Promise.all([
    fetchJsonSafe('/captures?limit=8'),
    fetchJsonSafe('/events?limit=12'),
    effectiveEventId ? fetchJsonSafe(`/events/${encodeURIComponent(effectiveEventId)}`) : Promise.resolve(null),
  ]);
  const captures = capturesRes.ok ? capturesRes.payload.captures || [] : [];
  const events = eventsRes.ok ? eventsRes.payload.events || [] : [];
  const detail = detailRes?.ok ? detailRes.payload : null;
  const visibleEvents = query ? commandPayload?.results || [] : events;
  const linkedPeopleCount = Array.isArray(detail?.relatedPeople) ? detail.relatedPeople.length : 0;

  const captureOptions = ['<option value="">No linked capture</option>']
    .concat(
      captures.map(
        (capture) =>
          `<option value="${escapeHtml(capture.captureId)}">${escapeHtml(
            truncate(capture.text, 70) || capture.captureId
          )}</option>`
      )
    )
    .join('');

  return `
    ${renderHero(
      page,
      [renderMetric(String(events.length), 'recent events'), renderMetric(String(linkedPeopleCount), 'linked people')].join(''),
      `<div class="info-card"><strong>Logbook</strong><p>Track what happened, who it involved, and which content threads grew from it.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Find or draft naturally',
        `
          ${renderCommandBar({
            action: '/events',
            value: query,
            placeholder: 'Find the London meetup with Sam, or draft a new event naturally.',
            hint: 'Search, open, or draft an event with one natural sentence.',
            submitLabel: 'Search'
          })}
          ${commandPayload?.answer ? `<div class="info-callout"><strong>Logbook</strong><br />${escapeHtml(commandPayload.answer)}</div>` : ''}
          ${renderEventCards(visibleEvents, (event) => `/events/${encodeURIComponent(event.eventId)}`)}
        `,
        'Use one natural sentence to find an event, open the best match, or review a new event draft.'
      )}
      ${renderPanel(
        detail?.event?.eventId ? 'Event Detail' : commandPayload?.reviewDraft ? 'Review Event' : 'Add Event',
        detail?.event?.eventId
          ? `
              <div class="stack-card">
                <div class="stack-meta">
                  <strong>${escapeHtml(detail.event.title)}</strong>
                  <span>${escapeHtml(formatDateTime(detail.event.createdAt))}</span>
                </div>
                <p>${escapeHtml(detail.summaryText || 'No event summary yet.')}</p>
                <div class="chip-row">
                  ${detail.audience ? renderPill(detail.audience, 'soft') : ''}
                  ${detail.languageStrategy ? renderPill(detail.languageStrategy, 'soft') : ''}
                  ${detail.tone ? renderPill(detail.tone, 'soft') : ''}
                </div>
                <div class="inline-actions">
                  <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'events', eventId: detail.event.eventId }))}">Open in Workspace</a>
                  <a class="mini-link" href="/drafts?eventId=${encodeURIComponent(detail.event.eventId)}">Open Drafts</a>
                </div>
              </div>
              ${renderPanel(
                'Related People',
                renderPeopleCards(detail.relatedPeople || [], false, (person) => `/people/${encodeURIComponent(person.personId)}`),
                'These are the people directly linked to this event.'
              )}
              ${renderPanel('Graph Overview', renderGraphOverview(detail.graphOverview), 'The graph keeps the event at the center and shows the first ring of linked people.')}
              ${renderPanel('Related Drafts', renderAskDraftCards(detail.relatedDrafts || []))}
            `
          : commandPayload?.reviewDraft
            ? renderEventCommandReview(commandPayload.reviewDraft)
          : `
          <form class="api-form" data-api-form="true" data-endpoint="/events">
            ${renderFormField('Title', '<input name="title" type="text" placeholder="OpenClaw SocialOS product push" />')}
            ${renderFormField('Audience', '<input name="audience" type="text" value="builders and collaborators" />')}
            ${renderFormField(
              'Language Strategy',
              `<select name="languageStrategy">
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="bilingual">Bilingual</option>
              </select>`
            )}
            ${renderFormField('Tone', '<input name="tone" type="text" value="clear, operational, warm" />')}
            <details class="draft-details">
              <summary>Optional context</summary>
              <div class="draft-details-body">
                ${renderFormField('Capture Seed', `<select name="captureId">${captureOptions}</select>`)}
                ${renderFormField('Links', '<textarea name="links" rows="3" placeholder="https://example.com\\nhttps://another-link"></textarea>', 'One link per line')}
                ${renderFormField('Assets', '<textarea name="assets" rows="3" placeholder="hero-image.png\\nlaunch-screenshot.png"></textarea>', 'One asset note per line')}
              </div>
            </details>
            <div class="inline-actions">
              <button type="submit">Create Event</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        detail?.event?.eventId
          ? 'Event detail ties together people, campaign strategy, and linked draft packages.'
          : commandPayload?.reviewDraft
            ? 'Natural-language event entry stays review-first until you confirm and save it.'
            : 'Events are the handoff point from notes into campaigns.'
      )}
    </div>
    ${renderPanel('Recent Notes', renderCaptureFeed(captures.slice(0, 4)), 'Recent notes stay nearby when they help with event drafting.')}
  `;
}

async function renderDraftsPage(page, requestUrl) {
  const selectedEventId = readOptionalString(requestUrl.searchParams.get('eventId'), '');
  const query = readOptionalString(requestUrl.searchParams.get('q'), '');
  const recentEventsRes = await fetchJsonSafe('/events?limit=12');
  const recentEvents = recentEventsRes.ok ? recentEventsRes.payload.events || [] : [];
  const queryEventsRes = query ? await fetchJsonSafe(`/events?query=${encodeURIComponent(query)}&limit=8`) : null;
  const queryEvents = queryEventsRes?.ok ? queryEventsRes.payload.results || queryEventsRes.payload.events || [] : [];
  const effectiveEventId = selectedEventId || queryEvents[0]?.eventId || recentEvents[0]?.eventId || '';
  const draftsRes = await fetchJsonSafe(`/drafts?limit=24${effectiveEventId ? `&eventId=${encodeURIComponent(effectiveEventId)}` : ''}`);
  const drafts = draftsRes.ok ? draftsRes.payload.drafts || [] : [];
  const selectedEvent =
    [...queryEvents, ...recentEvents].find((event) => event.eventId === effectiveEventId) || null;
  const datalistOptions = recentEvents
    .map((event) => `<option value="${escapeHtml(event.title)}"></option>`)
    .join('');

  return `
    ${renderHero(
      page,
      [renderMetric(String(recentEvents.length), 'recent events'), renderMetric(String(drafts.length), 'drafts visible')].join(''),
      `<div class="info-card"><strong>Simple draft mode</strong><p>One event, seven standard drafts. LinkedIn, X, and Instagram stay in English. Zhihu, Rednote, WeChat Moments, and WeChat Official Account stay in Chinese.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Event Picker',
        `
          <form class="query-form command-bar-form" method="GET" action="/drafts">
            ${renderFormField(
              'Event search',
              `<input name="q" list="draft-event-suggestions" type="text" value="${escapeHtml(query)}" placeholder="The Sam follow-up from Bristol, or last week’s meetup recap." />`,
              'Search naturally or type an exact event name.'
            )}
            <datalist id="draft-event-suggestions">${datalistOptions}</datalist>
            <div class="inline-actions">
              <button type="submit">Find Event</button>
              <a class="mini-link" href="/drafts">Reset</a>
            </div>
          </form>
          ${selectedEvent ? `<div class="info-callout"><strong>Selected event</strong><br />${escapeHtml(selectedEvent.title)}</div>` : ''}
          ${queryEvents.length ? renderEventCards(queryEvents.slice(0, 5), (event) => `/drafts?eventId=${encodeURIComponent(event.eventId)}`) : renderEventCards(recentEvents.slice(0, 5), (event) => `/drafts?eventId=${encodeURIComponent(event.eventId)}`)}
        `,
        'Type ahead naturally, or pick one of the recent events to open the standard draft set.'
      )}
      ${renderPanel(
        'Generate 7 Standard Drafts',
        `
          <form class="api-form" data-api-form="true" data-endpoint="/drafts/generate">
            <input type="hidden" name="eventId" value="${escapeHtml(effectiveEventId)}" />
            <input type="hidden" name="languages" value="platform-native" />
            <input type="hidden" name="platforms" value="linkedin" />
            <input type="hidden" name="platforms" value="x" />
            <input type="hidden" name="platforms" value="instagram" />
            <input type="hidden" name="platforms" value="zhihu" />
            <input type="hidden" name="platforms" value="xiaohongshu" />
            <input type="hidden" name="platforms" value="wechat_moments" />
            <input type="hidden" name="platforms" value="wechat_official" />
            <div class="info-callout">
              <strong>Standard output</strong><br />
              LinkedIn, X, and Instagram use English only.<br />
              Zhihu, Rednote, WeChat Moments, and WeChat Official Account use Chinese only.
            </div>
            ${selectedEvent ? `<div class="chip-row">${renderPill(selectedEvent.title, 'accent')}</div>` : renderEmptyState('Find or pick an event first.')}
            ${renderFormField('CTA', '<input name="cta" type="text" placeholder="Optional closing line if you want one." />')}
            <details class="draft-details">
              <summary>Advanced options</summary>
              <div class="draft-details-body">
                ${renderFormField('Angle', '<input name="angle" type="text" value="" placeholder="Optional angle override" />')}
                ${renderFormField('Tone', '<input name="tone" type="text" value="" placeholder="Optional tone override" />')}
                ${renderFormField('Audience', '<input name="audience" type="text" value="" placeholder="Optional audience override" />')}
              </div>
            </details>
            <div class="inline-actions">
              <button type="submit"${effectiveEventId ? '' : ' disabled'}>Generate 7 Drafts</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'The event picker scales with natural search, while the output stays one event at a time.'
      )}
    </div>
    ${renderPanel(
      effectiveEventId
        ? `Draft Library · ${escapeHtml(selectedEvent?.title || effectiveEventId)}`
        : 'Draft Library',
      renderDraftCards(drafts),
      'Each platform gets one main draft card. Extra publishing metadata is tucked into More options.'
    )}
  `;
}

async function renderQueuePage(page) {
  const [queueRes, runtimeRes] = await Promise.all([
    fetchJsonSafe('/queue/tasks?limit=24'),
    fetchJsonSafe('/settings/runtime'),
  ]);
  const queueTasks = queueRes.ok ? queueRes.payload.queueTasks || [] : [];
  const runtime = runtimeRes.ok ? runtimeRes.payload : {};
  const publishMode = runtime.publishMode || 'dry-run';
  const readyTasks = collapseQueueTasksForDisplay(queueTasks.filter((task) => task.status === 'queued'), 12);
  const manualTasks = collapseQueueTasksForDisplay(queueTasks.filter((task) => task.status === 'manual_step_needed'), 8);
  const doneTasks = collapseQueueTasksForDisplay(queueTasks.filter((task) => ['posted', 'failed'].includes(task.status)), 8);

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(readyTasks.length), 'ready'),
        renderMetric(String(manualTasks.length), 'manual step'),
        renderMetric(String(doneTasks.filter((task) => task.status === 'posted').length), 'posted'),
        renderMetric(String(runtime.ops?.queue?.blocked ?? 0), 'blocked product items'),
      ].join(''),
      `<div class="info-card"><strong>Queue posture</strong><p>${escapeHtml(
        `${formatHumanPublishMode(publishMode)} keeps the next handoff clear. Live publish still stays gated until you deliberately open it.`
      )}</p></div>`
    )}
    <div class="grid three-up">
      ${renderPanel('Ready', renderQueueCards(readyTasks, publishMode), 'These are the next packages ready for rehearsal or handoff.')}
      ${renderPanel('Manual Step', renderQueueCards(manualTasks, publishMode), 'These cards hold the handoff while you capture the real outcome.')}
      ${renderPanel('Done / Failed', renderQueueCards(doneTasks, publishMode), 'Closed items stay visible without crowding the live queue.')}
    </div>
  `;
}

function toneForHackathonStatus(status = '') {
  const normalized = readOptionalString(status, '').toLowerCase();
  if (['ready', 'configured', 'captured', 'live'].includes(normalized)) return 'good';
  if (['partial', 'pending', 'fallback', 'warn'].includes(normalized)) return 'warn';
  return 'soft';
}

function renderHackathonBountyCards(bounties = [], selectedId = '', { publicMode = false } = {}) {
  if (!Array.isArray(bounties) || !bounties.length) {
    return renderEmptyState('No bounty overview is available right now.');
  }

  const ordered = [
    ...bounties.filter((bounty) => bounty.id === selectedId),
    ...bounties.filter((bounty) => bounty.id !== selectedId),
  ];

  return `<div class="grid two-up">${ordered
    .map((bounty) => {
      const recordRoute = readOptionalString(bounty.localRecordRoute || bounty.recommendedRoute || bounty.route, '/hackathon');
      const proofCount = Number(bounty.proofCount || 0);
      const sectionHref = `#bounty-${encodeURIComponent(bounty.id || '')}`;
      const routeHref = publicMode ? buildPublicPageHref(recordRoute) : recordRoute;
      const proofHref = readOptionalString(bounty.proofJsonUrl, publicMode ? buildPublicProofDataHref(bounty.id || '') : `/proofs?bounty=${encodeURIComponent(bounty.id || '')}`);
      const proofsHref = publicMode ? buildPublicProofDataHref(bounty.id || '') : `/proofs?bounty=${encodeURIComponent(bounty.id || '')}`;
      return `
        <article id="bounty-card-${escapeHtml(bounty.id || '')}" class="stack-card ${bounty.id === selectedId ? 'hackathon-card-selected' : ''}">
          <div class="stack-meta">
            <strong>${escapeHtml(bounty.label || bounty.id)}</strong>
            ${renderPill(readOptionalString(bounty.status, 'ready'), toneForHackathonStatus(bounty.status))}
          </div>
          <p>${escapeHtml(truncate(bounty.hook || bounty.uniqueAngle || bounty.summary || '', 180))}</p>
          <div class="chip-row">
            ${bounty.prize ? renderPill(bounty.prize, 'soft') : ''}
            ${bounty.sponsor ? renderPill(bounty.sponsor, 'soft') : ''}
            ${renderPill(`${proofCount} proof${proofCount === 1 ? '' : 's'}`, proofCount ? 'accent' : 'soft')}
            ${readOptionalBoolean(bounty.live, false) ? renderPill('live integrated', 'good') : ''}
            ${bounty.model ? renderPill(bounty.model, 'soft') : ''}
          </div>
          <p>${escapeHtml(truncate(bounty.uniqueAngle || bounty.fit || '', 160))}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(sectionHref)}">Open section</a>
            ${routeHref ? `<a class="mini-link" href="${escapeHtml(routeHref)}">${publicMode ? 'Aux page' : 'Record route'}</a>` : ''}
            <a class="mini-link" href="${escapeHtml(publicMode ? proofHref : proofsHref)}">${publicMode ? 'Proof JSON' : 'View proofs'}</a>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderHackathonProofCards(proofs = [], { publicMode = false } = {}) {
  if (!Array.isArray(proofs) || !proofs.length) {
    return renderEmptyState('Proof cards will appear here when the API hub is available.');
  }

  return `<div class="grid two-up">${proofs
    .map(
      (proof) => {
        const routeHref = publicMode ? buildPublicPageHref(proof.route || '') : readOptionalString(proof.route, '');
        const fallbackProofHref = publicMode ? buildPublicProofDataHref((proof.bounties || [])[0] || '') : '';
        return `
        <article class="stack-card compact-card">
          <div class="stack-meta">
            <strong>${escapeHtml(proof.title || proof.id || 'Proof')}</strong>
            ${renderPill(readOptionalString(proof.kind, 'proof'), 'soft')}
            ${renderPill(readOptionalString(proof.status, 'ready'), toneForHackathonStatus(proof.status))}
          </div>
          <p>${escapeHtml(truncate(proof.summary || '', 180))}</p>
          <div class="chip-row">
            ${(proof.bounties || []).slice(0, 3).map((bountyId) => renderPill(bountyId, 'soft')).join('')}
            ${proof.provider ? renderPill(proof.provider, 'soft') : ''}
            ${proof.model ? renderPill(proof.model, 'soft') : ''}
            ${proof.channel ? renderPill(proof.channel, 'soft') : ''}
            ${proof.transport ? renderPill(proof.transport, 'soft') : ''}
            ${typeof proof.openSourceModel === 'boolean' ? renderPill(`openSourceModel=${proof.openSourceModel}`, proof.openSourceModel ? 'good' : 'soft') : ''}
            ${readOptionalBoolean(proof.live, false) ? renderPill('live', 'good') : ''}
            ${readOptionalBoolean(proof.fallbackUsed, false) ? renderPill('fallbackUsed=true', 'warn') : renderPill('fallbackUsed=false', 'good')}
          </div>
          <div class="inline-actions">
            ${routeHref ? `<a class="mini-link" href="${escapeHtml(routeHref)}">${publicMode ? 'Open page' : 'Open'}</a>` : ''}
            ${(proof.proofJsonUrl || (!routeHref && fallbackProofHref)) ? `<a class="mini-link" href="${escapeHtml(readOptionalString(proof.proofJsonUrl, fallbackProofHref))}">Proof JSON</a>` : ''}
            ${proof.deckAppendixSlide ? `<small>${escapeHtml(proof.deckAppendixSlide)}</small>` : ''}
            ${proof.source ? `<small>${escapeHtml(proof.source)}</small>` : ''}
          </div>
        </article>
      `;
      }
    )
    .join('')}</div>`;
}

function renderHackathonBountySections(bounties = [], selectedId = '', { publicMode = false } = {}) {
  if (!Array.isArray(bounties) || !bounties.length) {
    return renderEmptyState('No bounty detail sections are available right now.');
  }

  const ordered = [
    ...bounties.filter((bounty) => bounty.id === selectedId),
    ...bounties.filter((bounty) => bounty.id !== selectedId),
  ];

  return `<div class="stack">${ordered
    .map((bounty) => {
      const recordRoute = readOptionalString(bounty.localRecordRoute || bounty.route, '/hackathon');
      const publicAnchor = readOptionalString(bounty.publicAnchor, buildPublicPageHref(`/hackathon?bounty=${bounty.id}`) || '/hackathon/');
      const proofJsonUrl = readOptionalString(bounty.proofJsonUrl, buildPublicProofDataHref(bounty.id || ''));
      const auxiliaryPage = publicMode ? buildPublicPageHref(recordRoute) : recordRoute;
      const proofCount = Number(bounty.proofCount || 0);
      return `
        <section id="bounty-${escapeHtml(bounty.id || '')}" class="stack-card ${bounty.id === selectedId ? 'hackathon-card-selected' : ''}">
          <div class="stack-meta">
            <strong>${escapeHtml(bounty.label || bounty.id)}</strong>
            ${renderPill(readOptionalString(bounty.status, 'ready'), toneForHackathonStatus(bounty.status))}
            ${readOptionalBoolean(bounty.live, false) ? renderPill('live integrated', 'good') : renderPill('live pending', 'warn')}
          </div>
          <p>${escapeHtml(bounty.uniqueAngle || bounty.hook || '')}</p>
          <div class="chip-row">
            ${bounty.prize ? renderPill(bounty.prize, 'soft') : ''}
            ${bounty.sponsor ? renderPill(bounty.sponsor, 'soft') : ''}
            ${bounty.partnerLabel ? renderPill(bounty.partnerLabel, 'soft') : ''}
            ${bounty.model ? renderPill(bounty.model, 'soft') : ''}
            ${renderPill(`${proofCount} proof${proofCount === 1 ? '' : 's'}`, proofCount ? 'accent' : 'soft')}
          </div>
          <div class="grid two-up">
            ${renderPanel('Problem Framing', `<p>${escapeHtml(bounty.problem || 'Problem framing unavailable.')}</p>`, 'Use this framing in the first 40-60 seconds of the bounty video.')}
            ${renderPanel('Why SocialOS Fits', `<p>${escapeHtml(bounty.fit || bounty.uniqueAngle || '')}</p>`, 'Keep the product narrative fixed and only change the bounty lens.')}
          </div>
          <div class="grid two-up">
            ${renderPanel(
              'Partner / API / Infrastructure',
              `
                <div class="stack">
                  <article class="stack-card compact-card">
                    <div class="stack-meta"><strong>Partner</strong>${bounty.partnerLabel ? renderPill(bounty.partnerLabel, 'soft') : ''}${bounty.sponsor ? renderPill(bounty.sponsor, 'soft') : ''}</div>
                    <p>${escapeHtml(bounty.integrationSummary || 'Integration summary unavailable.')}</p>
                  </article>
                  <article class="stack-card compact-card">
                    <div class="stack-meta"><strong>Technical Implementation</strong>${bounty.apiSurface ? renderPill(bounty.apiSurface, 'accent') : ''}</div>
                    <p>${escapeHtml(bounty.technicalImplementation || bounty.infrastructure || '')}</p>
                  </article>
                  ${
                    Array.isArray(bounty.eligibilityChecklist) && bounty.eligibilityChecklist.length
                      ? `<article class="stack-card compact-card">
                          <div class="stack-meta"><strong>Track Checklist</strong>${renderPill('official requirements', 'soft')}</div>
                          <ul class="compact-list">${bounty.eligibilityChecklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                        </article>`
                      : ''
                  }
                </div>
              `,
              'This block answers the judge question “how exactly did you integrate the partner or infrastructure?”'
            )}
            ${renderPanel(
              'Live Proof Summary',
              `
                <div class="stack">
                  <article class="stack-card compact-card">
                    <div class="stack-meta">
                      <strong>Current proof posture</strong>
                      ${readOptionalBoolean(bounty.live, false) ? renderPill('live=true', 'good') : renderPill('live=false', 'warn')}
                      ${readOptionalBoolean(bounty.fallbackUsed, false) ? renderPill('fallbackUsed=true', 'warn') : renderPill('fallbackUsed=false', 'good')}
                    </div>
                    <p>${escapeHtml(bounty.liveProofSummary || 'Live proof summary unavailable.')}</p>
                  </article>
                  <article class="stack-card compact-card">
                    <div class="stack-meta">
                      <strong>Proof metadata</strong>
                      ${bounty.provider ? renderPill(bounty.provider, 'soft') : ''}
                      ${bounty.model ? renderPill(bounty.model, 'soft') : ''}
                    </div>
                    <p>${escapeHtml(bounty.capturedAt ? `Captured at ${bounty.capturedAt}.` : 'Use the proof JSON and public anchor below as the judge-verifiable evidence package.')}</p>
                  </article>
                </div>
              `,
              'This block should match the live provider story in the README, deck appendix, and video.'
            )}
          </div>
          <div class="grid two-up">
            ${renderPanel(
              'Recording Route',
              `
                <div class="stack">
                  <article class="stack-card compact-card">
                    <div class="stack-meta"><strong>Local recording route</strong>${renderPill(recordRoute, 'soft')}</div>
                    <p>${escapeHtml((bounty.demoSteps || []).join(' → ') || 'Record the fixed product loop first, then show the bounty-specific proof.')}</p>
                  </article>
                  ${auxiliaryPage ? `<div class="inline-actions"><a class="mini-link" href="${escapeHtml(auxiliaryPage)}">${publicMode ? 'Auxiliary public page' : 'Open recording route'}</a></div>` : ''}
                </div>
              `,
              'Each bounty video is independent, but the interaction route stays fixed.'
            )}
            ${renderPanel(
              'Submission Assets',
              `
                <div class="stack">
                  <article class="stack-card compact-card">
                    <div class="stack-meta"><strong>Public hub anchor</strong>${renderPill(bounty.deckAppendixSlide || '', 'soft')}</div>
                    <p><a class="mini-link" href="${escapeHtml(publicAnchor)}">${escapeHtml(publicAnchor)}</a></p>
                  </article>
                  <article class="stack-card compact-card">
                    <div class="stack-meta"><strong>Proof JSON</strong>${renderPill('judge-verifiable', 'accent')}</div>
                    <p><a class="mini-link" href="${escapeHtml(proofJsonUrl)}">${escapeHtml(proofJsonUrl)}</a></p>
                  </article>
                </div>
              `,
              escapeHtml(bounty.judgeClosing || 'Close the video by pointing judges back to the public hub and proof JSON.')
            )}
          </div>
        </section>
      `;
    })
    .join('')}</div>`;
}

function renderHackathonShotGallery() {
  const shots = [
    {
      title: 'Workspace',
      caption: 'Judge-friendly capture and action loop.',
      image: readDataUriCached(EVIDENCE_STEP_ONE_PATH),
    },
    {
      title: 'Contacts',
      caption: 'Persistent identity and people memory.',
      image: readDataUriCached(EVIDENCE_STEP_TWO_CONTACTS_PATH),
    },
    {
      title: 'Drafts',
      caption: 'Multilingual, platform-native output.',
      image: readDataUriCached(EVIDENCE_STEP_FOUR_PATH),
    },
    {
      title: 'Queue',
      caption: 'Trust-first publish handoff and traceability.',
      image: readDataUriCached(EVIDENCE_STEP_EIGHT_PATH),
    },
    {
      title: 'Bounty Hub',
      caption: 'The canonical public page that lists all five tracks and their proof links.',
      image: readDataUriCached(EVIDENCE_HACKATHON_HUB_PATH),
    },
    {
      title: 'Buddy Public Proof',
      caption: 'The Human for Claw public proof surface stays English-only and visibly constrained.',
      image: readDataUriCached(EVIDENCE_BUDDY_PUBLIC_PATH),
    },
    {
      title: 'AI Agents for Good Channel Proof',
      caption: 'Telegram is the explicit multi-channel proof for volunteer follow-through alongside the FLock SDG story.',
      image: readDataUriCached(EVIDENCE_AI_GOOD_TELEGRAM_PATH),
    },
  ];

  return `<div class="grid two-up">${shots
    .map(
      (shot) => `
        <article class="stack-card compact-card">
          <div class="stack-meta">
            <strong>${escapeHtml(shot.title)}</strong>
            ${renderPill('evidence', 'accent')}
          </div>
          ${
            shot.image
              ? `<img class="hackathon-shot" src="${shot.image}" alt="${escapeHtml(shot.title)} screenshot" />`
              : `<div class="empty-state"><p>Screenshot unavailable</p></div>`
          }
          <p>${escapeHtml(shot.caption)}</p>
        </article>
      `
    )
    .join('')}</div>`;
}

async function renderDemoPage(page, requestUrl) {
  const publicMode = isPublicPageMode(requestUrl);
  const [bootstrapRes, queueRes, agentsRes, proofsRes] = await Promise.all([
    fetchJsonSafe('/workspace/bootstrap'),
    fetchJsonSafe('/queue/tasks?limit=8'),
    fetchJsonSafe('/studio/agents'),
    publicMode ? Promise.resolve({ ok: true, payload: readHackathonProofEvidence('claw-for-human') }) : fetchJsonSafe('/proofs?bounty=claw-for-human&limit=4'),
  ]);

  const bootstrap = bootstrapRes.ok
    ? bootstrapRes.payload
    : { recentContacts: [], recentEvents: [], recentDrafts: [], queuePreview: [], latestMirror: null };
  const queueTasks = queueRes.ok ? queueRes.payload.queueTasks || [] : [];
  const agents = agentsRes.ok ? agentsRes.payload.cluster || { agents: [] } : { agents: [] };
  const proofs = proofsRes.ok ? proofsRes.payload.proofs || [] : [];
  const judgeFlow = `
    <div class="stack">
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>1. Workspace</strong>${renderPill('start here', 'accent')}</div>
        <p>Show one natural note or voice/image capture entering the system.</p>
        ${
          publicMode
            ? '<div class="inline-actions"><small>Recorded locally in the video from the main Workspace surface.</small></div>'
            : '<div class="inline-actions"><a class="mini-link" href="/quick-capture">Open Workspace</a></div>'
        }
      </article>
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>2. Contacts + Logbook</strong>${renderPill('memory', 'soft')}</div>
        <p>Open the linked person and event to prove the note became reusable relationship context.</p>
        ${
          publicMode
            ? '<div class="inline-actions"><small>Shown locally as the relationship-memory step in the recording.</small></div>'
            : `
              <div class="inline-actions">
                <a class="mini-link" href="/people">Contacts</a>
                <a class="mini-link" href="/events">Logbook</a>
              </div>
            `
        }
      </article>
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>3. Drafts + Queue</strong>${renderPill('handoff', 'soft')}</div>
        <p>Generate platform-native drafts and show the dry-run approval lane.</p>
        ${
          publicMode
            ? '<div class="inline-actions"><small>Shown locally as the trust-first handoff step in the recording.</small></div>'
            : `
              <div class="inline-actions">
                <a class="mini-link" href="/drafts">Drafts</a>
                <a class="mini-link" href="/queue">Queue</a>
              </div>
            `
        }
      </article>
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>4. Mirror + Trace</strong>${renderPill('close the loop', 'soft')}</div>
        <p>Finish with evidence-backed reflection and agent/runtime proof.</p>
        ${
          publicMode
            ? '<div class="inline-actions"><small>Shown locally with runtime trace, then mirrored here as proof cards.</small></div>'
            : `
              <div class="inline-actions">
                <a class="mini-link" href="/self-mirror">Mirror</a>
                <a class="mini-link" href="/studio?panel=agents">Studio Agents</a>
              </div>
            `
        }
      </article>
    </div>
  `;

  return `
    ${renderHero(
      page,
      [
        renderMetric(String((bootstrap.recentContacts || []).length), 'contacts'),
        renderMetric(String((bootstrap.recentEvents || []).length), 'events'),
        renderMetric(String((bootstrap.recentDrafts || []).length), 'drafts'),
        renderMetric(String((queueTasks || []).length), 'queue items'),
      ].join(''),
      `<div class="info-card"><strong>Claw for Human recording route</strong><p>Use this route for the shared product loop and the dedicated Claw for Human video. The canonical public submission page still lives at /hackathon/#bounty-claw-for-human.</p></div>`
    )}
    ${publicMode ? renderPublicProofNotice('Auxiliary public proof page', 'This page supports Claw for Human, but the canonical public submission page is the single bounty hub at /hackathon/#bounty-claw-for-human.') : ''}
    <div class="grid two-up">
      ${renderPanel('Judge Flow', judgeFlow, publicMode ? 'This public page mirrors the exact recording sequence without exposing local-only controls.' : 'The sequence stays fixed so the 5-10 minute video remains easy to rehearse.')}
      ${renderPanel('OpenClaw Trace Snapshot', renderAgentLaneSnapshot(agents), 'These lanes are the backend proof for Claw for Human and Animoca.')}
    </div>
    ${
      publicMode
        ? ''
        : `
          <div class="grid two-up">
            ${renderPanel('Recent People Memory', renderPeopleCards((bootstrap.recentContacts || []).slice(0, 4)), 'Start from a person to show this is more than a generic chat response.')}
            ${renderPanel('Recent Drafts and Queue', renderAskDraftCards((bootstrap.recentDrafts || []).slice(0, 4)) + renderQueueCards((queueTasks || []).slice(0, 4), 'dry-run'), 'The publish surface stays visible, but human approval remains in control.')}
          </div>
        `
    }
    ${renderPanel('Proof Gallery', renderHackathonShotGallery(), 'Use these screenshots in README, deck appendix, and the demo video cut-downs.')}
    ${renderPanel('Claw for Human Proofs', renderHackathonProofCards(proofs, { publicMode }), publicMode ? 'Open the page links or JSON snapshots to review the public proof surface.' : 'These are the reusable proof cards tied to the most judge-facing submission.')}
  `;
}

async function renderHackathonPage(page, requestUrl) {
  const publicMode = isPublicPageMode(requestUrl);
  const requestedBounty = readOptionalString(requestUrl.searchParams.get('bounty'), '');
  const normalizedBounty = HACKATHON_PAGE_FALLBACK.find((item) => item.id === requestedBounty) ? requestedBounty : '';
  const overviewRes = publicMode
    ? { ok: true, payload: readHackathonOverviewEvidence() }
    : await fetchJsonSafe('/hackathon/overview');
  const proofsRes = publicMode
    ? { ok: true, payload: readHackathonProofEvidence(normalizedBounty) }
    : await fetchJsonSafe(`/proofs?limit=8${normalizedBounty ? `&bounty=${encodeURIComponent(normalizedBounty)}` : ''}`);

  const overview = overviewRes.ok
    ? overviewRes.payload
    : {
        integrations: [],
        bounties: HACKATHON_PAGE_FALLBACK,
        routes: [
          { id: 'demo', label: 'Judge Demo', path: '/demo' },
          { id: 'hackathon', label: 'Hackathon Hub', path: '/hackathon' },
          { id: 'buddy', label: 'Buddy Mode', path: '/buddy' },
          { id: 'deck', label: 'Pitch Deck', path: '/deck' },
        ],
        proofsPreview: [],
      };
  const bounties = Array.isArray(overview.bounties) && overview.bounties.length ? overview.bounties : HACKATHON_PAGE_FALLBACK;
  const proofs = proofsRes.ok ? proofsRes.payload.proofs || [] : overview.proofsPreview || [];
  const integrations = Array.isArray(overview.integrations) ? overview.integrations : [];
  const heroMetrics = [
    renderMetric(String(bounties.length), 'active bounties'),
    renderMetric(String(integrations.filter((item) => item.live).length), 'live integrations'),
    renderMetric(String(proofs.length), 'proof cards'),
    renderMetric(readOptionalString(overview.mode, 'repo-native'), 'mode'),
  ].join('');
  const publicNotice = publicMode
    ? renderPublicProofNotice(
        'Canonical public bounty hub',
        'This page is the judge-facing proof surface. /demo/ and /buddy/ remain auxiliary proof pages, while the interactive product stays localhost-only in the recorded videos.'
      )
    : '';
  const integrationMatrixHtml = integrations.length
    ? `<div class="stack">${integrations
        .map(
          (integration) => `
            <article class="stack-card compact-card">
              <div class="stack-meta">
                <strong>${escapeHtml(integration.label || integration.id)}</strong>
                ${renderPill(readOptionalString(integration.status, 'ready'), toneForHackathonStatus(integration.status))}
                ${readOptionalBoolean(integration.live, false) ? renderPill('live', 'good') : ''}
              </div>
              <p>${escapeHtml(truncate(integration.summary || '', 180))}</p>
              <div class="inline-actions">
                ${integration.route ? `<a class="mini-link" href="${escapeHtml(integration.route)}">Open</a>` : ''}
                ${integration.model ? renderPill(integration.model, 'soft') : ''}
              </div>
            </article>
          `
        )
        .join('')}</div>`
    : renderEmptyState('Integration status is unavailable right now.');
  const submissionPackHtml = `
    <div class="stack">
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>1. Pitch / Demo Video</strong>${renderPill('5 videos', 'accent')}</div>
        <p>Record five independent 5-8 minute videos. Keep the SocialOS product backbone fixed, then swap the bounty-specific framing, integration, and live demo section.</p>
      </article>
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>2. Public GitHub Repo</strong>${renderPill('README', 'soft')}</div>
        <p>Point judges to the shared README, this canonical /hackathon page, and the matching proof JSON for structured evidence.</p>
      </article>
      <article class="stack-card compact-card">
        <div class="stack-meta"><strong>3. Pitch Deck</strong>${renderPill('appendix', 'soft')}</div>
        <p>The deck stays shared at the top, then adds one appendix slide per bounty in the same order shown on this page.</p>
      </article>
    </div>
  `;
  const bountySectionsDescription = publicMode
    ? 'Each section is a complete judge-facing bounty brief with problem, fit, integration, live proof, recording route, and submission assets.'
    : 'Record from these sections one bounty at a time, then finish each video by opening the matching public anchor and proof JSON.';
  const proofCardsDescription = publicMode
    ? 'Use the JSON links and auxiliary pages only as supporting evidence. The canonical public entry remains this page.'
    : normalizedBounty
      ? `Filtered for ${normalizedBounty}.`
      : 'Use ?bounty=<id> for a tighter proof review while recording.';

  return `
    ${renderHero(
      page,
      heroMetrics,
      `<div class="info-card"><strong>Canonical bounty hub</strong><p>This is the single public submission page for all five DoraHacks bounties. SocialOS stays one product, while each bounty section exposes its own framing, integration, live proof, recording route, and deck appendix reference.</p></div>`
    )}
    ${publicNotice}
    ${renderPanel(
      'Watch Final Videos',
      renderWatchVideoCards({ currentBountyId: normalizedBounty, includeHostedLinks: false }),
      publicMode
        ? 'Start here if you want the recordings first. Each card opens the stable /videos/... watch page, then links back into the matching proof surface.'
        : 'Use these direct watch pages while checking the final recording pack or confirming the submitted URLs before publishing.'
    )}
    ${renderPanel('Bounty Map', renderHackathonBountyCards(bounties, normalizedBounty, { publicMode }), publicMode ? 'Start here, jump to the matching bounty section, then open the linked proof JSON if a judge wants structured evidence.' : 'Use this page as the control room while recording each independent bounty video.')}
    <div class="grid two-up">
      ${renderPanel('Run SocialOS Yourself', renderPublicReuseLinks(), 'Use the public proof site for review, then jump to GitHub if you want to clone the local-first product or wire up optional providers.')}
      ${renderPanel('Live Partner / API Matrix', integrationMatrixHtml, 'This is the live integration matrix for the partner APIs and shared product infrastructure that power the five bounty tracks.')}
      ${renderPanel('Submission Pack', submissionPackHtml, 'The repo, deck, public hub, and video pack must tell the same story without drift in wording or proof posture.')}
    </div>
    ${renderPanel('Bounty Sections', renderHackathonBountySections(bounties, normalizedBounty, { publicMode }), bountySectionsDescription)}
    ${renderPanel('Proof Cards', renderHackathonProofCards(proofs, { publicMode }), proofCardsDescription)}
  `;
}

async function renderBuddyPage(page, requestUrl) {
  const publicMode = isPublicPageMode(requestUrl);
  const [bootstrapRes, runtimeRes, proofsRes] = await Promise.all([
    fetchJsonSafe('/workspace/bootstrap'),
    fetchJsonSafe('/settings/runtime'),
    publicMode ? Promise.resolve({ ok: true, payload: readHackathonProofEvidence('human-for-claw') }) : fetchJsonSafe('/proofs?bounty=human-for-claw&limit=6'),
  ]);
  const bootstrap = bootstrapRes.ok
    ? bootstrapRes.payload
    : { recentContacts: [], latestMirror: null };
  const runtime = runtimeRes.ok ? runtimeRes.payload : { publishMode: 'dry-run' };
  const proofs = proofsRes.ok ? proofsRes.payload.proofs || [] : [];
  const buddyTasks = [
    {
      title: 'Meet Someone New',
      body: 'Write one simple note about someone new, and let SocialOS turn it into a contact you can remember later.',
      href: '/quick-capture?prefill=I%20met%20someone%20new%20today.%20They%20love%20drawing%2C%20and%20I%20want%20to%20remember%20their%20name%20and%20what%20we%20talked%20about.',
    },
    {
      title: 'Remember People and Context',
      body: 'Capture where you met, what you talked about, and one kind follow-up you want to do next.',
      href: '/quick-capture?prefill=I%20met%20a%20new%20friend%20at%20the%20library%20club%20and%20we%20both%20liked%20building%20games.',
    },
    {
      title: 'Write a Thank-you or Follow-up',
      body: 'Turn one event or friendship moment into a thank-you message or a warm follow-up note.',
      href: '/quick-capture?prefill=Help%20me%20write%20a%20warm%20thank-you%20note%20for%20the%20friend%20who%20spent%20time%20with%20me%20at%20today%27s%20activity.',
    },
    {
      title: 'Calm Reflection',
      body: 'Use Mirror to notice what made you feel good, tired, brave, or nervous after a day with people.',
      href: '/self-mirror',
    },
  ];

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(buddyTasks.length), 'safe tasks'),
        renderMetric(String((bootstrap.recentContacts || []).length), 'recent people'),
        renderMetric(runtime.publishMode === 'dry-run' ? 'safe' : 'warn', 'publish mode'),
      ].join(''),
      `<div class="info-card"><strong>Friendship & Gratitude Coach</strong><p>Buddy mode is the Human for Claw angle: simpler language, only kind tasks, and no pressure to publish or configure anything complicated.</p></div>`
    )}
    ${publicMode ? renderPublicProofNotice('Auxiliary public Buddy page', 'Buddy mode is the Human for Claw recording route, but the canonical public submission page remains /hackathon/#bounty-human-for-claw.') : ''}
    <div class="grid two-up">
      ${renderPanel(
        'Choose a Kind Task',
        `<div class="stack">${buddyTasks
          .map(
            (task) => `
              <article class="stack-card compact-card">
                <div class="stack-meta">
                  <strong>${escapeHtml(task.title)}</strong>
                  ${renderPill('Buddy-safe', 'good')}
                </div>
                <p>${escapeHtml(task.body)}</p>
                ${
                  publicMode
                    ? '<div class="inline-actions"><small>Recorded locally during the demo.</small></div>'
                    : `<div class="inline-actions"><a class="mini-link" href="${escapeHtml(task.href)}">Start</a></div>`
                }
              </article>
            `
          )
          .join('')}</div>`,
        'Buddy keeps the surface narrow on purpose so children, families, or first-time users are not overwhelmed.'
      )}
      ${renderPanel(
        'Safety Rails',
        `
          <div class="stack">
            <article class="stack-card compact-card">
              <div class="stack-meta"><strong>No open publish lane</strong>${renderPill('dry-run', 'soft')}</div>
              <p>Buddy mode never asks the user to approve a live post or manage platform credentials.</p>
            </article>
            <article class="stack-card compact-card">
              <div class="stack-meta"><strong>Simple language only</strong>${renderPill('low cognitive load', 'soft')}</div>
              <p>The tasks are framed around friendship, gratitude, remembering people, and calm reflection.</p>
            </article>
            <article class="stack-card compact-card">
              <div class="stack-meta"><strong>Trust-first defaults</strong>${renderPill('loopback-only', 'accent')}</div>
              <p>The product stays local-first and explainable so an adult can review what happened and why.</p>
            </article>
          </div>
        `,
        'This is the proof frame for Human for Claw: visible boundaries, not just a cheerful skin.'
      )}
    </div>
    ${
      publicMode
        ? ''
        : renderPanel('People You Already Care About', renderPeopleCards((bootstrap.recentContacts || []).slice(0, 4)), 'Buddy still reuses the same real relationship memory under the hood.')
    }
    ${renderPanel('Human for Claw Proofs', renderHackathonProofCards(proofs, { publicMode }), publicMode ? 'These proof cards are safe to share publicly and map directly to the Buddy-mode story.' : 'Use these proof cards when you want to tighten the Human for Claw story for a judge.')}
  `;
}

function renderMirrorInsightCards(mirror) {
  if (!mirror) return renderEmptyState('No mirror generated yet.');
  const themes = Array.isArray(mirror.themes) ? mirror.themes : [];
  const conclusions = Array.isArray(mirror.conclusions) ? mirror.conclusions : [];
  return `
    <div class="stack">
      <article class="stack-card">
        <div class="stack-meta">
          <strong>${escapeHtml(mirror.cadence === 'daily' ? 'Daily mirror' : 'Weekly mirror')}</strong>
          <span>${escapeHtml(formatDateTime(mirror.createdAt))}</span>
        </div>
        <p>${escapeHtml(mirror.summaryText || mirror.content || 'No summary yet.')}</p>
        ${themes.length ? `<div class="chip-row">${themes.slice(0, 4).map((item) => renderPill(`${item.theme} (${item.count})`, 'soft')).join('')}</div>` : ''}
      </article>
      <div class="grid two-up">
        ${renderPanel(
          'Energizers',
          (mirror.energizers || []).length
            ? `<ul class="compact-list">${(mirror.energizers || []).slice(0, 4).map((row) => `<li>${escapeHtml(row.snippet || '')}</li>`).join('')}</ul>`
            : renderEmptyState('No energizers yet.')
        )}
        ${renderPanel(
          'Drainers',
          (mirror.drainers || []).length
            ? `<ul class="compact-list">${(mirror.drainers || []).slice(0, 4).map((row) => `<li>${escapeHtml(row.snippet || '')}</li>`).join('')}</ul>`
            : renderEmptyState('No drainers yet.')
        )}
      </div>
      ${renderPanel(
        'Evidence-backed reflections',
        conclusions.length
          ? `<div class="stack">${conclusions
              .map(
                (conclusion) => `
                  <details class="detail-card">
                    <summary>${escapeHtml(conclusion.title || 'Reflection')}</summary>
                    <p>${escapeHtml(conclusion.summary || '')}</p>
                    ${renderEvidenceList(conclusion.evidence?.evidence || [])}
                  </details>
                `
              )
              .join('')}</div>`
          : renderEmptyState('No reflection cards yet.')
      )}
    </div>
  `;
}

function renderMirrorCadenceTabs(activeCadence) {
  const tabs = [
    { id: 'daily', label: 'Daily Mirror' },
    { id: 'weekly', label: 'Weekly Mirror' },
  ];
  return `<div class="workspace-rail-tabs">${tabs
    .map((tab) => {
      const active = tab.id === activeCadence ? 'workspace-rail-tab active' : 'workspace-rail-tab';
      return `<a class="${active}" href="/self-mirror?cadence=${tab.id}">${tab.label}</a>`;
    })
    .join('')}</div>`;
}

async function renderSelfMirrorPage(page, requestUrl) {
  const cadence = readOptionalString(requestUrl.searchParams.get('cadence'), 'daily') || 'daily';
  const mirrorRes = await fetchJsonSafe(`/self-mirror?cadence=${encodeURIComponent(cadence)}`);
  const payload = mirrorRes.ok ? mirrorRes.payload : { latestMirror: null, latestDailyMirror: null, latestWeeklyMirror: null, checkins: [] };
  const activeMirror =
    cadence === 'weekly'
      ? payload.latestWeeklyMirror || payload.latestMirror
      : payload.latestDailyMirror || payload.latestMirror;

  return `
    ${renderHero(
      page,
      [
        renderMetric(String((payload.checkins || []).length), 'recent check-ins'),
        renderMetric(payload.latestDailyMirror ? 'ready' : 'pending', 'daily'),
        renderMetric(payload.latestWeeklyMirror ? 'ready' : 'pending', 'weekly'),
      ].join(''),
      `<div class="info-card"><strong>Mirror</strong><p>Mirror helps you close the loop on what happened, how it felt, and what pattern is emerging. It stays grounded in evidence instead of abstract labels.</p></div>`
    )}
    ${renderMirrorCadenceTabs(cadence)}
    <div class="grid two-up">
      ${renderPanel(
        cadence === 'weekly' ? 'Weekly synthesis' : 'Daily reflection',
        renderMirrorInsightCards(activeMirror),
        cadence === 'weekly'
          ? 'Weekly Mirror distills the last seven days into the clearest patterns and next experiments.'
          : 'Daily Mirror closes the loop on what happened today and what it meant.'
      )}
      ${renderPanel(
        'How to read it',
        `
          <div class="stack">
            <article class="stack-card compact-card">
              <div class="stack-meta">
                <strong>${escapeHtml(cadence === 'weekly' ? 'Weekly view' : 'Daily view')}</strong>
                ${renderPill(cadence === 'weekly' ? 'pattern' : 'today', 'soft')}
              </div>
              <p>${escapeHtml(
                cadence === 'weekly'
                  ? 'Open the weekly mirror when you want to see what kept repeating and which next experiment is worth trying.'
                  : 'Open the daily mirror when you want one grounded read on today’s people, events, and self-signals.'
              )}</p>
            </article>
            <article class="stack-card compact-card">
              <div class="stack-meta">
                <strong>Evidence first</strong>
                ${renderPill('supporting cards', 'soft')}
              </div>
              <p>Every reflection can open the notes and signals behind it, so the mirror stays explainable instead of vague.</p>
            </article>
          </div>
        `,
        'Read the reflection first. Refresh only when you want a newer pass.'
      )}
    </div>
    ${renderPanel(
      'Refresh mirror',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/self-mirror/generate">
              <input type="hidden" name="cadence" value="daily" />
              <div class="inline-actions">
                <button type="submit">Generate Daily Mirror</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/self-mirror/generate">
              <input type="hidden" name="cadence" value="weekly" />
              <div class="inline-actions">
                <button type="submit">Generate Weekly Mirror</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Use this only when you want a newer pass. The reflection should stay the main thing to read.'
      )}
    ${renderPanel('Recent Check-ins', renderCheckinCards((payload.checkins || []).slice(0, 8)), 'These are the newest self signals feeding the mirror loop.')}
  `;
}

async function renderDevDigestPage(page) {
  const [statusRes, runsRes, blockedRes, digestRes] = await Promise.all([
    fetchJsonSafe('/ops/status'),
    fetchJsonSafe('/ops/runs?limit=8'),
    fetchJsonSafe('/ops/blocked'),
    fetchJsonSafe('/dev-digest?limit=8'),
  ]);

  const status = statusRes.ok ? statusRes.payload : {};
  const runs = runsRes.ok ? runsRes.payload.runs || [] : [];
  const blockedStatusHead = Array.isArray(status.blockedHead) ? status.blockedHead : [];
  const blockedFallback = blockedRes.ok ? blockedRes.payload.blockedTasks || [] : [];
  const blocked = normalizeBlockedItems(blockedStatusHead, blockedFallback);
  const digests = digestRes.ok ? digestRes.payload.digests || [] : [];
  const latestRun = status.latestRun || runs[0] || null;

  return `
    ${renderHero(
      page,
      [
        renderMetric(readOptionalString(status.mode, 'unknown'), 'mode'),
        renderMetric(String(status.queue?.blocked ?? 0), 'blocked'),
        renderMetric(formatDuration(status.health?.latestRunDurationMs), 'latest run'),
      ].join('')
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Latest Run',
        latestRun
          ? `
              <div class="stack-card">
                <div class="stack-meta">
                  <code>${escapeHtml(latestRun.runId || 'unknown')}</code>
                  <span>${escapeHtml(latestRun.status || 'unknown')}</span>
                </div>
                <p>${escapeHtml(latestRun.summary || 'n/a')}</p>
                <small>${escapeHtml(latestRun.next || 'n/a')}</small>
              </div>
            `
          : renderEmptyState('No run report yet.')
      )}
      ${renderPanel(
        'Blocked Queue Head',
        renderBlockedList(blocked.slice(0, 6)),
        'These are the remaining non-automation blockers.'
      )}
    </div>
    ${renderPanel('Recent Runs', renderDigestRunList(runs))}
    ${renderPanel(
      'Digest Feed',
      digests.length
        ? `<div class="stack">${digests
            .map(
              (item) => `
                <article class="stack-card">
                  <div class="stack-meta">
                    <strong>${escapeHtml(item.what)}</strong>
                    <span>${escapeHtml(formatDateTime(item.created_at || item.createdAt))}</span>
                  </div>
                  <p>${escapeHtml(item.why || '')}</p>
                  <div class="chip-row">
                    ${renderPill(item.risk || 'n/a', item.risk === 'low' ? 'good' : 'warn')}
                    ${renderPill(item.verify || 'verify', 'soft')}
                  </div>
                </article>
              `
            )
            .join('')}</div>`
        : renderEmptyState('No digest rows yet.'),
      'DB-backed digests mirror the latest markdown summary.'
    )}
    ${renderPanel('Digest Snapshot', `<pre>${escapeHtml(readOptionalString(status.latestDigest, '(empty)'))}</pre>`)}
  `;
}

async function renderStudioPage(page, requestUrl) {
  const [bootstrapRes, tasksRes, runsRes, agentsRes, settingsRes, digestRes] = await Promise.all([
    fetchJsonSafe('/studio/bootstrap'),
    fetchJsonSafe('/studio/tasks?limit=10'),
    fetchJsonSafe('/studio/runs?limit=8'),
    fetchJsonSafe('/studio/agents'),
    fetchJsonSafe('/studio/settings'),
    fetchJsonSafe('/dev-digest?limit=8'),
  ]);

  const bootstrap = bootstrapRes.ok ? bootstrapRes.payload : { counts: {}, recommendedActions: [], blockedTasks: [], summaryText: 'Studio data is unavailable right now.' };
  const tasks = tasksRes.ok ? tasksRes.payload.tasks || [] : [];
  const runs = runsRes.ok ? runsRes.payload.runs || [] : [];
  const agentsPayload = agentsRes.ok ? agentsRes.payload : {};
  const settings = settingsRes.ok ? settingsRes.payload : {};
  const cluster = settings.cluster || agentsPayload.cluster || {};
  const codex = settings.codex || agentsPayload.codex || {};
  const digests = digestRes.ok ? digestRes.payload.digests || [] : [];
  const status = bootstrap.status || settings.status || {};
  const latestRun = bootstrap.latestRun || runs[0] || null;
  const rawPanel = readOptionalString(requestUrl?.searchParams?.get('panel'), 'overview').toLowerCase();
  const activePanel = ['overview', 'tasks', 'runs', 'agents', 'policies'].includes(rawPanel) ? rawPanel : 'overview';
  const panelTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'runs', label: 'Runs' },
    { id: 'agents', label: 'Agents' },
    { id: 'policies', label: 'Policies' },
  ];

  const actionCards = Array.isArray(bootstrap.recommendedActions) && bootstrap.recommendedActions.length
    ? `<div class="stack">${bootstrap.recommendedActions
        .map((action) => `
          <article class="stack-card compact-card">
            <div class="stack-meta">
              <strong>${escapeHtml(action.title || 'Action')}</strong>
              ${renderPill(action.tone || 'soft', action.tone === 'warn' ? 'warn' : action.tone === 'accent' ? 'accent' : 'soft')}
            </div>
            <p>${escapeHtml(action.description || '')}</p>
            ${action.command ? `
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/${encodeURIComponent(action.command)}">
                <div class="inline-actions">
                  <button type="submit">${escapeHtml(action.title || 'Run')}</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
            ` : action.href ? `<div class="inline-actions"><a class="mini-link" href="${escapeHtml(action.href)}">Open</a></div>` : ''}
          </article>
        `)
        .join('')}</div>`
    : renderEmptyState('No recommended Studio actions right now.');

  const overviewBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Control Plane',
        `
          <div class="stack">
            <article class="stack-card">
              <div class="stack-meta">
                <strong>${escapeHtml(bootstrap.summaryText || 'Studio is ready.')}</strong>
                ${renderPill(readOptionalString(status.mode, 'ACTIVE'), readOptionalString(status.mode, 'ACTIVE') === 'PAUSED' ? 'warn' : 'good')}
              </div>
              <p>${escapeHtml(
                settings.publishMode === 'live'
                  ? 'Studio is allowed to hand work into live-gated flows, but operator intent still matters.'
                  : 'Studio stays dry-run safe by default while it manages tasks, runs, and evidence exports.'
              )}</p>
              <div class="chip-row">
                ${renderPill(formatHumanPublishMode(settings.publishMode || 'dry-run'), settings.publishMode === 'live' ? 'warn' : 'soft')}
                ${renderPill(settings.executionPolicy || 'multi-agent', 'accent')}
                ${renderPill(`queued ${String(status.queue?.pending ?? 0)}`, 'soft')}
                ${renderPill(`blocked ${String(status.queue?.blocked ?? 0)}`, (status.queue?.blocked ?? 0) > 0 ? 'warn' : 'good')}
              </div>
            </article>
            <article class="stack-card compact-card">
              <div class="stack-meta">
                <strong>Latest run</strong>
                <span>${escapeHtml(formatDateTime(latestRun?.finishedAt || latestRun?.startedAt))}</span>
              </div>
              <p>${escapeHtml(latestRun?.summary || 'No Studio run yet.')}</p>
              <small>${escapeHtml(latestRun?.next || 'Create or run a task to seed the evidence trail.')}</small>
            </article>
          </div>
        `,
        'Studio now owns task, run, agent, and policy visibility in one place.'
      )}
      ${renderPanel('Recommended Actions', actionCards, 'Use this panel when you want the next best Studio move, not a wall of controls.')}
    </div>
    <div class="grid two-up">
      ${renderPanel('Blocked Surface', renderBlockedList((bootstrap.blockedTasks || []).map((item, index) => ({ line: index + 1, task: `${item.taskId} ${item.title}` }))), 'These are the items currently blocked inside the Studio queue.')}
      ${renderPanel('Recent Runs', renderDigestRunList(runs.slice(0, 4)), 'Run reports stay visible, but they no longer define the runtime source of truth.')}
    </div>
  `;

  const tasksBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Create Studio Task',
        `
          <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/tasks">
            ${renderFormField('Task', '<input name="taskText" type="text" placeholder="Polish the Studio run detail surface for blocked tasks" />', 'Start with one sentence. Expand into goal/tests only when you need precision.')}
            ${renderFormField('Goal', '<textarea name="goal" rows="3" placeholder="Describe the user-facing or operator-facing outcome you want."></textarea>')}
            <details class="details-shell">
              <summary>Advanced Fields</summary>
              ${renderFormField('Acceptance Criteria', '<textarea name="acceptanceCriteria" rows="4" placeholder="One line per criterion"></textarea>')}
              ${renderFormField('Constraints', '<textarea name="constraints" rows="3" placeholder="One line per constraint"></textarea>')}
              ${renderFormField(
                'Scope',
                `<select name="scope">
                  <option value="socialos">socialos</option>
                  <option value="openclaw">openclaw</option>
                  <option value="multi-repo">multi-repo</option>
                </select>`,
                'Only explicit scope allows cross-repo work.'
              )}
              ${renderFormField('Repo Targets', '<textarea name="repoTargets" rows="3" placeholder="socialos&#10;openclaw"></textarea>')}
              ${renderFormField('Preferred Tests', '<textarea name="preferredTests" rows="3" placeholder="bash scripts/test.sh&#10;node scripts/tests/product_workspace_smoke.mjs"></textarea>')}
            </details>
            <div class="inline-actions">
              <button type="submit">Create task</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'One task flow replaces the old quick-vs-structured split.'
      )}
      ${renderPanel(
        'Task Queue',
        renderStudioTaskCards(tasks),
        'Queued, active, blocked, and done items all live in the same Studio task model.'
      )}
    </div>
  `;

  const runsBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Run Controls',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/run-once">
              <button type="submit">Run next queued task</button>
              <div class="form-result" data-form-result></div>
            </form>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/notify">
              <button type="submit">Send digest notification</button>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Studio commands are now first-class control-plane actions.'
      )}
      ${renderPanel(
        'Latest Digest',
        latestRun
          ? `
              <article class="stack-card">
                <div class="stack-meta">
                  <code>${escapeHtml(latestRun.runId || 'unknown')}</code>
                  <span>${escapeHtml(latestRun.status || 'unknown')}</span>
                </div>
                <p>${escapeHtml(latestRun.summary || 'No summary yet.')}</p>
                <small>${escapeHtml(latestRun.verify || 'No verify path yet.')}</small>
              </article>
            `
          : renderEmptyState('No Studio run digest yet.'),
        'The markdown digest is exported evidence. Studio itself reads from SQLite.'
      )}
    </div>
    <div class="grid two-up">
      ${renderPanel('Recent Runs', renderDigestRunList(runs), 'Recent runs show the execution trail without treating report files as the runtime source of truth.')}
      ${renderPanel(
        'Digest Feed',
        digests.length
          ? `<div class="stack">${digests
              .slice(0, 6)
              .map(
                (item) => `
                  <article class="stack-card compact-card">
                    <div class="stack-meta">
                      <strong>${escapeHtml(item.what)}</strong>
                      <span>${escapeHtml(formatDateTime(item.created_at || item.createdAt))}</span>
                    </div>
                    <p>${escapeHtml(item.why || '')}</p>
                  </article>
                `
              )
              .join('')}</div>`
          : renderEmptyState('No digest feed rows yet.'),
        'Legacy digest rows remain useful as a readable export layer.'
      )}
    </div>
  `;

  const agentsBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Studio Execution Surface',
        renderFoundryExecutionSurface(cluster),
        'Studio keeps the multi-agent pipeline visible without scattering it across Settings and /ops.'
      )}
      ${renderPanel(
        'Agent Lanes',
        renderClusterCards(cluster),
        'Each lane keeps a narrow responsibility so the control plane stays understandable.'
      )}
    </div>
    ${renderCodexSummary(codex)}
  `;

  const policiesBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Policies',
        `
          <form class="api-form compact-form" data-api-form="true" data-method="PATCH" data-endpoint="/studio/settings">
            ${renderFormField(
              'Publish Mode',
              `<select name="publishMode">
                <option value="dry-run"${settings.publishMode === 'dry-run' ? ' selected' : ''}>Safe rehearsal</option>
                <option value="live"${settings.publishMode === 'live' ? ' selected' : ''}>Live publish</option>
              </select>`,
              'Dry-run remains the default and recommended posture.'
            )}
            ${renderFormField(
              'Loop Mode',
              `<select name="loopMode">
                <option value="active"${settings.loopMode === 'active' ? ' selected' : ''}>Active</option>
                <option value="paused"${settings.loopMode === 'paused' ? ' selected' : ''}>Paused</option>
              </select>`
            )}
            ${renderFormField(
              'Embeddings',
              `<select name="embeddingsProvider">
                <option value="auto"${settings.embeddingsProvider === 'auto' ? ' selected' : ''}>Auto</option>
                <option value="local"${settings.embeddingsProvider === 'local' ? ' selected' : ''}>Local</option>
                <option value="openai"${settings.embeddingsProvider === 'openai' ? ' selected' : ''}>OpenAI</option>
              </select>`
            )}
            ${renderFormField(
              'Execution Policy',
              `<select name="executionPolicy">
                <option value="multi-agent"${settings.executionPolicy === 'multi-agent' ? ' selected' : ''}>Multi-agent</option>
              </select>`
            )}
            ${renderFormField(
              'Notification Policy',
              `<select name="notificationPolicy">
                <option value="digest"${settings.notificationPolicy === 'digest' ? ' selected' : ''}>Digest</option>
                <option value="silent"${settings.notificationPolicy === 'silent' ? ' selected' : ''}>Silent</option>
              </select>`
            )}
            <div class="inline-actions">
              <button type="submit">Update policies</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'Policy updates write back into the Studio DB, not ad hoc file reads.'
      )}
      ${renderPanel(
        'Commands',
        `
          <div class="control-stack">
            <div class="inline-actions stretch">
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/pause">
                <button type="submit">Pause loop</button>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/resume">
                <button type="submit">Resume loop</button>
                <div class="form-result" data-form-result></div>
              </form>
            </div>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/run-once">
              <button type="submit">Run once</button>
              <div class="form-result" data-form-result></div>
            </form>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/studio/commands/notify">
              <button type="submit">Notify</button>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Commands and policies now live together instead of being split across Settings and /ops.'
      )}
    </div>
  `;

  return `
    ${renderHero(
      page,
      [
        renderMetric(formatHumanPublishMode(settings.publishMode || 'dry-run'), 'publish mode'),
        renderMetric(String((cluster?.agents || []).length), 'studio lanes'),
        renderMetric(String(status.queue?.pending ?? 0), 'queued tasks'),
        renderMetric(String(runs.length), 'recent runs'),
      ].join(''),
      `<div class="info-card"><strong>Studio</strong><p>Studio is the unified control plane for tasks, runs, agents, and policies. The DB is authoritative; files are exported evidence.</p></div>`
    )}
    <div class="workspace-rail-tabs">
      ${panelTabs
        .map((tab) => {
          const active = tab.id === activePanel ? 'workspace-rail-tab active' : 'workspace-rail-tab';
          return `<a class="${active}" href="/studio?panel=${tab.id}">${tab.label}</a>`;
        })
        .join('')}
    </div>
    ${activePanel === 'tasks'
      ? tasksBody
      : activePanel === 'runs'
        ? runsBody
        : activePanel === 'agents'
          ? agentsBody
          : activePanel === 'policies'
            ? policiesBody
            : overviewBody}
  `;
}

function buildDeckStatusFallback() {
  return {
    generatedAt: null,
    latestGreenValidationAt: null,
    repoHead: 'unknown',
    demo: {
      healthy: false,
      summary: 'Local demo status not refreshed yet.',
    },
    evidence: {
      screenshots: [
        'socialos/docs/evidence/socialos-demo-step01.png',
        'socialos/docs/evidence/socialos-demo-step02-contacts.png',
        'socialos/docs/evidence/socialos-demo-step04.png',
        'socialos/docs/evidence/socialos-demo-step08.png',
      ],
    },
    publicRepoUrl: PUBLIC_REPO_URL,
  };
}

function renderDeckMetric(label, value) {
  return `
    <div class="deck-proof-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderDeckNetworkCluster(cluster) {
  return `
    <article class="deck-network-card">
      <strong>${escapeHtml(cluster.title)}</strong>
      <span>${escapeHtml((cluster.members || []).join(' · '))}</span>
      <small>${escapeHtml(cluster.summary || '')}</small>
    </article>
  `;
}

function renderDeckSlide({ eyebrow = '', title, bodyHtml = '', visualHtml = '', footerHtml = '', notesHtml = '', shellClass = '' }) {
  const shellClassName = ['deck-slide-shell', shellClass].filter(Boolean).join(' ');
  return `
    <section>
      <div class="${shellClassName}">
        <div class="deck-slide-copy">
          ${eyebrow ? `<p class="deck-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
          <h2>${escapeHtml(title)}</h2>
          ${bodyHtml}
          ${footerHtml ? `<div class="deck-footer-note">${footerHtml}</div>` : ''}
        </div>
        ${visualHtml ? `<div class="deck-slide-visual">${visualHtml}</div>` : ''}
      </div>
      ${notesHtml ? `<aside class="notes">${notesHtml}</aside>` : ''}
    </section>
  `;
}

function renderDeckHackathonAppendixSlide(bounty) {
  const proofCopyById = {
    'claw-for-human': 'Use /demo for the local recording and /hackathon/#bounty-claw-for-human as the canonical public proof page.',
    animoca: 'Use /hackathon?bounty=animoca for recording and the matching /hackathon/#bounty-animoca section for the public proof.',
    'human-for-claw': 'Use /buddy for recording and /hackathon/#bounty-human-for-claw as the canonical public proof page.',
    'z-ai-general': 'Use /hackathon?bounty=z-ai-general for recording and the public proof JSON to show live GLM integration.',
    'ai-agents-for-good': 'Use /hackathon?bounty=ai-agents-for-good for recording and the public proof JSON to show live FLock integration.',
  };

  return renderDeckSlide({
    eyebrow: `${escapeHtml(readOptionalString(bounty.deckAppendixSlide, 'Appendix'))} · ${bounty.label}`,
    title: bounty.label,
    bodyHtml: `
      <p class="deck-lead">${escapeHtml(bounty.uniqueAngle || '')}</p>
      <ul class="deck-check-list">
        <li>${escapeHtml(proofCopyById[bounty.id] || 'Use the hackathon hub to present the matching proof layer.')}</li>
        <li>${escapeHtml(readOptionalString(bounty.partnerLabel, (bounty.integrations || []).join(' · ')))}</li>
        <li>${escapeHtml(readOptionalString(bounty.publicAnchor, '/hackathon/'))}</li>
      </ul>
    `,
    visualHtml: `
      <div class="deck-proof-grid">
        ${renderDeckMetric('Status', readOptionalString(bounty.status, 'ready'))}
        ${renderDeckMetric('Record', readOptionalString(bounty.localRecordRoute || bounty.route, '/hackathon'))}
        ${renderDeckMetric('Proof', readOptionalString(bounty.model, readOptionalString(bounty.partnerLabel, bounty.id)))}
      </div>
    `,
  });
}

function renderDeckDocument(requestUrl) {
  const mode = readOptionalString(requestUrl.searchParams.get('mode'), '');
  const rehearsalMode = mode === 'rehearsal';
  const printPdf = requestUrl.searchParams.has('print-pdf');
  const revealCss = readFileTextCached(REVEAL_CSS_PATH);
  const revealJs = readFileTextCached(REVEAL_JS_PATH);
  const revealNotesJs = readFileTextCached(REVEAL_NOTES_PATH);
  const deckStatus = readJsonFileSafe(DECK_STATUS_PATH, buildDeckStatusFallback());
  const workspaceImage = readDataUriCached(EVIDENCE_STEP_ONE_PATH);
  const contactsImage = readDataUriCached(EVIDENCE_STEP_TWO_CONTACTS_PATH);
  const draftsImage = readDataUriCached(EVIDENCE_STEP_FOUR_PATH);
  const queueImage = readDataUriCached(EVIDENCE_STEP_EIGHT_PATH);
  const latestValidation = readOptionalString(deckStatus.latestGreenValidationAt, 'Validation pending');
  const repoHead = readOptionalString(deckStatus.repoHead, 'unknown');
  const demoSummary = readOptionalString(deckStatus.demo?.summary, 'Local demo status not refreshed yet.');
  const repoUrl = readOptionalString(deckStatus.publicRepoUrl, PUBLIC_REPO_URL);
  const publicDeckUrl = PUBLIC_DECK_URL;
  const repoDisplayUrl = repoUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const publicDeckDisplayUrl = publicDeckUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const deckStatusLabel = deckStatus.demo?.healthy ? 'ready' : 'degraded';
  const slideSections = [
    renderDeckSlide({
      eyebrow: 'Slide 1 · Problem',
      title: 'People, context, content, and self-understanding drift apart.',
      bodyHtml: `
        <p class="deck-lead">High-context people do not struggle because they lack tools. They struggle because relationships, conversations, follow-up, content, and reflection fracture across chats, notes, screenshots, and memory.</p>
        <div class="deck-bullet-stack">
          <div class="deck-idea-pill">Meet someone important</div>
          <div class="deck-idea-pill">Promise to follow up</div>
          <div class="deck-idea-pill">Turn it into content</div>
          <div class="deck-idea-pill">Forget what it meant two days later</div>
        </div>
      `,
      visualHtml: `
        <div class="deck-problem-grid">
          <div class="deck-problem-card"><strong>Chats</strong><span>important details disappear into threads</span></div>
          <div class="deck-problem-card"><strong>Notes</strong><span>context lives in fragments</span></div>
          <div class="deck-problem-card"><strong>Content</strong><span>expression is disconnected from relationships</span></div>
          <div class="deck-problem-card"><strong>Reflection</strong><span>self-insight rarely becomes action</span></div>
        </div>
      `,
      notesHtml: `
        <p>Open with the pain. Do not mention agents yet.</p>
        <p>Frame the problem as fragmentation across relationships, content, and self-understanding.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 2 · What SocialOS is',
      title: 'A local-first relationship and identity operating system.',
      bodyHtml: `
        <p class="deck-lead">SocialOS turns messy daily input into structured people memory, event context, platform-native drafts, and daily or weekly mirror loops.</p>
        <ul class="deck-check-list">
          <li>One conversational workspace</li>
          <li>Structured people and event memory</li>
          <li>Content handoff instead of scattered follow-up</li>
          <li>Reflection that stays grounded in evidence</li>
        </ul>
      `,
      visualHtml: workspaceImage
        ? `<img class="deck-shot" src="${workspaceImage}" alt="Workspace capture view" />`
        : `<div class="deck-placeholder">Workspace screenshot unavailable</div>`,
      notesHtml: `
        <p>Give the one-line definition here.</p>
        <p>Stress local-first and calm product surface before any technical explanation.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 3 · Who it is for',
      title: 'Built for high-context people, and already grounded in a real network.',
      shellClass: 'deck-slide-shell-compact',
      bodyHtml: `
        <p class="deck-lead">The wedge is not “everyone.” It starts with people who constantly turn conversations into opportunities, follow-up, and public expression. The demo now carries a real relationship graph across London, Bristol, Chengdu, and San Francisco.</p>
      `,
      visualHtml: `
        <div class="deck-network-grid">
          ${DEMO_NETWORK_DECK_CLUSTERS.map((cluster) => renderDeckNetworkCluster(cluster)).join('')}
        </div>
      `,
      notesHtml: `
        <p>VCs need a clear wedge. Explain high-context people in plain language, then point out that the demo already uses real relationships instead of placeholders.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 4 · Product loop',
      title: 'One real note becomes memory, drafts, queue, and reflection.',
      bodyHtml: `
        <p class="deck-lead">This is the core proof: one natural note about a real relationship already moves through the whole product loop instead of dying inside a chat thread.</p>
        <div class="deck-inline-flow">
          <div class="deck-inline-pill">
            <strong>Real network</strong>
            <span>Minghan Xiao · Candice Tang · James Wu · Xiyue Zhang</span>
          </div>
          <div class="deck-inline-pill">
            <strong>Real output</strong>
            <span>contacts · linked event · 7 drafts · queue · mirror</span>
          </div>
        </div>
      `,
      footerHtml: `
        <p><strong>Loop:</strong> capture → recall → express → hand off → reflect</p>
      `,
      visualHtml: `
        <div class="deck-real-loop">
          <article class="deck-real-input">
            <span class="deck-real-kicker">Capture in Workspace</span>
            <strong>“Met Minghan Xiao in the London hackathon organiser circle at Imperial College...”</strong>
            <p>One natural note goes in. No CRM form. No manual copy-paste across tools.</p>
          </article>
          <article class="deck-real-stage">
            <span class="deck-real-kicker">Recall</span>
            <strong>Minghan Xiao + Shafi Maahe + London organiser follow-up</strong>
            <div class="deck-real-chip-row">
              <span class="deck-real-chip">Imperial</span>
              <span class="deck-real-chip">Tianjin</span>
              <span class="deck-real-chip">X profile</span>
              <span class="deck-real-chip">LinkedIn</span>
            </div>
            <p>The same input becomes contact memory, linked identities, and a reusable event thread.</p>
          </article>
          <article class="deck-real-stage">
            <span class="deck-real-kicker">Express + hand off</span>
            <strong>7 platform-native drafts, then a trust-first queue</strong>
            <div class="deck-real-chip-row">
              <span class="deck-real-chip">LinkedIn</span>
              <span class="deck-real-chip">X</span>
              <span class="deck-real-chip">Instagram</span>
              <span class="deck-real-chip">Zhihu</span>
              <span class="deck-real-chip">Rednote</span>
              <span class="deck-real-chip">WeChat</span>
            </div>
            <p>English and Chinese outputs are prepared from the same event, with dry-run queueing by default.</p>
          </article>
          <article class="deck-real-stage">
            <span class="deck-real-kicker">Reflect</span>
            <strong>Mirror closes the loop with next-action judgment</strong>
            <div class="deck-real-chip-row">
              <span class="deck-real-chip deck-real-chip-accent">Follow up with Xiyue Zhang</span>
              <span class="deck-real-chip deck-real-chip-accent">Candice Tang partner thread</span>
              <span class="deck-real-chip deck-real-chip-accent">Bristol teaching circle</span>
            </div>
            <p>The system ends with a recommendation and evidence-backed reflection, not a dead note.</p>
          </article>
        </div>
      `,
      notesHtml: `
        <p>Walk the audience through one concrete relationship note, not an abstract pipeline.</p>
        <p>Name Minghan Xiao out loud, then show how the same note becomes memory, content, queue, and mirror.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 5 · What works today',
      title: 'One real note becomes memory, 7 drafts, and a safe queue.',
      shellClass: 'deck-slide-shell-compact deck-slide-shell-proof deck-slide-shell-proof-reframe',
      bodyHtml: `
        <p class="deck-lead">One seeded relationship note already fans out into contacts, drafts, and a human approval step.</p>
        <div class="deck-proof-copy-stack">
          <article class="deck-proof-copy-card">
            <span class="deck-proof-copy-step">01 · Contacts memory</span>
            <strong>Real named contacts already live in the graph.</strong>
          </article>
          <article class="deck-proof-copy-card">
            <span class="deck-proof-copy-step">02 · Draft generation</span>
            <strong>One London organiser thread already produces 7 drafts.</strong>
          </article>
          <article class="deck-proof-copy-card">
            <span class="deck-proof-copy-step">03 · Approval queue</span>
            <strong>Dry-run and approval stay visible before anything posts.</strong>
          </article>
        </div>
      `,
      visualHtml: `
        <div class="deck-proof-reframe">
          <div class="deck-proof-flowbar">
            <span class="deck-proof-flow-pill">
              <span class="deck-proof-flow-kicker">Input</span>
              <strong>Real note</strong>
            </span>
            <span class="deck-proof-flow-connector">→</span>
            <span class="deck-proof-flow-pill">
              <span class="deck-proof-flow-kicker">1</span>
              <strong>Contacts</strong>
            </span>
            <span class="deck-proof-flow-connector">→</span>
            <span class="deck-proof-flow-pill">
              <span class="deck-proof-flow-kicker">2</span>
              <strong>7 drafts</strong>
            </span>
            <span class="deck-proof-flow-connector">→</span>
            <span class="deck-proof-flow-pill">
              <span class="deck-proof-flow-kicker">3</span>
              <strong>Approval queue</strong>
            </span>
          </div>
          <div class="deck-proof-stage-grid">
            <article class="deck-proof-stage-card deck-proof-stage-card-large">
              <div class="deck-proof-stage-meta">
                <span class="deck-proof-stage-step">01</span>
                <span class="deck-proof-stage-label">Contacts memory</span>
              </div>
              <strong class="deck-proof-stage-title">Minghan Xiao, Candice Tang, James Wu</strong>
              <p class="deck-proof-stage-subtitle">Already visible with notes, tags, and next follow-up timing.</p>
              ${contactsImage ? `
                <div class="deck-proof-shot-surface deck-proof-shot-surface-stage deck-proof-shot-surface-stage-large">
                  <img class="deck-shot-proof deck-shot-proof-contacts deck-shot-proof-stage" src="${contactsImage}" alt="Contacts with real named network" />
                </div>
              ` : `<div class="deck-placeholder">Contacts screenshot unavailable</div>`}
              <div class="deck-proof-token-row">
                <span class="deck-proof-token">X + LinkedIn</span>
                <span class="deck-proof-token">follow-up date</span>
                <span class="deck-proof-token">linked event</span>
              </div>
              <p class="deck-proof-stage-foot">This is already real people memory, not a placeholder list or CRM mock.</p>
            </article>
            <article class="deck-proof-stage-card">
              <div class="deck-proof-stage-meta">
                <span class="deck-proof-stage-step">02</span>
                <span class="deck-proof-stage-label">Draft generation</span>
              </div>
              <strong class="deck-proof-stage-title">7 drafts from one event</strong>
              <p class="deck-proof-stage-subtitle">The same relationship thread already fans out across channels.</p>
              ${draftsImage ? `
                <div class="deck-proof-shot-surface deck-proof-shot-surface-stage">
                  <img class="deck-shot-proof deck-shot-proof-drafts deck-shot-proof-stage" src="${draftsImage}" alt="Draft generation flow" />
                </div>
              ` : `<div class="deck-placeholder">Drafts screenshot unavailable</div>`}
              <div class="deck-proof-token-row">
                <span class="deck-proof-token">LinkedIn</span>
                <span class="deck-proof-token">X</span>
                <span class="deck-proof-token">Instagram</span>
                <span class="deck-proof-token">Zhihu</span>
              </div>
            </article>
            <article class="deck-proof-stage-card">
              <div class="deck-proof-stage-meta">
                <span class="deck-proof-stage-step">03</span>
                <span class="deck-proof-stage-label">Approval queue</span>
              </div>
              <strong class="deck-proof-stage-title">Dry-run before publish</strong>
              <p class="deck-proof-stage-subtitle">Human approval stays explicit before anything posts.</p>
              ${queueImage ? `
                <div class="deck-proof-shot-surface deck-proof-shot-surface-stage">
                  <img class="deck-shot-proof deck-shot-proof-queue deck-shot-proof-stage" src="${queueImage}" alt="Queue and recall flow" />
                </div>
              ` : `<div class="deck-placeholder">Queue screenshot unavailable</div>`}
              <div class="deck-proof-token-row">
                <span class="deck-proof-token">dry-run</span>
                <span class="deck-proof-token">manual approval</span>
              </div>
            </article>
          </div>
        </div>
      `,
      notesHtml: `
        <p>This is the proof slide. Walk left-to-right: one real note, then contacts memory, then seven drafts, then the approval queue.</p>
        <p>Do not describe features one by one. Treat the whole page as one evidence chain.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 6 · Why it is different',
      title: 'It combines Relationship OS, Content OS, and Self OS in one loop.',
      bodyHtml: `
        <p class="deck-lead">Most products optimize one layer. SocialOS connects the full cycle between who matters, what happened, what should be expressed, and what that says about the user.</p>
        <div class="deck-three-column">
          <div class="deck-loop-card"><strong>Relationship OS</strong><span>people memory, follow-up, linked events</span></div>
          <div class="deck-loop-card"><strong>Content OS</strong><span>platform-native drafts and queue handoff</span></div>
          <div class="deck-loop-card"><strong>Self OS</strong><span>daily and weekly mirror grounded in evidence</span></div>
        </div>
      `,
      visualHtml: `
        <div class="deck-contrast-card">
          <strong>Not just CRM</strong>
          <strong>Not just AI writer</strong>
          <strong>Not just journaling</strong>
        </div>
      `,
      notesHtml: `
        <p>Position the category here, not as a feature bundle.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 7 · Why this is credible',
      title: 'Trust-first product, real proof, expandable architecture.',
      bodyHtml: `
        <p class="deck-lead">The multi-agent layer matters because capture, people memory, reflection, validation, and publishing are different jobs. The user still experiences one calm product surface.</p>
        <div class="deck-proof-grid">
          ${renderDeckMetric('Public repo', 'live')}
          ${renderDeckMetric('Validation', latestValidation)}
          ${renderDeckMetric('Repo head', repoHead)}
          ${renderDeckMetric('Product posture', 'local-first · safe rehearsal')}
        </div>
      `,
      footerHtml: `
        <div class="deck-reference-row">
          <article class="deck-reference-card">
            <span>Current status</span>
            <strong>${escapeHtml(demoSummary)}</strong>
          </article>
          <a class="deck-reference-card deck-reference-card-link" href="${escapeHtml(repoUrl)}">
            <span>Public repo</span>
            <strong>Build log and source</strong>
            <code>${escapeHtml(repoDisplayUrl)}</code>
          </a>
        </div>
      `,
      visualHtml: `
        <div class="deck-credibility-stack">
          <div class="deck-credibility-card"><strong>Trust boundary</strong><span>local-first, loopback-only, safe by default</span></div>
          <div class="deck-credibility-card"><strong>Capture</strong><span>model-first understanding with structured review flows</span></div>
          <div class="deck-credibility-card"><strong>Linking</strong><span>people and events connected through graph-backed relationships</span></div>
        </div>
      `,
      notesHtml: `
        <p>Now you can mention the multi-agent runtime, but only as enabling architecture.</p>
      `,
    }),
    renderDeckSlide({
      eyebrow: 'Slide 8 · What I want now',
      title: 'Design partners and intros for the next unlock.',
      bodyHtml: `
        <p class="deck-lead">This is already a working loop. The next unlock is real-data onboarding and low-friction daily use.</p>
        <div class="deck-cta-grid">
          <div class="deck-cta-card"><strong>What I want now</strong><span>Design partners and intros to high-context users who feel this pain today.</span></div>
          <div class="deck-cta-card"><strong>What comes next</strong><span>Import Inbox, multi-entity capture, and LinkedIn mention suggestions.</span></div>
        </div>
      `,
      footerHtml: `
        <p><strong>Ask:</strong> If this resonates, I want to talk to people who live across relationships, notes, and content every day.</p>
      `,
      visualHtml: `
        <div class="deck-final-card">
          <h3>SocialOS</h3>
          <p>A local-first relationship and identity operating system for high-context people.</p>
          <div class="deck-link-stack">
            <a class="deck-cta-link" href="${escapeHtml(publicDeckUrl)}">Open ${escapeHtml(publicDeckDisplayUrl)}</a>
            <a class="deck-cta-link secondary" href="${escapeHtml(repoUrl)}">View public repo</a>
          </div>
        </div>
      `,
      notesHtml: `
        <p>Close on design partners and intros, not a formal priced round.</p>
      `,
    }),
    ...HACKATHON_PAGE_FALLBACK.map((bounty) => renderDeckHackathonAppendixSlide(bounty)),
  ];
  const slideCount = slideSections.length;
  const slideMarkup = slideSections.join('');

  return `<!doctype html>
<html lang="en" data-print-pdf="${printPdf ? 'true' : 'false'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SocialOS VC Deck</title>
    <meta name="description" content="VC-facing SocialOS deck: a local-first relationship and identity operating system." />
    <style>${revealCss}</style>
    <style>
      :root {
        --deck-bg: #f6f0e5;
        --deck-panel: rgba(255, 251, 245, 0.94);
        --deck-panel-strong: rgba(255, 250, 244, 0.98);
        --deck-ink: #172131;
        --deck-ink-soft: #4f6075;
        --deck-line: rgba(23, 33, 49, 0.12);
        --deck-accent: #156f6a;
        --deck-accent-soft: rgba(21, 111, 106, 0.12);
        --deck-coral: #b55d34;
        --deck-coral-soft: rgba(181, 93, 52, 0.14);
        --deck-shadow: 0 24px 70px rgba(17, 30, 46, 0.12);
        --deck-radius-xl: 34px;
        --deck-radius-lg: 24px;
        --deck-radius-md: 18px;
        --deck-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        --deck-body: "Avenir Next", "IBM Plex Sans", "Noto Sans SC", sans-serif;
      }
      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(21, 111, 106, 0.12), transparent 24%),
          radial-gradient(circle at bottom right, rgba(181, 93, 52, 0.16), transparent 28%),
          linear-gradient(180deg, #fbf7ef 0%, #f1ebdf 100%);
        color: var(--deck-ink);
        font-family: var(--deck-body);
      }
      body.deck-mode {
        overflow-x: hidden;
      }
      .deck-ribbon {
        position: fixed;
        top: 22px;
        right: 24px;
        z-index: 20;
        display: inline-flex;
        gap: 10px;
        align-items: center;
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(255, 252, 246, 0.92);
        border: 1px solid var(--deck-line);
        box-shadow: var(--deck-shadow);
        font-size: 13px;
        color: var(--deck-ink-soft);
      }
      .deck-ribbon strong {
        color: var(--deck-ink);
      }
      .deck-video-dock {
        position: fixed;
        top: 22px;
        left: 24px;
        z-index: 20;
        width: min(360px, calc(100vw - 48px));
        display: grid;
        gap: 14px;
        padding: 18px 18px 16px;
        border-radius: 26px;
        background: rgba(255, 252, 246, 0.95);
        border: 1px solid var(--deck-line);
        box-shadow: var(--deck-shadow);
        backdrop-filter: blur(12px);
      }
      .deck-video-dock-head {
        display: grid;
        gap: 6px;
      }
      .deck-video-dock-kicker {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-video-dock-head strong {
        font-family: var(--deck-display);
        font-size: 26px;
        line-height: 1.02;
      }
      .deck-video-dock-head p {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        color: var(--deck-ink-soft);
      }
      .deck-video-dock-links {
        display: grid;
        gap: 8px;
      }
      .deck-video-dock-help {
        display: grid;
        gap: 8px;
        padding-top: 2px;
      }
      .deck-video-dock-help span {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-video-dock-help-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .deck-video-dock-help-links a {
        display: inline-flex;
        align-items: center;
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid var(--deck-line);
        background: rgba(255, 251, 245, 0.96);
        color: var(--deck-ink);
        text-decoration: none;
        font-size: 12px;
        line-height: 1.2;
      }
      .deck-video-dock-primary,
      .deck-video-dock-link {
        display: block;
        padding: 11px 14px;
        border-radius: 16px;
        border: 1px solid var(--deck-line);
        text-decoration: none;
        color: var(--deck-ink);
        background: rgba(255, 251, 245, 0.96);
        font-size: 14px;
        line-height: 1.35;
      }
      .deck-video-dock-primary {
        background: rgba(21, 111, 106, 0.14);
        border-color: rgba(21, 111, 106, 0.2);
        color: var(--deck-accent);
        font-weight: 700;
      }
      .reveal {
        color: var(--deck-ink);
        font-family: var(--deck-body);
      }
      .reveal .slides {
        text-align: left;
      }
      .reveal h1,
      .reveal h2,
      .reveal h3,
      .reveal h4 {
        margin: 0;
        font-family: var(--deck-display);
        color: var(--deck-ink);
        letter-spacing: -0.03em;
      }
      .reveal h2 {
        font-size: clamp(50px, 4.7vw, 84px);
        line-height: 0.94;
        max-width: 9.4em;
      }
      .reveal p,
      .reveal li,
      .reveal span {
        font-size: 28px;
        line-height: 1.45;
      }
      .reveal p,
      .reveal li,
      .reveal span,
      .reveal small,
      .reveal a {
        overflow-wrap: anywhere;
      }
      .reveal .slides > section {
        height: 100%;
        min-height: 100%;
      }
      .deck-slide-shell {
        min-height: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 72px 68px;
        display: grid;
        grid-template-columns: minmax(0, 1.04fr) minmax(360px, 0.86fr);
        gap: 42px;
        align-items: center;
      }
      .deck-slide-copy,
      .deck-slide-visual {
        align-self: stretch;
      }
      .deck-slide-copy {
        display: grid;
        align-content: space-between;
        gap: 18px;
        min-height: 0;
      }
      .deck-slide-visual {
        display: grid;
        align-content: center;
        min-height: 0;
      }
      .deck-slide-shell.deck-slide-shell-compact {
        align-items: start;
      }
      .deck-slide-shell.deck-slide-shell-compact .deck-slide-copy,
      .deck-slide-shell.deck-slide-shell-compact .deck-slide-visual {
        align-self: stretch;
      }
      .deck-slide-shell.deck-slide-shell-compact .deck-slide-copy {
        align-content: start;
      }
      .deck-slide-shell.deck-slide-shell-compact .deck-slide-visual {
        align-content: stretch;
      }
      .deck-eyebrow {
        margin: 0;
        font-size: 14px;
        line-height: 1.3;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-lead {
        max-width: 28em;
        color: var(--deck-ink-soft);
      }
      .deck-check-list,
      .deck-bullet-stack {
        display: grid;
        gap: 14px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .deck-check-list li,
      .deck-idea-pill,
      .deck-inline-pill,
      .deck-loop-card,
      .deck-problem-card,
      .deck-persona-card,
      .deck-network-card,
      .deck-proof-card,
      .deck-credibility-card,
      .deck-cta-card,
      .deck-quote-card,
      .deck-final-card,
      .deck-contrast-card {
        border: 1px solid var(--deck-line);
        background: var(--deck-panel);
        border-radius: var(--deck-radius-lg);
        box-shadow: var(--deck-shadow);
      }
      .deck-check-list li {
        padding: 16px 18px 16px 22px;
      }
      .deck-check-list li::marker {
        color: var(--deck-accent);
      }
      .deck-bullet-stack {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .deck-chip-row,
      .deck-inline-flow {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .deck-idea-pill {
        padding: 18px 20px;
      }
      .deck-inline-pill {
        padding: 14px 18px;
        display: inline-grid;
        gap: 6px;
        min-width: 0;
      }
      .deck-inline-pill strong {
        font-size: 21px;
        font-family: var(--deck-display);
      }
      .deck-inline-pill span {
        font-size: 17px;
        color: var(--deck-ink-soft);
      }
      .deck-problem-grid,
      .deck-persona-grid,
      .deck-proof-grid,
      .deck-three-column,
      .deck-cta-grid,
      .deck-network-grid {
        display: grid;
        gap: 16px;
      }
      .deck-problem-grid,
      .deck-persona-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .deck-three-column {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .deck-proof-grid,
      .deck-cta-grid,
      .deck-network-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .deck-problem-card,
      .deck-persona-card,
      .deck-network-card,
      .deck-loop-card,
      .deck-credibility-card,
      .deck-cta-card {
        padding: 22px 24px;
        display: grid;
        gap: 8px;
      }
      .deck-problem-card strong,
      .deck-persona-card strong,
      .deck-network-card strong,
      .deck-loop-card strong,
      .deck-credibility-card strong,
      .deck-cta-card strong,
      .deck-final-card h3 {
        font-size: 30px;
        font-family: var(--deck-display);
      }
      .deck-problem-card span,
      .deck-persona-card span,
      .deck-network-card span,
      .deck-loop-card span,
      .deck-credibility-card span,
      .deck-cta-card span,
      .deck-final-card p {
        font-size: 20px;
        color: var(--deck-ink-soft);
      }
      .deck-network-card {
        background: linear-gradient(160deg, rgba(255,251,245,0.98) 0%, rgba(246,241,233,0.98) 100%);
      }
      .deck-network-card span {
        color: var(--deck-ink);
      }
      .deck-network-card small {
        font-size: 15px;
        line-height: 1.5;
        color: var(--deck-ink-soft);
      }
      .deck-quote-card,
      .deck-contrast-card,
      .deck-final-card {
        padding: 30px 32px;
      }
      .deck-contrast-card {
        display: grid;
        gap: 14px;
        background: linear-gradient(160deg, rgba(255,251,245,0.98) 0%, rgba(253,245,237,0.98) 100%);
      }
      .deck-contrast-card strong {
        font-size: 26px;
      }
      .deck-flow {
        display: flex;
        gap: 12px;
        flex-wrap: nowrap;
        justify-content: space-between;
        align-items: stretch;
      }
      .deck-flow > * {
        min-width: 0;
      }
      .deck-flow-step,
      .deck-flow-arrow {
        flex: 0 0 auto;
      }
      .deck-flow-step {
        flex: 1 1 0;
        gap: 10px;
      }
      .deck-flow-step {
        padding: 18px 16px;
        border-radius: var(--deck-radius-md);
        border: 1px solid var(--deck-line);
        background: var(--deck-panel);
        box-shadow: var(--deck-shadow);
        min-height: 120px;
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .deck-flow-step strong {
        font-size: 23px;
        font-family: var(--deck-display);
      }
      .deck-flow-step span,
      .deck-flow-arrow {
        font-size: 18px;
        color: var(--deck-ink-soft);
      }
      .deck-flow-arrow {
        flex: 0 0 28px;
        display: grid;
        place-items: center;
        text-align: center;
        font-size: 34px;
      }
      .deck-proof-strip {
        display: grid;
        gap: 14px;
      }
      .deck-real-loop {
        display: grid;
        gap: 14px;
        align-content: start;
      }
      .deck-real-input,
      .deck-real-stage {
        border: 1px solid var(--deck-line);
        border-radius: var(--deck-radius-lg);
        box-shadow: var(--deck-shadow);
      }
      .deck-real-input {
        display: grid;
        gap: 10px;
        padding: 20px 22px;
        background:
          linear-gradient(135deg, rgba(21, 111, 106, 0.12), rgba(255, 251, 245, 0.98)),
          var(--deck-panel-strong);
      }
      .deck-real-stage {
        display: grid;
        gap: 10px;
        padding: 18px 20px;
        background: var(--deck-panel);
      }
      .deck-real-kicker {
        font-size: 13px;
        line-height: 1.2;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-real-input strong,
      .deck-real-stage strong {
        font-size: 26px;
        line-height: 1.08;
        font-family: var(--deck-display);
        color: var(--deck-ink);
      }
      .deck-real-input p,
      .deck-real-stage p {
        margin: 0;
        font-size: 17px;
        line-height: 1.45;
        color: var(--deck-ink-soft);
      }
      .deck-real-chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .deck-real-chip {
        display: inline-flex;
        align-items: center;
        padding: 7px 11px;
        border-radius: 999px;
        background: rgba(23, 33, 49, 0.06);
        border: 1px solid rgba(23, 33, 49, 0.08);
        font-size: 14px;
        line-height: 1.2;
        color: var(--deck-ink-soft);
      }
      .deck-real-chip-accent {
        background: var(--deck-accent-soft);
        border-color: rgba(21, 111, 106, 0.12);
        color: var(--deck-accent);
      }
      .deck-proof-card {
        padding: 18px 20px;
        display: grid;
        gap: 4px;
      }
      .deck-proof-card span {
        font-size: 15px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--deck-ink-soft);
      }
      .deck-proof-card strong {
        font-size: 26px;
      }
      .deck-shot,
      .deck-shot.small {
        width: 100%;
        height: auto;
        border-radius: var(--deck-radius-xl);
        border: 1px solid var(--deck-line);
        box-shadow: var(--deck-shadow);
        background: var(--deck-panel-strong);
      }
      .deck-shot-stack {
        display: grid;
        gap: 18px;
      }
      .deck-proof-gallery {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(260px, 0.92fr);
        gap: 18px;
        align-items: stretch;
      }
      .deck-proof-gallery-curated {
        gap: 18px;
      }
      .deck-proof-visual-stack {
        display: grid;
        gap: 18px;
        min-height: 0;
      }
      .deck-proof-visual-card {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-height: 0;
        overflow: hidden;
        border-radius: calc(var(--deck-radius-xl) + 2px);
        border: 1px solid var(--deck-line);
        background: linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(246, 240, 231, 0.98) 100%);
        box-shadow: var(--deck-shadow);
      }
      .deck-proof-visual-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        padding: 16px 18px 14px;
        border-bottom: 1px solid rgba(23, 33, 49, 0.08);
        background: rgba(255, 252, 246, 0.92);
      }
      .deck-proof-visual-head span {
        font-size: 12px;
        line-height: 1.2;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-proof-visual-head strong {
        font-size: 28px;
        line-height: 1;
        font-family: var(--deck-display);
        color: var(--deck-ink);
      }
      .deck-proof-visual-frame {
        position: relative;
        overflow: hidden;
        min-height: 0;
        height: 220px;
        background: rgba(246, 240, 229, 0.92);
      }
      .deck-proof-visual-frame-tall {
        height: 518px;
      }
      .deck-proof-visual-frame::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 22%;
        background: linear-gradient(180deg, rgba(246, 240, 229, 0) 0%, rgba(246, 240, 229, 0.88) 100%);
        pointer-events: none;
      }
      .deck-shot-proof {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        border: 0;
        box-shadow: none;
        background: transparent;
      }
      .deck-proof-visual-frame-clean::after {
        display: none;
      }
      .deck-proof-shot-surface {
        min-width: 0;
        min-height: 0;
        margin: 16px;
        border-radius: calc(var(--deck-radius-xl) - 2px);
        overflow: hidden;
        border: 1px solid rgba(23, 33, 49, 0.1);
        background: linear-gradient(180deg, rgba(240, 233, 221, 0.98) 0%, rgba(248, 243, 235, 0.98) 100%);
        box-shadow: 0 16px 40px rgba(22, 33, 50, 0.12);
      }
      .deck-proof-shot-surface-tall {
        margin: 18px 18px 12px;
      }
      .deck-proof-shot-surface .deck-shot-proof {
        width: 100%;
        height: 100%;
      }
      .deck-shot-proof-contacts {
        object-position: 8% 0%;
        transform: scale(1.01);
        transform-origin: top left;
      }
      .deck-shot-proof-drafts {
        object-position: 48% 10%;
        transform: scale(1.03);
        transform-origin: top center;
      }
      .deck-shot-proof-queue {
        object-position: 50% 18%;
        transform: scale(1.04);
        transform-origin: top center;
      }
      .deck-shot-proof-contain {
        object-fit: contain;
        object-position: top center;
        transform: none;
      }
      .deck-proof-callout {
        display: grid;
        gap: 10px;
        padding: 0 18px 18px;
      }
      .deck-proof-callout span,
      .deck-proof-highlight-kicker {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-proof-callout strong,
      .deck-proof-highlight strong {
        font-family: var(--deck-display);
        font-size: 24px;
        line-height: 1.02;
        color: var(--deck-ink);
      }
      .deck-proof-callout p,
      .deck-proof-highlight p {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        color: var(--deck-ink-soft);
      }
      .deck-proof-split {
        display: grid;
        grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
        align-items: stretch;
        height: 100%;
        min-height: 0;
      }
      .deck-proof-highlight {
        display: grid;
        align-content: center;
        gap: 10px;
        padding: 16px 18px 16px 0;
      }
      .deck-proof-token-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .deck-proof-token {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(21, 111, 106, 0.08);
        border: 1px solid rgba(21, 111, 106, 0.12);
        font-size: 12px;
        line-height: 1;
        color: var(--deck-accent);
      }
      .deck-proof-visual-caption {
        padding: 12px 16px 14px;
        border-top: 1px solid rgba(23, 33, 49, 0.08);
        font-size: 14px;
        line-height: 1.45;
        color: var(--deck-ink-soft);
        background: rgba(255, 252, 246, 0.9);
      }
      .deck-proof-badge-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .deck-proof-badge {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(21, 111, 106, 0.1);
        border: 1px solid rgba(21, 111, 106, 0.12);
        font-size: 13px;
        line-height: 1.2;
        color: var(--deck-accent);
      }
      .deck-slide-shell.deck-slide-shell-proof-reframe {
        padding: 56px 58px 52px;
        grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.02fr);
        gap: 24px;
      }
      .deck-slide-shell.deck-slide-shell-proof-reframe .deck-slide-copy {
        gap: 12px;
      }
      .deck-slide-shell.deck-slide-shell-proof-reframe h2 {
        font-size: clamp(42px, 4.1vw, 62px);
        max-width: none;
      }
      .deck-slide-shell.deck-slide-shell-proof-reframe .deck-lead {
        max-width: 24em;
        font-size: 21px;
        line-height: 1.38;
      }
      .deck-proof-copy-stack {
        display: grid;
        gap: 10px;
      }
      .deck-proof-copy-card {
        display: grid;
        gap: 8px;
        padding: 14px 18px;
        border-radius: var(--deck-radius-lg);
        border: 1px solid var(--deck-line);
        background: linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(246, 240, 231, 0.96) 100%);
        box-shadow: var(--deck-shadow);
      }
      .deck-proof-copy-step {
        font-size: 12px;
        line-height: 1.2;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-proof-copy-card strong {
        font-size: 19px;
        line-height: 1.02;
        font-family: var(--deck-display);
        color: var(--deck-ink);
      }
      .deck-proof-copy-card p {
        margin: 0;
        font-size: 16px;
        line-height: 1.45;
        color: var(--deck-ink-soft);
      }
      .deck-proof-reframe {
        display: grid;
        gap: 12px;
        align-content: start;
        min-height: 0;
        height: 100%;
      }
      .deck-proof-flowbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .deck-proof-flow-pill {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(23, 33, 49, 0.1);
        background: rgba(255, 251, 245, 0.92);
        box-shadow: var(--deck-shadow);
      }
      .deck-proof-flow-kicker {
        font-size: 10px;
        line-height: 1.2;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-proof-flow-pill strong {
        font-size: 18px;
        line-height: 1;
        font-family: var(--deck-display);
        color: var(--deck-ink);
      }
      .deck-proof-flow-connector {
        font-size: 22px;
        line-height: 1;
        color: var(--deck-accent);
      }
      .deck-proof-stage-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
        grid-template-rows: minmax(0, 0.94fr) minmax(0, 1.06fr);
        gap: 12px;
        min-height: 0;
        height: 100%;
      }
      .deck-proof-stage-card {
        display: grid;
        align-content: start;
        gap: 7px;
        min-height: 0;
        padding: 14px;
        border-radius: calc(var(--deck-radius-xl) + 2px);
        border: 1px solid var(--deck-line);
        background: linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(246, 240, 231, 0.97) 100%);
        box-shadow: var(--deck-shadow);
      }
      .deck-proof-stage-card-large {
        grid-row: span 2;
      }
      .deck-proof-stage-card:not(.deck-proof-stage-card-large) {
        padding: 13px;
        gap: 6px;
      }
      .deck-proof-stage-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .deck-proof-stage-step {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: 999px;
        background: rgba(21, 111, 106, 0.12);
        color: var(--deck-accent);
        font-size: 14px;
        line-height: 1;
        font-weight: 700;
      }
      .deck-proof-stage-label {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-proof-stage-title {
        font-family: var(--deck-display);
        font-size: 33px;
        line-height: 0.98;
        color: var(--deck-ink);
      }
      .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-title {
        font-size: 23px;
      }
      .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-subtitle {
        font-size: 12px;
        line-height: 1.3;
      }
      .deck-proof-stage-subtitle,
      .deck-proof-stage-foot {
        margin: 0;
        font-size: 13px;
        line-height: 1.36;
        color: var(--deck-ink-soft);
      }
      .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-shot-surface-stage {
        min-height: 98px;
      }
      .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-token {
        padding: 6px 8px;
        font-size: 11px;
      }
      .deck-proof-shot-surface-stage {
        margin: 0;
        min-height: 116px;
      }
      .deck-proof-shot-surface-stage-large {
        min-height: 270px;
      }
      .deck-shot-proof-stage {
        object-fit: cover;
      }
      .deck-slide-shell.deck-slide-shell-proof .deck-proof-gallery {
        height: 100%;
        min-height: 0;
      }
      .deck-slide-shell.deck-slide-shell-proof .deck-shot-stack,
      .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-stack {
        min-height: 0;
        grid-template-rows: repeat(2, minmax(0, 1fr));
      }
      .deck-slide-shell.deck-slide-shell-proof .deck-shot.small,
      .deck-slide-shell.deck-slide-shell-proof .deck-shot.deck-shot-tall,
      .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame,
      .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame-tall {
        height: 100%;
        min-height: 0;
      }
      .deck-shot.small {
        height: 280px;
        object-fit: cover;
        object-position: center;
      }
      .deck-shot.deck-shot-tall {
        height: 100%;
        min-height: 578px;
        object-fit: cover;
        object-position: top;
      }
      .deck-placeholder {
        min-height: 320px;
        display: grid;
        place-items: center;
        border-radius: var(--deck-radius-xl);
        border: 1px dashed var(--deck-line);
        color: var(--deck-ink-soft);
        background: var(--deck-panel);
      }
      .deck-final-card {
        display: grid;
        gap: 16px;
        align-content: center;
        min-height: 100%;
      }
      .deck-cta-link {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 999px;
        background: var(--deck-accent);
        color: #fff;
        text-decoration: none;
        font-size: 18px;
      }
      .deck-cta-link.secondary {
        background: rgba(22, 33, 50, 0.08);
        color: var(--deck-ink);
        border: 1px solid var(--deck-line);
      }
      .deck-link-stack {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .deck-reference-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .deck-reference-card {
        display: grid;
        gap: 8px;
        padding: 14px 16px;
        border-radius: var(--deck-radius-xl);
        border: 1px solid var(--deck-line);
        background: linear-gradient(180deg, rgba(255, 251, 245, 0.96) 0%, rgba(246, 240, 231, 0.96) 100%);
        box-shadow: var(--deck-shadow);
      }
      .deck-reference-card span {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .deck-reference-card strong {
        font-size: 18px;
        line-height: 1.3;
        color: var(--deck-ink);
      }
      .deck-reference-card code {
        font-size: 13px;
        line-height: 1.35;
        color: var(--deck-ink-soft);
        word-break: break-word;
      }
      .deck-reference-card-link {
        text-decoration: none;
      }
      .deck-reference-card-link:hover {
        transform: translateY(-1px);
        transition: transform 160ms ease;
      }
      .deck-footer-note {
        display: grid;
        gap: 8px;
      }
      .deck-footer-note p {
        margin: 0;
        font-size: 20px;
        color: var(--deck-ink-soft);
      }
      .deck-rehearsal-panel {
        position: fixed;
        left: 24px;
        bottom: 24px;
        z-index: 24;
        width: min(420px, calc(100vw - 48px));
        padding: 18px 20px;
        border-radius: var(--deck-radius-lg);
        background: rgba(255, 251, 246, 0.96);
        border: 1px solid var(--deck-line);
        box-shadow: var(--deck-shadow);
        display: grid;
        gap: 10px;
      }
      .deck-rehearsal-panel h3 {
        margin: 0;
        font-size: 22px;
      }
      .deck-rehearsal-panel p,
      .deck-rehearsal-panel li,
      .deck-rehearsal-panel a {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--deck-ink-soft);
      }
      .deck-rehearsal-panel ul {
        margin: 0;
        padding-left: 18px;
      }
      .deck-rehearsal-panel a {
        color: var(--deck-accent);
      }
      .deck-status-pill {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: ${deckStatusLabel === 'ready' ? 'rgba(46, 125, 81, 0.12)' : 'rgba(181, 93, 52, 0.14)'};
        color: ${deckStatusLabel === 'ready' ? '#2e7d51' : '#b55d34'};
        font-size: 13px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .deck-mobile-pager {
        display: none;
      }
      .reveal .progress {
        color: var(--deck-accent);
      }
      .reveal .controls {
        color: var(--deck-accent);
      }
      @media (min-width: 921px) {
        .reveal h2 {
          font-size: clamp(42px, 4.1vw, 74px);
        }
        .reveal p,
        .reveal li,
        .reveal span {
          font-size: 24px;
          line-height: 1.36;
        }
        .deck-slide-shell {
          padding: 54px 56px 44px;
          gap: 28px;
        }
        .deck-slide-copy {
          gap: 18px;
        }
        .deck-problem-card,
        .deck-persona-card,
        .deck-network-card,
        .deck-loop-card,
        .deck-credibility-card,
        .deck-cta-card {
          padding: 18px 20px;
        }
        .deck-problem-card strong,
        .deck-persona-card strong,
        .deck-network-card strong,
        .deck-loop-card strong,
        .deck-credibility-card strong,
        .deck-cta-card strong,
        .deck-final-card h3 {
          font-size: 24px;
        }
        .deck-problem-card span,
        .deck-persona-card span,
        .deck-network-card span,
        .deck-loop-card span,
        .deck-credibility-card span,
        .deck-cta-card span,
        .deck-final-card p {
          font-size: 18px;
        }
        .deck-network-card small,
        .deck-proof-card span {
          font-size: 13px;
        }
        .deck-proof-card strong {
          font-size: 23px;
        }
        .deck-flow-step {
          min-height: 104px;
          padding: 14px 12px;
          gap: 6px;
        }
        .deck-real-loop {
          gap: 10px;
        }
        .deck-real-input,
        .deck-real-stage {
          padding: 14px 16px;
        }
        .deck-real-input strong,
        .deck-real-stage strong {
          font-size: 21px;
        }
        .deck-real-input p,
        .deck-real-stage p,
        .deck-real-chip {
          font-size: 14px;
        }
        .deck-real-kicker {
          font-size: 11px;
        }
        .deck-flow-step strong {
          font-size: 20px;
        }
        .deck-flow-step span,
        .deck-flow-arrow {
          font-size: 15px;
        }
        .deck-flow-arrow {
          flex-basis: 22px;
        }
        .deck-shot.small {
          height: 236px;
        }
        .deck-shot.deck-shot-tall {
          min-height: 460px;
        }
        .deck-proof-visual-head {
          padding: 12px 14px 11px;
        }
        .deck-proof-visual-head strong {
          font-size: 22px;
        }
        .deck-proof-visual-head span {
          font-size: 10px;
        }
        .deck-proof-callout strong,
        .deck-proof-highlight strong {
          font-size: 20px;
        }
        .deck-proof-callout p,
        .deck-proof-highlight p {
          font-size: 12px;
        }
        .deck-proof-token {
          font-size: 11px;
          padding: 6px 9px;
        }
        .deck-proof-visual-caption {
          padding: 10px 12px 12px;
          font-size: 12px;
        }
        .deck-proof-badge {
          padding: 7px 10px;
          font-size: 12px;
        }
        .deck-reference-card {
          padding: 12px 14px;
        }
        .deck-reference-card strong {
          font-size: 16px;
        }
        .deck-reference-card code {
          font-size: 12px;
        }
        .deck-proof-copy-card {
          padding: 16px 18px;
        }
        .deck-proof-copy-card strong {
          font-size: 21px;
        }
        .deck-proof-copy-card p {
          font-size: 14px;
        }
        .deck-proof-flow-pill {
          padding: 8px 12px;
        }
        .deck-proof-flow-pill strong {
          font-size: 16px;
        }
        .deck-proof-stage-card {
          padding: 16px;
        }
        .deck-proof-stage-title {
          font-size: 30px;
        }
        .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-title {
          font-size: 24px;
        }
        .deck-proof-stage-subtitle,
        .deck-proof-stage-foot {
          font-size: 13px;
        }
        .deck-proof-shot-surface-stage {
          min-height: 126px;
        }
        .deck-proof-shot-surface-stage-large {
          min-height: 276px;
        }
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.small,
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.deck-shot-tall,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame-tall {
          height: 100%;
          min-height: 0;
        }
        .deck-ribbon {
          top: 14px;
          right: 16px;
          padding: 9px 14px;
        }
      }
      @media (min-width: 921px) and (max-height: 980px) {
        .deck-slide-shell {
          padding: 44px 48px 34px;
          gap: 22px;
        }
        .reveal h2 {
          font-size: clamp(38px, 3.7vw, 64px);
        }
        .reveal p,
        .reveal li,
        .reveal span {
          font-size: 21px;
        }
        .deck-check-list,
        .deck-bullet-stack,
        .deck-chip-row,
        .deck-inline-flow,
        .deck-problem-grid,
        .deck-persona-grid,
        .deck-proof-grid,
        .deck-three-column,
        .deck-cta-grid,
        .deck-network-grid,
        .deck-proof-strip,
        .deck-real-loop,
        .deck-proof-visual-stack,
        .deck-shot-stack,
        .deck-proof-gallery {
          gap: 12px;
        }
        .deck-problem-card,
        .deck-inline-pill,
        .deck-persona-card,
        .deck-network-card,
        .deck-loop-card,
        .deck-credibility-card,
        .deck-cta-card,
        .deck-proof-card {
          padding: 14px 16px;
        }
        .deck-shot.small {
          height: 210px;
        }
        .deck-shot.deck-shot-tall {
          min-height: 408px;
        }
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.small,
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.deck-shot-tall,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame-tall {
          height: 100%;
          min-height: 0;
        }
        .deck-proof-visual-head {
          padding: 12px 14px 11px;
        }
        .deck-proof-visual-head strong {
          font-size: 20px;
        }
        .deck-proof-visual-head span,
        .deck-proof-badge {
          font-size: 11px;
        }
        .deck-proof-callout {
          padding: 0 14px 14px;
          gap: 8px;
        }
        .deck-proof-callout strong,
        .deck-proof-highlight strong {
          font-size: 18px;
        }
        .deck-proof-callout p,
        .deck-proof-highlight p {
          font-size: 12px;
        }
        .deck-proof-token {
          font-size: 10px;
          padding: 6px 8px;
        }
        .deck-proof-visual-caption {
          padding: 10px 12px 12px;
          font-size: 12px;
        }
        .deck-reference-row {
          gap: 10px;
        }
        .deck-reference-card {
          padding: 12px 14px;
        }
        .deck-reference-card strong {
          font-size: 15px;
        }
        .deck-reference-card code {
          font-size: 11px;
        }
        .deck-slide-shell.deck-slide-shell-proof-reframe {
          padding: 50px 48px 46px;
          gap: 22px;
        }
        .deck-proof-copy-card {
          padding: 14px 16px;
        }
        .deck-proof-copy-card strong {
          font-size: 19px;
        }
        .deck-proof-copy-card p {
          font-size: 13px;
        }
        .deck-proof-flowbar {
          gap: 8px;
        }
        .deck-proof-flow-pill {
          padding: 8px 11px;
        }
        .deck-proof-flow-pill strong {
          font-size: 15px;
        }
        .deck-proof-flow-connector {
          font-size: 18px;
        }
        .deck-proof-stage-card {
          padding: 14px;
          gap: 8px;
        }
        .deck-proof-stage-step {
          width: 34px;
          height: 34px;
          font-size: 13px;
        }
        .deck-proof-stage-title {
          font-size: 26px;
        }
        .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-title {
          font-size: 21px;
        }
        .deck-proof-stage-subtitle,
        .deck-proof-stage-foot {
          font-size: 12px;
        }
        .deck-proof-shot-surface-stage {
          min-height: 104px;
        }
        .deck-proof-shot-surface-stage-large {
          min-height: 214px;
        }
        .deck-real-input,
        .deck-real-stage {
          padding: 14px 16px;
        }
        .deck-real-input strong,
        .deck-real-stage strong {
          font-size: 20px;
        }
        .deck-real-input p,
        .deck-real-stage p,
        .deck-real-chip {
          font-size: 14px;
        }
      }
      @media (max-width: 1180px) {
        .deck-slide-shell {
          grid-template-columns: 1fr;
          gap: 26px;
          padding: 170px 34px 96px;
        }
        .deck-three-column,
        .deck-proof-grid,
        .deck-cta-grid,
        .deck-problem-grid,
        .deck-persona-grid,
        .deck-network-grid,
        .deck-proof-gallery {
          grid-template-columns: 1fr;
        }
        .deck-flow {
          flex-direction: column;
        }
        .deck-video-dock {
          width: min(420px, calc(100vw - 68px));
        }
        .deck-video-dock-help-links {
          align-items: stretch;
        }
        .deck-inline-flow {
          gap: 10px;
        }
        .deck-real-chip-row {
          gap: 7px;
        }
        .deck-slide-shell.deck-slide-shell-proof-reframe {
          gap: 24px;
        }
        .deck-proof-stage-grid {
          grid-template-columns: 1fr;
          grid-template-rows: auto;
          height: auto;
        }
        .deck-proof-stage-card-large {
          grid-row: auto;
        }
        .deck-proof-flowbar {
          gap: 8px;
        }
        .deck-proof-flow-connector {
          display: none;
        }
        .deck-proof-copy-card strong {
          font-size: 22px;
        }
        .deck-proof-stage-title {
          font-size: 28px;
        }
        .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-title {
          font-size: 24px;
        }
        .deck-proof-split {
          grid-template-columns: 1fr;
        }
        .deck-proof-shot-surface {
          margin: 14px 14px 8px;
          min-height: 132px;
        }
        .deck-proof-shot-surface-stage,
        .deck-proof-shot-surface-stage-large {
          min-height: 220px;
        }
        .deck-proof-shot-surface-tall {
          margin-bottom: 10px;
        }
        .deck-proof-highlight {
          padding: 0 14px 14px;
        }
        .deck-reference-row {
          grid-template-columns: 1fr;
        }
        .deck-proof-visual-frame {
          height: 228px;
        }
        .deck-proof-visual-frame-tall {
          height: 420px;
        }
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-gallery,
        .deck-slide-shell.deck-slide-shell-proof .deck-shot-stack,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-stack {
          height: auto;
        }
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.small,
        .deck-slide-shell.deck-slide-shell-proof .deck-shot.deck-shot-tall,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame,
        .deck-slide-shell.deck-slide-shell-proof .deck-proof-visual-frame-tall {
          height: auto;
        }
        .deck-flow-arrow {
          transform: rotate(90deg);
          min-height: 26px;
        }
        .deck-rehearsal-panel {
          position: static;
          width: auto;
          margin: 24px;
        }
      }
      @media (max-width: 920px) {
        html,
        body {
          height: auto !important;
          min-height: 100%;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
          touch-action: pan-y;
        }
        .reveal-viewport,
        .reveal {
          width: 100% !important;
          min-height: 100% !important;
          height: auto !important;
          overflow: visible !important;
          touch-action: pan-y !important;
        }
        .reveal .slides {
          width: 100% !important;
          height: auto !important;
          transform: none !important;
          position: static !important;
          left: auto !important;
          top: auto !important;
          overflow: visible !important;
          display: block !important;
          perspective: none !important;
          pointer-events: auto !important;
        }
        .reveal .slides > section {
          position: relative !important;
          display: block !important;
          width: auto !important;
          height: auto !important;
          opacity: 1 !important;
          min-height: 100vh !important;
          transform: none !important;
          left: auto !important;
          top: auto !important;
          margin: 0 !important;
          page-break-after: always;
          scroll-snap-align: start;
        }
        .deck-slide-shell {
          min-height: 100vh;
          height: auto;
          padding: 104px 20px 42px;
          gap: 20px;
        }
        .reveal h2 {
          font-size: clamp(38px, 13vw, 54px);
          max-width: none;
        }
        .reveal p,
        .reveal li,
        .reveal span {
          font-size: 18px;
        }
        .deck-quote-card,
        .deck-contrast-card,
        .deck-final-card {
          padding: 24px 20px;
        }
        .deck-shot.small {
          height: 220px;
        }
        .deck-shot.deck-shot-tall {
          min-height: 300px;
          height: 300px;
        }
        .deck-chip-row,
        .deck-inline-flow,
        .deck-real-chip-row,
        .deck-proof-badge-row {
          flex-direction: column;
          align-items: stretch;
        }
        .deck-real-chip {
          justify-content: center;
        }
        .deck-proof-badge {
          justify-content: center;
        }
        .deck-proof-flowbar {
          flex-direction: column;
          align-items: stretch;
        }
        .deck-proof-flow-pill {
          width: 100%;
        }
        .deck-proof-flow-connector {
          display: none;
        }
        .deck-proof-stage-grid {
          grid-template-columns: 1fr;
          grid-template-rows: auto;
          height: auto;
        }
        .deck-proof-stage-card-large {
          grid-row: auto;
        }
        .deck-proof-copy-card strong {
          font-size: 21px;
        }
        .deck-proof-copy-card p,
        .deck-proof-stage-subtitle,
        .deck-proof-stage-foot {
          font-size: 14px;
        }
        .deck-proof-stage-title,
        .deck-proof-stage-card:not(.deck-proof-stage-card-large) .deck-proof-stage-title {
          font-size: 26px;
        }
        .deck-proof-split {
          grid-template-columns: 1fr;
        }
        .deck-proof-shot-surface {
          margin: 14px 14px 8px;
          min-height: 132px;
        }
        .deck-proof-shot-surface-stage,
        .deck-proof-shot-surface-stage-large {
          min-height: 186px;
        }
        .deck-proof-shot-surface-tall {
          margin-bottom: 10px;
        }
        .deck-proof-highlight {
          padding: 0 14px 14px;
        }
        .deck-reference-row {
          grid-template-columns: 1fr;
        }
        .deck-proof-visual-frame {
          height: 220px;
        }
        .deck-proof-visual-frame-tall {
          min-height: 300px;
          height: 300px;
        }
        .reveal .controls,
        .reveal .progress,
        .deck-ribbon,
        .deck-video-dock {
          display: none;
        }
        .deck-mobile-pager {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 25;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid var(--deck-line);
          background: rgba(255, 252, 246, 0.96);
          box-shadow: var(--deck-shadow);
          backdrop-filter: blur(10px);
        }
        .deck-mobile-pager button {
          width: 38px;
          height: 38px;
          border: 1px solid var(--deck-line);
          border-radius: 999px;
          background: var(--deck-panel);
          color: var(--deck-ink);
          font: inherit;
          font-size: 18px;
          line-height: 1;
          display: inline-grid;
          place-items: center;
          padding: 0;
          touch-action: manipulation;
        }
        .deck-mobile-pager button[disabled] {
          opacity: 0.38;
        }
        .deck-mobile-pager-output {
          min-width: 52px;
          text-align: center;
          font-size: 14px;
          color: var(--deck-ink-soft);
        }
      }
      @media print {
        body {
          background: #fff;
        }
        .deck-ribbon,
        .deck-rehearsal-panel,
        .reveal .controls,
        .reveal .progress {
          display: none !important;
        }
        .reveal .slides section {
          page-break-after: always;
        }
      }
    </style>
  </head>
  <body class="deck-mode">
    ${renderDeckVideoDock()}
    <div class="deck-ribbon">
      <strong>SocialOS VC Deck</strong>
      <span class="deck-status-pill">${escapeHtml(deckStatusLabel)}</span>
      <span>${escapeHtml(readOptionalString(deckStatus.generatedAt, 'generated status unavailable'))}</span>
    </div>
    <div class="reveal">
      <div class="slides">
        ${slideMarkup}
      </div>
    </div>
    <nav class="deck-mobile-pager" aria-label="Mobile deck navigation">
      <button type="button" data-deck-mobile-prev aria-label="Previous slide">‹</button>
      <span class="deck-mobile-pager-output" data-deck-mobile-current>1 / ${slideCount}</span>
      <button type="button" data-deck-mobile-next aria-label="Next slide">›</button>
    </nav>
    ${
      rehearsalMode
        ? `<aside class="deck-rehearsal-panel">
            <h3>Rehearsal mode</h3>
            <p>Use arrow keys or space to move through the deck. Press <strong>S</strong> for Reveal speaker notes if the browser allows a notes window.</p>
            <p><strong>Local rehearsal URLs</strong></p>
            <ul>
              <li><a href="http://127.0.0.1:4173/quick-capture">Workspace</a></li>
              <li><a href="http://127.0.0.1:4173/people">Contacts</a></li>
              <li><a href="http://127.0.0.1:4173/events">Logbook</a></li>
              <li><a href="http://127.0.0.1:4173/drafts">Drafts</a></li>
              <li><a href="http://127.0.0.1:4173/queue">Queue</a></li>
              <li><a href="http://127.0.0.1:4173/self-mirror">Mirror</a></li>
            </ul>
            <p><strong>Default ask:</strong> design partners + intros, not a priced round.</p>
          </aside>`
        : ''
    }
    <script>${revealJs}</script>
    <script>${revealNotesJs}</script>
    <script>
      const useMobileStack = window.matchMedia('(max-width: 920px)').matches;
      const usePrintDeck = ${printPdf ? 'true' : 'false'};
      const getDesktopDeckGeometry = () => {
        if (usePrintDeck) {
          return {
            margin: 0.03,
            width: 1680,
            height: 945,
          };
        }
        return {
          margin: 0,
          width: Math.max(1280, window.innerWidth),
          height: Math.max(720, window.innerHeight),
        };
      };
      document.documentElement.setAttribute('data-deck-mobile', useMobileStack ? 'true' : 'false');
      const mobileSections = Array.from(document.querySelectorAll('.reveal .slides > section'));
      const mobilePager = document.querySelector('.deck-mobile-pager');
      const mobilePrevButton = document.querySelector('[data-deck-mobile-prev]');
      const mobileNextButton = document.querySelector('[data-deck-mobile-next]');
      const mobileCurrentOutput = document.querySelector('[data-deck-mobile-current]');
      const readMobileHashIndex = () => {
        const hash = String(window.location.hash || '');
        if (!hash.startsWith('#/')) return 0;
        const index = Number(hash.slice(2));
        if (!Number.isFinite(index)) return 0;
        return Math.min(Math.max(index, 0), Math.max(mobileSections.length - 1, 0));
      };
      const writeMobileHashIndex = (index) => {
        const nextHash = '#/' + index;
        if (window.location.hash !== nextHash) {
          window.history.replaceState(null, '', nextHash);
        }
      };
      const initMobileDeck = () => {
        if (!mobileSections.length) {
          return;
        }
        let mobileCurrentIndex = 0;
        let mobileSyncFrame = null;
        let mobileProgrammaticScroll = false;
        const updateMobilePager = () => {
          if (mobileCurrentOutput) {
            mobileCurrentOutput.textContent = String(mobileCurrentIndex + 1) + ' / ' + String(mobileSections.length);
          }
          if (mobilePrevButton) {
            mobilePrevButton.disabled = mobileCurrentIndex <= 0;
          }
          if (mobileNextButton) {
            mobileNextButton.disabled = mobileCurrentIndex >= mobileSections.length - 1;
          }
        };
        const syncMobileIndexFromScroll = () => {
          const viewportAnchor = window.scrollY + window.innerHeight * 0.35;
          let bestIndex = 0;
          let bestDistance = Number.POSITIVE_INFINITY;
          mobileSections.forEach((section, index) => {
            const distance = Math.abs(section.offsetTop - viewportAnchor);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          });
          mobileCurrentIndex = bestIndex;
          updateMobilePager();
          if (!mobileProgrammaticScroll) {
            writeMobileHashIndex(mobileCurrentIndex);
          }
        };
        const scrollToMobileIndex = (index, behavior = 'smooth', shouldWriteHash = true) => {
          const nextIndex = Math.min(Math.max(index, 0), mobileSections.length - 1);
          mobileCurrentIndex = nextIndex;
          mobileProgrammaticScroll = true;
          updateMobilePager();
          window.scrollTo({
            top: mobileSections[nextIndex].offsetTop,
            behavior,
          });
          if (shouldWriteHash) {
            writeMobileHashIndex(nextIndex);
          }
          window.setTimeout(() => {
            mobileProgrammaticScroll = false;
            syncMobileIndexFromScroll();
          }, behavior === 'smooth' ? 420 : 0);
        };
        if (mobilePager) {
          mobilePager.hidden = false;
        }
        if (mobilePrevButton) {
          mobilePrevButton.addEventListener('click', () => scrollToMobileIndex(mobileCurrentIndex - 1));
        }
        if (mobileNextButton) {
          mobileNextButton.addEventListener('click', () => scrollToMobileIndex(mobileCurrentIndex + 1));
        }
        window.addEventListener(
          'scroll',
          () => {
            if (mobileSyncFrame) {
              cancelAnimationFrame(mobileSyncFrame);
            }
            mobileSyncFrame = requestAnimationFrame(syncMobileIndexFromScroll);
          },
          { passive: true }
        );
        window.addEventListener('hashchange', () => {
          scrollToMobileIndex(readMobileHashIndex(), 'smooth', false);
        });
        scrollToMobileIndex(readMobileHashIndex(), 'auto', false);
        updateMobilePager();
      };
      if (useMobileStack && !usePrintDeck) {
        initMobileDeck();
      }
      if (!useMobileStack || usePrintDeck) {
        const revealInit = Reveal.initialize({
          hash: true,
          controls: true,
          progress: true,
          slideNumber: 'c/t',
          transition: 'fade',
          ...getDesktopDeckGeometry(),
          center: false,
          plugins: [ window.RevealNotes ].filter(Boolean)
        });
        Promise.resolve(revealInit).then(() => {
          if (usePrintDeck) {
            return;
          }
          let resizeFrame = null;
          const syncDeckGeometry = () => {
            Reveal.configure(getDesktopDeckGeometry());
            Reveal.layout();
          };
          window.addEventListener(
            'resize',
            () => {
              if (window.matchMedia('(max-width: 920px)').matches) {
                return;
              }
              if (resizeFrame) {
                cancelAnimationFrame(resizeFrame);
              }
              resizeFrame = requestAnimationFrame(syncDeckGeometry);
            },
            { passive: true }
          );
          syncDeckGeometry();
        });
      }
    </script>
  </body>
</html>`;
}

async function renderPageBody(page, requestUrl) {
  switch (page.id) {
    case 'cockpit':
      return renderCockpitPage(page);
    case 'quick-capture':
      return renderQuickCapturePage(page, requestUrl);
    case 'demo':
      return renderDemoPage(page, requestUrl);
    case 'hackathon':
      return renderHackathonPage(page, requestUrl);
    case 'buddy':
      return renderBuddyPage(page, requestUrl);
    case 'ask':
      return renderAskPage(page, requestUrl);
    case 'deck':
      return '';
    case 'people':
      return renderPeoplePage(page, requestUrl);
    case 'events':
      return renderEventsPage(page, requestUrl);
    case 'drafts':
      return renderDraftsPage(page, requestUrl);
    case 'queue':
      return renderQueuePage(page);
    case 'self-mirror':
      return renderSelfMirrorPage(page, requestUrl);
    case 'studio':
      return renderStudioPage(page, requestUrl);
    case 'dev-digest':
      return renderDevDigestPage(page);
    case 'settings':
      return renderStudioPage(
        {
          ...page,
          id: 'studio',
          title: 'Studio',
          path: '/studio',
        },
        requestUrl
      );
    default:
      return `
        ${renderHero(page)}
        ${renderPanel('Page Unavailable', renderEmptyState('No renderer implemented for this page.'))}
      `;
  }
}

function renderClientScript() {
  return `
    <script>
      const apiBase = ${JSON.stringify(resolveApiBaseUrl())};
      const flashKey = 'socialos.dashboard.flash';
      const captureState = {
        assets: [],
        sourceAssets: [],
        workspaceResponses: new Map(),
        recorder: null,
        recordChunks: [],
        recognition: null,
        liveTranscript: '',
        recognitionWaiter: null,
        resolveRecognitionWaiter: null,
        audioContext: null,
        audioSource: null,
        audioAnalyser: null,
        meterFrame: 0,
      };

      function parseMaybeJson(text) {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return { raw: text };
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function buildWorkspaceHrefClient(params = {}) {
        const url = new URL('/quick-capture', window.location.origin);
        for (const [key, rawValue] of Object.entries(params)) {
          const value = String(rawValue || '').trim();
          if (value) url.searchParams.set(key, value);
        }
        return url.pathname + url.search;
      }

      function normalizeWorkspaceHrefClient(href) {
        const raw = String(href || '').trim();
        if (!raw) return '/quick-capture';
        if (raw.startsWith('/people/')) {
          return buildWorkspaceHrefClient({ panel: 'people', contactId: decodeURIComponent(raw.replace(/^\\/people\\//u, '')) });
        }
        if (raw === '/people') return buildWorkspaceHrefClient({ panel: 'people' });
        if (raw.startsWith('/events/')) {
          return buildWorkspaceHrefClient({ panel: 'events', eventId: decodeURIComponent(raw.replace(/^\\/events\\//u, '')) });
        }
        if (raw === '/events') return buildWorkspaceHrefClient({ panel: 'events' });
        if (raw.startsWith('/self-mirror')) return buildWorkspaceHrefClient({ panel: 'mirror' });
        if (raw.startsWith('/ask')) {
          try {
            const parsed = new URL(raw, window.location.origin);
            return buildWorkspaceHrefClient({ q: parsed.searchParams.get('q') || '' });
          } catch {
            return buildWorkspaceHrefClient();
          }
        }
        return raw;
      }

      function formDataToJson(form) {
        const data = {};
        const formData = new FormData(form);
        for (const [key, rawValue] of formData.entries()) {
          let value = rawValue;
          if (value === 'true') value = true;
          if (value === 'false') value = false;

          if (Object.prototype.hasOwnProperty.call(data, key)) {
            if (!Array.isArray(data[key])) data[key] = [data[key]];
            data[key].push(value);
          } else {
            data[key] = value;
          }
        }

        const jsonFields = (form.dataset.jsonFields || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        for (const field of jsonFields) {
          if (typeof data[field] === 'string' && data[field].trim()) {
            data[field] = JSON.parse(data[field]);
          }
        }

        return data;
      }

      function renderWorkspaceField(label, controlHtml, hint = '') {
        return '<label class="field">' +
          '<span>' + escapeHtml(label) + '</span>' +
          controlHtml +
          (hint ? '<small>' + escapeHtml(hint) + '</small>' : '') +
        '</label>';
      }

      function renderResult(resultNode, payload) {
        if (!resultNode) return;
        resultNode.innerHTML = '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
      }

      function renderWorkspaceComposerResult(resultNode, message = '', ok = true) {
        if (!resultNode) return;
        if (!message) {
          resultNode.innerHTML = '';
          resultNode.hidden = true;
          return;
        }
        resultNode.hidden = false;
        resultNode.innerHTML =
          '<div class="result-block' + (ok ? '' : ' result-block-warn') + '">' +
            '<p>' + escapeHtml(message) + '</p>' +
          '</div>';
      }

      function getTranscriptPreviewNode() {
        return document.querySelector('[data-transcript-preview]');
      }

      function setTranscriptPreview(text = '', tone = 'neutral') {
        const previewNode = getTranscriptPreviewNode();
        if (!previewNode) return;
        const value = String(text || '').trim();
        if (!value || tone === 'ready') {
          previewNode.hidden = true;
          previewNode.dataset.tone = '';
          previewNode.innerHTML = '';
          return;
        }

        const label = tone === 'live' ? 'Listening' : 'Transcript note';
        const displayText = value;
        previewNode.hidden = false;
        previewNode.dataset.tone = tone;
        previewNode.innerHTML =
          '<strong>' + escapeHtml(label) + '</strong>' +
          '<p>' + escapeHtml(displayText) + '</p>';
      }

      function mergeTranscriptIntoComposer(form, transcript) {
        const textField = form?.elements?.text;
        const incoming = String(transcript || '').trim();
        if (!textField || !incoming) return '';

        const currentValue = String(textField.value || '').trim();
        const nextValue = currentValue ? currentValue.replace(/\s+$/u, '') + '\\n\\n' + incoming : incoming;
        textField.value = nextValue;
        textField.focus();
        textField.setSelectionRange(nextValue.length, nextValue.length);
        return nextValue;
      }

      function isInvalidContactDraftName(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return !normalized || [
          'new contact',
          'new contact draft',
          'unconfirmed contact',
          'unknown contact',
          'contact',
          'person',
          'someone',
          '\\u65b0\\u8054\\u7cfb\\u4eba',
          '\\u672a\\u786e\\u8ba4\\u8054\\u7cfb\\u4eba',
          '\\u8054\\u7cfb\\u4eba',
          '\\u67d0\\u4eba',
          '\\u67d0\\u4f4d\\u8054\\u7cfb\\u4eba',
        ].includes(normalized);
      }

      function serializeIdentityLines(identities) {
        return (Array.isArray(identities) ? identities : [])
          .map((item) => [item?.platform || '', item?.handle || '', item?.url || '', item?.note || ''].join('|'))
          .join('\\n');
      }

      function updateWorkspaceContactReviewState(form) {
        if (!(form instanceof HTMLFormElement)) return;
        const nameInput = form.elements.personName;
        const submitButton = form.querySelector('[data-review-submit]');
        const warningNode = form.querySelector('[data-review-warning]');
        const invalid = isInvalidContactDraftName(nameInput?.value || '');
        if (submitButton) submitButton.disabled = invalid;
        if (warningNode) {
          warningNode.hidden = !invalid;
        }
      }

      function flashMessage(flash) {
        const banner = document.querySelector('[data-flash]');
        if (!banner || !flash) return;
        banner.hidden = false;
        banner.className = flash.ok ? 'flash ok' : 'flash fail';
        banner.innerHTML = '<strong>' + (flash.ok ? 'Updated' : 'Action failed') + '</strong><span>' + String(flash.message || 'No message') + '</span>';
      }

      function consumeFlash() {
        const raw = sessionStorage.getItem(flashKey);
        if (!raw) return;
        sessionStorage.removeItem(flashKey);
        try {
          flashMessage(JSON.parse(raw));
        } catch {}
      }

      function updateCaptureAssetInputs() {
        const value = captureState.assets.map((asset) => asset.assetId).join(',');
        const sourceValue = captureState.sourceAssets.map((asset) => asset.assetId).join(',');
        for (const input of document.querySelectorAll('[data-capture-asset-ids]')) {
          input.value = value;
        }
        for (const input of document.querySelectorAll('[data-source-asset-ids]')) {
          input.value = sourceValue;
        }
        renderWorkspaceAssets();
      }

      function appendCaptureAsset(asset) {
        if (!asset || !asset.assetId) return;
        if (!captureState.assets.some((entry) => entry.assetId === asset.assetId)) {
          captureState.assets.push(asset);
        }
        updateCaptureAssetInputs();
      }

      function appendSourceAsset(asset) {
        if (!asset || !asset.assetId) return;
        if (!captureState.sourceAssets.some((entry) => entry.assetId === asset.assetId)) {
          captureState.sourceAssets.push(asset);
        }
        updateCaptureAssetInputs();
      }

      function removeCaptureAsset(assetId) {
        captureState.assets = captureState.assets.filter((asset) => asset.assetId !== assetId);
        updateCaptureAssetInputs();
      }

      function removeSourceAsset(assetId) {
        captureState.sourceAssets = captureState.sourceAssets.filter((asset) => asset.assetId !== assetId);
        updateCaptureAssetInputs();
      }

      function findStoredSourceAsset(assetId) {
        return captureState.sourceAssets.find((asset) => asset.assetId === assetId) || null;
      }

      function renderVoiceSourceActions(asset = null) {
        const node = document.querySelector('[data-voice-source-actions]');
        if (!node) return;
        if (!asset || !asset.assetId) {
          node.hidden = true;
          node.innerHTML = '';
          return;
        }

        node.hidden = false;
        node.innerHTML =
          '<div class="voice-source-note">' +
            '<strong>Original voice saved locally.</strong>' +
            '<span>The transcript will send as text. Add the voice attachment only if you want to send the audio itself.</span>' +
            '<div class="voice-source-note-actions">' +
              '<button type="button" class="secondary-button" data-attach-source-voice="' + escapeHtml(asset.assetId) + '">Attach voice</button>' +
              '<button type="button" class="ghost-button" data-dismiss-source-voice="' + escapeHtml(asset.assetId) + '">Keep transcript only</button>' +
            '</div>' +
          '</div>';
      }

      function renderWorkspaceAssets() {
        const tray = document.querySelector('[data-workspace-assets]');
        if (!tray) return;
        if (!captureState.assets.length) {
          tray.innerHTML = '';
          tray.hidden = true;
          return;
        }

        tray.hidden = false;
        tray.innerHTML = captureState.assets
          .map((asset) => {
            const label = asset.kind === 'audio' ? 'voice' : asset.kind === 'image' ? 'image' : 'asset';
            const preview =
              asset.kind === 'audio'
                ? (asset.fileName || 'Voice note attached')
                : (asset.fileName || asset.previewText || asset.assetId);
            return '<span class="asset-chip">' +
              '<strong>' + escapeHtml(label) + '</strong>' +
              '<span>' + escapeHtml(preview.slice(0, 48)) + '</span>' +
              '<button type="button" class="asset-remove" data-remove-asset="' + escapeHtml(asset.assetId) + '">x</button>' +
            '</span>';
          })
          .join('');
      }

      function parseIdentityLines(value) {
        return String(value || '')
          .split(/\\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [platform = '', handle = '', url = '', note = ''] = line.split('|');
            return {
              platform: platform.trim(),
              handle: handle.trim(),
              url: url.trim(),
              note: note.trim(),
            };
          })
          .filter((item) => item.platform && (item.handle || item.url));
      }

      function setButtonBusy(submitter, busy) {
        if (!submitter) return;
        if (busy) {
          submitter.disabled = true;
          submitter.dataset.originalLabel = submitter.textContent;
          submitter.textContent = 'Working...';
        } else {
          const locked = submitter.dataset.locked === 'true';
          submitter.disabled = locked;
          submitter.textContent = submitter.dataset.originalLabel || 'Submit';
        }
      }

      async function apiRequest(endpoint, payload, method = 'POST') {
        const response = await fetch(apiBase + endpoint, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          payload: parseMaybeJson(text),
        };
      }

      async function encodeFileAsDataUrl(file) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      }

      function getAudioMeterBars() {
        return Array.from(document.querySelectorAll('[data-audio-meter-bar]'));
      }

      function setAudioMeterLevel(level) {
        const bars = getAudioMeterBars();
        if (!bars.length) return;
        bars.forEach((bar, index) => {
          const position = index / Math.max(bars.length - 1, 1);
          const strength = Math.max(0.2, Math.min(1, level * 2.1 - position * 0.72));
          bar.style.transform = 'scaleY(' + strength.toFixed(3) + ')';
          bar.classList.toggle('live', strength > 0.32);
        });
      }

      function stopAudioMeter() {
        if (captureState.meterFrame) {
          cancelAnimationFrame(captureState.meterFrame);
          captureState.meterFrame = 0;
        }
        if (captureState.audioSource) {
          captureState.audioSource.disconnect();
          captureState.audioSource = null;
        }
        if (captureState.audioContext) {
          captureState.audioContext.close().catch(() => {});
          captureState.audioContext = null;
        }
        captureState.audioAnalyser = null;
        setAudioMeterLevel(0);
      }

      async function startAudioMeter(stream) {
        stopAudioMeter();
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;
        captureState.audioContext = new AudioContextCtor();
        captureState.audioSource = captureState.audioContext.createMediaStreamSource(stream);
        captureState.audioAnalyser = captureState.audioContext.createAnalyser();
        captureState.audioAnalyser.fftSize = 512;
        captureState.audioSource.connect(captureState.audioAnalyser);
        const sampleBuffer = new Float32Array(captureState.audioAnalyser.fftSize);

        const updateMeter = () => {
          if (!captureState.audioAnalyser) return;
          captureState.audioAnalyser.getFloatTimeDomainData(sampleBuffer);
          let sum = 0;
          for (const sample of sampleBuffer) {
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / sampleBuffer.length);
          setAudioMeterLevel(Math.min(1, rms * 8));
          captureState.meterFrame = requestAnimationFrame(updateMeter);
        };

        updateMeter();
      }

      function getWorkspaceThread() {
        return document.querySelector('[data-workspace-thread]');
      }

      function appendWorkspaceHtml(html) {
        const thread = getWorkspaceThread();
        if (!thread) return;
        thread.insertAdjacentHTML('beforeend', html);
        thread.scrollTop = thread.scrollHeight;
      }

      function appendWorkspaceUserTurn(text, assets) {
        const assetSummary = Array.isArray(assets) && assets.length
          ? '<div class="chip-row">' + assets.map((asset) => '<span class="pill tone-soft">' + escapeHtml(asset.fileName || asset.assetId) + '</span>').join('') + '</div>'
          : '';
        const fallbackText = Array.isArray(assets) && assets.length
          ? assets.every((asset) => asset.kind === 'audio')
            ? '[voice message]'
            : assets.every((asset) => asset.kind === 'image')
              ? '[image attachment]'
              : '[attachment]'
          : '[message]';
        appendWorkspaceHtml(
          '<article class="chat-bubble user">' +
            '<div class="stack-meta"><span>you</span><span>' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</span></div>' +
            (text ? '<p>' + escapeHtml(text) + '</p>' : '<p>' + escapeHtml(fallbackText) + '</p>') +
            assetSummary +
          '</article>'
        );
      }

      function appendWorkspaceSystemTurn(title, body, actions = '') {
        appendWorkspaceHtml(
          '<article class="chat-bubble system">' +
            '<div class="stack-meta"><strong>' + escapeHtml(title) + '</strong><span>agent</span></div>' +
            '<div>' + body + '</div>' +
            actions +
          '</article>'
        );
      }

      function renderWorkspacePresentationCard(card, compact = false) {
        if (!card || !card.title) return '';
        const badges = Array.isArray(card.badges) ? card.badges.filter(Boolean) : [];
        const detailLines = Array.isArray(card.detailLines) ? card.detailLines.filter(Boolean) : [];
        return '<section class="stack-card ' + (compact ? 'compact-card workspace-presentation-card compact' : 'workspace-presentation-card') + '">' +
          (card.kicker ? '<p class="card-kicker">' + escapeHtml(card.kicker) + '</p>' : '') +
          '<div class="stack-meta"><strong>' + escapeHtml(card.title) + '</strong>' +
            (card.subtitle ? '<span>' + escapeHtml(card.subtitle) + '</span>' : '') +
          '</div>' +
          (card.body ? '<p>' + escapeHtml(card.body) + '</p>' : '') +
          (badges.length
            ? '<div class="chip-row">' + badges.map((badge) => '<span class="pill tone-soft">' + escapeHtml(badge) + '</span>').join('') + '</div>'
            : '') +
          (detailLines.length
            ? '<ul class="compact-list workspace-card-details">' + detailLines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>'
            : '') +
          (card.href
            ? '<div class="inline-actions"><a class="mini-link" href="' + escapeHtml(normalizeWorkspaceHrefClient(card.href)) + '">Open</a></div>'
            : '') +
        '</section>';
      }

      function formatWorkspaceModeLabel(mode) {
        const normalized = String(mode || '').trim().toLowerCase();
        if (normalized === 'capture') return 'capture';
        if (normalized === 'search') return 'search';
        if (normalized === 'campaign') return 'campaign';
        if (normalized === 'self') return 'self';
        return 'guided';
      }

      function getWorkspacePrimaryTitle(card) {
        if (!card || !card.type) return 'Main result';
        if (card.type === 'contact') return 'Main contact';
        if (card.type === 'event') return 'Main event';
        if (card.type === 'draft') return 'Main draft';
        if (card.type === 'mirror') return 'Mirror';
        return 'Main result';
      }

      function renderWorkspaceActionStrip(actions, payload) {
        if (!Array.isArray(actions) || !actions.length) return '';
        return '<div class="inline-actions action-strip">' +
          actions.map((action) => {
            if (action.kind === 'mutation' && action.action) {
              return '<button type="button" class="secondary-button" data-workspace-action="' + escapeHtml(action.action) + '" data-response-id="' + escapeHtml(payload.responseId) + '">' + escapeHtml(action.label || 'Open') + '</button>';
            }
            if (action.kind === 'link' && action.href) {
              return '<a class="mini-link action-link" href="' + escapeHtml(normalizeWorkspaceHrefClient(action.href)) + '">' + escapeHtml(action.label || 'Open') + '</a>';
            }
            return '';
          }).filter(Boolean).join('') +
        '</div>';
      }

      function renderWorkspaceRelatedGroup(title, cards = []) {
        if (!Array.isArray(cards) || !cards.length) return '';
        return '<section class="workspace-related-group">' +
          '<h5>' + escapeHtml(title) + '</h5>' +
          '<div class="workspace-secondary-grid">' +
            cards.map((card) => renderWorkspacePresentationCard(card, true)).join('') +
          '</div>' +
        '</section>';
      }

      function renderWorkspaceRelatedSections(related = {}) {
        const sections = [
          renderWorkspaceRelatedGroup('People', related.people || []),
          renderWorkspaceRelatedGroup('Events', related.events || []),
          renderWorkspaceRelatedGroup('Drafts', related.drafts || []),
          renderWorkspaceRelatedGroup('Mirror', related.mirror || []),
        ].filter(Boolean);

        if (!sections.length) return '';

        return '<section class="workspace-block"><h4>Related</h4>' + sections.join('') + '</section>';
      }

      function renderWorkspaceContactReviewForm(payload) {
        const captureDraft = payload.captureDraft || {};
        const personDraft = captureDraft.personDraft || {};
        const interactionDraft = captureDraft.interactionDraft || {};
        const selfCheckinDraft = captureDraft.selfCheckinDraft || {};
        const displayName = String(personDraft.displayName || personDraft.name || '').trim();
        const hasDraft =
          displayName ||
          String(interactionDraft.summary || '').trim() ||
          String(interactionDraft.evidence || '').trim();
        if (!hasDraft) return '';

        const requiresNameConfirmation = Boolean(personDraft.requiresNameConfirmation);
        const submitDisabled = requiresNameConfirmation && isInvalidContactDraftName(personDraft.name || '');

        return '<section class="workspace-block workspace-review-block">' +
          '<h4>Review contact draft</h4>' +
          '<form class="api-form compact-form workspace-review-form" data-capture-commit="true" data-workspace-contact-review="true" data-response-id="' + escapeHtml(payload.responseId || '') + '">' +
            '<input type="hidden" name="text" value="' + escapeHtml(payload.text || '') + '" />' +
            '<input type="hidden" name="source" value="' + escapeHtml(captureDraft.source || payload.source || 'workspace-chat') + '" />' +
            '<input type="hidden" name="combinedText" value="' + escapeHtml(captureDraft.combinedText || '') + '" />' +
            '<input type="hidden" name="assetIds" value="' + escapeHtml((payload.assets || []).map((asset) => asset.assetId).join(',')) + '" />' +
            '<input type="hidden" name="energy" value="' + escapeHtml(String(selfCheckinDraft.energy ?? 0)) + '" />' +
            '<input type="hidden" name="emotions" value="' + escapeHtml((selfCheckinDraft.emotions || []).join(', ')) + '" />' +
            '<input type="hidden" name="reflection" value="' + escapeHtml(selfCheckinDraft.reflection || '') + '" />' +
            '<div class="grid two-up workspace-review-grid">' +
              renderWorkspaceField('Name', '<input name="personName" type="text" value="' + escapeHtml(personDraft.name || '') + '" data-review-name-input placeholder="Confirm the contact name" />') +
              renderWorkspaceField('Next Follow-up', '<input name="nextFollowUpAt" type="datetime-local" value="' + escapeHtml(personDraft.nextFollowUpAt || '') + '" />') +
            '</div>' +
            '<div class="workspace-inline-note result-block result-block-warn" data-review-warning' + (submitDisabled ? '' : ' hidden') + '>' +
              '<p>Confirm the contact name before saving.</p>' +
            '</div>' +
            renderWorkspaceField('Tags', '<input name="personTags" type="text" value="' + escapeHtml((personDraft.tags || []).join(', ')) + '" placeholder="growth, investor, founder" />', 'Comma-separated') +
            renderWorkspaceField('Notes', '<textarea name="personNotes" rows="4" placeholder="What matters about this person and why you should remember them.">' + escapeHtml(personDraft.notes || '') + '</textarea>') +
            renderWorkspaceField('Identities', '<textarea name="identities" rows="3" placeholder="platform|handle|url|note">' + escapeHtml(serializeIdentityLines(personDraft.identities || [])) + '</textarea>', 'One identity per line: platform|handle|url|note') +
            renderWorkspaceField('Interaction Summary', '<textarea name="interactionSummary" rows="3">' + escapeHtml(interactionDraft.summary || '') + '</textarea>') +
            renderWorkspaceField('Interaction Evidence', '<textarea name="interactionEvidence" rows="4">' + escapeHtml(interactionDraft.evidence || '') + '</textarea>') +
            '<div class="inline-actions">' +
              '<button type="submit" data-review-submit' + (submitDisabled ? ' disabled' : '') + '>Save Contact</button>' +
            '</div>' +
            '<div class="form-result" data-form-result hidden></div>' +
          '</form>' +
        '</section>';
      }

      function renderWorkspaceAssistantTurn(payload) {
        const presentation = payload.presentation || {};
        const primaryCard = presentation.primaryCard || null;
        const relatedBlock = renderWorkspaceRelatedSections(presentation.related || payload.related || {});
        const primaryBlock = primaryCard
          ? '<section class="workspace-block"><h4>' + escapeHtml(getWorkspacePrimaryTitle(primaryCard)) + '</h4>' +
              renderWorkspacePresentationCard(primaryCard) +
            '</section>'
          : '';
        const reviewBlock = renderWorkspaceContactReviewForm(payload);
        const actions = renderWorkspaceActionStrip(presentation.actions || [], payload);

        return '<article class="chat-bubble system workspace-assistant">' +
          '<div class="stack-meta"><strong>SocialOS</strong></div>' +
          '<p>' + escapeHtml(presentation.answer || payload.summary || '') + '</p>' +
          primaryBlock +
          reviewBlock +
          relatedBlock +
          actions +
        '</article>';
      }

      async function uploadWorkspaceAsset(file, options = {}) {
        const composer = document.querySelector('[data-workspace-chat-form]');
        const statusNode = document.querySelector('[data-audio-status]');
        const resultNode = composer?.querySelector('[data-form-result]');
        if (!file || !composer) return null;
        const attachToMessage = options.attachToMessage !== false;
        const deliveryMode = options.deliveryMode || ((file.type || '').startsWith('audio/') ? 'voice' : 'asset');
        const transcriptText =
          (file.type || '').startsWith('audio/')
            ? String(options.transcriptText || '').trim()
            : '';

        const payload = {
          kind: (file.type || '').startsWith('audio/') ? 'audio' : 'image',
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name || 'upload.bin',
          contentBase64: await encodeFileAsDataUrl(file),
          source: 'workspace-chat',
          deliveryMode,
        };
        if (transcriptText) payload.transcript = transcriptText;

        const response = await apiRequest('/capture/assets', payload, 'POST');
        if (!response.ok) {
          renderWorkspaceComposerResult(resultNode, response.payload?.error || 'Attachment upload failed.', false);
          return null;
        }

        if (response.payload.asset) {
          if (attachToMessage) {
            appendCaptureAsset(response.payload.asset);
          } else {
            appendSourceAsset(response.payload.asset);
          }
          if (statusNode) {
            statusNode.innerHTML =
              attachToMessage
                ? '<strong>Attached</strong><p>' +
                    escapeHtml(response.payload.asset.fileName || response.payload.asset.assetId) +
                    ' is ready in the composer.</p>'
                : '<strong>Saved locally</strong><p>' +
                    escapeHtml(response.payload.asset.fileName || response.payload.asset.assetId) +
                    ' is stored as the original source while you work from the transcript.</p>';
          }
          renderWorkspaceComposerResult(resultNode, '');
        }

        return response.payload.asset || null;
      }

      async function handleWorkspaceChat(form, submitter, { silentUserTurn = false } = {}) {
        const resultNode = form.querySelector('[data-form-result]');
        const text = String(form.elements.text.value || '').trim();
        const assets = [...captureState.assets];
        const sourceAssets = [...captureState.sourceAssets];

        if (!text && !assets.length && !sourceAssets.length) {
          renderWorkspaceComposerResult(resultNode, 'Type a message or attach a file first.', false);
          return;
        }
        if (form.dataset.submitting === 'true') return;

        form.dataset.submitting = 'true';
        setButtonBusy(submitter, true);
        try {
          if (!silentUserTurn) {
            appendWorkspaceUserTurn(text, assets);
          }
          const response = await apiRequest(
            '/workspace/chat',
            {
              text,
              source: form.elements.source.value || 'workspace-chat',
              assetIds: assets.map((asset) => asset.assetId),
              sourceAssetIds: sourceAssets.map((asset) => asset.assetId),
            },
            'POST'
          );

          if (response.ok) {
            captureState.workspaceResponses.set(response.payload.responseId, response.payload);
            appendWorkspaceHtml(renderWorkspaceAssistantTurn(response.payload));
            document.querySelectorAll('[data-workspace-contact-review]').forEach((reviewForm) => {
              updateWorkspaceContactReviewState(reviewForm);
            });
            form.reset();
            captureState.assets = [];
            captureState.sourceAssets = [];
            captureState.liveTranscript = '';
            updateCaptureAssetInputs();
            setTranscriptPreview('');
            renderVoiceSourceActions();
            renderWorkspaceComposerResult(resultNode, '');
            if (document.querySelector('[data-audio-status]')) {
              document.querySelector('[data-audio-status]').innerHTML =
                '<strong>Ready</strong><p>Keep going when you are ready.</p>';
            }
            form.elements.text?.focus();
          } else {
            renderWorkspaceComposerResult(resultNode, response.payload?.error || 'Chat request failed.', false);
          }
        } catch (error) {
          renderWorkspaceComposerResult(resultNode, error.message || String(error), false);
        } finally {
          form.dataset.submitting = 'false';
          setButtonBusy(submitter, false);
        }
      }

      async function runWorkspaceAction(button) {
        const action = button.dataset.workspaceAction;
        const responseId = button.dataset.responseId || '';
        const payload = captureState.workspaceResponses.get(responseId);
        if (!action || !payload) return;

        setButtonBusy(button, true);
        try {
          if (action === 'review-contact') {
            const reviewForm = document.querySelector('[data-workspace-contact-review][data-response-id="' + responseId + '"]');
            if (!(reviewForm instanceof HTMLFormElement)) throw new Error('Review form is unavailable for this draft');
            reviewForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            reviewForm.elements.personName?.focus();
            return;
          }

          if (action === 'create-event') {
            const response = await apiRequest('/events', payload.suggestedEvent, 'POST');
            if (!response.ok) throw new Error(response.payload?.error || 'Create event failed');
            appendWorkspaceSystemTurn(
              'Event created',
              '<p>' + escapeHtml(response.payload.event.title) + ' is now in the logbook.</p>',
              '<div class="inline-actions action-strip">' +
                '<a class="mini-link" href="' + escapeHtml(buildWorkspaceHrefClient({ panel: 'events', eventId: response.payload.event.eventId })) + '">Open Event</a>' +
                '<a class="mini-link" href="/drafts?eventId=' + encodeURIComponent(response.payload.event.eventId) + '">Open Drafts</a>' +
                '<button type="button" class="secondary-button" data-workspace-action="generate-drafts" data-response-id="' + escapeHtml(responseId) + '" data-event-id="' + escapeHtml(response.payload.event.eventId) + '">Generate 7 Drafts</button>' +
              '</div>'
            );
            return;
          }

          if (action === 'generate-drafts') {
            const eventId = button.dataset.eventId || '';
            if (!eventId) throw new Error('Missing eventId for draft generation');
            const response = await apiRequest(
              '/drafts/generate',
              {
                eventId,
                platforms: payload.recommendedDraftRequest?.platforms || [],
                languages: payload.recommendedDraftRequest?.languages || ['platform-native'],
                cta: payload.recommendedDraftRequest?.cta || '',
              },
              'POST'
            );
            if (!response.ok) throw new Error(response.payload?.error || 'Generate drafts failed');
            appendWorkspaceSystemTurn(
              'Drafts ready',
              '<p>Generated ' + escapeHtml(String(response.payload.count || 0)) + ' platform-native draft(s).</p>',
              '<div class="inline-actions"><a class="mini-link" href="/drafts?eventId=' + encodeURIComponent(eventId) + '">Review Drafts</a></div>'
            );
          }
        } catch (error) {
          appendWorkspaceSystemTurn('Action failed', '<p>' + escapeHtml(error.message || String(error)) + '</p>');
        } finally {
          setButtonBusy(button, false);
        }
      }

      function populateCaptureCommitForm(captureDraft) {
        const panel = document.querySelector('[data-capture-commit-panel]');
        const form = document.querySelector('[data-capture-commit]');
        if (!panel || !form || !captureDraft) return;
        panel.hidden = false;
        form.elements.text.value = captureDraft.rawText || '';
        form.elements.source.value = captureDraft.source || 'dashboard';
        form.elements.assetIds.value = (captureDraft.assets || []).map((asset) => asset.assetId).join(',');
        form.elements.combinedText.value = captureDraft.combinedText || '';
        form.elements.personName.value = captureDraft.personDraft?.name || '';
        form.elements.personTags.value = (captureDraft.personDraft?.tags || []).join(', ');
        form.elements.personNotes.value = captureDraft.personDraft?.notes || '';
        form.elements.nextFollowUpAt.value = '';
        form.elements.identities.value = (captureDraft.personDraft?.identities || [])
          .map((item) => [item.platform || '', item.handle || '', item.url || '', item.note || ''].join('|'))
          .join('\\n');
        form.elements.energy.value = String(captureDraft.selfCheckinDraft?.energy ?? 0);
        form.elements.emotions.value = (captureDraft.selfCheckinDraft?.emotions || []).join(', ');
        form.elements.reflection.value = captureDraft.selfCheckinDraft?.reflection || '';
        form.elements.interactionSummary.value = captureDraft.interactionDraft?.summary || '';
        form.elements.interactionEvidence.value = captureDraft.interactionDraft?.evidence || '';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      async function handleCaptureParse(form, submitter) {
        const resultNode = form.querySelector('[data-form-result]');
        setButtonBusy(submitter, true);
        try {
          const payload = formDataToJson(form);
          payload.assetIds = String(payload.assetIds || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
          const response = await apiRequest('/capture/parse', payload, 'POST');
          renderResult(resultNode, response.payload);

          if (response.ok) {
            populateCaptureCommitForm(response.payload.captureDraft);
            sessionStorage.setItem(
              flashKey,
              JSON.stringify({
                ok: true,
                message: 'Capture parsed. Review the structured draft before committing.',
              })
            );
          }
        } catch (error) {
          renderResult(resultNode, { error: error.message || String(error) });
        } finally {
          setButtonBusy(submitter, false);
        }
      }

      async function handleCaptureCommit(form, submitter) {
        const resultNode = form.querySelector('[data-form-result]');
        setButtonBusy(submitter, true);
        try {
          const invalidName = isInvalidContactDraftName(form.elements.personName?.value || '');
          if (invalidName) {
            updateWorkspaceContactReviewState(form);
            form.elements.personName?.focus();
            renderWorkspaceComposerResult(resultNode, 'Confirm the contact name before saving.', false);
            return;
          }

          const payload = {
            text: form.elements.text.value,
            source: form.elements.source.value,
            combinedText: form.elements.combinedText.value,
            assetIds: String(form.elements.assetIds.value || '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
            personDraft: {
              name: form.elements.personName.value,
              tags: form.elements.personTags.value,
              notes: form.elements.personNotes.value,
              nextFollowUpAt: form.elements.nextFollowUpAt.value,
              identities: parseIdentityLines(form.elements.identities.value),
            },
            selfCheckinDraft: {
              energy: form.elements.energy.value,
              emotions: form.elements.emotions.value,
              triggerText: form.elements.source.value,
              reflection: form.elements.reflection.value,
            },
            interactionDraft: {
              summary: form.elements.interactionSummary.value,
              evidence: form.elements.interactionEvidence.value,
            },
          };
          const response = await apiRequest('/capture/commit', payload, 'POST');
          renderResult(resultNode, response.payload);

          if (form.hasAttribute('data-workspace-contact-review')) {
            if (!response.ok) {
              renderWorkspaceComposerResult(
                resultNode,
                response.payload?.error || 'Contact save failed. Please review the draft and try again.',
                false
              );
              if (response.payload?.error === 'name confirmation required') {
                form.elements.personName?.focus();
              }
              return;
            }

            const responseId = form.dataset.responseId || '';
            const workspacePayload = captureState.workspaceResponses.get(responseId);
            updateWorkspaceContactReviewState(form);
            if (submitter) {
              submitter.dataset.locked = 'true';
              submitter.dataset.originalLabel = 'Saved';
            }
            renderWorkspaceComposerResult(resultNode, 'Contact saved. You can open the detail page or create an event next.');
            appendWorkspaceSystemTurn(
              'Contact saved',
              '<p>' + escapeHtml(response.payload.person?.name || 'The contact') + ' is now in Contacts with a cleaner memory record.</p>',
              '<div class="inline-actions">' +
                '<a class="mini-link" href="' + escapeHtml(buildWorkspaceHrefClient({ panel: 'people', contactId: response.payload.person.personId })) + '">Open Contact</a>' +
                (workspacePayload?.suggestedEvent?.title
                  ? '<button type="button" class="secondary-button" data-workspace-action="create-event" data-response-id="' + escapeHtml(responseId) + '">Create Event</button>'
                  : '') +
              '</div>'
            );
            return;
          }

          sessionStorage.setItem(
            flashKey,
            JSON.stringify({
              ok: response.ok,
              message: response.ok
                ? 'Capture committed into people memory and self mirror inputs.'
                : response.payload?.error || 'Capture commit failed',
            })
          );
          if (response.ok) {
            window.location.reload();
          }
        } catch (error) {
          renderResult(resultNode, { error: error.message || String(error) });
        } finally {
          setButtonBusy(submitter, false);
        }
      }

      async function handleAssetUpload(form, submitter, fileOverride = null) {
        const resultNode = form.querySelector('[data-form-result]');
        const fileInput = form.querySelector('input[type="file"]');
        const file = fileOverride || (fileInput ? fileInput.files[0] : null);
        if (!file) {
          renderResult(resultNode, { error: 'Choose a file first.' });
          return;
        }
        setButtonBusy(submitter, true);
        try {
          const transcriptText = form.querySelector('textarea[name="transcript"]')?.value || '';
          const payload = {
            kind: form.dataset.assetUpload || 'image',
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name || 'upload.bin',
            contentBase64: await encodeFileAsDataUrl(file),
            transcript: transcriptText,
            source: 'dashboard',
            deliveryMode:
              (form.dataset.assetUpload || 'image') === 'audio'
                ? String(transcriptText || '').trim()
                  ? 'transcript'
                  : 'voice'
                : 'asset',
          };
          const response = await apiRequest('/capture/assets', payload, 'POST');
          renderResult(resultNode, response.payload);
          if (response.ok && response.payload.asset) {
            appendCaptureAsset(response.payload.asset);
          }
        } catch (error) {
          renderResult(resultNode, { error: error.message || String(error) });
        } finally {
          setButtonBusy(submitter, false);
        }
      }

      async function submitApiForm(form, submitter) {
        const endpoint = form.dataset.endpoint;
        const resultNode = form.querySelector('[data-form-result]');
        const payload = formDataToJson(form);
        const method = (form.dataset.method || 'POST').toUpperCase();

        if (!endpoint) return;
        setButtonBusy(submitter, true);

        try {
          const response = await apiRequest(endpoint, payload, method);
          const parsed = response.payload || {};
          const message =
            parsed.summary ||
            parsed.output ||
            parsed.error ||
            parsed.action ||
            parsed.taskId ||
            parsed.person?.name ||
            parsed.personId ||
            parsed.count ||
            parsed.status ||
            'Request completed';

          renderResult(resultNode, parsed);

          sessionStorage.setItem(
            flashKey,
            JSON.stringify({
              ok: response.ok,
              message,
            })
          );

          if (response.ok) {
            window.location.reload();
            return;
          }
        } catch (error) {
          renderResult(resultNode, { error: error.message || String(error) });
          sessionStorage.setItem(
            flashKey,
            JSON.stringify({
              ok: false,
              message: error.message || String(error),
            })
          );
        } finally {
          setButtonBusy(submitter, false);
        }
      }

      document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.hasAttribute('data-workspace-chat-form')) {
          event.preventDefault();
          if (form.dataset.submitting === 'true') return;
          handleWorkspaceChat(form, event.submitter || form.querySelector('button[type="submit"]'));
          return;
        }
        if (form.dataset.captureParse) {
          event.preventDefault();
          handleCaptureParse(form, event.submitter || form.querySelector('button[type="submit"]'));
          return;
        }
        if (form.dataset.captureCommit) {
          event.preventDefault();
          handleCaptureCommit(form, event.submitter || form.querySelector('button[type="submit"]'));
          return;
        }
        if (form.dataset.assetUpload) {
          event.preventDefault();
          handleAssetUpload(form, event.submitter || form.querySelector('button[type="submit"]'));
          return;
        }
        if (!form.dataset.apiForm) return;
        event.preventDefault();
        submitApiForm(form, event.submitter || form.querySelector('button[type="submit"]'));
      });

      document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        if (!target.hasAttribute('data-workspace-input')) return;
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        const form = target.closest('form[data-workspace-chat-form]');
        if (!form) return;
        const submitButton = form.querySelector('button[type="submit"]');
        if (form.dataset.submitting === 'true' || submitButton?.disabled) return;
        event.preventDefault();
        form.requestSubmit(submitButton);
      });

      document.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const reviewForm = target.closest('form[data-workspace-contact-review]');
        if (!(reviewForm instanceof HTMLFormElement)) return;
        updateWorkspaceContactReviewState(reviewForm);
      });

      document.addEventListener('click', async (event) => {
        const copyButton = event.target.closest('[data-copy-text]');
        const removeAssetButton = event.target.closest('[data-remove-asset]');
        const workspaceAction = event.target.closest('[data-workspace-action]');
        const attachButton = event.target.closest('[data-workspace-attach]');
        const recordToggle = event.target.closest('[data-audio-record-toggle]');
        const attachSourceVoiceButton = event.target.closest('[data-attach-source-voice]');
        const dismissSourceVoiceButton = event.target.closest('[data-dismiss-source-voice]');
        if (copyButton) {
          event.preventDefault();
          const text = copyButton.getAttribute('data-copy-text') || '';
          try {
            await navigator.clipboard.writeText(text);
            sessionStorage.setItem(
              flashKey,
              JSON.stringify({
                ok: true,
                message: 'Copied the publish content. You can paste it straight into the platform.',
              })
            );
          } catch (error) {
            sessionStorage.setItem(
              flashKey,
              JSON.stringify({
                ok: false,
                message: error.message || 'Copy failed in this browser.',
              })
            );
          }
          window.location.reload();
          return;
        }

        if (removeAssetButton) {
          event.preventDefault();
          removeCaptureAsset(removeAssetButton.getAttribute('data-remove-asset') || '');
          return;
        }

        if (attachSourceVoiceButton) {
          event.preventDefault();
          const assetId = attachSourceVoiceButton.getAttribute('data-attach-source-voice') || '';
          const asset = findStoredSourceAsset(assetId);
          if (asset) {
            removeSourceAsset(assetId);
            appendCaptureAsset(asset);
            renderVoiceSourceActions();
            const statusNode = document.querySelector('[data-audio-status]');
            if (statusNode) {
              statusNode.innerHTML = '<strong>Voice attached</strong><p>The transcript will send as text, and the original audio will go with this turn.</p>';
            }
          }
          return;
        }

        if (dismissSourceVoiceButton) {
          event.preventDefault();
          renderVoiceSourceActions();
          const statusNode = document.querySelector('[data-audio-status]');
          if (statusNode) {
            statusNode.innerHTML = '<strong>Transcript ready</strong><p>The text is in the composer. The original voice is still saved locally for later reference.</p>';
          }
          return;
        }

        if (workspaceAction) {
          event.preventDefault();
          await runWorkspaceAction(workspaceAction);
          return;
        }

        if (attachButton) {
          event.preventDefault();
          const form = attachButton.closest('form');
          const fileInput = form?.querySelector('[data-workspace-file]');
          if (fileInput) fileInput.click();
          return;
        }

        if (recordToggle) {
          event.preventDefault();
          const form = recordToggle.closest('form');
          const statusNode = document.querySelector('[data-audio-status]');
          const openAiReady = form?.dataset.openaiTranscriptionReady === 'true';
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          try {
            if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
              statusNode.innerHTML = '<strong>Browser audio tools</strong><p>MediaRecorder is unavailable in this browser. Upload an audio file instead.</p>';
              return;
            }

            if (!captureState.recorder && !SpeechRecognition && !openAiReady) {
              statusNode.innerHTML = '<strong>Voice chat is not ready yet</strong><p>This browser has no built-in speech recognition, and the server has no OpenAI transcription key right now. Add OPENAI_API_KEY to .env if you want voice notes to draft into the composer before sending.</p>';
              return;
            }
            if (!captureState.recorder) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              captureState.recordChunks = [];
              captureState.liveTranscript = '';
              await startAudioMeter(stream);
              captureState.recorder = new MediaRecorder(stream);
              captureState.recorder.ondataavailable = (recordEvent) => {
                if (recordEvent.data.size > 0) captureState.recordChunks.push(recordEvent.data);
              };
              captureState.recorder.start();
              recordToggle.dataset.originalLabel = recordToggle.textContent;
              recordToggle.textContent = 'Recording';
              recordToggle.setAttribute('aria-pressed', 'true');
              recordToggle.classList.add('is-recording');
              setTranscriptPreview('', 'live');

              const textField = form?.elements?.text;
              if (SpeechRecognition && textField) {
                captureState.recognition = new SpeechRecognition();
                captureState.recognition.continuous = true;
                captureState.recognition.interimResults = true;
                const selectedLang = String(form?.elements?.voiceLang?.value || navigator.language || 'zh-CN');
                captureState.recognition.lang = selectedLang;
                captureState.recognition.onresult = (speechEvent) => {
                  const transcript = Array.from(speechEvent.results)
                    .map((result) => result[0]?.transcript || '')
                    .join(' ')
                    .trim();
                  captureState.liveTranscript = transcript;
                  setTranscriptPreview(transcript, 'live');
                };
                captureState.recognition.onerror = () => {
                  if (captureState.resolveRecognitionWaiter) captureState.resolveRecognitionWaiter();
                };
                captureState.recognition.onend = () => {
                  if (captureState.resolveRecognitionWaiter) captureState.resolveRecognitionWaiter();
                };
                captureState.recognition.start();
              }

              renderWorkspaceComposerResult(form?.querySelector('[data-form-result]'), '');
              statusNode.innerHTML = '<strong>Recording</strong><p>Speak naturally. Tap Mic again to stop. We will draft the transcript into the composer for review before you send.</p>';
              return;
            }

            captureState.recorder.onstop = async () => {
              const blob = new Blob(captureState.recordChunks, { type: 'audio/webm' });
              const file = new File([blob], 'recorded-note.webm', { type: 'audio/webm' });
              if (captureState.recognitionWaiter) {
                await captureState.recognitionWaiter;
                captureState.recognitionWaiter = null;
              }
              statusNode.innerHTML = '<strong>Uploading voice note</strong><p>Saving the recording and drafting the transcript into the composer.</p>';
              const asset = await uploadWorkspaceAsset(file, {
                attachToMessage: false,
                deliveryMode: 'transcript',
                transcriptText: captureState.liveTranscript,
              });
              const finalTranscript = String(
                asset?.extractedText ||
                asset?.previewText ||
                captureState.liveTranscript ||
                ''
              ).trim();

              if (finalTranscript && asset) {
                mergeTranscriptIntoComposer(form, finalTranscript);
                setTranscriptPreview(finalTranscript, 'ready');
                renderVoiceSourceActions(asset);
                statusNode.innerHTML = '<strong>Transcript ready</strong><p>Review or edit the text in the composer, then press send when you are happy with it. The original voice is saved locally.</p>';
                renderWorkspaceComposerResult(
                  form?.querySelector('[data-form-result]'),
                  'The transcript is in the composer for editing. The original voice note is saved locally and can be attached if you want to send the audio too.'
                );
              } else if (finalTranscript) {
                mergeTranscriptIntoComposer(form, finalTranscript);
                setTranscriptPreview(finalTranscript, 'ready');
                renderVoiceSourceActions();
                statusNode.innerHTML = '<strong>Transcript drafted, audio not saved</strong><p>The transcript is in the composer, but the voice attachment did not upload. You can still edit and send the text-only version.</p>';
              } else if (asset) {
                removeSourceAsset(asset.assetId);
                appendCaptureAsset(asset);
                renderVoiceSourceActions();
                setTranscriptPreview('', 'neutral');
                statusNode.innerHTML = '<strong>Voice note saved</strong><p>I kept the recording as the message attachment because there is no transcript yet. You can type or edit before sending.</p>';
                renderWorkspaceComposerResult(
                  form?.querySelector('[data-form-result]'),
                  'The voice note is attached. There is no transcript yet, so you can add text manually before sending.',
                  false
                );
              } else {
                renderVoiceSourceActions();
                setTranscriptPreview('', 'neutral');
                statusNode.innerHTML = '<strong>Voice note failed</strong><p>The recording was not saved and no transcript is available yet. Please try again.</p>';
              }

              recordToggle.textContent = recordToggle.dataset.originalLabel || 'Mic';
              recordToggle.setAttribute('aria-pressed', 'false');
              recordToggle.classList.remove('is-recording');
            };

            captureState.recorder.stop();
            stopAudioMeter();
            captureState.recorder.stream.getTracks().forEach((track) => track.stop());
            if (captureState.recognition) {
              captureState.recognitionWaiter = new Promise((resolve) => {
                let settled = false;
                captureState.resolveRecognitionWaiter = () => {
                  if (settled) return;
                  settled = true;
                  captureState.resolveRecognitionWaiter = null;
                  resolve();
                };
                window.setTimeout(captureState.resolveRecognitionWaiter, 700);
              });
              captureState.recognition.stop();
              captureState.recognition = null;
            } else {
              captureState.recognitionWaiter = null;
            }
            captureState.recorder = null;
            return;
          } catch (error) {
            stopAudioMeter();
            captureState.liveTranscript = '';
            recordToggle.textContent = recordToggle.dataset.originalLabel || 'Mic';
            recordToggle.setAttribute('aria-pressed', 'false');
            recordToggle.classList.remove('is-recording');
            setTranscriptPreview('', 'neutral');
            statusNode.innerHTML = '<strong>Mic unavailable</strong><p>' + escapeHtml(error.message || String(error)) + '</p>';
            return;
          }
        }
      });

      document.addEventListener('change', async (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (!input.hasAttribute('data-workspace-file')) return;
        const files = Array.from(input.files || []);
        for (const file of files) {
          await uploadWorkspaceAsset(file);
        }
        input.value = '';
      });

      function maybeRunInitialWorkspaceQuery() {
        const form = document.querySelector('[data-workspace-chat-form]');
        if (!(form instanceof HTMLFormElement)) return;
        const initialQuery = String(form.dataset.initialQuery || '').trim();
        if (!initialQuery || form.dataset.initialQueryConsumed === 'true') return;
        form.dataset.initialQueryConsumed = 'true';
        if (form.elements.text) {
          form.elements.text.value = initialQuery;
        }
        handleWorkspaceChat(form, form.querySelector('button[type="submit"]'));
      }

      function maybeRevealWorkspaceDrawer() {
        const params = new URLSearchParams(window.location.search);
        const hasDrawerTarget = Boolean(
          String(params.get('contactId') || '').trim() ||
          String(params.get('eventId') || '').trim()
        );
        if (!hasDrawerTarget) return;

        const drawer =
          document.querySelector('[data-workspace-drawer=\"contact\"]') ||
          document.querySelector('[data-workspace-drawer=\"event\"]');
        if (!(drawer instanceof HTMLElement)) return;

        requestAnimationFrame(() => {
          drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const heading = drawer.querySelector('h1, h2, h3, [data-drawer-focus]');
          if (heading instanceof HTMLElement) {
            if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
          }
        });
      }

      consumeFlash();
      renderWorkspaceAssets();
      document.querySelectorAll('[data-workspace-contact-review]').forEach((reviewForm) => {
        updateWorkspaceContactReviewState(reviewForm);
      });
      maybeRunInitialWorkspaceQuery();
      maybeRevealWorkspaceDrawer();
    </script>
  `;
}

function renderLayout({ currentPath, title, body, publicMode = false }) {
  return `<!doctype html>
<html lang="en" data-public-mode="${publicMode ? 'true' : 'false'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · SocialOS Workspace</title>
    <style>
      :root {
        --bg: #f5efe4;
        --ink: #182132;
        --ink-soft: #58667d;
        --panel: rgba(255, 251, 244, 0.88);
        --panel-strong: rgba(255, 248, 238, 0.96);
        --line: rgba(22, 33, 50, 0.12);
        --nav-bg: rgba(255, 251, 245, 0.9);
        --nav-ink: #162132;
        --accent: #156f6a;
        --accent-soft: #daf4f1;
        --warn: #b55d34;
        --warn-soft: #f8e3d7;
        --good: #2e7d51;
        --good-soft: #dff2e7;
        --shadow: 0 20px 70px rgba(18, 33, 49, 0.12);
        --shadow-soft: 0 14px 32px rgba(18, 33, 49, 0.08);
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        --font-body: "Avenir Next", "IBM Plex Sans", "Noto Sans SC", sans-serif;
        --font-mono: "IBM Plex Mono", "SFMono-Regular", monospace;
      }
      * {
        box-sizing: border-box;
      }
      html {
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(21, 111, 106, 0.12), transparent 26%),
          radial-gradient(circle at bottom right, rgba(181, 93, 52, 0.14), transparent 28%),
          linear-gradient(180deg, #fcf8f0 0%, #f3ede2 100%);
      }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: var(--font-body);
        background:
          radial-gradient(circle at top left, rgba(21, 111, 106, 0.12), transparent 26%),
          radial-gradient(circle at bottom right, rgba(181, 93, 52, 0.14), transparent 28%),
          linear-gradient(180deg, #fcf8f0 0%, #f3ede2 100%);
        overflow-x: hidden;
      }
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(240px, 280px) 1fr;
      }
      nav {
        position: sticky;
        top: 0;
        align-self: start;
        min-height: 100vh;
        padding: 28px 20px;
        color: var(--nav-ink);
        background: var(--nav-bg);
        backdrop-filter: blur(18px);
        border-right: 1px solid rgba(22, 33, 50, 0.08);
      }
      .nav-links {
        display: grid;
        gap: 6px;
      }
      .brand {
        margin: 0 0 18px;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.6;
      }
      .brand-title {
        margin: 0 0 24px;
        font-size: 26px;
        font-family: var(--font-display);
      }
      .nav-link {
        display: block;
        padding: 12px 14px;
        margin-bottom: 6px;
        border-radius: 16px;
        color: inherit;
        text-decoration: none;
        border: 1px solid transparent;
        transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      }
      .nav-link:hover {
        transform: translateX(2px);
        background: rgba(21, 111, 106, 0.06);
        border-color: rgba(21, 111, 106, 0.1);
      }
      .nav-link.active {
        background: rgba(21, 111, 106, 0.1);
        border-color: rgba(21, 111, 106, 0.14);
      }
      .nav-footer {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid rgba(22, 33, 50, 0.08);
        font-size: 13px;
        line-height: 1.5;
        opacity: 0.74;
      }
      main {
        padding: 32px 32px 120px;
      }
      .flash {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 14px 16px;
        margin-bottom: 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: var(--shadow);
      }
      .flash.ok {
        border-color: rgba(46, 125, 81, 0.2);
        background: var(--good-soft);
      }
      .flash.fail {
        border-color: rgba(181, 93, 52, 0.22);
        background: var(--warn-soft);
      }
      .flash[hidden] {
        display: none;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
        gap: 20px;
        margin-bottom: 24px;
      }
      .hero-copy,
      .hero-rail,
      .panel,
      .info-card {
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      .hero-copy {
        border-radius: 28px;
        padding: 30px;
      }
      .hero-rail {
        border-radius: 28px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .eyebrow,
      .card-kicker {
        margin: 0 0 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--accent);
      }
      h1, h2, h3 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 600;
      }
      h1 {
        margin-bottom: 10px;
        font-size: clamp(34px, 5vw, 54px);
      }
      h2 {
        font-size: 24px;
      }
      h3 {
        font-size: 22px;
      }
      p {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.65;
        overflow-wrap: anywhere;
      }
      small,
      a {
        overflow-wrap: anywhere;
      }
      .api-hint {
        margin-top: 14px;
      }
      code,
      pre {
        font-family: var(--font-mono);
      }
      select,
      input,
      textarea,
      button {
        font-family: var(--font-body);
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 16px;
        border-radius: 18px;
        background: rgba(18, 33, 50, 0.92);
        color: #eef4ff;
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: auto;
      }
      .metric-strip {
        display: grid;
        gap: 10px;
      }
      .metric {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 12px 14px;
        border-radius: 18px;
        background: var(--panel-strong);
        border: 1px solid var(--line);
      }
      .metric strong {
        font-size: 24px;
        color: var(--ink);
        font-family: var(--font-display);
      }
      .metric span {
        color: var(--ink-soft);
        font-size: 13px;
      }
      .panel {
        border-radius: 24px;
        padding: 22px;
      }
      .panel-head {
        margin-bottom: 18px;
      }
      .panel-subtitle {
        margin-top: 8px;
      }
      .grid {
        display: grid;
        gap: 20px;
        margin-bottom: 20px;
      }
      .two-up {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .three-up {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .field {
        display: grid;
        gap: 8px;
        margin-bottom: 14px;
      }
      .field > span {
        font-size: 13px;
        font-weight: 600;
      }
      .field small {
        color: var(--ink-soft);
      }
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid rgba(22, 33, 50, 0.14);
        border-radius: 16px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.78);
        color: var(--ink);
      }
      textarea {
        resize: vertical;
      }
      fieldset.field {
        border: 1px solid rgba(22, 33, 50, 0.12);
        border-radius: 18px;
        padding: 14px;
      }
      button,
      .mini-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid transparent;
        text-decoration: none;
        cursor: pointer;
      }
      button {
        padding: 11px 16px;
        color: white;
        background: linear-gradient(135deg, #135d6a, #2e8076);
        box-shadow: 0 10px 24px rgba(21, 111, 106, 0.18);
      }
      .secondary-button {
        color: var(--ink);
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(22, 33, 50, 0.12);
        box-shadow: none;
      }
      .ghost-button {
        color: var(--ink-soft);
        background: transparent;
        border: 1px dashed rgba(22, 33, 50, 0.14);
        box-shadow: none;
      }
      button:hover {
        filter: brightness(1.03);
      }
      button:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .mini-link {
        padding: 9px 14px;
        border-color: rgba(22, 33, 50, 0.12);
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink);
      }
      .inline-actions,
      .chip-row,
      .stack-meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .workspace-response-meta {
        margin: 8px 0 10px;
      }
      .stretch {
        align-items: stretch;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        border: 1px solid transparent;
      }
      .tone-accent {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .tone-soft,
      .tone-neutral {
        background: rgba(22, 33, 50, 0.06);
        color: var(--ink-soft);
      }
      .tone-good {
        background: var(--good-soft);
        color: var(--good);
      }
      .tone-warn {
        background: var(--warn-soft);
        color: var(--warn);
      }
      .stack,
      .draft-grid,
      .cluster-grid,
      .control-stack {
        display: grid;
        gap: 14px;
      }
      .chat-shell {
        display: grid;
        gap: 12px;
      }
      .chat-bubble {
        max-width: min(680px, 100%);
        padding: 16px 18px;
        border-radius: 22px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.78);
      }
      .chat-bubble.user {
        justify-self: end;
        background: linear-gradient(135deg, rgba(21, 111, 106, 0.1), rgba(21, 111, 106, 0.2));
      }
      .chat-bubble.system {
        justify-self: start;
      }
      .chat-bubble.ghost {
        opacity: 0.72;
      }
      .workspace-context-note {
        max-width: min(480px, 100%);
        justify-self: start;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px dashed rgba(22, 33, 50, 0.12);
        background: rgba(255, 255, 255, 0.56);
      }
      .workspace-context-note-empty {
        color: var(--ink-soft);
      }
      .workspace-context-note p {
        margin: 0;
        line-height: 1.5;
      }
      .workspace-recent-note {
        max-width: min(460px, 100%);
        opacity: 0.88;
      }
      .workspace-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
        gap: 22px;
        align-items: start;
      }
      .workspace-summary-strip {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
        gap: 18px;
        margin-bottom: 20px;
      }
      .workspace-summary-copy,
      .workspace-summary-actions,
      .workspace-context-rail,
      .workspace-drawer {
        border-radius: 28px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
      }
      .workspace-summary-copy,
      .workspace-summary-actions {
        padding: 24px 24px 22px;
      }
      .workspace-summary-copy h1 {
        margin-bottom: 8px;
        font-size: clamp(30px, 4vw, 46px);
      }
      .workspace-summary-copy > p:last-of-type {
        max-width: 44ch;
      }
      .workspace-summary-actions {
        display: grid;
        gap: 12px;
      }
      .workspace-action-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .workspace-action-card {
        padding: 14px 14px 13px;
        border-radius: 20px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.62);
        box-shadow: var(--shadow-soft);
      }
      .workspace-status-cluster {
        display: grid;
        gap: 10px;
        margin-top: 14px;
        padding: 14px 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.56);
        border: 1px solid rgba(22, 33, 50, 0.08);
      }
      .workspace-status-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .workspace-status-item {
        display: grid;
        gap: 6px;
        padding: 10px 12px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(22, 33, 50, 0.08);
      }
      .workspace-status-label {
        color: var(--ink-soft);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .workspace-status-summary {
        color: var(--ink-soft);
      }
      .workspace-home-header {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
        gap: 20px;
        margin-bottom: 24px;
      }
      .workspace-home-summary,
      .workspace-home-actions {
        border-radius: 28px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
        padding: 24px;
      }
      .workspace-home-summary {
        display: grid;
        gap: 14px;
      }
      .workspace-home-title {
        margin-top: -8px;
        color: var(--ink);
        font-size: 18px;
      }
      .workspace-home-actions {
        display: grid;
        gap: 14px;
      }
      .workspace-home-actions h3 {
        font-size: 20px;
      }
      .workspace-main-panel {
        display: grid;
        gap: 16px;
      }
      .workspace-main-panel .panel-head {
        margin-bottom: 4px;
      }
      .workspace-thread {
        min-height: 280px;
        max-height: 72vh;
        overflow: auto;
        padding-right: 6px;
      }
      .workspace-welcome {
        border-style: dashed;
        background: rgba(255, 255, 255, 0.56);
      }
      .workspace-composer-shell {
        position: sticky;
        bottom: 18px;
        z-index: 5;
        padding: 14px 16px 12px;
        border-radius: 30px;
        background: rgba(255, 251, 244, 0.98);
        border: 1px solid rgba(22, 33, 50, 0.1);
        box-shadow: 0 24px 54px rgba(18, 33, 49, 0.14);
        backdrop-filter: blur(20px);
      }
      .workspace-composer {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
      }
      .workspace-composer textarea {
        min-height: 64px;
        max-height: 180px;
        padding: 14px 0 10px;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: var(--ink);
        box-shadow: none;
        resize: none;
      }
      .workspace-composer textarea::placeholder {
        color: rgba(78, 93, 115, 0.72);
      }
      .workspace-composer textarea:focus {
        outline: none;
        box-shadow: none;
      }
      .workspace-composer-controls {
        display: grid;
        grid-auto-flow: column;
        gap: 10px;
        align-items: center;
      }
      .workspace-icon-button {
        min-width: 58px;
        min-height: 46px;
        padding: 0 14px;
        border-radius: 999px;
        box-shadow: none;
      }
      .workspace-composer-shell .workspace-icon-button {
        background: rgba(22, 33, 50, 0.06);
        border-color: rgba(22, 33, 50, 0.1);
        color: var(--ink);
      }
      .workspace-attach-button {
        font-size: 24px;
        line-height: 1;
      }
      .workspace-mic-button {
        padding: 0;
      }
      .button-icon {
        width: 18px;
        height: 18px;
        display: block;
      }
      .workspace-send-button {
        min-width: 46px;
        min-height: 46px;
        padding: 0;
        border-radius: 999px;
        border: 0;
        background: var(--ink);
        color: #fffdf9;
        font-size: 22px;
        box-shadow: none;
      }
      .workspace-side {
        display: grid;
        gap: 16px;
        position: sticky;
        top: 24px;
        max-height: calc(100vh - 48px);
        overflow: auto;
        padding-right: 4px;
      }
      .workspace-side .panel {
        padding: 18px;
      }
      .workspace-side .panel h2 {
        font-size: 20px;
      }
      .workspace-side .stack-card {
        padding: 14px;
      }
      .workspace-context-rail {
        position: sticky;
        top: 24px;
        padding: 18px;
        max-height: calc(100vh - 48px);
        overflow: auto;
        background: rgba(255, 250, 242, 0.9);
      }
      .workspace-rail-tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 16px;
      }
      .workspace-rail-tab {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        min-height: 42px;
        padding: 0 12px;
        border-radius: 999px;
        text-decoration: none;
        color: var(--ink-soft);
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.54);
      }
      .workspace-rail-tab.active {
        color: var(--ink);
        background: rgba(21, 111, 106, 0.12);
        border-color: rgba(21, 111, 106, 0.18);
      }
      .workspace-rail-head {
        margin-bottom: 14px;
      }
      .workspace-rail-body {
        display: grid;
        gap: 12px;
      }
      .workspace-drawer {
        padding: 22px;
        background: rgba(255, 249, 241, 0.96);
      }
      .workspace-drawer-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .workspace-drawer-grid {
        margin-top: 18px;
      }
      .workspace-secondary-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .agent-lane-grid {
        display: grid;
        gap: 10px;
      }
      .workspace-presentation-card {
        display: grid;
        gap: 10px;
      }
      .workspace-presentation-card.compact {
        height: 100%;
      }
      .workspace-related-group {
        display: grid;
        gap: 8px;
      }
      .workspace-related-group h5 {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .workspace-card-details {
        margin-top: -2px;
      }
      .workspace-asset-tray {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .asset-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(22, 33, 50, 0.12);
        background: rgba(255, 255, 255, 0.78);
        color: var(--ink-soft);
        font-size: 13px;
      }
      .workspace-composer-shell .asset-chip {
        background: rgba(22, 33, 50, 0.05);
        border-color: rgba(22, 33, 50, 0.1);
        color: var(--ink-soft);
      }
      .asset-remove {
        min-width: 28px;
        min-height: 28px;
        padding: 0;
        border-radius: 999px;
        box-shadow: none;
        background: rgba(22, 33, 50, 0.08);
        color: var(--ink);
      }
      .workspace-block {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      .workspace-block h4 {
        margin: 0;
        font-size: 14px;
        font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
      }
      .workspace-note {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(21, 111, 106, 0.08);
        color: var(--ink-soft);
      }
      .agent-inline-grid {
        display: grid;
        gap: 10px;
      }
      .compact-card {
        padding: 12px;
      }
      .compact-card p {
        font-size: 13px;
      }
      .workspace-assistant {
        max-width: min(760px, 100%);
      }
      .audio-meter {
        display: inline-flex;
        align-items: end;
        gap: 3px;
        min-width: 68px;
        height: 32px;
        padding: 0 4px;
      }
      .audio-meter-bar {
        width: 4px;
        height: 100%;
        border-radius: 999px;
        background: rgba(22, 33, 50, 0.14);
        transform-origin: center bottom;
        transform: scaleY(0.2);
        transition: transform 120ms ease, background 120ms ease;
      }
      .audio-meter-bar.live {
        background: rgba(21, 111, 106, 0.78);
      }
      .workspace-icon-button.is-recording {
        background: rgba(181, 93, 52, 0.12);
        color: var(--warn);
        border-color: rgba(181, 93, 52, 0.18);
      }
      .workspace-composer-note {
        margin-top: 10px;
        color: var(--ink-soft);
        font-size: 13px;
        line-height: 1.45;
      }
      .workspace-voice-source-actions {
        margin-top: 10px;
      }
      .workspace-voice-source-actions[hidden] {
        display: none !important;
      }
      .voice-source-note {
        display: grid;
        gap: 8px;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(21, 111, 106, 0.12);
        background: rgba(21, 111, 106, 0.06);
        color: var(--ink-soft);
      }
      .voice-source-note strong {
        color: var(--ink);
      }
      .voice-source-note span {
        font-size: 13px;
        line-height: 1.45;
      }
      .voice-source-note-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .workspace-transcript-preview {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 16px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink-soft);
        display: grid;
        gap: 4px;
      }
      .workspace-transcript-preview[hidden] {
        display: none !important;
      }
      .workspace-transcript-preview strong {
        display: block;
        color: var(--ink);
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .workspace-transcript-preview p {
        margin: 0;
        line-height: 1.45;
        font-size: 13px;
        white-space: pre-wrap;
      }
      .workspace-transcript-preview[data-tone="live"] {
        background: rgba(21, 111, 106, 0.08);
        border-color: rgba(21, 111, 106, 0.14);
      }
      .workspace-transcript-preview[data-tone="ready"] {
        background: rgba(46, 125, 81, 0.08);
        border-color: rgba(46, 125, 81, 0.14);
      }
      .result-block-warn {
        border-color: rgba(181, 93, 52, 0.2);
        background: var(--warn-soft);
      }
      .chat-composer-form textarea {
        min-height: 96px;
        padding: 18px 20px;
        border-radius: 24px;
      }
      .composer-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        align-items: end;
      }
      .composer-actions {
        display: grid;
        gap: 10px;
      }
      .compact-info {
        margin-top: 14px;
      }
      .stack-card,
      .draft-card,
      .cluster-card,
      .info-card,
      .empty-state,
      .result-block {
        border-radius: 20px;
        padding: 16px;
        border: 1px solid rgba(22, 33, 50, 0.1);
        background: var(--panel-strong);
        transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
      }
      .stack-card:hover,
      .draft-card:hover,
      .cluster-card:hover,
      .info-card:hover {
        transform: translateY(-1px);
        border-color: rgba(21, 111, 106, 0.18);
        box-shadow: 0 18px 36px rgba(18, 33, 49, 0.08);
      }
      .hackathon-card-selected {
        border-color: rgba(21, 111, 106, 0.28);
        box-shadow: 0 20px 42px rgba(21, 111, 106, 0.12);
      }
      .hackathon-shot {
        width: 100%;
        display: block;
        margin: 10px 0 12px;
        border-radius: 18px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        box-shadow: var(--shadow-soft);
      }
      .queue-card > small {
        display: block;
        margin-top: 2px;
        color: var(--ink-soft);
      }
      .queue-details {
        margin-top: 10px;
        background: rgba(255, 255, 255, 0.56);
      }
      .queue-details summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--ink);
      }
      .queue-details[open] summary {
        margin-bottom: 10px;
      }
      .score {
        color: var(--accent);
        font-weight: 600;
      }
      .draft-grid,
      .cluster-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .draft-card {
        display: grid;
        gap: 14px;
      }
      .draft-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 12px;
      }
      .draft-subtitle {
        margin-top: 6px;
        font-size: 14px;
      }
      .draft-title {
        color: var(--ink);
        font-size: 16px;
        font-weight: 600;
      }
      .draft-hook {
        color: var(--accent);
        font-size: 14px;
      }
      .draft-preview {
        display: grid;
        gap: 10px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.72);
      }
      .draft-preview p {
        color: var(--ink);
      }
      .draft-tags {
        margin-top: 12px;
        color: var(--accent);
        font-size: 14px;
      }
      .quiet-label {
        color: var(--ink-soft);
        font-size: 12px;
      }
      .draft-queue-form {
        margin-top: 14px;
      }
      .draft-details {
        margin-top: 14px;
        border-top: 1px solid rgba(22, 33, 50, 0.08);
        padding-top: 14px;
      }
      .draft-details summary {
        cursor: pointer;
        color: var(--ink);
        font-weight: 600;
      }
      .draft-details-body {
        display: grid;
        gap: 12px;
        margin-top: 12px;
      }
      .package-meta {
        display: grid;
        gap: 8px;
        margin: 14px 0;
      }
      .package-highlights {
        display: grid;
        gap: 10px;
        margin: 14px 0;
      }
      .detail-card {
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.55);
        border: 1px solid rgba(22, 33, 50, 0.08);
      }
      .detail-card h4 {
        margin: 0 0 8px;
        font-size: 15px;
        font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
      }
      .step-list,
      .compact-list,
      .blocked-list {
        margin: 0;
        padding-left: 18px;
        color: var(--ink-soft);
        line-height: 1.7;
      }
      .query-form,
      .api-form {
        display: grid;
        gap: 10px;
      }
      .compact-form {
        gap: 12px;
      }
      .workspace-review-block {
        border-top: 1px solid rgba(22, 33, 50, 0.08);
        padding-top: 4px;
      }
      .workspace-review-form {
        margin-top: 8px;
      }
      .workspace-review-grid {
        gap: 12px;
      }
      .workspace-inline-note {
        margin: 0;
      }
      .details-shell {
        border: 1px solid rgba(22, 33, 50, 0.1);
        border-radius: 18px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.6);
      }
      .details-shell summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--ink);
      }
      .details-shell[open] summary {
        margin-bottom: 12px;
      }
      .inset-panel {
        margin: 0;
        padding: 18px;
      }
      .compact-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .form-result pre {
        margin-top: 6px;
        max-height: 260px;
      }
      .check-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .toggle {
        display: inline-flex;
        gap: 8px;
        align-items: center;
      }
      .info-callout {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(21, 111, 106, 0.08);
        border: 1px solid rgba(21, 111, 106, 0.14);
        color: var(--accent);
      }
      footer {
        margin-top: 24px;
        color: var(--ink-soft);
        font-size: 13px;
      }
      @media (max-width: 1360px) {
        .shell {
          grid-template-columns: 1fr;
        }
        nav {
          min-height: auto;
          position: sticky;
          z-index: 20;
          padding: 16px 18px;
          border-right: 0;
          border-bottom: 1px solid rgba(22, 33, 50, 0.08);
        }
        .nav-links {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .nav-link {
          white-space: nowrap;
          flex: 0 0 auto;
          margin-bottom: 0;
        }
        .nav-footer {
          display: none;
        }
        main {
          padding: 24px 20px 120px;
        }
        .workspace-summary-strip,
        .workspace-home-header,
        .workspace-layout {
          grid-template-columns: 1fr;
        }
        .workspace-action-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .workspace-context-rail,
        .workspace-side {
          position: static;
          max-height: none;
          overflow: visible;
          padding-right: 0;
        }
        .workspace-summary-copy h1 {
          font-size: clamp(28px, 4vw, 40px);
        }
      }
      @media (max-width: 1080px) {
        .shell {
          grid-template-columns: 1fr;
        }
        nav {
          min-height: auto;
          position: sticky;
          z-index: 20;
          padding: 16px;
          border-right: 0;
          border-bottom: 1px solid rgba(22, 33, 50, 0.08);
        }
        .nav-links {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .nav-link {
          white-space: nowrap;
          flex: 0 0 auto;
          margin-bottom: 0;
        }
        main {
          padding: 20px 16px 120px;
        }
        .hero,
        .workspace-summary-strip,
        .workspace-home-header,
        .two-up,
        .three-up,
        .workspace-layout,
        .draft-grid,
        .cluster-grid,
        .compact-grid {
          grid-template-columns: 1fr;
        }
        .workspace-composer {
          grid-template-columns: auto minmax(0, 1fr) auto;
        }
        .workspace-composer-controls {
          grid-auto-flow: column;
          grid-template-columns: none;
        }
        .workspace-composer-shell {
          bottom: 10px;
        }
        .workspace-thread {
          min-height: 320px;
          max-height: none;
        }
        .workspace-side {
          position: static;
          max-height: none;
          overflow: visible;
          padding-right: 0;
        }
        .workspace-context-rail {
          position: static;
          max-height: none;
          overflow: visible;
        }
        .workspace-rail-tabs {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .workspace-action-grid {
          grid-template-columns: 1fr;
        }
        .workspace-status-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .workspace-secondary-grid {
          grid-template-columns: 1fr;
        }
        .composer-row {
          grid-template-columns: 1fr;
        }
        .composer-actions {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav>
        <p class="brand">${publicMode ? 'Judge-ready public proof surface' : 'Local-first social operating system'}</p>
        <h2 class="brand-title">SocialOS</h2>
        <div class="nav-links">
          ${renderNavigation(currentPath, { publicMode })}
        </div>
        <div class="nav-footer">
          <p>${publicMode ? 'Read-only proof pages for judges and reviewers.' : 'Local-first by default, calm by design.'}</p>
          <p>${publicMode ? 'The full interactive demo remains localhost-only.' : 'Memory, follow-up, and content stay in one loop.'}</p>
        </div>
      </nav>
      <main>
        <div class="flash" data-flash hidden></div>
        ${body}
        <footer>Relationship memory, follow-up, content, and reflection — in one local-first workspace.</footer>
      </main>
    </div>
    ${publicMode ? '' : renderClientScript()}
  </body>
</html>`;
}

async function routeRequest(req, res) {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const rawPath = requestUrl.pathname;
  const pathname = normalizePath(rawPath);

  if (method !== 'GET') {
    sendHtml(
      res,
      405,
      renderLayout({
        currentPath: '',
        title: 'Method Not Allowed',
        body: '<h1>Method Not Allowed</h1><p>This dashboard only serves GET routes and delegates mutations to the local API.</p>',
      }),
      { allow: 'GET' }
    );
    return;
  }

  if (rawPath !== pathname) {
    sendRedirect(res, 308, pathname);
    return;
  }

  if (pathname === '/') {
    sendRedirect(res, 302, '/quick-capture');
    return;
  }

  if (pathname === '/cockpit') {
    const target = new URL('/quick-capture', 'http://localhost');
    const prefill = readOptionalString(requestUrl.searchParams.get('prefill'), '');
    if (prefill) target.searchParams.set('prefill', prefill);
    sendRedirect(res, 302, `${target.pathname}${target.search}`);
    return;
  }

  if (pathname === '/ask') {
    const target = new URL('/quick-capture', 'http://localhost');
    const query = readOptionalString(requestUrl.searchParams.get('q'), '');
    if (query) target.searchParams.set('q', query);
    sendRedirect(res, 302, `${target.pathname}${target.search}`);
    return;
  }

  if (pathname === '/dev-digest') {
    sendRedirect(res, 302, '/studio?panel=runs');
    return;
  }

  if (pathname === '/settings') {
    sendRedirect(res, 302, '/studio?panel=policies');
    return;
  }

  if (pathname === '/deck') {
    sendHtml(res, 200, renderDeckDocument(requestUrl));
    return;
  }

  if (/^\/videos\/[^/]+$/u.test(pathname)) {
    const bountyId = decodeURIComponent(pathname.replace(/^\/videos\//u, ''));
    const bounty = getHackathonBountyById(bountyId);
    if (!bounty) {
      sendHtml(
        res,
        404,
        renderLayout({
          currentPath: '',
          title: 'Video Placeholder Not Found',
          body: `<h1>Not Found</h1><p>No video placeholder exists for <code>${escapeHtml(pathname)}</code>.</p>`,
          publicMode: true,
        })
      );
      return;
    }
    sendHtml(
      res,
      200,
      renderLayout({
        currentPath: '',
        title: `${bounty.label} Video Placeholder`,
        body: renderVideoPlaceholderPage(bounty),
        publicMode: true,
      })
    );
    return;
  }

  let page = PAGE_BY_PATH.get(pathname);
  if (!page && /^\/people\/[^/]+$/u.test(pathname)) {
    page = PAGE_BY_PATH.get('/people');
  }
  if (!page && /^\/events\/[^/]+$/u.test(pathname)) {
    page = PAGE_BY_PATH.get('/events');
  }

  if (page) {
    const publicMode = isPublicPageMode(requestUrl);
    const body = await renderPageBody(page, requestUrl);
    sendHtml(
      res,
      200,
      renderLayout({
        currentPath: page.path,
        title: page.title,
        body,
        publicMode,
      })
    );
    return;
  }

  sendHtml(
    res,
    404,
    renderLayout({
      currentPath: '',
      title: 'Not Found',
      body: `<h1>Not Found</h1><p>No dashboard page exists for <code>${escapeHtml(pathname)}</code>.</p>`,
    })
  );
}

export function createWebServer() {
  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => routeRequest(req, res))
      .catch((error) => {
        console.error('[socialos-web] uncaught error:', error);
        sendHtml(
          res,
          500,
          renderLayout({
            currentPath: '',
            title: 'Internal Server Error',
            body: '<h1>Internal Server Error</h1><p>Check server logs for details.</p>',
          })
        );
      });
  });

  return { server };
}

export async function startWebServer({ port = DEFAULT_PORT, quiet = false, apiBaseUrl = '' } = {}) {
  setApiBaseUrlOverride(apiBaseUrl);
  const { server } = createWebServer();

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
    console.log(`socialos-web listening on ${baseUrl}`);
    console.log(`routes: ${DASHBOARD_PAGES.map((page) => page.path).join(', ')}`);
  }

  const close = async () => {
    await new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
    setApiBaseUrlOverride('');
  };

  return {
    server,
    host: LOOPBACK_HOST,
    port: listenPort,
    baseUrl,
    close,
  };
}

function printHelp() {
  console.log(`SocialOS product workspace server (loopback-only)

Usage:
  node socialos/apps/web/server.mjs [--port <port>]

Routes:
  /cockpit
  /quick-capture
  /demo
  /hackathon
  /buddy
  /ask
  /people
  /events
  /drafts
  /queue
  /self-mirror
  /dev-digest
  /studio
  /settings

Defaults:
  host: ${LOOPBACK_HOST}
  port: ${DEFAULT_PORT}
`);
}

function parseCliArgs(argv) {
  const parsed = {
    help: false,
    port: DEFAULT_PORT,
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

  const web = await startWebServer({ port: options.port });

  const shutdown = async (signal) => {
    if (signal) {
      console.log(`\nreceived ${signal}, shutting down...`);
    }
    await web.close();
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
    console.error(`socialos-web: ${error.message}`);
    process.exit(1);
  });
}
