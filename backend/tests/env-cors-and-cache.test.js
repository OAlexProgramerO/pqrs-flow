import { test } from 'node:test';
import assert from 'node:assert/strict';

// A different query string forces Node to evaluate the module again.
// Empty values stand for "not set", whatever the .env file of the developer says.
async function loadEnv(label, values = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    CORS_ORIGINS: '',
    STATIC_CACHE_SECONDS: '',
    ...values,
  });
  return import(`../src/config/env.js?${label}`);
}

test('no website is allowed and nothing is cached by default in development', async () => {
  const { env } = await loadEnv('defaults');

  assert.equal(env.corsOrigins, false);
  assert.equal(env.staticCacheSeconds, 0);
});

test('static files are kept for an hour by default in production', async () => {
  const { env } = await loadEnv('production', { NODE_ENV: 'production' });

  assert.equal(env.staticCacheSeconds, 3600);
});

test('reads STATIC_CACHE_SECONDS, including zero', async () => {
  const custom = await loadEnv('cache-custom', {
    NODE_ENV: 'production',
    STATIC_CACHE_SECONDS: '600',
  });
  const zero = await loadEnv('cache-zero', { NODE_ENV: 'production', STATIC_CACHE_SECONDS: '0' });

  assert.equal(custom.env.staticCacheSeconds, 600);
  assert.equal(zero.env.staticCacheSeconds, 0);
});

test('a wrong STATIC_CACHE_SECONDS falls back to the default', async () => {
  for (const [index, value] of ['abc', '-1', '1.5'].entries()) {
    const { env } = await loadEnv(`cache-bad-${index}`, {
      NODE_ENV: 'production',
      STATIC_CACHE_SECONDS: value,
    });

    assert.equal(env.staticCacheSeconds, 3600, value);
  }
});

test('reads CORS_ORIGINS from the environment', async () => {
  const { env } = await loadEnv('cors', {
    CORS_ORIGINS: 'https://a.example.com, http://localhost:5500/',
  });

  assert.deepEqual(env.corsOrigins, ['https://a.example.com', 'http://localhost:5500']);
});

test('parseCorsOrigins understands every accepted form', async () => {
  const { parseCorsOrigins } = await loadEnv('parse-cors');

  assert.equal(parseCorsOrigins(undefined), false);
  assert.equal(parseCorsOrigins(''), false);
  assert.equal(parseCorsOrigins(' , ,'), false);
  assert.equal(parseCorsOrigins('*'), '*');
  assert.equal(parseCorsOrigins('https://a.example.com,*'), '*');
  assert.deepEqual(parseCorsOrigins('https://a.example.com'), ['https://a.example.com']);
  assert.deepEqual(parseCorsOrigins('https://a.example.com//, https://b.example.com'), [
    'https://a.example.com',
    'https://b.example.com',
  ]);
});
