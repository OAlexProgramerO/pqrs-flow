// Columns that may leave the repository. The password hash has its own query on purpose.
const PUBLIC_COLUMNS = `
  id,
  email,
  display_name AS displayName,
  is_active AS isActive,
  role,
  created_at AS createdAt,
  last_login_at AS lastLoginAt
`;

function toAdmin(row) {
  return row ? { ...row, isActive: row.isActive === 1 } : null;
}

/**
 * Data access for staff accounts. Credential queries are limited to authentication and
 * password services; account-list queries never select password hashes.
 */
export function createAdminRepository(db, accountAuditRepository) {
  const insert = db.prepare(`
    INSERT INTO admins (
      email, display_name, password_hash, role, must_change_password, created_at
    ) VALUES (
      @email, @displayName, @passwordHash, @role, @mustChangePassword, @createdAt
    )
  `);
  const selectById = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins WHERE id = ?`);
  const selectByEmail = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins WHERE email = ?`);
  const selectCredentials = db.prepare(`
    SELECT a.id, a.email, a.display_name AS displayName, a.is_active AS isActive, a.role,
      a.must_change_password AS needsPasswordUpdate, a.password_hash AS passwordHash,
      COALESCE(m.enabled, 0) AS mfaEnabled
    FROM admins a
    LEFT JOIN admin_mfa m ON m.admin_id = a.id
    WHERE a.email = ?
  `);
  const selectCredentialsById = db.prepare(`
    SELECT a.id, a.email, a.password_hash AS passwordHash,
      COALESCE(m.enabled, 0) AS mfaEnabled
    FROM admins a
    LEFT JOIN admin_mfa m ON m.admin_id = a.id
    WHERE a.id = ?
  `);
  const selectMfa = db.prepare(`
    SELECT admin_id AS adminId, secret_ciphertext AS secretCiphertext, enabled,
      created_at AS createdAt, last_verified_at AS lastVerifiedAt
    FROM admin_mfa
    WHERE admin_id = ?
  `);
  const upsertMfa = db.prepare(`
    INSERT INTO admin_mfa (admin_id, secret_ciphertext, enabled, created_at, last_verified_at)
    VALUES (@adminId, @secretCiphertext, @enabled, @createdAt, @lastVerifiedAt)
    ON CONFLICT (admin_id) DO UPDATE SET
      secret_ciphertext = excluded.secret_ciphertext,
      enabled = excluded.enabled,
      last_verified_at = excluded.last_verified_at
  `);
  const deleteMfa = db.prepare('DELETE FROM admin_mfa WHERE admin_id = ?');
  const touchMfa = db.prepare(
    'UPDATE admin_mfa SET last_verified_at = ? WHERE admin_id = ? AND enabled = 1',
  );
  const selectCount = db.prepare(`
    SELECT COUNT(*) AS total FROM admins
    WHERE role = 'administrator' AND is_active = 1
  `);
  const updatePassword = db.prepare(`
    UPDATE admins SET password_hash = @passwordHash,
      must_change_password = @mustChangePassword
    WHERE id = @id
      AND (@expectedPasswordHash IS NULL OR password_hash = @expectedPasswordHash)
      AND (@requireActive = 0 OR is_active = 1)
  `);
  const updateLogin = db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?');
  const updateAccount = db.prepare(`
    UPDATE admins SET email = @email, display_name = @displayName, role = @role,
      is_active = @isActive WHERE id = @id
  `);

  const createAccount = db.transaction((data, audit) => {
    if (selectByEmail.get(data.email)) return { conflict: 'duplicate_email' };
    const { lastInsertRowid } = insert.run(data);
    accountAuditRepository.insert({ ...audit, targetAdminId: lastInsertRowid });
    return toAdmin(selectById.get(lastInsertRowid));
  });

  const saveAccount = db.transaction((id, changes, audit, revoke) => {
    const before = toAdmin(selectById.get(id));
    if (!before) return null;
    if (changes.email !== undefined && changes.email !== before.email) {
      const existing = selectByEmail.get(changes.email);
      if (existing && existing.id !== id) return { conflict: 'duplicate_email' };
    }

    if (
      before.role === 'administrator' &&
      before.isActive &&
      ((changes.role !== undefined && changes.role !== 'administrator') ||
        changes.isActive === false) &&
      selectCount.get().total <= 1
    ) {
      return { conflict: 'last_active_administrator' };
    }

    updateAccount.run({
      id,
      email: changes.email ?? before.email,
      displayName: changes.displayName ?? before.displayName,
      role: changes.role ?? before.role,
      isActive:
        changes.isActive === undefined ? (before.isActive ? 1 : 0) : changes.isActive ? 1 : 0,
    });
    if (changes.isActive === false) revoke?.();

    const saved = toAdmin(selectById.get(id));
    if (before.email !== saved.email || before.displayName !== saved.displayName) {
      const fields = [];
      if (before.email !== saved.email) fields.push('email');
      if (before.displayName !== saved.displayName) fields.push('displayName');
      accountAuditRepository.insert({
        ...audit,
        targetAdminId: id,
        action: 'account_updated',
        metadata: { fields },
      });
    }
    if (before.role !== saved.role) {
      accountAuditRepository.insert({
        ...audit,
        targetAdminId: id,
        action: 'role_changed',
        metadata: { from: before.role, to: saved.role },
      });
    }
    if (before.isActive !== saved.isActive) {
      accountAuditRepository.insert({
        ...audit,
        targetAdminId: id,
        action: saved.isActive ? 'account_activated' : 'account_deactivated',
      });
    }
    return saved;
  });

  const savePassword = db.transaction(
    (id, passwordHash, mustChangePassword, audit, revoke, expectedPasswordHash, requireActive) => {
      if (
        updatePassword.run({
          id,
          passwordHash,
          mustChangePassword: mustChangePassword ? 1 : 0,
          expectedPasswordHash: expectedPasswordHash ?? null,
          requireActive: requireActive ? 1 : 0,
        }).changes !== 1
      ) {
        return { conflict: 'account_changed' };
      }
      revoke?.();
      accountAuditRepository.insert({ ...audit, targetAdminId: id });
      return toAdmin(selectById.get(id));
    },
  );

  return {
    create(
      { email, displayName, passwordHash, role = 'administrator', mustChangePassword = false },
      { now = new Date(), audit } = {},
    ) {
      return createAccount(
        {
          email,
          displayName,
          passwordHash,
          role,
          mustChangePassword: mustChangePassword ? 1 : 0,
          createdAt: now.toISOString(),
        },
        {
          ...audit,
          action: 'account_created',
          metadata: { role },
          now,
        },
      );
    },

    findById(id) {
      return toAdmin(selectById.get(id));
    },

    findByEmail(email) {
      return toAdmin(selectByEmail.get(email));
    },

    findCredentialsById(id) {
      const row = selectCredentialsById.get(id) ?? null;
      return row
        ? {
            ...row,
            mfaEnabled: row.mfaEnabled === 1,
          }
        : null;
    },

    /** The only query that returns the password hash. */
    findCredentialsByEmail(email) {
      const row = selectCredentials.get(email);
      return row
        ? {
            ...row,
            isActive: row.isActive === 1,
            needsPasswordUpdate: row.needsPasswordUpdate === 1,
            mfaEnabled: row.mfaEnabled === 1,
          }
        : null;
    },

    findMfaByAdminId(adminId) {
      const row = selectMfa.get(adminId);
      return row
        ? {
            ...row,
            enabled: row.enabled === 1,
          }
        : null;
    },

    saveMfa(adminId, { secretCiphertext, enabled = false, createdAt, lastVerifiedAt }) {
      return upsertMfa.run({
        adminId,
        secretCiphertext,
        enabled: enabled ? 1 : 0,
        createdAt: createdAt ?? new Date().toISOString(),
        lastVerifiedAt: lastVerifiedAt ?? null,
      }).changes;
    },

    clearMfa(adminId) {
      return deleteMfa.run(adminId).changes;
    },

    recordMfaVerification(adminId, when = new Date()) {
      return touchMfa.run(when.toISOString(), adminId).changes;
    },

    listPage({ q = '', role, isActive, page = 1, pageSize = 20 } = {}) {
      const filters = [];
      const params = {};
      if (q) {
        filters.push(`(email LIKE @q ESCAPE '\\' OR display_name LIKE @q ESCAPE '\\')`);
        params.q = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      }
      if (role) {
        filters.push('role = @role');
        params.role = role;
      }
      if (isActive !== undefined) {
        filters.push('is_active = @isActive');
        params.isActive = isActive ? 1 : 0;
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const { totalItems } = db
        .prepare(`SELECT COUNT(*) AS totalItems FROM admins ${where}`)
        .get(params);
      const items = db
        .prepare(
          `SELECT ${PUBLIC_COLUMNS} FROM admins ${where}
          ORDER BY id LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
        .map(toAdmin);
      return { items, totalItems };
    },

    listAll() {
      return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins ORDER BY id`).all().map(toAdmin);
    },

    list() {
      return this.listAll();
    },

    updateAccount(id, changes, audit, revoke) {
      return saveAccount.immediate(id, changes, audit, revoke);
    },

    updatePasswordHash(
      id,
      passwordHash,
      {
        mustChangePassword = false,
        audit,
        revoke,
        expectedPasswordHash,
        requireActive = false,
      } = {},
    ) {
      return savePassword.immediate(
        id,
        passwordHash,
        mustChangePassword,
        audit,
        revoke,
        expectedPasswordHash,
        requireActive,
      );
    },

    recordLogin(id, when) {
      updateLogin.run(when.toISOString(), id);
    },
  };
}
