export function createSecurityEventRepository(db) {
  const insert = db.prepare(`
    INSERT INTO security_events (
      event_type, admin_id, actor_admin_id, request_id, ip_address, user_agent, details, created_at
    ) VALUES (
      @eventType, @adminId, @actorAdminId, @requestId, @ipAddress, @userAgent, @details, @createdAt
    )
  `);

  function parseDetails(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

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
      // The caller supplies allowlisted metadata only; credentials, codes and tokens must never
      // be passed in `details`.
      return insert.run({
        eventType,
        adminId,
        actorAdminId,
        requestId,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.slice(0, 128) : null,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
        details: details === null ? null : JSON.stringify(details),
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      });
    },

    listPage({ eventType, from, to, page = 1, pageSize = 25 } = {}) {
      const where = [];
      const params = {};
      if (eventType) {
        where.push('event_type = @eventType');
        params.eventType = eventType;
      }
      if (from) {
        where.push('created_at >= @from');
        params.from = `${from}T00:00:00.000Z`;
      }
      if (to) {
        where.push('created_at < @to');
        const nextDay = new Date(`${to}T00:00:00.000Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        params.to = nextDay.toISOString();
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { totalItems } = db
        .prepare(`SELECT COUNT(*) AS totalItems FROM security_events ${clause}`)
        .get(params);
      const items = db
        .prepare(
          `
        SELECT id, event_type AS eventType, admin_id AS adminId,
          actor_admin_id AS actorAdminId, request_id AS requestId,
          ip_address AS ipAddress, user_agent AS userAgent, details,
          created_at AS createdAt
        FROM security_events
        ${clause}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit OFFSET @offset
      `,
        )
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
        .map((row) => ({ ...row, details: parseDetails(row.details) }));
      return { items, totalItems };
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
        .all(adminId, adminId, Math.min(Math.max(Number(limit) || 50, 1), 100))
        .map((row) => ({ ...row, details: parseDetails(row.details) }));
    },
  };
}
