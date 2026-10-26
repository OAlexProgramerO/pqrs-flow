import { ValidationError } from '../errors/http-error.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createAdminSecurityEventsController({ getAdmin }) {
  return {
    list(req, res, next) {
      const errors = {};
      const allowed = new Set(['eventType', 'from', 'to', 'page', 'pageSize']);
      for (const key of Object.keys(req.query)) {
        if (!allowed.has(key)) errors[key] = 'Unexpected query parameter.';
        else if (typeof req.query[key] !== 'string') errors[key] = 'Send one value.';
      }

      const { eventType, from, to } = req.query;
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      const pageSize = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);

      if (eventType !== undefined && !/^[a-z][a-z0-9_]{1,63}$/.test(eventType)) {
        errors.eventType = 'Choose a valid event type.';
      }
      if (from !== undefined && !isRealDate(from))
        errors.from = 'Use a real date in YYYY-MM-DD format.';
      if (to !== undefined && !isRealDate(to)) errors.to = 'Use a real date in YYYY-MM-DD format.';
      if (from && to && from > to) errors.to = 'End date must not be before start date.';
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
        errors.page = 'Page must be a positive whole number.';
      }
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        errors.pageSize = 'Page size must be between 1 and 100.';
      }
      if (Object.keys(errors).length) return next(new ValidationError(errors));

      try {
        const result = getAdmin().securityEventRepository.listPage({
          eventType,
          from,
          to,
          page,
          pageSize,
        });
        res.set('Cache-Control', 'no-store');
        const items = result.items.map(
          ({ id, eventType, adminId, actorAdminId, requestId, ipAddress, createdAt }) => ({
            id,
            eventType,
            adminId,
            actorAdminId,
            requestId,
            ipAddress,
            createdAt,
          }),
        );
        return res.status(200).json({ items, totalItems: result.totalItems, page, pageSize });
      } catch (error) {
        return next(error);
      }
    },
  };
}
