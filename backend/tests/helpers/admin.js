import { createAdminContext } from '../../src/admin-context.js';
import { openDatabase } from '../../src/db/database.js';
import { createPqrsRepository } from '../../src/repositories/pqrs.repository.js';
import { startServer } from './server.js';

// Test-only values. They are not credentials of any real system.
export const TEST_EMAIL = 'staff@example.com';
export const TEST_PASSWORD = 'test-only-password-123';
export const OTHER_PASSWORD = 'another-test-password-456';

// A tiny scrypt cost keeps the suite fast. The real cost is checked in password.test.js.
export const CHEAP_SCRYPT = { N: 16, r: 1, p: 1 };

const GENEROUS_LIMITS = {
  ip: { windowMs: 60_000, max: 10_000 },
  account: { windowMs: 60_000, max: 10_000 },
};

export const SESSION_POLICY = { idleMs: 30 * 60 * 1000, maxAgeMs: 8 * 60 * 60 * 1000 };

/** A clock the test moves by hand. */
export function createClock(start = '2026-10-11T12:00:00.000Z') {
  let current = new Date(start).getTime();

  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
  };
}

const SAMPLE_REQUESTS = [
  {
    type: 'petition',
    subject: 'Copy of my tax certificate',
    requesterName: 'Ana Gomez',
    requesterEmail: 'ana@example.com',
  },
  {
    type: 'complaint',
    subject: 'Long waiting time at the office',
    requesterName: 'Luis Perez',
    requesterEmail: 'luis@example.com',
  },
  {
    type: 'claim',
    subject: 'Wrong amount on my water invoice',
    requesterName: 'Maria Lopez',
    requesterEmail: 'maria@example.com',
  },
  {
    type: 'suggestion',
    subject: 'Add a ramp at the west entrance',
    requesterName: 'Carlos Ruiz',
    requesterEmail: 'carlos@example.com',
  },
];

export function sampleRequest(index = 0, overrides = {}) {
  return {
    description: 'A description that is long enough to pass every validation rule.',
    ...SAMPLE_REQUESTS[index % SAMPLE_REQUESTS.length],
    ...overrides,
  };
}

/**
 * Cookies of a browser, kept between requests: the server answers with Set-Cookie and the
 * client sends the value back, like a browser would.
 */
export function createClient(baseUrl) {
  const jar = new Map();

  function remember(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((item) => /^\s*expires=Thu, 01 Jan 1970/i.test(item));

      if (expired || value === '') jar.delete(name);
      else jar.set(name, value);
    }
  }

  const client = {
    jar,
    csrf: null,

    cookieHeader() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    },

    async request(method, path, { body, headers = {}, csrf = true, raw } = {}) {
      const send = { ...headers };
      if (jar.size > 0 && !('Cookie' in send)) send.Cookie = client.cookieHeader();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      if (hasBody && body !== undefined) send['Content-Type'] = 'application/json';
      if (csrf && client.csrf && method !== 'GET' && !('X-CSRF-Token' in send)) {
        send['X-CSRF-Token'] = client.csrf;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: send,
        body: !hasBody
          ? undefined
          : (raw ?? (body === undefined ? undefined : JSON.stringify(body))),
        redirect: 'manual',
      });
      remember(response);

      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // not JSON (a page, for example)
      }
      return { status: response.status, headers: response.headers, text, json, response };
    },

    get: (path, options) => client.request('GET', path, options),
    post: (path, body, options) => client.request('POST', path, { body, ...options }),
    patch: (path, body, options) => client.request('PATCH', path, { body, ...options }),

    async login(email = TEST_EMAIL, password = TEST_PASSWORD) {
      const result = await client.post('/api/admin/login', { email, password });
      if (result.status === 200) client.csrf = result.json.csrfToken;
      return result;
    },
  };

  return client;
}

/**
 * An isolated app with an in-memory database, a fake clock, a cheap password cost and one
 * administrator. Every test file gets its own, so nothing is shared between them.
 */
export async function setupAdminApp({
  sessionPolicy = SESSION_POLICY,
  cookieSecure = false,
  loginLimits = GENEROUS_LIMITS,
  ...appOptions
} = {}) {
  const db = openDatabase({ filename: ':memory:' });
  const clock = createClock();
  const admin = createAdminContext(db, {
    sessionPolicy,
    passwordParams: CHEAP_SCRYPT,
    now: clock.now,
  });
  const repository = createPqrsRepository(db);

  await admin.accountService.create({
    email: TEST_EMAIL,
    displayName: 'Test Staff',
    password: TEST_PASSWORD,
  });

  const server = await startServer({
    getRepository: () => repository,
    getAdmin: () => admin,
    loginLimits,
    session: { ...sessionPolicy, cookieSecure },
    ...appOptions,
  });

  const created = [];

  return {
    db,
    admin,
    repository,
    clock,
    baseUrl: server.baseUrl,

    client: () => createClient(server.baseUrl),

    /** A client that is already logged in. */
    async loggedIn(email = TEST_EMAIL, password = TEST_PASSWORD) {
      const client = createClient(server.baseUrl);
      const result = await client.login(email, password);
      if (result.status !== 200) throw new Error(`login failed with ${result.status}`);
      return client;
    },

    /** Adds requests to the database. Returns them with their case numbers. */
    addRequests(count = 4) {
      for (let index = 0; index < count; index += 1) {
        created.push(repository.create(sampleRequest(index), { now: clock.now() }));
      }
      return created.slice(-count);
    },

    sessionRows: () => db.prepare('SELECT * FROM admin_sessions').all(),

    async close() {
      await server.close();
      db.close();
    },
  };
}
