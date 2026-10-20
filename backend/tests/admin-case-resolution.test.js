import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRequest, setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
after(() => app.close());

const client = await app.loggedIn();
const newRequest = () => app.repository.create(sampleRequest(0), { now: app.clock.now() });
const publicLookup = (caseNumber) =>
  app.client().post('/api/pqrs/lookup', {
    caseNumber,
    requesterEmail: sampleRequest(0).requesterEmail,
  });

test('draft responses and internal notes stay private; published responses use the public contract', async () => {
  const { caseNumber } = newRequest();
  const responsePath = `/api/admin/pqrs/${caseNumber}/reply`;
  const notesPath = `/api/admin/pqrs/${caseNumber}/notes`;
  const draft = await client.patch(
    responsePath,
    { text: 'Draft wording for review.', state: 'draft' },
    { headers: { 'X-Request-Id': 'reply-draft-001' } },
  );
  assert.equal(draft.status, 200);
  assert.equal(draft.json.response.state, 'draft');

  const note = await client.post(
    notesPath,
    { text: 'Internal case note.' },
    {
      headers: { 'X-Request-Id': 'note-created-001' },
    },
  );
  assert.equal(note.status, 201);
  assert.equal(note.json.note.text, 'Internal case note.');
  assert.deepEqual(
    (await client.get(notesPath)).json.notes.map((item) => item.text),
    ['Internal case note.'],
  );

  const privateLookup = await publicLookup(caseNumber);
  assert.equal(privateLookup.status, 200);
  assert.deepEqual(Object.keys(privateLookup.json).sort(), [
    'caseNumber',
    'createdAt',
    'status',
    'type',
  ]);
  assert.equal(privateLookup.text.includes('Draft wording'), false);
  assert.equal(privateLookup.text.includes('Internal case note'), false);

  const publishedAt = app.clock.now().toISOString();
  const published = await client.patch(
    responsePath,
    { text: 'The approved answer.', state: 'published' },
    { headers: { 'X-Request-Id': 'reply-published-001' } },
  );
  assert.equal(published.status, 200);
  assert.equal(published.json.response.state, 'published');
  assert.equal(published.json.response.publishedAt, publishedAt);

  const publicResult = await publicLookup(caseNumber);
  assert.equal(publicResult.status, 200);
  assert.deepEqual(publicResult.json.officialResponse, {
    text: 'The approved answer.',
    publishedAt,
  });
  assert.equal(publicResult.text.includes('Internal case note'), false);
  assert.equal(publicResult.text.includes('reply-published-001'), false);

  const events = app.db
    .prepare('SELECT action, request_id FROM pqrs_audit WHERE case_number = ? ORDER BY id')
    .all(caseNumber);
  assert.deepEqual(events, [
    { action: 'response_created', request_id: 'reply-draft-001' },
    { action: 'note_created', request_id: 'note-created-001' },
    { action: 'response_published', request_id: 'reply-published-001' },
  ]);
});

test('assignment changes are audited, invalid input is rejected, and unassignment is safe', async () => {
  const { caseNumber } = newRequest();
  const assignmentPath = `/api/admin/pqrs/${caseNumber}/assignment`;
  const responsePath = `/api/admin/pqrs/${caseNumber}/reply`;
  const adminId = app.admin.adminRepository.findByEmail('staff@example.com').id;
  const assigned = await client.patch(
    assignmentPath,
    { assigneeId: adminId },
    { headers: { 'X-Request-Id': 'assign-case-001' } },
  );
  assert.equal(assigned.status, 200);
  assert.equal(assigned.json.assignment.assignee.id, adminId);

  const cleared = await client.patch(
    assignmentPath,
    { assigneeId: null },
    { headers: { 'X-Request-Id': 'unassign-case-001' } },
  );
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.assignment.assignee, null);

  for (const body of [{}, { assigneeId: '1' }, { assigneeId: adminId, extra: true }]) {
    assert.equal((await client.patch(assignmentPath, body)).status, 400);
  }
  assert.equal(
    (await client.patch(responsePath, { text: 'Some answer', state: 'approved' })).status,
    400,
  );

  assert.deepEqual(
    app.db
      .prepare('SELECT action, request_id FROM pqrs_audit WHERE case_number = ? ORDER BY id')
      .all(caseNumber),
    [
      { action: 'assignment_changed', request_id: 'assign-case-001' },
      { action: 'assignment_changed', request_id: 'unassign-case-001' },
    ],
  );
});

