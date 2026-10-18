import { REQUEST_TYPES } from '../../../shared/validation.js';

export function createDeadlinesRepository(db) {
  const getRuleStatement = db.prepare(`
    SELECT type, business_days AS businessDays, version
    FROM deadline_rules WHERE type = ? AND active = 1
  `);
  const listRulesStatement = db.prepare(`
    SELECT type, business_days AS businessDays, version, active
    FROM deadline_rules ORDER BY type
  `);
  const listHolidaysStatement = db.prepare(`
    SELECT date, name FROM deadline_holidays ORDER BY date
  `);

  return {
    getRule(type) {
      if (!REQUEST_TYPES.includes(type)) return null;
      return getRuleStatement.get(type) ?? null;
    },

    listRules() {
      return listRulesStatement.all();
    },

    listHolidays() {
      return listHolidaysStatement.all();
    },

    setRule(type, businessDays, updatedAt) {
      db.prepare(
        `
        INSERT INTO deadline_rules (type, business_days, version, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(type) DO UPDATE SET
          business_days = excluded.business_days,
          version = deadline_rules.version + 1,
          active = 1,
          updated_at = excluded.updated_at
      `,
      ).run(type, businessDays, updatedAt);
      return getRuleStatement.get(type);
    },

    deleteRule(type, updatedAt) {
      return (
        db
          .prepare(
            'UPDATE deadline_rules SET active = 0, version = version + 1, updated_at = ? WHERE type = ? AND active = 1',
          )
          .run(updatedAt, type).changes === 1
      );
    },

    setHoliday(date, name) {
      db.prepare(
        `
        INSERT INTO deadline_holidays (date, name) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET name = excluded.name
      `,
      ).run(date, name);
      return { date, name };
    },

    deleteHoliday(date) {
      return db.prepare('DELETE FROM deadline_holidays WHERE date = ?').run(date).changes === 1;
    },
  };
}
