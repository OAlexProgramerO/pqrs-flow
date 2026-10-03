import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

for (const path of ['/api/health', '/']) {
  test(`GET ${path} sends the security headers set by helmet`, async () => {
    const res = await fetch(`${server.baseUrl}${path}`);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });
}
