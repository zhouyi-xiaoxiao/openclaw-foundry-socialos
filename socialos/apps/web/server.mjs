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
    summary: 'Capture quick notes and seed person + self memory extraction.',
  },
  {
    id: 'people',
    title: 'People',
    path: '/people',
    summary: 'Browse person cards, identity links, and follow-up signals.',
  },
  {
    id: 'events',
    title: 'Events',
    path: '/events',
    summary: 'Create campaign events and inspect timeline context.',
  },
  {
    id: 'drafts',
    title: 'Drafts',
    path: '/drafts',
    summary: 'Preview generated cross-platform post drafts before queueing.',
  },
  {
    id: 'queue',
    title: 'Queue',
    path: '/queue',
    summary: 'Review publish tasks with dry-run/live status and audit hooks.',
  },
  {
    id: 'self-mirror',
    title: 'Self Mirror',
    path: '/self-mirror',
    summary: 'Inspect self-checkins and weekly mirror insight cards.',
  },
  {
    id: 'dev-digest',
    title: 'Dev Digest',
    path: '/dev-digest',
    summary: 'Read recent devloop run summaries, risks, and next steps.',
  },
  {
    id: 'settings',
    title: 'Settings',
    path: '/settings',
    summary: 'Configure runtime switches including embeddings mode and fallback behavior.',
  },
];

export const DASHBOARD_PAGES = PAGE_DEFINITIONS.map((page) => ({ ...page }));

const PAGE_HINTS = {
  'quick-capture': [
    'Capture input box placeholder',
    'Person card extraction preview slot',
    'Self check-in extraction preview slot',
  ],
  people: [
    'People search placeholder (keyword / hybrid)',
    'Timeline + identity evidence cards',
    'Next follow-up recommendation area',
  ],
  events: [
    'Event list and detail split-view placeholder',
    'Campaign planning metadata slot',
    'Draft generation trigger placeholder',
  ],
  drafts: [
    'Draft table placeholder (platform / language / status)',
    'Draft preview/editor slot',
    'Copy + queue action bar placeholder',
  ],
  queue: [
    'Queued publish task list placeholder',
    'Mode/status filters (dry-run/live)',
    'Audit result panel placeholder',
  ],
  'self-mirror': [
    'Weekly mirror summary card placeholder',
    'Energy/emotion trend placeholder',
    'Actionable next-experiment panel placeholder',
  ],
  'dev-digest': [
    'Digest feed placeholder',
    'What/Why/Risk/Verify/Next card layout placeholder',
    'Latest run metadata panel placeholder',
  ],
  settings: [
    'Embeddings provider selector placeholder (auto/openai/local)',
    'Fallback behavior hint: no key => keyword/hybrid remains available',
    'Bench script entrypoint placeholder (`./scripts/bench_embeddings.sh`)',
  ],
};

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

function renderNavigation(currentPath) {
  return DASHBOARD_PAGES.map((page) => {
    const active = currentPath === page.path ? 'nav-link active' : 'nav-link';
    return `<a class="${active}" href="${page.path}">${escapeHtml(page.title)}</a>`;
  }).join('');
}

async function fetchJsonSafe(pathname) {
  try {
    const response = await fetch(`${DEFAULT_API_BASE_URL}${pathname}`);
    const payload = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        error: `${pathname} failed (${response.status})`,
        payload,
      };
    }
    return {
      ok: true,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      error: `${pathname} unavailable: ${error instanceof Error ? error.message : String(error)}`,
      payload: null,
    };
  }
}

function formatDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'n/a';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function renderStatusRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

