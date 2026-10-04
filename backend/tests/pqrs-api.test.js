import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { startServer } from './helpers/server.js';

const db = openDatabase({ filename: ':memory:' });
const repository = createPqrsRepository(db);
const server = await startServer({ getRepository: () => repository });

after(async () => {
  await server.close();
  db.close();
});

const validBody = {
  type: 'claim',
  subject: 'Wrong amount on my invoice',
  description: 'I was charged twice for the same service last month.',
  requesterName: 'Maria Lopez',
  requesterEmail: 'Maria@Example.com',
};

function post(payload, contentType = 'application/json') {
  return fetch(`${server.baseUrl}/api/pqrs`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

test('POST /api/pqrs creates a request and returns 201', async () => {
  const res = await post(validBody);
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.match(body.caseNumber, /^PQRS-\d{4}-\d{6}$/);
  assert.equal(body.status, 'filed');
  assert.equal(body.subject, validBody.subject);
});

test('POST /api/pqrs returns a request id header', async () => {
  const res = await post(validBody);

  assert.ok(res.headers.get('x-request-id'));
});

test('POST /api/pqrs does not echo personal data', async () => {
  const res = await post(validBody);
  const text = await res.text();

  assert.equal(text.toLowerCase().includes('maria@example.com'), false);
  assert.equal(text.includes('Maria Lopez'), false);
});

test('POST /api/pqrs saves the email in lowercase', async () => {
  const res = await post(validBody);
  const { caseNumber } = await res.json();

  assert.equal(repository.findByCaseNumber(caseNumber).requesterEmail, 'maria@example.com');
});

test('POST /api/pqrs increments the case number', async () => {
  const first = await (await post(validBody)).json();
  const second = await (await post(validBody)).json();

  assert.equal(Number(second.caseNumber.slice(-6)), Number(first.caseNumber.slice(-6)) + 1);
});

test('POST /api/pqrs answers 400 with the invalid fields', async () => {
  const res = await post({});
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error, 'Validation failed');
  assert.deepEqual(Object.keys(body.details).sort(), [
    'description',
    'requesterEmail',
    'requesterName',
    'subject',
    'type',
  ]);
});

test('POST /api/pqrs ignores bodies that are not JSON', async () => {
  const res = await post(JSON.stringify(validBody), 'text/plain');

  assert.equal(res.status, 400);
});

test('POST /api/pqrs answers 400 for malformed JSON', async () => {
  const res = await post('{ this is not json');

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Malformed JSON body' });
});

test('POST /api/pqrs answers 413 for a body that is too large', async () => {
  const res = await post({ ...validBody, description: 'a'.repeat(40000) });

  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'Request body too large' });
});

test('POST /api/pqrs rejects a filled honeypot field', async () => {
  const res = await post({ ...validBody, website: 'http://spam.example' });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid submission' });
});

test('GET /api/pqrs is not available yet', async () => {
  const res = await fetch(`${server.baseUrl}/api/pqrs`);

  assert.equal(res.status, 404);
});
