import { STATUSES } from '../services/status-workflow.js';

export const SORT_COLUMNS = Object.freeze({
  createdAt: 'created_at',
  caseNumber: 'case_number',
  status: 'status',
  type: 'type',
});

const DETAIL_COLUMNS = `
  p.id,
  p.case_number AS caseNumber,
  p.type,
  p.subject,
  p.description,
  p.requester_name AS requesterName,
  p.requester_email AS requesterEmail,
  p.status,
  p.created_at AS createdAt,
  p.deadline_due_date AS deadlineDueDate,
  p.deadline_business_days AS deadlineBusinessDays,
  p.deadline_rule_version AS deadlineRuleVersion,
  p.deadline_policy_version AS deadlinePolicyVersion,
  p.deadline_holidays_snapshot AS deadlineHolidaysSnapshot,
  pa.assignee_admin_id AS assigneeId,
  ad.display_name AS assigneeName
`;

const LIST_COLUMNS = `
  p.case_number AS caseNumber,
  p.type,
  p.subject,
  p.requester_name AS requesterName,
  p.status,
  p.created_at AS createdAt,
  p.deadline_due_date AS deadlineDueDate,
  p.deadline_business_days AS deadlineBusinessDays,
  p.deadline_rule_version AS deadlineRuleVersion,
  p.deadline_policy_version AS deadlinePolicyVersion,
  p.deadline_holidays_snapshot AS deadlineHolidaysSnapshot,
  pa.assignee_admin_id AS assigneeId,
  ad.display_name AS assigneeName
`;

