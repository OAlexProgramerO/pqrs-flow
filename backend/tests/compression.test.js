import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import express from 'express';
import { compression, isCompressible, pickEncoding } from '../src/middlewares/compression.js';

const BIG_TEXT = 'The same sentence again and again. '.repeat(200);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-compression-'));
fs.writeFileSync(path.join(dir, 'big.txt'), BIG_TEXT);

const app = express();
app.use(compression());
app.get('/text', (_req, res) => res.type('text/plain').send(BIG_TEXT));
app.get('/json', (_req, res) => res.json({ items: Array(300).fill('some repeated text') }));
app.get('/small', (_req, res) => res.type('text/plain').send('hi'));
app.get('/image', (_req, res) => res.type('image/png').send(Buffer.alloc(5000)));
app.get('/no-transform', (_req, res) => {
  res.set('Cache-Control', 'no-transform').type('text/plain').send(BIG_TEXT);
});
app.get('/no-content', (_req, res) => res.status(204).end());
app.get('/not-modified', (_req, res) => res.status(304).end());
app.get('/vary', (_req, res) => res.set('Vary', 'Origin').type('text/plain').send(BIG_TEXT));
app.get('/etag', (_req, res) => {
  res.set('ETag', '"strong-tag"').type('text/plain').send(BIG_TEXT);
});
app.get('/encoded', (_req, res) => {
  res.set('Content-Encoding', 'gzip').type('text/plain').send(zlib.gzipSync(BIG_TEXT));
});
app.get('/chunks', (_req, res) => {
  res.type('text/plain');
  for (let i = 0; i < 100; i += 1) res.write(`line ${i} of a long answer sent in pieces\n`);
  res.end('the end\n');
});
app.get('/big-stream', (_req, res) => {
  const line = 'x'.repeat(1023) + '\n';
  res.type('text/plain');
  Readable.from(
    (function* lines() {
      for (let i = 0; i < 3000; i += 1) yield line;
    })(),
  ).pipe(res);
});
app.get('/random-stream', (_req, res) => {
  res.type('text/plain');
  Readable.from(
    (function* pieces() {
      // Random text does not shrink much, so the connection really fills up
      for (let i = 0; i < 100; i += 1) yield randomBytes(60_000).toString('base64');
    })(),
  ).pipe(res);
});
app.get('/callback', (_req, res) => {
  res.type('text/plain');
  res.end(BIG_TEXT, () => res.app.locals.finished?.());
});
app.use('/static', express.static(dir));

const small = express();
small.use(compression({ threshold: 1 }));
small.get('/small', (_req, res) => res.type('text/plain').send('hi'));

async function listen(target) {
  const server = http.createServer(target).listen(0);
  await once(server, 'listening');
  return server;
}

const server = await listen(app);
const smallServer = await listen(small);
after(() => {
  server.closeAllConnections();
  server.close();
  smallServer.closeAllConnections();
  smallServer.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Reads the answer as it travels, without decoding it, so the tests see the real bytes
function get(target, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: target.address().port, path, method, headers },
      (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) });
        });
        res.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end();
  });
}

const gzipOnly = { 'Accept-Encoding': 'gzip' };

test('pickEncoding prefers brotli and respects the weights of the client', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('br'), 'br');
  assert.equal(pickEncoding('gzip;q=0.8, br;q=0.4'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip'), 'gzip');
  assert.equal(pickEncoding('GZIP'), 'gzip');
  assert.equal(pickEncoding('*'), 'br');
});

test('pickEncoding returns null when nothing can be used', () => {
  assert.equal(pickEncoding(undefined), null);
  assert.equal(pickEncoding(''), null);
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding('deflate'), null);
  assert.equal(pickEncoding('gzip;q=0, br;q=0'), null);
  assert.equal(pickEncoding('gzip;q=abc'), null);
});

test('isCompressible accepts text and rejects binary content', () => {
  for (const type of [
    'text/html; charset=utf-8',
    'text/css',
    'application/json; charset=utf-8',
    'application/javascript',
    'image/svg+xml',
    'application/problem+json',
  ]) {
    assert.equal(isCompressible(type), true, type);
  }
  for (const type of ['image/png', 'application/zip', 'font/woff2', 'application/pdf', '']) {
    assert.equal(isCompressible(type), false, type);
  }
  assert.equal(isCompressible(undefined), false);
});

test('compresses a large text answer with gzip', async () => {
  const res = await get(server, '/text', gzipOnly);

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(res.headers['content-length'], undefined);
  assert.ok(res.body.length < BIG_TEXT.length / 10);
  assert.equal(zlib.gunzipSync(res.body).toString(), BIG_TEXT);
});

