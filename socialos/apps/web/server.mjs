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
    nav: false,
  },
  {
    id: 'events',
    title: 'Logbook',
    path: '/events',
    summary: 'A structured record of campaign-worthy events and the timeline behind them.',
    nav: false,
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
        <p class="eyebrow">SocialOS Product Workspace</p>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.summary)}</p>
        <p class="api-hint">API base: <code>${escapeHtml(DEFAULT_API_BASE_URL)}</code></p>
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
    <div class="chat-shell">
      <div class="chat-bubble system">
        <strong>Workspace chat is the main surface now</strong>
        <p>Send a text, voice note, screenshot, or business card here. The thread stays lightweight and only brings in contacts, events, or content actions when they are actually useful.</p>
      </div>
      <div class="chat-bubble user ghost">
        <p>今天认识了一个做增长的人，下周二要跟进，顺便帮我看看是不是已经在记忆里。</p>
      </div>
    </div>
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
  const recent = filterMeaningfulCaptures(captures, 3);
  return `
    <div class="chat-shell workspace-thread" data-workspace-thread>
      ${renderChatComposerIntro()}
      ${
        recent.length
          ? recent
              .map(
                (capture) => `
                  <article class="chat-bubble user">
                    <div class="stack-meta">
                      ${renderPill(capture.source || 'capture', 'soft')}
                      <span>${escapeHtml(formatDateTime(capture.createdAt))}</span>
                    </div>
                    <p>${escapeHtml(truncate(capture.text, 220))}</p>
                  </article>
                `
              )
              .join('')
          : `
            <article class="chat-bubble system ghost">
              <p>No saved turns yet. The first message you send here can become a contact, a self check-in, or an event suggestion.</p>
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
  return `<div class="stack">${queueTasks
    .map(
      (task) => `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.eventTitle || task.platformLabel || 'Queue item')}</strong>
            ${renderPill(task.status || 'queued', task.status === 'manual_step_needed' ? 'warn' : 'soft')}
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
          <p>${escapeHtml(truncate(checkin.reflection, 180))}</p>
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

