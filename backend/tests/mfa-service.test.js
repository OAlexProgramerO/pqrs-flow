import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSync } from 'otplib';
import { hashPassword } from '../src/services/password.js';
import { createMfaService } from '../src/services/mfa.service.js';
import { decryptMfaSecret } from '../src/services/totp.js';

test('MFA enrollment requires password and valid TOTP; recovery codes are generated and disable is audited', async () => {
  const passwordHash = await hashPassword('Correct horse battery staple!', {
    N: 2 ** 10,
    r: 8,
    p: 1,
  });
  let mfaRecord = null;
  let storedRecoveryCodes = [];
  const events = [];
  const adminRepository = {
    findCredentialsById: () => ({ id: 7, email: 'admin@example.com', passwordHash }),
    findById: () => ({ id: 7, email: 'admin@example.com' }),
    findMfaByAdminId: () => mfaRecord,
    saveMfa: (_id, record) => {
      mfaRecord = { ...record };
      return 1;
    },
    clearMfa: () => {
      mfaRecord = null;
      return 1;
    },
  };
  const mfaRepository = {
    replaceRecoveryCodes: (_id, codes) => {
      storedRecoveryCodes = [...codes];
    },
    countRecoveryCodes: () => storedRecoveryCodes.length,
    consumeRecoveryCode: (_id, code) => {
      const index = storedRecoveryCodes.indexOf(String(code).toUpperCase());
      if (index < 0) return false;
      storedRecoveryCodes.splice(index, 1);
      return true;
    },
    clearRecoveryCodes: () => {
      storedRecoveryCodes = [];
    },
  };
  const service = createMfaService({
    adminRepository,
    mfaRepository,
    securityEventRepository: { log: (event) => events.push(event) },
    now: () => new Date('2026-10-26T12:00:00.000Z'),
  });

  const setup = await service.beginEnrollment(7, { password: 'Correct horse battery staple!' });
  assert.ok(setup.secret);
  assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(mfaRecord.enabled, false);

  const secret = decryptMfaSecret(mfaRecord.secretCiphertext);
  const enabled = await service.enable(7, {
    password: 'Correct horse battery staple!',
    code: generateSync({ secret }),
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.recoveryCodes.length, 10);
  assert.equal(mfaRecord.enabled, true);
  assert.equal(storedRecoveryCodes.length, 10);

  const recoveryCode = enabled.recoveryCodes[0];
  const disabled = await service.disable(7, {
    password: 'Correct horse battery staple!',
    code: recoveryCode,
  });
  assert.deepEqual(disabled, { enabled: false });
  assert.equal(mfaRecord, null);
  assert.equal(storedRecoveryCodes.length, 0);
  assert.ok(events.some((event) => event.eventType === 'mfa_enabled'));
  assert.ok(events.some((event) => event.eventType === 'mfa_recovery_code_used'));
  assert.ok(events.some((event) => event.eventType === 'mfa_disabled'));
});
