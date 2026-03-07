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
    assert(html.includes(`href="${navPage.path}"`), `${page.path} missing nav link ${navPage.path}`);
  }

  if (page.path === '/studio') {
    for (const label of ['Overview', 'Tasks', 'Runs', 'Agents', 'Policies']) {
      assert(html.includes(label), `/studio should render ${label} tab`);
    }
  }
}

async function main() {
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    const root = await fetch(`${web.baseUrl}/`, { redirect: 'manual' });
    assert(root.status === 302, `root should redirect to /quick-capture (got ${root.status})`);
    assert(root.headers.get('location') === '/quick-capture', `root redirect location mismatch: ${root.headers.get('location')}`);

    const cockpit = await fetch(`${web.baseUrl}/cockpit`, { redirect: 'manual' });
    assert(cockpit.status === 302, `/cockpit should redirect to the unified workspace (got ${cockpit.status})`);
    assert(cockpit.headers.get('location') === '/quick-capture', `/cockpit redirect mismatch: ${cockpit.headers.get('location')}`);

    const ask = await fetch(`${web.baseUrl}/ask?q=who%20is%20alex`, { redirect: 'manual' });
    assert(ask.status === 302, `/ask should redirect to the unified workspace (got ${ask.status})`);
    assert(ask.headers.get('location') === '/quick-capture?q=who+is+alex', `/ask redirect mismatch: ${ask.headers.get('location')}`);

    const digest = await fetch(`${web.baseUrl}/dev-digest`, { redirect: 'manual' });
    assert(digest.status === 302, `/dev-digest should redirect to studio runs (got ${digest.status})`);
    assert(digest.headers.get('location') === '/studio?panel=runs', `/dev-digest redirect mismatch: ${digest.headers.get('location')}`);

    const settings = await fetch(`${web.baseUrl}/settings`, { redirect: 'manual' });
    assert(settings.status === 302, `/settings should redirect to studio policies (got ${settings.status})`);
    assert(settings.headers.get('location') === '/studio?panel=policies', `/settings redirect mismatch: ${settings.headers.get('location')}`);

    const deck = await fetch(`${web.baseUrl}/deck`, { redirect: 'manual' });
    const deckHtml = await deck.text();
    assert(deck.status === 200, `/deck should render the VC deck (got ${deck.status})`);
    assert(deckHtml.includes('SocialOS VC Deck'), '/deck should render the deck title');
    assert(!deckHtml.includes('href="/quick-capture"'), '/deck should not reuse the dashboard shell nav');

    for (const page of DASHBOARD_PAGES) {
      await expectPage(web.baseUrl, page);
    }

    const workspace = await fetch(`${web.baseUrl}/quick-capture`);
    const workspaceHtml = await workspace.text();
    assert((workspaceHtml.match(/<form[^>]+data-workspace-chat-form/gu) || []).length === 1, 'workspace should render exactly one main chat form');
    assert(workspaceHtml.includes('data-workspace-rail-tabs'), 'workspace should render a tabbed context rail');
    assert(workspaceHtml.includes('maybeRevealWorkspaceDrawer'), 'workspace should auto-reveal contact/event drawers when opened from in-page links');
    assert(workspaceHtml.includes("submitter.dataset.locked === 'true'"), 'workspace contact review save should keep the submit button locked after success');
    assert(!workspaceHtml.includes('href="/cockpit"'), 'primary nav should not keep a cockpit link');
    assert(!workspaceHtml.includes('href="/ask"'), 'primary nav should not keep an ask link');
    assert(!workspaceHtml.includes('href="/dev-digest"'), 'primary nav should not keep a dev digest link');
    for (const path of ['/quick-capture', '/people', '/events', '/drafts', '/queue', '/self-mirror', '/studio']) {
      assert(workspaceHtml.includes(`href="${path}"`), `workspace nav should include ${path}`);
    }

    const peopleIndex = await fetch(`${web.baseUrl}/people`, { redirect: 'manual' });
    const peopleIndexHtml = await peopleIndex.text();
    assert(peopleIndex.status === 200, `/people should render Contacts index (got ${peopleIndex.status})`);
    assert(peopleIndexHtml.includes('Find Sam from Bristol, update Alex follow-up, or describe a new contact naturally.'), '/people should expose the natural-language command bar');

    const eventsIndex = await fetch(`${web.baseUrl}/events`, { redirect: 'manual' });
    const eventsIndexHtml = await eventsIndex.text();
    assert(eventsIndex.status === 200, `/events should render Logbook index (got ${eventsIndex.status})`);
    assert(eventsIndexHtml.includes('Find the London meetup with Sam, or draft a new event naturally.'), '/events should expose the natural-language command bar');

    const draftsIndex = await fetch(`${web.baseUrl}/drafts`, { redirect: 'manual' });
    const draftsIndexHtml = await draftsIndex.text();
    assert(draftsIndex.status === 200, `/drafts should render drafts page (got ${draftsIndex.status})`);
    assert(draftsIndexHtml.includes('draft-event-suggestions'), '/drafts should expose a datalist-backed event picker');
    assert(draftsIndexHtml.includes('The Sam follow-up from Bristol, or last week’s meetup recap.'), '/drafts should expose a natural-language event search input');

    const peopleDetail = await fetch(`${web.baseUrl}/people/demo-person`, { redirect: 'manual' });
    const peopleDetailHtml = await peopleDetail.text();
    assert(peopleDetail.status === 200, `/people/:id should render the contacts page (got ${peopleDetail.status})`);
    assert(peopleDetailHtml.includes('<h1>Contacts</h1>'), '/people/:id should still render Contacts shell');

    const eventDetail = await fetch(`${web.baseUrl}/events/demo-event`, { redirect: 'manual' });
    const eventDetailHtml = await eventDetail.text();
    assert(eventDetail.status === 200, `/events/:id should render the logbook page (got ${eventDetail.status})`);
    assert(eventDetailHtml.includes('<h1>Logbook</h1>'), '/events/:id should still render Logbook shell');

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
