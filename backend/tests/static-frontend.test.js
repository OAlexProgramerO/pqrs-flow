import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

const files = [
  ['/', /text\/html/, 'id="pqrsForm"'],
  ['/css/styles.css', /text\/css/, '--primary'],
  ['/js/main.js', /javascript/, 'initForm'],
  ['/js/form.js', /javascript/, 'validatePqrs'],
  ['/favicon.svg', /image\/svg\+xml/, '<svg'],
];

for (const [path, contentType, snippet] of files) {
  test(`GET ${path} is served`, async () => {
    const res = await fetch(`${server.baseUrl}${path}`);
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), contentType);
    assert.ok(body.includes(snippet), `${path} should contain ${snippet}`);
  });
}

test('GET on a missing static file returns 404', async () => {
  const res = await fetch(`${server.baseUrl}/does-not-exist.html`);

  assert.equal(res.status, 404);
});