async function renderDevDigestBody(page) {
  const [statusRes, runsRes, blockedRes, digestRes] = await Promise.all([
    fetchJsonSafe('/ops/status'),
    fetchJsonSafe('/ops/runs?limit=8'),
    fetchJsonSafe('/ops/blocked'),
    fetchJsonSafe('/dev-digest?limit=8'),
  ]);

  if (!statusRes.ok) {
    return `
      <header>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.summary)}</p>
      </header>
      <section>
        <h2>Runtime Health</h2>
        <p>Unable to read ops status from ${escapeHtml(DEFAULT_API_BASE_URL)}.</p>
        <p><code>${escapeHtml(statusRes.error || 'unknown error')}</code></p>
      </section>
    `;
  }

  const status = statusRes.payload || {};
  const blockedTasks = blockedRes.ok ? blockedRes.payload?.blockedTasks || [] : [];
  const runs = runsRes.ok ? runsRes.payload?.runs || [] : [];
  const digests = digestRes.ok ? digestRes.payload?.digests || [] : [];
  const latestRun = status.latestRun || runs[0] || null;

  const blockedListHtml = blockedTasks.length
    ? `<ul>${blockedTasks
        .slice(0, 8)
        .map(
          (item) =>
            `<li>line ${escapeHtml(String(item.line))}: ${escapeHtml(readOptionalString(item.task, 'blocked'))}</li>`
        )
        .join('')}</ul>`
    : '<p>No blocked tasks.</p>';

  const runListHtml = runs.length
    ? `<ul>${runs
        .slice(0, 8)
        .map((run) => {
          const runId = readOptionalString(run.runId, 'unknown');
          const taskId = readOptionalString(run.taskId, 'n/a');
          const runStatus = readOptionalString(run.status, 'unknown');
          const duration = formatDuration(run.durationMs);
          const summary = readOptionalString(run.summary, 'n/a');
          return `<li><code>${escapeHtml(runId)}</code> · ${escapeHtml(taskId)} · ${escapeHtml(
            runStatus
          )} · ${escapeHtml(duration)}<br/><small>${escapeHtml(summary)}</small></li>`;
        })
        .join('')}</ul>`
    : '<p>No run history found yet.</p>';

  const digestListHtml = digests.length
    ? `<ul>${digests
        .slice(0, 6)
        .map((item) => {
          const what = readOptionalString(item.what, 'n/a');
          const risk = readOptionalString(item.risk, 'n/a');
          const verify = readOptionalString(item.verify, 'n/a');
          return `<li><strong>${escapeHtml(what)}</strong><br/><small>risk=${escapeHtml(
            risk
          )} · verify=${escapeHtml(verify)}</small></li>`;
        })
        .join('')}</ul>`
    : '<p>No digest records in DB yet.</p>';

  const statusRows = [
    renderStatusRow('Mode', readOptionalString(status.mode, 'unknown')),
    renderStatusRow('Publish Mode', readOptionalString(status.publishMode, 'dry-run')),
    renderStatusRow('Queue Pending', String(status.queue?.pending ?? 0)),
    renderStatusRow('Queue In Progress', String(status.queue?.inProgress ?? 0)),
    renderStatusRow('Queue Blocked', String(status.queue?.blocked ?? 0)),
    renderStatusRow('Queue Done', String(status.queue?.done ?? 0)),
    renderStatusRow('Current Task', readOptionalString(status.queue?.currentTask, 'none')),
    renderStatusRow('Lock Present', String(Boolean(status.lock?.present))),
    renderStatusRow('Lock Owner PID', readOptionalString(String(status.lock?.ownerPid ?? ''), 'n/a')),
    renderStatusRow('Lock Heartbeat Age', readOptionalString(String(status.lock?.heartbeatAgeSec ?? ''), 'n/a')),
    renderStatusRow(
      'Consecutive Failures',
      String(status.health?.consecutiveFailures ?? 0)
    ),
    renderStatusRow(
      'Latest Run Duration',
      formatDuration(status.health?.latestRunDurationMs)
    ),
  ].join('');

  return `
    <header>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.summary)}</p>
      <p>API base: <code>${escapeHtml(DEFAULT_API_BASE_URL)}</code></p>
    </header>
    <section>
      <h2>Runtime Health</h2>
      <table>
        <tbody>${statusRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Latest Run</h2>
      ${
        latestRun
          ? `<p><code>${escapeHtml(readOptionalString(latestRun.runId, 'unknown'))}</code> · ${escapeHtml(
              readOptionalString(latestRun.status, 'unknown')
            )} · ${escapeHtml(formatDuration(latestRun.durationMs))}</p>
             <p>${escapeHtml(readOptionalString(latestRun.summary, 'n/a'))}</p>`
          : '<p>No run yet.</p>'
      }
    </section>
    <section>
      <h2>Blocked Tasks</h2>
      ${blockedListHtml}
    </section>
    <section>
      <h2>Recent Runs</h2>
      ${runListHtml}
    </section>
    <section>
      <h2>Dev Digest (DB)</h2>
      ${digestListHtml}
    </section>
    <section>
      <h2>Digest Snapshot</h2>
      <pre>${escapeHtml(readOptionalString(status.latestDigest, '(empty)'))}</pre>
    </section>
  `;
}

