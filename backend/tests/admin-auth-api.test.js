import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../src/services/session-token.js';
import {
  OTHER_PASSWORD,
  SESSION_POLICY,
  TEST_EMAIL,
  TEST_PASSWORD,
  setupAdminApp,
} from './helpers/admin.js';

const apps = [];
async function setup(options) {
  const app = await setupAdminApp(options);
  apps.push(app);
  return app;
}
after(async () => {
  for (const app of apps) await app.close();
});

const cookieLine = (result) => result.headers.getSetCookie()[0] ?? '';

test('a correct login answers 200 and sets the session cookie', async () => {
  const app = await setup();
  const client = app.client();
  const res = await client.login();

  assert.equal(res.status, 200);
  assert.equal(res.json.admin.email, TEST_EMAIL);
  assert.equal(res.json.admin.displayName, 'Test Staff');
  assert.equal(typeof res.json.admin.id, 'number');
  assert.ok(res.json.csrfToken.length >= 40);
  assert.equal(res.json.expiresAt, '2026-10-11T20:00:00.000Z');
  assert.equal(client.jar.size, 1);
});

test('the login input is normalized: the email may be written in any case', async () => {
  const app = await setup();
  const res = await app.client().login('  STAFF@Example.COM ');

  assert.equal(res.status, 200);
});

test('the response never contains a password or a hash', async () => {
  const app = await setup();
  const res = await app.client().login();

  assert.equal(res.text.includes(TEST_PASSWORD), false);
  assert.equal(/scrypt|password|hash/i.test(res.text), false);
  assert.equal(/scrypt|password/i.test(JSON.stringify(Object.fromEntries(res.headers))), false);
});

