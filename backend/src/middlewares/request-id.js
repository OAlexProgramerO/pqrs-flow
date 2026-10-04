import { randomUUID } from 'node:crypto';

// Only simple values are accepted from the client, so a header can never inject text into the logs
const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Gives every request an id, returns it in the X-Request-Id header and keeps it in req.id.
 * A valid X-Request-Id sent by the client is reused so a request can be followed across systems.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');

  req.id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}
