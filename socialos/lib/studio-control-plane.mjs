import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { OPENCLAW_WORKSPACE_PATH, SUPPORTED_TASK_SCOPES } from './foundry-tasks.mjs';

export const STUDIO_TASK_STATUS = Object.freeze({
  draft: 'draft',
  queued: 'queued',
  planning: 'planning',
  coding: 'coding',
  testing: 'testing',
  review: 'review',
  done: 'done',
  blocked: 'blocked',
});

export const STUDIO_COMMANDS = Object.freeze(['run-once', 'pause', 'resume', 'notify']);

const DEFAULT_ACCEPTANCE_CRITERION =
  'verification is captured in the latest Studio run evidence';
const DEFAULT_DRY_RUN_CONSTRAINT =
  'publish mode must stay dry-run unless runtime controls, credentials, and live publish gates are explicitly satisfied';
const DEFAULT_PREFERRED_TESTS = ['bash scripts/test.sh'];

const STUDIO_SECTION_ORDER = Object.freeze([
  'Product Backlog',
  'Studio Ops',
  'P2 Blocked',
  'Auto Optimization Pool',
  'AutoFix Backlog',
]);

const STUDIO_PRIORITY_BY_SECTION = Object.freeze({
  'Product Backlog': 2,
  'Studio Ops': 2,
  'P2 Blocked': 4,
  'Auto Optimization Pool': 3,
  'AutoFix Backlog': 2,
});

const FOUNDY_TO_STUDIO_SECTION = Object.freeze({
  'Foundry Ops': 'Studio Ops',
});

