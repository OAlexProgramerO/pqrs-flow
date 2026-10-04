const REQUEST_TIMEOUT_MS = 10000;

/**
 * An error with a message that is safe to show to the user.
 * `status` is 0 when the server could not be reached; `details` maps fields to messages.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(body?.error ?? 'Something went wrong. Please try again.', {
        status: response.status,
        details: body?.details,
      });
    }

    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    throw new ApiError(
      error.name === 'AbortError'
        ? 'The server took too long to answer. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a new PQRS. Resolves with { caseNumber, type, subject, status, createdAt }.
 */
export function createPqrs(data) {
  return request('/api/pqrs', { method: 'POST', body: JSON.stringify(data) });
}
