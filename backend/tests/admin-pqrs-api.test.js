import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRequest, setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
after(() => app.close());

// 12 requests on different days, of different types and in different statuses
const DAYS = ['2026-01-05', '2026-01-20', '2026-02-10', '2026-02-28', '2026-03-01', '2026-03-15'];
const created = [];
for (let index = 0; index < 12; index += 1) {
  const now = new Date(`${DAYS[index % DAYS.length]}T10:30:00.000Z`);
  created.push(
    app.repository.create(
      sampleRequest(index, { subject: `Request number ${index + 1} about topic ${index % 3}` }),
      { now },
    ),
  );
}
// created_at defaults to "now" in the database, so the dates are set directly
created.forEach((item, index) => {
  app.db
    .prepare('UPDATE pqrs SET created_at = ? WHERE case_number = ?')
    .run(`${DAYS[index % DAYS.length]}T10:30:00.000Z`, item.caseNumber);
});
app.db.prepare("UPDATE pqrs SET status = 'in_progress' WHERE id IN (1, 2, 3)").run();
app.db.prepare("UPDATE pqrs SET status = 'answered' WHERE id IN (4, 5)").run();
app.db.prepare("UPDATE pqrs SET status = 'closed' WHERE id = 6").run();

const client = await app.loggedIn();
const list = (query = '') => client.get(`/api/admin/pqrs${query}`);

test('lists requests with pagination data and the default page size', async () => {
  const res = await list();

  assert.equal(res.status, 200);
  assert.equal(res.json.data.length, 12);
  assert.deepEqual(res.json.pagination, { page: 1, pageSize: 20, totalItems: 12, totalPages: 1 });
});

