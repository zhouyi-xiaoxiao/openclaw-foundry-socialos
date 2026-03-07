import { startWebServer } from '../../socialos/apps/web/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const web = await startWebServer({ port: 0, quiet: true });

  try {
    const response = await fetch(`${web.baseUrl}/deck`);
    const html = await response.text();

    assert(response.status === 200, `/deck should return 200 (got ${response.status})`);
    assert(html.includes('SocialOS VC Deck'), '/deck should include the deck title');
    assert(html.includes('class="reveal"'), '/deck should render the Reveal shell');
    assert(html.includes('People, context, content, and self-understanding drift apart.'), '/deck should include the problem slide');
    assert(html.includes('A local-first relationship and identity operating system.'), '/deck should include the product definition slide');
    assert(html.includes('Minghan Xiao'), '/deck should include the real seeded contact network');
    assert(html.includes('Contacts with real named network'), '/deck should include the contacts proof screenshot');
    assert(html.includes('Design partners and intros for the next unlock.'), '/deck should include the closing ask slide');
    assert(html.includes('https://zhouyixiaoxiao.org/'), '/deck should expose the public deck domain');
    assert(
      html.includes('.reveal-viewport') &&
        html.includes('.reveal .slides > section') &&
        html.includes('min-height: 100vh !important;'),
      '/deck should include mobile Reveal reset rules'
    );
    assert(!html.includes('127.0.0.1'), '/deck public mode should not expose localhost-only links');

    const rehearsal = await fetch(`${web.baseUrl}/deck?mode=rehearsal`);
    const rehearsalHtml = await rehearsal.text();
    assert(rehearsal.status === 200, '/deck?mode=rehearsal should return 200');
    assert(rehearsalHtml.includes('Rehearsal mode'), 'rehearsal mode should expose rehearsal panel');
    assert(rehearsalHtml.includes('127.0.0.1:4173/quick-capture'), 'rehearsal mode should include local demo links');

    const printPdf = await fetch(`${web.baseUrl}/deck?print-pdf`);
    const printHtml = await printPdf.text();
    assert(printPdf.status === 200, '/deck?print-pdf should return 200');
    assert(printHtml.includes('data-print-pdf="true"'), 'print mode should mark PDF-friendly rendering');

    console.log('deck_route_smoke: PASS');
  } finally {
    await web.close();
  }
}

main().catch((error) => {
  console.error(`deck_route_smoke: FAIL ${error.message}`);
  process.exit(1);
});
