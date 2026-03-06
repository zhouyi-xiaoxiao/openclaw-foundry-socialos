import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApiServer } from '../../socialos/apps/api/server.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${raw}`);
  return payload;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-natural-search-'));
  const dbPath = path.join(tempDir, 'natural-search.db');
  const api = await startApiServer({ port: 0, quiet: true, dbPath });

  try {
    const sam = await requestJson(api.baseUrl, '/people/upsert', {
      method: 'POST',
      body: {
        name: 'Sam Li',
        tags: ['growth', 'bristol'],
        notes: 'Met in Bristol, works as a PDRA and helps connect research to practical demos.',
        nextFollowUpAt: '2026-03-12T10:00',
      },
    });
    const alex = await requestJson(api.baseUrl, '/people/upsert', {
      method: 'POST',
      body: {
        name: 'Alex Research',
        tags: ['research', 'oxford'],
        notes: 'Talked about agent workflows and evaluation loops.',
      },
    });

    await requestJson(api.baseUrl, `/people/${encodeURIComponent(sam.person.personId)}/identity`, {
      method: 'POST',
      body: {
        platform: 'wechat',
        handle: 'sam_bristol',
        note: 'Primary WeChat handle',
      },
    });
    await requestJson(api.baseUrl, `/people/${encodeURIComponent(sam.person.personId)}/interaction`, {
      method: 'POST',
      body: {
        summary: 'Talked about Bristol demos and PDRA to staff track',
        evidence: 'Sam offered to compare notes on follow-up tactics after the meetup.',
      },
    });

    const peopleHandleSearch = await requestJson(api.baseUrl, '/people?query=sam_bristol&limit=5');
    assert(peopleHandleSearch.results[0]?.personId === sam.person.personId, 'exact handle search should rank Sam first');

    const peopleNaturalSearch = await requestJson(
      api.baseUrl,
      '/people?query=the Bristol PDRA I should follow up with&limit=5'
    );
    assert(
      peopleNaturalSearch.results.some((result) => result.personId === sam.person.personId),
      'natural-language people search should find the Bristol PDRA contact'
    );

    const peopleCommandSearch = await requestJson(api.baseUrl, '/people/command?query=Sam from Bristol');
    assert(peopleCommandSearch.intent === 'search', 'people command search should stay in search mode');
    assert(peopleCommandSearch.openMatchId === sam.person.personId, 'people command should confidently open Sam');
    assert(peopleCommandSearch.presentation?.primaryCard?.type === 'contact', 'people command should foreground a contact card');

    const peopleCommandReview = await requestJson(api.baseUrl, '/people/command', {
      method: 'POST',
      body: {
        query: 'Create a contact for Yanzhen in Bristol. We talked about growth systems and want to follow up next week.',
      },
    });
    assert(['review', 'update'].includes(peopleCommandReview.intent), 'people command create/update should be review-first');
    assert(peopleCommandReview.reviewDraft?.captureDraft, 'people command create should return a review draft');

    const event = await requestJson(api.baseUrl, '/events', {
      method: 'POST',
      body: {
        title: 'Bristol research meetup follow-up',
        relatedPeople: [sam.person.personId],
        payload: {
          audience: 'research builders',
          languageStrategy: 'en',
          tone: 'clear, warm',
          details: {
            summary: 'A Bristol meetup recap with Sam that led to a follow-up content thread.',
          },
        },
      },
    });

    await requestJson(api.baseUrl, '/drafts/generate', {
      method: 'POST',
      body: {
        eventId: event.eventId,
        platforms: ['x', 'xiaohongshu'],
        languages: ['platform-native'],
      },
    });

    const eventSearch = await requestJson(
      api.baseUrl,
      '/events?query=the Bristol meetup with Sam that led to Xiaohongshu drafts&limit=5'
    );
    assert(eventSearch.results[0]?.eventId === event.eventId, 'event natural-language search should rank the Bristol Sam event first');

    const eventCommandSearch = await requestJson(api.baseUrl, '/events/command?query=find the Bristol meetup with Sam');
    assert(
      eventCommandSearch.openMatchId === event.eventId || eventCommandSearch.results.some((row) => row.eventId === event.eventId),
      'event command should find the Bristol Sam event'
    );

    const eventCommandReview = await requestJson(api.baseUrl, '/events/command', {
      method: 'POST',
      body: {
        query: 'Create an event for the Cambridge dinner with Alex about evaluation loops.',
      },
    });
    assert(eventCommandReview.intent === 'review', 'event create command should return a review draft');
    assert(eventCommandReview.reviewDraft?.title, 'event create command should provide a reviewable draft');

    console.log('natural_search_command_smoke: PASS');
  } finally {
    await api.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`natural_search_command_smoke: FAIL ${error.message}`);
  process.exit(1);
});
