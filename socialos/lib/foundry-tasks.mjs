import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../..');
export const OPENCLAW_WORKSPACE_PATH = '/Users/zhouyixiaoxiao/workspace/openclaw';
export const DEFAULT_AUTONOMY_MODE = 'direct-execute';
export const DEFAULT_TASK_SECTION = '## Adhoc Tasks';
export const DEFAULT_AUTOFIX_SECTION = '## AutoFix Backlog';
export const SUPPORTED_TASK_SCOPES = Object.freeze(['socialos', 'openclaw', 'multi-repo']);

const DEFAULT_QUEUE_TEMPLATE = `# SocialOS Foundry Queue

Legend:
- \`[ ]\` pending
- \`[-]\` in progress (single active item)
- \`[x]\` done
- \`[!]\` blocked
`;

const DEFAULT_ACCEPTANCE_CRITERION =
  'acceptance criteria are verifiable via scripts/test.sh or explicit run report evidence';
const DEFAULT_DRY_RUN_CONSTRAINT =
  'publish mode must stay dry-run unless runtime controls, credentials, and live publish gates are explicitly satisfied';

function isoNow() {
  return new Date().toISOString();
}

function queueMarkerFromStatus(status) {
  switch (status) {
    case 'done':
      return 'x';
    case 'blocked':
      return '!';
    case 'in_progress':
      return '-';
    default:
      return ' ';
  }
}

