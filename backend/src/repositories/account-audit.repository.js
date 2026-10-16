const PAGE_SIZE_MAX = 100;

export function createAccountAuditRepository(db) {
  const insertEvent = db.prepare(`
    INSERT INTO account_audit (
      actor_admin_id, actor_type, target_admin_id, action, metadata, request_id, created_at
    ) VALUES (
      @actorAdminId, @actorType, @targetAdminId, @action, @metadata, @requestId, @createdAt
    )
  `);
  const selectForTarget = db.prepare(`
    SELECT
      au.id,
      au.actor_admin_id AS actorAdminId,
      actor.display_name AS actorName,
      au.actor_type AS actorType,
      au.target_admin_id AS targetAdminId,
      au.action,
      au.metadata,
      au.request_id AS requestId,
      au.created_at AS createdAt
    FROM account_audit au
    LEFT JOIN admins actor ON actor.id = au.actor_admin_id
    WHERE au.target_admin_id = @targetAdminId
    ORDER BY au.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countForTarget = db.prepare(
    'SELECT COUNT(*) AS totalItems FROM account_audit WHERE target_admin_id = ?',
  );

  return {
    insert({
      actorAdminId = null,
      actorType = 'cli',
      targetAdminId = null,
      action,
      metadata = {},
      requestId = null,
      now = new Date(),
    }) {
      insertEvent.run({
        actorAdminId,
        actorType,
        targetAdminId,
        action,
        metadata: JSON.stringify(metadata),
        requestId,
        createdAt: now.toISOString(),
      });
    },

    listForTarget(targetAdminId, { page = 1, pageSize = 20 } = {}) {
      const limit = Math.min(Math.max(Number(pageSize) || 20, 1), PAGE_SIZE_MAX);
      const currentPage = Math.max(Number(page) || 1, 1);
      return {
        items: selectForTarget.all({
          targetAdminId,
          limit,
          offset: (currentPage - 1) * limit,
        }),
        totalItems: countForTarget.get(targetAdminId).totalItems,
      };
    },
  };
}
