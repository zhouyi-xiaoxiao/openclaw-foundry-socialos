#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createStudioControlPlane } from '../socialos/lib/studio-control-plane.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(process.env.SOCIALOS_REPO_ROOT || path.join(__dirname, '..'));
const SCHEMA_PATH = path.join(REPO_ROOT, 'infra/db/schema.sql');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'infra/db/socialos.db');

function usage() {
  console.log(`Usage:
  node scripts/studio_cli.mjs status
  node scripts/studio_cli.mjs bootstrap
  node scripts/studio_cli.mjs tasks [--limit N]
  node scripts/studio_cli.mjs settings
  node scripts/studio_cli.mjs task-create --task "Improve Studio run evidence"
  node scripts/studio_cli.mjs task-run --task-id TASK-...
  node scripts/studio_cli.mjs run-once
  node scripts/studio_cli.mjs pause
  node scripts/studio_cli.mjs resume
  node scripts/studio_cli.mjs notify

Options:
  --db <sqlite_path>   override the default Studio DB path
`);
}

function parseArgs(argv) {
  const parsed = { _: [], dbPath: DEFAULT_DB_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function initDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) {
    usage();
    process.exit(command ? 0 : 1);
  }

  const dbPath = path.resolve(String(args.dbPath || args.db || DEFAULT_DB_PATH));
  const db = initDb(dbPath);
  const studio = createStudioControlPlane({
    db,
    repoRoot: REPO_ROOT,
    dbPath,
    env: process.env,
  });

  try {
    if (command === 'status') {
      print(studio.getStatus());
      return;
    }

    if (command === 'bootstrap') {
      print(studio.buildBootstrap());
      return;
    }

    if (command === 'tasks') {
      const limit = Number(args.limit || 12);
      print({ tasks: studio.listTasks({ limit }) });
      return;
    }

    if (command === 'settings') {
      print(studio.getSettingsPayload());
      return;
    }

    if (command === 'task-create') {
      const task = studio.createTask({
        taskText: args.task || args.title,
        goal: args.goal,
        acceptanceCriteria: args.acceptanceCriteria,
        constraints: args.constraints,
        scope: args.scope,
        repoTargets: args.repoTargets,
        preferredTests: args.preferredTests,
      });
      print({ task });
      return;
    }

    if (command === 'task-run') {
      if (!args.taskId) {
        throw new Error('--task-id is required');
      }
      print(studio.runTask(String(args.taskId)));
      return;
    }

    if (['run-once', 'pause', 'resume', 'notify'].includes(command)) {
      print(studio.executeCommand(command));
      return;
    }

    throw new Error(`unknown command: ${command}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
