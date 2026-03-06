import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const script = path.join(root, 'scripts', 'status.sh');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-status-script-'));
const runDir = path.join(tempDir, 'runs');
const emptyRunDir = path.join(tempDir, 'runs-empty');
const latestDigest = path.join(tempDir, 'LATEST.md');
const missingQueue = path.join(tempDir, 'MISSING_QUEUE.md');
const queueFile = path.join(tempDir, 'QUEUE.md');

fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(emptyRunDir, { recursive: true });
fs.writeFileSync(latestDigest, '# digest placeholder\n', 'utf8');
fs.writeFileSync(
  queueFile,
  ['- [ ] Build workspace follow-up panel', '- [!] Live publish credential handoff', '- [!] Postgres migration handoff'].join('\n'),
  'utf8',
);
fs.writeFileSync(
  path.join(runDir, 'sample.json'),
  JSON.stringify({
    runId: 'sample',
    status: 'success',
    summary: 'ok',
    durationMs: 42,
    stages: { push: 'skipped' },
    next: 'none',
  }),
  'utf8',
);

const result = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: missingQueue,
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const queueResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueFile,
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const digestFallbackResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueFile,
    SOCIALOS_RUN_DIR: emptyRunDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

try {
  assert(result.status === 0, `status script should exit 0, got ${result.status}`);
  assert(result.stdout.includes('== Foundry Status =='), 'status output header missing');
  assert(result.stdout.includes('queue_file: missing'), 'status should report missing queue file');
  assert(result.stdout.includes('none (queue file missing)'), 'blocked queue section should report missing queue file');
  assert(result.stdout.includes('run_id: sample'), 'status should still render latest run details');
  assert(queueResult.status === 0, `status script with queue should exit 0, got ${queueResult.status}`);
  assert(queueResult.stdout.includes('current_task: Build workspace follow-up panel'), 'current task should strip checkbox and marker noise');
  assert(queueResult.stdout.includes('Live publish credential handoff'), 'blocked queue head should include blocked task text');
  assert(!queueResult.stdout.includes('1:- [ ]'), 'current task should not include grep line-number output');
  assert(!queueResult.stdout.includes('2:- [!]'), 'blocked queue head should not include grep line-number output');
  assert(digestFallbackResult.status === 0, `status script digest fallback should exit 0, got ${digestFallbackResult.status}`);
  assert(digestFallbackResult.stdout.includes('run_id: unknown'), 'digest fallback should render unknown run id when missing');
  assert(digestFallbackResult.stdout.includes('status: unknown (digest-only)'), 'digest fallback should label status as digest-only');
  assert(digestFallbackResult.stdout.includes('summary: unknown'), 'digest fallback should keep summary stable when digest has no What field');
  console.log('status_script_smoke: PASS');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