test('the session cookie is HttpOnly, SameSite=Strict and has a path and a lifetime', async () => {
  const app = await setup();
  const line = cookieLine(await app.client().login());

  assert.match(line, /^pqrs_session=[A-Za-z0-9_-]{43};/);
  assert.match(line, /; HttpOnly/);
  assert.match(line, /; SameSite=Strict/);
  assert.match(line, /; Path=\//);
  assert.match(line, /; Max-Age=28800/);
  assert.doesNotMatch(line, /; Secure/);
  assert.doesNotMatch(line, /Domain=/i);
});

test('with secure cookies on, the cookie is Secure and uses the __Host- prefix', async () => {
  const app = await setup({ cookieSecure: true });
  const line = cookieLine(await app.client().login());

  assert.match(line, /^__Host-pqrs_session=/);
  assert.match(line, /; Secure/);
  assert.match(line, /; HttpOnly/);
  assert.match(line, /; SameSite=Strict/);
  assert.match(line, /; Path=\//);
  assert.doesNotMatch(line, /Domain=/i);
});

test('only the hash of the token is stored', async () => {
  const app = await setup();
  const client = app.client();
  await client.login();
  const token = client.jar.get('pqrs_session');
  const [row] = app.sessionRows();

  assert.equal(app.sessionRows().length, 1);
  assert.equal(row.token_hash, hashToken(token));
  assert.equal(JSON.stringify(row).includes(token), false);
  assert.equal(
    JSON.stringify(app.db.prepare('SELECT * FROM admins').all()).includes(TEST_PASSWORD),
    false,
  );
});

test('the stored password is a scrypt hash, never the password', async () => {
  const app = await setup();
  const { password_hash: hash } = app.db.prepare('SELECT password_hash FROM admins').get();

  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(hash.includes(TEST_PASSWORD), false);
});

test('every failed login gets the same generic answer', async () => {
  const app = await setup();
  await app.admin.accountService.create({
    email: 'off@example.com',
    displayName: 'Off Staff',
    password: OTHER_PASSWORD,
  });
  app.admin.accountService.setActive('off@example.com', false);

  const attempts = [
    ['unknown account', 'nobody@example.com', TEST_PASSWORD],
    ['wrong password', TEST_EMAIL, 'wrong-password-123'],
    ['deactivated account, right password', 'off@example.com', OTHER_PASSWORD],
  ];
  const answers = [];
  for (const [label, email, password] of attempts) {
    const res = await app.client().login(email, password);
    assert.equal(res.status, 401, label);
    assert.equal(res.headers.getSetCookie().length, 0, label);
    answers.push(res.text);
  }

  assert.equal(new Set(answers).size, 1);
  assert.deepEqual(JSON.parse(answers[0]), { error: 'Invalid email or password.' });
});

test('malformed login bodies are rejected with 400 and no cookie', async () => {
  const app = await setup();
  const bodies = [
    {},
    { email: 'staff@example.com' },
    { password: TEST_PASSWORD },
    { email: 'bad', password: 'x' },
    { email: { $ne: '' }, password: { $ne: '' } },
    [],
    { email: TEST_EMAIL, password: 'p'.repeat(129) },
  ];

  for (const body of bodies) {
    const res = await app.client().post('/api/admin/login', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.headers.getSetCookie().length, 0);
  }
  const malformed = await app.client().post('/api/admin/login', undefined, {
    raw: '{oops',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(malformed.status, 400);
});

test('GET /api/admin/session tells who is logged in', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const res = await client.get('/api/admin/session');

  assert.equal(res.status, 200);
  assert.equal(res.json.admin.email, TEST_EMAIL);
  assert.equal(res.json.csrfToken, client.csrf);
});

test('requests without a cookie, with an empty one or with garbage are all 401', async () => {
  const app = await setup();
  const real = await app.loggedIn();
  const token = real.jar.get('pqrs_session');
  const cookies = [
    undefined,
    'pqrs_session=',
    'pqrs_session=garbage',
    `pqrs_session=${'A'.repeat(43)}`,
    `pqrs_session=${token}x`,
    `pqrs_session=${token.slice(1)}`,
    'pqrs_session=%E0%A4%A',
    `other=${token}`,
    `pqrs_session=${encodeURIComponent("' OR 1=1 --")}`,
  ];

  for (const cookie of cookies) {
    const res = await app
      .client()
      .get('/api/admin/session', { headers: cookie === undefined ? {} : { Cookie: cookie } });
    assert.equal(res.status, 401, String(cookie));
    assert.deepEqual(res.json, { error: 'Authentication required.' });
  }
});

test('a session ends at its absolute expiry, even if it is used all the time', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const twentyMinutes = 20 * 60 * 1000;

  // Always inside the idle time, up to 7 hours and 40 minutes
  for (let step = 1; step <= 23; step += 1) {
    app.clock.advance(twentyMinutes);
    assert.equal((await client.get('/api/admin/session')).status, 200, `step ${step}`);
  }

  // 25 minutes later the idle time is not over, but the 8 hours are
  app.clock.advance(25 * 60 * 1000);
  const res = await client.get('/api/admin/session');

  assert.equal(res.status, 401);
  assert.equal(app.sessionRows().length, 0);
});

test('a session ends after the idle time without use', async () => {
  const app = await setup();
  const client = await app.loggedIn();

  app.clock.advance(SESSION_POLICY.idleMs - 1000);
  assert.equal((await client.get('/api/admin/session')).status, 200);

  // The use above started a new idle period
  app.clock.advance(SESSION_POLICY.idleMs - 1000);
  assert.equal((await client.get('/api/admin/session')).status, 200);

  app.clock.advance(SESSION_POLICY.idleMs + 1000);
  assert.equal((await client.get('/api/admin/session')).status, 401);
});

test('an expired session also loses its cookie and its row', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  app.clock.advance(SESSION_POLICY.maxAgeMs + 1000);

  const res = await client.get('/api/admin/session');

  assert.equal(res.status, 401);
  assert.match(cookieLine(res), /^pqrs_session=;/);
  assert.equal(client.jar.size, 0);
  assert.equal(app.sessionRows().length, 0);
});

test('logging in again rotates the session: the old token stops working', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const oldToken = client.jar.get('pqrs_session');

  const second = await client.login();
  const newToken = client.jar.get('pqrs_session');

  assert.equal(second.status, 200);
  assert.notEqual(newToken, oldToken);
  assert.notEqual(second.json.csrfToken, undefined);
  assert.equal(app.sessionRows().length, 1);

  const stale = app.client();
  const res = await stale.get('/api/admin/session', {
    headers: { Cookie: `pqrs_session=${oldToken}` },
  });
  assert.equal(res.status, 401);
  assert.equal((await client.get('/api/admin/session')).status, 200);
});

test('a token chosen by the client is never accepted as a new session (no fixation)', async () => {
  const app = await setup();
  const chosen = 'A'.repeat(43);
  const client = app.client();
  const res = await client.post(
    '/api/admin/login',
    { email: TEST_EMAIL, password: TEST_PASSWORD },
    { headers: { Cookie: `pqrs_session=${chosen}` } },
  );

  assert.equal(res.status, 200);
  assert.notEqual(client.jar.get('pqrs_session'), chosen);
  const fixed = await app
    .client()
    .get('/api/admin/session', { headers: { Cookie: `pqrs_session=${chosen}` } });
  assert.equal(fixed.status, 401);
});

test('two browsers can be logged in at the same time', async () => {
  const app = await setup();
  const first = await app.loggedIn();
  const second = await app.loggedIn();

  assert.equal(app.sessionRows().length, 2);
  assert.equal((await first.get('/api/admin/session')).status, 200);
  assert.equal((await second.get('/api/admin/session')).status, 200);
});

test('logout ends the session on the server, not only in the browser', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const token = client.jar.get('pqrs_session');

  const res = await client.post('/api/admin/logout', {});

  assert.equal(res.status, 204);
  assert.match(cookieLine(res), /^pqrs_session=;/);
  assert.equal(app.sessionRows().length, 0);

  // Somebody who copied the cookie before cannot use it
  const copy = await app
    .client()
    .get('/api/admin/session', { headers: { Cookie: `pqrs_session=${token}` } });
  assert.equal(copy.status, 401);
});

