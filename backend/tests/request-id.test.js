import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestId } from '../src/middlewares/request-id.js';

function run(headers = {}) {
  const req = { get: (name) => headers[name.toLowerCase()] };
  const res = {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  let calledNext = false;

  requestId(req, res, () => {
    calledNext = true;
  });

  return { req, res, calledNext };
}

test('generates an id and returns it in the header', () => {
  const { req, res, calledNext } = run();

  assert.match(req.id, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers['X-Request-Id'], req.id);
  assert.equal(calledNext, true);
});

test('generates a different id for every request', () => {
  assert.notEqual(run().req.id, run().req.id);
});

test('reuses a valid id sent by the client', () => {
  const { req, res } = run({ 'x-request-id': 'client-id-12345' });

  assert.equal(req.id, 'client-id-12345');
  assert.equal(res.headers['X-Request-Id'], 'client-id-12345');
});

test('replaces ids that could pollute the logs', () => {
  const invalid = ['short', 'has spaces in it', 'line\nbreak-1234567', 'a'.repeat(65), '<script>alert(1)'];

  for (const value of invalid) {
    const { req } = run({ 'x-request-id': value });
    assert.notEqual(req.id, value, `${JSON.stringify(value)} should be replaced`);
    assert.match(req.id, /^[0-9a-f-]{36}$/);
  }
});
