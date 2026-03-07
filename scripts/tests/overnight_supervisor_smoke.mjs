import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const script = path.join(root, 'scripts', 'overnight_supervisor.sh');
const summaryPath = path.join(root, 'reports', 'overnight', 'latest.md');
const jsonPath = path.join(root, 'reports', 'overnight', 'latest.json');
const runReportsPath = path.join(root, 'reports', 'runs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const result = spawnSync('bash', [script], {
  cwd: root,
  encoding: 'utf8',
});

assert([0, 2].includes(result.status ?? 1), `overnight supervisor should exit 0 or 2, got ${result.status}`);
assert(result.stdout.includes('overnight_supervisor:'), 'stdout must include overnight_supervisor status');
assert(fs.existsSync(summaryPath), 'overnight summary markdown must exist');
assert(fs.existsSync(jsonPath), 'overnight summary json must exist');
assert(fs.existsSync(runReportsPath), 'run reports directory must be bootstrapped');

const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert(typeof report.decision === 'string' && report.decision.length > 0, 'report.decision must exist');
assert(typeof report.nextFocus === 'string' && report.nextFocus.length > 0, 'report.nextFocus must exist');
assert(report.safety?.publishMode === 'dry-run', 'overnight supervisor must preserve dry-run publish mode');
assert(report.demo?.services?.length >= 2, 'overnight supervisor must record demo services');
assert(typeof report.foundry?.consecutiveFailures === 'number', 'overnight supervisor must capture Foundry failures');
const gitStatus = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
const actualDirty = Boolean((gitStatus.stdout || '').trim());
assert(
  report.git?.dirty === actualDirty,
  `overnight supervisor git dirty flag must match repo state (reported=${report.git?.dirty}, actual=${actualDirty})`
);

console.log('overnight_supervisor_smoke: PASS');
