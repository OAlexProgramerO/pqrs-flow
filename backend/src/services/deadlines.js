import { REQUEST_TYPES } from '../../../shared/validation.js';

export const DEADLINE_POLICY_VERSION = 'utc-business-days-v1';
export const APPROACHING_BUSINESS_DAYS = 5;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dateFromTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!(value instanceof Date)) {
    const match = typeof value === 'string' ? TIMESTAMP_PATTERN.exec(value) : null;
    if (!match) throw new TypeError('Submission timestamp must be ISO 8601 with a timezone.');
    const [, dateTextValue, hours, minutes, seconds] = match;
    if (
      !isValidDate(dateTextValue) ||
      Number(hours) > 23 ||
      Number(minutes) > 59 ||
      Number(seconds) > 59
    ) {
      throw new TypeError('Submission timestamp is invalid.');
    }
  }
  if (Number.isNaN(date.getTime())) throw new TypeError('Submission timestamp is invalid.');
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(date, holidays) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(dateText(date));
}

function parseHolidaySnapshot(value) {
  const holidays = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !Array.isArray(holidays) ||
    holidays.some((date) => !isValidDate(date)) ||
    new Set(holidays).size !== holidays.length
  ) {
    throw new TypeError('The saved holiday calendar is invalid.');
  }
  return holidays;
}

export function calculateDeadline({ type, submittedAt, rule, holidays = [] }) {
  if (!REQUEST_TYPES.includes(type)) throw new TypeError('Request type is invalid.');
  const submitted = dateFromTimestamp(submittedAt);
  if (
    !rule ||
    !Number.isSafeInteger(rule.businessDays) ||
    rule.businessDays < 1 ||
    !Number.isSafeInteger(rule.version) ||
    rule.version < 1
  ) {
    throw new TypeError('A valid deadline rule is required.');
  }
  if (!Array.isArray(holidays) || holidays.some((date) => !isValidDate(date))) {
    throw new TypeError('Holiday dates must be valid YYYY-MM-DD dates.');
  }

  const holidaySet = new Set(holidays);
  if (holidaySet.size !== holidays.length) throw new TypeError('Holiday dates must be unique.');

  let due = new Date(submitted);
  due.setUTCHours(0, 0, 0, 0);
  let counted = 0;
  while (counted < rule.businessDays) {
    due = addDays(due, 1);
    if (isBusinessDay(due, holidaySet)) counted += 1;
  }

  const submittedDate = dateText(submitted);
  const dueDate = dateText(due);
  return {
    dueDate,
    businessDays: rule.businessDays,
    ruleId: `${type}:v${rule.version}`,
    ruleVersion: rule.version,
    policyVersion: DEADLINE_POLICY_VERSION,
    holidaysSnapshot: holidays.filter((date) => date >= submittedDate && date <= dueDate).sort(),
  };
}

function countBusinessDays(startDate, endDate, holidays) {
  let count = 0;
  let date = addDays(new Date(`${startDate}T00:00:00.000Z`), 1);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (date <= end) {
    if (isBusinessDay(date, holidays)) count += 1;
    date = addDays(date, 1);
  }
  return count;
}

export function getDeadlineStatus({ dueDate, businessDays, holidaysSnapshot, status }, now) {
  if (status === 'answered' || status === 'closed') {
    return {
      dueDate: dueDate ?? null,
      businessDays: businessDays ?? null,
      status: 'completed',
      overdue: false,
      approaching: false,
      remainingBusinessDays: null,
    };
  }
  if (!dueDate) {
    return {
      dueDate: null,
      businessDays: null,
      status: 'unavailable',
      overdue: false,
      approaching: false,
      remainingBusinessDays: null,
    };
  }
  if (!isValidDate(dueDate)) throw new TypeError('The saved due date is invalid.');
  const clock = dateFromTimestamp(now);
  const today = dateText(clock);
  const holidays = new Set(parseHolidaySnapshot(holidaysSnapshot));
  const overdue = today > dueDate;
  const remainingBusinessDays = overdue ? 0 : countBusinessDays(today, dueDate, holidays);
  const approaching = !overdue && remainingBusinessDays <= APPROACHING_BUSINESS_DAYS;
  return {
    dueDate,
    businessDays,
    status: overdue ? 'overdue' : approaching ? 'approaching' : 'on_track',
    overdue,
    approaching,
    remainingBusinessDays,
  };
}

export function deadlineDetails(row, now) {
  const state = getDeadlineStatus(
    {
      dueDate: row.deadlineDueDate,
      businessDays: row.deadlineBusinessDays,
      holidaysSnapshot: row.deadlineHolidaysSnapshot,
      status: row.status,
    },
    now,
  );
  return {
    ...state,
    ruleId: row.deadlineRuleVersion ? `${row.type}:v${row.deadlineRuleVersion}` : null,
    policyVersion: row.deadlinePolicyVersion ?? null,
    timezone: 'UTC',
  };
}

export function validateDeadlineRule(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const key of Object.keys(body)) {
    if (key !== 'businessDays') errors[key] = 'This field cannot be changed.';
  }
  if (
    !Number.isSafeInteger(body.businessDays) ||
    body.businessDays < 1 ||
    body.businessDays > 366
  ) {
    errors.businessDays = 'Business days must be a whole number from 1 to 366.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { businessDays: body.businessDays },
  };
}

export function validateHoliday(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const key of Object.keys(body)) {
    if (key !== 'name') errors[key] = 'This field cannot be changed.';
  }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    errors.name = 'Holiday name must have between 1 and 100 characters.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name: typeof body.name === 'string' ? body.name.trim() : '' },
  };
}