function renderPeopleCards(people, showScore = false) {
  if (!people.length) return renderEmptyState('No people cards match this query.');
  return `<div class="stack">${people
    .map((person) => {
      const tags = Array.isArray(person.tags) ? person.tags : [];
      const score = showScore && typeof person.score === 'number' ? person.score.toFixed(3) : null;
      const summary = summarizeCardCopy(person.evidenceSnippet || person.notes || '', 144, 'No notes yet.');
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
          </div>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'people', contactId: person.personId }))}">Open Detail</a>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderEventCards(events) {
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
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'events', eventId: event.eventId }))}">Open Event</a>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
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

function isChineseDraftLanguage(language) {
  return String(language || '').toLowerCase() === 'zh';
}

function pickDraftUiCopy(draft, englishLabel, chineseLabel) {
  return isChineseDraftLanguage(draft?.language) ? chineseLabel : englishLabel;
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
      return `
        <article class="draft-card">
          <div class="draft-head">
            <div>
              <p class="card-kicker">${escapeHtml(draftContextTitle)}</p>
              <h3>${escapeHtml(draft.platformLabel)} · ${escapeHtml(formatLanguageLabel(draft.language))}</h3>
              <p class="draft-subtitle">${escapeHtml(
                isChineseDraftLanguage(draft.language)
                  ? '中文平台稿件，直接复制即可。'
                  : 'English platform draft, ready to copy.'
              )}</p>
            </div>
            <div class="chip-row">
              ${renderPill(supportLabel, capability.liveEligible ? 'accent' : 'soft')}
              ${renderPill(formatLanguageLabel(draft.language), 'neutral')}
            </div>
          </div>
          ${renderPublishActions(draft, publishPackage)}
          ${publishPackage.title ? `<p class="draft-title">${escapeHtml(publishPackage.title)}</p>` : ''}
          ${publishPackage.hook ? `<p class="draft-hook">${escapeHtml(publishPackage.hook)}</p>` : ''}
          ${renderRichTextPreview(previewBody, 'draft-preview')}
          ${
            hashtags.length
              ? `<p class="draft-tags">${escapeHtml(hashtags.join(' '))}</p>`
              : ''
          }
          ${
            hasIssues
              ? `<div class="result-block">
                  <p><strong>${escapeHtml(pickDraftUiCopy(draft, 'Validation', '校验'))}:</strong> ${escapeHtml(
                    pickDraftUiCopy(draft, 'needs review', '需要检查')
                  )}</p>
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
            <summary>${escapeHtml(pickDraftUiCopy(draft, 'More options', '更多选项'))}</summary>
            <div class="draft-details-body">
              <div class="package-meta">
                <p><strong>${escapeHtml(pickDraftUiCopy(draft, 'Entry', '入口'))}:</strong> ${escapeHtml(entryLabel)}</p>
                <p><strong>${escapeHtml(pickDraftUiCopy(draft, 'Blocked By', '受限于'))}:</strong> ${escapeHtml(blockedLabel)}</p>
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
                  pickDraftUiCopy(draft, 'Edit Draft', '编辑草稿'),
                  `<textarea name="content" rows="8">${escapeHtml(draft.content)}</textarea>`,
                  pickDraftUiCopy(draft, 'Edit the final copy before publishing.', '发布前可以在这里微调正文。')
                )}
                ${renderFormField(
                  pickDraftUiCopy(draft, 'Variants', '备注'),
                  `<textarea name="variants" rows="3">${escapeHtml((draft.variants || []).join('\n'))}</textarea>`,
                  pickDraftUiCopy(draft, 'Optional notes, one line each.', '可选备注，每行一条。')
                )}
                <div class="inline-actions">
                  <button type="submit">${escapeHtml(pickDraftUiCopy(draft, 'Save Edit', '保存修改'))}</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/drafts/${encodeURIComponent(
                draft.draftId
              )}/validate">
                <div class="inline-actions">
                  <button type="submit">${escapeHtml(pickDraftUiCopy(draft, 'Run Validation', '重新校验'))}</button>
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

function renderQueueCards(queueTasks, publishMode) {
  if (!queueTasks.length) return renderEmptyState('No queue tasks yet.');
  return `<div class="stack">${queueTasks
    .map((task) => {
      const result = safeJson(task.result, {});
      const execution = safeJson(result.execution, {});
      const manualCompletion = safeJson(result.manualCompletion, {});
      const liveFallbackReason = safeJson(execution.liveFallbackReason, {});
      const publishPackage = safeJson(task.metadata?.publishPackage, {});
      const queued = task.status === 'queued';
      const needsManual = task.status === 'manual_step_needed';
      return `
        <article class="stack-card queue-card">
          <div class="stack-meta">
            <strong>${escapeHtml(task.eventTitle || task.platformLabel)}</strong>
            <span>${escapeHtml(formatDateTime(task.updatedAt))}</span>
          </div>
          <div class="chip-row">
            ${renderPill(task.status, queued ? 'warn' : 'good')}
            ${renderPill(task.mode, task.mode === 'live' ? 'accent' : 'soft')}
            ${renderPill(task.capability?.supportLevel || 'L0 Draft', 'neutral')}
            ${renderPill(formatLanguageLabel(task.language), 'soft')}
          </div>
          ${renderPublishActions(task, publishPackage)}
          <p>${escapeHtml(truncate(task.content, 220))}</p>
          <small>draft ${escapeHtml(task.draftId)} · current workspace publish mode ${escapeHtml(publishMode)}</small>
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
                        <option value="dry-run">dry-run</option>
                        <option value="live">live</option>
                      </select>`
                    )}
                    ${renderFormField(
                      'Live Gate',
                      `<label class="toggle"><input type="checkbox" name="liveEnabled" value="true" /> <span>UI live intent</span></label>`
                    )}
                    ${renderFormField(
                      'Credentials',
                      `<label class="toggle"><input type="checkbox" name="credentialsReady" value="true" /> <span>credentials ready</span></label>`
                    )}
                  </div>
                  <div class="inline-actions">
                    <button type="submit">Approve + Execute</button>
                    <code>${escapeHtml(task.taskId)}</code>
                  </div>
                  <div class="form-result" data-form-result></div>
                </form>
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
                      <code>${escapeHtml(task.taskId)}</code>
                    </div>
                    <div class="form-result" data-form-result></div>
                  </form>
                `
              : `
                <div class="result-block">
                  <p><strong>Run:</strong> ${escapeHtml(execution.runId || 'n/a')}</p>
                  <p><strong>Delivery:</strong> ${escapeHtml(
                    manualCompletion.outcome || execution.delivery?.reason || result.execution?.delivery?.reason || 'n/a'
                  )}</p>
                  ${manualCompletion.link ? `<p><strong>Link:</strong> ${escapeHtml(manualCompletion.link)}</p>` : ''}
                  ${manualCompletion.note ? `<p><strong>Note:</strong> ${escapeHtml(manualCompletion.note)}</p>` : ''}
                  ${
                    Object.keys(liveFallbackReason).length
                      ? `<p><strong>Live Fallback:</strong> env=${escapeHtml(
                          String(Boolean(liveFallbackReason.envEnabled))
                        )} · ui=${escapeHtml(String(Boolean(liveFallbackReason.uiEnabled)))} · creds=${escapeHtml(
                          String(Boolean(liveFallbackReason.credentialsReady))
                        )}</p>`
                      : ''
                  }
                </div>
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
            <strong>${escapeHtml(draft.platformLabel || draft.platform || 'Draft')}</strong>
            <span>${escapeHtml(formatLanguageLabel(draft.language))}</span>
          </div>
          <p>${escapeHtml(summarizeCardCopy(draft.snippet || draft.content || '', 164, 'A platform-ready draft already exists for this event.'))}</p>
          <div class="inline-actions">
            <a class="mini-link" href="${escapeHtml(buildWorkspaceHref({ panel: 'drafts', eventId: draft.eventId || '' }))}">Open Drafts</a>
            ${draft.eventTitle ? `<span class="quiet-label">${escapeHtml(truncate(draft.eventTitle, 42))}</span>` : ''}
          </div>
        </article>
      `
    )
    .join('')}</div>`;
}

function renderMirrorBlock(mirrorPayload) {
  const latestMirror = mirrorPayload.latestMirror || null;
  const checkins = Array.isArray(mirrorPayload.checkins) ? mirrorPayload.checkins : [];

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
                <p>${escapeHtml(latestMirror.summaryText || latestMirror.content || '')}</p>
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
      ${renderPanel('Recent Check-ins', renderCheckinCards(checkins.slice(0, 8)))}
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
  const [bootstrapRes, assetsRes] = await Promise.all([
    fetchJsonSafe('/workspace/bootstrap'),
    fetchJsonSafe('/capture/assets?limit=8'),
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
        voiceReadiness: { openAiConfigured: false },
      };
  const assets = assetsRes.ok ? assetsRes.payload.assets || [] : [];
  const openAiReady = Boolean(bootstrap.voiceReadiness?.openAiConfigured);
  const autoQuery = readOptionalString(requestUrl.searchParams.get('q'), '');
  const prefill = readOptionalString(requestUrl.searchParams.get('prefill'), autoQuery);

  return `
    ${renderWorkspaceHomeHeader(bootstrap)}
    <div class="workspace-layout">
      <section class="panel workspace-main-panel">
        <div class="panel-head">
          <div>
            <h2>Workspace</h2>
            <p class="panel-subtitle">Ask naturally, note who you met, or promote a thread into an event only when it is actually useful.</p>
          </div>
        </div>
        ${renderWorkspaceThreadSeed(bootstrap.recentCaptures || [])}
        <div class="workspace-composer-shell">
          <div class="workspace-asset-tray" data-workspace-assets>
            ${assets.length ? assets.slice(0, 3).map((asset) => `<span class="asset-chip tone-soft">${escapeHtml(asset.fileName || asset.assetId)}</span>`).join('') : ''}
          </div>
          <form class="workspace-composer" data-workspace-chat-form data-openai-transcription-ready="${openAiReady ? 'true' : 'false'}" data-initial-query="${escapeHtml(autoQuery)}">
            <input type="hidden" name="source" value="workspace-chat" />
            <input type="hidden" name="assetIds" value="" data-capture-asset-ids />
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
          <div class="workspace-composer-note" data-audio-status>
            Ask anything, drop a screenshot, or record a voice note. When voice stops, we draft the transcript into the composer so you can edit it before sending.
          </div>
        </div>
        <div class="form-result" data-form-result hidden></div>
      </section>
      <aside class="workspace-side" data-mobile-context-sections>
        ${renderPanel('Recent Contacts', renderPeopleCards(bootstrap.recentContacts || []), 'Cleaner memory cards stay one click away from the main chat.')}
        ${renderPanel('Recent Events', renderEventCards(bootstrap.recentEvents || []), 'Only the event signal that matters should survive into this rail.')}
        ${renderPanel('Draft Shelf', renderAskDraftCards(bootstrap.recentDrafts || []), 'Recent packages stay short and readable so you can jump back in fast.')}
        ${renderPanel('Queue Preview', renderWorkspaceQueuePreview(bootstrap.queuePreview || []), 'Manual publish steps stay visible without turning the page into an ops wall.')}
        ${renderPanel(
          'Latest Mirror Signal',
          bootstrap.latestMirror
            ? `
                <div class="stack-card">
                  <div class="stack-meta">
                    ${renderPill(bootstrap.latestMirror.rangeLabel || 'mirror', 'accent')}
                    <span>${escapeHtml(formatDateTime(bootstrap.latestMirror.createdAt))}</span>
                  </div>
                  <p>${escapeHtml(truncate(bootstrap.latestMirror.summaryText || bootstrap.latestMirror.content || '', 220))}</p>
                </div>
              `
            : renderCheckinCards((bootstrap.recentCheckins || []).slice(0, 3)),
          'Self signal is still part of the same workspace, not a separate tool.'
        )}
        ${renderPanel('Agent Lane Summary', renderAgentLaneSnapshot({ agents: bootstrap.agentLaneSummary || [] }), 'Agent coordination only shows up as support, not as a competing dashboard.')}
      </aside>
    </div>
  `;
}

async function renderPeoplePage(page, requestUrl) {
  const query = readOptionalString(requestUrl.searchParams.get('q'), '');
  const selectedPersonId = readOptionalString(requestUrl.searchParams.get('personId'), '');
  const [recentRes, searchRes, detailRes] = await Promise.all([
    fetchJsonSafe('/people?limit=8'),
    query ? fetchJsonSafe(`/people?query=${encodeURIComponent(query)}&limit=8`) : Promise.resolve(null),
    selectedPersonId
      ? fetchJsonSafe(`/people/${encodeURIComponent(selectedPersonId)}`)
      : Promise.resolve(null),
  ]);

  const recentPeople = recentRes?.ok ? recentRes.payload.people || [] : [];
  const searchPayload = searchRes?.ok ? searchRes.payload : null;
  const searchResults = searchPayload?.results || [];
  const detail = detailRes?.ok ? detailRes.payload : null;

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(recentPeople.length), 'people cards'),
        renderMetric(query ? String(searchResults.length) : '0', 'search hits'),
        renderMetric(detail?.person?.name ? '1' : '0', 'detail open'),
      ].join('')
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Search People Memory',
        `
          <form class="query-form" method="GET" action="/people">
            ${renderFormField(
              'Query',
              `<input name="q" type="text" value="${escapeHtml(query)}" placeholder="hackathon growth person, investor from last week, product designer..." />`,
              'This uses keyword/hybrid retrieval and returns evidence-backed results.'
            )}
            <div class="inline-actions">
              <button type="submit">Search</button>
              <a class="mini-link" href="/people">Reset</a>
            </div>
          </form>
          ${
            query
              ? `<div class="info-callout">retrieval: ${escapeHtml(
                  searchPayload?.retrieval?.mode || 'keyword'
                )} · provider ${escapeHtml(searchPayload?.retrieval?.effectiveProvider || 'local')}</div>`
              : ''
          }
          ${query ? renderPeopleCards(searchResults, true) : renderEmptyState('Run a search to see ranked evidence.')}
        `,
        'Ask for people by topic, context, or memory fragment.'
      )}
      ${renderPanel(
        detail?.person?.personId ? 'Person Detail' : 'Add / Update Person Card',
        detail?.person?.personId
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
              </div>
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
              ${renderPanel('Timeline', renderInteractionCards(detail.interactions || []))}
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
          : `
              <form class="api-form" data-api-form="true" data-endpoint="/people/upsert">
                ${renderFormField('Name', '<input name="name" type="text" placeholder="Annie Case" />')}
                ${renderFormField('Tags', '<input name="tags" type="text" placeholder="growth, founder, london" />', 'Comma-separated')}
                ${renderFormField('Notes', '<textarea name="notes" rows="5" placeholder="Met at..., talked about..., follow up on..."></textarea>')}
                ${renderFormField('Next Follow-up', '<input name="nextFollowUpAt" type="datetime-local" />')}
                <div class="inline-actions">
                  <button type="submit">Save Person</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
            `,
        detail?.person?.personId
          ? 'Unified person detail with identities, timeline, evidence, and next-step suggestion.'
          : 'Manual cards make the People page useful immediately.'
      )}
    </div>
    ${renderPanel('Recent People', renderPeopleCards(recentPeople))}
  `;
}

async function renderEventsPage(page) {
  const [capturesRes, eventsRes] = await Promise.all([
    fetchJsonSafe('/captures?limit=8'),
    fetchJsonSafe('/events?limit=8'),
  ]);
  const captures = capturesRes.ok ? capturesRes.payload.captures || [] : [];
  const events = eventsRes.ok ? eventsRes.payload.events || [] : [];

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
      [renderMetric(String(events.length), 'recent events'), renderMetric(String(captures.length), 'capture candidates')].join('')
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Create Event',
        `
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
        'Events are the handoff point from captures into campaigns.'
      )}
      ${renderPanel('Recent Captures', renderCaptureCards(captures.slice(0, 4)), 'Choose one as context if it helps')}
    </div>
    ${renderPanel('Recent Events', renderEventCards(events))}
  `;
}

async function renderDraftsPage(page, requestUrl) {
  const selectedEventId = readOptionalString(requestUrl.searchParams.get('eventId'), '');
  const eventsRes = await fetchJsonSafe('/events?limit=12');
  const events = eventsRes.ok ? eventsRes.payload.events || [] : [];
  const effectiveEventId = selectedEventId || events[0]?.eventId || '';
  const draftsRes = await fetchJsonSafe(`/drafts?limit=24${effectiveEventId ? `&eventId=${encodeURIComponent(effectiveEventId)}` : ''}`);
  const drafts = draftsRes.ok ? draftsRes.payload.drafts || [] : [];

  const eventOptions = events.length
    ? events
        .map(
          (event) =>
            `<option value="${escapeHtml(event.eventId)}"${
              event.eventId === effectiveEventId ? ' selected' : ''
            }>${escapeHtml(event.title)}</option>`
        )
        .join('')
    : '<option value="">No events yet</option>';

  return `
    ${renderHero(
      page,
      [renderMetric(String(events.length), 'events ready'), renderMetric(String(drafts.length), 'drafts visible')].join(''),
      `<div class="info-card"><strong>Simple draft mode</strong><p>One event, seven standard drafts. LinkedIn, X, Instagram stay in English. 中文平台 stays Chinese.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Generate 7 Standard Drafts',
        `
          <form class="api-form" data-api-form="true" data-endpoint="/drafts/generate">
            ${renderFormField('Event', `<select name="eventId">${eventOptions}</select>`)}
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
              <button type="submit">Generate 7 Drafts</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'The default path is now simple and standardized.'
      )}
      ${renderPanel(
        'Event Picker',
        events.length
          ? `<div class="stack">${events
              .map(
                (event) => `
                  <article class="stack-card">
                    <div class="stack-meta">
                      <strong>${escapeHtml(event.title)}</strong>
                      <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
                    </div>
                    <div class="inline-actions">
                      <a class="mini-link" href="/drafts?eventId=${encodeURIComponent(event.eventId)}">${escapeHtml(
                        event.eventId === effectiveEventId ? 'Viewing' : 'Show Drafts'
                      )}</a>
                    </div>
                  </article>
                `
              )
              .join('')}</div>`
          : renderEmptyState('Create an event first.'),
        'This page now shows one event at a time instead of mixing draft sets together.'
      )}
    </div>
    ${renderPanel(
      effectiveEventId
        ? `Draft Library · ${escapeHtml(events.find((event) => event.eventId === effectiveEventId)?.title || effectiveEventId)}`
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

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(queueTasks.filter((task) => task.status === 'queued').length), 'queued'),
        renderMetric(String(queueTasks.filter((task) => task.status === 'manual_step_needed').length), 'manual step'),
        renderMetric(String(queueTasks.filter((task) => task.status === 'posted').length), 'posted'),
        renderMetric(String(runtime.ops?.queue?.blocked ?? 0), 'blocked product items'),
      ].join(''),
      `<div class="info-card"><strong>Current publish mode</strong><p>${escapeHtml(
        publishMode
      )} · live still requires env + UI intent + credentials.</p></div>`
    )}
    ${renderPanel(
      'Queue Tasks',
      renderQueueCards(queueTasks, publishMode),
      'Approve in dry-run by default, or explicitly attempt live with all gates enabled.'
    )}
  `;
}

async function renderSelfMirrorPage(page) {
  const mirrorRes = await fetchJsonSafe('/self-mirror');
  const payload = mirrorRes.ok ? mirrorRes.payload : { latestMirror: null, checkins: [] };

  return `
    ${renderHero(
      page,
      [
        renderMetric(String((payload.checkins || []).length), 'check-ins'),
        renderMetric(payload.latestMirror ? '1' : '0', 'latest mirror'),
      ].join('')
    )}
    ${renderPanel(
      'Generate Mirror',
      `
        <form class="api-form" data-api-form="true" data-endpoint="/self-mirror/generate">
          ${renderFormField(
            'Range',
            `<select name="range">
              <option value="last-7d">last-7d</option>
              <option value="last-14d">last-14d</option>
              <option value="last-30d">last-30d</option>
            </select>`
          )}
          <div class="inline-actions">
            <button type="submit">Generate Mirror</button>
          </div>
          <div class="form-result" data-form-result></div>
        </form>
      `,
      'Rebuild the weekly synthesis from current check-ins, captures, and relationship evidence.'
    )}
    ${renderMirrorBlock(payload)}
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