function likePattern(term) {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

export function createAdminPqrsRepository(db) {
  const selectByCaseNumber = db.prepare(`
    SELECT ${DETAIL_COLUMNS}
    FROM pqrs p
    LEFT JOIN pqrs_assignments pa ON pa.pqrs_id = p.id
    LEFT JOIN admins ad ON ad.id = pa.assignee_admin_id
    WHERE p.case_number = ?
  `);
  const selectCaseNumberById = db.prepare(
    'SELECT case_number AS caseNumber FROM pqrs WHERE id = ?',
  );

  const countByStatus = db.prepare('SELECT status, COUNT(*) AS total FROM pqrs GROUP BY status');
  const countUnassigned = db.prepare(
    'SELECT COUNT(*) AS total FROM pqrs p LEFT JOIN pqrs_assignments pa ON pa.pqrs_id = p.id WHERE pa.id IS NULL',
  );
  const countAssignedTo = db.prepare(
    'SELECT COUNT(*) AS total FROM pqrs_assignments WHERE assignee_admin_id = ?',
  );

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

  const selectNotes = db.prepare(`
    SELECT
      n.id,
      n.text,
      n.created_at AS createdAt,
      a.id AS adminId,
      a.display_name AS adminName
    FROM pqrs_notes n
    JOIN admins a ON a.id = n.author_admin_id
    WHERE n.pqrs_id = ?
    ORDER BY n.id
  `);

  const selectResponse = db.prepare(`
    SELECT
      r.id,
      r.text,
      r.state,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      r.published_at AS publishedAt,
      a.id AS authorId,
      a.display_name AS authorName
    FROM pqrs_responses r
    JOIN admins a ON a.id = r.author_admin_id
    WHERE r.pqrs_id = ?
    ORDER BY r.id DESC
    LIMIT 1
  `);

  const selectAssignment = db.prepare(`
    SELECT
      pa.id,
      pa.assignee_admin_id AS assigneeId,
      pa.assigned_by_admin_id AS assignedById,
      pa.created_at AS createdAt,
      pa.updated_at AS updatedAt,
      pa.removed_at AS removedAt,
      ad.display_name AS assigneeName,
      ab.display_name AS assignedByName
    FROM pqrs_assignments pa
    LEFT JOIN admins ad ON ad.id = pa.assignee_admin_id
    LEFT JOIN admins ab ON ab.id = pa.assigned_by_admin_id
    WHERE pa.pqrs_id = ?
  `);

  const findAdminById = db.prepare(
    'SELECT id, role, is_active AS isActive, display_name AS displayName FROM admins WHERE id = ?',
  );

  const insertCustomAudit = db.prepare(`
    INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, previous_status, new_status, request_id, created_at)
    VALUES (@pqrsId, @caseNumber, @adminId, @action, @previousStatus, @newStatus, @requestId, @createdAt)
  `);

  const updateStatus = db.prepare(
    'UPDATE pqrs SET status = @newStatus WHERE id = @id AND status = @previous',
  );
  const insertAudit = db.prepare(`
    INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, previous_status, new_status, request_id, created_at)
    VALUES (@pqrsId, @caseNumber, @adminId, 'status_change', @previous, @newStatus, @requestId, @createdAt)
  `);

  const upsertResponse = db.prepare(`
    INSERT INTO pqrs_responses (pqrs_id, author_admin_id, text, state, created_at, updated_at, published_at)
    VALUES (@pqrsId, @adminId, @text, @state, @createdAt, @updatedAt, @publishedAt)
    ON CONFLICT(pqrs_id) DO UPDATE SET
      author_admin_id = excluded.author_admin_id,
      text = excluded.text,
      state = excluded.state,
      updated_at = excluded.updated_at,
      published_at = excluded.published_at
  `);

  const insertNote = db.prepare(`
    INSERT INTO pqrs_notes (pqrs_id, author_admin_id, text, created_at)
    VALUES (@pqrsId, @adminId, @text, @createdAt)
  `);
  const selectNoteById = db.prepare(`
    SELECT
      n.id,
      n.text,
      n.created_at AS createdAt,
      a.id AS adminId,
      a.display_name AS adminName
    FROM pqrs_notes n
    JOIN admins a ON a.id = n.author_admin_id
    WHERE n.id = ?
  `);

  const setAssignment = db.prepare(`
    INSERT INTO pqrs_assignments (pqrs_id, assignee_admin_id, assigned_by_admin_id, created_at, updated_at, removed_at)
    VALUES (@pqrsId, @assigneeAdminId, @adminId, @createdAt, @updatedAt, NULL)
    ON CONFLICT(pqrs_id) DO UPDATE SET
      assignee_admin_id = excluded.assignee_admin_id,
      assigned_by_admin_id = excluded.assigned_by_admin_id,
      updated_at = excluded.updated_at,
      removed_at = NULL
  `);

  const clearAssignment = db.prepare(
    'UPDATE pqrs_assignments SET assignee_admin_id = NULL, assigned_by_admin_id = @adminId, updated_at = @updatedAt, removed_at = @removedAt WHERE pqrs_id = @pqrsId',
  );

  function writeAudit({ pqrsId, caseNumber, adminId, action, requestId, createdAt }) {
    const row = insertCustomAudit.run({
      pqrsId,
      caseNumber,
      adminId,
      action,
      previousStatus: null,
      newStatus: null,
      requestId: requestId ?? null,
      createdAt,
    });
    if (row.changes !== 1) throw new Error('The audit record could not be saved.');
  }

  function buildWhere(filters) {
    const conditions = [];
    const params = {};

    if (filters.q) {
      conditions.push(
        `(p.case_number LIKE @like ESCAPE '\\' OR p.subject LIKE @like ESCAPE '\\'
          OR p.requester_name LIKE @like ESCAPE '\\' OR p.requester_email LIKE @like ESCAPE '\\')`,
      );
      params.like = likePattern(filters.q);
    }
    if (filters.status) {
      conditions.push('p.status = @status');
      params.status = filters.status;
    }
    if (filters.type) {
      conditions.push('p.type = @type');
      params.type = filters.type;
    }
    if (filters.createdFrom) {
      conditions.push('p.created_at >= @createdFrom');
      params.createdFrom = filters.createdFrom;
    }
    if (filters.createdBefore) {
      conditions.push('p.created_at < @createdBefore');
      params.createdBefore = filters.createdBefore;
    }
    if (filters.assigneeId) {
      conditions.push('pa.assignee_admin_id = @assigneeId');
      params.assigneeId = filters.assigneeId;
    }
    if (filters.unassigned) {
      conditions.push('pa.assignee_admin_id IS NULL');
    }

    return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  const transition = db.transaction((caseNumber, { adminId, requestId, now, decide }) => {
    const current = selectByCaseNumber.get(caseNumber);
    if (!current) return null;

    const newStatus = decide(current);
    const changed = updateStatus.run({ id: current.id, newStatus, previous: current.status });
    if (changed.changes !== 1) throw new Error('The status changed during the update.');

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

  const repository = {
    list(filters) {
      const { where, params } = buildWhere(filters);
      const column = SORT_COLUMNS[filters.sort] ?? SORT_COLUMNS.createdAt;
      const direction = filters.order === 'asc' ? 'ASC' : 'DESC';

      const { total } = db
        .prepare(
          `SELECT COUNT(*) AS total FROM pqrs p LEFT JOIN pqrs_assignments pa ON pa.pqrs_id = p.id ${where}`,
        )
        .get(params);

      const items = db
        .prepare(
          `SELECT ${LIST_COLUMNS} FROM pqrs p
           LEFT JOIN pqrs_assignments pa ON pa.pqrs_id = p.id
           LEFT JOIN admins ad ON ad.id = pa.assignee_admin_id
           ${where}
           ORDER BY p.${column} ${direction}, p.id ${direction}
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize });

      return { items, totalItems: total };
    },

    countsByStatus() {
      const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const row of countByStatus.all()) counts[row.status] = row.total;
      return counts;
    },

    countUnassigned() {
      return countUnassigned.get().total;
    },

    countAssignedTo(adminId) {
      return countAssignedTo.get(adminId).total;
    },

    findByCaseNumber(caseNumber) {
      return selectByCaseNumber.get(caseNumber) ?? null;
    },

    listAudit(pqrsId) {
      return selectAudit.all(pqrsId);
    },

    listNotes(pqrsId) {
      return selectNotes.all(pqrsId);
    },

    getResponse(pqrsId) {
      return selectResponse.get(pqrsId) ?? null;
    },

    getAssignment(pqrsId) {
      return selectAssignment.get(pqrsId) ?? null;
    },

    createResponse({ pqrsId, adminId, text, state = 'draft', requestId, now = new Date() }) {
      const createdAt = now.toISOString();
      return db
        .transaction(() => {
          const previous = selectResponse.get(pqrsId);
          const row = upsertResponse.run({
            pqrsId,
            adminId,
            text,
            state,
            createdAt,
            updatedAt: createdAt,
            publishedAt: state === 'published' ? createdAt : null,
          });
          if (row.changes !== 1) throw new Error('The response could not be saved.');

          writeAudit({
            pqrsId,
            caseNumber: selectCaseNumberById.get(pqrsId).caseNumber,
            adminId,
            action:
              state === 'published'
                ? 'response_published'
                : previous
                  ? 'response_updated'
                  : 'response_created',
            requestId,
            createdAt,
          });

          return this.getResponse(pqrsId);
        })
        .immediate();
    },

    createNote({ pqrsId, adminId, text, requestId, now = new Date() }) {
      const createdAt = now.toISOString();
      return db
        .transaction(() => {
          const row = insertNote.run({ pqrsId, adminId, text, createdAt });
          if (row.changes !== 1) throw new Error('The note could not be saved.');
          const note = selectNoteById.get(Number(row.lastInsertRowid));
          const caseNumber = selectCaseNumberById.get(pqrsId).caseNumber;
          writeAudit({ pqrsId, caseNumber, adminId, action: 'note_created', requestId, createdAt });
          return note;
        })
        .immediate();
    },

    setAssignment({ pqrsId, assigneeAdminId, adminId, requestId, now = new Date() }) {
      const updatedAt = now.toISOString();
      return db
        .transaction(() => {
          const previous = selectAssignment.get(pqrsId);
          if (previous?.assigneeId === assigneeAdminId && previous.removedAt === null) {
            return previous;
          }

          const row = setAssignment.run({
            pqrsId,
            assigneeAdminId: assigneeAdminId ?? null,
            adminId,
            createdAt: updatedAt,
            updatedAt,
          });
          if (row.changes !== 1) throw new Error('The assignment could not be saved.');
          const caseNumber = selectCaseNumberById.get(pqrsId).caseNumber;
          writeAudit({
            pqrsId,
            caseNumber,
            adminId,
            action: 'assignment_changed',
            requestId,
            createdAt: updatedAt,
          });
          return this.getAssignment(pqrsId);
        })
        .immediate();
    },

    clearAssignment({ pqrsId, adminId, requestId, now = new Date() }) {
      const removedAt = now.toISOString();
      return db
        .transaction(() => {
          const previous = selectAssignment.get(pqrsId);
          if (!previous || previous.assigneeId === null) return previous ?? null;

          const row = clearAssignment.run({ pqrsId, adminId, updatedAt: removedAt, removedAt });
          if (row.changes !== 1) throw new Error('The assignment could not be removed.');
          const caseNumber = selectCaseNumberById.get(pqrsId).caseNumber;
          writeAudit({
            pqrsId,
            caseNumber,
            adminId,
            action: 'assignment_changed',
            requestId,
            createdAt: removedAt,
          });
          return this.getAssignment(pqrsId);
        })
        .immediate();
    },

    transitionStatus(caseNumber, options) {
      return transition.immediate(caseNumber, options);
    },

    findAdminById(id) {
      return findAdminById.get(id) ?? null;
    },
  };

  return Object.assign(repository, { db });
}
