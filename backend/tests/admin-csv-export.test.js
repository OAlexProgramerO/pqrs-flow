import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_PASSWORD, sampleRequest, setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
after(() => app.close());

const requests = [];
for (let index = 0; index < 3; index += 1) {
  requests.push(
    app.repository.create(sampleRequest(index), { now: new Date('2026-01-01T00:00:00.000Z') }),
  );
}
app.db
  .prepare(
    `UPDATE pqrs
     SET created_at = ?, status = ?, subject = ?, description = ?
     WHERE id = ?`,
  )
  .run(
    '2026-01-01T23:59:59.999Z',
    'filed',
    'Useful subject',
    'PRIVATE_DESCRIPTION_SENTINEL',
    requests[0].id,
  );
app.db
  .prepare('UPDATE pqrs SET created_at = ?, status = ? WHERE id = ?')
  .run('2026-01-02T00:00:00.000Z', 'in_progress', requests[1].id);
app.db
  .prepare('UPDATE pqrs SET created_at = ?, status = ? WHERE id = ?')
  .run('2026-01-03T12:00:00.000Z', 'closed', requests[2].id);

const adminId = app.admin.adminRepository.findByEmail('staff@example.com').id;
const client = await app.loggedIn();

function exportPath(query = '') {
  return `/api/admin/pqrs/export.csv${query}`;
}

test('anonymous users cannot export request data', async () => {
  const response = await app.client().get(exportPath());
  const publicResponse = await app.client().get('/api/pqrs/export.csv');

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('content-type')?.includes('text/csv'), false);
  assert.equal(publicResponse.status, 404);
});

test('staff can export with safe download and private-response headers', async () => {
  const response = await client.get(exportPath('?from=2026-01-01&to=2026-01-03'), {
    headers: { 'X-Request-Id': 'csv-export-trace-001' },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/csv; charset=utf-8$/);
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="pqrs-requests.csv"',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-request-id'), 'csv-export-trace-001');
  assert.match(
    response.text,
    /^"Case number","Request type","Subject","Current status","Submitted at \(UTC\)"/,
  );
});

test('date, type and status filters match inclusive UTC dates deterministically', async () => {
  const query = '?from=2026-01-01&to=2026-01-02&type=petition&status=filed';
  const response = await client.get(exportPath(query));

  assert.equal(response.status, 200);
  assert.ok(
    response.text.includes(
      `"${requests[0].caseNumber}","petition","Useful subject","filed","2026-01-01T23:59:59.999Z"`,
    ),
  );
  assert.equal(response.text.includes(requests[1].caseNumber), false);
  assert.equal(response.text.includes(requests[2].caseNumber), false);
  assert.equal((await client.get(exportPath(query))).text, response.text);
});

test('invalid, duplicate and injection-shaped filters return safe validation errors', async () => {
  const before = app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total;

  for (const query of [
    '?from=2026-02-30&to=2026-03-01',
    '?from=2026-01-03&to=2026-01-01',
    '?type=petition%27%20OR%201%3D1--',
    '?status=filed%27%20OR%201%3D1--',
    '?from=2026-01-01&to=2026-01-02&from=2026-01-02',
    '?unexpected=1',
  ]) {
    const response = await client.get(exportPath(query));
    assert.equal(response.status, 400, query);
    assert.equal(response.json.error, 'Validation failed');
    assert.equal(typeof response.json.details, 'object');
    assert.equal(response.text.includes('SQLITE_'), false);
  }

  assert.equal(app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total, before);
});

test('empty matching result produces a header-only CSV', async () => {
  const response = await client.get(exportPath('?from=2026-02-01&to=2026-02-01'));

  assert.equal(response.status, 200);
  assert.equal(response.text.split('\r\n').length, 2);
  assert.equal(response.text.includes(requests[0].caseNumber), false);
});

