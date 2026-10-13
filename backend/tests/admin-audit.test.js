import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/errors/http-error.js';
import { createAdminPqrsRepository } from '../src/repositories/admin-pqrs.repository.js';
import { changeStatus, getRequestDetail } from '../src/services/admin-pqrs.service.js';
import { TEST_EMAIL, TEST_PASSWORD, sampleRequest, setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
after(() => app.close());

const client = await app.loggedIn();
const adminId = app.admin.adminRepository.findByEmail(TEST_EMAIL).id;
const newRequest = () => app.repository.create(sampleRequest(0), { now: app.clock.now() });
const auditRows = (caseNumber) =>
  app.db.prepare('SELECT * FROM pqrs_audit WHERE case_number = ? ORDER BY id').all(caseNumber);
const statusOf = (caseNumber) =>
  app.db.prepare('SELECT status FROM pqrs WHERE case_number = ?').get(caseNumber).status;

test('a status change writes one audit record with the right data', async () => {
  const { caseNumber } = newRequest();
  app.clock.advance(5 * 60 * 1000);
  const res = await client.patch(
    `/api/admin/pqrs/${caseNumber}/status`,
    { status: 'in_progress' },
    { headers: { 'X-Request-Id': 'audit-trace-0001' } },
  );
  assert.equal(res.status, 200);

  const [row] = auditRows(caseNumber);
  assert.equal(auditRows(caseNumber).length, 1);
  assert.equal(row.case_number, caseNumber);
  assert.equal(row.admin_id, adminId);
  assert.equal(row.action, 'status_change');
  assert.equal(row.previous_status, 'filed');
  assert.equal(row.new_status, 'in_progress');
  assert.equal(row.request_id, 'audit-trace-0001');
  assert.equal(
    row.pqrs_id,
    app.db.prepare('SELECT id FROM pqrs WHERE case_number = ?').get(caseNumber).id,
  );
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(row.created_at, '2026-10-11T12:05:00.000Z');
});

test('previous and new status are accurate along a whole path', async () => {
  const { caseNumber } = newRequest();
  for (const status of ['in_progress', 'answered', 'in_progress', 'answered', 'closed']) {
    app.clock.advance(1000);
    await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status });
  }

  assert.deepEqual(
    auditRows(caseNumber).map((row) => [row.previous_status, row.new_status]),
    [
      ['filed', 'in_progress'],
      ['in_progress', 'answered'],
      ['answered', 'in_progress'],
      ['in_progress', 'answered'],
      ['answered', 'closed'],
    ],
  );
  // Each record starts where the previous one ended
  const rows = auditRows(caseNumber);
  for (let index = 1; index < rows.length; index += 1) {
    assert.equal(rows[index].previous_status, rows[index - 1].new_status);
  }
});

test('each record identifies the administrator who did it', async () => {
  await app.admin.accountService.create({
    email: 'second@example.com',
    displayName: 'Second Staff',
    password: TEST_PASSWORD,
  });
  const second = await app.loggedIn('second@example.com');
  const secondId = app.admin.adminRepository.findByEmail('second@example.com').id;
  const { caseNumber } = newRequest();

  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });
  await second.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'answered' });

  assert.deepEqual(
    auditRows(caseNumber).map((row) => row.admin_id),
    [adminId, secondId],
  );

  const detail = await client.get(`/api/admin/pqrs/${caseNumber}`);
  assert.deepEqual(
    detail.json.history.map((entry) => entry.admin.displayName),
    ['Test Staff', 'Second Staff'],
  );
});

test('the detail shows the history oldest first, without secrets or internal ids of requests', async () => {
  const { caseNumber } = newRequest();
  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });
  const res = await client.get(`/api/admin/pqrs/${caseNumber}`);
  const [entry] = res.json.history;

  assert.deepEqual(Object.keys(entry).sort(), [
    'action',
    'admin',
    'createdAt',
    'id',
    'newStatus',
    'previousStatus',
  ]);
  assert.deepEqual(Object.keys(entry.admin).sort(), ['displayName', 'id']);
  assert.equal(entry.action, 'status_change');
  assert.equal(/scrypt|token|csrf|@/i.test(JSON.stringify(res.json.history)), false);
});

test('the audit table holds no secrets and no personal data', async () => {
  const columns = app.db.pragma('table_info(pqrs_audit)').map((column) => column.name);

  assert.deepEqual(columns, [
    'id',
    'pqrs_id',
    'case_number',
    'admin_id',
    'action',
    'previous_status',
    'new_status',
    'request_id',
    'created_at',
  ]);

  const { caseNumber } = newRequest();
  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });
  const dump = JSON.stringify(app.db.prepare('SELECT * FROM pqrs_audit').all());
  for (const secret of [
    TEST_PASSWORD,
    client.csrf,
    client.jar.get('pqrs_session'),
    'ana@example.com',
    'Ana Gomez',
    'scrypt',
  ]) {
    assert.equal(dump.includes(secret), false, secret);
  }
});

test('if the audit record cannot be written, the status change is rolled back', () => {
  const repository = createAdminPqrsRepository(app.db);
  const { caseNumber } = newRequest();

  // An administrator that does not exist makes the audit insert fail (foreign key)
  assert.throws(
    () =>
      repository.transitionStatus(caseNumber, {
        adminId: 987654,
        requestId: null,
        now: app.clock.now(),
        decide: () => 'in_progress',
      }),
    /FOREIGN KEY/,
  );

  assert.equal(statusOf(caseNumber), 'filed');
  assert.equal(auditRows(caseNumber).length, 0);
});

