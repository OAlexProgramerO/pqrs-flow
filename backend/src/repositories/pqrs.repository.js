import { formatCaseNumber } from '../services/case-number.js';
import { calculateDeadline } from '../services/deadlines.js';
import { createDeadlinesRepository } from './deadlines.repository.js';

const SELECT_COLUMNS = `
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

/**
 * Data access for PQRS requests.
 * Statements are prepared once here and reused on every call.
 */
export function createPqrsRepository(db) {
  const deadlinesRepository = createDeadlinesRepository(db);
  const nextSequence = db.prepare(`
    INSERT INTO case_counters (year, last_value) VALUES (@year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = last_value + 1
    RETURNING last_value AS sequence
  `);

  const insert = db.prepare(`
    INSERT INTO pqrs (
      case_number, type, subject, description, requester_name, requester_email,
      deadline_due_date, deadline_business_days, deadline_rule_version,
      deadline_policy_version, deadline_holidays_snapshot
    )
    VALUES (
      @caseNumber, @type, @subject, @description, @requesterName, @requesterEmail,
      @deadlineDueDate, @deadlineBusinessDays, @deadlineRuleVersion,
      @deadlinePolicyVersion, @deadlineHolidaysSnapshot
    )
  `);

  const selectByCaseNumber = db.prepare(`SELECT ${SELECT_COLUMNS} FROM pqrs WHERE case_number = ?`);

  // Only the columns a citizen may see. The email is compared without caring about case.
  const selectForLookup = db.prepare(`
    SELECT
      p.case_number AS caseNumber,
      p.type,
      p.status,
      p.created_at AS createdAt,
      r.text AS officialResponse,
      r.published_at AS publishedAt
    FROM pqrs p
    LEFT JOIN pqrs_responses r ON r.pqrs_id = p.id AND r.state = 'published'
    WHERE p.case_number = ? AND lower(p.requester_email) = ?
  `);

  // One transaction: if the insert fails, the counter does not advance
  const createInTransaction = db.transaction((data, now) => {
    const year = now.getUTCFullYear();
    const { sequence } = nextSequence.get({ year });
    const caseNumber = formatCaseNumber(year, sequence);
    const rule = deadlinesRepository.getRule(data.type);
    const holidays = deadlinesRepository.listHolidays().map(({ date }) => date);
    const deadline = rule
      ? calculateDeadline({
          type: data.type,
          submittedAt: now,
          rule,
          holidays,
        })
      : null;

    insert.run({
      caseNumber,
      type: data.type,
      subject: data.subject,
      description: data.description,
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
      deadlineDueDate: deadline?.dueDate ?? null,
      deadlineBusinessDays: deadline?.businessDays ?? null,
      deadlineRuleVersion: deadline?.ruleVersion ?? null,
      deadlinePolicyVersion: deadline?.policyVersion ?? null,
      deadlineHolidaysSnapshot: JSON.stringify(deadline?.holidaysSnapshot ?? []),
    });

    return selectByCaseNumber.get(caseNumber);
  });

  return {
    create(data, { now = new Date() } = {}) {
      return createInTransaction(data, now);
    },

    findByCaseNumber(caseNumber) {
      return selectByCaseNumber.get(caseNumber) ?? null;
    },

    /**
     * Finds a request only when the case number AND the email match.
     * Returns the public columns, or null. A wrong email and an unknown case number look the same.
     */
    findForLookup(caseNumber, requesterEmail) {
      const found = selectForLookup.get(caseNumber, String(requesterEmail).toLowerCase());
      if (!found) return null;

      const { officialResponse, publishedAt, ...publicRecord } = found;
      return officialResponse ? { ...publicRecord, officialResponse, publishedAt } : publicRecord;
    },
  };
}
