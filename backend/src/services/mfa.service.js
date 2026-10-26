import { randomBytes } from 'node:crypto';
import { HttpError } from '../errors/http-error.js';
import { verifyPassword } from './password.js';
import {
  createTotpUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpSecret,
  verifyTotp,
} from './totp.js';

function makeRecoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(9).toString('base64url').toUpperCase());
}

export function createMfaService({
  adminRepository,
  mfaRepository,
  securityEventRepository,
  passwordParams,
  now = () => new Date(),
}) {
  async function verifyCurrentPassword(adminId, password) {
    if (typeof password !== 'string' || !password) {
      throw new HttpError(400, 'Current password is required.');
    }
    const credentials = adminRepository.findCredentialsById(adminId);
    if (
      !credentials ||
      !(await verifyPassword(password, credentials.passwordHash, passwordParams))
    ) {
      throw new HttpError(401, 'Current password is incorrect.');
    }
    return credentials;
  }

  function log(eventType, adminId, context = {}, details = {}) {
    securityEventRepository?.log({
      eventType,
      adminId,
      actorAdminId: adminId,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      details,
      createdAt: now(),
    });
  }

  return {
    status(adminId) {
      const mfa = adminRepository.findMfaByAdminId(adminId);
      return {
        enabled: Boolean(mfa?.enabled),
        recoveryCodesRemaining: mfaRepository.countRecoveryCodes(adminId),
      };
    },

    async beginEnrollment(adminId, { password }, context = {}) {
      await verifyCurrentPassword(adminId, password);
      const existing = adminRepository.findMfaByAdminId(adminId);
      if (existing?.enabled)
        throw new HttpError(409, 'Multi-factor authentication is already enabled.');

      const admin = adminRepository.findById(adminId);
      if (!admin) throw new HttpError(404, 'Staff account not found.');
      const secret = generateTotpSecret();
      adminRepository.saveMfa(adminId, {
        secretCiphertext: encryptMfaSecret(secret),
        enabled: false,
        createdAt: now().toISOString(),
        lastVerifiedAt: null,
      });
      log('mfa_setup_started', adminId, context);
      return {
        secret,
        otpauthUri: createTotpUri(admin.email, secret),
      };
    },

    async enable(adminId, { password, code }, context = {}) {
      await verifyCurrentPassword(adminId, password);
      const existing = adminRepository.findMfaByAdminId(adminId);
      const secret = existing ? decryptMfaSecret(existing.secretCiphertext) : null;
      if (!secret) throw new HttpError(409, 'Start multi-factor setup before enabling it.');
      if (existing.enabled)
        throw new HttpError(409, 'Multi-factor authentication is already enabled.');
      if (!verifyTotp(code, secret, { window: 1 })) {
        log('mfa_enable_failed', adminId, context, { reason: 'invalid_code' });
        throw new HttpError(400, 'The authenticator code is invalid.');
      }

      const verifiedAt = now().toISOString();
      adminRepository.saveMfa(adminId, {
        secretCiphertext: existing.secretCiphertext,
        enabled: true,
        createdAt: existing.createdAt,
        lastVerifiedAt: verifiedAt,
      });
      const recoveryCodes = makeRecoveryCodes();
      mfaRepository.replaceRecoveryCodes(adminId, recoveryCodes, verifiedAt);
      log('mfa_enabled', adminId, context, { recoveryCodeCount: recoveryCodes.length });
      return { enabled: true, recoveryCodes };
    },

    async disable(adminId, { password, code }, context = {}) {
      await verifyCurrentPassword(adminId, password);
      const existing = adminRepository.findMfaByAdminId(adminId);
      const secret = existing?.enabled ? decryptMfaSecret(existing.secretCiphertext) : null;
      if (!secret) throw new HttpError(409, 'Multi-factor authentication is not enabled.');
      const totpValid = verifyTotp(code, secret, { window: 1 });
      const recoveryCodeUsed = !totpValid && mfaRepository.consumeRecoveryCode(adminId, code);
      if (!totpValid && !recoveryCodeUsed) {
        log('mfa_disable_failed', adminId, context, { reason: 'invalid_code' });
        throw new HttpError(400, 'The authenticator or recovery code is invalid.');
      }
      adminRepository.clearMfa(adminId);
      mfaRepository.clearRecoveryCodes(adminId);
      log('mfa_disabled', adminId, context, { recoveryCodeUsed });
      if (recoveryCodeUsed) {
        log('mfa_recovery_code_used', adminId, context, {
          remainingRecoveryCodes: mfaRepository.countRecoveryCodes(adminId),
          purpose: 'disable_mfa',
        });
      }
      return { enabled: false };
    },
  };
}
