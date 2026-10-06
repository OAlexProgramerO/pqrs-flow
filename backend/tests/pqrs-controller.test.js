import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPqrsController } from '../src/controllers/pqrs.controller.js';
import { HttpError, ValidationError } from '../src/errors/http-error.js';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';

const db = openDatabase({ filename: ':memory:' });
after(() => db.close());

const repository = createPqrsRepository(db);
const controller = createPqrsController({ getRepository: () => repository });

const body = {
  type: 'suggestion',
  subject: 'Add a ramp at the west entrance',
  description: 'A ramp would help people with reduced mobility and parents with strollers.',
  requesterName: 'Carlos Ruiz',
  requesterEmail: 'carlos@example.com',
};

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function call(reqBody, customController = controller) {
  const res = fakeRes();
  const errors = [];
  customController.create({ body: reqBody }, res, (error) => errors.push(error));
  return { res, errors };
}

test('answers 201 with the public fields only', () => {
  const { res, errors } = call(body);

  assert.deepEqual(errors, []);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(Object.keys(res.body).sort(), [
    'caseNumber',
    'createdAt',
    'status',
    'subject',
    'type',
  ]);
  assert.match(res.body.caseNumber, /^PQRS-\d{4}-\d{6}$/);
  assert.equal(res.body.status, 'filed');
});

test('never echoes the description or the personal data', () => {
  const { res } = call(body);
  const text = JSON.stringify(res.body);

  assert.equal(text.includes(body.requesterEmail), false);
  assert.equal(text.includes(body.requesterName), false);
  assert.equal(text.includes(body.description), false);
});

test('passes a ValidationError to next when the input is invalid', () => {
  const { res, errors } = call({ ...body, subject: '' });

  assert.equal(res.statusCode, undefined);
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ValidationError);
  assert.ok(errors[0].details.subject);
});

test('treats a missing body as empty input', () => {
  const { errors } = call(undefined);

  assert.ok(errors[0] instanceof ValidationError);
});

test('rejects a filled honeypot field without storing anything', () => {
  const failing = createPqrsController({
    getRepository: () => ({
      create() {
        throw new Error('create must not be called');
      },
    }),
  });
  const { res, errors } = call({ ...body, website: 'http://spam.example' }, failing);

  assert.equal(res.statusCode, undefined);
  assert.ok(errors[0] instanceof HttpError);
  assert.equal(errors[0].status, 400);
  assert.equal(errors[0].message, 'Invalid submission');
});

test('accepts an empty honeypot field', () => {
  const { res } = call({ ...body, website: '' });

  assert.equal(res.statusCode, 201);
});

test('passes unexpected errors to next', () => {
  const broken = createPqrsController({
    getRepository: () => ({
      create() {
        throw new Error('database unavailable');
      },
    }),
  });
  const { res, errors } = call(body, broken);

  assert.equal(res.statusCode, undefined);
  assert.equal(errors[0].message, 'database unavailable');
});

function lookupCall(reqBody) {
  const res = fakeRes();
  const errors = [];
  controller.lookup({ body: reqBody }, res, (error) => errors.push(error));
  return { res, errors };
}

test('lookup answers 200 with the public fields and forbids caching', () => {
  const created = call(body).res.body;
  const { res, errors } = lookupCall({
    caseNumber: created.caseNumber,
    requesterEmail: body.requesterEmail,
  });

  assert.deepEqual(errors, []);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(res.body).sort(), ['caseNumber', 'createdAt', 'status', 'type']);
  assert.equal(res.body.caseNumber, created.caseNumber);
});

test('lookup passes a 404 to next when the email does not match', () => {
  const created = call(body).res.body;
  const { res, errors } = lookupCall({
    caseNumber: created.caseNumber,
    requesterEmail: 'wrong@example.com',
  });

  assert.equal(res.statusCode, undefined);
  assert.equal(errors[0].status, 404);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('lookup passes a ValidationError to next for badly formed input', () => {
  const { errors } = lookupCall({ caseNumber: 'x', requesterEmail: 'y' });

  assert.ok(errors[0] instanceof ValidationError);
});

test('lookup treats a missing body as empty input', () => {
  const { errors } = lookupCall(undefined);

  assert.ok(errors[0] instanceof ValidationError);
});
