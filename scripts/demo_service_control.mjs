import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONTROL_DIR = path.join(REPO_ROOT, '.demo');
const API_PORT = Number(process.env.SOCIALOS_API_PORT || 8787);
const WEB_PORT = Number(process.env.SOCIALOS_WEB_PORT || 4173);
const API_URL = `http://127.0.0.1:${API_PORT}/health`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}/quick-capture`;

const SERVICES = [
  {
    id: 'api',
    label: 'socialos-api',
    entry: path.join(REPO_ROOT, 'socialos/apps/api/server.mjs'),
    port: API_PORT,
    healthUrl: API_URL,
    pidFile: path.join(CONTROL_DIR, 'api.pid'),
    logFile: path.join(CONTROL_DIR, 'api.log'),
  },
  {
    id: 'web',
    label: 'socialos-web',
    entry: path.join(REPO_ROOT, 'socialos/apps/web/server.mjs'),
    port: WEB_PORT,
    healthUrl: WEB_URL,
    pidFile: path.join(CONTROL_DIR, 'web.pid'),
    logFile: path.join(CONTROL_DIR, 'web.log'),
  },
];

function ensureControlDir() {
  fs.mkdirSync(CONTROL_DIR, { recursive: true });
}

function readPid(pidFile) {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePid(pidFile, pid) {
  fs.writeFileSync(pidFile, `${pid}\n`, 'utf8');
}

function clearPid(pidFile) {
  try {
    fs.rmSync(pidFile, { force: true });
  } catch {}
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function checkHealth(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(url, retries = 30, delayMs = 300) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await checkHealth(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function serviceStatus(service) {
  const pid = readPid(service.pidFile);
  const pidAlive = isPidAlive(pid);
  const healthy = await checkHealth(service.healthUrl);
  return {
    ...service,
    pid,
    pidAlive,
    healthy,
  };
}

async function startService(service) {
  const current = await serviceStatus(service);
  if (current.healthy) {
    console.log(`${service.label} already healthy on :${service.port}`);
    return current;
  }

  ensureControlDir();
  const logFd = fs.openSync(service.logFile, 'a');
  const child = spawn(process.execPath, [service.entry, '--port', String(service.port)], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  fs.closeSync(logFd);
  child.unref();
  writePid(service.pidFile, child.pid);

  const ready = await waitForHealth(service.healthUrl);
  const status = await serviceStatus(service);
  if (!ready) {
    throw new Error(`${service.label} failed to become healthy (log: ${service.logFile})`);
  }
  return status;
}

async function stopService(service) {
  const pid = readPid(service.pidFile);
  if (pid && isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!isPidAlive(pid)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
  clearPid(service.pidFile);
}

async function commandStart() {
  const statuses = [];
  for (const service of SERVICES) {
    const status = await startService(service);
    statuses.push(status);
  }
  for (const status of statuses) {
    console.log(`${status.label}: healthy=${status.healthy} pid=${status.pid ?? 'unknown'} port=${status.port}`);
  }
}

async function commandStop() {
  for (const service of SERVICES) {
    await stopService(service);
    console.log(`${service.label}: stopped`);
  }
}

async function commandStatus() {
  for (const service of SERVICES) {
    const status = await serviceStatus(service);
    console.log(
      `${status.label}: healthy=${status.healthy} pid=${status.pid ?? 'none'} alive=${status.pidAlive} health=${status.healthUrl}`
    );
  }
}

const command = process.argv[2] || 'status';

if (command === 'start') {
  await commandStart();
} else if (command === 'stop') {
  await commandStop();
} else if (command === 'status') {
  await commandStatus();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
