// Columns that may leave the repository. The password hash has its own query on purpose.
const PUBLIC_COLUMNS = `
  id,
  email,
  display_name AS displayName,
  is_active AS isActive,
  created_at AS createdAt,
  last_login_at AS lastLoginAt
`;

function toAdmin(row) {
  return row ? { ...row, isActive: row.isActive === 1 } : null;
}

/**
 * Data access for staff accounts.
 * Only `findCredentialsByEmail` returns the password hash, and only the auth service uses it.
 */
export function createAdminRepository(db) {
  const insert = db.prepare(`
    INSERT INTO admins (email, display_name, password_hash, created_at)
    VALUES (@email, @displayName, @passwordHash, @createdAt)
  `);
  const selectById = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins WHERE id = ?`);
  const selectByEmail = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins WHERE email = ?`);
  const selectCredentials = db.prepare(`
    SELECT id, email, display_name AS displayName, is_active AS isActive, password_hash AS passwordHash
    FROM admins
    WHERE email = ?
  `);
  const selectAll = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins ORDER BY id`);
  const updatePassword = db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
  const updateActive = db.prepare('UPDATE admins SET is_active = ? WHERE id = ?');
  const updateLogin = db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?');

  return {
    create({ email, displayName, passwordHash }, { now = new Date() } = {}) {
      const { lastInsertRowid } = insert.run({
        email,
        displayName,
        passwordHash,
        createdAt: now.toISOString(),
      });
      return toAdmin(selectById.get(lastInsertRowid));
    },

    findById(id) {
      return toAdmin(selectById.get(id));
    },

    findByEmail(email) {
      return toAdmin(selectByEmail.get(email));
    },

    /** The only query that returns the password hash. */
    findCredentialsByEmail(email) {
      const row = selectCredentials.get(email);
      return row ? { ...row, isActive: row.isActive === 1 } : null;
    },

    list() {
      return selectAll.all().map(toAdmin);
    },

    updatePasswordHash(id, passwordHash) {
      return updatePassword.run(passwordHash, id).changes === 1;
    },

    setActive(id, isActive) {
      return updateActive.run(isActive ? 1 : 0, id).changes === 1;
    },

    recordLogin(id, when) {
      updateLogin.run(when.toISOString(), id);
    },
  };
}
