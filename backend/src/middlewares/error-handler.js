import { HttpError } from '../errors/http-error.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

/**
 * Turns any error into a JSON response.
 * Known errors keep their message; anything unexpected is logged and hidden from the client.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // Errors raised by express.json()
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.error(`[${req.id ?? '-'}]`, err);
  return res.status(500).json({ error: 'Internal server error', requestId: req.id });
}
