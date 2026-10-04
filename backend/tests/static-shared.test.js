import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

test('GET /shared/validation.js serves the code shared with the server', async () => {
  const res = await fetch(`${server.baseUrl}/shared/validation.js`);
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.ok(body.includes('validatePqrs'));
});
