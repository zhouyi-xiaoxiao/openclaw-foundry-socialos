import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startWebServer } from '../../socialos/apps/web/server.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runExport(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/export_vc_deck.mjs'], {
      cwd: root,
      env: { ...process.env, SOCIALOS_WEB_BASE_URL: baseUrl },
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

async function main() {
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    await runExport(web.baseUrl);

    const deckSite = path.join(root, '.deck-site');
    assert(fs.existsSync(path.join(deckSite, 'index.html')), 'deck export should write root index.html');
    assert(fs.existsSync(path.join(deckSite, 'deck', 'index.html')), 'deck export should write /deck/index.html');
    assert(fs.existsSync(path.join(deckSite, 'deck', 'print', 'index.html')), 'deck export should write print variant');
    assert(fs.existsSync(path.join(deckSite, 'CNAME')), 'deck export should write CNAME');

    const indexHtml = fs.readFileSync(path.join(deckSite, 'index.html'), 'utf8');
    const printHtml = fs.readFileSync(path.join(deckSite, 'deck', 'print', 'index.html'), 'utf8');
    const cname = fs.readFileSync(path.join(deckSite, 'CNAME'), 'utf8').trim();

    assert(indexHtml.includes('SocialOS VC Deck'), 'exported root index should contain the deck title');
    assert(printHtml.includes('data-print-pdf="true"'), 'exported print variant should preserve print mode');
    assert(cname === 'zhouyixiaoxiao.org', 'deck export should target the custom domain');
    assert(!indexHtml.includes('127.0.0.1'), 'exported public deck should not expose localhost-only links');

    console.log('deck_export_smoke: PASS');
  } finally {
    await web.close();
  }
}

main().catch((error) => {
  console.error(`deck_export_smoke: FAIL ${error.message}`);
  process.exit(1);
});
