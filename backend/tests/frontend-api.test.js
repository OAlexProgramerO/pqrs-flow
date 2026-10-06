import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createPqrs, lookupPqrs } from '../../frontend/js/api.js';

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

test('lookupPqrs sends a JSON POST to /api/pqrs/lookup with only the two fields', async () => {
  const calls = mockFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ caseNumber: 'PQRS-2026-000001', status: 'filed' }),
  }));

  const result = await lookupPqrs({
    caseNumber: 'PQRS-2026-000001',
    requesterEmail: 'ana@example.com',
    somethingElse: 'must not be sent',
  });

  assert.equal(calls[0].url, '/api/pqrs/lookup');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    caseNumber: 'PQRS-2026-000001',
    requesterEmail: 'ana@example.com',
  });
  assert.equal(result.status, 'filed');
});

test('lookupPqrs never puts the email in the URL', async () => {
  const calls = mockFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));

  await lookupPqrs({ caseNumber: 'PQRS-2026-000001', requesterEmail: 'ana@example.com' });

  assert.equal(calls[0].url.includes('ana@example.com'), false);
  assert.equal(calls[0].url.includes('?'), false);
});

test('lookupPqrs reports a 404 with the message of the server', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: 'No request matches that case number and email.' }),
  }));

  await assert.rejects(
    lookupPqrs({ caseNumber: 'PQRS-2026-000001', requesterEmail: 'ana@example.com' }),
    (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.message, 'No request matches that case number and email.');
      return true;
    },
  );
});

test('a 429 keeps the seconds of the Retry-After header', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 429,
    headers: { get: (name) => (name === 'Retry-After' ? '120' : null) },
    json: async () => ({ error: 'Too many attempts. Please try again later.' }),
  }));

  await assert.rejects(
    lookupPqrs({ caseNumber: 'PQRS-2026-000001', requesterEmail: 'ana@example.com' }),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, 120);
      return true;
    },
  );
});

test('retryAfter stays empty when the header is missing', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 500,
    headers: { get: () => null },
    json: async () => ({ error: 'Internal server error' }),
  }));

  await assert.rejects(createPqrs(payload), (error) => {
    assert.equal(error.retryAfter, undefined);
    return true;
  });
});
