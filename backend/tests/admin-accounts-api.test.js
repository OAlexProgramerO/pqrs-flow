import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, hasPermission } from '../src/services/permissions.js';
import { AccountConflictError } from '../src/errors/account-conflict.js';
import { OTHER_PASSWORD, TEST_EMAIL, TEST_PASSWORD, setupAdminApp } from './helpers/admin.js';

const apps = [];
async function setup(options) {
  const app = await setupAdminApp(options);
  apps.push(app);
  return app;
}
after(async () => {
  for (const app of apps) await app.close();
});

async function createStaff(app, email = 'staff-two@example.com') {
  return app.admin.accountService.create({
    email,
    displayName: 'Second Staff',
    password: OTHER_PASSWORD,
    role: 'staff',
  });
}

test('the permission map grants only explicit role capabilities', () => {
  assert.equal(hasPermission('administrator', PERMISSIONS.STAFF_MANAGE), true);
  assert.equal(hasPermission('staff', PERMISSIONS.STAFF_MANAGE), false);
  assert.equal(hasPermission('staff', PERMISSIONS.PQRS_READ), true);
  assert.equal(hasPermission('unknown', PERMISSIONS.PQRS_READ), false);
  assert.equal(hasPermission('administrator', 'unlisted:permission'), false);
});

test('anonymous visitors receive 401 from new account, password and session APIs', async () => {
  const app = await setup();
  const client = app.client();
  const results = await Promise.all([
    client.get('/api/admin/staff'),
    client.post('/api/admin/staff/search', {}),
    client.post('/api/admin/staff', {}),
    client.post('/api/admin/password/change', {}),
    client.get('/api/admin/sessions'),
    client.request('DELETE', '/api/admin/sessions/1'),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    [401, 401, 401, 401, 401, 401],
  );
});

test('staff retain permitted PQRS operations but cannot access management endpoints or pages', async () => {
  const app = await setup();
  const [request] = app.addRequests(1);
  const staff = await createStaff(app);
  const client = await app.loggedIn(staff.email, OTHER_PASSWORD);

  assert.equal((await client.get('/api/admin/stats')).status, 200);
  assert.equal((await client.get('/api/admin/pqrs')).status, 200);
  assert.equal((await client.get(`/api/admin/pqrs/${request.caseNumber}`)).status, 200);
  assert.equal(
    (
      await client.patch(`/api/admin/pqrs/${request.caseNumber}/status`, {
        status: 'in_progress',
      })
    ).status,
    200,
  );
  assert.equal((await client.get('/api/admin/staff')).status, 403);
  assert.equal((await client.post('/api/admin/staff/search', {})).status, 403);
  assert.equal(
    (
      await client.patch(`/api/admin/staff/${staff.id}`, {
        role: 'administrator',
      })
    ).status,
    403,
  );
  assert.equal((await client.get('/admin/accounts.html')).status, 302);
  assert.equal(app.admin.adminRepository.findById(staff.id).role, 'staff');
});

test('administrator account APIs create, search, edit, and audit staff without returning credentials', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const created = await client.post('/api/admin/staff', {
    email: 'new-staff@example.com',
    displayName: 'New Staff',
    password: OTHER_PASSWORD,
    confirmPassword: OTHER_PASSWORD,
    role: 'staff',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.account.role, 'staff');
  assert.equal(created.json.account.isActive, true);
  assert.equal('passwordHash' in created.json.account, false);
  assert.equal('needsPasswordUpdate' in created.json.account, false);
  assert.doesNotMatch(created.text, /scrypt|token_hash|passwordHash/i);

  const accountId = created.json.account.id;
  const search = await client.post('/api/admin/staff/search', {
    q: 'new-staff@example.com',
    role: 'staff',
    status: 'active',
    page: '1',
    pageSize: '20',
  });
  assert.equal(search.status, 200);
  assert.equal(search.json.totalItems, 1);
  assert.equal(search.json.items[0].id, accountId);

  const updated = await client.patch(`/api/admin/staff/${accountId}`, {
    displayName: 'Renamed Staff',
    role: 'administrator',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.account.role, 'administrator');
  assert.equal(updated.json.account.displayName, 'Renamed Staff');

  const audit = await client.get(`/api/admin/staff/${accountId}/audit`);
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.json.items.map((item) => item.action).sort(), [
    'account_created',
    'account_updated',
    'role_changed',
  ]);
  assert.equal(JSON.stringify(audit.json).includes(OTHER_PASSWORD), false);
  assert.throws(() => app.db.exec('UPDATE account_audit SET action = action'), /append-only/);
  assert.throws(() => app.db.exec('DELETE FROM account_audit'), /append-only/);
});

test('account APIs reject unexpected fields, malformed identifiers and invalid list filters', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  assert.equal(
    (
      await client.post('/api/admin/staff', {
        email: 'injected@example.com',
        displayName: 'Injected Staff',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        isActive: false,
      })
    ).status,
    400,
  );
  assert.equal((await client.patch('/api/admin/staff/1', { passwordHash: 'forged' })).status, 400);
  assert.equal((await client.post('/api/admin/staff/search', { q: ['a', 'b'] })).status, 400);
  assert.equal((await client.patch('/api/admin/staff/1x', { role: 'staff' })).status, 400);
  assert.equal(app.admin.adminRepository.findByEmail('injected@example.com'), null);
});

