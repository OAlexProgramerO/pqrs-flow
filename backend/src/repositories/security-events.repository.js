export function createSecurityEventRepository(db) {
  const insert = db.prepare(`
    INSERT INTO security_events (
      event_type, admin_id, actor_admin_id, request_id, ip_address, user_agent, details, created_at
    ) VALUES (
      @eventType, @adminId, @actorAdminId, @requestId, @ipAddress, @userAgent, @details, @createdAt
    )
  `);

  return {
    log({
      eventType,
      adminId = null,
      actorAdminId = null,
      requestId = null,
      ipAddress = null,
      userAgent = null,
      details = null,
      createdAt = new Date(),
    } = {}) {
      return insert.run({
        eventType,
        adminId,
        actorAdminId,
        requestId,
        ipAddress,
        userAgent,
        details: details === null ? null : JSON.stringify(details),
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      });
    },

    listForAdmin(adminId, { limit = 50 } = {}) {
      return db
        .prepare(
          `
          SELECT event_type AS eventType, admin_id AS adminId, actor_admin_id AS actorAdminId,
            request_id AS requestId, ip_address AS ipAddress, user_agent AS userAgent,
            details, created_at AS createdAt
          FROM security_events
          WHERE admin_id = ? OR actor_admin_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
        )
        .all(adminId, adminId, limit)
        .map((row) => ({
          ...row,
          details: row.details ? JSON.parse(row.details) : null,
        }));
    },
  };
}