test('case-resolution writes require an authorized staff session', async () => {
  const { caseNumber } = newRequest();
  const responsePath = `/api/admin/pqrs/${caseNumber}/reply`;
  const notesPath = `/api/admin/pqrs/${caseNumber}/notes`;
  const assignmentPath = `/api/admin/pqrs/${caseNumber}/assignment`;
  const anonymous = app.client();
  assert.equal((await anonymous.patch(responsePath, { text: 'Private draft.' })).status, 401);
  assert.equal((await anonymous.post(notesPath, { text: 'Private note.' })).status, 401);
  assert.equal((await anonymous.patch(assignmentPath, { assigneeId: 1 })).status, 401);
  assert.equal((await anonymous.get(notesPath)).status, 401);

  const publicRoute = await app.client().get(`/api/pqrs/${caseNumber}/notes`);
  assert.equal(publicRoute.status, 404);
});

test('response, note, and assignment writes roll back when their audit record cannot be saved', async () => {
  const { caseNumber } = newRequest();
  const responsePath = `/api/admin/pqrs/${caseNumber}/reply`;
  const notesPath = `/api/admin/pqrs/${caseNumber}/notes`;
  const assignmentPath = `/api/admin/pqrs/${caseNumber}/assignment`;
  app.db.exec(`
    CREATE TRIGGER reject_case_resolution_audit
    BEFORE INSERT ON pqrs_audit
    WHEN NEW.action != 'status_change'
    BEGIN
      SELECT RAISE(ABORT, 'simulated audit failure');
    END;
  `);

  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await client.patch(responsePath, { text: 'No partial response.' })).status, 500);
    assert.equal((await client.post(notesPath, { text: 'No partial note.' })).status, 500);
    assert.equal((await client.patch(assignmentPath, { assigneeId: 1 })).status, 500);
  } finally {
    console.error = originalError;
  }

  const pqrsId = app.db.prepare('SELECT id FROM pqrs WHERE case_number = ?').get(caseNumber).id;
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_responses WHERE pqrs_id = ?').get(pqrsId)
      .total,
    0,
  );
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_notes WHERE pqrs_id = ?').get(pqrsId).total,
    0,
  );
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_assignments WHERE pqrs_id = ?').get(pqrsId)
      .total,
    0,
  );
});

test('publishing a response enqueues the response_published notification without affecting draft or private notes', async () => {
  const isolated = await setupAdminApp();
  after(() => isolated.close());
  const owner = await isolated.loggedIn();
  const { caseNumber } = isolated.repository.create(sampleRequest(0), {
    now: isolated.clock.now(),
  });
  const responsePath = `/api/admin/pqrs/${caseNumber}/reply`;

  const draft = await owner.patch(responsePath, {
    text: 'Draft wording for review.',
    state: 'draft',
  });
  assert.equal(draft.status, 200);

  const published = await owner.patch(responsePath, {
    text: 'The approved answer.',
    state: 'published',
  });
  assert.equal(published.status, 200);

  const rows = isolated.db
    .prepare(
      'SELECT notification_type AS notificationType, recipient_email AS recipientEmail, payload FROM email_notifications WHERE pqrs_id = ? ORDER BY id',
    )
    .all(isolated.db.prepare('SELECT id FROM pqrs WHERE case_number = ?').get(caseNumber).id);

  const notificationRows = rows.map((row) => ({
    notificationType: row.notificationType,
    recipientEmail: row.recipientEmail,
    payload: JSON.parse(row.payload),
  }));

  assert.equal(
    notificationRows.some((row) => row.notificationType === 'request_received'),
    true,
  );
  assert.equal(
    notificationRows.some((row) => row.notificationType === 'response_published'),
    true,
  );
  assert.deepEqual(notificationRows.at(-1), {
    notificationType: 'response_published',
    recipientEmail: sampleRequest(0).requesterEmail,
    payload: {
      caseNumber,
      subject: sampleRequest(0).subject,
      text: 'The approved answer.',
      notificationType: 'response_published',
    },
  });
});
