import { CASE_NUMBER_PATTERN } from '../../../shared/validation.js';

/**
 * Builds a case number such as PQRS-2026-000001.
 */
export function formatCaseNumber(year, sequence) {
  return `PQRS-${year}-${String(sequence).padStart(6, '0')}`;
}

export function isCaseNumber(value) {
  return typeof value === 'string' && CASE_NUMBER_PATTERN.test(value);
}
