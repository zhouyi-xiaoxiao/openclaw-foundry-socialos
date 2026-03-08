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
const missingRunDir = path.join(tempDir, 'runs-missing');
const latestDigest = path.join(tempDir, 'LATEST.md');
const missingQueue = path.join(tempDir, 'MISSING_QUEUE.md');
const queueFile = path.join(tempDir, 'QUEUE.md');
const queueNoBlockedFile = path.join(tempDir, 'QUEUE_NO_BLOCKED.md');
const queueBlockedOnlyFile = path.join(tempDir, 'QUEUE_BLOCKED_ONLY.md');
const queueIndentedFile = path.join(tempDir, 'QUEUE_INDENTED.md');

fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(emptyRunDir, { recursive: true });
fs.writeFileSync(latestDigest, '# digest placeholder\n', 'utf8');
fs.writeFileSync(
  queueFile,
  ['- [ ] Build workspace follow-up panel', '- [!] Live publish credential handoff', '- [!] Postgres migration handoff'].join('\n'),
  'utf8',
);
fs.writeFileSync(queueNoBlockedFile, ['- [ ] Build workspace follow-up panel', '- [x] Done item'].join('\n'), 'utf8');
fs.writeFileSync(
  queueBlockedOnlyFile,
  ['- [!] Live publish credential handoff', '- [!] Postgres migration handoff'].join('\n'),
  'utf8',
);
fs.writeFileSync(
  queueIndentedFile,
  [
    '- [ ] Parent task',
    '  - [-] Nested in-progress task',
    '    -    [!] Deep blocked task',
    '\t- [x] Deep done task',
  ].join('\n'),
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

const noBlockedResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueNoBlockedFile,
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const blockedOnlyResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueBlockedOnlyFile,
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const indentedQueueResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueIndentedFile,
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const missingRunDirResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_QUEUE_FILE: queueFile,
    SOCIALOS_RUN_DIR: missingRunDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const studioJsonResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_STUDIO_STATUS_JSON: JSON.stringify({
      mode: 'ACTIVE',
      queue: {
        pending: 2,
        inProgress: 1,
        blocked: 3,
        done: 9,
        currentTask: 'Studio primary task',
      },
      blockedHead: [
        { task: 'Studio blocked task A', blockedBy: 'blocked by: credentials + login state' },
        { task: 'Studio blocked task B', blockedBy: 'manual review required' },
      ],
    }),
    SOCIALOS_RUN_DIR: runDir,
    SOCIALOS_LATEST_DIGEST_FILE: latestDigest,
  },
});

const studioJsonBlockedReasonResult = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SOCIALOS_STUDIO_STATUS_JSON: JSON.stringify({
      queue: {
        pending: 0,
        inProgress: 0,
        blocked: 2,
        done: 0,
        currentTask: null,
      },
      blockedHead: [
        { task: 'Studio blocked task A', blockedBy: 'blocked by: credentials + login state + live decision' },
        { task: 'Studio blocked task B', blockedBy: 'manual infra approval' },
      ],
    }),
    SOCIALOS_RUN_DIR: runDir,
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
  assert(digestFallbackResult.stdout.includes('run_reports_dir: empty'), 'digest fallback should report empty run reports directory');
  assert(digestFallbackResult.stdout.includes('run_id: unknown'), 'digest fallback should render unknown run id when missing');
  assert(digestFallbackResult.stdout.includes('status: unknown (digest-only)'), 'digest fallback should label status as digest-only');
  assert(digestFallbackResult.stdout.includes('summary: unknown'), 'digest fallback should keep summary stable when digest has no What field');
  assert(noBlockedResult.status === 0, `status script with no blocked tasks should exit 0, got ${noBlockedResult.status}`);
  assert(noBlockedResult.stdout.includes('Blocked queue head:\nnone'), 'blocked queue head should print none when queue has no blocked items');
  assert(blockedOnlyResult.status === 0, `status script with blocked-only queue should exit 0, got ${blockedOnlyResult.status}`);
  assert(blockedOnlyResult.stdout.includes('current_task: none'), 'blocked-only queue should not report a current actionable task');
  assert(indentedQueueResult.status === 0, `status script with indented queue should exit 0, got ${indentedQueueResult.status}`);
  assert(
    indentedQueueResult.stdout.includes('pending=1 in_progress=1 blocked=1 done=1'),
    'indented queue markers should be counted in queue totals',
  );
  assert(
    indentedQueueResult.stdout.includes('current_task: Nested in-progress task'),
    'in-progress items should be preferred as current task over pending items',
  );
  assert(
    indentedQueueResult.stdout.includes('Blocked queue head:\nDeep blocked task'),
    'indented blocked tasks should be listed in blocked queue head',
  );
  assert(missingRunDirResult.status === 0, `status script with missing run dir should exit 0, got ${missingRunDirResult.status}`);
  assert(missingRunDirResult.stdout.includes('run_reports_dir: missing'), 'status should report missing run reports directory');
  assert(studioJsonResult.status === 0, `status script with studio queue JSON should exit 0, got ${studioJsonResult.status}`);
  assert(studioJsonResult.stdout.includes('mode: ACTIVE'), 'studio status mode should drive displayed Foundry mode');
  assert(
    studioJsonResult.stdout.includes('pending=2 in_progress=1 blocked=3 done=9'),
    'studio status queue counts should drive status queue summary when no queue override is set',
  );
  assert(
    studioJsonResult.stdout.includes('current_task: Studio primary task'),
    'studio status current task should drive current task output',
  );
  assert(
    studioJsonResult.stdout.includes('mode: ACTIVE'),
    'studio status mode should drive status output mode when available',
  );
  assert(
    studioJsonResult.stdout.includes(
      'Blocked queue head:\nStudio blocked task A (blocked by: credentials + login state)\nStudio blocked task B (blocked by: manual review required)'
    ),
    'studio status blocked head should include normalized blocked reasons',
  );
  assert(
    studioJsonBlockedReasonResult.status === 0,
    `status script with studio blockedBy reasons should exit 0, got ${studioJsonBlockedReasonResult.status}`,
  );
  assert(
    studioJsonBlockedReasonResult.stdout.includes(
      'Studio blocked task A (blocked by: credentials + login state + live decision)',
    ),
    'studio status blocked reason should render once without duplicated prefix',
  );
  assert(
    studioJsonBlockedReasonResult.stdout.includes('Studio blocked task B (blocked by: manual infra approval)'),
    'studio status blocked reason should render for plain blockedBy text',
  );
  assert(
    !studioJsonBlockedReasonResult.stdout.includes('blocked by: blocked by:'),
    'studio status blocked reason should not repeat the blocked by prefix',
  );
  console.log('status_script_smoke: PASS');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
