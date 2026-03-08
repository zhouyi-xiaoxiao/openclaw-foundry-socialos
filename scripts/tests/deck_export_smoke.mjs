import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { startWebServer } from '../../socialos/apps/web/server.mjs';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bountyIds = ['claw-for-human', 'animoca', 'human-for-claw', 'z-ai-general', 'ai-agents-for-good'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runExport(webBaseUrl, apiBaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/export_vc_deck.mjs'], {
      cwd: root,
      env: { ...process.env, SOCIALOS_WEB_BASE_URL: webBaseUrl, SOCIALOS_API_BASE_URL: apiBaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`export_vc_deck should exit 0 (got ${code}): ${stderr || stdout}`));
      }
    });
  });
}

function seedTempDemo(dbPath) {
  const result = spawnSync('node', ['scripts/seed_demo_data.mjs', '--reset-review-demo'], {
    cwd: root,
    env: { ...process.env, SOCIALOS_DB_PATH: dbPath },
    encoding: 'utf8',
  });
  assert(result.status === 0, `seed_demo_data should exit 0 (got ${result.status}): ${result.stderr || result.stdout}`);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-deck-export-'));
  const dbPath = path.join(tempDir, 'deck-export.db');
  seedTempDemo(dbPath);
  const api = await startApiServer({ port: 0, quiet: true, dbPath });
  const web = await startWebServer({ port: 0, quiet: true, apiBaseUrl: api.baseUrl });

  try {
    await runExport(web.baseUrl, api.baseUrl);

    const deckSite = path.join(root, '.deck-site');
    assert(fs.existsSync(path.join(deckSite, 'index.html')), 'deck export should write root index.html');
    assert(fs.existsSync(path.join(deckSite, 'deck', 'index.html')), 'deck export should write /deck/index.html');
    assert(fs.existsSync(path.join(deckSite, 'deck', 'print', 'index.html')), 'deck export should write print variant');
    assert(fs.existsSync(path.join(deckSite, 'demo', 'index.html')), 'deck export should write /demo/index.html');
    assert(fs.existsSync(path.join(deckSite, 'hackathon', 'index.html')), 'deck export should write /hackathon/index.html');
    assert(fs.existsSync(path.join(deckSite, 'buddy', 'index.html')), 'deck export should write /buddy/index.html');
    for (const bountyId of bountyIds) {
      assert(fs.existsSync(path.join(deckSite, 'videos', bountyId, 'index.html')), `deck export should write /videos/${bountyId}/index.html`);
    }
    assert(fs.existsSync(path.join(deckSite, 'data', 'hackathon-overview.json')), 'deck export should write hackathon overview JSON');
    assert(fs.existsSync(path.join(deckSite, 'data', 'proofs', 'all.json')), 'deck export should write proof catalog JSON');
    assert(fs.existsSync(path.join(deckSite, 'data', 'proofs', 'z-ai-general.json')), 'deck export should write bounty proof JSON');
    assert(fs.existsSync(path.join(deckSite, 'CNAME')), 'deck export should write CNAME');

    const indexHtml = fs.readFileSync(path.join(deckSite, 'index.html'), 'utf8');
    const printHtml = fs.readFileSync(path.join(deckSite, 'deck', 'print', 'index.html'), 'utf8');
    const demoHtml = fs.readFileSync(path.join(deckSite, 'demo', 'index.html'), 'utf8');
    const hackathonHtml = fs.readFileSync(path.join(deckSite, 'hackathon', 'index.html'), 'utf8');
    const buddyHtml = fs.readFileSync(path.join(deckSite, 'buddy', 'index.html'), 'utf8');
    const videoPlaceholderHtml = fs.readFileSync(path.join(deckSite, 'videos', 'z-ai-general', 'index.html'), 'utf8');
    const cname = fs.readFileSync(path.join(deckSite, 'CNAME'), 'utf8').trim();

    assert(indexHtml.includes('SocialOS VC Deck'), 'exported root index should contain the deck title');
    assert(printHtml.includes('data-print-pdf="true"'), 'exported print variant should preserve print mode');
    assert(demoHtml.includes('Auxiliary public proof page'), 'exported demo page should render in public proof mode');
    assert(hackathonHtml.includes('Canonical public bounty hub'), 'exported hackathon page should render in public proof mode');
    assert(hackathonHtml.includes('id="bounty-z-ai-general"'), 'exported hackathon page should keep same-page bounty anchors');
    assert(buddyHtml.includes('Auxiliary public Buddy page'), 'exported buddy page should render in public proof mode');
    assert(videoPlaceholderHtml.includes('Open final video on OneDrive'), 'exported video page should render the hosted video link');
    assert(videoPlaceholderHtml.includes('https://uob-my.sharepoint.com/'), 'exported video page should include the hosted OneDrive URL');
    assert(videoPlaceholderHtml.includes('/data/proofs/z-ai-general.json'), 'exported video placeholder page should keep the matching proof JSON link');
    assert(cname === 'zhouyixiaoxiao.org', 'deck export should target the custom domain');
    assert(!indexHtml.includes('127.0.0.1'), 'exported public deck should not expose localhost-only links');
    assert(!demoHtml.includes('127.0.0.1'), 'exported public demo should not expose localhost-only links');
    assert(!hackathonHtml.includes('127.0.0.1'), 'exported public hackathon should not expose localhost-only links');
    assert(!buddyHtml.includes('127.0.0.1'), 'exported public buddy should not expose localhost-only links');
    assert(!videoPlaceholderHtml.includes('127.0.0.1'), 'exported video placeholder page should not expose localhost-only links');
    assert(!demoHtml.includes('data-api-form'), 'exported public demo should not expose interactive API forms');
    assert(!hackathonHtml.includes('data-api-form'), 'exported public hackathon should not expose interactive API forms');
    assert(!buddyHtml.includes('data-api-form'), 'exported public buddy should not expose interactive API forms');
    assert(!videoPlaceholderHtml.includes('data-api-form'), 'exported video placeholder page should not expose interactive API forms');

    console.log('deck_export_smoke: PASS');
  } finally {
    await api.close();
    await web.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`deck_export_smoke: FAIL ${error.message}`);
  process.exit(1);
});
