import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmailConfig } from '../src/config/env.js';

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

test('email configuration defaults to disabled and provides bounded retry settings', () => {
  const config = parseEmailConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.maxAttempts, 5);
  assert.equal(config.retryInitialDelayMs, 30_000);
  assert.equal(config.retryMaxDelayMs, 1_800_000);
  assert.equal(config.deliveryTimeoutMs, 30_000);
  assert.equal(config.processingLeaseMs, 60_000);
});

test('enabled email configuration requires a valid sender, host, and paired credentials', () => {
  assert.throws(() => parseEmailConfig({ EMAIL_ENABLED: 'true' }), /SMTP_HOST/);
  assert.throws(
    () =>
      parseEmailConfig({
        EMAIL_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.com',
        EMAIL_FROM: 'sender@example.com\r\nBcc: other@example.com',
      }),
    /EMAIL_FROM/,
  );
  assert.throws(
    () =>
      parseEmailConfig({
        EMAIL_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.com',
        EMAIL_FROM: 'sender@example.com',
        SMTP_USER: 'user',
      }),
    /SMTP_USER and SMTP_PASS/,
  );
});

test('email settings reject malformed booleans, invalid retry bounds, and an unsafe lease', () => {
  assert.throws(() => parseEmailConfig({ EMAIL_ENABLED: 'treu' }), /EMAIL_ENABLED/);
  assert.throws(
    () => parseEmailConfig({ EMAIL_RETRY_INITIAL_DELAY_MS: 'not-a-number' }),
    /EMAIL_RETRY_INITIAL_DELAY_MS/,
  );
  assert.throws(
    () =>
      parseEmailConfig({ EMAIL_RETRY_INITIAL_DELAY_MS: '5000', EMAIL_RETRY_MAX_DELAY_MS: '1000' }),
    /must be at least/,
  );
  assert.throws(
    () =>
      parseEmailConfig({
        EMAIL_DELIVERY_TIMEOUT_MS: '5000',
        EMAIL_PROCESSING_LEASE_MS: '5000',
      }),
    /must exceed/,
  );
});
