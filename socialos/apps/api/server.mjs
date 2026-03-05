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
    insertAudit: db.prepare(
      'INSERT INTO Audit(id, action, payload, created_at) VALUES(?, ?, ?, ?)'
    ),
    selectAuditById: db.prepare('SELECT id FROM Audit WHERE id = ? LIMIT 1'),

    insertEvent: db.prepare(
      'INSERT INTO Event(id, title, payload, created_at) VALUES(?, ?, ?, ?)'
    ),
    selectEventById: db.prepare('SELECT id, title FROM Event WHERE id = ? LIMIT 1'),

    insertDraft: db.prepare(
      'INSERT INTO PostDraft(id, event_id, platform, language, content, metadata, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)'
    ),

    insertQueueTask: db.prepare(
      'INSERT INTO PublishTask(id, draft_id, platform, mode, status, result, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
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
      typeof body.captureId === 'string' && body.captureId.trim()
        ? body.captureId.trim()
        : null;

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
    const mode = readOptionalString(body.mode, 'dry-run');
    const language = readOptionalString(body.language, 'en');
    const content = readOptionalString(body.content, event.title);

    const createdAt = nowIso();
    const draftId = makeId('draft');
    statements.insertDraft.run(
      draftId,
      eventId,
      platform,
      language,
      content,
      JSON.stringify({ source: 'api.publish_queue' }),
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
  POST /capture        -> writes Audit row
  POST /events         -> writes Event row
  POST /publish/queue  -> writes PostDraft + PublishTask rows
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