test('compresses with brotli when the client accepts it', async () => {
  const res = await get(server, '/text', { 'Accept-Encoding': 'gzip, deflate, br' });

  assert.equal(res.headers['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(res.body).toString(), BIG_TEXT);
});

test('compresses JSON answers too', async () => {
  const res = await get(server, '/json', gzipOnly);
  const body = JSON.parse(zlib.gunzipSync(res.body).toString());

  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(body.items.length, 300);
});

test('sends the answer as it is when the client does not ask for compression', async () => {
  for (const headers of [{}, { 'Accept-Encoding': 'identity' }, { 'Accept-Encoding': 'deflate' }]) {
    const res = await get(server, '/text', headers);

    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.body.toString(), BIG_TEXT);
    // Caches must still know that another client could get a compressed version
    assert.match(res.headers.vary, /Accept-Encoding/);
  }
});

test('adds Accept-Encoding to Vary without losing the values that were already there', async () => {
  const res = await get(server, '/vary', gzipOnly);

  assert.equal(res.headers.vary, 'Origin, Accept-Encoding');
});

test('leaves small answers alone', async () => {
  const res = await get(server, '/small', gzipOnly);

  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(res.headers.vary, undefined);
  assert.equal(res.body.toString(), 'hi');
});

test('the threshold can be changed', async () => {
  const res = await get(smallServer, '/small', gzipOnly);

  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(res.body).toString(), 'hi');
});

test('leaves images alone', async () => {
  const res = await get(server, '/image', gzipOnly);

  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(res.body.length, 5000);
});

test('respects Cache-Control: no-transform', async () => {
  const res = await get(server, '/no-transform', gzipOnly);

  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(res.body.toString(), BIG_TEXT);
});

test('does not compress an answer that is already encoded', async () => {
  const res = await get(server, '/encoded', gzipOnly);

  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(res.body).toString(), BIG_TEXT);
});

test('does not touch answers without a body', async () => {
  const noContent = await get(server, '/no-content', gzipOnly);
  const notModified = await get(server, '/not-modified', gzipOnly);

  assert.equal(noContent.status, 204);
  assert.equal(noContent.headers['content-encoding'], undefined);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers['content-encoding'], undefined);
});

test('does not compress the answer to a HEAD request', async () => {
  const res = await get(server, '/text', gzipOnly, 'HEAD');

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(res.body.length, 0);
});

test('turns a strong ETag into a weak one', async () => {
  const res = await get(server, '/etag', gzipOnly);

  assert.equal(res.headers.etag, 'W/"strong-tag"');
});

test('compresses an answer written in pieces with res.write', async () => {
  const res = await get(server, '/chunks', gzipOnly);
  const text = zlib.gunzipSync(res.body).toString();

  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.ok(text.startsWith('line 0 of'));
  assert.ok(text.includes('line 99 of'));
  assert.ok(text.endsWith('the end\n'));
});

test('compresses a large streamed answer without losing a byte', async () => {
  const res = await get(server, '/big-stream', gzipOnly);
  const text = zlib.gunzipSync(res.body).toString();

  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(text.length, 3000 * 1024);
  assert.ok(res.body.length < text.length / 10);
});

test('survives a slow client reading a large answer', async () => {
  const body = await new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: server.address().port,
        path: '/random-stream',
        headers: { 'Accept-Encoding': 'br' },
      },
      (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('end', () => resolve(Buffer.concat(parts)));
        res.on('error', reject);

        // Stop reading for a while, so the server has to wait for the client
        res.pause();
        setTimeout(() => res.resume(), 150);
      },
    );
    request.on('error', reject);
  });

  assert.equal(zlib.brotliDecompressSync(body).length, 100 * 80_000);
});

test('calls the callback of res.end once the answer is sent', async () => {
  const finished = new Promise((resolve) => {
    app.locals.finished = resolve;
  });
  const res = await get(server, '/callback', gzipOnly);

  await finished;
  assert.equal(zlib.gunzipSync(res.body).toString(), BIG_TEXT);
});

test('serves a static file compressed and the same file in pieces untouched', async () => {
  const full = await get(server, '/static/big.txt', gzipOnly);
  const partial = await get(server, '/static/big.txt', { ...gzipOnly, Range: 'bytes=0-99' });

  assert.equal(full.headers['content-encoding'], 'gzip');
  assert.equal(full.headers['accept-ranges'], undefined);
  assert.equal(zlib.gunzipSync(full.body).toString(), BIG_TEXT);

  assert.equal(partial.status, 206);
  assert.equal(partial.headers['content-encoding'], undefined);
  assert.equal(partial.body.toString(), BIG_TEXT.slice(0, 100));
});

test('a conditional request for a compressed static file still gets a 304', async () => {
  const first = await get(server, '/static/big.txt', gzipOnly);
  const second = await get(server, '/static/big.txt', {
    ...gzipOnly,
    'If-None-Match': first.headers.etag,
  });

  assert.ok(first.headers.etag);
  assert.equal(second.status, 304);
});
