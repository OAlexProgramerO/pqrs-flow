import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';

const openDatabases = [];
after(() => openDatabases.forEach((db) => db.close()));

// Each test gets its own empty in-memory database
function setup() {
  const db = openDatabase({ filename: ':memory:' });
  openDatabases.push(db);
  return createPqrsRepository(db);
}

const input = {
  type: 'claim',
  subject: 'Wrong amount on my invoice',
  description: 'I was charged twice for the same service last month.',
  requesterName: 'Maria Lopez',
  requesterEmail: 'maria@example.com',
};

const october2026 = new Date('2026-10-03T12:00:00Z');

test('creates a request and returns it with a case number', () => {
  const repository = setup();
  const created = repository.create(input, { now: october2026 });

  assert.deepEqual(created, {
    id: 1,
    caseNumber: 'PQRS-2026-000001',
    ...input,
    status: 'filed',
    createdAt: created.createdAt,
  });
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('increments the sequence within the same year', () => {
  const repository = setup();

  assert.equal(repository.create(input, { now: october2026 }).caseNumber, 'PQRS-2026-000001');
  assert.equal(repository.create(input, { now: october2026 }).caseNumber, 'PQRS-2026-000002');
});

test('restarts the sequence every year', () => {
  const repository = setup();
  const january2027 = new Date('2027-01-15T12:00:00Z');

  assert.equal(repository.create(input, { now: october2026 }).caseNumber, 'PQRS-2026-000001');
  assert.equal(repository.create(input, { now: january2027 }).caseNumber, 'PQRS-2027-000001');
  assert.equal(repository.create(input, { now: october2026 }).caseNumber, 'PQRS-2026-000002');
});

test('uses the UTC year', () => {
  const repository = setup();
  // 23:30 on December 31 in UTC-5 is already January 1 in UTC
  const newYearInUtc = new Date('2026-12-31T23:30:00-05:00');

  assert.equal(repository.create(input, { now: newYearInUtc }).caseNumber, 'PQRS-2027-000001');
});

test('does not advance the counter when the insert fails', () => {
  const repository = setup();

  assert.throws(
    () => repository.create({ ...input, type: 'other' }, { now: october2026 }),
    /CHECK constraint failed/,
  );
  assert.equal(repository.create(input, { now: october2026 }).caseNumber, 'PQRS-2026-000001');
});

test('finds a request by case number', () => {
  const repository = setup();
  const created = repository.create(input, { now: october2026 });

  assert.deepEqual(repository.findByCaseNumber('PQRS-2026-000001'), created);
});

test('returns null for an unknown case number', () => {
  const repository = setup();

  assert.equal(repository.findByCaseNumber('PQRS-2026-000099'), null);
});

test('findForLookup returns only the public columns', () => {
  const repository = setup();
  const created = repository.create(input, { now: october2026 });
  const found = repository.findForLookup(created.caseNumber, input.requesterEmail);

  assert.deepEqual(found, {
    caseNumber: 'PQRS-2026-000001',
    type: 'claim',
    status: 'filed',
    createdAt: created.createdAt,
  });
});

test('findForLookup ignores the case of the email', () => {
  const repository = setup();
  const created = repository.create(input, { now: october2026 });

  assert.ok(repository.findForLookup(created.caseNumber, 'MARIA@EXAMPLE.COM'));
});

test('findForLookup finds rows saved with an uppercase email', () => {
  const db = openDatabase({ filename: ':memory:' });
  openDatabases.push(db);
  db.prepare(
    `INSERT INTO pqrs (case_number, type, subject, description, requester_name, requester_email)
     VALUES ('PQRS-2026-000001', 'claim', 'Wrong amount on my invoice',
             'I was charged twice for the same service.', 'Maria Lopez', 'Maria@Example.com')`,
  ).run();

  assert.ok(createPqrsRepository(db).findForLookup('PQRS-2026-000001', 'maria@example.com'));
});

test('findForLookup returns null for a wrong email', () => {
  const repository = setup();
  const created = repository.create(input, { now: october2026 });

  assert.equal(repository.findForLookup(created.caseNumber, 'someone.else@example.com'), null);
});

test('findForLookup returns null for an unknown case number', () => {
  const repository = setup();
  repository.create(input, { now: october2026 });

  assert.equal(repository.findForLookup('PQRS-2026-000099', input.requesterEmail), null);
});

test('findForLookup does not mix up two requests', () => {
  const repository = setup();
  const first = repository.create(input, { now: october2026 });
  const other = { ...input, requesterEmail: 'other@example.com' };
  const second = repository.create(other, { now: october2026 });

  assert.equal(repository.findForLookup(first.caseNumber, other.requesterEmail), null);
  assert.equal(
    repository.findForLookup(second.caseNumber, other.requesterEmail).caseNumber,
    second.caseNumber,
  );
});

test('the lookup query uses the case number index', () => {
  const db = openDatabase({ filename: ':memory:' });
  openDatabases.push(db);

  const plan = db
    .prepare(
      'EXPLAIN QUERY PLAN SELECT type FROM pqrs WHERE case_number = ? AND lower(requester_email) = ?',
    )
    .all('x', 'y');

  assert.ok(
    plan.some((step) => /USING (COVERING )?INDEX/.test(step.detail)),
    JSON.stringify(plan),
  );
});
