import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_EMAIL, TEST_PASSWORD, sampleRequest, setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
after(() => app.close());

const adminId = app.admin.adminRepository.findByEmail(TEST_EMAIL).id;

function addRequest(index, { createdAt, dueDate, transitions = [] }) {
  const item = app.repository.create(sampleRequest(index), { now: new Date(createdAt) });
  app.db
    .prepare(
      `UPDATE pqrs
       SET created_at = ?, deadline_due_date = ?, deadline_business_days = ?,
           deadline_rule_version = ?, deadline_policy_version = ?, deadline_holidays_snapshot = '[]'
       WHERE id = ?`,
    )
    .run(
      createdAt,
      dueDate ?? null,
      dueDate ? 10 : null,
      dueDate ? 1 : null,
      dueDate ? 'test' : null,
      item.id,
    );

  for (const [status, at] of transitions) {
    app.admin.adminPqrsRepository.transitionStatus(item.caseNumber, {
      adminId,
      now: new Date(at),
      decide: () => status,
    });
  }
  return item;
}

const cases = [
  addRequest(0, {
    createdAt: '2026-01-01T08:00:00.000Z',
    dueDate: '2026-01-10',
    transitions: [['in_progress', '2026-01-05T08:00:00.000Z']],
  }),
  addRequest(1, {
    createdAt: '2026-01-02T08:00:00.000Z',
    dueDate: '2026-01-12',
    transitions: [
      ['in_progress', '2026-01-03T08:00:00.000Z'],
      ['answered', '2026-01-11T08:00:00.000Z'],
    ],
  }),
  addRequest(2, { createdAt: '2026-01-03T08:00:00.000Z', dueDate: '2026-01-21' }),
  addRequest(3, { createdAt: '2026-01-04T08:00:00.000Z', dueDate: '2026-01-30' }),
  addRequest(4, { createdAt: '2026-01-05T08:00:00.000Z' }),
  addRequest(5, {
    createdAt: '2026-01-06T08:00:00.000Z',
    dueDate: '2026-01-10',
    transitions: [
      ['in_progress', '2026-01-10T08:00:00.000Z'],
      ['answered', '2026-01-20T08:00:00.000Z'],
    ],
  }),
  addRequest(6, { createdAt: '2026-01-01T08:00:00.000Z' }),
  addRequest(7, { createdAt: '2026-01-02T08:00:00.000Z' }),
  addRequest(8, { createdAt: '2026-01-03T08:00:00.000Z' }),
  addRequest(9, { createdAt: '2026-01-04T08:00:00.000Z' }),
];

const firstPublished = app.admin.adminPqrsRepository.createResponse({
  pqrsId: cases[6].id,
  adminId,
  text: 'Private published response body',
  state: 'published',
  now: new Date('2026-01-03T08:00:00.000Z'),
});
app.admin.adminPqrsRepository.createResponse({
  pqrsId: cases[7].id,
  adminId,
  text: 'Second published response',
  state: 'published',
  now: new Date('2026-01-03T08:00:00.000Z'),
});
app.admin.adminPqrsRepository.createResponse({
  pqrsId: cases[5].id,
  adminId,
  text: 'Response published after the selected report period',
  state: 'published',
  now: new Date('2026-01-20T09:00:00.000Z'),
});
app.admin.adminPqrsRepository.createResponse({
  pqrsId: cases[8].id,
  adminId,
  text: 'Draft response must not be counted',
  state: 'draft',
  now: new Date('2026-01-04T08:00:00.000Z'),
});
app.admin.adminPqrsRepository.createNote({
  pqrsId: cases[9].id,
  adminId,
  text: 'Internal note must not be counted',
  now: new Date('2026-01-05T08:00:00.000Z'),
});
app.db
  .prepare(
    `INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, created_at)
     VALUES (?, ?, ?, 'response_published', ?)`,
  )
  .run(cases[6].id, cases[6].caseNumber, adminId, '2026-01-04T08:00:00.000Z');

const client = await app.loggedIn();
const getReport = (query = '') => client.get(`/api/admin/reports${query}`);

test('reports totals, daily volume, canonical type and status distributions', async () => {
  const res = await getReport('?from=2026-01-01&to=2026-01-15');

  assert.equal(res.status, 200);
  assert.equal(res.json.totalRequests, 10);
  assert.equal(res.json.filters.bucket, 'day');
  assert.equal(res.json.volume.length, 15);
  assert.deepEqual(res.json.volume.slice(0, 6), [
    { period: '2026-01-01', count: 2 },
    { period: '2026-01-02', count: 2 },
    { period: '2026-01-03', count: 2 },
    { period: '2026-01-04', count: 2 },
    { period: '2026-01-05', count: 1 },
    { period: '2026-01-06', count: 1 },
  ]);
  assert.deepEqual(res.json.byType, { petition: 3, complaint: 3, claim: 2, suggestion: 2 });
  assert.deepEqual(res.json.byStatus, {
    filed: 7,
    in_progress: 1,
    answered: 2,
    closed: 0,
  });
  assert.equal(res.json.volume[14].count, 0);
});

