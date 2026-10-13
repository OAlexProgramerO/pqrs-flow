import {
  CASE_NUMBER_PATTERN,
  EMAIL_PATTERN,
  LIMITS,
  REQUEST_TYPES,
  normalizeCaseNumber,
} from '../../../shared/validation.js';
import { SORT_COLUMNS } from '../repositories/admin-pqrs.repository.js';
import { PASSWORD_LIMITS } from './password.js';
import { STATUSES, isStatus } from './status-workflow.js';

export const PAGINATION = { defaultPageSize: 20, maxPageSize: 100, maxPage: 100000 };
export const SEARCH_MAX_LENGTH = 100;

export const SORT_ORDERS = ['asc', 'desc'];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const NEW_ADMIN_NAME_LIMITS = { min: 2, max: 100 };

/**
 * A query string value must be one plain string. `?status=a&status=b` and `?status[x]=a`
 * arrive as arrays and objects, and they are never accepted.
 */
function singleValue(value) {
  return typeof value === 'string' ? value : null;
}

function isRealDate(text) {
  const match = DATE_PATTERN.exec(text);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function nextDay(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Validates the body of a login. It only checks the shape of the input; whether the account
 * exists or the password is right is the business of the auth service.
 */
export function validateLogin(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email) errors.email = 'Email address is required.';
  else if (email.length > LIMITS.requesterEmail.max || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) errors.password = 'Password is required.';
  else if (password.length > PASSWORD_LIMITS.max) errors.password = 'Password is too long.';

  return { valid: Object.keys(errors).length === 0, errors, data: { email, password } };
}

/**
 * Validates the data of a new staff account (used by the command line tool).
 */
export function validateNewAdmin(input = {}) {
  const email = normalizeEmail(input.email);
  const displayName = String(input.displayName ?? '').trim();
  const password = typeof input.password === 'string' ? input.password : '';
  const errors = {};

  if (!email) errors.email = 'Email address is required.';
  else if (email.length > LIMITS.requesterEmail.max || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (
    displayName.length < NEW_ADMIN_NAME_LIMITS.min ||
    displayName.length > NEW_ADMIN_NAME_LIMITS.max
  ) {
    errors.displayName = `Name must have between ${NEW_ADMIN_NAME_LIMITS.min} and ${NEW_ADMIN_NAME_LIMITS.max} characters.`;
  }

  Object.assign(errors, validatePassword(password, { email }).errors);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { email, displayName, password },
  };
}

/**
 * Password rules for new passwords: length, and not the email address. There are no rules about
 * symbols or digits: length and a password manager protect better than composition rules.
 */
export function validatePassword(password, { email = '' } = {}) {
  const errors = {};
  const text = typeof password === 'string' ? password : '';

  if (text.length < PASSWORD_LIMITS.min) {
    errors.password = `Password must have at least ${PASSWORD_LIMITS.min} characters.`;
  } else if (text.length > PASSWORD_LIMITS.max) {
    errors.password = `Password must have at most ${PASSWORD_LIMITS.max} characters.`;
  } else if (email && text.toLowerCase() === email.toLowerCase()) {
    errors.password = 'Password must not be the email address.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the query string of the staff list. Returns the clean filters that the repository
 * turns into a parameterized query.
 */
export function validateListQuery(query = {}) {
  const errors = {};
  const data = {
    q: '',
    status: null,
    type: null,
    from: null,
    to: null,
    sort: 'createdAt',
    order: 'desc',
    page: 1,
    pageSize: PAGINATION.defaultPageSize,
  };

  // Reads one parameter. Missing or empty means "not given". Anything but a string is an error.
  function read(name) {
    if (query[name] === undefined) return null;

    const value = singleValue(query[name]);
    if (value === null) {
      errors[name] = 'Send a single value.';
      return null;
    }

    const text = value.trim();
    return text === '' ? null : text;
  }

  const q = read('q');
  if (q !== null) {
    if (q.length > SEARCH_MAX_LENGTH)
      errors.q = `Search must have at most ${SEARCH_MAX_LENGTH} characters.`;
    else if (CONTROL_CHARACTERS.test(q)) errors.q = 'Search contains invalid characters.';
    else data.q = q;
  }

  const status = read('status');
  if (status !== null) {
    if (isStatus(status)) data.status = status;
    else errors.status = `Status must be one of: ${STATUSES.join(', ')}.`;
  }

  const type = read('type');
  if (type !== null) {
    if (REQUEST_TYPES.includes(type)) data.type = type;
    else errors.type = `Type must be one of: ${REQUEST_TYPES.join(', ')}.`;
  }

  for (const name of ['from', 'to']) {
    const date = read(name);
    if (date === null) continue;

    if (isRealDate(date)) data[name] = date;
    else errors[name] = 'Use a real date written as YYYY-MM-DD.';
  }
  if (data.from && data.to && data.from > data.to) {
    errors.to = 'The end date must not be before the start date.';
  }

  const sort = read('sort');
  if (sort !== null) {
    if (Object.hasOwn(SORT_COLUMNS, sort)) data.sort = sort;
    else errors.sort = `Sort must be one of: ${Object.keys(SORT_COLUMNS).join(', ')}.`;
  }

  const order = read('order');
  if (order !== null) {
    if (SORT_ORDERS.includes(order.toLowerCase())) data.order = order.toLowerCase();
    else errors.order = 'Order must be asc or desc.';
  }

  const page = read('page');
  if (page !== null) {
    if (/^\d{1,6}$/.test(page) && Number(page) >= 1 && Number(page) <= PAGINATION.maxPage) {
      data.page = Number(page);
    } else errors.page = `Page must be a whole number from 1 to ${PAGINATION.maxPage}.`;
  }

  const pageSize = read('pageSize');
  if (pageSize !== null) {
    if (
      /^\d{1,3}$/.test(pageSize) &&
      Number(pageSize) >= 1 &&
      Number(pageSize) <= PAGINATION.maxPageSize
    ) {
      data.pageSize = Number(pageSize);
    } else
      errors.pageSize = `Page size must be a whole number from 1 to ${PAGINATION.maxPageSize}.`;
  }

  // The end date includes the whole day, so the query asks for "before the next day"
  const range = {
    createdFrom: data.from ? `${data.from}T00:00:00.000Z` : null,
    createdBefore: data.to ? `${nextDay(data.to)}T00:00:00.000Z` : null,
  };

  return { valid: Object.keys(errors).length === 0, errors, data: { ...data, ...range } };
}

/**
 * Validates the case number of a route such as /api/admin/pqrs/PQRS-2026-000001.
 */
export function validateCaseNumberParam(value) {
  const caseNumber = normalizeCaseNumber(value);
  const valid = CASE_NUMBER_PATTERN.test(caseNumber) && caseNumber.length <= 40;

  return {
    valid,
    errors: valid ? {} : { caseNumber: 'Enter a case number like PQRS-2026-000001.' },
    data: { caseNumber },
  };
}

/**
 * Validates the body of a status change: the new status and, optionally, the status the
 * administrator was looking at. The second one detects two people changing the same request.
 */
export function validateStatusChange(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const data = { status: '', expectedStatus: null };

  if (!isStatus(body.status)) {
    errors.status = `Status must be one of: ${STATUSES.join(', ')}.`;
  } else data.status = body.status;

  if (body.expectedStatus !== undefined && body.expectedStatus !== null) {
    if (isStatus(body.expectedStatus)) data.expectedStatus = body.expectedStatus;
    else errors.expectedStatus = `Expected status must be one of: ${STATUSES.join(', ')}.`;
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}
