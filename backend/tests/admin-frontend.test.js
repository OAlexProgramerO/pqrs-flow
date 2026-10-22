import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AdminApiError,
  buildQuery,
  changeStatus,
  downloadCsv,
  getRequest,
  getSession,
  listRequests,
  login,
  logout,
} from '../../frontend-admin/js/admin-api.js';
import { setupAdminApp } from './helpers/admin.js';

const app = await setupAdminApp();
const staff = await app.loggedIn();
after(() => app.close());

const adminDir = path.resolve(import.meta.dirname, '../../frontend-admin');
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalSetTimeout = globalThis.setTimeout;
// Each test that mocks fetch gets the real one back afterwards
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
  else delete URL.createObjectURL;
  if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
  else delete URL.revokeObjectURL;
  globalThis.setTimeout = originalSetTimeout;
});

// ---------- Pages ----------

test('the login page has the form, the fields and the right autocomplete hints', async () => {
  const { text } = await app.client().get('/admin/login.html');

  for (const id of [
    'loginForm',
    'email',
    'password',
    'loginBtn',
    'loginMessage',
    'email-error',
    'password-error',
  ]) {
    assert.ok(text.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(text, /<input[^>]*type="password"[^>]*id="password"/);
  assert.match(text, /autocomplete="current-password"/);
  assert.match(text, /autocomplete="username"/);
  assert.match(text, /<meta name="robots" content="noindex"/);
  assert.match(text, /<html lang="en">/);
});

test('the dashboard has metrics, filters, the table, pagination and logout', async () => {
  const { text } = await staff.get('/admin/');

  for (const id of [
    'metrics',
    'filterForm',
    'q',
    'status',
    'type',
    'from',
    'to',
    'sort',
    'pageSize',
    'listState',
    'tableWrap',
    'rows',
    'pagination',
    'prevBtn',
    'nextBtn',
    'pageInfo',
    'logoutBtn',
    'adminName',
    'retryBtn',
  ]) {
    assert.ok(text.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.ok(text.includes('aria-live="polite"'));
  assert.ok(text.includes('class="skip-link"'));
  assert.ok(text.includes('aria-current="page"'));
  assert.match(text, /<th scope="col">Deadline<\/th>/);
});

test('every filter field of the dashboard has a label', async () => {
  const { text } = await staff.get('/admin/');

  for (const id of ['q', 'status', 'type', 'from', 'to', 'sort', 'pageSize']) {
    assert.ok(text.includes(`for="${id}"`), `no label for #${id}`);
  }
});

test('the dashboard filters offer exactly the statuses and types of the system', async () => {
  const { text } = await staff.get('/admin/');

  for (const value of [
    'filed',
    'in_progress',
    'answered',
    'closed',
    'petition',
    'complaint',
    'claim',
    'suggestion',
  ]) {
    assert.ok(text.includes(`value="${value}"`), value);
  }
});

test('the detail page has the data, the status form and the history', async () => {
  const { text } = await staff.get('/admin/request.html');

  for (const id of [
    'detail',
    'caseNumber',
    'statusBadge',
    'type',
    'createdAt',
    'deadlineDueDate',
    'deadlineStatus',
    'deadlineRemaining',
    'deadlineRule',
    'requesterName',
    'requesterEmail',
    'subject',
    'description',
    'statusForm',
    'newStatus',
    'statusBtn',
    'statusMessage',
    'history',
    'detailState',
    'backLink',
  ]) {
    assert.ok(text.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(text, /<label for="newStatus">/);
  assert.match(text, /The submission date is day zero/);
});

test('the reports page explains the CSV allowlist and exposes an accessible export action', async () => {
  const { text } = await staff.get('/admin/reports.html');

  assert.match(text, /id="exportCsvBtn"/);
  assert.match(text, />\s*Download CSV\s*</);
  assert.match(text, /5,000 records/);
  assert.match(text, /id="exportState" class="message" role="status" aria-live="polite"/);
});

test('the staff pages link to each other and to the login page paths that exist', async () => {
  for (const file of ['index.html', 'request.html', 'login.html']) {
    const page = fs.readFileSync(path.join(adminDir, file), 'utf8');
    for (const [, src] of page.matchAll(/(?:src|href)="(\/admin\/[^"#?]*)"/g)) {
      if (src === '/admin/') continue;
      assert.ok(
        fs.existsSync(path.join(adminDir, src.replace('/admin/', ''))),
        `${file} points to ${src}`,
      );
    }
  }
});

test('the staff scripts and styles are served', async () => {
  for (const file of [
    'js/admin-api.js',
    'js/login.js',
    'js/messages.js',
    'js/session.js',
    'js/dashboard.js',
    'js/request.js',
    'css/admin.css',
  ]) {
    const res = await staff.get(`/admin/${file}`);
    assert.equal(res.status, 200, file);
    assert.match(res.headers.get('content-type'), /javascript|css/);
  }
});

test('the stylesheet has the layouts for small screens, focus and the metrics', () => {
  const css = fs.readFileSync(path.join(adminDir, 'css/admin.css'), 'utf8');

  for (const needle of [
    '@media (max-width: 760px)',
    'focus-visible',
    '.metrics',
    'table.requests',
    'attr(data-label)',
    '.skip-link',
    '.history',
  ]) {
    assert.ok(css.includes(needle), needle);
  }
});

test('the staff scripts build the page with DOM nodes, never with innerHTML or eval', () => {
  for (const file of fs.readdirSync(path.join(adminDir, 'js'))) {
    const code = fs.readFileSync(path.join(adminDir, 'js', file), 'utf8');

    assert.equal(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(code),
      false,
      file,
    );
  }
});

test('nothing secret is written to browser storage', () => {
  for (const file of fs.readdirSync(path.join(adminDir, 'js'))) {
    const code = fs.readFileSync(path.join(adminDir, 'js', file), 'utf8');

    assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code), false, file);
  }
});

test('the staff pages have no inline scripts or handlers, so the CSP can stay strict', () => {
  for (const file of ['index.html', 'request.html', 'login.html']) {
    const page = fs.readFileSync(path.join(adminDir, file), 'utf8');

    assert.equal(/<script(?![^>]*\bsrc=)/.test(page), false, `${file} has an inline script`);
    assert.equal(/\son[a-z]+\s*=/.test(page), false, `${file} has an inline handler`);
    assert.equal(/style="/.test(page), false, `${file} has inline style`);
  }
});

test('the public pages did not change: no link to the staff area', async () => {
  for (const file of ['index.html', 'track.html']) {
    const page = fs.readFileSync(path.resolve(adminDir, '../frontend', file), 'utf8');
    assert.equal(page.includes('/admin'), false, file);
  }
});

// ---------- API client ----------

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
}

const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => {
    if (body === undefined) throw new Error('no body');
    return body;
  },
});

test('buildQuery drops empty values and encodes the rest', () => {
  assert.equal(buildQuery({}), '');
  assert.equal(buildQuery({ q: '', status: null, page: undefined, type: '  ' }), '');
  assert.equal(buildQuery({ q: 'a b&c', page: 2 }), '?q=a+b%26c&page=2');
});

test('login sends the credentials as JSON with cookies, and keeps the CSRF token for later', async () => {
  const calls = mockFetch(async () =>
    reply(200, { admin: { id: 1 }, csrfToken: 'csrf-one', expiresAt: 'x' }),
  );

  await login({ email: 'a@b.co', password: 'secret' });

  assert.equal(calls[0].url, '/api/admin/login');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'a@b.co', password: 'secret' });
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined);
});

