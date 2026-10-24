import { randomBytes } from 'node:crypto';
import { HttpError, ValidationError } from '../errors/http-error.js';
import { validateLogin } from './admin-validation.js';
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from './password.js';
import { decryptMfaSecret, verifyTotp } from './totp.js';
import { deriveCsrfToken, generateToken, hashToken, isWellFormedToken } from './session-token.js';

// One message for every way a login can fail, so nobody learns which accounts exist
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
export const AUTH_REQUIRED_MESSAGE = 'Authentication required.';

// The last-seen time is written at most once per minute, so reading the panel does not write
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Staff authentication: login, session checks and logout.
 *
 * - sessionPolicy: { idleMs, maxAgeMs }
 * - passwordParams: scrypt cost (tests use a cheap one)
 * - now: clock, replaced in tests
 */
export function createAuthService({
  adminRepository,
  sessionRepository,
  securityEventRepository,
  sessionPolicy,
  passwordParams = DEFAULT_SCRYPT_PARAMS,
  now = () => new Date(),
}) {
  let dummyHash;

  // A real hash of a random password. It is checked when the account does not exist, so a
  // login for a missing account takes as long as one for an existing account.
  function getDummyHash() {
    dummyHash ??= hashPassword(randomBytes(16).toString('hex'), passwordParams);
    return dummyHash;
  }

  return {
    /**
     * Checks the credentials and opens a session. Resolves with the new token (for the cookie),
     * the administrator, the end of the session and the CSRF token.
     * `previousToken` is the cookie the browser already had: that session is closed, so a
     * login always gives a brand new session (no session fixation).
     */
    async login(input, { previousToken, requestId } = {}) {
      const { valid, errors, data } = validateLogin(input);
      if (!valid) throw new ValidationError(errors);

      const account = adminRepository.findCredentialsByEmail(data.email);

      // The password is always checked, even without an account, to keep the time the same
      const passwordHash = account?.passwordHash ?? (await getDummyHash());
      const passwordMatches = await verifyPassword(data.password, passwordHash);

      let mfaValid = true;
      if (account && account.isActive && account.mfaEnabled) {
        const mfaRecord = adminRepository.findMfaByAdminId(account.id);
        const secret = mfaRecord ? decryptMfaSecret(mfaRecord.secretCiphertext) : null;
        mfaValid = !!secret && verifyTotp(data.totpCode ?? '', secret, { window: 1 });
      }

      if (!account || !account.isActive || !passwordMatches || !mfaValid) {
        if (securityEventRepository) {
          securityEventRepository.log({
            eventType: 'login_failed',
            adminId: account?.id ?? null,
            requestId,
            details: {
              email: data.email,
              reason: !account
                ? 'unknown_account'
                : !account.isActive
                  ? 'inactive'
                  : !passwordMatches
                    ? 'bad_password'
                    : 'bad_totp',
            },
          });
        }
        throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);
      }

      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + sessionPolicy.maxAgeMs);
      const token = generateToken();

      const opened = sessionRepository.create(
        {
          adminId: account.id,
          tokenHash: hashToken(token),
          createdAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
        {
          replacingHash: isWellFormedToken(previousToken) ? hashToken(previousToken) : null,
          passwordHash: account.passwordHash,
          requestId,
        },
      );
      if (!opened) throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);

      adminRepository.recordLogin(account.id, issuedAt);
      if (account.mfaEnabled) adminRepository.recordMfaVerification(account.id, issuedAt);

      // Old sessions of everybody are cleaned here, so the table does not grow forever
      sessionRepository.deleteStale(
        issuedAt.toISOString(),
        new Date(issuedAt.getTime() - sessionPolicy.idleMs).toISOString(),
      );

      if (securityEventRepository) {
        securityEventRepository.log({
          eventType: 'login_success',
          adminId: account.id,
          requestId,
          details: { sessionExpiresAt: expiresAt.toISOString() },
        });
      }

      return {
        token,
        admin: {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          role: account.role,
          credentialUpdateRequired: account.needsPasswordUpdate,
          mfaEnabled: account.mfaEnabled ?? false,
        },
        expiresAt: expiresAt.toISOString(),
        csrfToken: deriveCsrfToken(token),
      };
    },

    /**
     * Finds the session of a cookie value. Returns null for anything that is not a live session:
     * a malformed token, an unknown one, an expired or idle session, or a deactivated account.
     * Sessions that are over are deleted on the spot.
     */
    authenticate(token) {
      if (!isWellFormedToken(token)) return null;

      const tokenHash = hashToken(token);
      const row = sessionRepository.findByTokenHash(tokenHash);
      if (!row) return null;

      const current = now();
      const nowMs = current.getTime();
      const lastSeenMs = Date.parse(row.lastSeenAt);

      // Written so that a date that cannot be read counts as "over"
      const alive = Date.parse(row.expiresAt) > nowMs && lastSeenMs + sessionPolicy.idleMs > nowMs;

      if (!alive || !row.isActive) {
        sessionRepository.deleteByTokenHash(tokenHash);
        return null;
      }

      if (nowMs - lastSeenMs >= TOUCH_INTERVAL_MS) {
        sessionRepository.touch(row.sessionId, current.toISOString());
      }

      return {
        admin: {
          id: row.adminId,
          email: row.email,
          displayName: row.displayName,
          role: row.role,
          credentialUpdateRequired: row.needsPasswordUpdate,
        },
        sessionId: row.sessionId,
        expiresAt: row.expiresAt,
        csrfToken: deriveCsrfToken(token),
      };
    },

    /** Ends the session of a cookie value. Returns true when a session was removed. */
    logout(token, requestId) {
      if (!isWellFormedToken(token)) return false;
      return sessionRepository.revokeByTokenHash(hashToken(token), { requestId, now: now() });
    },

    /** Ends every session of an administrator. */
    logoutEverywhere(adminId) {
      return sessionRepository.deleteByAdminId(adminId);
    },
  };
}
