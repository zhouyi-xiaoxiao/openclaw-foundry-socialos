import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function postJson(baseUrl, route, payload, expectedStatus = 201) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : {};
    if (response.status !== expectedStatus) {
      throw new Error(`${route} failed (${response.status}): ${raw}`);
    }
    return parsed;
  });
}

function getJson(baseUrl, route) {
  return fetch(`${baseUrl}${route}`).then(async (response) => {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
      throw new Error(`${route} failed (${response.status}): ${raw}`);
    }
    return parsed;
  });
}

function patchJson(baseUrl, route, payload, expectedStatus = 200) {
  return fetch(`${baseUrl}${route}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : {};
    if (response.status !== expectedStatus) {
      throw new Error(`${route} failed (${response.status}): ${raw}`);
    }
    return parsed;
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    timeout: options.timeoutMs || 180000,
  });

  if (options.expectFailure) return result;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

async function main() {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-studio-control-'));
  fs.mkdirSync(path.join(tempRoot, 'infra/db'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'foundry'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'reports/runs'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'infra/db/schema.sql'), path.join(tempRoot, 'infra/db/schema.sql'));
  fs.copyFileSync(
    path.join(sourceRoot, 'foundry/openclaw.foundry.json5'),
    path.join(tempRoot, 'foundry/openclaw.foundry.json5')
  );
  fs.copyFileSync(
    path.join(sourceRoot, 'scripts/foundry_generic_task.mjs'),
    path.join(tempRoot, 'scripts/foundry_generic_task.mjs')
  );

  run('git', ['init'], { cwd: tempRoot });
  run('git', ['config', 'user.email', 'codex@example.test'], { cwd: tempRoot });
  run('git', ['config', 'user.name', 'Codex Test'], { cwd: tempRoot });
  run('git', ['add', '.'], { cwd: tempRoot });
  run('git', ['commit', '-m', 'init'], { cwd: tempRoot });

  const apiModuleUrl = `${pathToFileURL(path.join(sourceRoot, 'socialos/apps/api/server.mjs')).href}?repoRoot=${Date.now()}`;
  const originalRepoRoot = process.env.SOCIALOS_REPO_ROOT;
  const originalMock = process.env.SOCIALOS_FOUNDRY_MOCK;
  process.env.SOCIALOS_REPO_ROOT = tempRoot;
  process.env.SOCIALOS_FOUNDRY_MOCK = '1';
  const { startApiServer } = await import(apiModuleUrl);
  const dbPath = path.join(tempRoot, 'infra/db/socialos.db');
  const api = await startApiServer({
    port: 0,
    quiet: true,
    dbPath,
  });

  try {
    const created = await postJson(api.baseUrl, '/studio/tasks', {
      taskText: 'Exercise the Studio mock execution path',
      goal: 'Studio should export queue and run evidence after a DB-backed task run',
      acceptanceCriteria: [
        'Studio marks the task done after mock execution',
        'Studio exports queue and run evidence files',
      ],
      preferredTests: ['test -d foundry/tasks', 'test -f QUEUE.md'],
    });
    assert(created.task.status === 'queued', 'new Studio tasks should enter the queued state');

    const execution = await postJson(api.baseUrl, `/studio/tasks/${encodeURIComponent(created.task.taskId)}/run`, {}, 200);
    assert(execution.task.status === 'done', 'mock Studio execution should complete successfully');
    assert(execution.run.status === 'success', 'mock Studio execution should write a successful run');

    const taskDetail = await getJson(api.baseUrl, `/studio/tasks/${encodeURIComponent(created.task.taskId)}`);
    assert(Array.isArray(taskDetail.runs) && taskDetail.runs.length >= 1, 'studio task detail should expose associated runs');

    const runDetail = await getJson(api.baseUrl, `/studio/runs/${encodeURIComponent(execution.run.runId)}`);
    assert(Array.isArray(runDetail.steps) && runDetail.steps.length >= 4, 'studio run detail should expose step timeline');
    assert(Array.isArray(runDetail.artifacts) && runDetail.artifacts.length >= 2, 'studio run detail should expose exported artifacts');

    const queueAfter = fs.readFileSync(path.join(tempRoot, 'QUEUE.md'), 'utf8');
    assert(queueAfter.includes('# SocialOS Studio Queue'), 'Studio should export queue evidence');
    assert(queueAfter.includes(created.task.taskId), 'Studio queue export should include the task id');
    assert(fs.existsSync(path.join(tempRoot, 'reports/runs', `${execution.run.runId}.json`)), 'Studio should export run json evidence');
    assert(fs.existsSync(path.join(tempRoot, 'reports/runs', `${execution.run.runId}.md`)), 'Studio should export run markdown evidence');

    const cli = run(
      process.execPath,
      [path.join(sourceRoot, 'scripts/studio_cli.mjs'), 'status', '--db', dbPath],
      {
        cwd: sourceRoot,
        env: {
          SOCIALOS_REPO_ROOT: tempRoot,
          SOCIALOS_FOUNDRY_MOCK: '1',
        },
      }
    );
    const cliPayload = JSON.parse(cli.stdout);
    assert(typeof cliPayload.mode === 'string', 'studio cli should expose status mode');

    const wrapper = run('bash', [path.join(sourceRoot, 'scripts/studio.sh'), 'status', '--db', dbPath], {
      cwd: sourceRoot,
      env: {
        SOCIALOS_REPO_ROOT: tempRoot,
        SOCIALOS_FOUNDRY_MOCK: '1',
      },
    });
    const wrapperPayload = JSON.parse(wrapper.stdout);
    assert(typeof wrapperPayload.mode === 'string', 'studio wrapper should expose status mode');
    assert(!wrapper.stderr.trim(), 'studio wrapper should keep stderr quiet for machine parsing');

    const blockedSeed = await postJson(api.baseUrl, '/studio/tasks', {
      taskText: 'Blocked queue seed for auto triage',
      goal: 'Reproduce blocked-only queue behavior',
      section: 'P2 Blocked',
      acceptanceCriteria: ['Task remains blocked until triage creates a follow-up'],
    });
    const blockedTaskId = blockedSeed.task.taskId;
    const blocked = await patchJson(
      api.baseUrl,
      `/studio/tasks/${encodeURIComponent(blockedTaskId)}`,
      { status: 'blocked', source: 'studio.test' }
    );
    assert(blocked.task.status === 'blocked', 'seed task should move to blocked state for triage smoke');

    const triageQueued = await postJson(api.baseUrl, '/studio/commands/run-once', {}, 200);
    assert(triageQueued.task?.source === 'studio.auto-triage', 'run-once should queue auto-triage work for blocked-only queues');
    assert(triageQueued.task?.status === 'queued', 'auto-triage task should enter queued state');
    assert(
      triageQueued.task?.metadata?.autoTriageForTaskId === blockedTaskId,
      'auto-triage task should reference the blocked source task id'
    );

    const triageExecuted = await postJson(api.baseUrl, '/studio/commands/run-once', {}, 200);
    assert(triageExecuted.task?.taskId === triageQueued.task.taskId, 'next run-once should execute queued auto-triage task');
    assert(triageExecuted.task?.status === 'done', 'auto-triage task should complete under mock execution');

    console.log('studio_control_plane_smoke: PASS');
  } finally {
    await api.close();
    if (originalRepoRoot === undefined) {
      delete process.env.SOCIALOS_REPO_ROOT;
    } else {
      process.env.SOCIALOS_REPO_ROOT = originalRepoRoot;
    }
    if (originalMock === undefined) {
      delete process.env.SOCIALOS_FOUNDRY_MOCK;
    } else {
      process.env.SOCIALOS_FOUNDRY_MOCK = originalMock;
    }
  }
}

main().catch((error) => {
  console.error(`studio_control_plane_smoke: FAIL ${error.message}`);
  process.exit(1);
});
