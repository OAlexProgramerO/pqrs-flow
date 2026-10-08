import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

// Reads the answer without decoding it
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(`${server.baseUrl}${path}`, { headers }, (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) });
        });
      })
      .on('error', reject);
  });
}

const FILES = ['/', '/track.html', '/css/styles.css', '/js/form.js', '/shared/validation.js'];

for (const path of FILES) {
  test(`${path} is compressed and decodes to the same file`, async () => {
    const plain = await get(path);
    const packed = await get(path, { 'Accept-Encoding': 'gzip' });

    assert.equal(packed.status, 200);
    assert.equal(packed.headers['content-encoding'], 'gzip');
    assert.match(packed.headers.vary, /Accept-Encoding/);
    assert.ok(packed.body.length < plain.body.length);
    assert.deepEqual(zlib.gunzipSync(packed.body), plain.body);
  });
}

test('the files are sent as they are to a client that does not ask for compression', async () => {
  const res = await get('/');

  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(Number(res.headers['content-length']), res.body.length);
});

test('the small API answers are not compressed', async () => {
  const res = await get('/api/health', { 'Accept-Encoding': 'gzip, br' });

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(JSON.parse(res.body).status, 'ok');
});

test('compression keeps the security headers and the request id', async () => {
  const res = await get('/', { 'Accept-Encoding': 'gzip' });

  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
  assert.ok(res.headers['x-request-id']);
});

test('a browser asking again with the ETag gets a 304', async () => {
  const first = await get('/css/styles.css', { 'Accept-Encoding': 'gzip' });
  const again = await get('/css/styles.css', {
    'Accept-Encoding': 'gzip',
    'If-None-Match': first.headers.etag,
  });

  assert.ok(first.headers.etag);
  assert.equal(again.status, 304);
});
