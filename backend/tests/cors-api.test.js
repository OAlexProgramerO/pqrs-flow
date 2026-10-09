import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const servers = [];

async function start(options) {
  const server = await startServer(options);
  servers.push(server);
  return server;
}

after(async () => {
  for (const server of servers) await server.close();
});

const GOOD = 'https://citizens.example.com';
const OTHER = 'https://evil.example.com';

function call(server, origin, { method = 'GET', path = '/api/health', headers = {} } = {}) {
  return fetch(`${server.baseUrl}${path}`, { method, headers: { Origin: origin, ...headers } });
}

test('by default no website is allowed to call the API', async () => {
  const server = await start({ corsOrigins: false });
  const res = await call(server, GOOD);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('by default a preflight request gets no permission', async () => {
  const server = await start({ corsOrigins: false });
  const res = await call(server, GOOD, {
    method: 'OPTIONS',
    path: '/api/pqrs',
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-methods'), null);
});

test('a listed website is allowed and the answer says it depends on the origin', async () => {
  const server = await start({ corsOrigins: [GOOD, 'http://localhost:5500'] });
  const res = await call(server, GOOD);

  assert.equal(res.headers.get('access-control-allow-origin'), GOOD);
  assert.match(res.headers.get('vary'), /Origin/);
});

test('a website that is not listed gets no permission', async () => {
  const server = await start({ corsOrigins: [GOOD] });
  const res = await call(server, OTHER);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a preflight request from a listed website is accepted', async () => {
  const server = await start({ corsOrigins: [GOOD] });
  const res = await call(server, GOOD, {
    method: 'OPTIONS',
    path: '/api/pqrs',
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), GOOD);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
});

test('"*" allows every website', async () => {
  const server = await start({ corsOrigins: '*' });
  const res = await call(server, OTHER);

  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('the pages of the app work without CORS, because they use the same origin', async () => {
  const server = await start({ corsOrigins: false });

  assert.equal((await fetch(`${server.baseUrl}/`)).status, 200);
  assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 200);
});
