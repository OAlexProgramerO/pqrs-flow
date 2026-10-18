import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ADMIN_FILES } from '../src/middlewares/admin-auth.js';
import { setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
const [first] = app.addRequests(2);
after(() => app.close());

const PROTECTED_PAGES = ['/admin', '/admin/', '/admin/index.html', '/admin/request.html'];
const PROTECTED_ASSETS = ['/admin/js/dashboard.js', '/admin/js/request.js', '/admin/js/session.js'];

const status = (caseNumber) =>
  app.db.prepare('SELECT status FROM pqrs WHERE case_number = ?').get(caseNumber).status;

// ---------- Pages ----------

test('anonymous visitors are sent from every staff page to the login page', async () => {
  for (const path of PROTECTED_PAGES) {
    const res = await app.client().get(path);

    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), '/admin/login.html', path);
    assert.equal(res.text.includes('Dashboard'), false, path);
  }
});

test('anonymous visitors cannot read the code of the staff pages', async () => {
  for (const path of PROTECTED_ASSETS) {
    const res = await app.client().get(path);

    assert.equal(res.status, 401, path);
    assert.equal(res.text.includes('import '), false, path);
  }
});

test('the login page and the files it needs are public', async () => {
  assert.deepEqual([...PUBLIC_ADMIN_FILES].sort(), [
    '/css/admin.css',
    '/js/admin-api.js',
    '/js/login.js',
    '/js/messages.js',
    '/login.html',
  ]);

  for (const file of PUBLIC_ADMIN_FILES) {
    const res = await app.client().get(`/admin${file}`);
    assert.equal(res.status, 200, file);
  }
  assert.ok((await app.client().get('/admin/login.html')).text.includes('id="loginForm"'));
});

test('spelling tricks do not open the staff pages', async () => {
  const attempts = [
    '/admin//index.html',
    '//admin/index.html',
    '/admin/./index.html',
    '/admin/%69ndex.html',
    '/admin/%2e%2e/admin/index.html',
    '/admin/js/login.js/../dashboard.js',
    '/admin/js/%6cogin.js/../dashboard.js',
    '/admin/js/dashboard.js%00.js',
    '/admin/login.html/../index.html',
    '/ADMIN/index.html',
    '/Admin/Index.html',
    '/admin/index.html?x=/login.html',
    '/admin\\index.html',
    '/frontend-admin/index.html',
    '/../frontend-admin/index.html',
  ];

  for (const path of attempts) {
    const res = await app.client().get(path);
    assert.equal(res.text.includes('id="metrics"'), false, `${path} leaked the dashboard`);
    assert.equal(res.text.includes('statusForm'), false, `${path} leaked the detail page`);
    assert.equal(res.text.includes('listRequests'), false, `${path} leaked the code`);
  }
});

test('the public static handler never serves files of the staff folder', async () => {
  for (const path of [
    '/js/dashboard.js',
    '/admin.css',
    '/css/admin.css',
    '/request.html',
    '/login.html',
  ]) {
    const res = await app.client().get(path);
    assert.notEqual(res.status, 200, path);
  }
});

test('staff pages other than GET are refused to anonymous visitors', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await app.client().request(method, '/admin/login.html', { body: {} });
    assert.equal(res.status === 401 || res.status === 403, true, method);
  }
});

test('a logged in administrator gets the pages, which are never cached', async () => {
  const client = await app.loggedIn();

  for (const path of [
    '/admin/',
    '/admin/index.html',
    '/admin/request.html',
    '/admin/js/dashboard.js',
    '/admin/js/request.js',
  ]) {
    const res = await client.get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('cache-control'), 'no-store', path);
  }
  assert.ok((await client.get('/admin/')).text.includes('id="metrics"'));
  assert.ok((await client.get('/admin/request.html')).text.includes('id="statusForm"'));
});

test('a stale or invalid cookie does not open the pages', async () => {
  for (const cookie of ['pqrs_session=garbage', `pqrs_session=${'B'.repeat(43)}`]) {
    const res = await app.client().get('/admin/', { headers: { Cookie: cookie } });
    assert.equal(res.status, 302, cookie);
  }
});

test('after logout the pages are closed again', async () => {
  const client = await app.loggedIn();
  assert.equal((await client.get('/admin/')).status, 200);
  await client.post('/api/admin/logout', {});

  assert.equal((await client.get('/admin/')).status, 302);
});

test('the staff pages carry the security headers of the rest of the site', async () => {
  const res = await app.client().get('/admin/login.html');

  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-request-id'));
});

// ---------- API ----------