test('logging out twice, or without a session, is not an error', async () => {
  const app = await setup();

  assert.equal((await app.client().post('/api/admin/logout', {})).status, 204);

  const client = await app.loggedIn();
  const token = client.jar.get('pqrs_session');
  await client.post('/api/admin/logout', {});
  const again = await app
    .client()
    .post('/api/admin/logout', {}, { headers: { Cookie: `pqrs_session=${token}` } });
  assert.equal(again.status, 204);
});

test('a deactivated account loses access at once, and so does a password reset', async () => {
  const app = await setup();
  await app.admin.accountService.create({
    email: 'backup@example.com',
    displayName: 'Backup Administrator',
    password: OTHER_PASSWORD,
  });
  const client = await app.loggedIn();
  app.admin.accountService.setActive(TEST_EMAIL, false);
  assert.equal((await client.get('/api/admin/session')).status, 401);
  assert.equal((await app.client().login()).status, 401);

  app.admin.accountService.setActive(TEST_EMAIL, true);
  const other = await app.loggedIn();
  await app.admin.accountService.resetPassword({ email: TEST_EMAIL, password: OTHER_PASSWORD });
  assert.equal((await other.get('/api/admin/session')).status, 401);
  assert.equal((await app.client().login(TEST_EMAIL, TEST_PASSWORD)).status, 401);
  assert.equal((await app.client().login(TEST_EMAIL, OTHER_PASSWORD)).status, 200);
});

test('a login records the time of the last login', async () => {
  const app = await setup();
  await app.client().login();

  assert.equal(
    app.admin.adminRepository.findByEmail(TEST_EMAIL).lastLoginAt,
    '2026-10-11T12:00:00.000Z',
  );
});

test('old sessions of everybody are cleaned when someone logs in', async () => {
  const app = await setup();
  await app.loggedIn();
  await app.loggedIn();
  app.clock.advance(SESSION_POLICY.maxAgeMs + 1000);

  await app.loggedIn();

  assert.equal(app.sessionRows().length, 1);
});

test('login attempts are limited per client address', async () => {
  const app = await setup({
    loginLimits: { ip: { windowMs: 60_000, max: 3 }, account: { windowMs: 60_000, max: 100 } },
  });
  const statuses = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await app.client().login(`user${attempt}@example.com`, 'wrong-password-123');
    statuses.push(res.status);
    if (res.status === 429) assert.ok(Number(res.headers.get('retry-after')) >= 1);
  }

  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test('login attempts are limited per account, so many addresses cannot guess one password', async () => {
  const app = await setup({
    loginLimits: { ip: { windowMs: 60_000, max: 100 }, account: { windowMs: 60_000, max: 3 } },
  });
  const statuses = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    statuses.push((await app.client().login(TEST_EMAIL, `guess-number-${attempt}-xx`)).status);
  }
  // Even the right password waits once the limit is reached
  statuses.push((await app.client().login(TEST_EMAIL, TEST_PASSWORD)).status);

  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  // Another account is not affected
  assert.equal((await app.client().login('someone@example.com', 'x')).status, 401);
});

test('the account limit ignores the case and the spaces of the email', async () => {
  const app = await setup({
    loginLimits: { ip: { windowMs: 60_000, max: 100 }, account: { windowMs: 60_000, max: 2 } },
  });
  const statuses = [];

  for (const email of ['staff@example.com', 'STAFF@example.com', ' Staff@Example.com ']) {
    statuses.push((await app.client().login(email, 'wrong-password-123')).status);
  }

  assert.deepEqual(statuses, [401, 401, 429]);
});

test('X-Forwarded-For is ignored unless a proxy is trusted: it cannot dodge the login limit', async () => {
  const app = await setup({
    loginLimits: { ip: { windowMs: 60_000, max: 2 }, account: { windowMs: 60_000, max: 100 } },
  });
  const statuses = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await app.client().login(`u${attempt}@example.com`, 'x', undefined);
    statuses.push(res.status);
  }
  const spoofed = await app
    .client()
    .post(
      '/api/admin/login',
      { email: 'z@example.com', password: 'x' },
      { headers: { 'X-Forwarded-For': '203.0.113.9' } },
    );

  assert.deepEqual(statuses, [401, 401, 429, 429]);
  assert.equal(spoofed.status, 429);
});

test('public submission is not affected by the login limit', async () => {
  const app = await setup({
    loginLimits: { ip: { windowMs: 60_000, max: 1 }, account: { windowMs: 60_000, max: 1 } },
  });
  await app.client().login('a@example.com', 'x');
  await app.client().login('a@example.com', 'x');

  const res = await app.client().post('/api/pqrs', {
    type: 'petition',
    subject: 'Street light is broken',
    description: 'The street light in front of my house has been off for two weeks.',
    requesterName: 'Ana Gomez',
    requesterEmail: 'ana@example.com',
  });

  assert.equal(res.status, 201);
});

test('staff API answers are never stored by a browser or a proxy', async () => {
  const app = await setup();
  const client = await app.loggedIn();

  for (const res of [
    await client.get('/api/admin/session'),
    await app.client().get('/api/admin/session'),
    await app.client().login('x@example.com', 'x'),
  ]) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});