test('CSV excludes private request fields and unrelated staff, audit, attachment and email data', async () => {
  const item = requests[0];
  app.admin.adminPqrsRepository.createResponse({
    pqrsId: item.id,
    adminId,
    text: 'PRIVATE_RESPONSE_SENTINEL',
    state: 'draft',
    now: new Date('2026-01-04T00:00:00.000Z'),
  });
  app.admin.adminPqrsRepository.createNote({
    pqrsId: item.id,
    adminId,
    text: 'PRIVATE_NOTE_SENTINEL',
    now: new Date('2026-01-04T00:00:00.000Z'),
  });
  app.db
    .prepare(
      `INSERT INTO attachments
        (pqrs_id, storage_id, original_name, safe_name, mime_type, extension, size_bytes, visibility, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.id,
      'PRIVATE_ATTACHMENT_PATH_SENTINEL',
      'private.txt',
      'private.txt',
      'text/plain',
      '.txt',
      10,
      'internal',
      'staff',
    );
  app.db
    .prepare(
      `INSERT INTO email_notifications
        (notification_type, pqrs_id, recipient_email, payload, status, next_attempt_at, notification_key)
       VALUES ('request_received', ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      item.id,
      'private-notification@example.test',
      'PRIVATE_EMAIL_PAYLOAD_SENTINEL',
      '2026-01-04T00:00:00.000Z',
      'private-notification-key',
    );
  app.db
    .prepare(
      `INSERT INTO account_audit (actor_type, action, metadata)
       VALUES ('cli', 'account_created', ?)`,
    )
    .run('PRIVATE_AUDIT_PAYLOAD_SENTINEL');

  const before = {
    requests: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total,
    audit: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_audit').get().total,
    accountAudit: app.db.prepare('SELECT COUNT(*) AS total FROM account_audit').get().total,
    attachments: app.db.prepare('SELECT COUNT(*) AS total FROM attachments').get().total,
    notifications: app.db.prepare('SELECT COUNT(*) AS total FROM email_notifications').get().total,
  };
  const response = await client.get(exportPath('?from=2026-01-01&to=2026-01-03'));
  const passwordHash = app.db
    .prepare('SELECT password_hash FROM admins LIMIT 1')
    .get().password_hash;
  const sessionHash = Object.entries(app.sessionRows()[0]).find(
    ([key, value]) => key.includes('hash') && typeof value === 'string' && value.length > 30,
  )?.[1];

  assert.equal(response.status, 200);
  for (const privateValue of [
    'PRIVATE_DESCRIPTION_SENTINEL',
    'PRIVATE_RESPONSE_SENTINEL',
    'PRIVATE_NOTE_SENTINEL',
    'PRIVATE_AUDIT_PAYLOAD_SENTINEL',
    'PRIVATE_ATTACHMENT_PATH_SENTINEL',
    'PRIVATE_EMAIL_PAYLOAD_SENTINEL',
    'private-notification@example.test',
    'ana@example.com',
    'Ana Gomez',
    passwordHash,
    sessionHash,
  ]) {
    assert.ok(privateValue);
    assert.equal(response.text.includes(privateValue), false, privateValue);
  }
  assert.equal(response.text.includes('description'), false);
  assert.equal(response.text.includes('notes'), false);
  assert.deepEqual(
    {
      requests: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total,
      audit: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_audit').get().total,
      accountAudit: app.db.prepare('SELECT COUNT(*) AS total FROM account_audit').get().total,
      attachments: app.db.prepare('SELECT COUNT(*) AS total FROM attachments').get().total,
      notifications: app.db.prepare('SELECT COUNT(*) AS total FROM email_notifications').get()
        .total,
    },
    before,
  );
});

test('both staff roles can export while staff-only permissions remain enforced elsewhere', async () => {
  await app.admin.accountService.create({
    email: 'csv-analyst@example.com',
    displayName: 'CSV Analyst',
    password: TEST_PASSWORD,
    role: 'staff',
  });
  const staff = await app.loggedIn('csv-analyst@example.com');
  assert.equal((await staff.get(exportPath('?from=2026-01-01&to=2026-01-03'))).status, 200);
  assert.equal((await staff.get('/api/admin/staff')).status, 403);
});

test('matching exports above the server row limit are rejected, not truncated', async () => {
  const insert = app.db.prepare(
    `INSERT INTO pqrs (case_number, type, subject, description, requester_name, requester_email, created_at)
     VALUES (?, 'petition', 'Bulk test', 'Bulk test description', 'Bulk Tester', 'bulk@example.test', '2026-01-01T00:00:00.000Z')`,
  );
  const insertMany = app.db.transaction(() => {
    for (let index = 0; index < 5001; index += 1) {
      insert.run(`PQRS-2026-${String(100000 + index).slice(-6)}`);
    }
  });
  insertMany();

  const response = await client.get(exportPath('?from=2026-01-01&to=2026-01-03'));

  assert.equal(response.status, 413);
  assert.match(response.json.error, /5,000-record limit/);
  assert.equal(response.headers.get('content-type')?.includes('text/csv'), false);
});
