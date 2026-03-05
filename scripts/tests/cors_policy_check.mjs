import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const api = await startApiServer({ port: 0, quiet: true });

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
  }
}

main().catch((error) => {
  console.error(`cors_policy_check: FAIL ${error.message}`);
  process.exit(1);
});
