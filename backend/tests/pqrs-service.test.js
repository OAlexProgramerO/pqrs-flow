import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { ValidationError } from '../src/errors/http-error.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { submitPqrs } from '../src/services/pqrs.service.js';

const openDatabases = [];
after(() => openDatabases.forEach((db) => db.close()));

function setup() {
  const db = openDatabase({ filename: ':memory:' });
  openDatabases.push(db);
  return createPqrsRepository(db);
}

const input = {
  type: 'complaint',
  subject: 'Noise at night',
  description: 'The neighbors play loud music every night after midnight.',
  requesterName: 'Luis Perez',
  requesterEmail: 'luis@example.com',
};

const october2026 = { now: new Date('2026-10-04T12:00:00Z') };

test('stores a valid request and returns it with a case number', () => {
  const repository = setup();
  const created = submitPqrs(repository, input, october2026);

  assert.equal(created.caseNumber, 'PQRS-2026-000001');
  assert.equal(created.status, 'filed');
  assert.equal(created.subject, input.subject);
  assert.deepEqual(repository.findByCaseNumber(created.caseNumber), created);
});

test('trims the text and saves the email in lowercase', () => {
  const repository = setup();
  const created = submitPqrs(
    repository,
    { ...input, subject: '  Noise at night  ', requesterEmail: '  LUIS@Example.COM ' },
    october2026,
  );

  assert.equal(created.subject, 'Noise at night');
  assert.equal(created.requesterEmail, 'luis@example.com');
});

test('rejects invalid input with a ValidationError that lists the fields', () => {
  const repository = setup();

  assert.throws(
    () => submitPqrs(repository, { ...input, subject: '', requesterEmail: 'nope' }, october2026),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(Object.keys(error.details).sort(), ['requesterEmail', 'subject']);
      return true;
    },
  );
});

test('stores nothing and burns no case number when the input is invalid', () => {
  const repository = setup();

  assert.throws(() => submitPqrs(repository, { ...input, type: 'other' }, october2026));
  assert.equal(repository.findByCaseNumber('PQRS-2026-000001'), null);
  assert.equal(submitPqrs(repository, input, october2026).caseNumber, 'PQRS-2026-000001');
});

test('passes the options through to the repository', () => {
  const repository = setup();
  const created = submitPqrs(repository, input, { now: new Date('2027-03-01T12:00:00Z') });

  assert.equal(created.caseNumber, 'PQRS-2027-000001');
});
