import { HttpError } from '../errors/http-error.js';

/**
 * A fixed-window rate limiter that keeps its counters in memory.
 * It works for a single server process, which is how this app runs.
 *
 * - windowMs: length of the window in milliseconds
 * - max: how many requests one key may make in a window
 * - key: function that returns the key of a request (default: the client address)
 * - now: clock, replaced in tests
 */
export function createRateLimiter({
  windowMs,
  max,
  key = (req) => req.ip,
  now = Date.now,
  maxKeys = 10000,
}) {
  const hits = new Map();

  function prune(current) {
    for (const [id, entry] of hits) {
      if (entry.resetAt <= current) hits.delete(id);
    }
  }

  return function rateLimit(req, res, next) {
    const current = now();
    const id = String(key(req));

    if (hits.size >= maxKeys && !hits.has(id)) {
      prune(current);
      // Still full: forget the oldest key so memory cannot grow without limit
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
    }

    let entry = hits.get(id);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      hits.set(id, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - current) / 1000))));
      return next(new HttpError(429, 'Too many attempts. Please try again later.'));
    }

    return next();
  };
}

/**
 * A SQLite-backed fixed-window rate limiter for scenarios where limits must survive server
 * restarts and share across multiple app processes. Each key is a single row in a table.
 */
export function createDbRateLimiter({
  db,
  scope,
  windowMs,
  max,
  key = (req) => req.ip,
  now = Date.now,
}) {
  const getDb = typeof db === 'function' ? db : () => db;

  return function rateLimit(req, res, next) {
    const current = now();
    const id = String(key(req));
    const connection = getDb();
    const select = connection.prepare(`
      SELECT attempts, window_start AS windowStart, updated_at AS updatedAt
      FROM login_attempts
      WHERE scope = @scope AND key = @key
    `);
    const upsert = connection.prepare(`
      INSERT INTO login_attempts (scope, key, window_start, attempts, updated_at)
      VALUES (@scope, @key, @windowStart, @attempts, @updatedAt)
      ON CONFLICT (scope, key) DO UPDATE SET
        window_start = excluded.window_start,
        attempts = excluded.attempts,
        updated_at = excluded.updated_at
    `);
    const deleteExpired = connection.prepare(`
      DELETE FROM login_attempts WHERE scope = @scope AND key = @key AND window_start <= @cutoff
    `);

    const record = select.get({ scope, key: id });
    const cutoff = new Date(current - windowMs).toISOString();

    if (record && record.windowStart <= cutoff) {
      deleteExpired.run({ scope, key: id, cutoff });
    }

    const state = select.get({ scope, key: id });
    const windowStart =
      state && state.windowStart && new Date(state.windowStart).getTime() > current - windowMs
        ? new Date(state.windowStart)
        : new Date(current);
    const count = state ? Number(state.attempts) : 0;
    const nextCount = count + 1;

    if (
      count > 0 &&
      new Date(state.windowStart).getTime() > current - windowMs &&
      nextCount > max
    ) {
      const resetAt = new Date(new Date(state.windowStart).getTime() + windowMs);
      res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt.getTime() - current) / 1000))));
      return next(new HttpError(429, 'Too many attempts. Please try again later.'));
    }

    upsert.run({
      scope,
      key: id,
      windowStart: windowStart.toISOString(),
      attempts: state && new Date(state.windowStart).getTime() > current - windowMs ? nextCount : 1,
      updatedAt: new Date(current).toISOString(),
    });

    return next();
  };
}
