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
    id: 'quick-capture',
    title: 'Quick Capture',
    path: '/quick-capture',
    summary: 'Capture notes, turn them into structured memory, and seed the rest of the loop.',
  },
  {
    id: 'people',
    title: 'People',
    path: '/people',
    summary: 'Search people memory, review evidence, and add follow-up cards that the system can reuse.',
  },
  {
    id: 'events',
    title: 'Events',
    path: '/events',
    summary: 'Create campaign events from captures and keep the pipeline moving into draft generation.',
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
    title: 'Self Mirror',
    path: '/self-mirror',
    summary: 'Review recent check-ins and regenerate the weekly mirror when you want a fresh synthesis.',
  },
  {
    id: 'dev-digest',
    title: 'Dev Digest',
    path: '/dev-digest',
    summary: 'Track run reports, blocked items, and what the devloop is doing instead of idle spinning.',
  },
  {
    id: 'settings',
    title: 'Settings',
    path: '/settings',
    summary: 'Operate Foundry, inspect the first-layer cluster, and see exactly where Codex can help.',
  },
];

export const DASHBOARD_PAGES = PAGE_DEFINITIONS.map((page) => ({ ...page }));

const PAGE_BY_PATH = new Map(DASHBOARD_PAGES.map((page) => [page.path, page]));

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
        <strong>How to demo this</strong>
        <p>Type one real moment, or tap voice and say it like a WeChat note. We parse first, then you confirm before anything is saved.</p>
      </div>
      <div class="chat-bubble user ghost">
        <p>今天认识了一个做增长的人，下周二要跟进。</p>
      </div>
    </div>
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
      return `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(person.name)}</strong>
            <span>${escapeHtml(formatDateTime(person.updatedAt || person.createdAt))}</span>
          </div>
          ${score ? `<p class="score">score ${escapeHtml(score)}</p>` : ''}
          <p>${escapeHtml(truncate(person.evidenceSnippet || person.notes || '', 180) || 'No notes yet.')}</p>
          <div class="chip-row">
            ${(tags.length ? tags : ['no-tags']).map((tag) => renderPill(tag, 'soft')).join('')}
          </div>
          <div class="inline-actions">
            <a class="mini-link" href="/people?personId=${encodeURIComponent(person.personId)}">Open Detail</a>
            <code>${escapeHtml(person.personId)}</code>
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
      const detailPreview = truncate(
        Object.entries(payload.details || payload)
          .slice(0, 4)
          .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
          .join(' | '),
        180
      );
      return `
        <article class="stack-card">
          <div class="stack-meta">
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
          </div>
          <p>${escapeHtml(detailPreview || 'No structured payload yet.')}</p>
          <div class="inline-actions">
            <a class="mini-link" href="/drafts?eventId=${encodeURIComponent(event.eventId)}">Open in Drafts</a>
            <code>${escapeHtml(event.eventId)}</code>
          </div>
        </article>
      `;
    })
    .join('')}</div>`;
}

