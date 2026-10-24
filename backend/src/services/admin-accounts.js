import { normalizeEmail, validateNewAdmin, validatePassword } from './admin-validation.js';
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from './password.js';
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, verifyTotp } from './totp.js';
import { AccountConflictError } from '../errors/account-conflict.js';

/**
 * An error of the account tools, with a message that is safe to print in the terminal.
 */
export class AccountError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'AccountError';
    this.details = details;
  }
}

/**
 * Account lifecycle and security operations shared by the protected staff API and CLI.
 */
export function createAccountService({
  adminRepository,
  sessionRepository,
  accountAuditRepository,
  sessionPolicy,
  passwordParams = DEFAULT_SCRYPT_PARAMS,
  now = () => new Date(),
}) {
  function requireAccount(email) {
    const account = adminRepository.findByEmail(normalizeEmail(email));
    if (!account) throw new AccountError('No administrator has that email address.');
    return account;
  }

  return {
    /** Creates an account with a validated password. The password is stored only as a hash. */
    async create(
      input,
      { actorAdminId = null, requestId = null, mustChangePassword = false } = {},
    ) {
      const { valid, errors, data } = validateNewAdmin(input);
      if (!valid) throw new AccountError('The account data is not valid.', errors);

      if (adminRepository.findByEmail(data.email)) {
        throw new AccountError('An administrator with that email address already exists.');
      }

      const passwordHash = await hashPassword(data.password, passwordParams);
      const created = adminRepository.create(
        {
          email: data.email,
          displayName: data.displayName,
          passwordHash,
          role: data.role,
          mustChangePassword,
        },
        {
          now: now(),
          audit: {
            actorAdminId,
            actorType: actorAdminId === null ? 'cli' : 'staff',
            requestId,
          },
        },
      );
      if (created?.conflict === 'duplicate_email') {
        throw new AccountError('An administrator with that email address already exists.');
      }
      return created;
    },

    /**
     * Sets a new password and closes every session of the account, so whoever held an old
     * session (or the old password) is out. A deactivated account stays deactivated.
     */
    async resetPassword({ email, password }, { actorAdminId = null, requestId = null } = {}) {
      const account = requireAccount(email);

      const { valid, errors } = validatePassword(password, { email: account.email });
      if (!valid) throw new AccountError('The password is not valid.', errors);

      return adminRepository.updatePasswordHash(
        account.id,
        await hashPassword(password, passwordParams),
        {
          mustChangePassword: false,
          audit: {
            actorAdminId,
            actorType: actorAdminId === null ? 'cli' : 'staff',
            action: 'password_reset',
            requestId,
            now: now(),
          },
          revoke: () => sessionRepository.deleteByAdminId(account.id),
        },
      );
    },

    /** Deactivated accounts cannot log in and lose their sessions at once. */
    setActive(email, isActive, { actorAdminId = null, requestId = null } = {}) {
      const account = requireAccount(email);
      const updated = adminRepository.updateAccount(
        account.id,
        { isActive },
        {
          actorAdminId,
          actorType: actorAdminId === null ? 'cli' : 'staff',
          requestId,
          now: now(),
        },
        () => {
          if (!isActive) sessionRepository.deleteByAdminId(account.id);
        },
      );
      if (updated?.conflict === 'last_active_administrator') {
        throw new AccountConflictError('At least one active administrator must remain.');
      }
      return updated;
    },

    list() {
      return adminRepository.listAll();
    },

    listPage(filters) {
      return adminRepository.listPage(filters);
    },

    listAudit(targetAdminId, pagination) {
      return accountAuditRepository.listForTarget(targetAdminId, pagination);
    },

    update(id, changes, { actorAdminId, requestId } = {}) {
      const before = adminRepository.findById(id);
      if (!before) return null;
      if (actorAdminId === id && changes.role !== undefined && changes.role !== before.role) {
        throw new AccountError('You cannot change your own role.');
      }
      if (actorAdminId === id && changes.isActive === false) {
        throw new AccountError('You cannot deactivate your own account.');
      }
      const updated = adminRepository.updateAccount(
        id,
        changes,
        {
          actorAdminId,
          actorType: 'staff',
          requestId,
          now: now(),
        },
        () => {
          if (changes.isActive === false) sessionRepository.deleteByAdminId(id);
        },
      );
      if (updated?.conflict === 'duplicate_email') {
        throw new AccountError('An administrator with that email address already exists.');
      }
      if (updated?.conflict === 'last_active_administrator') {
        throw new AccountConflictError('At least one active administrator must remain.');
      }
      return updated;
    },

    async resetPasswordForAccount(id, password, { actorAdminId, requestId } = {}) {
      const account = adminRepository.findById(id);
      if (!account) return null;
      if (account.id === actorAdminId) {
        throw new AccountError('Use the password-change form for your own account.');
      }
      const { valid, errors } = validatePassword(password, { email: account.email });
      if (!valid) throw new AccountError('The password is not valid.', errors);
      return adminRepository.updatePasswordHash(id, await hashPassword(password, passwordParams), {
        mustChangePassword: true,
        audit: {
          actorAdminId,
          actorType: 'staff',
          action: 'password_reset',
          requestId,
          now: now(),
        },
        revoke: () => sessionRepository.deleteByAdminId(id),
      });
    },

    async changePassword({ adminId, sessionId, currentPassword, newPassword }, { requestId } = {}) {
      const account = adminRepository.findById(adminId);
      const credentials = adminRepository.findCredentialsById(adminId);
      if (!account || !credentials) throw new AccountError('The account is not available.');
      if (!(await verifyPassword(currentPassword, credentials.passwordHash))) {
        throw new AccountError('The current password is incorrect.');
      }
      if (await verifyPassword(newPassword, credentials.passwordHash)) {
        throw new AccountError('Choose a password you have not used before.');
      }
      const { valid, errors } = validatePassword(newPassword, { email: account.email });
      if (!valid) throw new AccountError('The password is not valid.', errors);

      const updated = adminRepository.updatePasswordHash(
        adminId,
        await hashPassword(newPassword, passwordParams),
        {
          mustChangePassword: false,
          expectedPasswordHash: credentials.passwordHash,
          requireActive: true,
          audit: {
            actorAdminId: adminId,
            actorType: 'staff',
            action: 'password_changed',
            requestId,
            now: now(),
          },
          revoke: () => {
            const count = sessionRepository.deleteOtherSessions(adminId, sessionId);
            if (count > 0) {
              accountAuditRepository.insert({
                actorAdminId: adminId,
                actorType: 'staff',
                targetAdminId: adminId,
                action: 'other_sessions_revoked',
                metadata: { count },
                requestId,
                now: now(),
              });
            }
          },
        },
      );
      if (updated?.conflict === 'account_changed') {
        throw new AccountConflictError('The account changed. Sign in again and retry.');
      }
      return updated;
    },

    listSessions(adminId) {
      const current = now();
      const nowText = current.toISOString();
      const idleCutoff = new Date(current.getTime() - sessionPolicy.idleMs).toISOString();
      sessionRepository.deleteStale(nowText, idleCutoff);
      return sessionRepository.listByAdminId(adminId, { now: nowText, idleCutoff });
    },

    prepareMfa(adminId, { issuer = 'PQRS Flow' } = {}) {
      const account = adminRepository.findById(adminId);
      if (!account) return null;
      const secret = generateTotpSecret();
      return {
        secret,
        otpauth: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account.email)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`,
      };
    },

    enableMfa(adminId, { code, secret, issuer = 'PQRS Flow' } = {}) {
      const account = adminRepository.findById(adminId);
      if (!account) return null;
      const actualSecret = typeof secret === 'string' && secret.trim() ? secret.trim() : null;
      if (!actualSecret) return { error: 'No secret configured.' };
      const valid = verifyTotp(String(code ?? ''), actualSecret, { window: 1 });
      if (!valid) return { error: 'Invalid verification code.' };
      adminRepository.saveMfa(adminId, {
        secretCiphertext: encryptMfaSecret(actualSecret),
        enabled: true,
        createdAt: now().toISOString(),
        lastVerifiedAt: now().toISOString(),
      });
      return {
        enabled: true,
        secret: actualSecret,
        otpauth: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account.email)}?secret=${encodeURIComponent(actualSecret)}&issuer=${encodeURIComponent(issuer)}`,
      };
    },

    disableMfa(adminId, { code } = {}) {
      const account = adminRepository.findById(adminId);
      if (!account) return null;
      const mfa = adminRepository.findMfaByAdminId(adminId);
      if (!mfa?.enabled) return { enabled: false };
      const secret = decryptMfaSecret(mfa.secretCiphertext);
      if (!secret || !verifyTotp(String(code ?? ''), secret, { window: 1 })) {
        return { error: 'Invalid verification code.' };
      }
      adminRepository.clearMfa(adminId);
      return { enabled: false };
    },

    getMfaStatus(adminId) {
      const account = adminRepository.findById(adminId);
      if (!account) return null;
      const mfa = adminRepository.findMfaByAdminId(adminId);
      return {
        enabled: Boolean(mfa?.enabled),
        lastVerifiedAt: mfa?.lastVerifiedAt ?? null,
      };
    },

    revokeSession(sessionId, adminId, { actorAdminId = adminId, requestId } = {}) {
      return sessionRepository.revokeOwnedSession(sessionId, adminId, {
        actorAdminId,
        actorType: 'staff',
        requestId,
        now: now(),
      });
    },

    revokeOtherSessions(adminId, currentSessionId, { requestId } = {}) {
      return sessionRepository.revokeOtherSessions(adminId, currentSessionId, {
        actorAdminId: adminId,
        actorType: 'staff',
        requestId,
        now: now(),
      });
    },
  };
}
