import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'infra/db/schema.sql');

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
export const DEFAULT_DB_PATH = path.resolve(
  process.env.SOCIALOS_DB_PATH || path.join(REPO_ROOT, 'infra/db/socialos.db')
);

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

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
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

    insertEvent: db.prepare('INSERT INTO Event(id, title, payload, created_at) VALUES(?, ?, ?, ?)'),
    selectEventById: db.prepare('SELECT id, title FROM Event WHERE id = ? LIMIT 1'),

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
  };
}

async function routeRequest(req, res, statements) {
  const method = req.method || 'GET';
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
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

    sendJson(res, 201, { captureId, createdAt });
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

  if (method === 'POST' && pathname === '/publish/queue') {
    const body = await readJsonBody(req);
    const eventId = requireString(body.eventId, 'eventId');

    const event = statements.selectEventById.get(eventId);
    if (!event) throw new HttpError(404, 'eventId not found');

    const platform = readOptionalString(body.platform, 'x');
    const mode = normalizePublishMode(body.mode);
    const language = readOptionalString(body.language, 'en');
    const content = readOptionalString(body.content, event.title);
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

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => routeRequest(req, res, statements))
      .catch((error) => {
        const statusCode = error instanceof HttpError ? error.statusCode : 500;
        const message = error instanceof HttpError ? error.message : 'internal server error';
        if (statusCode === 500) {
          console.error('[socialos-api] uncaught error:', error);
        }
        sendJson(res, statusCode, { error: message });
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
  POST /capture         -> writes Audit row
  POST /events          -> writes Event row
  POST /publish/queue   -> writes PostDraft + PublishTask rows
  POST /publish/approve -> executes publisher workflow + writes Audit + DevDigest
  GET  /health

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
