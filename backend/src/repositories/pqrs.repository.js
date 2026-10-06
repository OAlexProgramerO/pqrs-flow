import { formatCaseNumber } from '../services/case-number.js';

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
  const nextSequence = db.prepare(`
    INSERT INTO case_counters (year, last_value) VALUES (@year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = last_value + 1
    RETURNING last_value AS sequence
  `);

  const insert = db.prepare(`
    INSERT INTO pqrs (case_number, type, subject, description, requester_name, requester_email)
    VALUES (@caseNumber, @type, @subject, @description, @requesterName, @requesterEmail)
  `);

  const selectByCaseNumber = db.prepare(`SELECT ${SELECT_COLUMNS} FROM pqrs WHERE case_number = ?`);

  // Only the columns a citizen may see. The email is compared without caring about case.
  const selectForLookup = db.prepare(`
    SELECT case_number AS caseNumber, type, status, created_at AS createdAt
    FROM pqrs
    WHERE case_number = ? AND lower(requester_email) = ?
  `);

  // One transaction: if the insert fails, the counter does not advance
  const createInTransaction = db.transaction((data, now) => {
    const year = now.getUTCFullYear();
    const { sequence } = nextSequence.get({ year });
    const caseNumber = formatCaseNumber(year, sequence);

    insert.run({
      caseNumber,
      type: data.type,
      subject: data.subject,
      description: data.description,
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
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
      return selectForLookup.get(caseNumber, String(requesterEmail).toLowerCase()) ?? null;
    },
  };
}
