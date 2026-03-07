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

console.log('ops_queue_parser_smoke: PASS');
