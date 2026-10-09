import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setStaticCacheHeaders } from '../src/app.js';
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

const cacheOf = async (server, path, init) =>
  (await fetch(`${server.baseUrl}${path}`, init)).headers.get('cache-control');

test('pages are always checked again with the server', async () => {
  const server = await start({ staticCacheSeconds: 3600 });

  assert.equal(await cacheOf(server, '/'), 'no-cache');
  assert.equal(await cacheOf(server, '/track.html'), 'no-cache');
});

test('styles, scripts and images can be kept for the configured time', async () => {
  const server = await start({ staticCacheSeconds: 3600 });

  for (const path of ['/css/styles.css', '/js/form.js', '/shared/validation.js', '/favicon.svg']) {
    assert.equal(await cacheOf(server, path), 'public, max-age=3600', path);
  }
});

test('with a time of zero everything is checked again, so changes show up at once', async () => {
  const server = await start({ staticCacheSeconds: 0 });

  for (const path of ['/', '/css/styles.css', '/js/form.js', '/shared/validation.js']) {
    assert.equal(await cacheOf(server, path), 'no-cache', path);
  }
});

// fetch adds "Cache-Control: no-cache" to a request with If-None-Match, which makes the server
// skip the 304. A plain http request shows what a browser's own cache does.
function head(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(`${server.baseUrl}${path}`, { headers }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      })
      .on('error', reject);
  });
}

test('a file that has not changed answers 304 to a repeated request', async () => {
  const server = await start({ staticCacheSeconds: 0 });
  const first = await head(server, '/css/styles.css');
  const again = await head(server, '/css/styles.css', { 'If-None-Match': first.headers.etag });

  assert.ok(first.headers.etag);
  assert.equal(again.status, 304);
});

test('the answers of the API are never stored', async () => {
  const server = await start();

  assert.equal(await cacheOf(server, '/api/health'), 'no-store');
  assert.equal(await cacheOf(server, '/api/does-not-exist'), 'no-store');
});

test('the API answers to errors and submissions are never stored either', async () => {
  const server = await start();
  const post = (body) =>
    fetch(`${server.baseUrl}/api/pqrs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

  assert.equal((await post('{ not json')).headers.get('cache-control'), 'no-store');
  assert.equal((await post('{}')).headers.get('cache-control'), 'no-store');
});

test('setStaticCacheHeaders decides by the extension and the time', () => {
  const calls = [];
  const res = { setHeader: (name, value) => calls.push([name, value]) };

  setStaticCacheHeaders(60)(res, '/site/index.html');
  setStaticCacheHeaders(60)(res, '/site/app.js');
  setStaticCacheHeaders(0)(res, '/site/app.js');

  assert.deepEqual(calls, [
    ['Cache-Control', 'no-cache'],
    ['Cache-Control', 'public, max-age=60'],
    ['Cache-Control', 'no-cache'],
  ]);
});
