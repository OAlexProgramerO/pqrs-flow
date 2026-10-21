import { REQUEST_TYPES } from '../../../shared/validation.js';
import { ValidationError } from '../errors/http-error.js';
import { getDeadlineStatus, isValidDate } from './deadlines.js';
import { STATUSES } from './status-workflow.js';

const MAX_PERIOD_DAYS = 366;
const DEFAULT_PERIOD_DAYS = 30;

function nextDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dateDifferenceInDays(startDate, endDate) {
  return (
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86400000
  );
}

function selectBucket(startDate, endDate) {
  const days = dateDifferenceInDays(startDate, endDate) + 1;
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}

function mondayOf(dateText) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function bucketFor(dateText, bucket) {
  if (bucket === 'month') return dateText.slice(0, 7);
  if (bucket === 'week') return mondayOf(dateText);
  return dateText;
}

function createPeriods(startDate, endDate, bucket) {
  const periods = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (bucket === 'month') start.setUTCDate(1);
  if (bucket === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

  while (start <= end) {
    const dateText = start.toISOString().slice(0, 10);
    periods.push(bucketFor(dateText, bucket));
    if (bucket === 'month') start.setUTCMonth(start.getUTCMonth() + 1);
    else start.setUTCDate(start.getUTCDate() + (bucket === 'week' ? 7 : 1));
  }

  return periods;
}

function validateReportQuery(query, now) {
  const errors = {};
  const allowed = new Set(['from', 'to', 'type', 'status']);

  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) errors[key] = 'Unexpected query parameter.';
    else if (typeof query[key] !== 'string') errors[key] = 'Send one value.';
  }

  const today = now.toISOString().slice(0, 10);
  const endDate = query.to ?? today;
  const defaultEndDate = isValidDate(endDate) ? endDate : today;
  const startDate =
    query.from ??
    new Date(Date.parse(`${defaultEndDate}T00:00:00.000Z`) - (DEFAULT_PERIOD_DAYS - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
  const type = query.type || undefined;
  const status = query.status || undefined;

  if (!isValidDate(startDate)) errors.from = 'Enter a real date in YYYY-MM-DD format.';
  if (!isValidDate(endDate)) errors.to = 'Enter a real date in YYYY-MM-DD format.';
  if (isValidDate(endDate) && endDate > today) errors.to = 'End date cannot be in the future.';
  if (
    isValidDate(startDate) &&
    isValidDate(endDate) &&
    dateDifferenceInDays(startDate, endDate) < 0
  ) {
    errors.from = 'Start date must be on or before the end date.';
  } else if (
    isValidDate(startDate) &&
    isValidDate(endDate) &&
    dateDifferenceInDays(startDate, endDate) >= MAX_PERIOD_DAYS
  ) {
    errors.from = `The selected period cannot exceed ${MAX_PERIOD_DAYS} days.`;
  }
  if (type && !REQUEST_TYPES.includes(type)) errors.type = 'Select a supported request type.';
  if (status && !STATUSES.includes(status)) errors.status = 'Select a supported request status.';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      startDate,
      endDate,
      endExclusive: `${nextDate(defaultEndDate)}T00:00:00.000Z`,
      type,
      status,
      bucket:
        isValidDate(startDate) && isValidDate(endDate) ? selectBucket(startDate, endDate) : 'day',
    },
  };
}

function makeVolume(periods, dailyVolume, bucket) {
  const counts = new Map();
  for (const { date, total } of dailyVolume) {
    const period = bucketFor(date, bucket);
    counts.set(period, (counts.get(period) ?? 0) + total);
  }
  return periods.map((period) => ({ period, count: counts.get(period) ?? 0 }));
}

export function getReport(repository, query, now = new Date()) {
  const validation = validateReportQuery(query, now);
  if (!validation.valid) throw new ValidationError(validation.errors);

  const filters = validation.data;
  const result = repository.getReport(filters);
  const counts = {
    overdue: 0,
    approaching: 0,
    onTime: 0,
    completed: 0,
    unavailable: 0,
  };
  const asOf = `${filters.endDate}T23:59:59.999Z`;

  for (const row of result.deadlines) {
    if (!row.dueDate) {
      counts.unavailable += 1;
      continue;
    }

    const state = getDeadlineStatus(
      {
        dueDate: row.dueDate,
        businessDays: row.businessDays,
        holidaysSnapshot: row.holidaysSnapshot,
        status: row.statusAsOf,
      },
      asOf,
    );
    if (state.status === 'overdue') counts.overdue += 1;
    else if (state.status === 'approaching') counts.approaching += 1;
    else if (state.status === 'completed') counts.completed += 1;
    else counts.onTime += 1;
  }

  const denominator = counts.overdue + counts.approaching + counts.onTime + counts.completed;
  const averageSeconds =
    result.responseTime.averageSeconds === null ? null : Number(result.responseTime.averageSeconds);

  return {
    filters: {
      from: filters.startDate,
      to: filters.endDate,
      type: filters.type ?? null,
      status: filters.status ?? null,
      bucket: filters.bucket,
    },
    totalRequests: result.total,
    volume: makeVolume(
      createPeriods(filters.startDate, filters.endDate, filters.bucket),
      result.dailyVolume,
      filters.bucket,
    ),
    byType: result.byType,
    byStatus: result.byStatus,
    responseTime: {
      sampleSize: result.responseTime.sampleSize,
      averageHours:
        averageSeconds === null ? null : Math.round((averageSeconds / 3600) * 100) / 100,
      definition: 'First official response_published audit event minus request creation time.',
      asOf: filters.endDate,
    },
    deadlines: {
      asOf: filters.endDate,
      numeratorOverdue: counts.overdue,
      denominatorWithDeadline: denominator,
      ratePercent:
        denominator === 0 ? null : Math.round((counts.overdue / denominator) * 1000) / 10,
      counts,
      definition:
        'Overdue requests still open at the end of the selected date, divided by all matching requests with a stored deadline.',
    },
  };
}
