import { AdminApiError, getSession, logout } from './admin-api.js';

const LOGIN_URL = '/admin/login.html';

/**
 * Sends the browser to the login page. Used when the server says there is no live session.
 */
export function goToLogin({ expired = true } = {}) {
  window.location.replace(expired ? `${LOGIN_URL}?expired=1` : LOGIN_URL);
}

/**
 * Tells if an error means "log in again" (the session ended or never existed).
 */
export function isUnauthorized(error) {
  return error instanceof AdminApiError && error.status === 401;
}

/**
 * Starts every staff page: checks the session, shows the name in the header and connects the
 * log out button. Resolves with the administrator, or never resolves because the browser was
 * sent to the login page.
 */
export async function startSession() {
  const logoutBtn = document.getElementById('logoutBtn');

  try {
    const { admin } = await getSession();
    document.getElementById('adminName').textContent = admin.displayName;
    for (const link of document.querySelectorAll('[data-admin-only]')) {
      link.hidden = admin.role !== 'administrator';
    }
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;

      try {
        await logout();
        goToLogin({ expired: false });
      } catch (error) {
        // A session that is already gone is the same as being logged out. Any other failure
        // means the server may still hold the session, so the person is told and can try again.
        if (isUnauthorized(error)) return goToLogin({ expired: false });

        logoutBtn.disabled = false;
        logoutBtn.textContent = 'Log out failed, try again';
      }
    });

    if (admin.credentialUpdateRequired && !window.location.pathname.endsWith('/security.html')) {
      window.location.replace('/admin/security.html');
      return new Promise(() => {});
    }

    return admin;
  } catch (error) {
    if (isUnauthorized(error)) {
      goToLogin();
      return new Promise(() => {});
    }
    throw error;
  }
}
