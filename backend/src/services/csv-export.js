import { CASE_NUMBER_PATTERN, REQUEST_TYPES } from '../../../shared/validation.js';
import { STATUSES } from './status-workflow.js';

export const CSV_EXPORT_COLUMNS = Object.freeze([
  'Case number',
  'Request type',
  'Subject',
  'Current status',
  'Submitted at (UTC)',
]);

export const CSV_EXPORT_MAX_ROWS = 5000;
const FORMULA_PREFIX = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u;

function protectSpreadsheetText(value) {
  const text = typeof value === 'string' ? value : '';
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function quoteCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function formatTimestamp(value) {
  if (typeof value !== 'string') return '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function rowCells(row) {
  const record = row && typeof row === 'object' ? row : {};
  return [
    typeof record.caseNumber === 'string' && CASE_NUMBER_PATTERN.test(record.caseNumber)
      ? record.caseNumber
      : '',
    REQUEST_TYPES.includes(record.type) ? record.type : '',
    protectSpreadsheetText(record.subject),
    STATUSES.includes(record.status) ? record.status : '',
    formatTimestamp(record.createdAt),
  ];
}

export function serializeCsv(rows) {
  const lines = [
    CSV_EXPORT_COLUMNS.map(quoteCell).join(','),
    ...rows.map((row) => rowCells(row).map(quoteCell).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
