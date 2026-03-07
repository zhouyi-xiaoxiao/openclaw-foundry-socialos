import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.SOCIALOS_WEB_PORT || 4173);
export const DEFAULT_API_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
export const DEFAULT_API_BASE_URL = readOptionalString(
  process.env.SOCIALOS_API_BASE_URL,
  `http://${LOOPBACK_HOST}:${DEFAULT_API_PORT}`
);

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
    id: 'ask',
    title: 'Ask',
    path: '/ask',
    summary: 'Natural-language recall across contacts, events, drafts, and your recent self mirror.',
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
    id: 'settings',
    title: 'Settings',
    path: '/settings',
    summary: 'Operate Foundry, inspect the first-layer cluster, and see exactly where Codex can help.',
  },
];

const ROUTE_PAGES = PAGE_DEFINITIONS.map((page) => ({ ...page }));

export const DASHBOARD_PAGES = ROUTE_PAGES.filter((page) => page.nav !== false).map((page) => ({ ...page }));

const PAGE_BY_PATH = new Map(ROUTE_PAGES.map((page) => [page.path, page]));

function readOptionalString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
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
    const response = await fetch(`${DEFAULT_API_BASE_URL}${pathname}`);
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

function renderNavigation(currentPath) {
  return DASHBOARD_PAGES.map((page) => {
    const active = currentPath === page.path ? 'nav-link active' : 'nav-link';
    return `<a class="${active}" href="${page.path}">${escapeHtml(page.title)}</a>`;
  }).join('');
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
                      <strong>Recent context</strong>
                      <span>${escapeHtml(formatDateTime(capture.createdAt))}</span>
                    </div>
                    <p>${escapeHtml(summarizeCardCopy(capture.text || capture.combinedText || '', 140, 'A recent note is already in this workspace.'))}</p>
                  </article>
                `
              )
              .join('')
          : `
            <article class="workspace-context-note workspace-context-note-empty">
              <p>Start with one natural message. SocialOS stays light until you need a contact, event, draft, or mirror.</p>
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
          <span class="workspace-status-label">Foundry</span>
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
        <p class="workspace-home-title">Warm context. Clear next step.</p>
        <p>${escapeHtml(
          summarizeCardCopy(
            bootstrap.summaryText ||
            'Capture what just happened, recall the right person or event, and only then branch into drafts or follow-up.'
          , 144)
        )}</p>
        ${renderWorkspaceSystemStatus(bootstrap)}
      </div>
      <div class="workspace-summary-actions">
        <div class="stack-meta">
          <strong>Next up</strong>
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
    people: 'People nearby',
    events: 'Event threads',
    drafts: 'Draft momentum',
    mirror: 'Mirror pulse',
  };
  const subtitleByPanel = {
    people: 'The strongest contact context stays one click away from the main conversation.',
    events: 'Recent logbook entries stay close without pulling you into a separate workflow.',
    drafts: 'Return to the latest platform-ready packages from the same shell.',
    mirror: 'Self signal stays nearby, but never louder than the live conversation.',
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
          <p>${escapeHtml(summarizeCardCopy(checkin.reflection, 148, 'Self reflection saved.'))}</p>
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
          <small>${escapeHtml(asset.mimeType || 'n/a')} · ${escapeHtml(asset.assetId)}</small>
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
      const summary = summarizeCardCopy(person.evidenceSnippet || person.notes || '', 112, 'No notes yet.');
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
          <div class="chip-row">
            ${(tags.length ? tags : ['no-tags']).map((tag) => renderPill(tag, 'soft')).join('')}
            ${followUpLabel ? renderPill(followUpLabel, 'accent') : ''}
          </div>
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
        168,
        'Structured event details are ready for draft generation.'
      );
      const badges = [
        normalizeInlineText(payload.audience),
        normalizeInlineText(payload.languageStrategy || payload.language),
        normalizeInlineText(payload.tone),
      ].filter(Boolean);
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
  const zh = isChineseDraftLanguage(draft?.language);
  const t = (englishLabel, chineseLabel) => (zh ? chineseLabel : englishLabel);
  const detailGroups = [
    [t('Image Ideas', '配图思路'), publishPackage.imageIdeas],
    [t('Asset Checklist', '素材清单'), publishPackage.assetChecklist],
    [t('Cover Hooks', '封面钩子'), publishPackage.coverHooks],
    [t('Visual Storyboard', '图文结构'), publishPackage.visualStoryboard],
    [t('Caption Variants', '文案备选'), publishPackage.captionVariants],
    [t('Article Outline', '文章结构'), publishPackage.articleOutline],
    [t('Section Bullets', '分段要点'), publishPackage.sectionBullets],
    [t('Codex Assist', '补充建议'), publishPackage.codexAssist],
  ].filter(([, items]) => Array.isArray(items) && items.length);

  const detailNotes = [
    [t('Lead Paragraph', '导语'), publishPackage.leadParagraph],
    [t('Comment Prompt', '评论引导'), publishPackage.commentPrompt],
    [t('First Comment', '首条评论'), publishPackage.firstComment],
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
      return '中文';
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
    xiaohongshu: 'Xiaohongshu',
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

function pickDraftUiCopy(draft, englishLabel, chineseLabel) {
  return englishLabel;
}

function formatHumanPublishMode(mode) {
  return readOptionalString(mode, 'dry-run') === 'live' ? 'Live publish' : 'Safe rehearsal';
}

function buildClipboardText(draft, publishPackage, mode = 'body') {
  const hashtags = Array.isArray(publishPackage.hashtags) ? publishPackage.hashtags.join(' ') : '';
  const sections = [];
  const zh = isChineseDraftLanguage(draft?.language);

  if (mode === 'bundle') {
    sections.push(zh ? `${draft.platformLabel} 发布包` : `${draft.platformLabel} Publish Package`);
    if (publishPackage.title) sections.push(`${zh ? '标题' : 'Title'}\n${publishPackage.title}`);
    if (publishPackage.hook) sections.push(`${zh ? '开头' : 'Hook'}\n${publishPackage.hook}`);
    if (publishPackage.preview || draft.content) sections.push(`${zh ? '正文' : 'Body'}\n${publishPackage.preview || draft.content}`);
    if (hashtags) sections.push(`${zh ? '标签' : 'Tags'}\n${hashtags}`);
    if (Array.isArray(publishPackage.assetChecklist) && publishPackage.assetChecklist.length) {
      sections.push(`${zh ? '素材' : 'Assets'}\n${publishPackage.assetChecklist.join('\n')}`);
    }
    if (Array.isArray(publishPackage.steps) && publishPackage.steps.length) {
      sections.push(`${zh ? '发布步骤' : 'Publish Steps'}\n${publishPackage.steps.join('\n')}`);
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
        pickDraftUiCopy(draft, 'Copy Draft', '复制草稿')
      )}</button>
      <button type="button" class="secondary-button" data-copy-text="${escapeHtml(copyBundle)}">${escapeHtml(
        pickDraftUiCopy(draft, 'Copy Package', '复制发布包')
      )}</button>
      ${
        entryUrl
          ? `<a class="mini-link action-link" href="${escapeHtml(entryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
              pickDraftUiCopy(draft, 'Open Platform', '打开平台')
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
              <button type="submit">${escapeHtml(pickDraftUiCopy(draft, 'Queue Draft', '加入队列'))}</button>
            </div>
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
      ? `<p><strong>Live Fallback:</strong> env=${escapeHtml(
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
      return `
        <article class="stack-card queue-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.eventTitle || task.platformLabel)}</strong>
            <span>${escapeHtml(formatDateTime(task.updatedAt))}</span>
          </div>
          <div class="chip-row">
            ${renderPill(task.status, statusTone(task.status))}
            ${renderPill(task.mode, task.mode === 'live' ? 'accent' : 'soft')}
            ${renderPill(task.capability?.supportLevel || 'L0 Draft', 'neutral')}
            ${renderPill(formatLanguageLabel(task.language), 'soft')}
            ${task.duplicateCount > 1 ? renderPill(`${task.duplicateCount} recent attempts`, 'soft') : ''}
          </div>
          ${renderPublishActions(task, publishPackage)}
          <p>${escapeHtml(summarizeCardCopy(task.content || publishPackage.preview || publishPackage.title || '', 170, 'Draft package is ready for the next step.'))}</p>
          <small>${escapeHtml(`Mode: ${formatHumanPublishMode(publishMode)} · destination ${task.platformLabel || task.platform || 'platform'}`)}</small>
          ${
            queued
              ? `
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
                  ${
                    liveApprovalEnabled
                      ? ''
                      : '<p class="quiet-label">Switch runtime publish mode to live before enabling live execution controls.</p>'
                  }
                  <div class="inline-actions">
                    <button type="submit">Approve + Execute</button>
                  </div>
                  <div class="form-result" data-form-result></div>
                </form>
                <details class="details-shell queue-details">
                  <summary>Live controls</summary>
                  <p>Only switch these on when you really intend to leave Safe rehearsal and the platform credentials are ready.</p>
                </details>
              `
              : needsManual
                ? `
                  <div class="result-block">
                    <p><strong>Entry Target:</strong> ${escapeHtml(execution.preflight?.entryTarget || task.capability?.entryTarget || 'manual')}</p>
                    <p><strong>Preflight:</strong> ${escapeHtml(execution.preflight?.note || execution.delivery?.reason || 'manual handoff ready')}</p>
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
                      ? `<details class="details-shell queue-details"><summary>Live fallback details</summary>${renderLiveFallback(liveFallbackReason)}</details>`
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
                  <summary>Execution details</summary>
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
            <li>最近最适合联系谁来帮我扩散 demo？</li>
            <li>What event already has draft material?</li>
            <li>我最近最有能量的场景是什么？</li>
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
  if (!blocked.length) return renderEmptyState('No blocked queue items right now.');
  return `<ul class="blocked-list">${blocked
    .map((item) => `<li><strong>line ${escapeHtml(String(item.line))}</strong> ${escapeHtml(item.task)}</li>`)
    .join('')}</ul>`;
}

function renderClusterCards(cluster) {
  const agents = Array.isArray(cluster?.agents) ? cluster.agents : [];
  if (!agents.length) return renderEmptyState('Foundry cluster is not configured.');
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
  if (!tasks.length) return renderEmptyState('No structured Foundry tasks yet.');
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
            <h3>Foundry Responsibilities</h3>
          </div>
        </div>
        <ul class="compact-list">
          <li>接收 quick / structured 产品任务</li>
          <li>生成 PlanSpec 并驱动 orchestrator/coder/tester/reviewer</li>
          <li>持续巡检、写 run report、同步 digest</li>
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
        renderMetric(query ? String(visiblePeople.length) : '0', 'matches'),
        renderMetric(detail?.person?.name ? '1' : '0', 'detail open'),
      ].join(''),
      `<div class="info-card"><strong>Contacts</strong><p>Keep the people you know searchable, scannable, and connected to the events they belong to.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Command Bar',
        `
          ${renderCommandBar({
            action: '/people',
            value: query,
            placeholder: 'Find Sam from Bristol, update Alex follow-up, or describe a new contact naturally.',
            hint: 'Search, create, or update a contact with one natural sentence.',
            submitLabel: 'Run'
          })}
          ${commandPayload?.answer ? `<div class="info-callout"><strong>Contacts</strong><br />${escapeHtml(commandPayload.answer)}</div>` : ''}
          ${renderPeopleCards(visiblePeople, false, (person) => `/people/${encodeURIComponent(person.personId)}`)}
        `,
        'Use one natural-language command to search, draft a new contact, or review an update.'
      )}
      ${renderPanel(
        detail?.person?.personId ? 'Contact Detail' : commandPayload?.reviewDraft ? 'Review Contact' : 'Create Contact',
        renderDetailBody,
        detail?.person?.personId
          ? 'A strong contact page shows the relationship summary first, then the connected event context, graph, and edit actions.'
          : commandPayload?.reviewDraft
            ? 'Natural-language entry stays review-first until you confirm the contact details.'
            : 'Manual cards make the People page useful immediately.'
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
      [renderMetric(String(events.length), 'recent events'), renderMetric(query ? String(visibleEvents.length) : String(captures.length), query ? 'matches' : 'capture candidates')].join('')
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Command Bar',
        `
          ${renderCommandBar({
            action: '/events',
            value: query,
            placeholder: 'Find the London meetup with Sam, or draft a new event naturally.',
            hint: 'Search, open, or draft an event with one natural sentence.',
            submitLabel: 'Run'
          })}
          ${commandPayload?.answer ? `<div class="info-callout"><strong>Logbook</strong><br />${escapeHtml(commandPayload.answer)}</div>` : ''}
          ${renderEventCards(visibleEvents, (event) => `/events/${encodeURIComponent(event.eventId)}`)}
        `,
        'Use one natural-language command to find an event, open the best match, or review a new event draft.'
      )}
      ${renderPanel(
        detail?.event?.eventId ? 'Event Detail' : commandPayload?.reviewDraft ? 'Review Event' : 'Create Event',
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
          <form class="api-form" data-api-form="true" data-endpoint="/events" data-json-fields="payload">
            ${renderFormField('Title', '<input name="title" type="text" placeholder="OpenClaw SocialOS product push" />')}
            ${renderFormField('Capture Seed', `<select name="captureId">${captureOptions}</select>`)}
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
            ${renderFormField('Links', '<textarea name="links" rows="3" placeholder="https://example.com\\nhttps://another-link"></textarea>', 'One link per line')}
            ${renderFormField('Assets', '<textarea name="assets" rows="3" placeholder="hero-image.png\\nlaunch-screenshot.png"></textarea>', 'One asset note per line')}
            ${renderFormField(
              'Payload JSON',
              '<textarea name="payload" rows="8">{\n  "audience": "builders and collaborators",\n  "goal": "ship a more operational dashboard",\n  "details": {\n    "focus": "ui + blocked unlocks + foundry workboard"\n  }\n}</textarea>',
              'This becomes event context for draft generation.'
            )}
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
            : 'Events are the handoff point from captures into campaigns.'
      )}
    </div>
    ${renderPanel('Recent Captures', renderCaptureCards(captures.slice(0, 4)), 'Choose one as context if it helps')}
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
      `<div class="info-card"><strong>Simple draft mode</strong><p>One event, seven standard drafts. LinkedIn, X, Instagram stay in English. 中文平台 stays Chinese.</p></div>`
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
              LinkedIn / X / Instagram use English only.<br />
              知乎 / 小红书 / 朋友圈 / 公众号 use Chinese only.
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
        `${formatHumanPublishMode(publishMode)} keeps the next handoff clear. Live publish still needs explicit UI intent, credentials, and environment readiness.`
      )}</p></div>`
    )}
    <div class="grid three-up">
      ${renderPanel('Ready', renderQueueCards(readyTasks, publishMode), 'Approved here first, still dry-run by default.')}
      ${renderPanel('Manual Step', renderQueueCards(manualTasks, publishMode), 'Assistant prepares the handoff, you record the real outcome.')}
      ${renderPanel('Done / Failed', renderQueueCards(doneTasks, publishMode), 'Closed tasks keep the audit trail visible without cluttering the live lane.')}
    </div>
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
      'Generate or refresh',
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
        'Daily keeps today legible. Weekly turns repeated evidence into a higher-level pattern view.'
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
  const blocked = blockedRes.ok ? blockedRes.payload.blockedTasks || [] : [];
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

async function renderSettingsPage(page, requestUrl) {
  const [runtimeRes, clusterRes, tasksRes, statusRes, runsRes, blockedOpsRes, digestRes] = await Promise.all([
    fetchJsonSafe('/settings/runtime'),
    fetchJsonSafe('/ops/cluster'),
    fetchJsonSafe('/ops/tasks?limit=8'),
    fetchJsonSafe('/ops/status'),
    fetchJsonSafe('/ops/runs?limit=8'),
    fetchJsonSafe('/ops/blocked'),
    fetchJsonSafe('/dev-digest?limit=8'),
  ]);
  const runtime = runtimeRes.ok ? runtimeRes.payload : {};
  const cluster = clusterRes.ok ? clusterRes.payload.foundry : runtime.foundry;
  const codex = clusterRes.ok ? clusterRes.payload.codex : runtime.codex;
  const blocked = clusterRes.ok ? clusterRes.payload.blocked || [] : [];
  const embeddings = runtime.embeddings || {};
  const tasks = tasksRes.ok ? tasksRes.payload.tasks || [] : [];
  const healthStatus = cluster?.llmTaskHealth?.status || 'unknown';
  const status = statusRes.ok ? statusRes.payload : {};
  const runs = runsRes.ok ? runsRes.payload.runs || [] : [];
  const digestBlocked = blockedOpsRes.ok ? blockedOpsRes.payload.blockedTasks || [] : [];
  const digests = digestRes.ok ? digestRes.payload.digests || [] : [];
  const latestRun = status.latestRun || runs[0] || null;
  const rawPanel = readOptionalString(requestUrl?.searchParams?.get('panel'), 'basics').toLowerCase();
  const activePanel = ['automation', 'advanced', 'ops'].includes(rawPanel)
    ? rawPanel === 'ops'
      ? 'advanced'
      : rawPanel
    : 'basics';
  const panelTabs = [
    { id: 'basics', label: 'Basics' },
    { id: 'automation', label: 'Automation' },
    { id: 'advanced', label: 'Advanced' },
  ];
  const basicsBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Publish safety',
        `
          <div class="stack">
            <article class="stack-card">
              <div class="stack-meta">
                <strong>${escapeHtml(formatHumanPublishMode(runtime.publishMode))}</strong>
                ${renderPill(runtime.publishMode === 'dry-run' ? 'default' : 'gated', runtime.publishMode === 'dry-run' ? 'good' : 'warn')}
              </div>
              <p>${escapeHtml(
                runtime.publishMode === 'dry-run'
                  ? 'Safe rehearsal prepares copy, queue state, and platform handoff, but never posts automatically.'
                  : 'Live publish can post for real, but it still requires explicit credentials and operator intent.'
              )}</p>
            </article>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
              <input type="hidden" name="command" value="SET_PUBLISH_MODE" />
              ${renderFormField(
                'Mode',
                `<select name="mode">
                  <option value="dry-run"${runtime.publishMode === 'dry-run' ? ' selected' : ''}>Safe rehearsal</option>
                  <option value="live"${runtime.publishMode === 'live' ? ' selected' : ''}>Live publish</option>
                </select>`,
                'Safe rehearsal is the default. It keeps handoff visible without pushing anything live.'
              )}
              <div class="inline-actions">
                <button type="submit">Update mode</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Make the publish posture understandable before you touch automation.'
      )}
      ${renderPanel(
        'System basics',
        `
          <ul class="compact-list">
            <li><strong>Memory:</strong> local-first</li>
            <li><strong>Network:</strong> loopback only</li>
            <li><strong>Voice:</strong> ${escapeHtml(cluster?.llmTaskHealth?.status === 'ok' || cluster?.llmTaskHealth?.status === 'mock' ? 'server-ready or browser fallback available' : 'browser fallback only')}</li>
            <li><strong>Embeddings:</strong> ${escapeHtml(embeddings.effectiveProvider || 'local')}</li>
          </ul>
          <div class="chip-row">
            ${renderPill(formatHumanPublishMode(runtime.publishMode), runtime.publishMode === 'dry-run' ? 'soft' : 'warn')}
            ${renderPill('loopback only', 'good')}
            ${renderPill(cluster?.enabled ? 'Foundry ready' : 'Foundry unavailable', cluster?.enabled ? 'good' : 'warn')}
          </div>
        `,
        'The basics panel answers how safe and automatic the system is in plain language.'
      )}
    </div>
  `;
  const automationBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Runtime controls',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
              <input type="hidden" name="command" value="RUN_DEVLOOP_ONCE" />
              <button type="submit">Run once</button>
              <div class="form-result" data-form-result></div>
            </form>
            <div class="inline-actions stretch">
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
                <input type="hidden" name="command" value="PAUSE_DEVLOOP" />
                <button type="submit">Pause loop</button>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
                <input type="hidden" name="command" value="RESUME_DEVLOOP" />
                <button type="submit">Resume loop</button>
                <div class="form-result" data-form-result></div>
              </form>
            </div>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
              <input type="hidden" name="command" value="STATUS" />
              <button type="submit">Refresh status</button>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Use automation here when you want the loop to keep moving without leaving the product shell.'
      )}
      ${renderPanel(
        'Foundry task intake',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/tasks">
              <input type="hidden" name="intakeMode" value="quick" />
              ${renderFormField(
                'Quick task',
                '<input name="taskText" type="text" placeholder="Polish the queue handoff for demo mode" />',
                'Use one sentence when you want the cluster to pick up a product-facing improvement.'
              )}
              <div class="inline-actions">
                <button type="submit">Create quick task</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            <details class="details-shell">
              <summary>Structured Task Intake</summary>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/tasks">
                <input type="hidden" name="intakeMode" value="structured" />
                ${renderFormField('Title', '<input name="title" type="text" placeholder="Improve contact-event graph clarity" />')}
                ${renderFormField('Goal', '<textarea name="goal" rows="3" placeholder="Describe the user-facing outcome you want."></textarea>')}
                ${renderFormField('Acceptance Criteria', '<textarea name="acceptanceCriteria" rows="4" placeholder="One line per criterion"></textarea>')}
                ${renderFormField('Constraints', '<textarea name="constraints" rows="3" placeholder="One line per constraint"></textarea>')}
                ${renderFormField(
                  'Scope',
                  `<select name="scope">
                    <option value="socialos">socialos</option>
                    <option value="openclaw">openclaw</option>
                    <option value="multi-repo">multi-repo</option>
                  </select>`,
                  'Only an explicit scope allows cross-repo work.'
                )}
                ${renderFormField('Repo Targets', '<textarea name="repoTargets" rows="3" placeholder="socialos&#10;openclaw"></textarea>')}
                ${renderFormField('Preferred Tests', '<textarea name="preferredTests" rows="3" placeholder="bash scripts/test.sh&#10;node scripts/tests/product_workspace_smoke.mjs"></textarea>')}
                <div class="inline-actions">
                  <button type="submit">Create structured task</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
            </details>
          </div>
        `,
        'Quick mode is the fast lane. Structured mode gives Foundry enough detail to execute directly.'
      )}
    </div>
    ${renderPanel('Recent Structured Tasks', renderFoundryTaskCards(tasks), 'These are the tasks the generic executor can act on right now.')}
  `;
  const advancedBody = `
    <div class="grid two-up">
      ${renderPanel(
        'Foundry Execution Surface',
        renderFoundryExecutionSurface(cluster),
        'The first-layer cluster can now act as an execution surface, not just a background loop.'
      )}
      ${renderPanel(
        'Foundry Cluster',
        renderClusterCards(cluster),
        'Each lane keeps a narrow role so the product can stay understandable while the system stays automated.'
      )}
    </div>
    ${renderCodexSummary(codex)}
    ${renderPanel('Blocked Surface', renderBlockedList(blocked), 'These are the items still blocked by credentials, rollout decisions, or platform limits.')}
    <div class="grid two-up">
      ${renderPanel(
        'Ops Digest',
        latestRun
          ? `
              <div class="stack">
                <article class="stack-card">
                  <div class="stack-meta">
                    <code>${escapeHtml(latestRun.runId || 'unknown')}</code>
                    <span>${escapeHtml(latestRun.status || 'unknown')}</span>
                  </div>
                  <p>${escapeHtml(latestRun.summary || 'No latest run summary yet.')}</p>
                  <small>${escapeHtml(latestRun.next || 'No next step recorded.')}</small>
                </article>
                <article class="stack-card compact-card">
                  <div class="chip-row">
                    ${renderPill(readOptionalString(status.mode, 'unknown'), 'soft')}
                    ${renderPill(`blocked ${String(status.queue?.blocked ?? digestBlocked.length)}`, digestBlocked.length ? 'warn' : 'good')}
                    ${renderPill(formatDuration(status.health?.latestRunDurationMs), 'soft')}
                  </div>
                  <p>${escapeHtml(readOptionalString(status.latestDigest, 'No digest snapshot yet.'))}</p>
                </article>
              </div>
            `
          : renderEmptyState('No ops digest snapshot yet.'),
        'Ops Digest now lives here instead of competing with the product shell.'
      )}
      ${renderPanel(
        'Recent Runs + Digest Feed',
        `
          ${renderDigestRunList(runs.slice(0, 4))}
          ${renderPanel(
            'Digest feed',
            digests.length
              ? `<div class="stack">${digests
                  .slice(0, 4)
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
              : renderEmptyState('No digest feed rows yet.')
          )}
        `,
        'Advanced keeps the dense operational detail available without making the product itself feel like a console.'
      )}
    </div>
  `;

  return `
    ${renderHero(
      page,
      [
        renderMetric(formatHumanPublishMode(runtime.publishMode), 'publish mode'),
        renderMetric(embeddings.effectiveProvider || 'local', 'embeddings'),
        renderMetric(String((cluster?.agents || []).length), 'foundry lanes'),
        renderMetric(String(tasks.length), 'structured tasks'),
      ].join(''),
      `<div class="info-card"><strong>Settings</strong><p>Understand how safe the system is first, then decide how much automation you actually want to expose.</p></div>`
    )}
    <div class="workspace-rail-tabs">
      ${panelTabs
        .map((tab) => {
          const active = tab.id === activePanel ? 'workspace-rail-tab active' : 'workspace-rail-tab';
          return `<a class="${active}" href="/settings?panel=${tab.id}">${tab.label}</a>`;
        })
        .join('')}
    </div>
    ${activePanel === 'automation' ? automationBody : activePanel === 'advanced' ? advancedBody : basicsBody}
  `;
}

async function renderPageBody(page, requestUrl) {
  switch (page.id) {
    case 'cockpit':
      return renderCockpitPage(page);
    case 'quick-capture':
      return renderQuickCapturePage(page, requestUrl);
    case 'ask':
      return renderAskPage(page, requestUrl);
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
    case 'dev-digest':
      return renderDevDigestPage(page);
    case 'settings':
      return renderSettingsPage(page, requestUrl);
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
      const apiBase = ${JSON.stringify(DEFAULT_API_BASE_URL)};
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
        return !normalized || ['new contact', 'new contact draft', 'unconfirmed contact', 'unknown contact', '新联系人', '未确认联系人'].includes(normalized);
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
          submitter.disabled = false;
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

      async function uploadWorkspaceAsset(file) {
        const composer = document.querySelector('[data-workspace-chat-form]');
        const statusNode = document.querySelector('[data-audio-status]');
        const resultNode = composer?.querySelector('[data-form-result]');
        if (!file || !composer) return null;
        const transcriptText =
          (file.type || '').startsWith('audio/')
            ? String(composer.elements.text?.value || captureState.liveTranscript || '').trim()
            : '';

        const payload = {
          kind: (file.type || '').startsWith('audio/') ? 'audio' : 'image',
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name || 'upload.bin',
          contentBase64: await encodeFileAsDataUrl(file),
          source: 'workspace-chat',
        };
        if (transcriptText) payload.transcript = transcriptText;

        const response = await apiRequest('/capture/assets', payload, 'POST');
        if (!response.ok) {
          renderWorkspaceComposerResult(resultNode, response.payload?.error || 'Attachment upload failed.', false);
          return null;
        }

        if (response.payload.asset) {
          appendCaptureAsset(response.payload.asset);
          if (statusNode) {
            statusNode.innerHTML = '<strong>Attached</strong><p>' +
              escapeHtml(response.payload.asset.fileName || response.payload.asset.assetId) +
              ' is ready in the composer.</p>';
          }
          renderWorkspaceComposerResult(resultNode, '');
        }

        return response.payload.asset || null;
      }

      async function handleWorkspaceChat(form, submitter, { silentUserTurn = false } = {}) {
        const resultNode = form.querySelector('[data-form-result]');
        const text = String(form.elements.text.value || '').trim();
        const assets = [...captureState.assets];

        if (!text && !assets.length) {
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
            captureState.liveTranscript = '';
            updateCaptureAssetInputs();
            setTranscriptPreview('');
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
            if (submitter) submitter.disabled = true;
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
          const payload = {
            kind: form.dataset.assetUpload || 'image',
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name || 'upload.bin',
            contentBase64: await encodeFileAsDataUrl(file),
            transcript: form.querySelector('textarea[name="transcript"]')?.value || '',
            source: 'dashboard',
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
              const asset = await uploadWorkspaceAsset(file);
              const finalTranscript = String(
                asset?.extractedText ||
                asset?.previewText ||
                captureState.liveTranscript ||
                ''
              ).trim();

              if (finalTranscript && asset) {
                mergeTranscriptIntoComposer(form, finalTranscript);
                setTranscriptPreview(finalTranscript, 'ready');
                statusNode.innerHTML = '<strong>Transcript ready</strong><p>Review or edit the text in the composer, then press send when you are happy with it.</p>';
                renderWorkspaceComposerResult(
                  form?.querySelector('[data-form-result]'),
                  'Voice note saved. The transcript is now in the composer for editing before send.'
                );
              } else if (finalTranscript) {
                mergeTranscriptIntoComposer(form, finalTranscript);
                setTranscriptPreview(finalTranscript, 'ready');
                statusNode.innerHTML = '<strong>Transcript drafted, audio not saved</strong><p>The transcript is in the composer, but the voice attachment did not upload. You can still edit and send the text-only version.</p>';
              } else if (asset) {
                setTranscriptPreview('', 'neutral');
                statusNode.innerHTML = '<strong>Voice note saved</strong><p>I kept the recording as an attachment, but there is no transcript yet. You can type or edit before sending.</p>';
                renderWorkspaceComposerResult(
                  form?.querySelector('[data-form-result]'),
                  'Voice note saved, but transcription is not ready yet. Edit the composer manually when you want to send.',
                  false
                );
              } else {
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

      consumeFlash();
      renderWorkspaceAssets();
      document.querySelectorAll('[data-workspace-contact-review]').forEach((reviewForm) => {
        updateWorkspaceContactReviewState(reviewForm);
      });
      maybeRunInitialWorkspaceQuery();
    </script>
  `;
}

function renderLayout({ currentPath, title, body }) {
  return `<!doctype html>
<html lang="en">
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
        <p class="brand">Local-first social operating system</p>
        <h2 class="brand-title">SocialOS</h2>
        <div class="nav-links">
          ${renderNavigation(currentPath)}
        </div>
        <div class="nav-footer">
          <p>Local-first by default, calm by design.</p>
          <p>Memory, follow-up, and content stay in one loop.</p>
        </div>
      </nav>
      <main>
        <div class="flash" data-flash hidden></div>
        ${body}
        <footer>Relationship memory, follow-up, content, and reflection — in one local-first workspace.</footer>
      </main>
    </div>
    ${renderClientScript()}
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
    sendRedirect(res, 302, '/settings?panel=ops');
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
    const body = await renderPageBody(page, requestUrl);
    sendHtml(
      res,
      200,
      renderLayout({
        currentPath: page.path,
        title: page.title,
        body,
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

export async function startWebServer({ port = DEFAULT_PORT, quiet = false } = {}) {
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
  /ask
  /people
  /events
  /drafts
  /queue
  /self-mirror
  /dev-digest
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