const API_ROUTES = [
  ['GET', '/api/admin/session'],
  ['GET', '/api/admin/stats'],
  ['GET', '/api/admin/deadlines'],
  ['PUT', '/api/admin/deadlines/rules/petition'],
  ['PUT', '/api/admin/deadlines/holidays/2026-10-12'],
  ['GET', '/api/admin/pqrs'],
  ['GET', `/api/admin/pqrs/${first.caseNumber}`],
  ['PATCH', `/api/admin/pqrs/${first.caseNumber}/status`],
  ['GET', '/api/admin/unknown'],
  ['POST', '/api/admin/pqrs'],
  ['DELETE', `/api/admin/pqrs/${first.caseNumber}`],
];

test('every staff API route answers 401 to anonymous visitors, even unknown paths', async () => {
  for (const [method, path] of API_ROUTES) {
    const res = await app
      .client()
      .request(method, path, { body: method === 'GET' ? undefined : { status: 'in_progress' } });

    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(res.json, { error: 'Authentication required.' }, `${method} ${path}`);
  }
});

test('changing a status directly through the API without a session is rejected and changes nothing', async () => {
  const before = status(first.caseNumber);
  const res = await app
    .client()
    .patch(`/api/admin/pqrs/${first.caseNumber}/status`, { status: 'in_progress' });

  assert.equal(res.status, 401);
  assert.equal(status(first.caseNumber), before);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit').get().n, 0);
});

test('an invalid cookie gives no access to the API', async () => {
  const cookies = [
    'pqrs_session=garbage',
    `pqrs_session=${'C'.repeat(43)}`,
    'pqrs_session=1; pqrs_session=2',
  ];

  for (const cookie of cookies) {
    const res = await app.client().get('/api/admin/pqrs', { headers: { Cookie: cookie } });
    assert.equal(res.status, 401, cookie);
  }
});

test('the 401 answer does not reveal anything about sessions or administrators', async () => {
  const res = await app
    .client()
    .get('/api/admin/pqrs', { headers: { Cookie: `pqrs_session=${'D'.repeat(43)}` } });

  assert.deepEqual(res.json, { error: 'Authentication required.' });
  assert.equal(
    /session|token|admin_|scrypt|sql/i.test(res.text.replace('Authentication required.', '')),
    false,
  );
});

// ---------- CSRF and origin ----------

test('a change without the CSRF token is rejected, and so is a wrong one', async () => {
  const client = await app.loggedIn();
  const path = `/api/admin/pqrs/${first.caseNumber}/status`;
  const before = status(first.caseNumber);

  const missing = await client.patch(path, { status: 'in_progress' }, { csrf: false });
  const wrong = await client.patch(
    path,
    { status: 'in_progress' },
    { headers: { 'X-CSRF-Token': 'not-the-token' } },
  );
  const empty = await client.patch(
    path,
    { status: 'in_progress' },
    { headers: { 'X-CSRF-Token': '' } },
  );

  for (const res of [missing, wrong, empty]) {
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: 'Invalid or missing CSRF token.' });
  }
  assert.equal(status(first.caseNumber), before);
});

test('the CSRF token of another session does not work', async () => {
  const mine = await app.loggedIn();
  const other = await app.loggedIn();
  const res = await mine.patch(
    `/api/admin/pqrs/${first.caseNumber}/status`,
    { status: 'in_progress' },
    { headers: { 'X-CSRF-Token': other.csrf } },
  );

  assert.equal(res.status, 403);
});

test('the CSRF token is not accepted from the body or the query', async () => {
  const client = await app.loggedIn();
  const path = `/api/admin/pqrs/${first.caseNumber}/status`;

  const body = await client.patch(
    path,
    { status: 'in_progress', csrfToken: client.csrf, _csrf: client.csrf },
    { csrf: false },
  );
  const query = await client.patch(
    `${path}?csrf=${client.csrf}`,
    { status: 'in_progress' },
    { csrf: false },
  );

  assert.equal(body.status, 403);
  assert.equal(query.status, 403);
});