async function renderSettingsPage(page) {
  const [runtimeRes, clusterRes, tasksRes] = await Promise.all([
    fetchJsonSafe('/settings/runtime'),
    fetchJsonSafe('/ops/cluster'),
    fetchJsonSafe('/ops/tasks?limit=8'),
  ]);
  const runtime = runtimeRes.ok ? runtimeRes.payload : {};
  const cluster = clusterRes.ok ? clusterRes.payload.foundry : runtime.foundry;
  const codex = clusterRes.ok ? clusterRes.payload.codex : runtime.codex;
  const blocked = clusterRes.ok ? clusterRes.payload.blocked || [] : [];
  const embeddings = runtime.embeddings || {};
  const tasks = tasksRes.ok ? tasksRes.payload.tasks || [] : [];
  const healthStatus = cluster?.llmTaskHealth?.status || 'unknown';

  return `
    ${renderHero(
      page,
      [
        renderMetric(runtime.publishMode || 'dry-run', 'publish mode'),
        renderMetric(embeddings.effectiveProvider || 'local', 'embeddings'),
        renderMetric(String((cluster?.agents || []).length), 'foundry lanes'),
        renderMetric(String(tasks.length), 'structured tasks'),
      ].join(''),
      `<div class="info-card"><strong>First-layer Foundry</strong><p>The cluster can now be treated as an execution surface, not just a background loop.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Runtime Controls',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
              <input type="hidden" name="command" value="RUN_DEVLOOP_ONCE" />
              <button type="submit">Run Devloop Once</button>
              <div class="form-result" data-form-result></div>
            </form>
            <div class="inline-actions stretch">
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
                <input type="hidden" name="command" value="PAUSE_DEVLOOP" />
                <button type="submit">Pause</button>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
                <input type="hidden" name="command" value="RESUME_DEVLOOP" />
                <button type="submit">Resume</button>
                <div class="form-result" data-form-result></div>
              </form>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
                <input type="hidden" name="command" value="STATUS" />
                <button type="submit">Refresh Status</button>
                <div class="form-result" data-form-result></div>
              </form>
            </div>
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/dispatch">
              <input type="hidden" name="command" value="SET_PUBLISH_MODE" />
              ${renderFormField(
                'Publish Mode',
                `<select name="mode">
                  <option value="dry-run"${runtime.publishMode === 'dry-run' ? ' selected' : ''}>dry-run</option>
                  <option value="live"${runtime.publishMode === 'live' ? ' selected' : ''}>live</option>
                </select>`,
                'Changing this only flips the runtime mode file; live still needs credentials.'
              )}
              <div class="inline-actions">
                <button type="submit">Set Publish Mode</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
          </div>
        `,
        'Operate the loop without leaving the product workspace.'
      )}
      ${renderPanel(
        'Foundry Task Intake',
        `
          <div class="control-stack">
            <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/tasks">
              <input type="hidden" name="intakeMode" value="quick" />
              ${renderFormField(
                'Quick Task',
                '<input name="taskText" type="text" placeholder="Implement live publish preflight for X" />',
                '一句话下任务，默认只允许 Foundry 在 SocialOS 仓库里执行。'
              )}
              <div class="inline-actions">
                <button type="submit">Create Quick Task</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            <details class="details-shell">
              <summary>Structured Task Intake</summary>
              <form class="api-form compact-form" data-api-form="true" data-endpoint="/ops/tasks">
                <input type="hidden" name="intakeMode" value="structured" />
                ${renderFormField(
                  'Title',
                  '<input name="title" type="text" placeholder="Upgrade generic queue visibility" />',
                  'Structured mode is for real execution, not just reminders.'
                )}
                ${renderFormField(
                  'Goal',
                  '<textarea name="goal" rows="3" placeholder="Describe the product outcome the Foundry cluster should deliver."></textarea>',
                  'Write the user-facing or operator-facing outcome.'
                )}
                ${renderFormField(
                  'Acceptance Criteria',
                  '<textarea name="acceptanceCriteria" rows="4" placeholder="One line per criterion"></textarea>',
                  'One line per criterion keeps the task verifiable.'
                )}
                ${renderFormField(
                  'Constraints',
                  '<textarea name="constraints" rows="3" placeholder="One line per constraint"></textarea>',
                  'Use this for safety, scope, brand, or rollout constraints.'
                )}
                ${renderFormField(
                  'Scope',
                  `<select name="scope">
                    <option value="socialos">socialos</option>
                    <option value="openclaw">openclaw</option>
                    <option value="multi-repo">multi-repo</option>
                  </select>`,
                  'Only explicit scope allows cross-repo execution.'
                )}
                ${renderFormField(
                  'Repo Targets',
                  '<textarea name="repoTargets" rows="3" placeholder="socialos&#10;openclaw"></textarea>',
                  'One line per repo target. Use `socialos`, `openclaw`, or an absolute path.'
                )}
                ${renderFormField(
                  'Preferred Tests',
                  '<textarea name="preferredTests" rows="3" placeholder="bash scripts/test.sh&#10;node scripts/tests/product_workspace_smoke.mjs"></textarea>',
                  'One line per verification command.'
                )}
                <div class="inline-actions">
                  <button type="submit">Create Structured Task</button>
                </div>
                <div class="form-result" data-form-result></div>
              </form>
            </details>
          </div>
        `,
        'Quick mode is the fast lane. Structured mode gives Foundry enough detail to execute directly.'
      )}
    </div>
    <div class="grid two-up">
      ${renderPanel(
        'Embeddings + Safety',
        `
          <ul class="compact-list">
            <li><strong>Requested:</strong> ${escapeHtml(embeddings.requestedProvider || 'auto')}</li>
            <li><strong>Effective:</strong> ${escapeHtml(embeddings.effectiveProvider || 'local')}</li>
            <li><strong>Retrieval:</strong> ${escapeHtml(embeddings.retrievalMode || 'hybrid-keyword')}</li>
            <li><strong>Semantic boost:</strong> ${escapeHtml(String(Boolean(embeddings.semanticBoostEnabled)))}</li>
            <li><strong>Live env enabled:</strong> ${escapeHtml(String(Boolean(runtime.liveEnvironmentEnabled)))}</li>
          </ul>
          <div class="chip-row">
            ${renderPill(`blocked items ${blocked.length}`, blocked.length ? 'warn' : 'good')}
            ${renderPill('loopback only', 'soft')}
            ${renderPill(`llm-task ${healthStatus}`, healthStatus === 'ok' || healthStatus === 'mock' ? 'good' : healthStatus === 'unknown' ? 'soft' : 'warn')}
          </div>
        `,
        'Operational truth for the current runtime.'
      )}
      ${renderPanel(
        'Recent Structured Tasks',
        renderFoundryTaskCards(tasks),
        'These are the tasks the generic Foundry executor can now pick up.'
      )}
    </div>
    ${renderPanel(
      'Foundry Execution Surface',
      renderFoundryExecutionSurface(cluster),
      'This is the control plane for generic execution, not just status wallpaper.'
    )}
    ${renderPanel('Foundry Cluster', renderClusterCards(cluster), 'Each lane has a role now visible in the product.')}
    ${renderCodexSummary(codex)}
    ${renderPanel('Blocked Surface', renderBlockedList(blocked), 'This is the remaining queue you still need to push through credentials or platform-specific decisions.')}
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
      return renderEventsPage(page);
    case 'drafts':
      return renderDraftsPage(page, requestUrl);
    case 'queue':
      return renderQueuePage(page);
    case 'self-mirror':
      return renderSelfMirrorPage(page);
    case 'dev-digest':
      return renderDevDigestPage(page);
    case 'settings':
      return renderSettingsPage(page);
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
        if (!value) {
          previewNode.hidden = true;
          previewNode.dataset.tone = '';
          previewNode.innerHTML = '';
          return;
        }

        const label = tone === 'live' ? 'Live transcript' : tone === 'ready' ? 'Transcript draft' : 'Transcript note';
        previewNode.hidden = false;
        previewNode.dataset.tone = tone;
        previewNode.innerHTML =
          '<strong>' + escapeHtml(label) + '</strong>' +
          '<p>' + escapeHtml(value) + '</p>';
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
        for (const input of document.querySelectorAll('[data-capture-asset-ids]')) {
          input.value = value;
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

      function removeCaptureAsset(assetId) {
        captureState.assets = captureState.assets.filter((asset) => asset.assetId !== assetId);
        updateCaptureAssetInputs();
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
            const preview = asset.extractedText || asset.previewText || asset.fileName || asset.assetId;
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
            ? '<div class="inline-actions"><a class="mini-link" href="' + escapeHtml(card.href) + '">Open</a></div>'
            : '') +
        '</section>';
      }

      function renderWorkspaceActionStrip(actions, payload) {
        if (!Array.isArray(actions) || !actions.length) return '';
        return '<div class="inline-actions action-strip">' +
          actions.map((action) => {
            if (action.kind === 'mutation' && action.action) {
              return '<button type="button" class="secondary-button" data-workspace-action="' + escapeHtml(action.action) + '" data-response-id="' + escapeHtml(payload.responseId) + '">' + escapeHtml(action.label || 'Open') + '</button>';
            }
            if (action.kind === 'link' && action.href) {
              return '<a class="mini-link action-link" href="' + escapeHtml(action.href) + '">' + escapeHtml(action.label || 'Open') + '</a>';
            }
            return '';
          }).filter(Boolean).join('') +
        '</div>';
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
        const secondaryCards = Array.isArray(presentation.secondaryCards) ? presentation.secondaryCards : [];
        const lanes = Array.isArray(payload.agentLanes) ? payload.agentLanes.filter((lane) => lane.status && lane.status !== 'idle') : [];
        const transcription = payload.transcription || {};

        const laneBlock = lanes.length
          ? '<div class="agent-chip-row">' +
              lanes.map((lane) =>
                '<span class="agent-chip">' +
                  '<strong>' + escapeHtml(lane.label.replace(' Agent', '')) + '</strong>' +
                  '<span>' + escapeHtml(lane.status) + '</span>' +
                '</span>'
              ).join('') +
            '</div>'
          : '';

        const transcriptionBlock = transcription.message
          ? '<div class="workspace-note">' + escapeHtml(transcription.message) + '</div>'
          : '';
        const primaryBlock = primaryCard
          ? '<section class="workspace-block"><h4>Main result</h4>' +
              renderWorkspacePresentationCard(primaryCard) +
            '</section>'
          : '';
        const reviewBlock = renderWorkspaceContactReviewForm(payload);
        const secondaryBlock = secondaryCards.length
          ? '<section class="workspace-block"><h4>Related context</h4><div class="workspace-secondary-grid">' +
              secondaryCards.map((card) => renderWorkspacePresentationCard(card, true)).join('') +
            '</div></section>'
          : '';
        const actions = renderWorkspaceActionStrip(presentation.actions || [], payload);

        return '<article class="chat-bubble system workspace-assistant">' +
          '<div class="stack-meta"><strong>SocialOS</strong><span>' + escapeHtml(presentation.mode || payload.intent || 'mixed') + '</span></div>' +
          '<p>' + escapeHtml(presentation.answer || payload.summary || '') + '</p>' +
          transcriptionBlock +
          primaryBlock +
          reviewBlock +
          secondaryBlock +
          laneBlock +
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
                '<strong>Ready</strong><p>Keep typing, talking, or attaching files in the same thread.</p>';
            }
            form.elements.text?.focus();
          } else {
            renderWorkspaceComposerResult(resultNode, response.payload?.error || 'Chat request failed.', false);
          }
        } catch (error) {
          renderWorkspaceComposerResult(resultNode, error.message || String(error), false);
        } finally {
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
                '<a class="mini-link" href="/events">Open Logbook</a>' +
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
                '<a class="mini-link" href="/people/' + encodeURIComponent(response.payload.person.personId) + '">Open Contact</a>' +
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
        event.preventDefault();
        form.requestSubmit(form.querySelector('button[type="submit"]'));
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
        --bg: #f4efe5;
        --ink: #162132;
        --ink-soft: #4e5d73;
        --panel: rgba(255, 250, 242, 0.84);
        --panel-strong: rgba(255, 247, 236, 0.94);
        --line: rgba(22, 33, 50, 0.12);
        --nav-bg: rgba(255, 251, 244, 0.88);
        --nav-ink: #162132;
        --accent: #156f6a;
        --accent-soft: #daf4f1;
        --warn: #b55d34;
        --warn-soft: #f8e3d7;
        --good: #2e7d51;
        --good-soft: #dff2e7;
        --shadow: 0 20px 70px rgba(18, 33, 49, 0.12);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        color: var(--ink);
        font-family: "Avenir Next", "IBM Plex Sans", "Noto Sans SC", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(21, 111, 106, 0.12), transparent 26%),
          radial-gradient(circle at bottom right, rgba(181, 93, 52, 0.14), transparent 28%),
          linear-gradient(180deg, #fcf8f0 0%, #f3ede2 100%);
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
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
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
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
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
      pre,
      select,
      input,
      textarea,
      button {
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
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
      .workspace-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
        gap: 20px;
        align-items: start;
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
      .workspace-thread {
        min-height: 480px;
        max-height: 72vh;
        overflow: auto;
        padding-right: 6px;
      }
      .workspace-composer-shell {
        position: sticky;
        bottom: 18px;
        z-index: 5;
        padding: 14px 16px 12px;
        border-radius: 30px;
        background: rgba(255, 250, 242, 0.96);
        border: 1px solid rgba(22, 33, 50, 0.1);
        box-shadow: 0 24px 54px rgba(18, 33, 49, 0.12);
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
      .workspace-card-details {
        margin-top: -2px;
      }
      .workspace-asset-tray {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 10px;
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
      .agent-chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .agent-chip {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(22, 33, 50, 0.07);
        color: var(--ink-soft);
        font-size: 12px;
      }
      .agent-chip strong {
        color: var(--ink);
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
      }
      .workspace-transcript-preview {
        margin-top: 10px;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(22, 33, 50, 0.08);
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink-soft);
      }
      .workspace-transcript-preview strong {
        display: block;
        margin-bottom: 6px;
        color: var(--ink);
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .workspace-transcript-preview p {
        margin: 0;
        line-height: 1.6;
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
          <p>Foundry now keeps the loop warm.</p>
          <p>Codex can work across UI, API, tests, and orchestration.</p>
        </div>
      </nav>
      <main>
        <div class="flash" data-flash hidden></div>
        ${body}
        <footer>Product workspace on loopback · capture → people → event → drafts → queue → mirror → digest</footer>
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

  let page = PAGE_BY_PATH.get(pathname);
  if (!page) {
    const peopleDetailMatch = pathname.match(/^\/people\/([^/]+)$/u);
    if (peopleDetailMatch) {
      page = PAGE_BY_PATH.get('/people');
      if (page && !requestUrl.searchParams.get('personId')) {
        requestUrl.searchParams.set('personId', decodeURIComponent(peopleDetailMatch[1]));
      }
    }
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