function renderPackageHighlights(publishPackage) {
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

function renderDraftCards(drafts) {
  if (!drafts.length) return renderEmptyState('No drafts generated yet.');
  return `<div class="draft-grid">${drafts
    .map((draft) => {
      const capability = safeJson(draft.capability, {});
      const publishPackage = safeJson(draft.publishPackage, {});
      const validation = safeJson(draft.validation, {});
      const steps = Array.isArray(publishPackage.steps) ? publishPackage.steps : [];
      return `
        <article class="draft-card">
          <div class="draft-head">
            <div>
              <p class="card-kicker">${escapeHtml(draft.eventTitle || draft.eventId || 'untitled event')}</p>
              <h3>${escapeHtml(draft.platformLabel)} · ${escapeHtml(draft.language)}</h3>
            </div>
            <div class="chip-row">
              ${renderPill(capability.supportLevel || 'L0 Draft', capability.liveEligible ? 'accent' : 'soft')}
              ${renderPill(draft.platform, 'neutral')}
            </div>
          </div>
          <pre>${escapeHtml(draft.content)}</pre>
          <div class="package-meta">
            <p><strong>Entry:</strong> ${escapeHtml(publishPackage.entryTarget || capability.entryTarget || 'manual')}</p>
            <p><strong>Blocked By:</strong> ${escapeHtml(publishPackage.blockedBy || capability.blockedBy || 'n/a')}</p>
          </div>
          ${
            validation && Object.keys(validation).length
              ? `<div class="result-block">
                  <p><strong>Validation:</strong> ${escapeHtml(validation.ok ? 'pass' : 'needs review')}</p>
                  <small>${escapeHtml(
                    (validation.issues || []).map((issue) => issue.message).join(' | ') || 'No issues'
                  )}</small>
                </div>`
              : ''
          }
          ${
            steps.length
              ? `<ol class="step-list">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
              : ''
          }
          ${renderPackageHighlights(publishPackage)}
          <form class="api-form compact-form" data-api-form="true" data-method="PATCH" data-endpoint="/drafts/${encodeURIComponent(
            draft.draftId
          )}">
            ${renderFormField(
              'Edit Draft',
              `<textarea name="content" rows="8">${escapeHtml(draft.content)}</textarea>`,
              'P1 uses plain text editing with live preview via the card itself.'
            )}
            ${renderFormField(
              'Variants',
              `<textarea name="variants" rows="3">${escapeHtml((draft.variants || []).join('\n'))}</textarea>`,
              'One line per variant note.'
            )}
            <div class="inline-actions">
              <button type="submit">Save Edit</button>
              <code>${escapeHtml(draft.draftId)}</code>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
          <form class="api-form compact-form" data-api-form="true" data-endpoint="/drafts/${encodeURIComponent(
            draft.draftId
          )}/validate">
            <div class="inline-actions">
              <button type="submit">Run Validation</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
          <form class="api-form compact-form" data-api-form="true" data-endpoint="/publish/queue">
            <input type="hidden" name="draftId" value="${escapeHtml(draft.draftId)}" />
            <input type="hidden" name="mode" value="dry-run" />
            <div class="inline-actions">
              <button type="submit">Queue Draft</button>
              <code>${escapeHtml(draft.draftId)}</code>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
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
          </div>
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

async function renderQuickCapturePage(page) {
  const [capturesRes, mirrorRes, assetsRes] = await Promise.all([
    fetchJsonSafe('/captures?limit=8'),
    fetchJsonSafe('/self-mirror'),
    fetchJsonSafe('/capture/assets?limit=8'),
  ]);
  const captures = capturesRes.ok ? capturesRes.payload.captures || [] : [];
  const checkins = mirrorRes.ok ? mirrorRes.payload.checkins || [] : [];
  const assets = assetsRes.ok ? assetsRes.payload.assets || [] : [];

  return `
    ${renderHero(
      page,
      [
        renderMetric(String(captures.length), 'recent captures'),
        renderMetric(String(checkins.length), 'recent check-ins'),
        renderMetric(String(assets.length), 'capture assets'),
      ].join('')
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Capture Parse Workspace',
        `
          <form class="capture-form" data-capture-parse="true">
            ${renderFormField(
              'What happened?',
              '<textarea name="text" rows="8" placeholder="Met someone interesting, shipped something, felt stretched, noticed a pattern..."></textarea>',
              'Step 1 parses a Person Card + Self Check-in draft before anything is committed.'
            )}
            ${renderFormField(
              'Source',
              '<input name="source" type="text" value="dashboard" />'
            )}
            ${renderFormField(
              'Asset IDs',
              '<input name="assetIds" type="text" placeholder="asset_xxx, asset_yyy" data-capture-asset-ids />',
              'Upload audio/business-card assets below and we will fill this automatically.'
            )}
            <div class="inline-actions">
              <button type="submit">Parse Capture</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'This is the new two-stage quick capture flow.'
      )}
      ${renderPanel(
        'Multimodal Intake',
        `
          <div class="control-stack">
            <form class="asset-upload-form" data-asset-upload="image">
              ${renderFormField(
                'Business Card / Image',
                '<input name="file" type="file" accept="image/*" />',
                'Images run through local OCR first; if OCR misses, you can still edit before commit.'
              )}
              <div class="inline-actions">
                <button type="submit">Upload + OCR</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            <form class="asset-upload-form" data-asset-upload="audio">
              ${renderFormField(
                'Audio Note',
                '<input name="file" type="file" accept="audio/*" />',
                'Attach an audio memo. Add transcript manually if browser speech support is unavailable.'
              )}
              ${renderFormField(
                'Transcript',
                '<textarea name="transcript" rows="3" placeholder="Paste or dictate transcript here if needed."></textarea>',
                'P1 defaults to local/browser-first transcription with manual fallback.'
              )}
              <div class="inline-actions">
                <button type="submit">Upload Audio</button>
                <button type="button" data-audio-record-start>Start Record</button>
                <button type="button" data-audio-record-stop disabled>Stop</button>
              </div>
              <div class="form-result" data-form-result></div>
            </form>
            <div class="info-card" data-audio-status>
              <strong>Browser audio tools</strong>
              <p>MediaRecorder and browser speech recognition are optional. If unsupported, upload a file and edit the transcript manually.</p>
            </div>
          </div>
        `,
        'Voice notes and business cards both route back into capture parse → commit.'
      )}
    </div>
    <section class="panel" data-capture-commit-panel hidden>
      <div class="panel-head">
        <div>
          <h2>Commit Structured Capture</h2>
          <p class="panel-subtitle">Step 2 is fully editable before it writes to Person / Identity / Interaction / SelfCheckin / Audit.</p>
        </div>
      </div>
      <form class="capture-commit-form" data-capture-commit="true">
        <input type="hidden" name="text" value="" />
        <input type="hidden" name="source" value="dashboard" />
        <input type="hidden" name="assetIds" value="" />
        <input type="hidden" name="combinedText" value="" />
        <div class="grid two-up">
          <div>
            ${renderFormField('Person Name', '<input name="personName" type="text" />')}
            ${renderFormField('Tags', '<input name="personTags" type="text" />', 'Comma-separated')}
            ${renderFormField('Next Follow-up', '<input name="nextFollowUpAt" type="datetime-local" />')}
            ${renderFormField('Notes', '<textarea name="personNotes" rows="6"></textarea>')}
            ${renderFormField(
              'Identities',
              '<textarea name="identities" rows="5" placeholder="platform|handle|url|note"></textarea>',
              'One line per identity: platform|handle|url|note'
            )}
          </div>
          <div>
            ${renderFormField('Energy', '<input name="energy" type="number" min="-2" max="2" step="1" />')}
            ${renderFormField('Emotions', '<input name="emotions" type="text" />', 'Comma-separated')}
            ${renderFormField('Reflection', '<textarea name="reflection" rows="5"></textarea>')}
            ${renderFormField('Interaction Summary', '<textarea name="interactionSummary" rows="4"></textarea>')}
            ${renderFormField('Interaction Evidence', '<textarea name="interactionEvidence" rows="4"></textarea>')}
          </div>
        </div>
        <div class="inline-actions">
          <button type="submit">Commit Capture</button>
        </div>
        <div class="form-result" data-form-result></div>
      </form>
    </section>
    <div class="grid two-up">
      ${renderPanel('Recent Capture Assets', renderCaptureAssetCards(assets))}
      ${renderPanel('Fresh Energy Signal', renderCheckinCards(checkins.slice(0, 4)), 'Latest mirror inputs')}
    </div>
    ${renderPanel('Recent Captures', renderCaptureCards(captures))}
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
  const [eventsRes, draftsRes] = await Promise.all([
    fetchJsonSafe('/events?limit=12'),
    fetchJsonSafe(`/drafts?limit=24${selectedEventId ? `&eventId=${encodeURIComponent(selectedEventId)}` : ''}`),
  ]);
  const events = eventsRes.ok ? eventsRes.payload.events || [] : [];
  const drafts = draftsRes.ok ? draftsRes.payload.drafts || [] : [];

  const eventOptions = events.length
    ? events
        .map(
          (event) =>
            `<option value="${escapeHtml(event.eventId)}"${
              event.eventId === selectedEventId ? ' selected' : ''
            }>${escapeHtml(event.title)}</option>`
        )
        .join('')
    : '<option value="">No events yet</option>';

  return `
    ${renderHero(
      page,
      [renderMetric(String(events.length), 'events ready'), renderMetric(String(drafts.length), 'drafts visible')].join(''),
      `<div class="info-card"><strong>Unlock path</strong><p>These publish packages are the L1/L1.5 implementation path for blocked channels before credentials are ready.</p></div>`
    )}
    <div class="grid two-up">
      ${renderPanel(
        'Generate Publish Packages',
        `
          <form class="api-form" data-api-form="true" data-endpoint="/drafts/generate">
            ${renderFormField('Event', `<select name="eventId">${eventOptions}</select>`)}
            ${renderFormField(
              'Languages',
              `<select name="languages">
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="bilingual">Bilingual</option>
              </select>`
            )}
            ${renderFormField('Angle', '<input name="angle" type="text" value="operator update" />')}
            ${renderFormField('Tone', '<input name="tone" type="text" value="clear" />')}
            ${renderFormField('Audience', '<input name="audience" type="text" value="builders, collaborators, future users" />')}
            ${renderFormField('CTA', '<input name="cta" type="text" placeholder="Reply if you want to compare notes." />')}
            <fieldset class="field">
              <span>Platforms</span>
              <div class="check-grid">
                <label><input type="checkbox" name="platforms" value="instagram" checked /> Instagram</label>
                <label><input type="checkbox" name="platforms" value="x" checked /> X</label>
                <label><input type="checkbox" name="platforms" value="linkedin" checked /> LinkedIn</label>
                <label><input type="checkbox" name="platforms" value="zhihu" checked /> Zhihu</label>
                <label><input type="checkbox" name="platforms" value="xiaohongshu" checked /> Xiaohongshu</label>
                <label><input type="checkbox" name="platforms" value="wechat_moments" checked /> WeChat Moments</label>
                <label><input type="checkbox" name="platforms" value="wechat_official" checked /> WeChat Official</label>
              </div>
            </fieldset>
            <div class="inline-actions">
              <button type="submit">Generate Drafts</button>
            </div>
            <div class="form-result" data-form-result></div>
          </form>
        `,
        'This is now the real 7-platform workbench instead of a placeholder.'
      )}
      ${renderPanel(
        'Event Feed',
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
                      <a class="mini-link" href="/drafts?eventId=${encodeURIComponent(event.eventId)}">Filter drafts</a>
                      <code>${escapeHtml(event.eventId)}</code>
                    </div>
                  </article>
                `
              )
              .join('')}</div>`
          : renderEmptyState('Create an event first.'),
        'Pick an event and generate package variants.'
      )}
    </div>
    ${renderPanel(
      selectedEventId ? `Draft Library for ${selectedEventId}` : 'Draft Library',
      renderDraftCards(drafts),
      'Each card shows support level, publishing entrypoint, and queue action.'
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
    case 'quick-capture':
      return renderQuickCapturePage(page);
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
        recorder: null,
        recordChunks: [],
        recognition: null,
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

      function renderResult(resultNode, payload) {
        if (!resultNode) return;
        resultNode.innerHTML = '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
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
      }

      function appendCaptureAsset(asset) {
        if (!asset || !asset.assetId) return;
        if (!captureState.assets.some((entry) => entry.assetId === asset.assetId)) {
          captureState.assets.push(asset);
        }
        updateCaptureAssetInputs();
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

      document.addEventListener('click', async (event) => {
        const startButton = event.target.closest('[data-audio-record-start]');
        const stopButton = event.target.closest('[data-audio-record-stop]');

        if (startButton) {
          const form = startButton.closest('form');
          const statusNode = document.querySelector('[data-audio-status]');
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            statusNode.innerHTML = '<strong>Browser audio tools</strong><p>MediaRecorder is unavailable in this browser. Upload an audio file instead.</p>';
            return;
          }

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          captureState.recordChunks = [];
          captureState.recorder = new MediaRecorder(stream);
          captureState.recorder.ondataavailable = (recordEvent) => {
            if (recordEvent.data.size > 0) captureState.recordChunks.push(recordEvent.data);
          };
          captureState.recorder.start();
          startButton.disabled = true;
          if (stopButton) stopButton.disabled = false;

          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const transcriptField = form?.querySelector('textarea[name="transcript"]');
          if (SpeechRecognition && transcriptField) {
            captureState.recognition = new SpeechRecognition();
            captureState.recognition.continuous = true;
            captureState.recognition.interimResults = true;
            captureState.recognition.onresult = (speechEvent) => {
              const transcript = Array.from(speechEvent.results)
                .map((result) => result[0]?.transcript || '')
                .join(' ')
                .trim();
              transcriptField.value = transcript;
            };
            captureState.recognition.start();
          }

          statusNode.innerHTML = '<strong>Recording</strong><p>Audio capture is running. Stop when the note is complete.</p>';
          return;
        }

        if (stopButton) {
          const form = stopButton.closest('form');
          const statusNode = document.querySelector('[data-audio-status]');
          const startButton = form?.querySelector('[data-audio-record-start]');
          if (!captureState.recorder) return;

          stopButton.disabled = true;
          captureState.recorder.onstop = async () => {
            const blob = new Blob(captureState.recordChunks, { type: 'audio/webm' });
            const file = new File([blob], 'recorded-note.webm', { type: 'audio/webm' });
            statusNode.innerHTML = '<strong>Recorded</strong><p>Uploading the recorded note into capture assets.</p>';
            await handleAssetUpload(form, form.querySelector('button[type="submit"]'), file);
            if (startButton) startButton.disabled = false;
            statusNode.innerHTML = '<strong>Audio ready</strong><p>The recorded note has been added to capture assets. You can now parse the capture.</p>';
          };

          captureState.recorder.stop();
          captureState.recorder.stream.getTracks().forEach((track) => track.stop());
          if (captureState.recognition) {
            captureState.recognition.stop();
            captureState.recognition = null;
          }
          captureState.recorder = null;
        }
      });

      consumeFlash();
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
        --nav-bg: rgba(16, 26, 44, 0.9);
        --nav-ink: #eef5ff;
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
        background:
          linear-gradient(180deg, rgba(13, 24, 39, 0.98), rgba(18, 34, 56, 0.92));
        border-right: 1px solid rgba(255, 255, 255, 0.08);
      }
      .brand {
        margin: 0 0 18px;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.7;
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
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.08);
      }
      .nav-link.active {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.18);
      }
      .nav-footer {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 13px;
        line-height: 1.5;
        opacity: 0.78;
      }
      main {
        padding: 32px;
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
      }
      .score {
        color: var(--accent);
        font-weight: 600;
      }
      .draft-grid,
      .cluster-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .draft-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 12px;
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
          position: static;
        }
        .hero,
        .two-up,
        .three-up,
        .draft-grid,
        .cluster-grid,
        .compact-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav>
        <p class="brand">Local-first social operating system</p>
        <h2 class="brand-title">SocialOS</h2>
        ${renderNavigation(currentPath)}
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

  const page = PAGE_BY_PATH.get(pathname);
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
  /quick-capture
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
