const REQUEST_TIMEOUT_MS = 10000;

/**
 * An error with a message that is safe to show. `status` is 0 when the server could not be
 * reached, `details` maps fields to messages and `retryAfter` holds the seconds after a 429.
 */
export class AdminApiError extends Error {
  constructor(message, { status = 0, details, retryAfter } = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

// The CSRF token of the session. It only lives in memory: it is never written to storage.
let csrfToken = null;

async function request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: controller.signal,
    });

    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AdminApiError(data?.error ?? 'Something went wrong. Please try again.', {
        status: response.status,
        details: data?.details,
        retryAfter: Number(response.headers?.get('Retry-After')) || undefined,
      });
    }

    return data;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;

    throw new AdminApiError(
      error.name === 'AbortError'
        ? 'The server took too long to answer. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function remember(session) {
  csrfToken = session?.csrfToken ?? null;
  return session;
}

/**
 * Builds a query string from an object. Empty values are left out.
 */
export function buildQuery(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    query.set(key, String(value));
  }

  const text = query.toString();
  return text ? `?${text}` : '';
}

/** Logs in. Resolves with { admin, csrfToken, expiresAt }. */
export async function login({ email, password }) {
  return remember(await request('/api/admin/login', { method: 'POST', body: { email, password } }));
}

/** Who is logged in. Rejects with status 401 when nobody is. Also refreshes the CSRF token. */
export async function getSession() {
  return remember(await request('/api/admin/session'));
}

export async function logout() {
  await request('/api/admin/logout', { method: 'POST', body: {} });
  csrfToken = null;
}

export function getStats() {
  return request('/api/admin/stats');
}

/** A page of requests. `params` may hold q, status, type, from, to, sort, order, page, pageSize. */
export function listRequests(params) {
  return request(`/api/admin/pqrs${buildQuery(params)}`);
}

export function getRequest(caseNumber) {
  return request(`/api/admin/pqrs/${encodeURIComponent(caseNumber)}`);
}

/** Moves a request to a new status. `expectedStatus` is the one the person was looking at. */
export function changeStatus(caseNumber, { status, expectedStatus }) {
  return request(`/api/admin/pqrs/${encodeURIComponent(caseNumber)}/status`, {
    method: 'PATCH',
    body: { status, expectedStatus },
  });
}

export function listStaff(params) {
  return request('/api/admin/staff/search', { method: 'POST', body: params });
}

export function createStaff(data) {
  return request('/api/admin/staff', { method: 'POST', body: data });
}

export function updateStaff(id, changes) {
  return request(`/api/admin/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes,
  });
}

export function resetStaffPassword(id, { password, confirmPassword }) {
  return request(`/api/admin/staff/${encodeURIComponent(id)}/password-reset`, {
    method: 'POST',
    body: { password, confirmPassword },
  });
}

export function getStaffAudit(id, params) {
  return request(`/api/admin/staff/${encodeURIComponent(id)}/audit${buildQuery(params)}`);
}

export function changePassword({ currentPassword, newPassword, confirmPassword }) {
  return request('/api/admin/password/change', {
    method: 'POST',
    body: { currentPassword, newPassword, confirmPassword },
  });
}

export function getSessions() {
  return request('/api/admin/sessions');
}

export function revokeSession(sessionId) {
  return request(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export function revokeOtherSessions() {
  return request('/api/admin/sessions/others', { method: 'DELETE' });
}
