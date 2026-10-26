import { createHash } from 'node:crypto';

function hashCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function createMfaRepository(db) {
  const insertCode = db.prepare(`
    INSERT INTO admin_mfa_recovery_codes (admin_id, code_hash, created_at)
    VALUES (?, ?, ?)
  `);
  const deleteCodes = db.prepare('DELETE FROM admin_mfa_recovery_codes WHERE admin_id = ?');
  const consumeCode = db.prepare(`
    DELETE FROM admin_mfa_recovery_codes WHERE admin_id = ? AND code_hash = ?
  `);
  const countCodes = db.prepare(
    'SELECT COUNT(*) AS total FROM admin_mfa_recovery_codes WHERE admin_id = ?',
  );

  const replaceCodes = db.transaction((adminId, hashes, createdAt) => {
    deleteCodes.run(adminId);
    for (const hash of hashes) insertCode.run(adminId, hash, createdAt);
  });

  return {
    replaceRecoveryCodes(adminId, codes, createdAt = new Date().toISOString()) {
      replaceCodes(adminId, codes.map(hashCode), createdAt);
    },
    consumeRecoveryCode(adminId, code) {
      if (typeof code !== 'string' || code.length < 8 || code.length > 64) return false;
      return consumeCode.run(adminId, hashCode(code.toUpperCase())).changes === 1;
    },
    clearRecoveryCodes(adminId) {
      return deleteCodes.run(adminId).changes;
    },
    countRecoveryCodes(adminId) {
      return countCodes.get(adminId).total;
    },
  };
}
