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

  if (options.expectFailure) {
    return result;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }

  return result;
}

async function main() {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-foundry-task-'));
  fs.mkdirSync(path.join(tempRoot, 'infra/db'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'foundry'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'infra/db/schema.sql'), path.join(tempRoot, 'infra/db/schema.sql'));
  fs.copyFileSync(
    path.join(sourceRoot, 'foundry/openclaw.foundry.json5'),
    path.join(tempRoot, 'foundry/openclaw.foundry.json5')
  );
  fs.writeFileSync(path.join(tempRoot, 'scripts/foundry_generic_task.mjs'), '// generic task smoke placeholder\n', 'utf8');

  run('git', ['init'], { cwd: tempRoot });
  run('git', ['config', 'user.email', 'codex@example.test'], { cwd: tempRoot });
  run('git', ['config', 'user.name', 'Codex Test'], { cwd: tempRoot });
  run('git', ['add', '.'], { cwd: tempRoot });
  run('git', ['commit', '-m', 'init'], { cwd: tempRoot });

  const apiModuleUrl = `${pathToFileURL(path.join(sourceRoot, 'socialos/apps/api/server.mjs')).href}?repoRoot=${Date.now()}`;
  const originalRepoRoot = process.env.SOCIALOS_REPO_ROOT;
  process.env.SOCIALOS_REPO_ROOT = tempRoot;
  const { startApiServer } = await import(apiModuleUrl);
  const api = await startApiServer({
    port: 0,
    quiet: true,
    dbPath: path.join(tempRoot, 'infra/db/socialos.db'),
  });

  try {
    const quick = await postJson(api.baseUrl, '/studio/tasks', {
      taskText: 'Quick task from smoke',
    });
    assert(quick.task.metadata?.intakeMode === 'quick', 'quick task should use quick intake mode');
    assert(quick.task.scope === 'socialos', 'quick task should default to socialos scope');

    const structured = await postJson(api.baseUrl, '/studio/tasks', {
      intakeMode: 'structured',
      title: 'Structured smoke task',
      goal: 'Exercise the generic Foundry executor in mock mode',
      acceptanceCriteria: ['Foundry writes a PlanSpec', 'Queue status reaches done after mock execution'],
      constraints: ['Stay inside the temp repo'],
      scope: 'socialos',
      preferredTests: ['test -f QUEUE.md', 'test -d foundry/tasks'],
    });

    assert(structured.task.metadata?.intakeMode === 'structured', 'structured task should persist structured intake');
    assert(structured.task.acceptanceCriteria.length === 2, 'structured task should persist acceptance criteria');

    const invalidResponse = await fetch(`${api.baseUrl}/studio/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Invalid cross repo task',
        repoTargets: ['openclaw'],
      }),
    });
    assert(invalidResponse.status === 400, 'cross-repo task without explicit scope should be rejected');

    const listed = await getJson(api.baseUrl, '/studio/tasks?limit=10');
    assert(listed.count >= 2, 'studio/tasks should list created tasks');
    assert(listed.tasks.some((task) => task.taskId === structured.task.taskId), 'structured task should appear in task list');

    const agents = await getJson(api.baseUrl, '/studio/agents');
    assert(typeof agents.cluster?.genericTaskExecutionEnabled === 'boolean', 'cluster should include generic task toggle');
    assert(Array.isArray(agents.cluster?.supportedScopes), 'cluster should include supported scopes');
    assert(typeof agents.cluster?.defaultAutonomyMode === 'string', 'cluster should include autonomy mode');

    const runtime = await getJson(api.baseUrl, '/settings/runtime');
    assert(runtime.foundry?.llmTaskHealth, 'settings/runtime should expose llm-task health');

    const successResult = run(
      process.execPath,
      [
        path.join(sourceRoot, 'scripts/foundry_generic_task.mjs'),
        'execute',
        '--task-id',
        structured.task.taskId,
        '--repo-root',
        tempRoot,
      ],
      {
        cwd: sourceRoot,
        env: {
          SOCIALOS_FOUNDRY_MOCK: '1',
        },
      }
    );
    const successPayload = JSON.parse(successResult.stdout);
    assert(successPayload.status === 'done', 'mock generic execution should succeed');
    assert(Array.isArray(successPayload.backups) && successPayload.backups.length === 1, 'generic execution should create backup refs');

    const queueAfterSuccess = fs.readFileSync(path.join(tempRoot, 'QUEUE.md'), 'utf8');
    assert(queueAfterSuccess.includes(`- [x] ${structured.task.taskId}`), 'queue should mark structured task as done');
    assert(fs.existsSync(path.join(tempRoot, 'reports/runs/mock-generic-task.txt')), 'mock execution should emit a deterministic artifact');

    const branchProbe = run(
      'git',
      ['-C', tempRoot, 'rev-parse', '--verify', successPayload.backups[0].branchName],
      { cwd: tempRoot }
    );
    assert(branchProbe.stdout.trim(), 'backup branch should exist');

    const failing = await postJson(api.baseUrl, '/studio/tasks', {
      intakeMode: 'structured',
      title: 'Failing structured smoke task',
      goal: 'Confirm failed verification marks the task blocked',
      acceptanceCriteria: ['Execution is marked blocked when preferred tests fail'],
      scope: 'socialos',
      preferredTests: ['false'],
    });

    const failingResult = run(
      process.execPath,
      [
        path.join(sourceRoot, 'scripts/foundry_generic_task.mjs'),
        'execute',
        '--task-id',
        failing.task.taskId,
        '--repo-root',
        tempRoot,
      ],
      {
        cwd: sourceRoot,
        env: {
          SOCIALOS_FOUNDRY_MOCK: '1',
        },
        expectFailure: true,
      }
    );
    assert(failingResult.status === 2, 'failing generic execution should exit with blocked code');
    const blockedQueue = fs.readFileSync(path.join(tempRoot, 'QUEUE.md'), 'utf8');
    assert(blockedQueue.includes(`- [!] ${failing.task.taskId}`), 'failed generic execution should mark queue item blocked');
    assert(/AUTOFIX-/u.test(blockedQueue), 'failed generic execution should add an autofix backlog entry');

    const noCli = run(
      process.execPath,
      [
        path.join(sourceRoot, 'scripts/foundry_generic_task.mjs'),
        'execute',
        '--task-id',
        quick.task.taskId,
        '--repo-root',
        tempRoot,
      ],
      {
        cwd: sourceRoot,
        env: {
          PATH: '/usr/bin:/bin',
        },
        expectFailure: true,
      }
    );
    assert(noCli.status === 2, 'generic execution should fast-fail when openclaw is unavailable');
    const noCliPayload = JSON.parse(noCli.stdout || '{}');
    assert(noCliPayload.status === 'blocked', 'missing openclaw should return blocked payload');

    console.log('foundry_generic_task_smoke: PASS');
  } finally {
    await api.close();
    if (originalRepoRoot === undefined) {
      delete process.env.SOCIALOS_REPO_ROOT;
    } else {
      process.env.SOCIALOS_REPO_ROOT = originalRepoRoot;
    }
  }
}

main().catch((error) => {
  console.error(`foundry_generic_task_smoke: FAIL ${error.message}`);
  process.exit(1);
});
