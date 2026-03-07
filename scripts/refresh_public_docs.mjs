import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(REPO_ROOT, 'socialos', 'docs', 'SYSTEM_MANIFEST.json');
const DOCS_DIR = path.join(REPO_ROOT, 'socialos', 'docs');
const EVIDENCE_DIR = path.join(DOCS_DIR, 'evidence');
const AGENT_DIR = path.join(DOCS_DIR, 'agent');
const STATUS_PATH = path.join(DOCS_DIR, 'STATUS.md');
const REPO_STATE_PATH = path.join(AGENT_DIR, 'REPO_STATE.md');
const VALIDATION_PATH = path.join(EVIDENCE_DIR, 'LATEST_VALIDATION.md');
const PITCH_DIR = path.join(DOCS_DIR, 'pitch');
const DECK_STATUS_PATH = path.join(PITCH_DIR, 'DECK_STATUS.json');
const OVERNIGHT_JSON_PATH = path.join(REPO_ROOT, 'reports', 'overnight', 'latest.json');
const PUBLIC_REPO_URL = 'https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos';

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

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const options = {
    validationPassed: false,
    source: 'manual refresh',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--validation-passed') {
      options.validationPassed = true;
      continue;
    }
    if (value === '--source' && argv[index + 1]) {
      options.source = argv[index + 1];
      index += 1;
    }
  }

  return options;
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

function readPreviousValidationSnapshot() {
  if (!fs.existsSync(VALIDATION_PATH)) {
    return { latestGreenAt: null, latestGreenHead: null };
  }

  const raw = fs.readFileSync(VALIDATION_PATH, 'utf8');
  const timeMatch = raw.match(/^- Latest green validation: (.+)$/mu);
  const headMatch = raw.match(/^- Git head: (.+)$/mu);

  return {
    latestGreenAt: timeMatch ? safeTrim(timeMatch[1]) : null,
    latestGreenHead: headMatch ? safeTrim(headMatch[1]) : null,
  };
}

function collectEvidenceFiles() {
  if (!fs.existsSync(EVIDENCE_DIR)) return [];

  return fs
    .readdirSync(EVIDENCE_DIR)
    .filter((fileName) => fileName !== 'LATEST_VALIDATION.md')
    .sort();
}

function detectGitState() {
  const branch = safeTrim(run('git', ['symbolic-ref', '--short', '-q', 'HEAD']).stdout) || 'detached';
  const head = safeTrim(run('git', ['rev-parse', '--short', 'HEAD']).stdout) || 'unknown';
  const status = safeTrim(run('git', ['status', '--short']).stdout);

  return {
    branch,
    head,
    dirty: Boolean(status),
    dirtySummary: status.split('\n').filter(Boolean).slice(0, 12),
  };
}

function detectPublishMode() {
  const runtimePath = path.join(REPO_ROOT, 'socialos', 'openclaw', 'runtime.openclaw.json5');
  try {
    const raw = fs.readFileSync(runtimePath, 'utf8');
    const match = raw.match(/PUBLISH_MODE:\s*"([^"]+)"/);
    return match ? match[1] : 'dry-run';
  } catch {
    return 'dry-run';
  }
}

