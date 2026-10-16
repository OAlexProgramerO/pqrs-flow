/**
 * Data access for staff sessions. Tokens never get here: callers pass the SHA-256 hash.
 */
export function createSessionRepository(db, accountAuditRepository) {
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
      a.is_active AS isActive,
      a.role,
      a.must_change_password AS needsPasswordUpdate
    FROM admin_sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ?
  `);

  const touch = db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?');
  const removeByHash = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
  const removeByAdmin = db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?');
  const selectForAdmin = db.prepare(`
    SELECT id AS sessionId, created_at AS createdAt, last_seen_at AS lastSeenAt,
      expires_at AS expiresAt
    FROM admin_sessions
    WHERE admin_id = @adminId AND expires_at > @now AND last_seen_at > @idleCutoff
    ORDER BY created_at DESC, id DESC
  `);
  const selectLoginState = db.prepare(`
    SELECT id FROM admins WHERE id = @adminId AND is_active = 1 AND password_hash = @passwordHash
  `);
  const deleteOwnedSession = db.prepare(
    'DELETE FROM admin_sessions WHERE id = @sessionId AND admin_id = @adminId',
  );
  const selectByHashForRevoke = db.prepare(`
    SELECT id AS sessionId, admin_id AS adminId FROM admin_sessions WHERE token_hash = ?
  `);
  const removeStale = db.prepare(
    'DELETE FROM admin_sessions WHERE expires_at <= @now OR last_seen_at <= @idleCutoff',
  );
  const removeOthers = db.prepare(
    'DELETE FROM admin_sessions WHERE admin_id = @adminId AND id != @currentSessionId',
  );

  // Rotation: the old session disappears in the same transaction that creates the new one
  const create = db.transaction((data, replacingHash, passwordHash, requestId) => {
    if (!selectLoginState.get({ adminId: data.adminId, passwordHash })) return false;
    if (replacingHash) {
      const previous = selectByHashForRevoke.get(replacingHash);
      if (removeByHash.run(replacingHash).changes > 0 && previous) {
        accountAuditRepository.insert({
          actorAdminId: data.adminId,
          actorType: 'staff',
          targetAdminId: previous.adminId,
          action: 'session_revoked',
          metadata: { sessionId: previous.sessionId, method: 'login_rotation' },
          requestId,
          now: new Date(data.createdAt),
        });
      }
    }
    insert.run(data);
    return true;
  });
  const revokeOne = db.transaction((sessionId, adminId, audit) => {
    if (deleteOwnedSession.run({ sessionId, adminId }).changes !== 1) return false;
    accountAuditRepository.insert({
      ...audit,
      targetAdminId: adminId,
      action: 'session_revoked',
      metadata: { sessionId },
    });
    return true;
  });
  const revokeByHash = db.transaction((tokenHash, requestId, now) => {
    const session = selectByHashForRevoke.get(tokenHash);
    if (!session || deleteOwnedSession.run(session).changes !== 1) return false;
    accountAuditRepository.insert({
      actorAdminId: session.adminId,
      actorType: 'staff',
      targetAdminId: session.adminId,
      action: 'session_revoked',
      metadata: { sessionId: session.sessionId, method: 'logout' },
      requestId,
      now,
    });
    return true;
  });
  const revokeAllOthers = db.transaction((adminId, currentSessionId, audit) => {
    const count = removeOthers.run({ adminId, currentSessionId }).changes;
    if (count > 0) {
      accountAuditRepository.insert({
        ...audit,
        targetAdminId: adminId,
        action: 'other_sessions_revoked',
        metadata: { count },
      });
    }
    return count;
  });

  return {
    /**
     * Stores a new session. When `replacingHash` is given, that session is removed first,
     * so a login never leaves the previous session of the browser alive.
     */
    create(
      { adminId, tokenHash, createdAt, expiresAt },
      { replacingHash, passwordHash, requestId } = {},
    ) {
      return create.immediate(
        { adminId, tokenHash, createdAt, expiresAt },
        replacingHash ?? null,
        passwordHash,
        requestId,
      );
    },

    findByTokenHash(tokenHash) {
      const row = selectByHash.get(tokenHash);
      return row
        ? {
            ...row,
            isActive: row.isActive === 1,
            needsPasswordUpdate: row.needsPasswordUpdate === 1,
          }
        : null;
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

    deleteOtherSessions(adminId, currentSessionId) {
      return removeOthers.run({ adminId, currentSessionId }).changes;
    },

    listByAdminId(adminId, { now, idleCutoff }) {
      return selectForAdmin.all({ adminId, now, idleCutoff });
    },

    revokeOwnedSession(sessionId, adminId, audit) {
      return revokeOne.immediate(sessionId, adminId, audit);
    },

    revokeByTokenHash(tokenHash, { requestId, now = new Date() } = {}) {
      return revokeByHash.immediate(tokenHash, requestId, now);
    },

    revokeOtherSessions(adminId, currentSessionId, audit) {
      return revokeAllOthers.immediate(adminId, currentSessionId, audit);
    },

    /** Removes the sessions that are over, by their absolute end or by being idle too long. */
    deleteStale(now, idleCutoff) {
      return removeStale.run({ now, idleCutoff }).changes;
    },
  };
}
