import { parseBlockedTasks, parseQueueSummary } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queueMarkdown = `# Queue

- [ ] Top-level pending
  - [-] Nested in progress
    - [!] Deep blocked task
      - blocked by: credentials + live publish approval
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
assert(blocked[0].blockedBy === 'credentials + live publish approval', 'blocked reason should normalize without prefix');
assert(parseBlockedTasks(queueMarkdown, 0).length === 0, 'limit=0 should return no blocked tasks');

const emptySummary = parseQueueSummary(null);
assert(emptySummary.pending === 0, 'null queue should default pending to 0');
assert(emptySummary.inProgress === 0, 'null queue should default in-progress to 0');
assert(emptySummary.blocked === 0, 'null queue should default blocked to 0');
assert(emptySummary.done === 0, 'null queue should default done to 0');
assert(emptySummary.currentTask === null, 'null queue should preserve empty current task');
assert(parseBlockedTasks(null).length === 0, 'null queue should produce no blocked tasks');

const variantQueueMarkdown = `# Queue

* [ ] Bullet pending
- [ - ] Spaced in-progress
  * [ ! ] Spaced blocked
  * [ x ] Spaced done`;

const variantSummary = parseQueueSummary(variantQueueMarkdown);
assert(variantSummary.pending === 1, 'should parse pending tasks with * bullet marker');
assert(variantSummary.inProgress === 1, 'should parse in-progress tasks with spaced marker');
assert(variantSummary.blocked === 1, 'should parse blocked tasks with spaced marker');
assert(variantSummary.done === 1, 'should parse done tasks with spaced marker');
assert(variantSummary.currentTask === 'Spaced in-progress', 'variant queue should preserve current in-progress task');

const variantBlocked = parseBlockedTasks(variantQueueMarkdown, 10);
assert(variantBlocked.length === 1, 'blocked parser should parse spaced blocked markers');
assert(variantBlocked[0].task === 'Spaced blocked', 'blocked parser should trim spaced blocked task text');

console.log('ops_queue_parser_smoke: PASS');
