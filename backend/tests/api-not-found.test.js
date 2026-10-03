import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

test('GET on an unknown API route returns a JSON 404', async () => {
  const res = await fetch(`${server.baseUrl}/api/non-existent-route`);

  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { error: 'Route not found' });
});

test('POST on an unknown API route returns the same JSON 404', async () => {
  const res = await fetch(`${server.baseUrl}/api/non-existent-route`, { method: 'POST' });

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Route not found' });
});
