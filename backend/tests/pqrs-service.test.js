import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { HttpError, ValidationError } from '../src/errors/http-error.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { LOOKUP_NOT_FOUND_MESSAGE, lookupPqrs, submitPqrs } from '../src/services/pqrs.service.js';

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

test('lookupPqrs returns the public fields when case number and email match', () => {
  const repository = setup();
  const created = submitPqrs(repository, input, october2026);

  assert.deepEqual(
    lookupPqrs(repository, {
      caseNumber: created.caseNumber,
      requesterEmail: input.requesterEmail,
    }),
    {
      caseNumber: 'PQRS-2026-000001',
      type: 'complaint',
      status: 'filed',
      createdAt: created.createdAt,
    },
  );
});

test('lookupPqrs accepts a lowercase case number and an email in any case', () => {
  const repository = setup();
  submitPqrs(repository, input, october2026);

  const found = lookupPqrs(repository, {
    caseNumber: ' pqrs-2026-000001 ',
    requesterEmail: ' LUIS@Example.COM ',
  });

  assert.equal(found.caseNumber, 'PQRS-2026-000001');
});

test('lookupPqrs never returns the description or personal data', () => {
  const repository = setup();
  submitPqrs(repository, input, october2026);

  const found = lookupPqrs(repository, {
    caseNumber: 'PQRS-2026-000001',
    requesterEmail: input.requesterEmail,
  });

  assert.deepEqual(Object.keys(found).sort(), ['caseNumber', 'createdAt', 'status', 'type']);
});

test('lookupPqrs gives the same 404 for a wrong email and an unknown case number', () => {
  const repository = setup();
  submitPqrs(repository, input, october2026);

  const failures = [
    { caseNumber: 'PQRS-2026-000001', requesterEmail: 'wrong@example.com' },
    { caseNumber: 'PQRS-2026-000099', requesterEmail: input.requesterEmail },
  ].map((lookup) => {
    try {
      lookupPqrs(repository, lookup);
    } catch (error) {
      return error;
    }
    return null;
  });

  for (const error of failures) {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 404);
    assert.equal(error.message, LOOKUP_NOT_FOUND_MESSAGE);
    assert.equal(error.details, undefined);
  }
});

test('lookupPqrs throws a ValidationError for badly formed input', () => {
  const repository = setup();

  assert.throws(
    () => lookupPqrs(repository, { caseNumber: 'nope', requesterEmail: 'nope' }),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(Object.keys(error.details).sort(), ['caseNumber', 'requesterEmail']);
      return true;
    },
  );
});
