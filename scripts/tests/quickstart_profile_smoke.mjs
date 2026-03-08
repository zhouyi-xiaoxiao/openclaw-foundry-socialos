import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...options,
  });
  assert(result.status === 0, `${[command, ...args].join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function countRows(dbPath, tableName) {
  const db = new DatabaseSync(dbPath);
  try {
    return Number(db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get().count || 0);
  } finally {
    db.close();
  }
}

function readText(targetPath) {
  return fs.readFileSync(targetPath, 'utf8');
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-quickstart-'));
  const demoDbPath = path.join(tempDir, 'socialos.demo.db');
  const localDbPath = path.join(tempDir, 'socialos.local.db');
  const demoEnvLocalPath = path.join(tempDir, '.env.demo.local');
  const localEnvLocalPath = path.join(tempDir, '.env.local');

  const demoInstallOutput = run('bash', [
    'scripts/install.sh',
    '--profile',
    'demo',
    '--db-path',
    demoDbPath,
    '--reset-demo',
  ]);
  assert(demoInstallOutput.includes('profile: demo'), 'demo install should report demo profile');
  assert(countRows(demoDbPath, 'Person') > 0, 'demo profile should seed people');

  const localInstallOutput = run('bash', [
    'scripts/install.sh',
    '--profile',
    'local',
    '--db-path',
    localDbPath,
  ]);
  assert(localInstallOutput.includes('profile: local'), 'local install should report local profile');
  assert(countRows(localDbPath, 'Person') === 0, 'local profile should stay blank');

  const quickstartOutput = run('bash', [
    'scripts/quickstart.sh',
    '--profile',
    'local',
    '--db-path',
    localDbPath,
    '--env-local-path',
    localEnvLocalPath,
    '--skip-start',
  ]);
  const envLocal = readText(localEnvLocalPath);
  assert(envLocal.includes('SOCIALOS_PROFILE=local'), 'quickstart should write local profile into env.local');
  assert(envLocal.includes(`SOCIALOS_DB_PATH=${localDbPath}`), 'quickstart should write db path into env.local');
  assert(quickstartOutput.includes('App workspace: http://127.0.0.1:4173/quick-capture'), 'quickstart should print the app URL');
  assert(quickstartOutput.includes('Start a blank local workspace'), 'quickstart should print the local profile hint');

  run('bash', [
    'scripts/quickstart.sh',
    '--profile',
    'demo',
    '--db-path',
    demoDbPath,
    '--env-local-path',
    demoEnvLocalPath,
    '--skip-start',
  ]);
  const demoEnvLocal = readText(demoEnvLocalPath);
  assert(demoEnvLocal.includes('SOCIALOS_PROFILE=demo'), 'demo quickstart should write demo profile into env.local');

  const readme = readText(path.join(REPO_ROOT, 'README.md'));
  for (const heading of [
    '## Project Overview',
    '## Quickstart',
    '## Setup & Installation',
    '## Architecture Overview',
    '## Start Your Own Local Workspace',
    '## Bounty-Specific Integration',
    '## Public Links',
  ]) {
    assert(readme.includes(heading), `README should include ${heading}`);
  }
  assert(readme.includes('https://zhouyixiaoxiao.org/videos/claw-for-human/'), 'README should expose stable public video links');
  assert(readme.includes('bash scripts/quickstart.sh --profile local'), 'README should expose the blank local workspace command');
  assert(
    readme.includes('The public site is read-only and proof-first. The interactive product remains local-first by design.'),
    'README should explain the public vs local boundary'
  );

  console.log('quickstart_profile_smoke: PASS');
}

main();
