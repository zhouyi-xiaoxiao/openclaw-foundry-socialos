#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createAutofixBacklogEntry,
  DEFAULT_AUTONOMY_MODE,
  ensureFoundryRuntimeDirs,
  readStructuredTask,
  updateStructuredTask,
  writeLlmTaskHealthSnapshot,
} from '../socialos/lib/foundry-tasks.mjs';

const MOCK_MODE = String(process.env.SOCIALOS_FOUNDRY_MOCK || '').trim() === '1';
const DEFAULT_AGENT_TIMEOUT_MS = Number(process.env.SOCIALOS_FOUNDRY_AGENT_TIMEOUT_MS || 180000);
const DEFAULT_TEST_TIMEOUT_MS = Number(process.env.SOCIALOS_FOUNDRY_TEST_TIMEOUT_MS || 180000);

function usage() {
  console.error(`Usage:
  node scripts/foundry_generic_task.mjs health [--repo-root <path>] [--output <path>]
  node scripts/foundry_generic_task.mjs plan --task-id <taskId> [--repo-root <path>] [--output <path>]
  node scripts/foundry_generic_task.mjs execute --task-id <taskId> [--repo-root <path>] [--plan-output <path>] [--result-output <path>] [--managed-by-devloop]`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readPayloadText(output) {
  const envelope = JSON.parse(output || '{}');
  const payloads = Array.isArray(envelope.payloads) ? envelope.payloads : [];
  const text = payloads
    .map((payload) => (typeof payload?.text === 'string' ? payload.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    envelope,
    text,
  };
}

function parsePayloadJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function writeJsonFileIfNeeded(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function relPath(paths, targetPath) {
  return path.relative(paths.repoRoot, targetPath).replace(/\\/g, '/');
}

function failResult(taskId, status, summary, reason, extra = {}) {
  return {
    ok: false,
    taskId,
    status,
    summary,
    reason,
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    ...extra,
  };
}

function ensureTask(taskId, options = {}) {
  const task = readStructuredTask(taskId, options);
  if (!task) {
    throw new Error(`task ${taskId} not found`);
  }
  return task;
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

function commandExists(command) {
  const probe = runProcess('bash', ['-lc', `command -v ${command}`], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  return probe.status === 0 && Boolean(probe.stdout.trim());
}

function buildFallbackPlanSpec(task, source = 'fallback') {
  return {
    summary: task.goal || task.title,
    filesToChange: task.scope === 'socialos' ? ['socialos/apps/web/server.mjs', 'socialos/apps/api/server.mjs'] : [],
    commands: [...(Array.isArray(task.preferredTests) ? task.preferredTests : [])],
    tests: [...(Array.isArray(task.preferredTests) ? task.preferredTests : [])],
    rollback: [
      `git branch backup/${task.taskId.toLowerCase()}-<timestamp>`,
      'mark queue item blocked and add autofix backlog entry if verification fails',
    ],
    digestBullets: [
      task.title,
      `scope: ${task.scope}`,
      `repo targets: ${task.repoTargets.join(', ')}`,
    ],
    source,
    generatedAt: new Date().toISOString(),
  };
}

function buildHealthSnapshotFromFailure(summary, reason, extra = {}) {
  return {
    status: 'blocked',
    checkedAt: new Date().toISOString(),
    summary,
    reason,
    ...extra,
  };
}

function runLlmTaskHealthProbe(options = {}) {
  const paths = ensureFoundryRuntimeDirs(options);

  if (MOCK_MODE) {
    const snapshot = {
      status: 'mock',
      checkedAt: new Date().toISOString(),
      summary: 'llm-task health satisfied by SOCIALOS_FOUNDRY_MOCK=1.',
      reason: 'mock mode bypassed the live agent probe',
      mode: 'mock',
      genericTaskExecutionEnabled: true,
    };
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  }

  if (!commandExists('openclaw')) {
    const snapshot = buildHealthSnapshotFromFailure(
      'openclaw CLI is unavailable for generic task execution.',
      'command `openclaw` is not on PATH',
      { mode: 'live', genericTaskExecutionEnabled: false }
    );
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  }

  const prompt = [
    'Use the llm-task tool exactly once.',
    'Ask it to return the JSON object {"ok":true,"tool":"llm-task","status":"green"}.',
    'After the tool returns, respond with exactly that JSON and nothing else.',
  ].join(' ');

  const probe = runProcess(
    'openclaw',
    ['agent', '--local', '--agent', 'forge_orchestrator', '--message', prompt, '--json'],
    {
      cwd: paths.repoRoot,
      timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
    }
  );

  if (probe.status !== 0 || probe.error) {
    const snapshot = buildHealthSnapshotFromFailure(
      'forge_orchestrator could not complete the llm-task probe.',
      probe.error ? String(probe.error.message || probe.error) : probe.stderr.trim() || 'agent exited non-zero',
      { mode: 'live', genericTaskExecutionEnabled: false }
    );
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  }

  if (/\bllm-task failed\b/iu.test(probe.stderr) || /Cannot find module/iu.test(probe.stderr)) {
    const snapshot = buildHealthSnapshotFromFailure(
      'llm-task reported a runtime failure during the probe.',
      probe.stderr.trim(),
      { mode: 'live', genericTaskExecutionEnabled: false }
    );
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  }

  try {
    const { envelope, text } = readPayloadText(probe.stdout);
    const parsed = parsePayloadJson(text, 'llm-task health probe');
    if (!parsed?.ok || parsed.tool !== 'llm-task') {
      throw new Error('probe output did not confirm llm-task');
    }

    const snapshot = {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      summary: 'llm-task passed the forge_orchestrator probe.',
      reason: 'forge_orchestrator successfully completed a JSON-only llm-task call',
      mode: 'live',
      genericTaskExecutionEnabled: true,
      agentModel: envelope?.meta?.agentMeta?.model || 'unknown',
      provider: envelope?.meta?.agentMeta?.provider || 'unknown',
    };
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  } catch (error) {
    const snapshot = buildHealthSnapshotFromFailure(
      'llm-task probe returned an unreadable payload.',
      error instanceof Error ? error.message : String(error),
      { mode: 'live', genericTaskExecutionEnabled: false }
    );
    writeLlmTaskHealthSnapshot(snapshot, options);
    return snapshot;
  }
}

function createBackupRefs(task, options = {}) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRefs = [];

  for (const repoTarget of task.repoTargets) {
    const normalizedTarget = path.resolve(repoTarget);
    const gitProbe = runProcess('git', ['-C', normalizedTarget, 'rev-parse', '--is-inside-work-tree'], {
      cwd: normalizedTarget,
      timeoutMs: 10000,
    });
    if (gitProbe.status !== 0) {
      throw new Error(`backup preflight failed: ${normalizedTarget} is not a git repository`);
    }

    const branchName = `backup/${task.taskId.toLowerCase()}-${timestamp}`;
    const tagName = `lkg/${timestamp}`;
    const branchResult = runProcess('git', ['-C', normalizedTarget, 'branch', branchName, 'HEAD'], {
      cwd: normalizedTarget,
      timeoutMs: 10000,
    });
    if (branchResult.status !== 0) {
      throw new Error(branchResult.stderr.trim() || `failed to create ${branchName}`);
    }

    const tagResult = runProcess('git', ['-C', normalizedTarget, 'tag', tagName, 'HEAD'], {
      cwd: normalizedTarget,
      timeoutMs: 10000,
    });
    if (tagResult.status !== 0) {
      throw new Error(tagResult.stderr.trim() || `failed to create ${tagName}`);
    }

    backupRefs.push({
      repoTarget: normalizedTarget,
      branchName,
      tagName,
    });
  }

  return backupRefs;
}

function buildTaskPrompt(task, planSpec) {
  return JSON.stringify(
    {
      task: {
        taskId: task.taskId,
        title: task.title,
        goal: task.goal,
        acceptanceCriteria: task.acceptanceCriteria,
        constraints: task.constraints,
        scope: task.scope,
        repoTargets: task.repoTargets,
        preferredTests: task.preferredTests,
      },
      planSpec,
    },
    null,
    2
  );
}

function runAgentJson(agentId, prompt, options = {}) {
  const run = runProcess(
    'openclaw',
    ['agent', '--local', '--agent', agentId, '--message', prompt, '--json'],
    {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs || DEFAULT_AGENT_TIMEOUT_MS,
    }
  );

  if (run.status !== 0 || run.error) {
    throw new Error(run.error ? String(run.error.message || run.error) : run.stderr.trim() || `${agentId} exited non-zero`);
  }

  const { envelope, text } = readPayloadText(run.stdout);
  const parsed = parsePayloadJson(text, `${agentId} response`);
  return {
    parsed,
    stderr: run.stderr.trim(),
    meta: envelope?.meta?.agentMeta || {},
  };
}

function generatePlanSpec(task, healthSnapshot, options = {}) {
  const fallback = buildFallbackPlanSpec(task, healthSnapshot.status === 'ok' ? 'fallback' : 'fallback-health');
  if (MOCK_MODE || healthSnapshot.status !== 'ok') {
    return fallback;
  }

  const prompt = [
    'Use the llm-task tool exactly once to plan this task.',
    'Return only JSON with the keys: summary, filesToChange, commands, tests, rollback, digestBullets.',
    'Do not include markdown fences or extra commentary.',
    'Task context JSON follows:',
    buildTaskPrompt(task, fallback),
  ].join('\n\n');

  try {
    const { parsed } = runAgentJson('forge_orchestrator', prompt, {
      cwd: options.repoRoot,
    });
    return {
      summary: String(parsed.summary || task.goal || task.title),
      filesToChange: Array.isArray(parsed.filesToChange) ? parsed.filesToChange.map(String) : fallback.filesToChange,
      commands: Array.isArray(parsed.commands) ? parsed.commands.map(String) : fallback.commands,
      tests: Array.isArray(parsed.tests) ? parsed.tests.map(String) : fallback.tests,
      rollback: Array.isArray(parsed.rollback) ? parsed.rollback.map(String) : fallback.rollback,
      digestBullets: Array.isArray(parsed.digestBullets) ? parsed.digestBullets.map(String) : fallback.digestBullets,
      source: 'forge_orchestrator',
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}

function runCoder(task, planSpec, options = {}) {
  if (MOCK_MODE) {
    return {
      status: 'pass',
      summary: `mock coder completed ${task.taskId}`,
      changedFiles: ['reports/runs/mock-generic-task.txt'],
      notes: ['mock mode wrote deterministic execution markers only'],
      agent: 'forge_coder',
    };
  }

  const prompt = [
    'Implement this task directly in the allowed repo targets.',
    'You may only modify files inside the declared repoTargets.',
    'Do not touch /Users/zhouyixiaoxiao/workspace/openclaw unless scope is openclaw or multi-repo.',
    'Do not enable live publish. Runtime must remain dry-run safe.',
    'After you finish, reply only JSON with keys status, summary, changedFiles, notes.',
    'Task context JSON follows:',
    buildTaskPrompt(task, planSpec),
  ].join('\n\n');

  const { parsed, meta } = runAgentJson('forge_coder', prompt, {
    cwd: options.repoRoot,
  });

  return {
    status: String(parsed.status || 'pass'),
    summary: String(parsed.summary || `${task.taskId} implementation attempted by forge_coder`),
    changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles.map(String) : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
    agent: 'forge_coder',
    model: meta.model || 'unknown',
  };
}

function runPreferredTests(task, paths) {
  const commands = Array.isArray(task.preferredTests) && task.preferredTests.length
    ? task.preferredTests
    : ['bash scripts/test.sh'];
  const cwd = path.resolve(task.repoTargets[0] || paths.repoRoot);
  const logPath = path.join(paths.reportsDir, `${task.taskId}.generic-test.log`);
  const logChunks = [];

  for (const command of commands) {
    const run = runProcess('bash', ['-lc', command], {
      cwd,
      timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
    });

    logChunks.push(`$ ${command}\n${run.stdout}${run.stderr}`);

    if (run.status !== 0) {
      fs.writeFileSync(logPath, logChunks.join('\n\n'), 'utf8');
      return {
        status: 'fail',
        verify: logPath,
        commands,
      };
    }
  }

  fs.writeFileSync(logPath, logChunks.join('\n\n'), 'utf8');
  return {
    status: 'pass',
    verify: logPath,
    commands,
  };
}

function runReviewer(task, planSpec, testResult, options = {}) {
  if (MOCK_MODE) {
    return {
      status: 'pass',
      summary: 'mock reviewer accepted the deterministic execution',
      notes: ['review simulated under SOCIALOS_FOUNDRY_MOCK=1'],
      agent: 'forge_reviewer',
    };
  }

  const prompt = [
    'Review this generic Foundry execution and respond only in JSON.',
    'Return keys: status, summary, notes, risks.',
    'The task must remain dry-run safe and must not exceed repo scope.',
    `Local tester status: ${testResult.status}.`,
    `Local tester log: ${testResult.verify}.`,
    'Task context JSON follows:',
    buildTaskPrompt(task, planSpec),
  ].join('\n\n');

  const { parsed, meta } = runAgentJson('forge_reviewer', prompt, {
    cwd: options.repoRoot,
  });

  return {
    status: String(parsed.status || 'pass'),
    summary: String(parsed.summary || `${task.taskId} reviewed by forge_reviewer`),
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    agent: 'forge_reviewer',
    model: meta.model || 'unknown',
  };
}

function writeMockArtifact(task, paths) {
  const artifactPath = path.join(paths.reportsDir, 'mock-generic-task.txt');
  const line = `${new Date().toISOString()} ${task.taskId} ${task.title}\n`;
  fs.appendFileSync(artifactPath, line, 'utf8');
  return artifactPath;
}

function finalizeTaskFailure(task, summary, reason, options = {}) {
  const managedByDevloop = Boolean(options.managedByDevloop);
  const patch = {
    execution: {
      ...(task.execution || {}),
      lastResult: {
        status: 'blocked',
        summary,
        reason,
        finishedAt: new Date().toISOString(),
      },
    },
  };

  if (managedByDevloop) {
    updateStructuredTask(task.taskId, patch, {
      repoRoot: options.repoRoot,
      syncQueue: false,
    });
  } else {
    updateStructuredTask(
      task.taskId,
      {
        ...patch,
        status: 'blocked',
      },
      {
        repoRoot: options.repoRoot,
        syncQueue: true,
      }
    );
  }

  if (!managedByDevloop) {
    createAutofixBacklogEntry(task.taskId, summary, { repoRoot: options.repoRoot });
  }
}

function finalizeTaskSuccess(task, execution, options = {}) {
  const patch = {
    execution,
  };

  if (!options.managedByDevloop) {
    patch.status = 'done';
  }

  updateStructuredTask(task.taskId, patch, {
    repoRoot: options.repoRoot,
    syncQueue: !options.managedByDevloop,
  });
}

function outputResult(result, outputPath) {
  writeJsonFileIfNeeded(outputPath, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    usage();
    process.exit(1);
  }

  const repoRoot = path.resolve(String(args['repo-root'] || args.repoRoot || process.cwd()));
  const options = { repoRoot };
  const paths = ensureFoundryRuntimeDirs(options);

  if (command === 'health') {
    const snapshot = runLlmTaskHealthProbe(options);
    writeJsonFileIfNeeded(args.output, snapshot);
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  const taskId = String(args['task-id'] || args.taskId || '').trim();
  if (!taskId) {
    throw new Error('--task-id is required');
  }

  const task = ensureTask(taskId, options);

  if (command === 'plan') {
    const healthSnapshot = readLlmTaskHealthSnapshot(options);
    const planSpec = generatePlanSpec(task, healthSnapshot, options);
    const outputPath = args.output ? path.resolve(String(args.output)) : null;
    writeJsonFileIfNeeded(outputPath, planSpec);
    process.stdout.write(`${JSON.stringify(planSpec, null, 2)}\n`);
    return;
  }

  if (command !== 'execute') {
    usage();
    process.exit(1);
  }

  const managedByDevloop = Boolean(args['managed-by-devloop'] || args.managedByDevloop);
  const resultOutputPath = args['result-output'] ? path.resolve(String(args['result-output'])) : null;
  const planOutputPath = args['plan-output'] ? path.resolve(String(args['plan-output'])) : null;

  const healthSnapshot = runLlmTaskHealthProbe(options);
  if (!['ok', 'mock'].includes(String(healthSnapshot.status || 'unknown'))) {
    const summary = `${task.taskId} blocked: llm-task health is not available`;
    finalizeTaskFailure(task, summary, healthSnapshot.reason || healthSnapshot.summary, {
      repoRoot,
      managedByDevloop,
    });
    const result = failResult(task.taskId, 'blocked', summary, healthSnapshot.reason || healthSnapshot.summary, {
      llmTaskHealth: healthSnapshot,
    });
    outputResult(result, resultOutputPath);
    process.exit(2);
  }

  let backupRefs;
  try {
    backupRefs = createBackupRefs(task, options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const summary = `${task.taskId} blocked: backup preflight failed`;
    finalizeTaskFailure(task, summary, reason, {
      repoRoot,
      managedByDevloop,
    });
    const result = failResult(task.taskId, 'blocked', summary, reason, {
      llmTaskHealth: healthSnapshot,
    });
    outputResult(result, resultOutputPath);
    process.exit(2);
  }

  const planSpec = generatePlanSpec(task, healthSnapshot, options);
  writeJsonFileIfNeeded(planOutputPath, planSpec);

  if (MOCK_MODE) {
    writeMockArtifact(task, paths);
  }

  const coder = runCoder(task, planSpec, options);
  if (coder.status !== 'pass') {
    const summary = `${task.taskId} blocked: coder lane could not finish the task`;
    finalizeTaskFailure(task, summary, coder.summary || 'forge_coder returned blocked', {
      repoRoot,
      managedByDevloop,
    });
    const result = failResult(task.taskId, 'blocked', summary, coder.summary || 'forge_coder returned blocked', {
      llmTaskHealth: healthSnapshot,
      backups: backupRefs,
      planSpec,
      coder,
    });
    outputResult(result, resultOutputPath);
    process.exit(2);
  }

  const tester = runPreferredTests(task, paths);
  if (tester.status !== 'pass') {
    const summary = `${task.taskId} blocked: preferred tests failed`;
    finalizeTaskFailure(task, summary, tester.verify, {
      repoRoot,
      managedByDevloop,
    });
    const result = failResult(task.taskId, 'blocked', summary, tester.verify, {
      llmTaskHealth: healthSnapshot,
      backups: backupRefs,
      planSpec,
      coder,
      tester,
    });
    outputResult(result, resultOutputPath);
    process.exit(2);
  }

  const reviewer = runReviewer(task, planSpec, tester, options);
  if (reviewer.status !== 'pass') {
    const summary = `${task.taskId} blocked: reviewer lane flagged the execution`;
    finalizeTaskFailure(task, summary, reviewer.summary || 'forge_reviewer returned blocked', {
      repoRoot,
      managedByDevloop,
    });
    const result = failResult(task.taskId, 'blocked', summary, reviewer.summary || 'forge_reviewer returned blocked', {
      llmTaskHealth: healthSnapshot,
      backups: backupRefs,
      planSpec,
      coder,
      tester,
      reviewer,
    });
    outputResult(result, resultOutputPath);
    process.exit(2);
  }

  const execution = {
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    llmTaskHealth: healthSnapshot,
    backups: backupRefs,
    lastPlanSpec: planSpec,
    tester,
    coder,
    reviewer,
    finishedAt: new Date().toISOString(),
  };

  finalizeTaskSuccess(task, execution, {
    repoRoot,
    managedByDevloop,
  });

  const result = {
    ok: true,
    taskId: task.taskId,
    status: 'done',
    summary: coder.summary || `${task.taskId} completed via generic Foundry execution`,
    verify: tester.verify,
    next: 'continue with the next pending queue item',
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    llmTaskHealth: healthSnapshot,
    backups: backupRefs,
    planSpec,
    coder,
    tester,
    reviewer,
  };

  outputResult(result, resultOutputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