test('requests that change something carry the CSRF token and reads do not need it', async () => {
  const calls = mockFetch(async (url) =>
    url.endsWith('/session')
      ? reply(200, { admin: { id: 1 }, csrfToken: 'csrf-two' })
      : reply(200, {}),
  );

  await getSession();
  await changeStatus('PQRS-2026-000001', { status: 'in_progress', expectedStatus: 'filed' });
  await getRequest('PQRS-2026-000001');

  const patch = calls[1];
  assert.equal(patch.url, '/api/admin/pqrs/PQRS-2026-000001/status');
  assert.equal(patch.options.method, 'PATCH');
  assert.equal(patch.options.headers['X-CSRF-Token'], 'csrf-two');
  assert.deepEqual(JSON.parse(patch.options.body), {
    status: 'in_progress',
    expectedStatus: 'filed',
  });
  assert.equal(calls[2].options.headers['X-CSRF-Token'], undefined);
  assert.equal(calls[2].options.body, undefined);
});

test('the case number is encoded in the URL', async () => {
  const calls = mockFetch(async () => reply(200, {}));

  await getRequest('PQRS-2026-000001/../x');

  assert.equal(calls[0].url, '/api/admin/pqrs/PQRS-2026-000001%2F..%2Fx');
});

test('listRequests builds the query string from the filters', async () => {
  const calls = mockFetch(async () => reply(200, { data: [], pagination: {} }));

  await listRequests({ q: 'tax', status: '', page: 3, pageSize: 50 });

  assert.equal(calls[0].url, '/api/admin/pqrs?q=tax&page=3&pageSize=50');
});

