import { combineProbeOutput, determineDecision, parseDemoStatus, parseFoundryStatus } from '../overnight_supervisor.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const demoStatusOutput = `socialos-api: health=http://127.0.0.1:8787/health ready=true healthy=true pid=none pidAlive=false stalePid=false listeningPid=11570 unmanagedHealthy=true
socialos-web: ready=true healthy=true pid=none pidAlive=false stalePid=false listeningPid=11609 unmanagedHealthy=true health=http://127.0.0.1:4173/quick-capture extraField=ignored`;
const parsedDemoStatus = parseDemoStatus(demoStatusOutput);
assert(parsedDemoStatus.services.length === 2, 'demo parser should keep both services');
assert(parsedDemoStatus.allHealthy === true, 'demo parser should mark both ready services healthy');
assert(parsedDemoStatus.services[0].healthUrl === 'http://127.0.0.1:8787/health', 'demo parser should parse api health URL when keys are reordered');
assert(parsedDemoStatus.services[1].label === 'socialos-web', 'demo parser should retain web service label');

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
assert(parsedWithNoBlocked.latestRun.status === 'unknown', 'missing latest run status should not parse from the status header');
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
    blockedHead: [{ line: 1, task: 'Blocked from JSON object', blockedBy: 'missing credentials' }, 'Blocked from JSON string'],
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
assert(
  parsedJsonStatus.blockedHead[0] === 'Blocked from JSON object (blocked by: missing credentials)',
  'json blocked head object should include blockedBy context when available',
);
assert(parsedJsonStatus.latestDigest.length === 2, 'json digest entries should parse');

const jsonStatusWithStringDigest = JSON.stringify({
  mode: 'ACTIVE',
  queue: { pending: 0, inProgress: 0, blocked: 1, done: 2, currentTask: 'none' },
  lock: { present: false },
  health: { consecutiveFailures: 0 },
  blockedHead: 'Blocked alpha\nBlocked beta',
  latestDigest: 'No digest yet.\nDigest line preserved',
});
const parsedJsonStatusWithStringDigest = parseFoundryStatus(jsonStatusWithStringDigest, { commandOk: true });
assert(parsedJsonStatusWithStringDigest.blockedHead.length === 2, 'string blocked head should split into entries');
assert(parsedJsonStatusWithStringDigest.blockedHead[1] === 'Blocked beta', 'string blocked head should preserve order');
assert(
  parsedJsonStatusWithStringDigest.latestDigest.length === 1,
  'string digest should ignore boilerplate and keep meaningful lines'
);
assert(
  parsedJsonStatusWithStringDigest.latestDigest[0] === 'Digest line preserved',
  'string digest should preserve non-boilerplate entries'
);

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

const minimalJsonStatusOutput = '{"mode":"RUNNING"}';
const parsedMinimalJsonStatus = parseFoundryStatus(minimalJsonStatusOutput, { commandOk: true });
assert(parsedMinimalJsonStatus.mode === 'ACTIVE', 'minimal json mode should still parse and normalize RUNNING');
assert(parsedMinimalJsonStatus.queue.blocked === 0, 'minimal json mode should default queue counts to zero');
assert(parsedMinimalJsonStatus.latestRun.status === 'unknown', 'minimal json mode should keep latest run unknown when absent');

const jsonStatusOutputWithTaskTitleVariants = JSON.stringify(
  {
    mode: 'ACTIVE',
    queue: {
      pending: 0,
      inProgress: 0,
      blocked: 3,
      done: 0,
      currentTask: 'none',
    },
    lock: { present: false },
    health: { consecutiveFailures: 0 },
    latestRun: { runId: 'RUN-1000', status: 'blocked', summary: 'waiting on unblock' },
    blockedHead: [
      { taskId: 'TASK-123', title: 'Missing token handoff' },
      { title: 'Needs DB access' },
      { taskId: 'TASK-999' },
    ],
    latestDigest: [],
  },
  null,
  2
);
const parsedTaskTitleVariantStatus = parseFoundryStatus(jsonStatusOutputWithTaskTitleVariants, { commandOk: true });
assert(parsedTaskTitleVariantStatus.blockedHead.length === 3, 'task/title variant blocked entries should normalize');
assert(
  parsedTaskTitleVariantStatus.blockedHead[0] === 'TASK-123 Missing token handoff',
  'taskId+title entries should normalize into one line',
);
assert(parsedTaskTitleVariantStatus.blockedHead[1] === 'Needs DB access', 'title-only blocked entries should normalize');
assert(parsedTaskTitleVariantStatus.blockedHead[2] === 'TASK-999', 'taskId-only blocked entries should normalize');

const unhealthyDemoStatusOutput = `socialos-api: ready=true healthy=true pid=none pidAlive=false stalePid=false listeningPid=11570 unmanagedHealthy=true health=http://127.0.0.1:8787/health
socialos-web: ready=true healthy=false pid=none pidAlive=false stalePid=false listeningPid=11609 unmanagedHealthy=true health=http://127.0.0.1:4173/quick-capture`;
const parsedUnhealthyDemoStatus = parseDemoStatus(unhealthyDemoStatusOutput);
assert(parsedUnhealthyDemoStatus.services.length === 2, 'demo status should parse two services');
assert(parsedUnhealthyDemoStatus.services[1].ready === true, 'demo parser should preserve ready=true on unhealthy service');
assert(parsedUnhealthyDemoStatus.services[1].healthy === false, 'demo parser should preserve healthy=false from probe output');
assert(parsedUnhealthyDemoStatus.allHealthy === false, 'demo should be unhealthy when any service reports healthy=false');

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
assert(
  decisionActive.nextFocus === 'workspace-usability-and-demo-trust',
  'healthy active foundry mode should keep workspace polish focus'
);

const decisionBlockedQueue = determineDecision({
  publishMode: 'dry-run',
  demo: { allHealthy: true },
  foundry: {
    mode: 'ACTIVE',
    commandOk: true,
    consecutiveFailures: 0,
    queue: { pending: 0, inProgress: 0, blocked: 3, done: 0, currentTask: 'none' },
  },
});
assert(decisionBlockedQueue.decision === 'continue', 'blocked queue should continue under active dry-run mode');
assert(
  decisionBlockedQueue.nextFocus === 'triage-blocked-foundry-queue',
  'blocked queue should prioritize queue triage focus'
);

console.log('overnight_supervisor_parser_smoke: PASS');
