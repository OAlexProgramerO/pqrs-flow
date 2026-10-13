import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

// 32 random bytes written in base64url are always 43 characters
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A new opaque session token: 256 bits from the system's secure random generator.
 * It only lives in the cookie of the browser. The database keeps its hash.
 */
export function generateToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Cheap shape check, so garbage in a cookie never reaches the database.
 */
export function isWellFormedToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * SHA-256 of a token. The token is random and long, so a fast hash is enough: there is
 * nothing to brute force. A copy of the database cannot be turned back into working cookies.
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The CSRF token of a session. It is derived from the session token, so nothing extra is stored,
 * and another website cannot compute it because it cannot read the HttpOnly cookie.
 */
export function deriveCsrfToken(sessionToken) {
  return createHmac('sha256', sessionToken).update('pqrs-flow:csrf:v1').digest('base64url');
}

/**
 * Compares two secrets in constant time, whatever their length.
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
