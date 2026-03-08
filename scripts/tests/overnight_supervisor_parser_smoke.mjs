import { combineProbeOutput, determineDecision, parseFoundryStatus } from '../overnight_supervisor.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const outputWithoutDigest = `== Foundry Status ==
mode: RUNNING
lock: none

Queue:
pending=0 in_progress=0 blocked=2 done=11
current_task: none

Consecutive failures: 1
run_reports_dir: empty (/tmp/reports/runs)

Latest run:
run_id: RUN-123
status: failed
summary: Example failure

Blocked queue head:
Task A blocked
Task B blocked`;

const parsedWithoutDigest = parseFoundryStatus(outputWithoutDigest);
assert(parsedWithoutDigest.commandOk === true, 'commandOk should default true');
assert(parsedWithoutDigest.mode === 'ACTIVE', 'RUNNING mode should normalize to ACTIVE');
assert(parsedWithoutDigest.queue.blocked === 2, 'blocked count should still parse');
assert(parsedWithoutDigest.blockedHead.length === 2, 'blocked queue head should parse without Latest digest section');
assert(parsedWithoutDigest.blockedHead[0] === 'Task A blocked', 'first blocked item should stay intact');
assert(parsedWithoutDigest.blockedHead[1] === 'Task B blocked', 'second blocked item should stay intact');

const outputWithDigest = `${outputWithoutDigest}

Latest digest:
- line 1
- line 2`;
const parsedWithDigest = parseFoundryStatus(outputWithDigest);
assert(parsedWithDigest.latestDigest.length === 2, 'latest digest lines should still parse');
assert(parsedWithDigest.latestDigest[0] === '- line 1', 'first digest line should parse');

const outputWithNoBlocked = `== Foundry Status ==
mode: RUNNING
lock: none

Queue:
pending=0 in_progress=0 blocked=0 done=11
current_task: none

Consecutive failures: 0

Latest run:
No run report JSON found.

Blocked queue head:
none

Latest digest:
No digest yet.`;
const parsedWithNoBlocked = parseFoundryStatus(outputWithNoBlocked);
assert(parsedWithNoBlocked.mode === 'ACTIVE', 'RUNNING mode should normalize to ACTIVE in no-blocked path');
assert(parsedWithNoBlocked.blockedHead.length === 0, '"none" blocked marker should normalize to an empty list');
assert(parsedWithNoBlocked.latestDigest.length === 0, '"No digest yet." marker should normalize to an empty digest list');
const parsedCommandFailure = parseFoundryStatus('', { commandOk: false });
assert(parsedCommandFailure.commandOk === false, 'commandOk should reflect failed status probe');

const outputWithCaseVariant = `== Foundry Status ==
Mode: PAUSED
Lock: present

Queue:
pending: 3, in progress: 1, blocked: 0, done: 9
Current Task: TASK-123 Workspace polish

Consecutive Failures: 2

