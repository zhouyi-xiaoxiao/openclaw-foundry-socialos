import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(REPO_ROOT, 'reports', 'overnight');
const RUN_REPORT_DIR = path.join(REPO_ROOT, 'reports', 'runs');
const FOUNDRY_STATE_DIR = path.join(REPO_ROOT, '.foundry');
const SUMMARY_PATH = path.join(REPORT_DIR, 'latest.md');
const JSON_PATH = path.join(REPORT_DIR, 'latest.json');
const DEMO_STATUS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'demo_status.sh');
const FOUNDRY_DISPATCH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'foundry_dispatch.sh');
const DEMO_CONTROL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'demo_service_control.mjs');
const REFRESH_PUBLIC_DOCS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'refresh_public_docs.mjs');
const RUNTIME_FILE = path.join(REPO_ROOT, 'socialos', 'openclaw', 'runtime.openclaw.json5');
const MODE_OVERRIDE_FILE = path.join(REPO_ROOT, '.foundry', 'PUBLISH_MODE');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function combineProbeOutput(primary = '', secondary = '') {
  const parts = [safeTrim(primary), safeTrim(secondary)].filter(Boolean);
  return parts.join('\n');
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractJsonObjects(raw) {
  if (typeof raw !== 'string' || !raw.includes('{')) return [];
  const objects = [];

  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          objects.push(raw.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }

  return objects;
}

function statusShapeScore(value) {
  if (!value || typeof value !== 'object') return 0;
  let score = 0;
  if (typeof value.mode === 'string') score += 1;
  if (value.queue && typeof value.queue === 'object') score += 2;
  if (value.lock && typeof value.lock === 'object') score += 1;
  if (value.health && typeof value.health === 'object') score += 1;
  if (value.latestRun && typeof value.latestRun === 'object') score += 1;
  if (Array.isArray(value.blockedHead)) score += 1;
  if (Array.isArray(value.latestDigest)) score += 1;
  if (typeof value.consecutiveFailures === 'number') score += 1;
  return score;
}

function normalizeFoundryMode(value) {
  const mode = safeTrim(value).toUpperCase();
  if (!mode) return 'unknown';
  if (mode === 'RUNNING') return 'ACTIVE';
  return mode;
}

function parseDemoStatus(output) {
  const services = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const nextMatch = line.match(
        /^(socialos-(api|web)): ready=(true|false) healthy=(true|false) pid=([^ ]+) pidAlive=(true|false) stalePid=(true|false) listeningPid=([^ ]+) unmanagedHealthy=(true|false) health=(.+)$/
      );
      if (nextMatch) {
        return {
          label: nextMatch[1],
          id: nextMatch[2],
          ready: nextMatch[3] === 'true',
          healthy: nextMatch[4] === 'true',
          pid: nextMatch[5],
          pidAlive: nextMatch[6] === 'true',
          stalePid: nextMatch[7] === 'true',
          listeningPid: nextMatch[8],
          unmanagedHealthy: nextMatch[9] === 'true',
          healthUrl: nextMatch[10],
        };
      }

      const legacyMatch = line.match(/^(socialos-(api|web)): healthy=(true|false) pid=([^ ]+) alive=(true|false) health=(.+)$/);
      if (!legacyMatch) return null;
      return {
        label: legacyMatch[1],
        id: legacyMatch[2],
        ready: legacyMatch[3] === 'true' && legacyMatch[5] === 'true',
        healthy: legacyMatch[3] === 'true',
        pid: legacyMatch[4],
        pidAlive: legacyMatch[5] === 'true',
        stalePid: false,
        listeningPid: 'none',
        unmanagedHealthy: false,
        healthUrl: legacyMatch[6],
      };
    })
    .filter(Boolean);

  return {
    services,
    allHealthy: services.length >= 2 && services.every((service) => service.ready),
  };
}

