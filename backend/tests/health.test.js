import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/app.js');

test('GET /api/health responds ok', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'pqrs-flow');
  } finally {
    server.close();
  }
});

test('GET /api/non-existent-route returns 404', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/no-existe`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
