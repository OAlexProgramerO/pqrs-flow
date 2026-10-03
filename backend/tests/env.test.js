import { test } from 'node:test';
import assert from 'node:assert/strict';

// A different query string forces Node to evaluate the module again
async function loadEnv(label) {
  const module = await import(`../src/config/env.js?${label}`);
  return module.env;
}

test('uses the PORT environment variable', async () => {
  process.env.PORT = '4321';
  const env = await loadEnv('custom-port');

  assert.equal(env.port, 4321);
});

test('falls back to port 3000 when PORT is not a number', async () => {
  process.env.PORT = 'not-a-number';
  const env = await loadEnv('invalid-port');

  assert.equal(env.port, 3000);
});

test('reads NODE_ENV', async () => {
  process.env.NODE_ENV = 'production';
  const env = await loadEnv('node-env');

  assert.equal(env.nodeEnv, 'production');
});