function statusFromQueueMarker(marker) {
  switch (marker) {
    case 'x':
      return 'done';
    case '!':
      return 'blocked';
    case '-':
      return 'in_progress';
    default:
      return 'pending';
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFreeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    );
  }

  if (typeof value !== 'string') return [];

  const raw = value.trim();
  if (!raw) return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      return normalizeStringList(parsed);
    } catch {
      // Fall through to line parsing.
    }
  }

  const separator = raw.includes('\n') ? /\r?\n/u : /,/u;
  return uniqueStrings(
    raw
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeRepoTarget(rawTarget, paths) {
  const value = normalizeFreeText(rawTarget);
  if (!value) return null;
  if (value === 'socialos') return paths.repoRoot;
  if (value === 'openclaw') return OPENCLAW_WORKSPACE_PATH;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(paths.repoRoot, value);
}

function ensureQueueExists(queuePath) {
  if (fs.existsSync(queuePath)) return;
  fs.writeFileSync(queuePath, `${DEFAULT_QUEUE_TEMPLATE}\n${DEFAULT_TASK_SECTION}\n`, 'utf8');
}

function ensureSection(lines, heading) {
  const existingIndex = lines.findIndex((line) => line.trim() === heading);
  if (existingIndex >= 0) return existingIndex;

  if (lines.length && lines[lines.length - 1] !== '') {
    lines.push('');
  }
  lines.push(heading);
  return lines.length - 1;
}

function findSectionInsertIndex(lines, sectionIndex) {
  let cursor = sectionIndex + 1;
  while (cursor < lines.length && !lines[cursor].startsWith('## ')) {
    cursor += 1;
  }
  return cursor;
}

function buildTaskLabel(task, paths) {
  const detailPath = path.relative(paths.repoRoot, task.filePath).replace(/\\/g, '/');
  return `${task.taskId} ${task.title} (details: ${detailPath})`;
}

function writeQueueLine(task, marker, options = {}) {
  const paths = resolveFoundryRuntimePaths(options);
  ensureQueueExists(paths.queuePath);

  const queueMarkdown = fs.readFileSync(paths.queuePath, 'utf8');
  const lines = queueMarkdown.split(/\r?\n/u);
  const label = buildTaskLabel(task, paths);
  const linePattern = new RegExp(`^- \\[[ x!\\-]\\] ${task.taskId}\\b.*$`, 'u');
  const replacement = `- [${marker}] ${label}`;
  const existingIndex = lines.findIndex((line) => linePattern.test(line));

  if (existingIndex >= 0) {
    lines[existingIndex] = replacement;
  } else {
    const sectionIndex = ensureSection(lines, DEFAULT_TASK_SECTION);
    const insertIndex = findSectionInsertIndex(lines, sectionIndex);
    lines.splice(insertIndex, 0, replacement);
  }

  fs.writeFileSync(paths.queuePath, `${lines.join('\n').replace(/\n+$/u, '\n')}`, 'utf8');
  return replacement;
}

function appendAutofixEntry(taskId, reason, options = {}) {
  if (!reason) return null;

  const paths = resolveFoundryRuntimePaths(options);
  ensureQueueExists(paths.queuePath);
  const queueMarkdown = fs.readFileSync(paths.queuePath, 'utf8');
  if (queueMarkdown.includes(reason)) return null;

  const lines = queueMarkdown.split(/\r?\n/u);
  const sectionIndex = ensureSection(lines, DEFAULT_AUTOFIX_SECTION);
  const insertIndex = findSectionInsertIndex(lines, sectionIndex);
  const autofixId = `AUTOFIX-${taskId.replace(/[^A-Za-z0-9]/gu, '_')}-${new Date()
    .toISOString()
    .slice(11, 19)
    .replace(/:/g, '')}`;

  lines.splice(
    insertIndex,
    0,
    `- [ ] ${autofixId} ${reason}`,
    '  - Done When:',
    '    - blocker root cause is fixed',
    '    - related tests and reviewer checks pass'
  );

  fs.writeFileSync(paths.queuePath, `${lines.join('\n').replace(/\n+$/u, '\n')}`, 'utf8');
  return autofixId;
}

function buildDefaultRepoTargets(scope, paths) {
  if (scope === 'openclaw') return [OPENCLAW_WORKSPACE_PATH];
  if (scope === 'multi-repo') return [paths.repoRoot, OPENCLAW_WORKSPACE_PATH];
  return [paths.repoRoot];
}

function normalizeScope(rawScope, repoTargets) {
  const explicitScope = normalizeFreeText(rawScope).toLowerCase();
  const hasCrossRepoTargets = repoTargets.some((target) => target === OPENCLAW_WORKSPACE_PATH) || repoTargets.length > 1;

  if (!explicitScope) {
    if (hasCrossRepoTargets) {
      throw new Error('scope must be explicitly set to openclaw or multi-repo for cross-repo tasks');
    }
    return 'socialos';
  }

  if (!SUPPORTED_TASK_SCOPES.includes(explicitScope)) {
    throw new Error(`scope must be one of ${SUPPORTED_TASK_SCOPES.join(', ')}`);
  }

  return explicitScope;
}

function deriveRepoTargets(input, scope, paths) {
  const providedTargets = normalizeStringList(input.repoTargets)
    .map((rawTarget) => normalizeRepoTarget(rawTarget, paths))
    .filter(Boolean);

  const targets = providedTargets.length ? providedTargets : buildDefaultRepoTargets(scope, paths);
  const uniqueTargets = uniqueStrings(targets);

  if (scope === 'socialos') {
    if (uniqueTargets.length !== 1 || uniqueTargets[0] !== paths.repoRoot) {
      throw new Error('socialos tasks may only target the SocialOS repository');
    }
    return uniqueTargets;
  }

  if (scope === 'openclaw') {
    if (uniqueTargets.length !== 1 || uniqueTargets[0] !== OPENCLAW_WORKSPACE_PATH) {
      throw new Error('openclaw tasks may only target /Users/zhouyixiaoxiao/workspace/openclaw');
    }
    return uniqueTargets;
  }

  if (uniqueTargets.length < 2) {
    throw new Error('multi-repo tasks require at least two repoTargets');
  }

  return uniqueTargets;
}

function buildTaskFilePath(taskId, paths) {
  return path.join(paths.tasksDir, `${taskId}.json`);
}

function parseTaskSummary(task, paths) {
  return {
    taskId: task.taskId,
    title: task.title,
    goal: task.goal,
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
    constraints: Array.isArray(task.constraints) ? task.constraints : [],
    scope: task.scope,
    repoTargets: Array.isArray(task.repoTargets) ? task.repoTargets : [],
    preferredTests: Array.isArray(task.preferredTests) ? task.preferredTests : [],
    intakeMode: task.intakeMode,
    autonomyMode: task.autonomyMode || DEFAULT_AUTONOMY_MODE,
    status: task.status || 'pending',
    metadataPath: path.relative(paths.repoRoot, task.filePath).replace(/\\/g, '/'),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    execution: task.execution || null,
  };
}

export function resolveFoundryRuntimePaths(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  return {
    repoRoot,
    queuePath: path.join(repoRoot, 'QUEUE.md'),
    tasksDir: path.join(repoRoot, 'foundry/tasks'),
    foundryDir: path.join(repoRoot, '.foundry'),
    reportsDir: path.join(repoRoot, 'reports/runs'),
    llmTaskHealthPath: path.join(repoRoot, '.foundry/llm_task_health.json'),
  };
}

export function ensureFoundryRuntimeDirs(options = {}) {
  const paths = resolveFoundryRuntimePaths(options);
  fs.mkdirSync(paths.tasksDir, { recursive: true });
  fs.mkdirSync(paths.foundryDir, { recursive: true });
  fs.mkdirSync(paths.reportsDir, { recursive: true });
  ensureQueueExists(paths.queuePath);
  return paths;
}

export function buildStructuredTaskRecord(input = {}, options = {}) {
  const paths = resolveFoundryRuntimePaths(options);
  const intakeMode =
    normalizeFreeText(input.intakeMode).toLowerCase() === 'structured' ||
    normalizeStringList(input.acceptanceCriteria).length > 0 ||
    normalizeStringList(input.constraints).length > 0 ||
    normalizeStringList(input.preferredTests).length > 0 ||
    normalizeStringList(input.repoTargets).length > 0 ||
    normalizeFreeText(input.scope)
      ? 'structured'
      : 'quick';

  const title = normalizeFreeText(input.title || input.taskText || input.text || input.goal);
  if (!title) throw new Error('title or taskText is required');

  const scope = normalizeScope(input.scope, normalizeStringList(input.repoTargets).map((target) => normalizeRepoTarget(target, paths)).filter(Boolean));
  const repoTargets = deriveRepoTargets(input, scope, paths);
  const goal = normalizeFreeText(input.goal || title);
  const acceptanceCriteria = normalizeStringList(input.acceptanceCriteria);
  const constraints = uniqueStrings([
    ...normalizeStringList(input.constraints),
    DEFAULT_DRY_RUN_CONSTRAINT,
  ]);
  const preferredTests = normalizeStringList(input.preferredTests);

  if (intakeMode === 'structured' && !goal) {
    throw new Error('goal is required for structured tasks');
  }

  if (intakeMode === 'structured' && acceptanceCriteria.length === 0) {
    throw new Error('acceptanceCriteria is required for structured tasks');
  }

  const taskId = input.taskId || `TASK-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  const createdAt = input.createdAt || isoNow();
  const updatedAt = input.updatedAt || createdAt;
  const filePath = buildTaskFilePath(taskId, paths);

  return {
    version: 1,
    taskId,
    title,
    goal,
    acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : [DEFAULT_ACCEPTANCE_CRITERION],
    constraints,
    scope,
    repoTargets,
    preferredTests: preferredTests.length ? preferredTests : ['bash scripts/test.sh'],
    intakeMode,
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    status: 'pending',
    createdAt,
    updatedAt,
    filePath,
    queue: {
      section: DEFAULT_TASK_SECTION,
      marker: ' ',
    },
    execution: null,
  };
}

export function writeStructuredTask(task, options = {}) {
  const paths = ensureFoundryRuntimeDirs(options);
  const filePath = task.filePath || buildTaskFilePath(task.taskId, paths);
  const payload = { ...task, filePath };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (options.syncQueue !== false) {
    writeQueueLine(payload, queueMarkerFromStatus(payload.status || 'pending'), options);
  }
  return parseTaskSummary(payload, paths);
}

export function createStructuredTask(input = {}, options = {}) {
  const task = buildStructuredTaskRecord(input, options);
  return writeStructuredTask(task, options);
}

export function readStructuredTask(taskId, options = {}) {
  const paths = resolveFoundryRuntimePaths(options);
  const filePath = buildTaskFilePath(taskId, paths);
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  parsed.filePath = filePath;
  return parsed;
}

export function updateStructuredTask(taskId, patch = {}, options = {}) {
  const paths = ensureFoundryRuntimeDirs(options);
  const existing = readStructuredTask(taskId, options);
  if (!existing) {
    throw new Error(`task ${taskId} not found`);
  }

  const nextTask = {
    ...existing,
    ...patch,
    taskId,
    updatedAt: isoNow(),
    filePath: existing.filePath || buildTaskFilePath(taskId, paths),
  };

  if (patch.execution && existing.execution && !Array.isArray(patch.execution)) {
    nextTask.execution = {
      ...existing.execution,
      ...patch.execution,
    };
  }

  fs.writeFileSync(nextTask.filePath, `${JSON.stringify(nextTask, null, 2)}\n`, 'utf8');

  if (options.syncQueue !== false && (patch.status || patch.queue?.marker)) {
    const marker = patch.queue?.marker || queueMarkerFromStatus(nextTask.status || 'pending');
    writeQueueLine(nextTask, marker, options);
  }

  return parseTaskSummary(nextTask, paths);
}

export function setStructuredTaskStatus(taskId, status, options = {}) {
  const marker = queueMarkerFromStatus(status);
  return updateStructuredTask(taskId, { status, queue: { marker } }, options);
}

export function listStructuredTasks(options = {}) {
  const paths = ensureFoundryRuntimeDirs(options);
  let entries = [];
  try {
    entries = fs.readdirSync(paths.tasksDir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const tasks = [];
  for (const entry of entries) {
    try {
      const filePath = path.join(paths.tasksDir, entry);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      parsed.filePath = filePath;
      tasks.push(parseTaskSummary(parsed, paths));
    } catch {
      // Keep listing resilient to malformed files.
    }
  }

  tasks.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : null;
  return limit ? tasks.slice(0, limit) : tasks;
}

export function createAutofixBacklogEntry(taskId, reason, options = {}) {
  return appendAutofixEntry(taskId, reason, options);
}

export function writeLlmTaskHealthSnapshot(snapshot, options = {}) {
  const paths = ensureFoundryRuntimeDirs(options);
  fs.writeFileSync(paths.llmTaskHealthPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

export function readLlmTaskHealthSnapshot(options = {}) {
  const paths = resolveFoundryRuntimePaths(options);
  if (!fs.existsSync(paths.llmTaskHealthPath)) {
    return {
      status: 'unknown',
      checkedAt: null,
      summary: 'No llm-task probe has been recorded yet.',
    };
  }

  try {
    return JSON.parse(fs.readFileSync(paths.llmTaskHealthPath, 'utf8'));
  } catch {
    return {
      status: 'blocked',
      checkedAt: isoNow(),
      summary: 'llm-task health snapshot is unreadable.',
    };
  }
}

export function queueStatusFromMarker(marker) {
  return statusFromQueueMarker(marker);
}

export function queueMarkerForStatus(status) {
  return queueMarkerFromStatus(status);
}
