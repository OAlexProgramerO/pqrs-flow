import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createPqrs } from '../../frontend/js/api.js';

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

const payload = {
  type: 'petition',
  subject: 'Street light is broken',
  description: 'The street light in front of my house has been off for two weeks.',
  requesterName: 'Ana Gomez',
  requesterEmail: 'ana@example.com',
};

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
}

test('sends a JSON POST to /api/pqrs', async () => {
  const calls = mockFetch(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ caseNumber: 'PQRS-2026-000001' }),
  }));

  await createPqrs(payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/pqrs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test('resolves with the parsed response', async () => {
  mockFetch(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ caseNumber: 'PQRS-2026-000007', status: 'filed' }),
  }));

  assert.deepEqual(await createPqrs(payload), { caseNumber: 'PQRS-2026-000007', status: 'filed' });
});

test('throws an ApiError with the status and the field details', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: 'Validation failed',
      details: { subject: 'Subject is required.' },
    }),
  }));

  await assert.rejects(createPqrs(payload), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Validation failed');
    assert.deepEqual(error.details, { subject: 'Subject is required.' });
    return true;
  });
});

test('uses a generic message when the error body is not JSON', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  }));

  await assert.rejects(createPqrs(payload), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /Something went wrong/);
    return true;
  });
});

test('explains a network failure', async () => {
  mockFetch(async () => {
    throw new TypeError('fetch failed');
  });

  await assert.rejects(createPqrs(payload), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 0);
    assert.match(error.message, /Cannot reach the server/);
    return true;
  });
});

test('explains a timeout', async () => {
  mockFetch(async () => {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  });

  await assert.rejects(createPqrs(payload), /took too long/);
});
