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
const STAFF_ROLES = ['administrator', 'staff'];
const ACCOUNT_PAGE_SIZE = { default: 20, max: 100 };

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
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName ?? '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role ?? 'administrator';
  const errors = {};
  for (const key of Object.keys(body)) {
    if (!['email', 'displayName', 'password', 'role'].includes(key)) {
      errors[key] = 'This field cannot be set.';
    }
  }

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
  if (!STAFF_ROLES.includes(role)) errors.role = 'Role must be administrator or staff.';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { email, displayName, password, role },
  };
}

export function validateStaffListQuery(query = {}) {
  const errors = {};
  const allowed = new Set(['q', 'role', 'status', 'page', 'pageSize']);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) errors[key] = 'Unexpected query parameter.';
    else if (typeof query[key] !== 'string') errors[key] = 'Send one value.';
  }
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const role = query.role === '' ? undefined : query.role;
  const status = query.status === '' ? undefined : query.status;
  const pageText = query.page;
  const pageSizeText = query.pageSize;
  const page = pageText === undefined || typeof pageText !== 'string' ? 1 : Number(pageText);
  const pageSize =
    pageSizeText === undefined || typeof pageSizeText !== 'string'
      ? ACCOUNT_PAGE_SIZE.default
      : Number(pageSizeText);

  if (q.length > SEARCH_MAX_LENGTH || CONTROL_CHARACTERS.test(q)) {
    errors.q = `Search must contain at most ${SEARCH_MAX_LENGTH} valid characters.`;
  }
  if (role !== undefined && !STAFF_ROLES.includes(role)) {
    errors.role = 'Role must be administrator or staff.';
  }
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    errors.status = 'Status must be active or inactive.';
  }
  if (
    (pageText !== undefined && !/^\d{1,6}$/.test(String(pageText))) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > PAGINATION.maxPage
  ) {
    errors.page = `Page must be a whole number from 1 to ${PAGINATION.maxPage}.`;
  }
  if (
    (pageSizeText !== undefined && !/^\d{1,3}$/.test(String(pageSizeText))) ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > ACCOUNT_PAGE_SIZE.max
  ) {
    errors.pageSize = `Page size must be a whole number from 1 to ${ACCOUNT_PAGE_SIZE.max}.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      q,
      role,
      isActive: status === undefined ? undefined : status === 'active',
      page,
      pageSize,
    },
  };
}

export function validateStaffUpdate(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const data = {};
  const allowed = new Set(['email', 'displayName', 'role', 'isActive']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) errors[key] = 'This field cannot be changed.';
  }

  if (Object.hasOwn(body, 'email')) {
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || email.length > LIMITS.requesterEmail.max || !EMAIL_PATTERN.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else data.email = email;
  }
  if (Object.hasOwn(body, 'displayName')) {
    if (typeof body.displayName !== 'string') errors.displayName = 'Enter a valid name.';
    else {
      const displayName = body.displayName.trim();
      if (
        displayName.length < NEW_ADMIN_NAME_LIMITS.min ||
        displayName.length > NEW_ADMIN_NAME_LIMITS.max
      ) {
        errors.displayName = `Name must have between ${NEW_ADMIN_NAME_LIMITS.min} and ${NEW_ADMIN_NAME_LIMITS.max} characters.`;
      } else data.displayName = displayName;
    }
  }
  if (Object.hasOwn(body, 'role')) {
    if (!STAFF_ROLES.includes(body.role)) errors.role = 'Role must be administrator or staff.';
    else data.role = body.role;
  }
  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'Status must be active or inactive.';
    else data.isActive = body.isActive;
  }
  if (Object.keys(body).length === 0) errors.body = 'Send at least one field to update.';

  return { valid: Object.keys(errors).length === 0, errors, data };
}

export function validatePasswordChange(input, { email = '' } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const data = {};
  const allowed = new Set(['currentPassword', 'newPassword', 'confirmPassword']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) errors[key] = 'This field cannot be changed.';
  }
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  if (!currentPassword || currentPassword.length > PASSWORD_LIMITS.max) {
    errors.currentPassword = 'Enter your current password.';
  }
  const passwordErrors = validatePassword(newPassword, { email }).errors;
  if (passwordErrors.password) errors.newPassword = passwordErrors.password;
  if (newPassword && confirmPassword !== newPassword) {
    errors.confirmPassword = 'The new passwords do not match.';
  }
  data.currentPassword = currentPassword;
  data.newPassword = newPassword;
  return { valid: Object.keys(errors).length === 0, errors, data };
}

export function validatePasswordReset(input, { email = '' } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const key of Object.keys(body)) {
    if (!['password', 'confirmPassword'].includes(key))
      errors[key] = 'This field cannot be changed.';
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  Object.assign(errors, validatePassword(password, { email }).errors);
  if (password && confirmPassword !== password)
    errors.confirmPassword = 'The passwords do not match.';
  return { valid: Object.keys(errors).length === 0, errors, data: { password } };
}

export function validateAccountIdParam(value) {
  const id = Number(value);
  const valid = /^\d+$/.test(String(value)) && Number.isSafeInteger(id) && id > 0;
  return {
    valid,
    errors: valid ? {} : { id: 'Account id must be a positive integer.' },
    data: { id },
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
