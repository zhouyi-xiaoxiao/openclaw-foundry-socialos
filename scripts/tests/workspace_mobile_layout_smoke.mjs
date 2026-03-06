import { startWebServer } from '../../socialos/apps/web/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    const response = await fetch(`${web.baseUrl}/quick-capture`);
    const html = await response.text();

    assert(response.status === 200, `/quick-capture should return 200 (got ${response.status})`);
    assert(html.includes('data-mobile-context-sections'), 'workspace should expose a dedicated mobile context container');
    assert(html.includes('.workspace-summary-strip'), 'workspace should include the unified summary strip styles');
    assert(html.includes('data-workspace-rail-tabs'), 'workspace should render a tabbed context rail');
    assert(
      html.includes('@media (max-width: 1080px)') &&
        html.includes('grid-template-columns: 1fr;') &&
        html.includes('data-workspace-chat-form'),
      'workspace should include mobile stacking rules and a single composer'
    );

    console.log('workspace_mobile_layout_smoke: PASS');
  } finally {
    await web.close();
  }
}

main().catch((error) => {
  console.error(`workspace_mobile_layout_smoke: FAIL ${error.message}`);
  process.exit(1);
});
