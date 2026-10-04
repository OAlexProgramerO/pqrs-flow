import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, ValidationError } from '../src/errors/http-error.js';
import { errorHandler, notFoundHandler } from '../src/middlewares/error-handler.js';

function fakeRes({ headersSent = false } = {}) {
  return {
    headersSent,
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('HttpError keeps its status and message', () => {
  const error = new HttpError(409, 'Conflict', { field: 'x' });

  assert.equal(error.status, 409);
  assert.equal(error.message, 'Conflict');
  assert.deepEqual(error.details, { field: 'x' });
  assert.ok(error instanceof Error);
});

test('ValidationError is a 400 with the field messages', () => {
  const error = new ValidationError({ subject: 'Subject is required.' });

  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 400);
  assert.deepEqual(error.details, { subject: 'Subject is required.' });
});

test('notFoundHandler answers with a JSON 404', () => {
  const res = fakeRes();
  notFoundHandler({}, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Route not found' });
});

test('errorHandler sends the message and details of an HttpError', () => {
  const res = fakeRes();
  errorHandler(new ValidationError({ subject: 'Subject is required.' }), {}, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: 'Validation failed',
    details: { subject: 'Subject is required.' },
  });
});

test('errorHandler leaves out details when there are none', () => {
  const res = fakeRes();
  errorHandler(new HttpError(400, 'Invalid submission'), {}, res, () => {});

  assert.deepEqual(res.body, { error: 'Invalid submission' });
});

test('errorHandler maps a JSON parse error to 400', () => {
  const res = fakeRes();
  errorHandler({ type: 'entity.parse.failed' }, {}, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Malformed JSON body' });
});

test('errorHandler maps an oversized body to 413', () => {
  const res = fakeRes();
  errorHandler({ type: 'entity.too.large' }, {}, res, () => {});

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { error: 'Request body too large' });
});

test('errorHandler hides unexpected errors and returns the request id', (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const res = fakeRes();
  errorHandler(new Error('database exploded'), { id: 'req-12345678' }, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error', requestId: 'req-12345678' });
  assert.equal(logged.mock.callCount(), 1);
});

test('errorHandler passes the error on when the response was already started', () => {
  const res = fakeRes({ headersSent: true });
  const error = new Error('late failure');
  let received;

  errorHandler(error, {}, res, (value) => {
    received = value;
  });

  assert.equal(received, error);
  assert.equal(res.statusCode, undefined);
});