test('if the audit table is broken, the whole request fails and the status stays', async () => {
  const broken = await setupAdminApp();
  after(() => broken.close());
  const owner = await broken.loggedIn();
  const [request] = broken.addRequests(1);

  // Simulates a failing disk or a damaged table: the audit insert cannot work
  broken.db.exec(
    'DROP TRIGGER pqrs_audit_no_update; DROP TRIGGER pqrs_audit_no_delete; ALTER TABLE pqrs_audit RENAME TO pqrs_audit_gone',
  );
  const silence = console.error;
  console.error = () => {};
  let res;
  try {
    res = await owner.patch(`/api/admin/pqrs/${request.caseNumber}/status`, {
      status: 'in_progress',
    });
  } finally {
    console.error = silence;
  }

  assert.equal(res.status, 500);
  assert.equal(res.json.error, 'Internal server error');
  assert.equal(/pqrs_audit|SQLITE|no such table/i.test(res.text), false);
  assert.equal(
    broken.db.prepare('SELECT status FROM pqrs WHERE case_number = ?').get(request.caseNumber)
      .status,
    'filed',
  );
});

test('a business rule that fails inside the transaction cancels everything', () => {
  const repository = createAdminPqrsRepository(app.db);
  const { caseNumber } = newRequest();

  assert.throws(
    () =>
      repository.transitionStatus(caseNumber, {
        adminId,
        requestId: null,
        now: app.clock.now(),
        decide: () => {
          throw new HttpError(409, 'no');
        },
      }),
    HttpError,
  );
  assert.equal(statusOf(caseNumber), 'filed');
  assert.equal(auditRows(caseNumber).length, 0);
});

test('the service writes status and audit together, and getRequestDetail reads them back', () => {
  const repository = createAdminPqrsRepository(app.db);
  const { caseNumber } = newRequest();

  const detail = changeStatus(repository, {
    caseNumber,
    body: { status: 'in_progress' },
    adminId,
    requestId: 'svc-test-0001',
    now: app.clock.now(),
  });

  assert.equal(detail.pqrs.status, 'in_progress');
  assert.equal(detail.history.length, 1);
  assert.deepEqual(getRequestDetail(repository, caseNumber).history, detail.history);
});

test('audit records cannot be edited or removed by the application', () => {
  const { caseNumber } = newRequest();
  changeStatus(createAdminPqrsRepository(app.db), {
    caseNumber,
    body: { status: 'in_progress' },
    adminId,
  });

  assert.throws(
    () =>
      app.db
        .prepare("UPDATE pqrs_audit SET new_status = 'closed' WHERE case_number = ?")
        .run(caseNumber),
    /append-only/,
  );
  assert.throws(
    () => app.db.prepare('DELETE FROM pqrs_audit WHERE case_number = ?').run(caseNumber),
    /append-only/,
  );
  assert.equal(auditRows(caseNumber).length, 1);
});

test('the staff API has no route that writes to the audit history', async () => {
  const { caseNumber } = newRequest();
  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });

  for (const [method, path] of [
    ['POST', `/api/admin/pqrs/${caseNumber}/history`],
    ['DELETE', `/api/admin/pqrs/${caseNumber}/history`],
    ['PUT', '/api/admin/audit'],
    ['GET', '/api/admin/audit'],
  ]) {
    assert.equal(
      (await client.request(method, path, { body: {} })).status,
      404,
      `${method} ${path}`,
    );
  }
  assert.equal(auditRows(caseNumber).length, 1);
});

// ---------- Public users never see the audit ----------

test('anonymous users cannot read or change the audit history', async () => {
  const { caseNumber } = newRequest();
  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });
  const anonymous = app.client();

  for (const [method, path] of [
    ['GET', `/api/admin/pqrs/${caseNumber}`],
    ['GET', `/api/admin/pqrs/${caseNumber}/history`],
    ['GET', '/api/admin/audit'],
    ['POST', `/api/admin/pqrs/${caseNumber}/history`],
  ]) {
    const res = await anonymous.request(method, path, { body: {} });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.text.includes('in_progress'), false);
  }
});

test('the public lookup shows no history and no staff names', async () => {
  const { caseNumber } = newRequest();
  await client.patch(`/api/admin/pqrs/${caseNumber}/status`, { status: 'in_progress' });
  const res = await app
    .client()
    .post('/api/pqrs/lookup', { caseNumber, requesterEmail: 'ana@example.com' });

  assert.deepEqual(Object.keys(res.json).sort(), ['caseNumber', 'createdAt', 'status', 'type']);
  assert.equal(/history|audit|admin|Test Staff|previous/i.test(res.text), false);
});

test('there is no public route that exposes the audit', async () => {
  const { caseNumber } = newRequest();
  for (const path of [
    `/api/pqrs/${caseNumber}`,
    `/api/pqrs/${caseNumber}/history`,
    '/api/pqrs/audit',
    '/api/audit',
    '/api/history',
  ]) {
    const res = await app.client().get(path);
    assert.equal(res.status, 404, path);
  }
});
