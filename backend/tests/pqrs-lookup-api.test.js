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
  type: 'claim',
  subject: 'Wrong amount on my invoice',
  description: 'I was charged twice for the same service last month.',
  requesterName: 'Maria Lopez',
  requesterEmail: 'Maria@Example.com',
};

const server = await start();

function send(target, path, payload) {
  return fetch(`${target.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

async function submit() {
  const res = await send(server, '/api/pqrs', submission);
  return (await res.json()).caseNumber;
}

const lookup = (target, payload) => send(target, '/api/pqrs/lookup', payload);

test('POST /api/pqrs/lookup returns the status with the right case number and email', async () => {
  const caseNumber = await submit();
  const res = await lookup(server, { caseNumber, requesterEmail: 'maria@example.com' });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(Object.keys(body).sort(), ['caseNumber', 'createdAt', 'status', 'type']);
  assert.equal(body.caseNumber, caseNumber);
  assert.equal(body.status, 'filed');
  assert.equal(body.type, 'claim');
});

test('the lookup answer is never cached and carries a request id', async () => {
  const caseNumber = await submit();
  const res = await lookup(server, { caseNumber, requesterEmail: submission.requesterEmail });

  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.ok(res.headers.get('x-request-id'));
});

test('the lookup ignores the case of the email and of the case number', async () => {
  const caseNumber = await submit();
  const res = await lookup(server, {
    caseNumber: caseNumber.toLowerCase(),
    requesterEmail: 'MARIA@EXAMPLE.COM',
  });

  assert.equal(res.status, 200);
});

test('the lookup never reveals the description or personal data', async () => {
  const caseNumber = await submit();
  const text = await (
    await lookup(server, { caseNumber, requesterEmail: submission.requesterEmail })
  ).text();

  assert.equal(text.toLowerCase().includes('maria'), false);
  assert.equal(text.includes(submission.description), false);
  assert.equal(text.includes(submission.subject), false);
});

test('a wrong email and an unknown case number get exactly the same answer', async () => {
  const caseNumber = await submit();
  const wrongEmail = await lookup(server, { caseNumber, requesterEmail: 'wrong@example.com' });
  const unknownCase = await lookup(server, {
    caseNumber: 'PQRS-2026-999999',
    requesterEmail: submission.requesterEmail,
  });

  assert.equal(wrongEmail.status, 404);
  assert.equal(unknownCase.status, 404);
  assert.deepEqual(await wrongEmail.json(), await unknownCase.json());
});

test('the lookup answers 400 with the invalid fields', async () => {
  const res = await lookup(server, { caseNumber: 'nope', requesterEmail: 'nope' });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error, 'Validation failed');
  assert.deepEqual(Object.keys(body.details).sort(), ['caseNumber', 'requesterEmail']);
});

test('the lookup answers 400 for malformed JSON', async () => {
  const res = await lookup(server, '{ not json');

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Malformed JSON body' });
});

test('GET /api/pqrs/lookup is not allowed, so the email can never travel in a URL', async () => {
  const res = await fetch(`${server.baseUrl}/api/pqrs/lookup?requesterEmail=a@b.co`);

  assert.equal(res.status, 404);
});

test('too many attempts for one case number get a 429 with Retry-After', async () => {
  const limited = await start({
    lookupLimits: {
      ip: { windowMs: 60_000, max: 100 },
      caseNumber: { windowMs: 60_000, max: 3 },
    },
  });
  const attempt = { caseNumber: 'PQRS-2026-000001', requesterEmail: 'guess@example.com' };

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await lookup(limited, attempt)).status, 404, `attempt ${i + 1}`);
  }

  const blocked = await lookup(limited, attempt);

  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.deepEqual(await blocked.json(), { error: 'Too many attempts. Please try again later.' });

  // Another case number is not affected
  const other = await lookup(limited, { ...attempt, caseNumber: 'PQRS-2026-000002' });
  assert.equal(other.status, 404);
});

test('too many attempts from one client get a 429 whatever the case number is', async () => {
  const limited = await start({
    lookupLimits: {
      ip: { windowMs: 60_000, max: 2 },
      caseNumber: { windowMs: 60_000, max: 100 },
    },
  });

  assert.equal(
    (await lookup(limited, { caseNumber: 'PQRS-2026-000001', requesterEmail: 'a@b.co' })).status,
    404,
  );
  assert.equal(
    (await lookup(limited, { caseNumber: 'PQRS-2026-000002', requesterEmail: 'a@b.co' })).status,
    404,
  );
  assert.equal(
    (await lookup(limited, { caseNumber: 'PQRS-2026-000003', requesterEmail: 'a@b.co' })).status,
    429,
  );
});

test('submitting a request is not affected by the lookup limits', async () => {
  const limited = await start({
    lookupLimits: {
      ip: { windowMs: 60_000, max: 1 },
      caseNumber: { windowMs: 60_000, max: 1 },
    },
  });

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await send(limited, '/api/pqrs', submission)).status, 201);
  }
});
