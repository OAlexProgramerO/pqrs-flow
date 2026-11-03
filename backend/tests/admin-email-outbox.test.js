import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupAdminApp } from './helpers/admin.js';

const apps = [];
after(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

async function setup() {
  const app = await setupAdminApp();
  apps.push(app);
  return app;
}

test('email operational metrics require administrator access and reveal no message data', async () => {
  const app = await setup();
  app.addRequests(1);
  const adminClient = await app.loggedIn();

  const anonymous = await app.client().get('/api/admin/email-outbox');
  assert.equal(anonymous.status, 401);

  const metrics = await adminClient.get('/api/admin/email-outbox');
  assert.equal(metrics.status, 200);
  assert.equal(metrics.headers.get('cache-control'), 'no-store');
  assert.deepEqual(metrics.json, {
    pendingCount: 1,
    processingCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    oldestPendingAt: app.clock.now().toISOString(),
    oldestPendingAgeMs: 0,
    lastSuccessfulDeliveryAt: null,
    lastFailureAt: null,
  });
  assert.doesNotMatch(metrics.text, /ana@example.com|description/i);
});

test('staff accounts cannot view email delivery operations', async () => {
  const app = await setup();
  app.db.prepare("UPDATE admins SET role = 'staff' WHERE email = ?").run('staff@example.com');

  const staffClient = await app.loggedIn();
  const result = await staffClient.get('/api/admin/email-outbox');
  assert.equal(result.status, 403);
  assert.equal(result.json.error, 'You do not have permission to perform this action.');
});
