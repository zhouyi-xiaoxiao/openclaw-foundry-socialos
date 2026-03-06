import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-cors-'));
  const dbPath = path.join(tempDir, 'cors.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const allowedOrigin = 'http://localhost:4173';
    const deniedOrigin = 'https://evil.example';

    const preflight = await fetch(`${api.baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'GET',
      },
    });
    assert(preflight.status === 204, `allowed preflight expected 204, got ${preflight.status}`);
    assert(
      preflight.headers.get('access-control-allow-origin') === allowedOrigin,
      'allowed preflight should echo allowed origin'
    );
    assert(preflight.headers.get('access-control-allow-origin') !== '*', 'wildcard CORS is forbidden');

    const denied = await fetch(`${api.baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        origin: deniedOrigin,
        'access-control-request-method': 'GET',
      },
    });
    assert(denied.status === 403, `denied preflight expected 403, got ${denied.status}`);

    const loopbackNoOrigin = await fetch(`${api.baseUrl}/health`);
    assert(loopbackNoOrigin.status === 200, `loopback health expected 200, got ${loopbackNoOrigin.status}`);

    console.log('cors_policy_check: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`cors_policy_check: FAIL ${error.message}`);
  process.exit(1);
});
