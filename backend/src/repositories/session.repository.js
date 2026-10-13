/**
 * Data access for staff sessions. Tokens never get here: callers pass the SHA-256 hash.
 */
export function createSessionRepository(db) {
  const insert = db.prepare(`
    INSERT INTO admin_sessions (admin_id, token_hash, created_at, last_seen_at, expires_at)
    VALUES (@adminId, @tokenHash, @createdAt, @createdAt, @expiresAt)
  `);

  const selectByHash = db.prepare(`
    SELECT
      s.id AS sessionId,
      s.last_seen_at AS lastSeenAt,
      s.expires_at AS expiresAt,
      a.id AS adminId,
      a.email,
      a.display_name AS displayName,
      a.is_active AS isActive
    FROM admin_sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ?
  `);

  const touch = db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?');
  const removeByHash = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
  const removeByAdmin = db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?');
  const removeStale = db.prepare(
    'DELETE FROM admin_sessions WHERE expires_at <= @now OR last_seen_at <= @idleCutoff',
  );

  // Rotation: the old session disappears in the same transaction that creates the new one
  const create = db.transaction((data, replacingHash) => {
    if (replacingHash) removeByHash.run(replacingHash);
    insert.run(data);
  });

  return {
    /**
     * Stores a new session. When `replacingHash` is given, that session is removed first,
     * so a login never leaves the previous session of the browser alive.
     */
    create({ adminId, tokenHash, createdAt, expiresAt }, { replacingHash } = {}) {
      create({ adminId, tokenHash, createdAt, expiresAt }, replacingHash ?? null);
    },

    findByTokenHash(tokenHash) {
      const row = selectByHash.get(tokenHash);
      return row ? { ...row, isActive: row.isActive === 1 } : null;
    },

    touch(sessionId, when) {
      touch.run(when, sessionId);
    },

    deleteByTokenHash(tokenHash) {
      return removeByHash.run(tokenHash).changes;
    },

    deleteByAdminId(adminId) {
      return removeByAdmin.run(adminId).changes;
    },

    /** Removes the sessions that are over, by their absolute end or by being idle too long. */
    deleteStale(now, idleCutoff) {
      return removeStale.run({ now, idleCutoff }).changes;
    },
  };
}