const AGENT_RESPONSIBILITIES = Object.freeze({
  forge_orchestrator: Object.freeze({
    title: 'Orchestrator',
    responsibility: 'Break work down, prioritize it, and turn it into an executable Studio plan.',
  }),
  forge_coder: Object.freeze({
    title: 'Coder',
    responsibility: 'Implement API, UI, runtime, and documentation changes.',
  }),
  forge_tester: Object.freeze({
    title: 'Tester',
    responsibility: 'Run smoke, e2e, and gate checks so every change is verifiable.',
  }),
  forge_reviewer: Object.freeze({
    title: 'Reviewer',
    responsibility: 'Review policy, safety boundaries, and regression risk.',
  }),
});

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function makeTaskId() {
  return `TASK-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
}

function makeRunId(taskId) {
  return `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 15)}_${taskId}`;
}

function clampPriority(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

function readOptionalString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeBlockedByReason(value) {
  const normalized = readOptionalString(value, '');
  if (!normalized) return '';
  return normalized.replace(/^blocked by:\s*/iu, '').trim();
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => readOptionalString(item, '')).filter(Boolean))];
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [...fallback];
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        return normalizeStringList(JSON.parse(raw), fallback);
      } catch {
        // Fall through to text parsing.
      }
    }
    const separator = raw.includes('\n') ? /\r?\n/u : /,/u;
    return [...new Set(raw.split(separator).map((item) => item.trim()).filter(Boolean))];
  }

  return [...fallback];
}

function safeParseJsonObject(value, fallback = {}) {
  if (typeof value !== 'string' || !value.trim()) return { ...fallback };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return { ...fallback };
  }
  return { ...fallback };
}

function safeParseJsonArray(value, fallback = []) {
  if (typeof value !== 'string' || !value.trim()) return [...fallback];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return [...parsed];
  } catch {
    return [...fallback];
  }
  return [...fallback];
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTextFile(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return result.status === 0 && !result.error;
}

function normalizeScope(rawScope, repoTargets) {
  const explicitScope = readOptionalString(rawScope, '').toLowerCase();
  const hasCrossRepoTargets =
    repoTargets.some((target) => path.resolve(target) === OPENCLAW_WORKSPACE_PATH) || repoTargets.length > 1;

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

function normalizeRepoTarget(rawTarget, repoRoot) {
  const value = readOptionalString(rawTarget, '');
  if (!value) return null;
  if (value === 'socialos') return repoRoot;
  if (value === 'openclaw') return OPENCLAW_WORKSPACE_PATH;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(repoRoot, value);
}

function deriveRepoTargets(input, scope, repoRoot) {
  const providedTargets = normalizeStringList(input.repoTargets)
    .map((target) => normalizeRepoTarget(target, repoRoot))
    .filter(Boolean);

  if (!providedTargets.length) {
    if (scope === 'openclaw') return [OPENCLAW_WORKSPACE_PATH];
    if (scope === 'multi-repo') return [repoRoot, OPENCLAW_WORKSPACE_PATH];
    return [repoRoot];
  }

  const uniqueTargets = [...new Set(providedTargets.map((target) => path.resolve(target)))];
  if (scope === 'socialos') return [repoRoot];
  if (scope === 'openclaw') return [OPENCLAW_WORKSPACE_PATH];
  if (uniqueTargets.length < 2) {
    throw new Error('multi-repo tasks require at least two repoTargets');
  }
  return uniqueTargets;
}

function studioStatusFromQueueMarker(marker, section = '') {
  if (section === 'P2 Blocked') return STUDIO_TASK_STATUS.blocked;
  switch (marker) {
    case 'x':
    case 'X':
      return STUDIO_TASK_STATUS.done;
    case '!':
      return STUDIO_TASK_STATUS.blocked;
    case '-':
      return STUDIO_TASK_STATUS.coding;
    default:
      return STUDIO_TASK_STATUS.queued;
  }
}

function queueMarkerForStudioStatus(status) {
  switch (status) {
    case STUDIO_TASK_STATUS.done:
      return 'x';
    case STUDIO_TASK_STATUS.blocked:
      return '!';
    case STUDIO_TASK_STATUS.planning:
    case STUDIO_TASK_STATUS.coding:
    case STUDIO_TASK_STATUS.testing:
    case STUDIO_TASK_STATUS.review:
      return '-';
    default:
      return ' ';
  }
}

function isTaskActive(status) {
  return [
    STUDIO_TASK_STATUS.planning,
    STUDIO_TASK_STATUS.coding,
    STUDIO_TASK_STATUS.testing,
    STUDIO_TASK_STATUS.review,
  ].includes(status);
}

function isTaskActionable(status) {
  return status === STUDIO_TASK_STATUS.queued || status === STUDIO_TASK_STATUS.draft || isTaskActive(status);
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function normalizeSection(section) {
  return FOUNDY_TO_STUDIO_SECTION[section] || section || 'Studio Ops';
}

function parseLegacyQueue(queueMarkdown) {
  const lines = queueMarkdown.split(/\r?\n/u);
  const tasks = [];
  let currentSection = 'Product Backlog';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^##\s+(.+)$/u);
    if (headingMatch) {
      currentSection = normalizeSection(headingMatch[1].trim());
      continue;
    }

    const taskMatch = line.match(/^\s*-\s+\[([ xX!\-])\]\s+(.+)$/u);
    if (!taskMatch) continue;

    const marker = taskMatch[1];
    const text = taskMatch[2].trim();
    const [taskId, ...rest] = text.split(/\s+/u);
    const title = rest.join(' ').trim() || taskId;
    const details = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      if (/^##\s+/u.test(next) || /^\s*-\s+\[[ xX!\-]\]\s+/u.test(next)) break;
      if (next.trim()) {
        details.push(next.trim().replace(/^-+\s*/u, ''));
      }
      cursor += 1;
    }

    tasks.push({
      taskId,
      title,
      goal: title,
      acceptanceCriteria: details.filter((detail) => !detail.toLowerCase().startsWith('blocked by:')),
      blockedBy: normalizeBlockedByReason(details.find((detail) => detail.toLowerCase().startsWith('blocked by:')) || ''),
      priority: STUDIO_PRIORITY_BY_SECTION[currentSection] || 3,
      section: currentSection,
      status: studioStatusFromQueueMarker(marker, currentSection),
      marker,
      line: index + 1,
    });
  }

  return tasks;
}

function formatDigest(run) {
  return [
    `Run: ${run.runId}`,
    `What: ${run.summary || 'n/a'}`,
    `Why: ${run.why || run.summary || 'n/a'}`,
    `Risk: ${run.risk || 'low'}`,
    `Verify: ${run.verify || 'n/a'}`,
    `Next: ${run.next || 'n/a'}`,
  ].join('\n');
}

function studioRunStatus(result) {
  return result?.ok ? 'success' : 'blocked';
}

function hydrateTask(row) {
  if (!row) return null;
  return {
    taskId: row.id,
    title: row.title,
    goal: row.goal,
    scope: row.scope,
    repoTargets: safeParseJsonArray(row.repo_targets),
    acceptanceCriteria: safeParseJsonArray(row.acceptance_criteria),
    constraints: safeParseJsonArray(row.constraints),
    preferredTests: safeParseJsonArray(row.preferred_tests),
    status: row.status,
    priority: row.priority,
    source: row.source,
    metadata: safeParseJsonObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateRun(row) {
  if (!row) return null;
  return {
    runId: row.id,
    taskId: row.task_id,
    pipeline: row.pipeline,
    status: row.status,
    summary: row.summary,
    why: row.why,
    risk: row.risk,
    verify: row.verify,
    next: row.next,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    metadata: safeParseJsonObject(row.metadata),
  };
}

function hydrateRunStep(row) {
  return {
    stepId: row.id,
    runId: row.run_id,
    stepName: row.step_name,
    lane: row.lane,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    output: row.output,
    error: row.error,
  };
}

function hydrateAgent(row) {
  return {
    agentId: row.id,
    name: row.name,
    roleTitle: row.role_title,
    responsibility: row.responsibility,
    model: row.model,
    workspace: row.workspace,
    toolProfile: row.tool_profile,
    healthStatus: row.health_status,
    lastSeenAt: row.last_seen_at,
    capabilities: safeParseJsonArray(row.capabilities),
    metadata: safeParseJsonObject(row.metadata),
  };
}

function buildTaskRecord(input, repoRoot) {
  const title = readOptionalString(input.title || input.taskText || input.text || input.goal, '');
  if (!title) throw new Error('title or taskText is required');

  const scopeHint = normalizeStringList(input.repoTargets)
    .map((target) => normalizeRepoTarget(target, repoRoot))
    .filter(Boolean);
  const scope = normalizeScope(input.scope, scopeHint);
  const repoTargets = deriveRepoTargets(input, scope, repoRoot);
  const acceptanceCriteria = normalizeStringList(input.acceptanceCriteria);
  const constraints = [...new Set([...normalizeStringList(input.constraints), DEFAULT_DRY_RUN_CONSTRAINT])];
  const preferredTests = normalizeStringList(input.preferredTests, DEFAULT_PREFERRED_TESTS);
  const createdAt = readOptionalString(input.createdAt, nowIso());
  const status = readOptionalString(input.status, STUDIO_TASK_STATUS.queued);

  return {
    taskId: readOptionalString(input.taskId, makeTaskId()),
    title,
    goal: readOptionalString(input.goal, title),
    scope,
    repoTargets,
    acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : [DEFAULT_ACCEPTANCE_CRITERION],
    constraints,
    preferredTests: preferredTests.length ? preferredTests : [...DEFAULT_PREFERRED_TESTS],
    status,
    priority: clampPriority(input.priority, 3),
    source: readOptionalString(input.source, 'studio.manual'),
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
    createdAt,
    updatedAt: readOptionalString(input.updatedAt, createdAt),
  };
}

export function createStudioControlPlane({ db, repoRoot, dbPath, env = process.env }) {
  const paths = {
    repoRoot,
    dbPath,
    queuePath: path.join(repoRoot, 'QUEUE.md'),
    runsDir: path.join(repoRoot, 'reports/runs'),
    latestDigestPath: path.join(repoRoot, 'reports/LATEST.md'),
    foundryConfigPath: path.join(repoRoot, 'foundry/openclaw.foundry.json5'),
    foundryTasksDir: path.join(repoRoot, 'foundry/tasks'),
    foundryStateDir: path.join(repoRoot, '.foundry'),
    llmTaskHealthPath: path.join(repoRoot, '.foundry/llm_task_health.json'),
    publishModePath: path.join(repoRoot, '.foundry/PUBLISH_MODE'),
    pauseFlagPath: path.join(repoRoot, '.foundry/PAUSED'),
    genericTaskScriptPath: path.join(repoRoot, 'scripts/foundry_generic_task.mjs'),
  };

  const exportEnabled = Boolean(dbPath && isPathInside(repoRoot, dbPath));
  const mockExecutionEnabled = ['1', 'true', 'yes', 'on'].includes(
    readOptionalString(env.SOCIALOS_FOUNDRY_MOCK, '').toLowerCase()
  );

  const statements = {
    selectSetting: db.prepare('SELECT key, value, updated_at FROM StudioSetting WHERE key = ? LIMIT 1'),
    upsertSetting: db.prepare(`
      INSERT INTO StudioSetting(key, value, updated_at) VALUES(?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),
    listSettings: db.prepare('SELECT key, value, updated_at FROM StudioSetting ORDER BY key ASC'),
    upsertTask: db.prepare(`
      INSERT INTO StudioTask(
        id,
        title,
        goal,
        scope,
        repo_targets,
        acceptance_criteria,
        constraints,
        preferred_tests,
        status,
        priority,
        source,
        metadata,
        created_at,
        updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        goal = excluded.goal,
        scope = excluded.scope,
        repo_targets = excluded.repo_targets,
        acceptance_criteria = excluded.acceptance_criteria,
        constraints = excluded.constraints,
        preferred_tests = excluded.preferred_tests,
        status = excluded.status,
        priority = excluded.priority,
        source = excluded.source,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `),
    selectTask: db.prepare('SELECT * FROM StudioTask WHERE id = ? LIMIT 1'),
    listTasksBase: db.prepare(`
      SELECT *
      FROM StudioTask
      ORDER BY
        CASE status
          WHEN 'planning' THEN 1
          WHEN 'coding' THEN 2
          WHEN 'testing' THEN 3
          WHEN 'review' THEN 4
          WHEN 'queued' THEN 5
          WHEN 'draft' THEN 6
          WHEN 'blocked' THEN 7
          WHEN 'done' THEN 8
          ELSE 9
        END,
        priority ASC,
        updated_at DESC
    `),
    listTasksByStatus: db.prepare(`
      SELECT *
      FROM StudioTask
      WHERE status = ?
      ORDER BY priority ASC, updated_at DESC
      LIMIT ?
    `),
    countTasksByStatus: db.prepare('SELECT COUNT(*) AS count FROM StudioTask WHERE status = ?'),
    upsertRun: db.prepare(`
      INSERT INTO StudioRun(
        id,
        task_id,
        pipeline,
        status,
        summary,
        why,
        risk,
        verify,
        next,
        started_at,
        finished_at,
        duration_ms,
        metadata
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        pipeline = excluded.pipeline,
        status = excluded.status,
        summary = excluded.summary,
        why = excluded.why,
        risk = excluded.risk,
        verify = excluded.verify,
        next = excluded.next,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        duration_ms = excluded.duration_ms,
        metadata = excluded.metadata
    `),
    selectRun: db.prepare('SELECT * FROM StudioRun WHERE id = ? LIMIT 1'),
    listRuns: db.prepare('SELECT * FROM StudioRun ORDER BY started_at DESC LIMIT ?'),
    listRunsByTask: db.prepare('SELECT * FROM StudioRun WHERE task_id = ? ORDER BY started_at DESC LIMIT ?'),
    insertRunStep: db.prepare(`
      INSERT INTO StudioRunStep(id, run_id, step_name, lane, status, started_at, finished_at, output, error)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteRunStepsByRun: db.prepare('DELETE FROM StudioRunStep WHERE run_id = ?'),
    listRunStepsByRun: db.prepare(`
      SELECT *
      FROM StudioRunStep
      WHERE run_id = ?
      ORDER BY started_at ASC, step_name ASC
    `),
    upsertAgent: db.prepare(`
      INSERT INTO StudioAgentState(
        id,
        name,
        role_title,
        responsibility,
        model,
        workspace,
        tool_profile,
        health_status,
        last_seen_at,
        capabilities,
        metadata
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        role_title = excluded.role_title,
        responsibility = excluded.responsibility,
        model = excluded.model,
        workspace = excluded.workspace,
        tool_profile = excluded.tool_profile,
        health_status = excluded.health_status,
        last_seen_at = excluded.last_seen_at,
        capabilities = excluded.capabilities,
        metadata = excluded.metadata
    `),
    listAgents: db.prepare('SELECT * FROM StudioAgentState ORDER BY name ASC'),
    upsertArtifact: db.prepare(`
      INSERT INTO StudioArtifact(id, run_id, task_id, kind, path, content_type, label, created_at, metadata)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        run_id = excluded.run_id,
        task_id = excluded.task_id,
        kind = excluded.kind,
        path = excluded.path,
        content_type = excluded.content_type,
        label = excluded.label,
        metadata = excluded.metadata
    `),
    listArtifactsByRun: db.prepare('SELECT * FROM StudioArtifact WHERE run_id = ? ORDER BY created_at ASC'),
    upsertDigest: db.prepare(`
      INSERT INTO DevDigest(id, run_id, what, why, risk, verify, next, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        what = excluded.what,
        why = excluded.why,
        risk = excluded.risk,
        verify = excluded.verify,
        next = excluded.next,
        created_at = excluded.created_at
    `),
  };

  function setSetting(key, value) {
    statements.upsertSetting.run(key, String(value), nowIso());
  }

  function getSetting(key, fallback = '') {
    const row = statements.selectSetting.get(key);
    return row ? row.value : fallback;
  }

  function listSettingsMap() {
    return Object.fromEntries(statements.listSettings.all().map((row) => [row.key, row.value]));
  }

  function refreshAgentStates() {
    const config = readJsonFile(paths.foundryConfigPath, {});
    const llmTaskHealth = readJsonFile(paths.llmTaskHealthPath, {
      status: 'unknown',
      checkedAt: null,
      summary: 'No llm-task probe has been recorded yet.',
    });
    setSetting('studio.llmTaskHealth', JSON.stringify(llmTaskHealth));

    const agents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
    const checkedAt = readOptionalString(llmTaskHealth.checkedAt, nowIso());
    const healthStatus =
      llmTaskHealth.status === 'ok' || llmTaskHealth.status === 'mock'
        ? 'ready'
        : llmTaskHealth.status === 'unknown'
          ? 'unknown'
          : 'degraded';

    for (const agent of agents) {
      const responsibility = AGENT_RESPONSIBILITIES[agent.id] || {
        title: agent.name || agent.id,
        responsibility: 'custom lane',
      };
      statements.upsertAgent.run(
        agent.id,
        readOptionalString(agent.name, agent.id),
        responsibility.title,
        responsibility.responsibility,
        readOptionalString(agent.model, 'unknown'),
        readOptionalString(agent.workspace, ''),
        readOptionalString(agent.tools?.profile, 'unknown'),
        healthStatus,
        checkedAt,
        JSON.stringify(Array.isArray(agent.tools?.alsoAllow) ? agent.tools.alsoAllow : []),
        JSON.stringify({
          llmTaskHealth,
          exec: agent.tools?.exec || {},
          deny: Array.isArray(agent.tools?.deny) ? agent.tools.deny : [],
        })
      );
    }
  }

  function importLegacyQueue() {
    const queueMarkdown = readTextFile(paths.queuePath, '');
    if (!queueMarkdown.trim()) return;

    for (const legacyTask of parseLegacyQueue(queueMarkdown)) {
      const now = nowIso();
      const existing = statements.selectTask.get(legacyTask.taskId);
      const metadata = {
        ...(existing ? safeParseJsonObject(existing.metadata) : {}),
        section: legacyTask.section,
        legacyLine: legacyTask.line,
        queueMarker: legacyTask.marker,
        blockedBy: legacyTask.blockedBy,
      };
      statements.upsertTask.run(
        legacyTask.taskId,
        legacyTask.title,
        legacyTask.goal,
        'socialos',
        JSON.stringify([repoRoot]),
        JSON.stringify(
          legacyTask.acceptanceCriteria.length ? legacyTask.acceptanceCriteria : [DEFAULT_ACCEPTANCE_CRITERION]
        ),
        JSON.stringify(
          legacyTask.blockedBy
            ? [DEFAULT_DRY_RUN_CONSTRAINT, legacyTask.blockedBy]
            : [DEFAULT_DRY_RUN_CONSTRAINT]
        ),
        JSON.stringify(DEFAULT_PREFERRED_TESTS),
        legacyTask.status,
        legacyTask.priority,
        'legacy.queue',
        JSON.stringify(metadata),
        existing?.created_at || now,
        now
      );
    }
  }

  function importLegacyFoundryTasks() {
    let entries = [];
    try {
      entries = fs.readdirSync(paths.foundryTasksDir).filter((name) => name.endsWith('.json'));
    } catch {
      return;
    }

    for (const entry of entries) {
      const payload = readJsonFile(path.join(paths.foundryTasksDir, entry), null);
      if (!payload || typeof payload !== 'object') continue;

      const record = buildTaskRecord(
        {
          taskId: payload.taskId,
          title: payload.title,
          goal: payload.goal,
          scope: payload.scope,
          repoTargets: payload.repoTargets,
          acceptanceCriteria: payload.acceptanceCriteria,
          constraints: payload.constraints,
          preferredTests: payload.preferredTests,
          status:
            payload.status === 'done'
              ? STUDIO_TASK_STATUS.done
              : payload.status === 'blocked'
                ? STUDIO_TASK_STATUS.blocked
                : payload.status === 'in_progress'
                  ? STUDIO_TASK_STATUS.coding
                  : STUDIO_TASK_STATUS.queued,
          source: 'legacy.foundry.task',
          metadata: {
            intakeMode: payload.intakeMode || 'quick',
            autonomyMode: payload.autonomyMode || 'direct-execute',
            filePath: payload.filePath || path.join(paths.foundryTasksDir, entry),
            execution: payload.execution || null,
            section: 'Studio Ops',
          },
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
        },
        repoRoot
      );

      statements.upsertTask.run(
        record.taskId,
        record.title,
        record.goal,
        record.scope,
        JSON.stringify(record.repoTargets),
        JSON.stringify(record.acceptanceCriteria),
        JSON.stringify(record.constraints),
        JSON.stringify(record.preferredTests),
        record.status,
        record.priority,
        record.source,
        JSON.stringify(record.metadata),
        record.createdAt,
        record.updatedAt
      );
    }
  }

  function importLegacyRuns() {
    let entries = [];
    try {
      entries = fs
        .readdirSync(paths.runsDir)
        .filter((name) => name.endsWith('.json') && !name.endsWith('.planspec.json'))
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return;
    }

    for (const entry of entries) {
      const filePath = path.join(paths.runsDir, entry);
      const payload = readJsonFile(filePath, null);
      if (!payload || typeof payload !== 'object' || !readOptionalString(payload.runId, '')) continue;

      statements.upsertRun.run(
        payload.runId,
        readOptionalString(payload.taskId, ''),
        'legacy-devloop',
        readOptionalString(payload.status, 'unknown'),
        readOptionalString(payload.summary, ''),
        readOptionalString(payload.why, ''),
        readOptionalString(payload.risk, 'low'),
        readOptionalString(payload.verify, ''),
        readOptionalString(payload.next, ''),
        readOptionalString(payload.startedAt, nowIso()),
        readOptionalString(payload.finishedAt, payload.startedAt || nowIso()),
        Number(payload.durationMs) || 0,
        JSON.stringify({ legacyFile: filePath, stages: payload.stages || {} })
      );

      statements.deleteRunStepsByRun.run(payload.runId);
      for (const [stepName, status] of Object.entries(payload.stages || {})) {
        statements.insertRunStep.run(
          makeId('studio_step'),
          payload.runId,
          stepName,
          stepName,
          readOptionalString(status, 'unknown'),
          readOptionalString(payload.startedAt, nowIso()),
          readOptionalString(payload.finishedAt, payload.startedAt || nowIso()),
          '',
          ''
        );
      }

      const mdPath = filePath.replace(/\.json$/u, '.md');
      const planPath = filePath.replace(/\.json$/u, '.planspec.json');
      if (fs.existsSync(mdPath)) {
        statements.upsertArtifact.run(
          `${payload.runId}:legacy-md`,
          payload.runId,
          readOptionalString(payload.taskId, ''),
          'report-markdown',
          mdPath,
          'text/markdown',
          path.basename(mdPath),
          readOptionalString(payload.finishedAt, payload.startedAt || nowIso()),
          JSON.stringify({})
        );
      }
      if (fs.existsSync(planPath)) {
        statements.upsertArtifact.run(
          `${payload.runId}:legacy-plan`,
          payload.runId,
          readOptionalString(payload.taskId, ''),
          'plan-spec',
          planPath,
          'application/json',
          path.basename(planPath),
          readOptionalString(payload.finishedAt, payload.startedAt || nowIso()),
          JSON.stringify({})
        );
      }
    }
  }

  function bootstrapIfNeeded() {
    if (getSetting('studio.bootstrapped', '') === 'true') {
      refreshAgentStates();
      return;
    }

    const publishMode = readOptionalString(readTextFile(paths.publishModePath, ''), '').toLowerCase() === 'live'
      ? 'live'
      : 'dry-run';
    const loopMode = fs.existsSync(paths.pauseFlagPath) ? 'paused' : 'active';
    const embeddingsProvider = env.OPENAI_API_KEY ? 'auto' : 'local';

    importLegacyQueue();
    importLegacyFoundryTasks();
    importLegacyRuns();

    setSetting('studio.publishMode', publishMode);
    setSetting('studio.loopMode', loopMode);
    setSetting('studio.embeddingsProvider', embeddingsProvider);
    setSetting('studio.executionPolicy', 'multi-agent');
    setSetting('studio.notificationPolicy', 'digest');
    setSetting('studio.bootstrapped', 'true');
    setSetting('studio.importedAt', nowIso());
    refreshAgentStates();
  }

  function listTasks(options = {}) {
    const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 20;
    const statusFilter = readOptionalString(options.status, '');
    const rows = statusFilter
      ? statements.listTasksByStatus.all(statusFilter, limit)
      : statements.listTasksBase.all().slice(0, limit);
    return rows.map(hydrateTask);
  }

  function getTask(taskId) {
    return hydrateTask(statements.selectTask.get(taskId));
  }

  function insertOrUpdateTask(record) {
    statements.upsertTask.run(
      record.taskId,
      record.title,
      record.goal,
      record.scope,
      JSON.stringify(record.repoTargets),
      JSON.stringify(record.acceptanceCriteria),
      JSON.stringify(record.constraints),
      JSON.stringify(record.preferredTests),
      record.status,
      clampPriority(record.priority, 3),
      record.source,
      JSON.stringify(record.metadata || {}),
      record.createdAt,
      record.updatedAt
    );
  }

  function createTask(input = {}) {
    const record = buildTaskRecord(
      {
        ...input,
        metadata: {
          section: normalizeSection(readOptionalString(input.section, 'Studio Ops')),
          intakeMode:
            normalizeStringList(input.acceptanceCriteria).length ||
            normalizeStringList(input.constraints).length ||
            normalizeStringList(input.preferredTests).length
              ? 'structured'
              : 'quick',
          ...(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}),
        },
      },
      repoRoot
    );
    insertOrUpdateTask(record);
    exportEvidence();
    return getTask(record.taskId);
  }

  function updateTask(taskId, patch = {}) {
    const existing = getTask(taskId);
    if (!existing) {
      throw new Error(`task ${taskId} not found`);
    }

    const next = {
      ...existing,
      title: readOptionalString(patch.title, existing.title),
      goal: readOptionalString(patch.goal, existing.goal),
      scope: readOptionalString(patch.scope, existing.scope),
      repoTargets: normalizeStringList(patch.repoTargets, existing.repoTargets),
      acceptanceCriteria: normalizeStringList(patch.acceptanceCriteria, existing.acceptanceCriteria),
      constraints: normalizeStringList(patch.constraints, existing.constraints),
      preferredTests: normalizeStringList(patch.preferredTests, existing.preferredTests),
      status: readOptionalString(patch.status, existing.status),
      priority: clampPriority(patch.priority, existing.priority),
      source: readOptionalString(patch.source, existing.source),
      metadata: {
        ...(existing.metadata || {}),
        ...(patch.metadata && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata) ? patch.metadata : {}),
      },
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };

    if (!next.repoTargets.length) next.repoTargets = [repoRoot];
    if (!next.acceptanceCriteria.length) next.acceptanceCriteria = [DEFAULT_ACCEPTANCE_CRITERION];
    if (!next.constraints.length) next.constraints = [DEFAULT_DRY_RUN_CONSTRAINT];
    if (!next.preferredTests.length) next.preferredTests = [...DEFAULT_PREFERRED_TESTS];

    insertOrUpdateTask(next);
    exportEvidence();
    return getTask(taskId);
  }

  function getRuns(limit = 10) {
    return statements.listRuns.all(limit).map(hydrateRun);
  }

  function getRun(runId) {
    const run = hydrateRun(statements.selectRun.get(runId));
    if (!run) return null;
    return {
      ...run,
      steps: statements.listRunStepsByRun.all(runId).map(hydrateRunStep),
      artifacts: statements.listArtifactsByRun.all(runId).map((row) => ({
        artifactId: row.id,
        runId: row.run_id,
        taskId: row.task_id,
        kind: row.kind,
        path: row.path,
        contentType: row.content_type,
        label: row.label,
        createdAt: row.created_at,
        metadata: safeParseJsonObject(row.metadata),
      })),
      task: run.taskId ? getTask(run.taskId) : null,
    };
  }

  function getAgents() {
    refreshAgentStates();
    return statements.listAgents.all().map(hydrateAgent);
  }

  function getLlmTaskHealth() {
    return safeParseJsonObject(getSetting('studio.llmTaskHealth', '{}'), {
      status: 'unknown',
      checkedAt: null,
      summary: 'No llm-task probe has been recorded yet.',
    });
  }

  function getSettingsPayload() {
    return {
      publishMode: getSetting('studio.publishMode', 'dry-run'),
      loopMode: getSetting('studio.loopMode', 'active'),
      embeddingsProvider: getSetting('studio.embeddingsProvider', env.OPENAI_API_KEY ? 'auto' : 'local'),
      executionPolicy: getSetting('studio.executionPolicy', 'multi-agent'),
      notificationPolicy: getSetting('studio.notificationPolicy', 'digest'),
      importedAt: getSetting('studio.importedAt', ''),
      exportsEnabled: exportEnabled,
      liveEnvironmentEnabled:
        getSetting('studio.publishMode', 'dry-run') === 'live' ||
        ['1', 'true', 'yes', 'on'].includes(readOptionalString(env.SOCIALOS_ENABLE_LIVE_PUBLISH, '').toLowerCase()),
      safetyGates: {
        loopbackOnly: true,
        dbBackedControlPlane: true,
        dryRunDefault: getSetting('studio.publishMode', 'dry-run') === 'dry-run',
      },
    };
  }

  function patchSettings(patch = {}) {
    const current = getSettingsPayload();
    const next = {
      publishMode:
        readOptionalString(patch.publishMode, current.publishMode).toLowerCase() === 'live' ? 'live' : 'dry-run',
      loopMode:
        readOptionalString(patch.loopMode, current.loopMode).toLowerCase() === 'paused' ? 'paused' : 'active',
      embeddingsProvider: readOptionalString(patch.embeddingsProvider, current.embeddingsProvider),
      executionPolicy: readOptionalString(patch.executionPolicy, current.executionPolicy),
      notificationPolicy: readOptionalString(patch.notificationPolicy, current.notificationPolicy),
    };

    setSetting('studio.publishMode', next.publishMode);
    setSetting('studio.loopMode', next.loopMode);
    setSetting('studio.embeddingsProvider', next.embeddingsProvider);
    setSetting('studio.executionPolicy', next.executionPolicy);
    setSetting('studio.notificationPolicy', next.notificationPolicy);
    exportEvidence();
    return getSettingsPayload();
  }

  function buildQueueSummaryFromTasks(tasks) {
    const queue = {
      pending: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      currentTask: null,
    };

    for (const task of tasks) {
      if (task.status === STUDIO_TASK_STATUS.queued || task.status === STUDIO_TASK_STATUS.draft) {
        queue.pending += 1;
        if (!queue.currentTask) queue.currentTask = task.title || task.taskId;
      } else if (isTaskActive(task.status)) {
        queue.inProgress += 1;
        if (!queue.currentTask) queue.currentTask = task.title || task.taskId;
      } else if (task.status === STUDIO_TASK_STATUS.blocked) {
        queue.blocked += 1;
      } else if (task.status === STUDIO_TASK_STATUS.done) {
        queue.done += 1;
      }
    }

    return queue;
  }

  function countConsecutiveFailures(runs) {
    let count = 0;
    for (const run of runs) {
      const status = readOptionalString(run.status, 'unknown').toLowerCase();
      if (status === 'success' || status === 'noop') break;
      count += 1;
    }
    return count;
  }

  function parseLockMeta() {
    const metaPath = path.join(repoRoot, '.locks/devloop.lock/meta.env');
    const raw = readTextFile(metaPath, '');
    if (!raw.trim()) {
      return {
        present: fs.existsSync(path.join(repoRoot, '.locks/devloop.lock')),
        ownerPid: null,
        ownerAlive: false,
        heartbeatAgeSec: null,
        runId: null,
        startedAt: null,
      };
    }

    const map = new Map();
    for (const line of raw.split(/\r?\n/u)) {
      const index = line.indexOf('=');
      if (index <= 0) continue;
      map.set(line.slice(0, index), line.slice(index + 1));
    }

    const ownerPid = Number(map.get('pid'));
    const heartbeatEpoch = Number(map.get('heartbeat_epoch'));
    let ownerAlive = false;
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
        ownerAlive = true;
      } catch {
        ownerAlive = false;
      }
    }

    return {
      present: true,
      ownerPid: Number.isInteger(ownerPid) && ownerPid > 0 ? ownerPid : null,
      ownerAlive,
      heartbeatAgeSec:
        Number.isInteger(heartbeatEpoch) && heartbeatEpoch > 0
          ? Math.max(0, Math.floor(Date.now() / 1000) - heartbeatEpoch)
          : null,
      runId: map.get('run_id') || null,
      startedAt: map.get('started_at') || null,
    };
  }

  function getStatus() {
    const tasks = listTasks({ limit: 400 });
    const runs = getRuns(30);
    const latestRun = runs[0] || null;
    return {
      mode: getSetting('studio.loopMode', 'active') === 'paused' ? 'PAUSED' : 'ACTIVE',
      publishMode: getSetting('studio.publishMode', 'dry-run'),
      lock: parseLockMeta(),
      queue: buildQueueSummaryFromTasks(tasks),
      health: {
        consecutiveFailures: countConsecutiveFailures(runs),
        latestRunDurationMs: latestRun?.durationMs || null,
      },
      latestRun,
      blockedHead: tasks
        .filter((task) => task.status === STUDIO_TASK_STATUS.blocked)
        .slice(0, 5)
        .map((task, index) => ({
          line: index + 1,
          task: `${task.taskId} ${task.title}`.trim(),
          blockedBy: normalizeBlockedByReason(task.metadata?.blockedBy),
        })),
      latestDigest: latestRun ? formatDigest(latestRun) : '',
    };
  }

  function getClusterSummary() {
    const agents = getAgents();
    const runs = getRuns(20);
    const lastTaskRun = runs.find((run) => readOptionalString(run.taskId, '').startsWith('TASK-')) || runs[0] || null;
    return {
      enabled: agents.length > 0,
      controlPlane: 'Studio',
      configPath: paths.foundryConfigPath,
      taskDirectory: paths.foundryTasksDir,
      genericTaskExecutionEnabled: fs.existsSync(paths.genericTaskScriptPath),
      llmTaskHealth: getLlmTaskHealth(),
      supportedScopes: [...SUPPORTED_TASK_SCOPES],
      lastGenericTaskRun: lastTaskRun,
      defaultAutonomyMode: 'studio-control-plane',
      agents: agents.map((agent) => ({
        id: agent.agentId,
        name: agent.name,
        model: agent.model,
        workspace: agent.workspace,
        toolProfile: agent.toolProfile,
        roleTitle: agent.roleTitle,
        responsibility: agent.responsibility,
        healthStatus: agent.healthStatus,
      })),
    };
  }

  function buildBootstrap() {
    const status = getStatus();
    const settings = getSettingsPayload();
    const tasks = listTasks({ limit: 8 });
    const runs = getRuns(8);
    const agents = getAgents();
    const blockedTasks = tasks.filter((task) => task.status === STUDIO_TASK_STATUS.blocked).slice(0, 5);
    const recommendedActions = [];

    if (settings.loopMode === 'paused') {
      recommendedActions.push({
        title: 'Resume Studio loop',
        description: 'The control plane is paused, so queued tasks will not advance until you resume it.',
        command: 'resume',
        tone: 'warn',
      });
    }
    if (blockedTasks[0]) {
      recommendedActions.push({
        title: `Unblock ${blockedTasks[0].taskId}`,
        description: blockedTasks[0].title,
        href: `/studio?panel=tasks`,
        tone: 'warn',
      });
    }
    if (tasks.some((task) => task.status === STUDIO_TASK_STATUS.queued)) {
      recommendedActions.push({
        title: 'Run next Studio task',
        description: 'The queue has pending work that can be picked up by the multi-agent pipeline.',
        command: 'run-once',
        tone: 'accent',
      });
    }
    if (!runs.length) {
      recommendedActions.push({
        title: 'Seed your first Studio run',
        description: 'Create a task and run it once so Studio can start exporting evidence.',
        href: `/studio?panel=tasks`,
        tone: 'soft',
      });
    }

    return {
      generatedAt: nowIso(),
      status,
      settings,
      agents,
      latestRun: runs[0] || null,
      recentRuns: runs,
      recentTasks: tasks,
      blockedTasks,
      counts: {
        tasks: tasks.length,
        agents: agents.length,
        blocked: status.queue.blocked,
        queued: status.queue.pending,
        active: status.queue.inProgress,
        done: status.queue.done,
      },
      recommendedActions,
      summaryText: [
        status.mode === 'PAUSED' ? 'Studio loop is paused.' : 'Studio loop is active.',
        `${status.queue.pending} queued task${status.queue.pending === 1 ? '' : 's'}.`,
        `${status.queue.blocked} blocked task${status.queue.blocked === 1 ? '' : 's'}.`,
        settings.publishMode === 'dry-run' ? 'Publish posture is dry-run safe.' : 'Publish posture is live-gated.',
      ].join(' '),
    };
  }

  function exportTaskEvidence(task) {
    if (!exportEnabled) return;
    const metadata = task.metadata || {};
    writeJsonFile(path.join(paths.foundryTasksDir, `${task.taskId}.json`), {
      version: 1,
      taskId: task.taskId,
      title: task.title,
      goal: task.goal,
      acceptanceCriteria: task.acceptanceCriteria,
      constraints: task.constraints,
      scope: task.scope,
      repoTargets: task.repoTargets,
      preferredTests: task.preferredTests,
      intakeMode: readOptionalString(metadata.intakeMode, 'quick'),
      autonomyMode: readOptionalString(metadata.autonomyMode, 'studio-control-plane'),
      status:
        task.status === STUDIO_TASK_STATUS.done
          ? 'done'
          : task.status === STUDIO_TASK_STATUS.blocked
            ? 'blocked'
            : isTaskActive(task.status)
              ? 'in_progress'
              : 'pending',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      filePath: path.join(paths.foundryTasksDir, `${task.taskId}.json`),
      queue: {
        section: readOptionalString(metadata.section, 'Studio Ops'),
        marker: queueMarkerForStudioStatus(task.status),
      },
      execution: metadata.execution || null,
    });
  }

  function exportQueueEvidence() {
    if (!exportEnabled) return;
    const tasks = listTasks({ limit: 500 });
    const grouped = new Map(STUDIO_SECTION_ORDER.map((section) => [section, []]));

    for (const task of tasks) {
      const section = normalizeSection(readOptionalString(task.metadata?.section, 'Studio Ops'));
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section).push(task);
    }

    const lines = [
      '# SocialOS Studio Queue',
      '',
      '> Generated evidence from the Studio SQLite control plane. Do not use this file as the runtime source of truth.',
      '',
      'Legend:',
      '- `[ ]` queued',
      '- `[-]` active',
      '- `[x]` done',
      '- `[!]` blocked',
      '',
    ];

    for (const section of [...STUDIO_SECTION_ORDER, ...[...grouped.keys()].filter((value) => !STUDIO_SECTION_ORDER.includes(value))]) {
      const sectionTasks = grouped.get(section) || [];
      if (!sectionTasks.length) continue;
      lines.push(`## ${section}`);
      for (const task of sectionTasks) {
        lines.push(`- [${queueMarkerForStudioStatus(task.status)}] ${task.taskId} ${task.title}`.trim());
        const blockedBy = normalizeBlockedByReason(task.metadata?.blockedBy);
        if (task.status === STUDIO_TASK_STATUS.blocked && blockedBy) {
          lines.push(`  - blocked by: ${blockedBy}`);
        }
      }
      lines.push('');
    }

    fs.mkdirSync(path.dirname(paths.queuePath), { recursive: true });
    fs.writeFileSync(paths.queuePath, `${lines.join('\n').replace(/\n+$/u, '\n')}`, 'utf8');
  }

  function exportRunEvidence(runId) {
    if (!exportEnabled) return;
    const run = getRun(runId);
    if (!run) return;

    fs.mkdirSync(paths.runsDir, { recursive: true });
    const jsonPath = path.join(paths.runsDir, `${run.runId}.json`);
    const mdPath = path.join(paths.runsDir, `${run.runId}.md`);
    const planPath = path.join(paths.runsDir, `${run.runId}.planspec.json`);

    const stageMap = Object.fromEntries(
      (run.steps || []).map((step) => [step.stepName, step.status])
    );
    writeJsonFile(jsonPath, {
      runId: run.runId,
      taskId: run.taskId,
      status: run.status,
      summary: run.summary,
      why: run.why,
      risk: run.risk,
      verify: run.verify,
      next: run.next,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      stages: stageMap,
    });

    const mdLines = [
      '# Studio Run Report',
      '',
      `- run_id: ${run.runId}`,
      `- task: ${run.taskId || 'n/a'}`,
      `- status: ${run.status}`,
      `- summary: ${run.summary || 'n/a'}`,
      `- why: ${run.why || 'n/a'}`,
      `- risk: ${run.risk || 'low'}`,
      `- verify: ${run.verify || 'n/a'}`,
      `- next: ${run.next || 'n/a'}`,
      `- started_at: ${run.startedAt || 'n/a'}`,
      `- finished_at: ${run.finishedAt || 'n/a'}`,
      `- duration_ms: ${Number(run.durationMs) || 0}`,
      '',
      '## Steps',
    ];
    for (const step of run.steps || []) {
      mdLines.push(`- ${step.stepName}: ${step.status}`);
    }
    fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`, 'utf8');

    const planArtifact = (run.artifacts || []).find((artifact) => artifact.kind === 'plan-spec');
    const planPayload = planArtifact?.metadata?.planSpec || run.metadata?.planSpec || {
      summary: run.summary || '',
      commands: run.task?.preferredTests || DEFAULT_PREFERRED_TESTS,
      tests: run.task?.preferredTests || DEFAULT_PREFERRED_TESTS,
    };
    writeJsonFile(planPath, planPayload);

    statements.upsertArtifact.run(
      `${run.runId}:report-json`,
      run.runId,
      run.taskId || '',
      'report-json',
      jsonPath,
      'application/json',
      path.basename(jsonPath),
      run.finishedAt || run.startedAt || nowIso(),
      JSON.stringify({})
    );
    statements.upsertArtifact.run(
      `${run.runId}:report-markdown`,
      run.runId,
      run.taskId || '',
      'report-markdown',
      mdPath,
      'text/markdown',
      path.basename(mdPath),
      run.finishedAt || run.startedAt || nowIso(),
      JSON.stringify({})
    );
    statements.upsertArtifact.run(
      `${run.runId}:plan-spec`,
      run.runId,
      run.taskId || '',
      'plan-spec',
      planPath,
      'application/json',
      path.basename(planPath),
      run.finishedAt || run.startedAt || nowIso(),
      JSON.stringify({ planSpec: planPayload })
    );
  }

  function exportLatestDigest() {
    if (!exportEnabled) return;
    const latestRun = getRuns(1)[0];
    if (!latestRun) return;
    fs.mkdirSync(path.dirname(paths.latestDigestPath), { recursive: true });
    fs.writeFileSync(paths.latestDigestPath, `${formatDigest(latestRun)}\n`, 'utf8');
  }

  function exportSettingsEvidence() {
    if (!exportEnabled) return;
    const settings = getSettingsPayload();
    fs.mkdirSync(paths.foundryStateDir, { recursive: true });
    fs.writeFileSync(paths.publishModePath, `${settings.publishMode}\n`, 'utf8');
    if (settings.loopMode === 'paused') {
      fs.writeFileSync(paths.pauseFlagPath, 'paused\n', 'utf8');
    } else if (fs.existsSync(paths.pauseFlagPath)) {
      fs.rmSync(paths.pauseFlagPath, { force: true });
    }
  }

  function exportEvidence() {
    if (!exportEnabled) return;
    exportQueueEvidence();
    for (const task of listTasks({ limit: 500 })) {
      exportTaskEvidence(task);
    }
    for (const run of getRuns(60)) {
      exportRunEvidence(run.runId);
    }
    exportLatestDigest();
    exportSettingsEvidence();
  }

  function writeStudioRun(result, task, startedAt, finishedAt, planSpec) {
    const runId = makeRunId(task.taskId);
    const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
    statements.upsertRun.run(
      runId,
      task.taskId,
      'studio-multi-agent',
      studioRunStatus(result),
      readOptionalString(result.summary, ''),
      readOptionalString(result.summary, ''),
      result.ok ? 'low' : 'medium',
      readOptionalString(result.verify, ''),
      readOptionalString(result.next, result.ok ? 'continue with the next queued Studio task' : 'review blocked task'),
      startedAt,
      finishedAt,
      durationMs,
      JSON.stringify({
        rawResult: result,
        planSpec,
      })
    );

    statements.deleteRunStepsByRun.run(runId);
    const stepDefinitions = [
      { stepName: 'planning', lane: 'forge_orchestrator', status: planSpec ? 'pass' : 'pending', output: JSON.stringify(planSpec || {}) },
      { stepName: 'coding', lane: 'forge_coder', status: readOptionalString(result.coder?.status, result.ok ? 'pass' : 'blocked'), output: readOptionalString(result.coder?.summary, '') },
      { stepName: 'testing', lane: 'forge_tester', status: readOptionalString(result.tester?.status, result.ok ? 'pass' : 'pending'), output: readOptionalString(result.tester?.verify, '') },
      { stepName: 'review', lane: 'forge_reviewer', status: readOptionalString(result.reviewer?.status, result.ok ? 'pass' : 'pending'), output: readOptionalString(result.reviewer?.summary, '') },
    ];

    for (const step of stepDefinitions) {
      statements.insertRunStep.run(
        makeId('studio_step'),
        runId,
        step.stepName,
        step.lane,
        step.status,
        startedAt,
        finishedAt,
        step.output,
        step.status === 'pass' ? '' : readOptionalString(result.reason, '')
      );
    }

    const digestId = `studio_digest_${runId}`;
    statements.upsertDigest.run(
      digestId,
      runId,
      readOptionalString(result.summary, ''),
      readOptionalString(result.summary, ''),
      result.ok ? 'low' : 'medium',
      readOptionalString(result.verify, ''),
      readOptionalString(result.next, ''),
      finishedAt
    );

    exportRunEvidence(runId);
    exportLatestDigest();
    return getRun(runId);
  }

  function buildMockPlanSpec(task) {
    const repoTargets = task.repoTargets.map((target) => {
      if (path.resolve(target) === path.resolve(repoRoot)) return 'socialos';
      if (path.resolve(target) === path.resolve(OPENCLAW_WORKSPACE_PATH)) return 'openclaw';
      return path.relative(repoRoot, target).replace(/\\/g, '/');
    });

    return {
      summary: task.goal || task.title,
      filesToChange:
        task.scope === 'socialos'
          ? ['socialos/apps/api/server.mjs', 'socialos/apps/web/server.mjs']
          : task.scope === 'openclaw'
            ? ['../openclaw']
            : ['socialos/apps/api/server.mjs', 'socialos/apps/web/server.mjs', '../openclaw'],
      commands: [...task.preferredTests],
      tests: [...task.preferredTests],
      rollback: [
        `git -C ${repoRoot} status --short`,
        're-run the Studio task after updating constraints or execution policy',
      ],
      digestBullets: [
        task.title,
        `scope: ${task.scope}`,
        `repo targets: ${repoTargets.join(', ')}`,
      ],
      source: 'studio-mock',
      generatedAt: nowIso(),
    };
  }

  function executeMockTask(task) {
    const verify = task.preferredTests.length
      ? task.preferredTests.join(' ; ')
      : 'inspect the latest Studio run evidence';
    const planSpec = buildMockPlanSpec(task);
    return {
      payload: {
        ok: true,
        taskId: task.taskId,
        status: 'done',
        summary: `${task.title} completed through the Studio mock execution pipeline.`,
        verify,
        next: 'queue the next Studio task or switch to live multi-agent execution',
        autonomyMode: 'studio.mock',
        coder: {
          status: 'pass',
          summary: `Studio synthesized a mock implementation plan for ${task.scope}.`,
        },
        tester: {
          status: 'pass',
          verify,
        },
        reviewer: {
          status: 'pass',
          summary: 'Studio reviewer accepted the mock run and exported evidence.',
        },
      },
      planSpec,
    };
  }

  function executeLegacyGenericTask(task) {
    if (mockExecutionEnabled) {
      return executeMockTask(task);
    }
    if (!exportEnabled) {
      throw new Error('Studio execution requires an export-enabled repo-local database');
    }
    exportTaskEvidence(task);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-studio-run-'));
    const resultPath = path.join(tmpDir, 'result.json');
    const planPath = path.join(tmpDir, 'plan.json');
    const result = spawnSync(
      process.execPath,
      [
        paths.genericTaskScriptPath,
        'execute',
        '--task-id',
        task.taskId,
        '--repo-root',
        repoRoot,
        '--result-output',
        resultPath,
        '--plan-output',
        planPath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 180000,
        env: {
          ...process.env,
          ...env,
        },
      }
    );

    const payload = readJsonFile(resultPath, null) || (() => {
      try {
        return JSON.parse(result.stdout || '{}');
      } catch {
        return null;
      }
    })();
    const planSpec = readJsonFile(planPath, payload?.planSpec || null);

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!payload) {
      throw new Error(result.stderr || result.stdout || 'legacy generic executor returned no payload');
    }
    return { payload, planSpec };
  }

  function runTask(taskId) {
    const task = getTask(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);

    const startedAt = nowIso();
    updateTask(taskId, {
      status: STUDIO_TASK_STATUS.planning,
      metadata: {
        ...(task.metadata || {}),
        lastRunRequestedAt: startedAt,
      },
    });

    let payload;
    let planSpec;
    try {
      const execution = executeLegacyGenericTask(getTask(taskId));
      payload = execution.payload;
      planSpec = execution.planSpec;
    } catch (error) {
      payload = {
        ok: false,
        taskId,
        status: 'blocked',
        summary: `${taskId} blocked: Studio executor could not complete the run`,
        reason: error instanceof Error ? error.message : String(error),
        next: 'review execution prerequisites and rerun from Studio',
      };
      planSpec = null;
    }

    const finishedAt = nowIso();
    const nextStatus = payload.ok ? STUDIO_TASK_STATUS.done : STUDIO_TASK_STATUS.blocked;
    const updatedTask = updateTask(taskId, {
      status: nextStatus,
      metadata: {
        ...(getTask(taskId)?.metadata || {}),
        execution: payload,
        lastPlanSpec: planSpec,
        lastFinishedAt: finishedAt,
      },
    });
    const run = writeStudioRun(payload, updatedTask, startedAt, finishedAt, planSpec);
    exportEvidence();
    return {
      task: updatedTask,
      run,
      result: payload,
    };
  }

  function createNoopRun(summary) {
    const runId = makeRunId('NO_TASK');
    const startedAt = nowIso();
    statements.upsertRun.run(
      runId,
      '',
      'studio-command',
      'noop',
      summary,
      summary,
      'low',
      'n/a',
      'wait for the next Studio task',
      startedAt,
      startedAt,
      0,
      JSON.stringify({})
    );
    exportRunEvidence(runId);
    exportLatestDigest();
    return getRun(runId);
  }

  function executeCommand(command) {
    if (!STUDIO_COMMANDS.includes(command)) {
      throw new Error(`unsupported Studio command: ${command}`);
    }

    if (command === 'pause') {
      const settings = patchSettings({ loopMode: 'paused' });
      return {
        command,
        output: 'Studio loop paused.',
        settings,
        status: getStatus(),
      };
    }

    if (command === 'resume') {
      const settings = patchSettings({ loopMode: 'active' });
      return {
        command,
        output: 'Studio loop resumed.',
        settings,
        status: getStatus(),
      };
    }

    if (command === 'notify') {
      const latestRun = getRuns(1)[0];
      const excerpt = latestRun ? `${latestRun.runId}: ${latestRun.summary}`.slice(0, 220) : 'No Studio run available yet.';
      if (commandExists('osascript')) {
        spawnSync('osascript', ['-e', `display notification "${excerpt.replace(/"/g, '\\"')}" with title "SocialOS Studio"`], {
          timeout: 10000,
        });
      }
      return {
        command,
        output: `Studio notification refreshed: ${excerpt}`,
        latestRun,
      };
    }

    const taskSnapshot = listTasks({ limit: 300 });
    const nextTask = taskSnapshot.find(
      (task) => task.status === STUDIO_TASK_STATUS.queued || task.status === STUDIO_TASK_STATUS.draft
    );
    if (!nextTask) {
      const blockedTask = taskSnapshot.find((task) => task.status === STUDIO_TASK_STATUS.blocked);
      if (blockedTask) {
        const existingAutoTriage = taskSnapshot.find((task) => {
          if (!isTaskActionable(task.status)) return false;
          return (
            readOptionalString(task.metadata?.autoTriageForTaskId, '') === blockedTask.taskId &&
            readOptionalString(task.source, '') === 'studio.auto-triage'
          );
        });

        if (!existingAutoTriage) {
          const blockedTitle = readOptionalString(blockedTask.title, 'blocked Studio task');
          const autoTask = createTask({
            taskText: `Auto-triage ${blockedTask.taskId}: unblock ${blockedTitle}`,
            goal: `Produce a safe unblock plan for ${blockedTask.taskId} and queue an executable fix task with verification evidence.`,
            scope: readOptionalString(blockedTask.scope, 'socialos'),
            section: 'AutoFix Backlog',
            source: 'studio.auto-triage',
            acceptanceCriteria: [
              `Identify why ${blockedTask.taskId} is blocked and restate the root cause.`,
              'Queue one concrete follow-up task with explicit verification steps.',
            ],
            metadata: {
              autoTriageForTaskId: blockedTask.taskId,
              autoTriageForTitle: blockedTitle,
              createdByCommand: 'run-once',
            },
          });

          const summary = `Queued auto-triage task ${autoTask.taskId} for blocked item ${blockedTask.taskId}.`;
          return {
            command,
            output: summary,
            task: autoTask,
            run: createNoopRun(summary),
            status: getStatus(),
          };
        }
      }

      return {
        command,
        output: 'No queued Studio task is ready right now.',
        run: createNoopRun('No queued Studio task is ready right now.'),
        status: getStatus(),
      };
    }

    const execution = runTask(nextTask.taskId);
    return {
      command,
      output: execution.result.summary,
      run: execution.run,
      task: execution.task,
      status: getStatus(),
    };
  }

  bootstrapIfNeeded();

  return {
    bootstrapIfNeeded,
    getSettingsPayload,
    patchSettings,
    getStatus,
    getClusterSummary,
    buildBootstrap,
    listTasks,
    getTask,
    createTask,
    updateTask,
    getRuns,
    getRun,
    getAgents,
    runTask,
    executeCommand,
    getPublishMode() {
      return getSetting('studio.publishMode', 'dry-run');
    },
    exportEvidence,
  };
}
