import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { startServer } from './helpers/server.js';

const db = openDatabase({ filename: ':memory:' });
const repository = createPqrsRepository(db);
const servers = [];

async function start(options = {}) {
  const server = await startServer({ getRepository: () => repository, ...options });
  servers.push(server);
  return server;
}

after(async () => {
  for (const server of servers) await server.close();
  db.close();
});

const submission = {
  type: 'suggestion',
  subject: 'More benches in the park',
  description: 'The park near the school has no places to sit and rest.',
  requesterName: 'Carlos Ruiz',
  requesterEmail: 'carlos@example.com',
};

function submit(target, payload = submission, headers = {}) {
  return fetch(`${target.baseUrl}/api/pqrs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

const limit = (max) => ({ submitLimit: { windowMs: 60_000, max } });

test('submissions go through until the limit is reached', async () => {
  const server = await start(limit(3));

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await submit(server)).status, 201, `request ${i + 1}`);
  }
});

test('one more submission gets a 429 with Retry-After and a request id', async () => {
  const server = await start(limit(2));
  await submit(server);
  await submit(server);

  const blocked = await submit(server);

  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.ok(blocked.headers.get('x-request-id'));
  assert.deepEqual(await blocked.json(), { error: 'Too many attempts. Please try again later.' });
});

test('a blocked submission is not saved', async () => {
  const server = await start(limit(1));
  const countBefore = db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total;

  await submit(server);
  await submit(server);
  await submit(server);

  const countAfter = db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total;
  assert.equal(countAfter - countBefore, 1);
});

test('attempts that fail validation also count', async () => {
  const server = await start(limit(2));

  assert.equal((await submit(server, { ...submission, subject: 'No' })).status, 400);
  assert.equal(
    (await submit(server, { ...submission, website: 'http://spam.example' })).status,
    400,
  );
  assert.equal((await submit(server)).status, 429);
});

test('the limit does not affect the lookup, the health check or the pages', async () => {
  const server = await start(limit(1));
  await submit(server);
  assert.equal((await submit(server)).status, 429);

  const lookup = await fetch(`${server.baseUrl}/api/pqrs/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseNumber: 'PQRS-2026-999999', requesterEmail: 'nobody@example.com' }),
  });

  assert.equal(lookup.status, 404);
  assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 200);
  assert.equal((await fetch(`${server.baseUrl}/`)).status, 200);
});

test('the lookup limits do not affect submissions', async () => {
  const server = await start({
    ...limit(5),
    lookupLimits: {
      ip: { windowMs: 60_000, max: 1 },
      caseNumber: { windowMs: 60_000, max: 1 },
    },
  });

  for (let i = 0; i < 3; i += 1) assert.equal((await submit(server)).status, 201);
});

test('by default the limit is ten submissions per client in each window', async () => {
  const server = await start();

  for (let i = 0; i < 10; i += 1) {
    assert.equal((await submit(server)).status, 201, `request ${i + 1}`);
  }
  assert.equal((await submit(server)).status, 429);
});

test('without TRUST_PROXY a faked X-Forwarded-For does not skip the limit', async () => {
  const server = await start(limit(1));

  assert.equal(
    (await submit(server, submission, { 'X-Forwarded-For': '203.0.113.10' })).status,
    201,
  );
  assert.equal(
    (await submit(server, submission, { 'X-Forwarded-For': '203.0.113.11' })).status,
    429,
  );
});

test('behind one trusted proxy every visitor has their own limit', async () => {
  const server = await start({ ...limit(1), trustProxy: 1 });
  const visitorA = { 'X-Forwarded-For': '203.0.113.10' };
  const visitorB = { 'X-Forwarded-For': '203.0.113.11' };

  assert.equal((await submit(server, submission, visitorA)).status, 201);
  assert.equal((await submit(server, submission, visitorB)).status, 201);
  assert.equal((await submit(server, submission, visitorA)).status, 429);
  assert.equal((await submit(server, submission, visitorB)).status, 429);
});

test('behind one trusted proxy a visitor cannot add fake addresses to skip the limit', async () => {
  const server = await start({ ...limit(1), trustProxy: 1 });

  // The proxy appends the real address at the end, so the fake one at the start is ignored
  const first = { 'X-Forwarded-For': '10.9.9.9, 203.0.113.10' };
  const second = { 'X-Forwarded-For': '10.8.8.8, 203.0.113.10' };

  assert.equal((await submit(server, submission, first)).status, 201);
  assert.equal((await submit(server, submission, second)).status, 429);
});
