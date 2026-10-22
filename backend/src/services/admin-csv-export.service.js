import { HttpError, ValidationError } from '../errors/http-error.js';
import { CSV_EXPORT_MAX_ROWS, serializeCsv } from './csv-export.js';
import { validateReportQuery } from './admin-reports.service.js';

export function exportRequests(repository, query, now = new Date()) {
  const validation = validateReportQuery(query, now);
  if (!validation.valid) throw new ValidationError(validation.errors);

  const filters = validation.data;
  const rows = repository.listForCsvExport({
    startAt: `${filters.startDate}T00:00:00.000Z`,
    endExclusive: filters.endExclusive,
    type: filters.type,
    status: filters.status,
  });

  if (rows.length > CSV_EXPORT_MAX_ROWS) {
    throw new HttpError(
      413,
      `Export exceeds the ${CSV_EXPORT_MAX_ROWS.toLocaleString('en-US')}-record limit. Narrow the filters and try again.`,
    );
  }

  return serializeCsv(rows);
}