function parseFoundryStatusJson(output, commandOk) {
  const trimmed = safeTrim(output);
  const candidates = extractJsonObjects(trimmed);
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.unshift(trimmed);
  }
  if (!candidates.length) return null;

  let parsed = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    try {
      const next = JSON.parse(candidate);
      const score = statusShapeScore(next);
      if (score > bestScore) {
        parsed = next;
        bestScore = score;
      }
    } catch {
      // ignore non-JSON braces from stderr wrappers and continue scanning
    }
  }

  if (!parsed || bestScore < 2) return null;
  if (!parsed || typeof parsed !== 'object') return null;
  const queue = parsed.queue && typeof parsed.queue === 'object' ? parsed.queue : {};
  const lock = parsed.lock && typeof parsed.lock === 'object' ? parsed.lock : {};
  const latestRun = parsed.latestRun && typeof parsed.latestRun === 'object' ? parsed.latestRun : {};
  const health = parsed.health && typeof parsed.health === 'object' ? parsed.health : {};
  const blockedHead = Array.isArray(parsed.blockedHead) ? parsed.blockedHead : [];
  const latestDigest = Array.isArray(parsed.latestDigest) ? parsed.latestDigest : [];

  return {
    commandOk,
    mode: normalizeFoundryMode(typeof parsed.mode === 'string' ? parsed.mode : 'unknown'),
    lock: lock.present === true ? 'present' : lock.present === false ? 'none' : 'unknown',
    queue: {
      pending: normalizeCount(queue.pending),
      inProgress: normalizeCount(queue.inProgress),
      blocked: normalizeCount(queue.blocked),
      done: normalizeCount(queue.done),
      currentTask: typeof queue.currentTask === 'string' && queue.currentTask.trim() ? queue.currentTask.trim() : 'none',
    },
    consecutiveFailures: normalizeCount(health.consecutiveFailures ?? parsed.consecutiveFailures),
    latestRun: {
      runId: typeof latestRun.runId === 'string' && latestRun.runId.trim() ? latestRun.runId.trim() : 'unknown',
      status: typeof latestRun.status === 'string' && latestRun.status.trim() ? latestRun.status.trim() : 'unknown',
      summary: typeof latestRun.summary === 'string' && latestRun.summary.trim() ? latestRun.summary.trim() : 'unknown',
    },
    blockedHead: blockedHead
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object' && typeof entry.task === 'string') return entry.task.trim();
        return '';
      })
      .filter(Boolean),
    latestDigest: latestDigest.map((line) => (typeof line === 'string' ? line.trim() : '')).filter(Boolean),
  };
}

export function parseFoundryStatus(output, options = {}) {
  const commandOk = options.commandOk !== false;
  const parsedJson = parseFoundryStatusJson(output, commandOk);
  if (parsedJson) return parsedJson;
  const queueMatch = output.match(
    /pending\s*[:=]\s*(\d+)\s*(?:,?\s*)in[_ ]progress\s*[:=]\s*(\d+)\s*(?:,?\s*)blocked\s*[:=]\s*(\d+)\s*(?:,?\s*)done\s*[:=]\s*(\d+)/iu
  );
  const runIdMatch = output.match(/run_id\s*[:=]\s*(.+)/iu);
  const runStatusMatch = output.match(/status\s*[:=]\s*(.+)/iu);
  const runSummaryMatch = output.match(/summary\s*[:=]\s*(.+)/iu);
  const modeMatch = output.match(/mode\s*[:=]\s*(.+)/iu);
  const lockMatch = output.match(/lock\s*[:=]\s*(.+)/iu);
  const currentTaskMatch = output.match(/current[_ ]task\s*[:=]\s*(.+)/iu);
  const failureMatch = output.match(/Consecutive failures\s*[:=]\s*(\d+)/iu);
  const blockedHeadMatch = output.match(
    /Blocked queue head:\n([\s\S]*?)(?:\nLatest digest:|\nrun_reports_dir:|\nLatest run:|\n== |$)/
  );
  const digestMatch = output.match(/Latest digest:\n([\s\S]*)$/);

  const blockedHead = blockedHeadMatch
    ? blockedHeadMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && !/^none(?:\b|$)/iu.test(line))
    : [];

  const latestDigest = digestMatch
    ? digestMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && !/^none(?:\b|$)/iu.test(line) && !/^no digest yet\.?$/iu.test(line))
    : [];

  return {
    commandOk,
    mode: normalizeFoundryMode(modeMatch ? modeMatch[1] : 'unknown'),
    lock: lockMatch ? lockMatch[1].trim() : 'unknown',
    queue: {
      pending: queueMatch ? Number(queueMatch[1]) : 0,
      inProgress: queueMatch ? Number(queueMatch[2]) : 0,
      blocked: queueMatch ? Number(queueMatch[3]) : 0,
      done: queueMatch ? Number(queueMatch[4]) : 0,
      currentTask: currentTaskMatch ? currentTaskMatch[1].trim() : 'unknown',
    },
    consecutiveFailures: failureMatch ? Number(failureMatch[1]) : 0,
    latestRun: {
      runId: runIdMatch ? runIdMatch[1].trim() : 'unknown',
      status: runStatusMatch ? runStatusMatch[1].trim() : 'unknown',
      summary: runSummaryMatch ? runSummaryMatch[1].trim() : 'unknown',
    },
    blockedHead,
    latestDigest,
  };
}

