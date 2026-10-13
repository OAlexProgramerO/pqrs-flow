import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The real default app, with its real settings, but on a temporary database
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-default-app-'));
const dbFile = path.join(dir, 'pqrs.db');
process.env.DB_PATH = dbFile;

const { startServer } = await import('./helpers/server.js');
const { openDatabase, closeDb } = await import('../src/db/database.js');
const { createAdminContext } = await import('../src/admin-context.js');
const { createClient } = await import('./helpers/admin.js');

const server = await startServer();
after(async () => {
  await server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('anonymous visitors never make the default app open the database', async () => {
  const client = createClient(server.baseUrl);

  assert.equal((await client.get('/admin/')).status, 302);
  assert.equal((await client.get('/admin/login.html')).status, 200);
  assert.equal((await client.get('/api/admin/session')).status, 401);
  assert.equal((await client.get('/api/admin/pqrs')).status, 401);
  assert.equal(
    (await client.patch('/api/admin/pqrs/PQRS-2026-000001/status', { status: 'closed' })).status,
    401,
  );
  assert.equal((await client.get('/api/health')).status, 200);
  assert.equal((await client.get('/')).status, 200);

  assert.equal(fs.existsSync(dbFile), false);
});

test('with the real settings: provision, log in, use the panel, log out', async () => {
  // Provisioned like the command line tool does it, with the real password cost
  const db = openDatabase({ filename: dbFile });
  const { accountService } = createAdminContext(db);
  await accountService.create({
    email: 'real@example.com',
    displayName: 'Real Staff',
    password: 'a test-only passphrase',
  });
  db.close();

  const client = createClient(server.baseUrl);
  const created = await client.post('/api/pqrs', {
    type: 'claim',
    subject: 'Wrong amount on my invoice',
    description: 'I was charged twice for the same service last month.',
    requesterName: 'Maria Lopez',
    requesterEmail: 'maria@example.com',
  });
  assert.equal(created.status, 201);

  const bad = await client.login('real@example.com', 'not the passphrase');
  assert.equal(bad.status, 401);

  const ok = await client.login('real@example.com', 'a test-only passphrase');
  assert.equal(ok.status, 200);
  // NODE_ENV=test: the cookie is not Secure here (production would add Secure and __Host-)
  assert.match(ok.response.headers.getSetCookie()[0], /^pqrs_session=.*HttpOnly.*SameSite=Strict/);

  assert.equal((await client.get('/admin/')).status, 200);
  assert.equal((await client.get('/api/admin/stats')).json.total, 1);

  const changed = await client.patch(`/api/admin/pqrs/${created.json.caseNumber}/status`, {
    status: 'in_progress',
  });
  assert.equal(changed.status, 200);

  const lookup = await createClient(server.baseUrl).post('/api/pqrs/lookup', {
    caseNumber: created.json.caseNumber,
    requesterEmail: 'maria@example.com',
  });
  assert.equal(lookup.json.status, 'in_progress');

  assert.equal((await client.post('/api/admin/logout', {})).status, 204);
  assert.equal((await client.get('/api/admin/stats')).status, 401);
});
