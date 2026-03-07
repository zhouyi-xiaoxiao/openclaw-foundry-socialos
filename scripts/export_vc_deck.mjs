#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outputRoot = path.join(repoRoot, '.deck-site');
const webBaseUrl = process.env.SOCIALOS_WEB_BASE_URL || 'http://127.0.0.1:4173';
const apiBaseUrl = process.env.SOCIALOS_API_BASE_URL || 'http://127.0.0.1:8787';
const customDomain = process.env.SOCIALOS_DECK_DOMAIN || 'zhouyixiaoxiao.org';
const bountyIds = ['claw-for-human', 'animoca', 'human-for-claw', 'z-ai-general', 'ai-agents-for-good'];

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

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
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
  const htmlPages = [
    { output: 'index.html', source: `${webBaseUrl}/deck` },
    { output: 'deck/index.html', source: `${webBaseUrl}/deck` },
    { output: 'deck/print/index.html', source: `${webBaseUrl}/deck?print-pdf` },
    { output: 'demo/index.html', source: `${webBaseUrl}/demo?mode=public` },
    { output: 'hackathon/index.html', source: `${webBaseUrl}/hackathon?mode=public` },
    { output: 'buddy/index.html', source: `${webBaseUrl}/buddy?mode=public` },
  ];
  const jsonExports = [
    { output: 'data/hackathon-overview.json', source: `${apiBaseUrl}/hackathon/overview` },
    { output: 'data/proofs/all.json', source: `${apiBaseUrl}/proofs?limit=24` },
    ...bountyIds.map((bountyId) => ({
      output: `data/proofs/${bountyId}.json`,
      source: `${apiBaseUrl}/proofs?limit=24&bounty=${encodeURIComponent(bountyId)}`,
    })),
  ];

  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDir(outputRoot);

  for (const page of htmlPages) {
    const html = await fetchText(page.source);
    await writeFile(path.join(outputRoot, page.output), html);
  }

  for (const item of jsonExports) {
    const payload = await fetchJson(item.source);
    await writeFile(path.join(outputRoot, item.output), JSON.stringify(payload, null, 2) + '\n');
  }

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
    apiBaseUrl,
    exportedFiles: [...htmlPages.map((page) => page.output), ...jsonExports.map((item) => item.output), '404.html', 'CNAME', 'robots.txt'],
  };
  await writeFile(path.join(outputRoot, 'deck-status.json'), JSON.stringify(statusPayload, null, 2));

  console.log(`export_vc_deck: PASS output=${outputRoot}`);
}

main().catch((error) => {
  console.error(`export_vc_deck: FAIL ${error.message}`);
  process.exitCode = 1;
});
