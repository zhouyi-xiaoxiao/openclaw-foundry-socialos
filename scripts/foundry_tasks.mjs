#!/usr/bin/env node

import {
  createStructuredTask,
  listStructuredTasks,
  readStructuredTask,
  resolveFoundryRuntimePaths,
  setStructuredTaskStatus,
} from '../socialos/lib/foundry-tasks.mjs';

function usage() {
  console.error(`Usage:
  node scripts/foundry_tasks.mjs create --text "Implement queue insights"
  node scripts/foundry_tasks.mjs create --json '{"title":"...","goal":"..."}'
  node scripts/foundry_tasks.mjs list [--limit 20]
  node scripts/foundry_tasks.mjs get --task-id TASK-20260305210101
  node scripts/foundry_tasks.mjs mark --task-id TASK-20260305210101 --status done|blocked|in_progress|pending
  node scripts/foundry_tasks.mjs paths`);
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

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command) {
    usage();
    process.exit(1);
  }

  if (command === 'create') {
    let input = {};
    if (typeof args.json === 'string' && args.json.trim()) {
      input = JSON.parse(args.json);
    } else {
      input = {
        taskText: args.text || args.taskText || '',
        intakeMode: args.intakeMode,
        title: args.title,
        goal: args.goal,
        scope: args.scope,
        acceptanceCriteria: args.acceptanceCriteria,
        constraints: args.constraints,
        repoTargets: args.repoTargets,
        preferredTests: args.preferredTests,
      };
    }
    const created = createStructuredTask(input);
    writeJson({ ok: true, task: created });
    return;
  }

  if (command === 'list') {
    writeJson({
      ok: true,
      tasks: listStructuredTasks({ limit: args.limit ? Number(args.limit) : undefined }),
    });
    return;
  }

  if (command === 'get') {
    const taskId = String(args['task-id'] || args.taskId || '').trim();
    if (!taskId) {
      throw new Error('--task-id is required');
    }
    const task = readStructuredTask(taskId);
    if (!task) {
      throw new Error(`task ${taskId} not found`);
    }
    writeJson({ ok: true, task });
    return;
  }

  if (command === 'paths') {
    writeJson({ ok: true, paths: resolveFoundryRuntimePaths() });
    return;
  }

  if (command === 'mark') {
    const taskId = String(args['task-id'] || args.taskId || '').trim();
    const status = String(args.status || '').trim();
    if (!taskId) {
      throw new Error('--task-id is required');
    }
    if (!status) {
      throw new Error('--status is required');
    }
    const task = setStructuredTaskStatus(taskId, status);
    writeJson({ ok: true, task });
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
