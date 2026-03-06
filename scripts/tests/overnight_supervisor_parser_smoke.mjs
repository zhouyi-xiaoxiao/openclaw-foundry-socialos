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
const parsedCommandFailure = parseFoundryStatus('', { commandOk: false });
assert(parsedCommandFailure.commandOk === false, 'commandOk should reflect failed status probe');

console.log('overnight_supervisor_parser_smoke: PASS');