test('filters use UTC date boundaries and validate types and current statuses', async () => {
  const matching = await getReport('?from=2026-01-01&to=2026-01-15&type=petition&status=filed');
  assert.equal(matching.status, 200);
  assert.equal(matching.json.totalRequests, 2);
  assert.equal(matching.json.byType.petition, 2);
  assert.equal(matching.json.byStatus.filed, 2);

  const weekly = await getReport('?from=2026-01-01&to=2026-02-15');
  assert.equal(weekly.json.filters.bucket, 'week');
  assert.equal(weekly.json.volume[0].period, '2025-12-29');
  assert.equal(weekly.json.volume.length, 7);
  assert.deepEqual(weekly.json.volume.slice(0, 2), [
    { period: '2025-12-29', count: 8 },
    { period: '2026-01-05', count: 2 },
  ]);

  const monthly = await getReport('?from=2026-01-01&to=2026-07-03');
  assert.equal(monthly.json.filters.bucket, 'month');
  assert.deepEqual(monthly.json.volume, [
    { period: '2026-01', count: 10 },
    { period: '2026-02', count: 0 },
    { period: '2026-03', count: 0 },
    { period: '2026-04', count: 0 },
    { period: '2026-05', count: 0 },
    { period: '2026-06', count: 0 },
    { period: '2026-07', count: 0 },
  ]);
});

test('response time uses the first published official response and excludes drafts and notes', async () => {
  const res = await getReport('?from=2026-01-01&to=2026-01-15');

  assert.equal(res.json.responseTime.sampleSize, 2);
  assert.equal(res.json.responseTime.averageHours, 36);
  assert.match(res.json.responseTime.definition, /response_published/);
  assert.equal(res.json.responseTime.asOf, '2026-01-15');
  assert.ok(firstPublished);
  assert.equal(res.text.includes('Private published response body'), false);
  assert.equal(res.text.includes('Draft response must not be counted'), false);
  assert.equal(res.text.includes('Internal note must not be counted'), false);
  assert.equal(res.text.includes('Response published after the selected report period'), false);
});

test('deadline rate uses the end-of-period status, saved deadline snapshot, and known-deadline denominator', async () => {
  const res = await getReport('?from=2026-01-01&to=2026-01-15');
  const { deadlines } = res.json;

  assert.equal(deadlines.asOf, '2026-01-15');
  assert.equal(deadlines.numeratorOverdue, 2);
  assert.equal(deadlines.denominatorWithDeadline, 5);
  assert.equal(deadlines.ratePercent, 40);
  assert.deepEqual(deadlines.counts, {
    overdue: 2,
    approaching: 1,
    onTime: 1,
    completed: 1,
    unavailable: 5,
  });
});

test('empty reports have zero-filled categories, empty volume, and null rates', async () => {
  const res = await getReport('?from=2026-09-01&to=2026-09-01');

  assert.equal(res.status, 200);
  assert.equal(res.json.totalRequests, 0);
  assert.deepEqual(res.json.volume, [{ period: '2026-09-01', count: 0 }]);
  assert.deepEqual(res.json.byType, { petition: 0, complaint: 0, claim: 0, suggestion: 0 });
  assert.deepEqual(res.json.byStatus, { filed: 0, in_progress: 0, answered: 0, closed: 0 });
  assert.equal(res.json.responseTime.sampleSize, 0);
  assert.equal(res.json.responseTime.averageHours, null);
  assert.equal(res.json.deadlines.denominatorWithDeadline, 0);
  assert.equal(res.json.deadlines.ratePercent, null);
});

test('invalid, duplicate, future and overlong filters return validation errors', async () => {
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'to=2026-02-30',
    'from=2026-02-02&to=2026-02-01',
    'from=2025-01-01&to=2026-01-02',
    'from=2026-01-01&to=2026-10-12',
    'type=petition%27%20OR%201%3D1--',
    'status=filed%27%20OR%201%3D1--',
    'from=2026-01-01&to=2026-01-15&from=2026-01-02',
    'from=2026-01-01&to=2026-01-15&unexpected=1',
  ]) {
    const res = await getReport(`?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.json.error, 'Validation failed');
    assert.equal(typeof res.json.details, 'object');
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total, 10);
});

test('reports require a staff session, allow the staff role, and preserve private API headers', async () => {
  const anonymous = await app.client().get('/api/admin/reports?from=2026-01-01&to=2026-01-15');
  assert.equal(anonymous.status, 401);

  await app.admin.accountService.create({
    email: 'analyst@example.com',
    displayName: 'Report Analyst',
    password: TEST_PASSWORD,
    role: 'staff',
  });
  const staff = await app.loggedIn('analyst@example.com');
  const report = await staff.get('/api/admin/reports?from=2026-01-01&to=2026-01-15', {
    headers: { 'X-Request-Id': 'report-trace-0001' },
  });

  assert.equal(report.status, 200);
  assert.equal(report.headers.get('cache-control'), 'no-store');
  assert.equal(report.headers.get('x-request-id'), 'report-trace-0001');
  for (const privateValue of [
    'ana@example.com',
    'Ana Gomez',
    'A description that is long enough',
    'Private published response body',
  ]) {
    assert.equal(report.text.includes(privateValue), false, privateValue);
  }
});

test('reports remain read-only and a request on the UTC end date is included', async () => {
  const endBoundary = addRequest(10, {
    createdAt: '2026-01-15T23:59:59.999Z',
  });
  addRequest(11, { createdAt: '2026-01-16T00:00:00.000Z' });
  const before = {
    requests: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total,
    audit: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_audit').get().total,
    notifications: app.db.prepare('SELECT COUNT(*) AS total FROM email_notifications').get().total,
  };

  const res = await getReport('?from=2026-01-15&to=2026-01-15');
  assert.equal(res.status, 200);
  assert.equal(res.json.totalRequests, 1);
  assert.equal(res.json.volume[0].count, 1);
  assert.equal(endBoundary.caseNumber.includes('PQRS-2026-'), true);
  assert.deepEqual(
    {
      requests: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs').get().total,
      audit: app.db.prepare('SELECT COUNT(*) AS total FROM pqrs_audit').get().total,
      notifications: app.db.prepare('SELECT COUNT(*) AS total FROM email_notifications').get()
        .total,
    },
    before,
  );
});
