import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

async function get(path) {
  const res = await fetch(`${server.baseUrl}${path}`);
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
}

test('the tracking page is served', async () => {
  const { status, type, body } = await get('/track.html');

  assert.equal(status, 200);
  assert.match(type, /text\/html/);
  assert.ok(body.includes('<title>Track a request'));
});

test('the tracking page has the form, the result panel and the timeline', async () => {
  const { body } = await get('/track.html');
  const ids = ['lookupForm', 'caseNumber', 'requesterEmail', 'lookupBtn', 'lookupMessage'];

  for (const id of [...ids, 'resultPanel', 'statusBadge', 'timeline', 'anotherBtn']) {
    assert.ok(body.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('the email field of the tracking form is a real email input', async () => {
  const { body } = await get('/track.html');

  assert.match(body, /<input[^>]*type="email"[^>]*id="requesterEmail"/);
});

test('both pages have the navigation', async () => {
  for (const path of ['/', '/track.html']) {
    const { body } = await get(path);
    assert.ok(body.includes('class="site-nav"'), `${path} has no navigation`);
    assert.ok(body.includes('href="track.html"'), `${path} does not link to tracking`);
  }
});

test('the confirmation panel links to tracking with the case number only', async () => {
  const index = await get('/');
  const form = await get('/js/form.js');

  assert.ok(index.body.includes('id="trackLink"'));
  assert.ok(form.body.includes('track.html?case='));
  assert.equal(form.body.includes('?email'), false);
  assert.equal(form.body.includes('requesterEmail=${'), false);
});

test('the tracking scripts are served', async () => {
  const track = await get('/js/track.js');
  const status = await get('/js/status.js');

  assert.equal(track.status, 200);
  assert.ok(track.body.includes("from './api.js'"));
  assert.ok(track.body.includes("from '/shared/validation.js'"));
  assert.equal(status.status, 200);
  assert.ok(status.body.includes('export function buildTimeline'));
});

test('the tracking page builds the timeline without innerHTML', async () => {
  const { body } = await get('/js/track.js');

  assert.equal(body.includes('innerHTML'), false);
});

test('the stylesheet has the timeline and the navigation', async () => {
  const { body } = await get('/css/styles.css');

  for (const rule of ['.timeline', '.site-nav', '.status-badge', '.visually-hidden']) {
    assert.ok(body.includes(rule), `missing ${rule}`);
  }
});