async function renderPageBody(page) {
  if (page.id === 'dev-digest') {
    return renderDevDigestBody(page);
  }

  const hints = PAGE_HINTS[page.id] ?? ['Placeholder panel'];
  const hintItems = hints.map((hint) => `<li>${escapeHtml(hint)}</li>`).join('');

  return `
    <header>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.summary)}</p>
    </header>
    <section>
      <h2>Dashboard v0 skeleton</h2>
      <ul>${hintItems}</ul>
    </section>
  `;
}

function renderLayout({ currentPath, title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · SocialOS Dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: #0b1020;
        color: #e8ebf5;
      }
      .app {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(210px, 250px) 1fr;
      }
      nav {
        border-right: 1px solid #1f2942;
        padding: 20px 14px;
        background: #0f1730;
      }
      .brand {
        font-size: 14px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #aab5d2;
        margin: 0 0 14px;
      }
      .nav-link {
        display: block;
        color: #d2d9ec;
        text-decoration: none;
        border-radius: 10px;
        padding: 9px 10px;
        margin-bottom: 4px;
        border: 1px solid transparent;
      }
      .nav-link:hover {
        border-color: #2d3b63;
        background: #182447;
      }
      .nav-link.active {
        border-color: #5d7fd6;
        background: #1d2d5b;
        color: #ffffff;
      }
      main {
        padding: 28px;
      }
      h1 {
        margin: 0 0 8px;
      }
      h2 {
        margin-top: 28px;
        font-size: 1rem;
        color: #c9d4f2;
      }
      p {
        margin-top: 0;
        color: #c4ccea;
        max-width: 66ch;
      }
      section {
        border: 1px solid #28355d;
        border-radius: 14px;
        padding: 16px 18px;
        background: #101a37;
      }
      li {
        margin-bottom: 8px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: left;
        padding: 7px 8px;
        border-bottom: 1px solid #25365f;
        vertical-align: top;
      }
      th {
        color: #b7c5ea;
        font-weight: 600;
        width: 220px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #0b1430;
        border: 1px solid #263864;
        border-radius: 10px;
        padding: 12px;
      }
      small {
        color: #9caad3;
      }
      footer {
        margin-top: 28px;
        font-size: 12px;
        color: #95a3cd;
      }
      @media (max-width: 820px) {
        .app {
          grid-template-columns: 1fr;
        }
        nav {
          border-right: 0;
          border-bottom: 1px solid #1f2942;
          position: sticky;
          top: 0;
          z-index: 2;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <nav>
        <p class="brand">SocialOS</p>
        ${renderNavigation(currentPath)}
      </nav>
      <main>
        ${body}
        <footer>Dashboard v0 skeleton · loopback local UI</footer>
      </main>
    </div>
  </body>
</html>`;
}

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

async function routeRequest(req, res) {
  const method = req.method || 'GET';
  const rawPath = new URL(req.url || '/', 'http://localhost').pathname;
  const pathname = normalizePath(rawPath);

  if (method !== 'GET') {
    sendHtml(res, 405, renderLayout({
      currentPath: '',
      title: 'Method Not Allowed',
      body: '<h1>Method Not Allowed</h1><p>This dashboard skeleton only serves GET routes.</p>',
    }), {
      allow: 'GET',
    });
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
    const body = await renderPageBody(page);
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
  console.log(`SocialOS dashboard skeleton server (loopback-only)

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
