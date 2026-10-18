import { REQUEST_TYPES } from '../../../shared/validation.js';
import { HttpError, ValidationError } from '../errors/http-error.js';
import { isValidDate, validateDeadlineRule, validateHoliday } from './deadlines.js';

export function getDeadlineConfiguration(repository) {
  return {
    timezone: 'UTC',
    policyVersion: 'utc-business-days-v1',
    approachingBusinessDays: 5,
    rules: repository.listRules(),
    holidays: repository.listHolidays(),
  };
}

export function setDeadlineRule(repository, { type, body, now = new Date() }) {
  if (!REQUEST_TYPES.includes(type))
    throw new ValidationError({ type: 'Request type is invalid.' });
  const { valid, errors, data } = validateDeadlineRule(body);
  if (!valid) throw new ValidationError(errors);
  return repository.setRule(type, data.businessDays, now.toISOString());
}

export function deleteDeadlineRule(repository, type, now = new Date()) {
  if (!REQUEST_TYPES.includes(type))
    throw new ValidationError({ type: 'Request type is invalid.' });
  if (!repository.deleteRule(type, now.toISOString()))
    throw new HttpError(404, 'Deadline rule not found.');
  return { deleted: true };
}

export function setDeadlineHoliday(repository, { date, body }) {
  if (!isValidDate(date))
    throw new ValidationError({ date: 'Use a real date in YYYY-MM-DD format.' });
  const { valid, errors, data } = validateHoliday(body);
  if (!valid) throw new ValidationError(errors);
  return repository.setHoliday(date, data.name);
}

export function deleteDeadlineHoliday(repository, date) {
  if (!isValidDate(date))
    throw new ValidationError({ date: 'Use a real date in YYYY-MM-DD format.' });
  if (!repository.deleteHoliday(date)) throw new HttpError(404, 'Holiday not found.');
  return { deleted: true };
}
