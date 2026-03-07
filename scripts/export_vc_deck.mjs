#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outputRoot = path.join(repoRoot, '.deck-site');
const webBaseUrl = process.env.SOCIALOS_WEB_BASE_URL || 'http://127.0.0.1:4173';
const customDomain = process.env.SOCIALOS_DECK_DOMAIN || 'zhouyixiaoxiao.org';

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function writeFile(target, content) {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content, 'utf8');
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

function buildRedirectHtml(targetPath) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${targetPath}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SocialOS VC Deck Redirect</title>
  </head>
  <body>
    <p>Redirecting to <a href="${targetPath}">${targetPath}</a>…</p>
  </body>
</html>
`;
}

async function main() {
  const deckHtml = await fetchText(`${webBaseUrl}/deck`);
  const printHtml = await fetchText(`${webBaseUrl}/deck?print-pdf`);

  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDir(outputRoot);

  await writeFile(path.join(outputRoot, 'index.html'), deckHtml);
  await writeFile(path.join(outputRoot, 'deck', 'index.html'), deckHtml);
  await writeFile(path.join(outputRoot, 'deck', 'print', 'index.html'), printHtml);
  await writeFile(path.join(outputRoot, '404.html'), buildRedirectHtml('/'));
  await writeFile(path.join(outputRoot, 'CNAME'), `${customDomain}\n`);
  await writeFile(
    path.join(outputRoot, 'robots.txt'),
    ['User-agent: *', 'Allow: /', 'Sitemap: https://zhouyixiaoxiao.org/'].join('\n') + '\n',
  );

  const statusPayload = {
    generatedAt: new Date().toISOString(),
    source: webBaseUrl,
    customDomain,
    exportedFiles: [
      'index.html',
      'deck/index.html',
      'deck/print/index.html',
      '404.html',
      'CNAME',
      'robots.txt',
    ],
  };
  await writeFile(path.join(outputRoot, 'deck-status.json'), JSON.stringify(statusPayload, null, 2));

  console.log(`export_vc_deck: PASS output=${outputRoot}`);
}

main().catch((error) => {
  console.error(`export_vc_deck: FAIL ${error.message}`);
  process.exitCode = 1;
});
