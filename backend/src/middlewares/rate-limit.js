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
