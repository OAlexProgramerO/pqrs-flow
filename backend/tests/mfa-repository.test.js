import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createMfaRepository } from '../src/repositories/mfa.repository.js';

test('MFA recovery codes are stored hashed and can only be consumed once', (t) => {
  const db = openDatabase({ filename: ':memory:' });
  t.after(() => db.close());
  const adminId = Number(
    db
      .prepare(
        `
      INSERT INTO admins (email, display_name, password_hash, role, must_change_password)
      VALUES ('mfa-test@example.com', 'MFA Test', 'test-hash', 'administrator', 0)
    `,
      )
      .run().lastInsertRowid,
  );
  const repository = createMfaRepository(db);
  repository.replaceRecoveryCodes(adminId, ['ABCD1234EFGH', 'IJKL5678MNOP']);
  assert.equal(repository.countRecoveryCodes(adminId), 2);
  assert.notEqual(
    db.prepare('SELECT code_hash FROM admin_mfa_recovery_codes WHERE admin_id = ?').get(adminId)
      .code_hash,
    'ABCD1234EFGH',
  );
  assert.equal(repository.consumeRecoveryCode(adminId, 'abcd1234efgh'), true);
  assert.equal(repository.consumeRecoveryCode(adminId, 'ABCD1234EFGH'), false);
  assert.equal(repository.countRecoveryCodes(adminId), 1);
});