function buildStatusMarkdown({ generatedAt, manifest, overnightReport, demo, publishMode, git, evidenceFiles }) {
  const degraded = !demo.allHealthy || publishMode !== 'dry-run';
  const lines = [
    '# Public Status',
    '',
    `- Generated: ${generatedAt}`,
    `- Product posture: ${manifest.system?.posture || 'local-first'}`,
    `- Network exposure: ${manifest.system?.networkExposure || 'loopback-only'}`,
    `- Publish mode: ${publishMode === 'dry-run' ? 'Safe rehearsal' : publishMode}`,
    `- Demo healthy: ${demo.allHealthy}`,
    `- Git head: ${git.head}`,
    '',
    '## Current Readout',
    degraded
      ? '- The repo is in a degraded state for public handoff right now. Read the demo and overnight status before presenting it as fully healthy.'
      : '- The repo is currently healthy enough to present as a judge-facing local-first package.',
    overnightReport?.reason ? `- Overnight supervisor reason: ${overnightReport.reason}` : '- Overnight supervisor summary is not available yet.',
    overnightReport?.nextFocus ? `- Next focus: ${overnightReport.nextFocus}` : '- Next focus: not yet recorded.',
    '',
    '## Demo Endpoints',
  ];

  for (const service of demo.services) {
    lines.push(
      `- ${service.label}: ready=${service.ready} healthy=${service.healthy} pidAlive=${service.pidAlive} stalePid=${service.stalePid} url=${service.healthUrl}`
    );
  }

  lines.push(
    '',
    '## Public Docs',
    '- Human landing page: `README.md`',
    '- Agent handoff: `AGENTS.md`',
    '- Docs Index: `socialos/docs/DOCS_INDEX.md`',
    '- Machine manifest: `socialos/docs/SYSTEM_MANIFEST.json`',
    '',
    '## Curated Evidence',
  );

  for (const fileName of evidenceFiles) {
    lines.push(`- socialos/docs/evidence/${fileName}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildRepoStateMarkdown({ generatedAt, manifest, git, overnightReport, evidenceFiles }) {
  const subsystemOwnership = Array.isArray(manifest.subsystemOwnership) ? manifest.subsystemOwnership : [];
  const pitchPack = Array.isArray(manifest.pitchPack) ? manifest.pitchPack : [];
  const generatedStatusFiles = Array.isArray(manifest.generatedStatusFiles) ? manifest.generatedStatusFiles : [];
  const scripts = Array.isArray(manifest.scripts) ? manifest.scripts : [];
  const refreshScript = manifest.refreshScript || 'scripts/refresh_public_docs.mjs';
  const deckRoute = manifest.deckRoute || '/deck';
  const deckSpec = manifest.deckSpec || 'socialos/docs/pitch/VC_DECK_SPEC.md';
  const deckMaintenance = manifest.deckMaintenance || 'socialos/docs/pitch/DECK_MAINTENANCE.md';

  const lines = [
    '# Repo State Handoff',
    '',
    `- Generated: ${generatedAt}`,
    `- Branch: ${git.branch}`,
    `- Git head: ${git.head}`,
    `- Dirty working tree: ${git.dirty}`,
    '',
    '## Canonical Chain',
    '- `README.md` -> human and judge entrypoint',
    '- `AGENTS.md` -> repo-level agent handoff',
    '- `socialos/docs/AGENT_PLAYBOOK.md` -> operational instructions',
    '- `socialos/docs/SYSTEM_MANIFEST.json` -> machine-readable source of truth',
    '- `socialos/docs/DOCS_INDEX.md` -> cross-linked docs map',
    '',
    '## Pitch Pack',
  ];

  for (const filePath of pitchPack) {
    lines.push(`- \`${filePath}\``);
  }

  lines.push('', '## Deck Surface', `- Route: \`${deckRoute}\``, `- Deck spec: \`${deckSpec}\``, `- Deck maintenance: \`${deckMaintenance}\``);

  lines.push('', '## Authoritative Subsystems');
  for (const item of subsystemOwnership) {
    lines.push(`- ${item.subsystem}: \`${item.authoritativePath}\``);
  }

  lines.push('', '## Generated Docs');
  for (const filePath of generatedStatusFiles) {
    lines.push(`- \`${filePath}\``);
  }

  lines.push(
    '',
    '## Refresh Flow',
    `- Manual: \`node ${refreshScript}\``,
    '- After green validation: run with `--validation-passed` so the latest validation snapshot is refreshed.',
    '- Overnight: `scripts/overnight_supervisor.sh` refreshes the generated docs after writing the local summary.',
    '',
    '## Evidence Files',
  );

  for (const fileName of evidenceFiles) {
    lines.push(`- \`socialos/docs/evidence/${fileName}\``);
  }

  if (git.dirtySummary.length) {
    lines.push('', '## Dirty Summary');
    for (const entry of git.dirtySummary) {
      lines.push(`- ${entry}`);
    }
  }

  if (overnightReport?.nextFocus || overnightReport?.reason) {
    lines.push('', '## Overnight Context');
    if (overnightReport.nextFocus) lines.push(`- Next focus: ${overnightReport.nextFocus}`);
    if (overnightReport.reason) lines.push(`- Reason: ${overnightReport.reason}`);
  }

  lines.push('', '## Script Entry Points');
  for (const item of scripts) {
    lines.push(`- \`${item.command}\` -> ${item.purpose}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildValidationMarkdown({
  generatedAt,
  source,
  validationPassed,
  previousValidation,
  git,
  demo,
  evidenceFiles,
}) {
  const latestGreenAt = validationPassed ? generatedAt : previousValidation.latestGreenAt;
  const latestGreenHead = validationPassed ? git.head : previousValidation.latestGreenHead;

  const lines = [
    '# Latest Validation Snapshot',
    '',
    `- Generated: ${generatedAt}`,
    `- Refreshed by: ${source}`,
    `- Latest green validation: ${latestGreenAt || 'not recorded yet'}`,
    `- Git head: ${latestGreenHead || git.head}`,
    '',
    '## Current Health Snapshot',
    `- Demo healthy: ${demo.allHealthy}`,
  ];

  for (const service of demo.services) {
    lines.push(`- ${service.label}: ready=${service.ready} healthy=${service.healthy} pidAlive=${service.pidAlive} stalePid=${service.stalePid}`);
  }

  lines.push(
    '',
    '## Evidence Pointers',
  );
  for (const fileName of evidenceFiles) {
    lines.push(`- \`socialos/docs/evidence/${fileName}\``);
  }

  lines.push(
    '',
    validationPassed
      ? '- This refresh followed a green validation path and updated the latest validation marker.'
      : '- This refresh did not assert a new green validation. Keep using the last green marker above as the authoritative reference.'
  );

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(AGENT_DIR);
  ensureDir(EVIDENCE_DIR);
  ensureDir(PITCH_DIR);

  const generatedAt = new Date().toISOString();
  const manifest = readJsonSafe(MANIFEST_PATH, {});
  const overnightReport = readJsonSafe(OVERNIGHT_JSON_PATH, null);
  const git = detectGitState();
  const demo = parseDemoStatus(run('bash', [path.join(REPO_ROOT, 'scripts', 'demo_status.sh')]).stdout);
  const publishMode = detectPublishMode();
  const evidenceFiles = collectEvidenceFiles();
  const previousValidation = readPreviousValidationSnapshot();

  const statusMarkdown = buildStatusMarkdown({ generatedAt, manifest, overnightReport, demo, publishMode, git, evidenceFiles });
  const repoStateMarkdown = buildRepoStateMarkdown({ generatedAt, manifest, git, overnightReport, evidenceFiles });
  const validationMarkdown = buildValidationMarkdown({
    generatedAt,
    source: options.source,
    validationPassed: options.validationPassed,
    previousValidation,
    git,
    demo,
    evidenceFiles,
  });

  fs.writeFileSync(STATUS_PATH, statusMarkdown, 'utf8');
  fs.writeFileSync(REPO_STATE_PATH, repoStateMarkdown, 'utf8');
  fs.writeFileSync(VALIDATION_PATH, validationMarkdown, 'utf8');
  fs.writeFileSync(
    DECK_STATUS_PATH,
    JSON.stringify(
      {
        generatedAt,
        latestGreenValidationAt: options.validationPassed ? generatedAt : previousValidation.latestGreenAt,
        repoHead: options.validationPassed ? git.head : previousValidation.latestGreenHead || git.head,
        validationSource: options.source,
        demo: {
          healthy: demo.allHealthy,
          summary: demo.allHealthy
            ? 'Local demo services are healthy and ready for rehearsal.'
            : 'Local demo services are degraded; use the deck with caution until the demo is healthy again.',
          services: demo.services,
        },
        evidence: {
          screenshots: evidenceFiles.filter((fileName) => /\.(png|jpg|jpeg)$/iu.test(fileName)).map((fileName) => `socialos/docs/evidence/${fileName}`),
          animations: evidenceFiles.filter((fileName) => /\.gif$/iu.test(fileName)).map((fileName) => `socialos/docs/evidence/${fileName}`),
          documents: evidenceFiles.filter((fileName) => /\.(md|json)$/iu.test(fileName)).map((fileName) => `socialos/docs/evidence/${fileName}`),
        },
        publicRepoUrl: PUBLIC_REPO_URL,
        posture: {
          localFirst: true,
          loopbackOnly: true,
          publishMode: publishMode,
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(`refresh_public_docs: PASS source=${options.source} validation=${options.validationPassed ? 'green' : 'carry-forward'}`);
  console.log(`status_md: ${STATUS_PATH}`);
  console.log(`repo_state_md: ${REPO_STATE_PATH}`);
  console.log(`validation_md: ${VALIDATION_PATH}`);
  console.log(`deck_status_json: ${DECK_STATUS_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
