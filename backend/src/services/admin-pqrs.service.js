import { HttpError, ValidationError } from '../errors/http-error.js';
import {
  validateCaseNumberParam,
  validateListQuery,
  validateStatusChange,
} from './admin-validation.js';
import { allowedTransitions, canTransition } from './status-workflow.js';

export const REQUEST_NOT_FOUND_MESSAGE = 'Request not found.';
export const STATUS_CONFLICT_MESSAGE =
  'The request was changed by someone else. Reload it and try again.';

// The staff view of a request, written field by field: a column added to the table later does
// not reach the panel until someone decides it should. The internal id stays on the server.
function toAdminView(row) {
  return {
    caseNumber: row.caseNumber,
    type: row.type,
    subject: row.subject,
    description: row.description,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function toHistoryEntry(row) {
  return {
    id: row.id,
    action: row.action,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    createdAt: row.createdAt,
    admin: { id: row.adminId, displayName: row.adminName },
  };
}

/**
 * A page of requests. Resolves with the items and the numbers the interface needs to paginate.
 */
export function listRequests(repository, query) {
  const { valid, errors, data } = validateListQuery(query);
  if (!valid) throw new ValidationError(errors);

  const { items, totalItems } = repository.list(data);

  return {
    data: items,
    pagination: {
      page: data.page,
      pageSize: data.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / data.pageSize),
    },
  };
}

/**
 * The numbers of the dashboard: all requests and requests per status.
 */
export function getSummary(repository) {
  const byStatus = repository.countsByStatus();
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return { total, byStatus };
}

/**
 * One request with its status history and the statuses it may move to.
 * The interface shows `allowedTransitions` and never decides them itself.
 */
export function getRequestDetail(repository, caseNumberParam) {
  const check = validateCaseNumberParam(caseNumberParam);
  if (!check.valid) throw new ValidationError(check.errors);

  const found = repository.findByCaseNumber(check.data.caseNumber);
  if (!found) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  return {
    pqrs: toAdminView(found),
    allowedTransitions: allowedTransitions(found.status),
    history: repository.listAudit(found.id).map(toHistoryEntry),
  };
}

/**
 * Moves a request to a new status. The status and its audit record are saved together or not
 * at all. Resolves with the updated detail.
 *
 * - 400: the status is not one of the four statuses
 * - 404: no request has that case number
 * - 409: the request changed since the administrator loaded it, or the move is not allowed
 */
export function changeStatus(
  repository,
  { caseNumber, body, adminId, requestId, now = new Date() },
) {
  const check = validateCaseNumberParam(caseNumber);
  if (!check.valid) throw new ValidationError(check.errors);

  const { valid, errors, data } = validateStatusChange(body);
  if (!valid) throw new ValidationError(errors);

  const updated = repository.transitionStatus(check.data.caseNumber, {
    adminId,
    requestId,
    now,
    // Runs inside the database transaction, on the row that is about to change
    decide(current) {
      if (data.expectedStatus && data.expectedStatus !== current.status) {
        throw new HttpError(409, STATUS_CONFLICT_MESSAGE, { currentStatus: current.status });
      }
      if (!canTransition(current.status, data.status)) {
        throw new HttpError(
          409,
          `A request cannot move from "${current.status}" to "${data.status}".`,
          { currentStatus: current.status, allowedTransitions: allowedTransitions(current.status) },
        );
      }
      return data.status;
    },
  });

  if (!updated) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  return getRequestDetail(repository, updated.caseNumber);
}
