import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const result = spawnSync('node', ['scripts/refresh_public_docs.mjs', '--validation-passed', '--source', 'refresh_public_docs_smoke'], {
  cwd: root,
  encoding: 'utf8',
});

assert(result.status === 0, `refresh_public_docs should exit 0 (got ${result.status}): ${result.stderr || result.stdout}`);

const statusDoc = read('socialos/docs/STATUS.md');
const repoStateDoc = read('socialos/docs/agent/REPO_STATE.md');
const validationDoc = read('socialos/docs/evidence/LATEST_VALIDATION.md');

assert(statusDoc.includes('# Public Status'), 'STATUS.md should render a public status heading');
assert(statusDoc.includes('Demo healthy:'), 'STATUS.md should include demo health');
assert(statusDoc.includes('Docs Index'), 'STATUS.md should point at the docs chain');

assert(repoStateDoc.includes('# Repo State Handoff'), 'REPO_STATE.md should render a repo state heading');
assert(repoStateDoc.includes('Pitch Pack'), 'REPO_STATE.md should include the pitch pack');
assert(repoStateDoc.includes('Refresh Flow'), 'REPO_STATE.md should include refresh flow');

assert(validationDoc.includes('# Latest Validation Snapshot'), 'LATEST_VALIDATION.md should render a validation heading');
assert(validationDoc.includes('Latest green validation:'), 'LATEST_VALIDATION.md should include the latest green validation marker');
assert(validationDoc.includes('This refresh followed a green validation path'), 'LATEST_VALIDATION.md should record green validation refreshes');

console.log('refresh_public_docs_smoke: PASS');