test('the list is newest first by default', async () => {
  const { data } = (await list()).json;
  const dates = data.map((item) => item.createdAt);

  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('the list shows less than the detail: no description, no email, no internal id', async () => {
  const [item] = (await list()).json.data;

  assert.deepEqual(Object.keys(item).sort(), [
    'caseNumber',
    'createdAt',
    'requesterName',
    'status',
    'subject',
    'type',
  ]);
});

test('pagination splits the results and reports the totals', async () => {
  const page1 = (await list('?pageSize=5&page=1')).json;
  const page2 = (await list('?pageSize=5&page=2')).json;
  const page3 = (await list('?pageSize=5&page=3')).json;

  assert.deepEqual(page1.pagination, { page: 1, pageSize: 5, totalItems: 12, totalPages: 3 });
  assert.deepEqual([page1.data.length, page2.data.length, page3.data.length], [5, 5, 2]);

  const all = [...page1.data, ...page2.data, ...page3.data].map((item) => item.caseNumber);
  assert.equal(new Set(all).size, 12);
});

test('pages never repeat or skip rows when many share the same date', async () => {
  const sorted = [];
  for (let page = 1; page <= 6; page += 1) {
    sorted.push(
      ...(await list(`?pageSize=2&page=${page}&sort=status&order=asc`)).json.data.map(
        (item) => item.caseNumber,
      ),
    );
  }

  assert.equal(new Set(sorted).size, 12);
});

test('a page after the last one is empty, not an error', async () => {
  const res = await list('?pageSize=5&page=9');

  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data, []);
  assert.equal(res.json.pagination.totalItems, 12);
});

test('invalid pagination is rejected with details', async () => {
  for (const query of [
    'page=0',
    'page=-1',
    'page=1.5',
    'page=abc',
    'page=100001',
    'pageSize=0',
    'pageSize=101',
    'pageSize=x',
    'pageSize=1e2',
  ]) {
    const res = await list(`?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.json.error, 'Validation failed');
    assert.equal(typeof res.json.details, 'object');
  }
});

test('sorting by each allowed field works in both directions', async () => {
  for (const [sort, field] of [
    ['createdAt', 'createdAt'],
    ['caseNumber', 'caseNumber'],
    ['status', 'status'],
    ['type', 'type'],
  ]) {
    for (const order of ['asc', 'desc']) {
      const values = (await list(`?sort=${sort}&order=${order}`)).json.data.map(
        (item) => item[field],
      );
      const expected = [...values].sort();
      if (order === 'desc') expected.reverse();
      assert.deepEqual(values, expected, `${sort} ${order}`);
    }
  }
});

test('sorting by anything else is rejected, so no column name can be chosen', async () => {
  for (const sort of [
    'requester_email',
    'requesterEmail',
    'description',
    'id',
    'created_at',
    'subject; DROP TABLE pqrs',
    '1',
    '__proto__',
    'toString',
  ]) {
    const res = await list(`?sort=${encodeURIComponent(sort)}`);
    assert.equal(res.status, 400, sort);
  }
  assert.equal((await list('?order=desc;DROP')).status, 400);
});

test('filters by status and by type', async () => {
  const inProgress = (await list('?status=in_progress')).json;
  assert.equal(inProgress.pagination.totalItems, 3);
  assert.ok(inProgress.data.every((item) => item.status === 'in_progress'));

  const claims = (await list('?type=claim')).json;
  assert.equal(claims.pagination.totalItems, 3);
  assert.ok(claims.data.every((item) => item.type === 'claim'));

  const both = (await list('?status=filed&type=petition')).json;
  assert.ok(both.data.every((item) => item.status === 'filed' && item.type === 'petition'));
});

test('filters by date range, including the whole last day', async () => {
  const february = (await list('?from=2026-02-01&to=2026-02-28')).json;
  assert.equal(february.pagination.totalItems, 4);
  assert.ok(february.data.every((item) => item.createdAt.startsWith('2026-02')));

  const oneDay = (await list('?from=2026-03-01&to=2026-03-01')).json;
  assert.equal(oneDay.pagination.totalItems, 2);

  assert.equal((await list('?from=2026-03-02')).json.pagination.totalItems, 2);
  assert.equal((await list('?to=2026-01-05')).json.pagination.totalItems, 2);
  assert.equal((await list('?from=2030-01-01')).json.pagination.totalItems, 0);
});

test('invalid dates and reversed ranges are rejected', async () => {
  for (const query of [
    'from=2026-02-30',
    'from=yesterday',
    'to=2026-13-01',
    'from=2026-03-02&to=2026-03-01',
  ]) {
    assert.equal((await list(`?${query}`)).status, 400, query);
  }
});

test('search finds by case number, subject, name and email, ignoring case', async () => {
  const byCase = (await list(`?q=${created[2].caseNumber.toLowerCase()}`)).json;
  assert.deepEqual(
    byCase.data.map((item) => item.caseNumber),
    [created[2].caseNumber],
  );

  assert.equal((await list('?q=topic 2')).json.pagination.totalItems, 4);
  assert.equal((await list('?q=MARIA')).json.pagination.totalItems, 3);
  assert.equal((await list('?q=carlos@example')).json.pagination.totalItems, 3);
  assert.equal((await list('?q=2026-000012')).json.data[0].caseNumber, created[11].caseNumber);
  assert.equal((await list('?q=nothing-matches-this')).json.pagination.totalItems, 0);
});

test('search combines with the filters and with pagination', async () => {
  const res = (await list('?q=topic&status=in_progress&pageSize=2')).json;

  assert.equal(res.pagination.totalItems, 3);
  assert.equal(res.pagination.totalPages, 2);
  assert.equal(res.data.length, 2);
});

test('LIKE wildcards in the search are literal characters', async () => {
  app.db.prepare("UPDATE pqrs SET subject = 'Discount of 100% on the fee' WHERE id = 1").run();
  app.db.prepare("UPDATE pqrs SET subject = 'File_name with underscore' WHERE id = 2").run();

  assert.equal((await list(`?q=${encodeURIComponent('100%')}`)).json.pagination.totalItems, 1);
  assert.equal((await list(`?q=${encodeURIComponent('%')}`)).json.pagination.totalItems, 1);
  assert.equal((await list(`?q=${encodeURIComponent('_')}`)).json.pagination.totalItems, 1);
  assert.equal((await list(`?q=${encodeURIComponent('e_n')}`)).json.pagination.totalItems, 1);
  assert.equal((await list(`?q=${encodeURIComponent('\\')}`)).json.pagination.totalItems, 0);
});

test('SQL injection attempts return nothing and damage nothing', async () => {
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE pqrs; --",
    "' UNION SELECT password_hash,1,1,1,1,1 FROM admins --",
    '" OR ""="',
    '1; DELETE FROM admin_sessions',
    "\\' OR 1=1 --",
    "%' OR 1=1 AND '%'='",
  ];

  for (const payload of payloads) {
    const res = await list(`?q=${encodeURIComponent(payload)}`);
    assert.equal(res.status, 200, payload);
    assert.equal(res.json.pagination.totalItems, 0, payload);
    assert.equal(/scrypt/.test(res.text), false, payload);
  }
  for (const filter of ['status', 'type', 'from', 'to', 'sort', 'order', 'page', 'pageSize']) {
    const res = await list(`?${filter}=${encodeURIComponent("1' OR '1'='1")}`);
    assert.equal(res.status, 400, filter);
  }

  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM pqrs').get().n, 12);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n >= 1, true);
  assert.equal((await client.get('/api/admin/session')).status, 200);
});

test('repeated or nested query parameters are rejected', async () => {
  for (const query of [
    'status=filed&status=closed',
    'q=a&q=b',
    'status[]=filed',
    'status[$ne]=x',
    'page[]=1',
    'sort[]=createdAt',
  ]) {
    assert.equal((await list(`?${query}`)).status, 400, query);
  }
});

test('unknown parameters are ignored', async () => {
  assert.equal((await list('?foo=bar')).status, 200);
});

test('a search that is too long or has control characters is rejected', async () => {
  assert.equal((await list(`?q=${'a'.repeat(101)}`)).status, 400);
  assert.equal((await list('?q=a%00b')).status, 400);
  assert.equal((await list('?q=a%0Ab')).status, 400);
});

test('the summary counts every request and every status, zero included', async () => {
  const res = await client.get('/api/admin/stats');

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, {
    total: 12,
    byStatus: { filed: 6, in_progress: 3, answered: 2, closed: 1 },
  });
});

test('the summary shows zero for statuses without requests', async () => {
  const empty = await setupAdminApp();
  after(() => empty.close());
  const res = await (await empty.loggedIn()).get('/api/admin/stats');

  assert.deepEqual(res.json, {
    total: 0,
    byStatus: { filed: 0, in_progress: 0, answered: 0, closed: 0 },
  });
});

test('the detail has the fields the staff needs and nothing internal', async () => {
  const res = await client.get(`/api/admin/pqrs/${created[0].caseNumber}`);

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.json).sort(), ['allowedTransitions', 'history', 'pqrs']);
  assert.deepEqual(Object.keys(res.json.pqrs).sort(), [
    'caseNumber',
    'createdAt',
    'description',
    'requesterEmail',
    'requesterName',
    'status',
    'subject',
    'type',
  ]);
  assert.equal(res.json.pqrs.caseNumber, created[0].caseNumber);
  assert.equal(res.json.pqrs.requesterEmail, 'ana@example.com');
  assert.equal(res.json.pqrs.description, created[0].description);
  assert.deepEqual(res.json.history, []);
  assert.equal('id' in res.json.pqrs, false);
});

test('the detail lists the transitions the status allows', async () => {
  const states = {
    filed: ['in_progress'],
    in_progress: ['answered'],
    answered: ['closed', 'in_progress'],
    closed: [],
  };

  for (const [status, expected] of Object.entries(states)) {
    const row = app.db.prepare('SELECT case_number FROM pqrs WHERE status = ? LIMIT 1').get(status);
    const res = await client.get(`/api/admin/pqrs/${row.case_number}`);
    assert.deepEqual(res.json.allowedTransitions, expected, status);
  }
});

test('the case number of the detail is normalized, validated and may not exist', async () => {
  const lower = await client.get(`/api/admin/pqrs/${created[0].caseNumber.toLowerCase()}`);
  assert.equal(lower.status, 200);

  assert.equal((await client.get('/api/admin/pqrs/PQRS-2026-999999')).status, 404);
  assert.deepEqual((await client.get('/api/admin/pqrs/PQRS-2026-999999')).json, {
    error: 'Request not found.',
  });
  for (const bad of [
    'abc',
    'PQRS-26-1',
    encodeURIComponent("PQRS-2026-000001' OR '1'='1"),
    '..%2F..%2Fetc',
  ]) {
    assert.equal((await client.get(`/api/admin/pqrs/${bad}`)).status, 400, bad);
  }
});

// ---------- Status changes ----------

const fresh = () =>
  app.repository.create(sampleRequest(0), { now: new Date('2026-04-01T09:00:00Z') });
const put = (caseNumber, body) => client.patch(`/api/admin/pqrs/${caseNumber}/status`, body);
const statusOf = (caseNumber) =>
  app.db.prepare('SELECT status FROM pqrs WHERE case_number = ?').get(caseNumber).status;

test('a valid change updates the status and answers with the new detail', async () => {
  const { caseNumber } = fresh();
  const res = await put(caseNumber, { status: 'in_progress', expectedStatus: 'filed' });

  assert.equal(res.status, 200);
  assert.equal(res.json.pqrs.status, 'in_progress');
  assert.deepEqual(res.json.allowedTransitions, ['answered']);
  assert.equal(res.json.history.length, 1);
  assert.equal(statusOf(caseNumber), 'in_progress');
});

test('the whole workflow can be followed, and a request can be reopened once', async () => {
  const { caseNumber } = fresh();

  for (const status of ['in_progress', 'answered', 'in_progress', 'answered', 'closed']) {
    assert.equal((await put(caseNumber, { status })).status, 200, status);
  }
  assert.equal(statusOf(caseNumber), 'closed');
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit WHERE case_number = ?').get(caseNumber).n,
    5,
  );
});

test('every transition that is not allowed is refused with 409 and changes nothing', async () => {
  const allowed = {
    filed: ['in_progress'],
    in_progress: ['answered'],
    answered: ['closed', 'in_progress'],
    closed: [],
  };

  for (const [from, targets] of Object.entries(allowed)) {
    for (const to of ['filed', 'in_progress', 'answered', 'closed']) {
      if (targets.includes(to)) continue;

      const { caseNumber } = fresh();
      app.db.prepare('UPDATE pqrs SET status = ? WHERE case_number = ?').run(from, caseNumber);
      const res = await put(caseNumber, { status: to });

      assert.equal(res.status, 409, `${from} -> ${to}`);
      assert.match(res.json.error, /cannot move from/);
      assert.equal(res.json.details.currentStatus, from);
      assert.equal(statusOf(caseNumber), from);
    }
  }
});

test('refused changes leave no audit record', async () => {
  const { caseNumber } = fresh();
  await put(caseNumber, { status: 'closed' });
  await put(caseNumber, { status: 'filed' });
  await put(caseNumber, { status: 'nonsense' });

  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit WHERE case_number = ?').get(caseNumber).n,
    0,
  );
});

test('a status value outside the four statuses is a 400', async () => {
  const { caseNumber } = fresh();

  for (const body of [
    {},
    { status: 'open' },
    { status: 'CLOSED' },
    { status: ['closed'] },
    { status: null },
    { status: 7 },
    { status: 'closed', expectedStatus: 'x' },
    [],
  ]) {
    const res = await put(caseNumber, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(statusOf(caseNumber), 'filed');
});

test('changing an unknown request is a 404', async () => {
  const res = await put('PQRS-2026-999999', { status: 'in_progress' });

  assert.equal(res.status, 404);
});

test('a change based on an old view is a conflict and shows the real status', async () => {
  const { caseNumber } = fresh();
  await put(caseNumber, { status: 'in_progress' });

  const res = await put(caseNumber, { status: 'in_progress', expectedStatus: 'filed' });

  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'The request was changed by someone else. Reload it and try again.');
  assert.deepEqual(res.json.details, { currentStatus: 'in_progress' });
  assert.equal(statusOf(caseNumber), 'in_progress');
});

test('two administrators changing the same request at the same time: one wins, one gets 409', async () => {
  const second = await app.loggedIn();
  const { caseNumber } = fresh();
  app.db.prepare("UPDATE pqrs SET status = 'answered' WHERE case_number = ?").run(caseNumber);

  // Both looked at "answered". One closes it, the other reopens it.
  const [a, b] = await Promise.all([
    client.patch(`/api/admin/pqrs/${caseNumber}/status`, {
      status: 'closed',
      expectedStatus: 'answered',
    }),
    second.patch(`/api/admin/pqrs/${caseNumber}/status`, {
      status: 'in_progress',
      expectedStatus: 'answered',
    }),
  ]);

  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit WHERE case_number = ?').get(caseNumber).n,
    1,
  );
});

test('the same change sent many times at once is applied exactly once', async () => {
  const { caseNumber } = fresh();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      put(caseNumber, { status: 'in_progress', expectedStatus: 'filed' }),
    ),
  );

  assert.equal(results.filter((res) => res.status === 200).length, 1);
  assert.equal(results.filter((res) => res.status === 409).length, 7);
  assert.equal(
    app.db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit WHERE case_number = ?').get(caseNumber).n,
    1,
  );
});

test('only the status can be changed: other fields in the body are ignored', async () => {
  const { caseNumber } = fresh();
  const before = app.db
    .prepare(
      'SELECT subject, description, requester_email, case_number, type FROM pqrs WHERE case_number = ?',
    )
    .get(caseNumber);

  await put(caseNumber, {
    status: 'in_progress',
    subject: 'Hacked',
    description: 'Hacked',
    requesterEmail: 'x@x.co',
    caseNumber: 'PQRS-2026-777777',
    type: 'claim',
    id: 99,
  });

  assert.deepEqual(
    app.db
      .prepare(
        'SELECT subject, description, requester_email, case_number, type FROM pqrs WHERE case_number = ?',
      )
      .get(caseNumber),
    before,
  );
});

test('there is no way to create, edit or delete requests through the staff API', async () => {
  const { caseNumber } = fresh();

  for (const [method, path] of [
    ['POST', '/api/admin/pqrs'],
    ['PUT', `/api/admin/pqrs/${caseNumber}`],
    ['PATCH', `/api/admin/pqrs/${caseNumber}`],
    ['DELETE', `/api/admin/pqrs/${caseNumber}`],
  ]) {
    const res = await client.request(method, path, { body: { status: 'closed' } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.equal(statusOf(caseNumber), 'filed');
});

test('the public lookup shows the new status after a staff change', async () => {
  const { caseNumber } = fresh();
  await put(caseNumber, { status: 'in_progress' });

  const res = await app
    .client()
    .post('/api/pqrs/lookup', { caseNumber, requesterEmail: 'ana@example.com' });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'in_progress');
});
