import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

try {
  const apiSource = read('socialos/apps/api/server.mjs');
  const cronSource = read('scripts/03_setup_cron.sh');
  const runtimeSource = read('socialos/openclaw/runtime.openclaw.json5');

  assert(apiSource.includes("const LOOPBACK_HOST = '127.0.0.1';"), 'API must stay loopback-only');
  assert(!apiSource.includes("access-control-allow-origin', '*'"), 'API must not emit wildcard CORS');
  assert(cronSource.includes('--no-deliver'), 'high-frequency cron jobs must stay no-deliver');
  assert(runtimeSource.includes('PUBLISH_MODE: "dry-run"'), 'runtime default publish mode must stay dry-run');

  console.log('reviewer_policy_check: PASS');
} catch (error) {
  console.error(`reviewer_policy_check: FAIL ${error.message}`);
  process.exit(1);
}