test('the last active administrator cannot be demoted or deactivated, including concurrent changes', async () => {
  const app = await setup();
  const client = await app.loggedIn();
  const first = app.admin.adminRepository.findByEmail(TEST_EMAIL);

  const selfDemote = await client.patch(`/api/admin/staff/${first.id}`, { role: 'staff' });
  assert.equal(selfDemote.status, 400);
  const selfDeactivate = await client.patch(`/api/admin/staff/${first.id}`, { isActive: false });
  assert.equal(selfDeactivate.status, 400);

  const second = await app.admin.accountService.create({
    email: 'second-admin@example.com',
    displayName: 'Second Administrator',
    password: OTHER_PASSWORD,
    role: 'administrator',
  });
  const results = await Promise.all([
    Promise.resolve()
      .then(() => app.admin.accountService.update(first.id, { role: 'staff' }))
      .catch((error) => error),
    Promise.resolve()
      .then(() => app.admin.accountService.update(second.id, { isActive: false }))
      .catch((error) => error),
  ]);
  assert.equal(results.filter((result) => result?.id).length, 1);
  assert.equal(results.filter((result) => result instanceof AccountConflictError).length, 1);
  assert.equal(
    app.db
      .prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'administrator' AND is_active = 1")
      .get().n,
    1,
  );
});

test('password changes verify the current secret, preserve this session, and revoke others', async () => {
  const app = await setup();
  const current = await app.loggedIn();
  const other = await app.loggedIn();
  const wrong = await current.post('/api/admin/password/change', {
    currentPassword: OTHER_PASSWORD,
    newPassword: 'a new secure password',
    confirmPassword: 'a new secure password',
  });
  assert.equal(wrong.status, 400);

  const reuse = await current.post('/api/admin/password/change', {
    currentPassword: TEST_PASSWORD,
    newPassword: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
  });
  assert.equal(reuse.status, 400);

  const changed = await current.post('/api/admin/password/change', {
    currentPassword: TEST_PASSWORD,
    newPassword: 'a new secure password',
    confirmPassword: 'a new secure password',
  });
  assert.equal(changed.status, 204);
  assert.equal((await current.get('/api/admin/session')).status, 200);
  assert.equal((await other.get('/api/admin/session')).status, 401);
  assert.equal((await app.client().login(TEST_EMAIL, TEST_PASSWORD)).status, 401);
  assert.equal((await app.client().login(TEST_EMAIL, 'a new secure password')).status, 200);
  assert.equal(
    app.db
      .prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action = 'password_changed'")
      .get().n,
    1,
  );
});

