import { STATUSES } from '../services/status-workflow.js';

// The only fields the list can be sorted by. The value is the SQL column, so a client can never
// choose a column name: anything outside this object is rejected before it reaches SQL.
export const SORT_COLUMNS = Object.freeze({
  createdAt: 'created_at',
  caseNumber: 'case_number',
  status: 'status',
  type: 'type',
});

const DETAIL_COLUMNS = `
  id,
  case_number AS caseNumber,
  type,
  subject,
  description,
  requester_name AS requesterName,
  requester_email AS requesterEmail,
  status,
  created_at AS createdAt
`;

// The list shows less than the detail: no description and no email address
const LIST_COLUMNS = `
  case_number AS caseNumber,
  type,
  subject,
  requester_name AS requesterName,
  status,
  created_at AS createdAt
`;

// Characters that mean something to LIKE are written literally, so "100%" searches for "100%"
function likePattern(term) {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Data access for the staff panel: list, detail, counters and status changes with their audit.
 * It is a separate repository from the public one, so the public routes can never reach it.
 * Every value reaches SQL as a parameter. The only text built into a query is the ORDER BY,
 * and it comes from the SORT_COLUMNS whitelist, never from the client.
 */
export function createAdminPqrsRepository(db) {
  const selectByCaseNumber = db.prepare(`SELECT ${DETAIL_COLUMNS} FROM pqrs WHERE case_number = ?`);
  const countByStatus = db.prepare('SELECT status, COUNT(*) AS total FROM pqrs GROUP BY status');

  const selectAudit = db.prepare(`
    SELECT
      au.id,
      au.action,
      au.previous_status AS previousStatus,
      au.new_status AS newStatus,
      au.created_at AS createdAt,
      ad.id AS adminId,
      ad.display_name AS adminName
    FROM pqrs_audit au
    JOIN admins ad ON ad.id = au.admin_id
    WHERE au.pqrs_id = ?
    ORDER BY au.id
  `);

  const updateStatus = db.prepare(
    'UPDATE pqrs SET status = @newStatus WHERE id = @id AND status = @previous',
  );
  const insertAudit = db.prepare(`
    INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, previous_status, new_status, request_id, created_at)
    VALUES (@pqrsId, @caseNumber, @adminId, 'status_change', @previous, @newStatus, @requestId, @createdAt)
  `);

  function buildWhere(filters) {
    const conditions = [];
    const params = {};

    if (filters.q) {
      conditions.push(
        `(case_number LIKE @like ESCAPE '\\' OR subject LIKE @like ESCAPE '\\'
          OR requester_name LIKE @like ESCAPE '\\' OR requester_email LIKE @like ESCAPE '\\')`,
      );
      params.like = likePattern(filters.q);
    }
    if (filters.status) {
      conditions.push('status = @status');
      params.status = filters.status;
    }
    if (filters.type) {
      conditions.push('type = @type');
      params.type = filters.type;
    }
    if (filters.createdFrom) {
      conditions.push('created_at >= @createdFrom');
      params.createdFrom = filters.createdFrom;
    }
    if (filters.createdBefore) {
      conditions.push('created_at < @createdBefore');
      params.createdBefore = filters.createdBefore;
    }

    return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  // One transaction that takes the write lock at its start (BEGIN IMMEDIATE), so two processes
  // can never read the same status and both change it.
  const transition = db.transaction((caseNumber, { adminId, requestId, now, decide }) => {
    const current = selectByCaseNumber.get(caseNumber);
    if (!current) return null;

    // The service applies the business rules here. If it throws, nothing below runs.
    const newStatus = decide(current);

    const changed = updateStatus.run({ id: current.id, newStatus, previous: current.status });
    if (changed.changes !== 1) throw new Error('The status changed during the update.');

    // Same transaction: if this insert fails, the status change above is rolled back
    insertAudit.run({
      pqrsId: current.id,
      caseNumber: current.caseNumber,
      adminId,
      previous: current.status,
      newStatus,
      requestId: requestId ?? null,
      createdAt: now.toISOString(),
    });

    return { ...current, status: newStatus };
  });

  return {
    /**
     * A page of requests with the filters applied. `filters` comes from validateListQuery.
     */
    list(filters) {
      const { where, params } = buildWhere(filters);
      const column = SORT_COLUMNS[filters.sort] ?? SORT_COLUMNS.createdAt;
      const direction = filters.order === 'asc' ? 'ASC' : 'DESC';

      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM pqrs ${where}`).get(params);

      // The id breaks ties, so a page never repeats or skips a row between requests
      const items = db
        .prepare(
          `SELECT ${LIST_COLUMNS} FROM pqrs ${where}
           ORDER BY ${column} ${direction}, id ${direction}
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize });

      return { items, totalItems: total };
    },

    /** Number of requests per status. Statuses without requests count zero. */
    countsByStatus() {
      const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const row of countByStatus.all()) counts[row.status] = row.total;
      return counts;
    },

    findByCaseNumber(caseNumber) {
      return selectByCaseNumber.get(caseNumber) ?? null;
    },

    /** The audit records of a request, oldest first. */
    listAudit(pqrsId) {
      return selectAudit.all(pqrsId);
    },

    /**
     * Changes the status and writes its audit record in one transaction.
     * `decide(current)` returns the new status or throws to cancel. Returns the updated request,
     * or null when the case number does not exist.
     */
    transitionStatus(caseNumber, options) {
      return transition.immediate(caseNumber, options);
    },
  };
}