test('a forged cross-site request with a valid cookie is rejected', async () => {
  const client = await app.loggedIn();
  const path = `/api/admin/pqrs/${first.caseNumber}/status`;
  const before = status(first.caseNumber);

  // What a browser sends from another website: the cookie goes along, the origin is different
  for (const headers of [
    { Origin: 'https://evil.example' },
    { Origin: 'null' },
    { Origin: 'http://127.0.0.1.evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
  ]) {
    const res = await client.patch(path, { status: 'in_progress' }, { headers });
    assert.equal(res.status, 403, JSON.stringify(headers));
    assert.deepEqual(res.json, { error: 'Cross-origin request blocked.' });
  }
  assert.equal(status(first.caseNumber), before);
});

test('a forged text/plain form post cannot change anything either', async () => {
  const client = await app.loggedIn();
  const res = await client.request('PATCH', `/api/admin/pqrs/${first.caseNumber}/status`, {
    raw: '{"status":"in_progress"}',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
  });

  assert.equal(res.status, 403);
});

test('a cross-site login is refused (login CSRF)', async () => {
  const res = await app
    .client()
    .post(
      '/api/admin/login',
      { email: 'staff@example.com', password: 'test-only-password-123' },
      { headers: { Origin: 'https://evil.example' } },
    );

  assert.equal(res.status, 403);
  assert.equal(res.headers.getSetCookie().length, 0);
});

test('a cross-site logout is refused', async () => {
  const client = await app.loggedIn();
  const res = await client.post(
    '/api/admin/logout',
    {},
    { headers: { Origin: 'https://evil.example' } },
  );

  assert.equal(res.status, 403);
  assert.equal((await client.get('/api/admin/session')).status, 200);
});

test('logout needs the CSRF token when there is a session', async () => {
  const client = await app.loggedIn();
  const res = await client.post('/api/admin/logout', {}, { csrf: false });

  assert.equal(res.status, 403);
  assert.equal((await client.get('/api/admin/session')).status, 200);
});

test('requests from this same site are accepted', async () => {
  const client = await app.loggedIn();
  const host = new URL(app.baseUrl).host;

  const res = await client.patch(
    `/api/admin/pqrs/${app.addRequests(1)[0].caseNumber}/status`,
    { status: 'in_progress' },
    { headers: { Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-origin' } },
  );

  assert.equal(res.status, 200);
});

test('reads do not need the CSRF token', async () => {
  const client = await app.loggedIn();

  assert.equal((await client.get('/api/admin/pqrs', { csrf: false })).status, 200);
});

test('X-Forwarded-Host is only believed when a proxy is trusted', async () => {
  const plain = await setupAdminApp();
  const proxied = await setupAdminApp({ trustProxy: 1 });
  after(() => plain.close());
  after(() => proxied.close());

  const headers = { Origin: 'https://panel.example.org', 'X-Forwarded-Host': 'panel.example.org' };
  const body = { email: 'staff@example.com', password: 'test-only-password-123' };

  assert.equal((await plain.client().post('/api/admin/login', body, { headers })).status, 403);
  assert.equal((await proxied.client().post('/api/admin/login', body, { headers })).status, 200);
  assert.equal(
    (
      await proxied.client().post('/api/admin/login', body, {
        headers: { Origin: 'https://evil.example', 'X-Forwarded-Host': 'panel.example.org' },
      })
    ).status,
    403,
  );
});

// ---------- CORS ----------

test('an allowed CORS origin does not get to use the staff API with cookies', async () => {
  const cors = await setupAdminApp({ corsOrigins: ['https://citizens.example.com'] });
  after(() => cors.close());
  const client = await cors.loggedIn();

  const read = await client.get('/api/admin/session', {
    headers: { Origin: 'https://citizens.example.com' },
  });
  const write = await client.patch(
    '/api/admin/pqrs/PQRS-2026-000001/status',
    { status: 'in_progress' },
    { headers: { Origin: 'https://citizens.example.com' } },
  );
  const login = await cors
    .client()
    .post(
      '/api/admin/login',
      { email: 'staff@example.com', password: 'test-only-password-123' },
      { headers: { Origin: 'https://citizens.example.com' } },
    );

  assert.equal(read.headers.get('access-control-allow-credentials'), null);
  assert.equal(write.status, 403);
  assert.equal(login.status, 403);
});

// ---------- Public side keeps working ----------

test('public endpoints stay open without a session', async () => {
  const anonymous = app.client();

  assert.equal((await anonymous.get('/api/health')).status, 200);
  assert.equal((await anonymous.get('/')).status, 200);
  assert.equal((await anonymous.get('/track.html')).status, 200);
  assert.equal((await anonymous.get('/shared/validation.js')).status, 200);

  const submitted = await anonymous.post('/api/pqrs', {
    type: 'suggestion',
    subject: 'Add a ramp at the entrance',
    description: 'A ramp would help people with reduced mobility and parents with strollers.',
    requesterName: 'Carlos Ruiz',
    requesterEmail: 'carlos@example.com',
  });
  assert.equal(submitted.status, 201);

  const lookup = await anonymous.post('/api/pqrs/lookup', {
    caseNumber: submitted.json.caseNumber,
    requesterEmail: 'carlos@example.com',
  });
  assert.equal(lookup.status, 200);
});

test('public submission keeps working for someone who sends a bad staff cookie', async () => {
  const res = await app
    .client()
    .post(
      '/api/pqrs',
      { type: 'petition', subject: 'Hi' },
      { headers: { Cookie: 'pqrs_session=garbage' } },
    );

  assert.equal(res.status, 400);
});