test('CSV downloads reuse report filters and require an actual CSV response', async () => {
  const calls = [];
  const clicked = [];
  const revoked = [];
  globalThis.document = {
    createElement: () => ({
      click() {
        clicked.push(this.download);
      },
    }),
  };
  URL.createObjectURL = (blob) => {
    assert.ok(blob instanceof Blob);
    return 'blob:test-export';
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.setTimeout = (callback, delay) => {
    if (delay === 1000) {
      callback();
      return 0;
    }
    return originalSetTimeout(callback, delay);
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/csv; charset=utf-8' },
      blob: async () => new Blob(['"case"']),
    };
  };

  await downloadCsv({ from: '2026-01-01', to: '2026-01-31', type: '', status: 'filed' });

  assert.equal(
    calls[0].url,
    '/api/admin/pqrs/export.csv?from=2026-01-01&to=2026-01-31&status=filed',
  );
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers, undefined);
  assert.deepEqual(clicked, ['pqrs-requests.csv']);
  assert.deepEqual(revoked, ['blob:test-export']);
});

test('CSV download errors never turn JSON or unexpected content into a file', async () => {
  mockFetch(async () => ({
    ok: false,
    status: 413,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: 'internal detail that should not be shown' }),
  }));

  await assert.rejects(downloadCsv({}), (error) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.status, 413);
    assert.equal(error.message, 'CSV export could not be completed.');
    return true;
  });

  mockFetch(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    blob: async () => new Blob(['not csv']),
  }));
  await assert.rejects(downloadCsv({}), /unexpected export response/);
});

test('logout answers 204 with no body and forgets the CSRF token', async () => {
  mockFetch(async (url) =>
    url.endsWith('/session') ? reply(200, { admin: {}, csrfToken: 'csrf-three' }) : reply(204),
  );
  await getSession();
  assert.equal(await logout(), undefined);

  const calls = mockFetch(async () => reply(200, {}));
  await changeStatus('PQRS-2026-000001', { status: 'closed' });
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined);
});

test('errors carry the status, the details and the retry time', async () => {
  mockFetch(async () =>
    reply(429, { error: 'Too many attempts. Please try again later.' }, { 'Retry-After': '120' }),
  );
  await assert.rejects(login({ email: 'a@b.co', password: 'x' }), (error) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.status, 429);
    assert.equal(error.retryAfter, 120);
    return true;
  });

  mockFetch(async () =>
    reply(400, { error: 'Validation failed', details: { email: 'Enter a valid email address.' } }),
  );
  await assert.rejects(
    login({ email: 'x', password: 'x' }),
    (error) => error.status === 400 && error.details.email.length > 0,
  );

  mockFetch(async () => reply(401, { error: 'Authentication required.' }));
  await assert.rejects(getSession(), (error) => error.status === 401);

  mockFetch(async () => reply(500, undefined));
  await assert.rejects(
    getSession(),
    (error) => error.status === 500 && /Something went wrong/.test(error.message),
  );
});

