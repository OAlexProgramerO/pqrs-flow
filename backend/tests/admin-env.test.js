import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEYS = [
  'NODE_ENV',
  'SESSION_IDLE_MINUTES',
  'SESSION_MAX_HOURS',
  'SESSION_COOKIE_SECURE',
  'LOGIN_RATE_LIMIT_MAX',
  'LOGIN_ACCOUNT_RATE_LIMIT_MAX',
  'LOGIN_RATE_LIMIT_WINDOW_MINUTES',
];

// A different query string forces Node to evaluate the module again. Empty means "not set".
async function loadEnv(label, values = {}) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, Object.fromEntries(KEYS.map((key) => [key, ''])), values);

  try {
    return await import(`../src/config/env.js?admin-${label}`);
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('sessions last 30 idle minutes or 8 hours by default', async () => {
  const { env } = await loadEnv('defaults', { NODE_ENV: 'development' });

  assert.equal(env.session.idleMs, 30 * 60 * 1000);
  assert.equal(env.session.maxAgeMs, 8 * 60 * 60 * 1000);
});

test('the cookie is Secure by default in production and not in development', async () => {
  assert.equal((await loadEnv('prod', { NODE_ENV: 'production' })).env.session.cookieSecure, true);
  assert.equal((await loadEnv('dev', { NODE_ENV: 'development' })).env.session.cookieSecure, false);
  assert.equal((await loadEnv('test', { NODE_ENV: 'test' })).env.session.cookieSecure, false);
});

test('SESSION_COOKIE_SECURE can switch the cookie either way, and a typo never weakens production', async () => {
  assert.equal(
    (await loadEnv('off', { NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' })).env.session
      .cookieSecure,
    false,
  );
  assert.equal(
    (await loadEnv('on', { NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' })).env.session
      .cookieSecure,
    true,
  );
  assert.equal(
    (await loadEnv('typo', { NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'fasle' })).env.session
      .cookieSecure,
    true,
  );
});

test('session times come from the environment, and wrong values fall back', async () => {
  const custom = await loadEnv('custom', { SESSION_IDLE_MINUTES: '10', SESSION_MAX_HOURS: '2' });
  assert.equal(custom.env.session.idleMs, 10 * 60 * 1000);
  assert.equal(custom.env.session.maxAgeMs, 2 * 60 * 60 * 1000);

  for (const [index, bad] of ['abc', '0', '-1', '1.5'].entries()) {
    const { env } = await loadEnv(`bad-${index}`, {
      SESSION_IDLE_MINUTES: bad,
      SESSION_MAX_HOURS: bad,
    });
    assert.equal(env.session.idleMs, 30 * 60 * 1000, bad);
    assert.equal(env.session.maxAgeMs, 8 * 60 * 60 * 1000, bad);
  }
});

test('login attempts: 10 per address and 5 per account every 15 minutes by default', async () => {
  const { env } = await loadEnv('login-defaults');

  assert.deepEqual(env.loginRateLimit, {
    ip: { max: 10, windowMs: 15 * 60 * 1000 },
    account: { max: 5, windowMs: 15 * 60 * 1000 },
  });
});

test('the login limits come from the environment', async () => {
  const { env } = await loadEnv('login-custom', {
    LOGIN_RATE_LIMIT_MAX: '20',
    LOGIN_ACCOUNT_RATE_LIMIT_MAX: '3',
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: '30',
  });

  assert.deepEqual(env.loginRateLimit, {
    ip: { max: 20, windowMs: 30 * 60 * 1000 },
    account: { max: 3, windowMs: 30 * 60 * 1000 },
  });
});

test('parseBoolean understands the usual spellings and keeps the fallback otherwise', async () => {
  const { parseBoolean } = await loadEnv('parse-boolean');

  for (const yes of ['true', 'TRUE', '1', 'yes', 'on', ' true '])
    assert.equal(parseBoolean(yes, false), true, yes);
  for (const no of ['false', 'FALSE', '0', 'no', 'off'])
    assert.equal(parseBoolean(no, true), false, no);
  for (const other of ['', undefined, 'maybe', '2']) {
    assert.equal(parseBoolean(other, true), true);
    assert.equal(parseBoolean(other, false), false);
  }
});
