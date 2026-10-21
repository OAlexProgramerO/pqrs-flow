import { REQUEST_TYPES } from '../../../shared/validation.js';
import { STATUSES } from '../services/status-workflow.js';

function buildWhere({ startDate, endExclusive, type, status }) {
  const conditions = ['p.created_at >= @startAt', 'p.created_at < @endExclusive'];
  const params = { startAt: `${startDate}T00:00:00.000Z`, endExclusive };

  if (type) {
    conditions.push('p.type = @type');
    params.type = type;
  }
  if (status) {
    conditions.push('p.status = @status');
    params.status = status;
  }

  return { where: conditions.join(' AND '), params };
}

export function createAdminReportsRepository(db) {
  return {
    getReport(filters) {
      const { where, params } = buildWhere(filters);
      const endParams = { ...params, asOfExclusive: filters.endExclusive };

      const total = db
        .prepare(`SELECT COUNT(*) AS total FROM pqrs p WHERE ${where}`)
        .get(params).total;

      const byType = Object.fromEntries(REQUEST_TYPES.map((type) => [type, 0]));
      for (const row of db
        .prepare(`SELECT p.type, COUNT(*) AS total FROM pqrs p WHERE ${where} GROUP BY p.type`)
        .all(params)) {
        byType[row.type] = row.total;
      }

      const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const row of db
        .prepare(`SELECT p.status, COUNT(*) AS total FROM pqrs p WHERE ${where} GROUP BY p.status`)
        .all(params)) {
        byStatus[row.status] = row.total;
      }

      const dailyVolume = db
        .prepare(
          `SELECT date(p.created_at) AS date, COUNT(*) AS total
           FROM pqrs p
           WHERE ${where}
           GROUP BY date(p.created_at)
           ORDER BY date(p.created_at)`,
        )
        .all(params);

      const responseTime = db
        .prepare(
          `WITH filtered AS (
             SELECT p.id, p.created_at
             FROM pqrs p
             WHERE ${where}
           ),
           first_published AS (
             SELECT a.pqrs_id, MIN(a.created_at) AS published_at
             FROM pqrs_audit a
             JOIN filtered f ON f.id = a.pqrs_id
             WHERE a.action = 'response_published'
               AND a.created_at >= f.created_at
               AND a.created_at < @asOfExclusive
             GROUP BY a.pqrs_id
           )
           SELECT
             COUNT(*) AS sampleSize,
             AVG((julianday(r.published_at) - julianday(f.created_at)) * 86400) AS averageSeconds
           FROM filtered f
           JOIN first_published r ON r.pqrs_id = f.id
           `,
        )
        .get(endParams);

      const deadlines = db
        .prepare(
          `SELECT
             p.deadline_due_date AS dueDate,
             p.deadline_business_days AS businessDays,
             p.deadline_holidays_snapshot AS holidaysSnapshot,
             COALESCE((
               SELECT a.new_status
               FROM pqrs_audit a
               WHERE a.pqrs_id = p.id
                 AND a.action = 'status_change'
                 AND a.created_at < @asOfExclusive
               ORDER BY a.created_at DESC, a.id DESC
               LIMIT 1
             ), 'filed') AS statusAsOf
           FROM pqrs p
           WHERE ${where}`,
        )
        .all(endParams);

      return { total, byType, byStatus, dailyVolume, responseTime, deadlines };
    },
  };
}
