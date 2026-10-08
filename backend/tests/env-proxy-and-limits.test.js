import { test } from 'node:test';
import assert from 'node:assert/strict';

// A different query string forces Node to evaluate the module again.
// Empty values stand for "not set", whatever the .env file of the developer says.
async function loadEnv(label, values = {}) {
  Object.assign(process.env, {
    TRUST_PROXY: '',
    SUBMIT_RATE_LIMIT_MAX: '',
    SUBMIT_RATE_LIMIT_WINDOW_MINUTES: '',
    ...values,
  });
  return import(`../src/config/env.js?${label}`);
}

test('there is no proxy and ten submissions per fifteen minutes by default', async () => {
  const { env } = await loadEnv('defaults');

  assert.equal(env.trustProxy, false);
  assert.deepEqual(env.submitRateLimit, { max: 10, windowMs: 15 * 60 * 1000 });
});

test('reads the submission limit from the environment', async () => {
  const { env } = await loadEnv('custom-limit', {
    SUBMIT_RATE_LIMIT_MAX: '25',
    SUBMIT_RATE_LIMIT_WINDOW_MINUTES: '60',
  });

  assert.deepEqual(env.submitRateLimit, { max: 25, windowMs: 60 * 60 * 1000 });
});

test('wrong limit values fall back to the defaults', async () => {
  for (const [index, value] of ['abc', '0', '-5', '2.5'].entries()) {
    const { env } = await loadEnv(`bad-limit-${index}`, {
      SUBMIT_RATE_LIMIT_MAX: value,
      SUBMIT_RATE_LIMIT_WINDOW_MINUTES: value,
    });

    assert.deepEqual(env.submitRateLimit, { max: 10, windowMs: 15 * 60 * 1000 }, value);
  }
});

test('reads TRUST_PROXY from the environment', async () => {
  const { env } = await loadEnv('trust-proxy', { TRUST_PROXY: '1' });

  assert.equal(env.trustProxy, 1);
});

test('parseTrustProxy understands every accepted form', async () => {
  const { parseTrustProxy } = await loadEnv('parse');

  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('  '), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('FALSE'), false);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy(' 2 '), 2);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
});
