import { DASHBOARD_PAGES, startWebServer } from '../../socialos/apps/web/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectPage(baseUrl, page) {
  const response = await fetch(`${baseUrl}${page.path}`);
  const html = await response.text();

  assert(response.status === 200, `${page.path} should return 200 (got ${response.status})`);
  assert(html.includes(`<h1>${page.title}</h1>`), `${page.path} missing page heading ${page.title}`);

  for (const navPage of DASHBOARD_PAGES) {
    assert(
      html.includes(`href="${navPage.path}"`),
      `${page.path} missing nav link ${navPage.path}`
    );
  }

  if (page.path === '/settings') {
    assert(html.includes('Structured Task Intake'), 'settings page should render structured task intake');
    assert(html.includes('Foundry Execution Surface'), 'settings page should render generic execution panel');
  }
}

async function main() {
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    const root = await fetch(`${web.baseUrl}/`, { redirect: 'manual' });
    assert(root.status === 302, `root should redirect to /quick-capture (got ${root.status})`);
    assert(
      root.headers.get('location') === '/quick-capture',
      `root redirect location mismatch: ${root.headers.get('location')}`
    );

    for (const page of DASHBOARD_PAGES) {
      await expectPage(web.baseUrl, page);
    }

    const peopleDetail = await fetch(`${web.baseUrl}/people/demo-person`);
    const peopleDetailHtml = await peopleDetail.text();
    assert(peopleDetail.status === 200, `/people/:id should resolve through the People page (got ${peopleDetail.status})`);
    assert(peopleDetailHtml.includes('<h1>Contacts</h1>'), '/people/:id should still render the Contacts page shell');

    const missing = await fetch(`${web.baseUrl}/missing-route`, { redirect: 'manual' });
    assert(missing.status === 404, `missing route should return 404 (got ${missing.status})`);

    console.log(`web_routes_smoke: PASS routes=${DASHBOARD_PAGES.length}`);
  } finally {
    await web.close();
  }
}

main().catch((error) => {
  console.error(`web_routes_smoke: FAIL ${error.message}`);
  process.exit(1);
});