test('administrator resets revoke sessions and require a password update before normal use', async () => {
  const app = await setup();
  const adminClient = await app.loggedIn();
  const staff = await createStaff(app);
  const firstSession = await app.loggedIn(staff.email, OTHER_PASSWORD);
  const secondSession = await app.loggedIn(staff.email, OTHER_PASSWORD);

  const reset = await adminClient.post(`/api/admin/staff/${staff.id}/password-reset`, {
    password: 'a temporary reset password',
    confirmPassword: 'a temporary reset password',
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.mustSetNewPassword, true);
  assert.equal('passwordHash' in reset.json.account, false);
  assert.equal((await firstSession.get('/api/admin/session')).status, 401);
  assert.equal((await secondSession.get('/api/admin/session')).status, 401);

  const client = await app.loggedIn(staff.email, 'a temporary reset password');
  assert.equal((await client.get('/api/admin/session')).json.admin.credentialUpdateRequired, true);
  assert.equal((await client.get('/api/admin/stats')).status, 403);
  assert.equal(
    (
      await client.post('/api/admin/password/change', {
        currentPassword: 'a temporary reset password',
        newPassword: 'the staff member new password',
        confirmPassword: 'the staff member new password',
      })
    ).status,
    204,
  );
  assert.equal((await client.get('/api/admin/stats')).status, 200);
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action = 'password_reset'").get()
      .n,
    1,
  );
});

test('session APIs expose safe metadata, revoke only owned sessions, and preserve the current one', async () => {
  const app = await setup();
  const first = await app.loggedIn();
  const second = await app.loggedIn();
  const listed = await second.get('/api/admin/sessions');
  assert.equal(listed.status, 200);
  assert.equal(listed.json.sessions.length, 2);
  assert.equal(listed.json.sessions.filter((session) => session.current).length, 1);
  assert.equal(/token|hash/i.test(JSON.stringify(listed.json.sessions)), false);

  const firstSession = listed.json.sessions.find((session) => !session.current);
  const revoked = await second.request('DELETE', `/api/admin/sessions/${firstSession.sessionId}`);
  assert.equal(revoked.status, 204);
  assert.equal((await first.get('/api/admin/session')).status, 401);
  assert.equal((await second.get('/api/admin/session')).status, 200);

  await app.loggedIn();
  const revokeOthers = await second.request('DELETE', '/api/admin/sessions/others');
  assert.equal(revokeOthers.status, 200);
  assert.equal(revokeOthers.json.revoked, 1);
  assert.equal((await second.get('/api/admin/session')).status, 200);
  assert.deepEqual(
    app.db
      .prepare("SELECT action FROM account_audit WHERE action LIKE '%session%' ORDER BY id")
      .all()
      .map((row) => row.action),
    ['session_revoked', 'other_sessions_revoked'],
  );
});

test('logout records the revoked session without exposing its token', async () => {
  const app = await setup();
  const client = await app.loggedIn();

  assert.equal((await client.post('/api/admin/logout')).status, 204);
  const [event] = app.db
    .prepare("SELECT action, metadata FROM account_audit WHERE action = 'session_revoked'")
    .all();
  assert.equal(event.action, 'session_revoked');
  assert.equal(JSON.parse(event.metadata).method, 'logout');
  assert.equal(Object.hasOwn(JSON.parse(event.metadata), 'token'), false);
  assert.equal((await client.get('/api/admin/session')).status, 401);
});

test('login rotation records the replaced session in the account audit', async () => {
  const app = await setup();
  const client = await app.loggedIn();

  assert.equal((await client.login(TEST_EMAIL, TEST_PASSWORD)).status, 200);
  const event = app.db
    .prepare("SELECT metadata FROM account_audit WHERE action = 'session_revoked'")
    .get();
  assert.equal(JSON.parse(event.metadata).method, 'login_rotation');
});

test('sensitive updates require CSRF and are rate limited', async () => {
  const app = await setup({
    managementLimits: {
      ip: { windowMs: 60_000, max: 10 },
      account: { windowMs: 60_000, max: 1 },
    },
  });
  const client = await app.loggedIn();
  const noCsrf = await client.post(
    '/api/admin/staff',
    {
      email: 'limited@example.com',
      displayName: 'Limited Staff',
      password: OTHER_PASSWORD,
      confirmPassword: OTHER_PASSWORD,
    },
    { csrf: false },
  );
  assert.equal(noCsrf.status, 403);
  const first = await client.post('/api/admin/staff', {
    email: 'limited@example.com',
    displayName: 'Limited Staff',
    password: OTHER_PASSWORD,
    confirmPassword: OTHER_PASSWORD,
  });
  assert.equal(first.status, 201);
  const limited = await client.post('/api/admin/staff', {
    email: 'another-limited@example.com',
    displayName: 'Another Staff',
    password: OTHER_PASSWORD,
    confirmPassword: OTHER_PASSWORD,
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