function detectPublishMode() {
  if (fs.existsSync(MODE_OVERRIDE_FILE)) {
    return safeTrim(fs.readFileSync(MODE_OVERRIDE_FILE, 'utf8')) || 'dry-run';
  }

  try {
    const runtime = fs.readFileSync(RUNTIME_FILE, 'utf8');
    const match = runtime.match(/PUBLISH_MODE:\s*"([^"]+)"/);
    return match ? match[1] : 'dry-run';
  } catch {
    return 'unknown';
  }
}

function detectGitState() {
  const symbolicBranch = run('git', ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branch = safeTrim(symbolicBranch.stdout);
  const detached = !branch;
  const head = run('git', ['rev-parse', '--short', 'HEAD']);
  const status = run('git', ['status', '--short']);

  return {
    branch: branch || 'detached',
    detached,
    head: safeTrim(head.stdout) || 'unknown',
    dirty: Boolean(safeTrim(status.stdout)),
    dirtySummary: safeTrim(status.stdout).split('\n').filter(Boolean).slice(0, 10),
  };
}

function gitStateDiffers(a, b) {
  return JSON.stringify(a || {}) !== JSON.stringify(b || {});
}

function ensureReportDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function ensureLocalRuntimeDirs() {
  const created = [];
  for (const dir of [FOUNDRY_STATE_DIR, RUN_REPORT_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(path.relative(REPO_ROOT, dir));
    }
  }
  return created;
}

function writeReports(report) {
  ensureReportDir();
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Overnight Supervisor Summary',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Decision: ${report.decision}`,
    `- Next focus: ${report.nextFocus}`,
    `- Reason: ${report.reason}`,
    '',
    '## Demo',
    `- Healthy: ${report.demo.allHealthy}`,
  ];

  for (const service of report.demo.services) {
    lines.push(
      `- ${service.label}: ready=${service.ready} healthy=${service.healthy} pidAlive=${service.pidAlive} stalePid=${service.stalePid} listeningPid=${service.listeningPid} unmanagedHealthy=${service.unmanagedHealthy} url=${service.healthUrl}`
    );
  }

  lines.push(
    '',
    '## Foundry',
    `- Mode: ${report.foundry.mode}`,
    `- Status command ok: ${report.foundry.commandOk}`,
    `- Lock: ${report.foundry.lock}`,
    `- Queue: pending=${report.foundry.queue.pending} in_progress=${report.foundry.queue.inProgress} blocked=${report.foundry.queue.blocked} done=${report.foundry.queue.done}`,
    `- Current task: ${report.foundry.queue.currentTask}`,
    `- Consecutive failures: ${report.foundry.consecutiveFailures}`,
    `- Latest run: ${report.foundry.latestRun.runId} (${report.foundry.latestRun.status})`,
    `- Latest summary: ${report.foundry.latestRun.summary}`,
    '',
    '## Safety',
    `- Publish mode: ${report.safety.publishMode}`,
    `- Loopback only: ${report.safety.loopbackOnly}`,
    '',
    '## Git',
    `- Branch: ${report.git.branch}`,
    `- Detached HEAD: ${report.git.detached}`,
    `- HEAD: ${report.git.head}`,
    `- Dirty: ${report.git.dirty}`,
  );

  if (report.git.dirtySummary.length) {
    lines.push('- Dirty summary:');
    for (const entry of report.git.dirtySummary) {
      lines.push(`  - ${entry}`);
    }
  }

  if (report.actions.length) {
    lines.push('', '## Actions taken');
    for (const action of report.actions) {
      lines.push(`- ${action}`);
    }
  }

  if (report.foundry.blockedHead.length) {
    lines.push('', '## Blocked queue head');
    for (const entry of report.foundry.blockedHead) {
      lines.push(`- ${entry}`);
    }
  }

  if (report.foundry.latestDigest.length) {
    lines.push('', '## Latest digest');
    for (const entry of report.foundry.latestDigest) {
      lines.push(`- ${entry}`);
    }
  }

  fs.writeFileSync(SUMMARY_PATH, `${lines.join('\n')}\n`, 'utf8');
}

