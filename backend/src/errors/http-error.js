/**
 * An error that carries the HTTP status the client should receive.
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Invalid input. `details` maps each invalid field to its message.
 */
export class ValidationError extends HttpError {
  constructor(details) {
    super(400, 'Validation failed', details);
    this.name = 'ValidationError';
  }
}
