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
    assert(
      html.includes('data-transcript-preview'),
      'workspace composer should render a transcript preview area'
    );
    assert(
      html.includes('the transcript lands in the composer so you can edit it before sending'),
      'workspace composer note should explain manual send after transcription'
    );
    assert(
      html.includes('Tap Mic again to stop. We will draft the transcript into the composer for review before you send.'),
      'recording status copy should promise draft-before-send behavior'
    );
    assert(
      html.includes('mergeTranscriptIntoComposer'),
      'workspace client script should merge transcript into the composer'
    );
    assert(
      html.includes('await uploadWorkspaceAsset(file);'),
      'voice stop should upload the asset without triggering auto-send'
    );
    assert(
      !html.includes('autoSend: true'),
      'workspace voice flow should no longer auto-send on stop'
    );
    assert(
      !html.includes('send automatically'),
      'workspace copy should not promise automatic send after transcription'
    );
    assert(
      (html.match(/<form[^>]+data-workspace-chat-form/gu) || []).length === 1,
      'workspace should only render one primary chat composer'
    );

    console.log('workspace_voice_composer_smoke: PASS');
  } finally {
    await web.close();
  }
}

main().catch((error) => {
  console.error(`workspace_voice_composer_smoke: FAIL ${error.message}`);
  process.exit(1);
});