export function determineDecision({ demo, foundry, publishMode }) {
  if (publishMode !== 'dry-run') {
    return {
      decision: 'stop',
      nextFocus: 'stabilize-and-report',
      reason: `Publish mode is ${publishMode}; overnight loop must stay dry-run.`,
    };
  }

  if (!demo.allHealthy) {
    return {
      decision: 'stop',
      nextFocus: 'stabilize-demo',
      reason: 'Loopback demo services are unhealthy after restart attempt.',
    };
  }

  if (foundry.consecutiveFailures >= 2) {
    return {
      decision: 'stop',
      nextFocus: 'stabilize-foundry',
      reason: `Foundry has ${foundry.consecutiveFailures} consecutive failures.`,
    };
  }

  if (!foundry.commandOk) {
    return {
      decision: 'stop',
      nextFocus: 'stabilize-foundry',
      reason: 'Foundry STATUS command failed or returned empty output.',
    };
  }

  if (foundry.mode === 'PAUSED') {
    return {
      decision: 'stop',
      nextFocus: 'stabilize-foundry',
      reason: 'Foundry is paused; resume intentionally before unattended overnight iteration.',
    };
  }

  if (foundry.queue.pending > 0 || foundry.queue.inProgress > 0) {
    return {
      decision: 'continue',
      nextFocus: 'respect-foundry-queue',
      reason: 'Foundry already has active queue work; outer loop should bias to validation and repo trust.',
    };
  }

  return {
    decision: 'continue',
    nextFocus: 'workspace-usability-and-demo-trust',
    reason: 'Repo is healthy; continue aggressive product/core polish in Workspace, Contacts, Drafts, and Queue.',
  };
}

function printSummary(report) {
  console.log(`overnight_supervisor: ${report.decision}`);
  console.log(`next_focus: ${report.nextFocus}`);
  console.log(`reason: ${report.reason}`);
  console.log(`report_md: ${SUMMARY_PATH}`);
  console.log(`report_json: ${JSON_PATH}`);
}

function restartDemoIfNeeded(demo, actions) {
  if (demo.allHealthy) return demo;

  actions.push('Demo services unhealthy; attempted local restart via demo_service_control.mjs start.');
  const startResult = run('node', [DEMO_CONTROL_SCRIPT, 'start']);
  if (startResult.status !== 0) {
    actions.push(`Demo restart failed: ${safeTrim(startResult.stderr) || safeTrim(startResult.stdout) || 'unknown error'}`);
  }

  const retryStatus = run('bash', [DEMO_STATUS_SCRIPT]);
  return parseDemoStatus(retryStatus.stdout);
}

function main() {
  const actions = [];
  const createdDirs = ensureLocalRuntimeDirs();
  if (createdDirs.length) {
    actions.push(`Bootstrapped local runtime directories: ${createdDirs.join(', ')}`);
  }
  const demoStatusResult = run('bash', [DEMO_STATUS_SCRIPT]);
  const initialDemo = parseDemoStatus(demoStatusResult.stdout);
  const demo = restartDemoIfNeeded(initialDemo, actions);

  const foundryStatusResult = run('bash', [FOUNDRY_DISPATCH_SCRIPT, 'STATUS']);
  const foundryStatusOutput = combineProbeOutput(foundryStatusResult.stdout, foundryStatusResult.stderr);
  const foundryCommandOk = foundryStatusResult.status === 0 && Boolean(foundryStatusOutput);
  if (!foundryCommandOk) {
    const detail = foundryStatusOutput || 'empty output';
    actions.push(`Foundry STATUS check failed: ${detail}`);
  }
  const foundry = parseFoundryStatus(foundryStatusOutput, { commandOk: foundryCommandOk });
  const publishMode = detectPublishMode();
  const decision = determineDecision({ demo, foundry, publishMode });

  const report = {
    generatedAt: new Date().toISOString(),
    decision: decision.decision,
    nextFocus: decision.nextFocus,
    reason: decision.reason,
    demo,
    foundry,
    safety: {
      publishMode,
      loopbackOnly: true,
    },
    git: {
      branch: 'unknown',
      detached: true,
      head: 'unknown',
      dirty: false,
      dirtySummary: [],
    },
    actions,
  };

  const refreshResult = run('node', [REFRESH_PUBLIC_DOCS_SCRIPT, '--source', 'overnight_supervisor']);
  if (refreshResult.status === 0) {
    report.actions.push('Refreshed generated public docs and evidence status.');
  } else {
    report.actions.push(
      `Public docs refresh failed: ${safeTrim(refreshResult.stderr) || safeTrim(refreshResult.stdout) || 'unknown error'}`
    );
  }

  // Capture git state as late as possible so summary trust matches the final run outcome.
  report.git = detectGitState();
  writeReports(report);
  const gitAfterReportWrite = detectGitState();
  if (gitStateDiffers(report.git, gitAfterReportWrite)) {
    report.git = gitAfterReportWrite;
    writeReports(report);
  }
  printSummary(report);

  if (report.decision === 'stop') {
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
