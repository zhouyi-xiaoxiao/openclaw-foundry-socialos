import { parseFoundryStatus } from '../overnight_supervisor.mjs';

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

console.log('overnight_supervisor_parser_smoke: PASS');
