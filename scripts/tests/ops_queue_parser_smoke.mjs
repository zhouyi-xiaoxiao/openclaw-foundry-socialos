import { parseBlockedTasks, parseQueueSummary } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queueMarkdown = `# Queue

- [ ] Top-level pending
  - [-] Nested in progress
    - [!] Deep blocked task
  - [x] Nested done
- [ ] Second pending`;

const summary = parseQueueSummary(queueMarkdown);
assert(summary.pending === 2, 'should count top-level pending tasks');
assert(summary.inProgress === 1, 'should count indented in-progress tasks');
assert(summary.blocked === 1, 'should count indented blocked tasks');
assert(summary.done === 1, 'should count indented done tasks');
assert(summary.currentTask === 'Nested in progress', 'in-progress task should be preferred as currentTask');

const blocked = parseBlockedTasks(queueMarkdown, 10);
assert(blocked.length === 1, 'should return indented blocked tasks');
assert(blocked[0].task === 'Deep blocked task', 'blocked task text should be trimmed');
assert(parseBlockedTasks(queueMarkdown, 0).length === 0, 'limit=0 should return no blocked tasks');

const emptySummary = parseQueueSummary(null);
assert(emptySummary.pending === 0, 'null queue should default pending to 0');
assert(emptySummary.inProgress === 0, 'null queue should default in-progress to 0');
assert(emptySummary.blocked === 0, 'null queue should default blocked to 0');
assert(emptySummary.done === 0, 'null queue should default done to 0');
assert(emptySummary.currentTask === null, 'null queue should preserve empty current task');
assert(parseBlockedTasks(null).length === 0, 'null queue should produce no blocked tasks');

console.log('ops_queue_parser_smoke: PASS');
