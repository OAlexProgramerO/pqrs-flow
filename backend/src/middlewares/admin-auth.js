import { HttpError } from '../errors/http-error.js';
import { AUTH_REQUIRED_MESSAGE } from '../services/auth.service.js';
import { safeEqual } from '../services/session-token.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// What an anonymous browser may load from /admin: the login page and the files it needs.
// Everything else under /admin needs a live session. The list is compared exactly, so any
// spelling that is not on it (encoded characters, ../, another case) is treated as protected.
export const PUBLIC_ADMIN_FILES = new Set([
  '/login.html',
  '/css/admin.css',
  '/js/admin-api.js',
  '/js/messages.js',
  '/js/login.js',
]);

export const LOGIN_PAGE = '/admin/login.html';

export const SESSION_COOKIE = { plain: 'pqrs_session', secure: '__Host-pqrs_session' };

/**
 * Reads one cookie from the Cookie header. Returns undefined when it is missing.
 */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return undefined;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;

    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Authentication, CSRF and origin checks for the staff area, in one place.
 *
 * - getAuthService: returns the auth service. It is only called when a request carries a cookie,
 *   so anonymous visitors never make the app open the database.
 * - cookieSecure: adds `Secure` to the cookie (HTTPS only) and the `__Host-` prefix to its name
 * - maxAgeMs: lifetime of the cookie
 * - trustProxy: the same value given to Express. Only then is X-Forwarded-Host believed.
 */
export function createAdminAuth({ getAuthService, cookieSecure, maxAgeMs, trustProxy = false }) {
  const cookieName = cookieSecure ? SESSION_COOKIE.secure : SESSION_COOKIE.plain;

  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    // Strict: the browser never sends the cookie on a request started from another site
    sameSite: 'strict',
    path: '/',
  };

  function setSessionCookie(res, token) {
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: maxAgeMs });
  }

  function clearSessionCookie(res) {
    res.clearCookie(cookieName, cookieOptions);
  }

  function readSessionToken(req) {
    return readCookie(req, cookieName);
  }

  // Looks the session up. Fills req.admin, req.csrfToken and req.sessionToken when it is live.
  function loadSession(req, res) {
    const token = readSessionToken(req);
    if (token === undefined) return false;

    const session = getAuthService().authenticate(token);
    if (!session) {
      // A dead cookie is removed, so the browser stops sending it
      clearSessionCookie(res);
      return false;
    }

    req.admin = session.admin;
    req.sessionToken = token;
    req.csrfToken = session.csrfToken;
    req.sessionExpiresAt = session.expiresAt;
    return true;
  }

  // Which hosts the browser may use to reach this server
  function allowedHosts(req) {
    const hosts = [req.get('host')];
    if (trustProxy)
      hosts.push(
        String(req.get('x-forwarded-host') ?? '')
          .split(',')[0]
          .trim(),
      );
    return hosts.filter(Boolean);
  }

  return {
    cookieName,
    readSessionToken,
    setSessionCookie,
    clearSessionCookie,

    /** For API routes: 401 unless the request carries a live session. */
    requireAdmin(req, res, next) {
      try {
        if (!loadSession(req, res)) throw new HttpError(401, AUTH_REQUIRED_MESSAGE);
        next();
      } catch (error) {
        next(error);
      }
    },

    /** Like requireAdmin, but an anonymous request goes on (used by logout). */
    optionalAdmin(req, res, next) {
      try {
        loadSession(req, res);
        next();
      } catch (error) {
        next(error);
      }
    },

    /**
     * CSRF protection for requests that change something. The browser must repeat the CSRF
     * token of the session in the X-CSRF-Token header. Another website cannot read it.
     * Requests without a session pass: they have nothing a forged request could use.
     */
    requireCsrf(req, _res, next) {
      if (SAFE_METHODS.has(req.method) || !req.admin) return next();

      if (!safeEqual(req.get('x-csrf-token'), req.csrfToken)) {
        return next(new HttpError(403, 'Invalid or missing CSRF token.'));
      }
      return next();
    },

    /**
     * Second line of defence against forged requests: a browser tells where a request comes from.
     * A request that changes something and comes from another website is rejected, even before
     * its cookie or token is looked at. Requests without that information (curl, scripts) pass
     * here and still need the CSRF token.
     */
    sameOriginOnly(req, _res, next) {
      if (SAFE_METHODS.has(req.method)) return next();

      const origin = req.get('origin');
      let allowed;

      if (origin !== undefined) {
        try {
          allowed = origin !== 'null' && allowedHosts(req).includes(new URL(origin).host);
        } catch {
          allowed = false;
        }
      } else {
        const site = req.get('sec-fetch-site');
        allowed = !site || site === 'same-origin' || site === 'none';
      }

      return allowed ? next() : next(new HttpError(403, 'Cross-origin request blocked.'));
    },

    /**
     * Gate of the staff pages. Mounted at /admin before the static files.
     * Anonymous visitors only get the login page and its files; a page request is sent to the
     * login page and anything else gets 401.
     */
    pageGate(req, res, next) {
      res.set('Cache-Control', 'no-store');

      const reading = req.method === 'GET' || req.method === 'HEAD';
      if (reading && PUBLIC_ADMIN_FILES.has(req.path)) return next();

      try {
        if (loadSession(req, res)) return next();
      } catch (error) {
        return next(error);
      }

      const isPage = req.path === '/' || req.path.endsWith('.html');
      if (reading && isPage) return res.redirect(302, LOGIN_PAGE);

      return res.status(401).json({ error: AUTH_REQUIRED_MESSAGE });
    },
  };
}