test('a network failure becomes a friendly error with status 0', async () => {
  mockFetch(async () => {
    throw new TypeError('fetch failed');
  });

  await assert.rejects(
    getSession(),
    (error) =>
      error instanceof AdminApiError &&
      error.status === 0 &&
      /Cannot reach the server/.test(error.message),
  );
});

// ---------- Module graph ----------

// The pages load their scripts as ES modules with no build step, so a wrong path or a name that
// is not exported only fails in the browser. This checks every import against the real files
// and against what the server serves to a logged in administrator.
const publicDir = path.resolve(import.meta.dirname, '../../frontend');
const sharedDir = path.resolve(import.meta.dirname, '../../shared');

function resolveImport(fromUrl, specifier) {
  const url = new URL(specifier, `http://x${fromUrl}`).pathname;
  const root = url.startsWith('/admin/')
    ? [adminDir, '/admin/']
    : url.startsWith('/shared/')
      ? [sharedDir, '/shared/']
      : [publicDir, '/'];

  return { url, file: path.join(root[0], url.slice(root[1].length)) };
}

function exportedNames(code) {
  const names = new Set();
  for (const [, name] of code.matchAll(
    /export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/g,
  ))
    names.add(name);
  for (const [, list] of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const item of list.split(','))
      names.add(
        item
          .trim()
          .split(/\s+as\s+/)
          .pop(),
      );
  }
  return names;
}

test('every import of the staff scripts resolves to a served file that exports that name', async () => {
  let checked = 0;

  for (const file of fs.readdirSync(path.join(adminDir, 'js'))) {
    const fromUrl = `/admin/js/${file}`;
    const code = fs.readFileSync(path.join(adminDir, 'js', file), 'utf8');

    for (const [, names, specifier] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const target = resolveImport(fromUrl, specifier);
      assert.ok(
        fs.existsSync(target.file),
        `${fromUrl} imports ${specifier}, which does not exist`,
      );

      const exported = exportedNames(fs.readFileSync(target.file, 'utf8'));
      for (const name of names
        .split(',')
        .map((item) => item.trim().split(/\s+as\s+/)[0])
        .filter(Boolean)) {
        assert.ok(
          exported.has(name),
          `${fromUrl} imports ${name} from ${specifier}, which does not export it`,
        );
        checked += 1;
      }

      assert.equal((await staff.get(target.url)).status, 200, `${target.url} is not served`);
    }
  }
  assert.ok(checked >= 20, `only ${checked} imports were checked`);
});

test('the scripts the login page loads only import files an anonymous visitor may read', async () => {
  const anonymous = app.client();

  for (const file of ['login.js', 'admin-api.js', 'messages.js']) {
    const code = fs.readFileSync(path.join(adminDir, 'js', file), 'utf8');

    for (const [, specifier] of code.matchAll(/from\s*'([^']+)'/g)) {
      const { url } = resolveImport(`/admin/js/${file}`, specifier);
      assert.equal((await anonymous.get(url)).status, 200, `${file} needs ${url}`);
    }
  }
});

test('every element the staff scripts look up by id exists in its page', () => {
  const pages = {
    'dashboard.js': 'index.html',
    'request.js': 'request.html',
    'login.js': 'login.html',
    'session.js': 'index.html',
  };

  for (const [script, page] of Object.entries(pages)) {
    const code = fs.readFileSync(path.join(adminDir, 'js', script), 'utf8');
    const html = fs.readFileSync(path.join(adminDir, page), 'utf8');

    for (const [, id] of code.matchAll(/getElementById\('([^']+)'\)/g)) {
      assert.ok(html.includes(`id="${id}"`), `${script} uses #${id}, missing in ${page}`);
    }
  }
  // Fields built as `${field}-error` in the scripts
  const dashboard = fs.readFileSync(path.join(adminDir, 'index.html'), 'utf8');
  for (const field of ['q', 'from', 'to'])
    assert.ok(dashboard.includes(`id="${field}-error"`), field);
  const login = fs.readFileSync(path.join(adminDir, 'login.html'), 'utf8');
  for (const field of ['email', 'password'])
    assert.ok(login.includes(`id="${field}-error"`), field);
});