Latest run:
run_id = RUN-999
status = success
summary = Completed safely`;
const parsedWithCaseVariant = parseFoundryStatus(outputWithCaseVariant);
assert(parsedWithCaseVariant.mode === 'PAUSED', 'mode should parse with case-insensitive labels');
assert(parsedWithCaseVariant.lock === 'present', 'lock should parse with case-insensitive labels');
assert(parsedWithCaseVariant.queue.pending === 3, 'pending should parse with colon-separated queue format');
assert(parsedWithCaseVariant.queue.inProgress === 1, 'in progress should parse with spaced key format');
assert(parsedWithCaseVariant.queue.currentTask === 'TASK-123 Workspace polish', 'current task should parse with spaced label');
assert(parsedWithCaseVariant.consecutiveFailures === 2, 'consecutive failures should parse with case-insensitive label');
assert(parsedWithCaseVariant.latestRun.runId === 'RUN-999', 'run id should parse with equals format');

const jsonStatusOutput = JSON.stringify(
  {
    mode: 'ACTIVE',
    queue: {
      pending: 1,
      inProgress: 2,
      blocked: 3,
      done: 4,
      currentTask: null,
    },
    lock: {
      present: false,
    },
    health: {
      consecutiveFailures: 5,
    },
    latestRun: null,
    blockedHead: [{ line: 1, task: 'Blocked from JSON object' }, 'Blocked from JSON string'],
    latestDigest: ['digest line 1', 'digest line 2'],
  },
  null,
  2
);
const parsedJsonStatus = parseFoundryStatus(jsonStatusOutput, { commandOk: true });
assert(parsedJsonStatus.mode === 'ACTIVE', 'json mode should parse');
assert(parsedJsonStatus.lock === 'none', 'json lock should normalize lock.present=false to none');
assert(parsedJsonStatus.queue.pending === 1, 'json pending queue should parse');
assert(parsedJsonStatus.queue.inProgress === 2, 'json in-progress queue should parse');
assert(parsedJsonStatus.queue.blocked === 3, 'json blocked queue should parse');
assert(parsedJsonStatus.queue.done === 4, 'json done queue should parse');
assert(parsedJsonStatus.queue.currentTask === 'none', 'json currentTask should normalize null to none');
assert(parsedJsonStatus.consecutiveFailures === 5, 'json health.consecutiveFailures should parse');
assert(parsedJsonStatus.latestRun.runId === 'unknown', 'missing latest run fields should normalize to unknown');
assert(parsedJsonStatus.blockedHead.length === 2, 'json blocked head entries should normalize');
assert(parsedJsonStatus.blockedHead[0] === 'Blocked from JSON object', 'json blocked head object should use task field');
assert(parsedJsonStatus.latestDigest.length === 2, 'json digest entries should parse');

const warnedJsonStatusOutput = `(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
${jsonStatusOutput}
warning tail`;
const parsedWarnedJsonStatus = parseFoundryStatus(warnedJsonStatusOutput, { commandOk: true });
assert(parsedWarnedJsonStatus.mode === 'ACTIVE', 'json mode should parse when warnings wrap the payload');
assert(parsedWarnedJsonStatus.queue.blocked === 3, 'json queue should parse when warnings wrap the payload');
assert(parsedWarnedJsonStatus.consecutiveFailures === 5, 'json failures should parse when warnings wrap the payload');

const jsonWithLeadingNoiseObject = `{"note":"non-status object from wrapper"}
${jsonStatusOutput}`;
const parsedJsonWithLeadingNoiseObject = parseFoundryStatus(jsonWithLeadingNoiseObject, { commandOk: true });
assert(parsedJsonWithLeadingNoiseObject.mode === 'ACTIVE', 'parser should prefer the status-shaped JSON object');
assert(parsedJsonWithLeadingNoiseObject.queue.inProgress === 2, 'parser should ignore leading non-status JSON objects');
assert(parsedJsonWithLeadingNoiseObject.queue.blocked === 3, 'parser should keep queue metrics when leading JSON noise exists');

const probeFromStderrOnly = combineProbeOutput('', '\n  {"mode":"ACTIVE"}  \n');
assert(probeFromStderrOnly === '{"mode":"ACTIVE"}', 'probe output should trim and keep stderr-only status payloads');
const probeFromBothStreams = combineProbeOutput('status on stdout', 'status on stderr');
assert(probeFromBothStreams === 'status on stdout\nstatus on stderr', 'probe output should preserve both streams in order');

const decisionPaused = determineDecision({
  publishMode: 'dry-run',
  demo: { allHealthy: true },
  foundry: {
    mode: 'PAUSED',
    commandOk: true,
    consecutiveFailures: 0,
    queue: { pending: 0, inProgress: 0, blocked: 0, done: 0, currentTask: 'none' },
  },
});
assert(decisionPaused.decision === 'stop', 'paused foundry mode should stop unattended overnight iteration');
assert(decisionPaused.nextFocus === 'stabilize-foundry', 'paused foundry mode should route to foundry stabilization');

const decisionUnknownMode = determineDecision({
  publishMode: 'dry-run',
  demo: { allHealthy: true },
  foundry: {
    mode: 'unknown',
    commandOk: true,
    consecutiveFailures: 0,
    queue: { pending: 0, inProgress: 0, blocked: 0, done: 0, currentTask: 'none' },
  },
});
assert(decisionUnknownMode.decision === 'stop', 'unknown foundry mode should stop unattended overnight iteration');
assert(decisionUnknownMode.nextFocus === 'stabilize-foundry', 'unknown foundry mode should route to foundry stabilization');

const decisionActive = determineDecision({
  publishMode: 'dry-run',
  demo: { allHealthy: true },
  foundry: {
    mode: 'ACTIVE',
    commandOk: true,
    consecutiveFailures: 0,
    queue: { pending: 0, inProgress: 0, blocked: 0, done: 0, currentTask: 'none' },
  },
});
assert(decisionActive.decision === 'continue', 'healthy active foundry mode should continue');

console.log('overnight_supervisor_parser_smoke: PASS');
