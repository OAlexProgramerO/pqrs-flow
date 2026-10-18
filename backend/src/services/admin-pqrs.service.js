import { HttpError, ValidationError } from '../errors/http-error.js';
import {
  validateCaseNumberParam,
  validateListQuery,
  validateStatusChange,
} from './admin-validation.js';
import { allowedTransitions, canTransition } from './status-workflow.js';
import { deadlineDetails } from './deadlines.js';

export const REQUEST_NOT_FOUND_MESSAGE = 'Request not found.';
export const STATUS_CONFLICT_MESSAGE =
  'The request was changed by someone else. Reload it and try again.';

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toAdminView(row, now) {
  const result = {
    caseNumber: row.caseNumber,
    type: row.type,
    subject: row.subject,
    description: row.description,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    status: row.status,
    createdAt: row.createdAt,
    deadline: deadlineDetails(row, now),
  };
  if (row.assigneeId) {
    result.assignee = { id: row.assigneeId, displayName: row.assigneeName };
  }
  return result;
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

function toListItem(row, now) {
  const result = {
    caseNumber: row.caseNumber,
    type: row.type,
    subject: row.subject,
    requesterName: row.requesterName,
    status: row.status,
    createdAt: row.createdAt,
    deadline: deadlineDetails(row, now),
  };
  if (row.assigneeId) {
    result.assignee = { id: row.assigneeId, displayName: row.assigneeName };
  }
  return result;
}

export function listRequests(repository, query, now = new Date()) {
  const { valid, errors, data } = validateListQuery(query);
  if (!valid) throw new ValidationError(errors);

  const { items, totalItems } = repository.list(data);

  return {
    data: items.map((item) => toListItem(item, now)),
    pagination: {
      page: data.page,
      pageSize: data.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / data.pageSize),
    },
  };
}

export function getSummary(repository, _currentAdminId = undefined) {
  const byStatus = repository.countsByStatus();
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  return { total, byStatus };
}

export function getRequestDetail(repository, caseNumberParam, now = new Date()) {
  const check = validateCaseNumberParam(caseNumberParam);
  if (!check.valid) throw new ValidationError(check.errors);

  const found = repository.findByCaseNumber(check.data.caseNumber);
  if (!found) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  const response = repository.getResponse(found.id);
  const notes = repository.listNotes(found.id);
  const assignment = repository.getAssignment(found.id);

  const result = {
    pqrs: toAdminView(found, now),
    allowedTransitions: allowedTransitions(found.status),
    history: repository.listAudit(found.id).map(toHistoryEntry),
  };
  if (response) {
    result.response = {
      id: response.id,
      text: response.text,
      state: response.state,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      publishedAt: response.publishedAt,
      author: { id: response.authorId, displayName: response.authorName },
    };
  }
  if (notes.length > 0) {
    result.notes = notes.map((note) => ({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      admin: { id: note.adminId, displayName: note.adminName },
    }));
  }
  if (assignment) {
    result.assignment = {
      id: assignment.id,
      assignee: assignment.assigneeId
        ? { id: assignment.assigneeId, displayName: assignment.assigneeName }
        : null,
      assignedBy: { id: assignment.assignedById, displayName: assignment.assignedByName },
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      removedAt: assignment.removedAt,
    };
  }
  return result;
}

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

  return getRequestDetail(repository, updated.caseNumber, now);
}

export function upsertOfficialResponse(
  repository,
  { caseNumber, body, adminId, requestId, now = new Date() },
) {
  const check = validateCaseNumberParam(caseNumber);
  if (!check.valid) throw new ValidationError(check.errors);

  const pqrs = repository.findByCaseNumber(check.data.caseNumber);
  if (!pqrs) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  const text = trimText(body?.text ?? '');
  if (!text) throw new ValidationError({ text: 'Response text is required.' });
  if (text.length > 2000) {
    throw new ValidationError({ text: 'Response text must have at most 2000 characters.' });
  }

  const state = body?.state ?? 'draft';
  if (!['draft', 'published'].includes(state)) {
    throw new ValidationError({ state: 'Response state must be draft or published.' });
  }
  const saved = repository.createResponse({
    pqrsId: pqrs.id,
    adminId,
    text,
    state,
    requestId,
    now,
  });
  if (!saved) throw new Error('The response could not be saved.');

  return getRequestDetail(repository, pqrs.caseNumber, now);
}

export function listNotes(repository, caseNumberParam) {
  const check = validateCaseNumberParam(caseNumberParam);
  if (!check.valid) throw new ValidationError(check.errors);

  const pqrs = repository.findByCaseNumber(check.data.caseNumber);
  if (!pqrs) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  return {
    notes: repository.listNotes(pqrs.id).map((note) => ({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      admin: { id: note.adminId, displayName: note.adminName },
    })),
  };
}

export function createNote(repository, { caseNumber, text, adminId, requestId, now = new Date() }) {
  const check = validateCaseNumberParam(caseNumber);
  if (!check.valid) throw new ValidationError(check.errors);

  const cleaned = trimText(text);
  if (!cleaned) throw new ValidationError({ text: 'Note text is required.' });
  if (cleaned.length > 2000) {
    throw new ValidationError({ text: 'Note text must have at most 2000 characters.' });
  }

  const pqrs = repository.findByCaseNumber(check.data.caseNumber);
  if (!pqrs) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  const note = repository.createNote({
    pqrsId: pqrs.id,
    adminId,
    text: cleaned,
    requestId,
    now,
  });

  return {
    note: {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      admin: { id: note.adminId, displayName: note.adminName },
    },
  };
}

export function changeAssignment(
  repository,
  { caseNumber, body, adminId, requestId, now = new Date() },
) {
  const check = validateCaseNumberParam(caseNumber);
  if (!check.valid) throw new ValidationError(check.errors);

  const pqrs = repository.findByCaseNumber(check.data.caseNumber);
  if (!pqrs) throw new HttpError(404, REQUEST_NOT_FOUND_MESSAGE);

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.hasOwn(body, 'assigneeId') ||
    Object.keys(body).some((key) => key !== 'assigneeId')
  ) {
    throw new ValidationError({ assigneeId: 'Send only an assignee id or null to unassign.' });
  }

  const assigneeId = body.assigneeId;
  if (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId <= 0)) {
    throw new ValidationError({ assigneeId: 'Assignee id must be a positive integer.' });
  }

  if (assigneeId !== null) {
    const target = repository.findAdminById?.(assigneeId);
    if (!target || !target.isActive || !['administrator', 'staff'].includes(target.role)) {
      throw new ValidationError({
        assigneeId: 'The target account is not eligible for assignment.',
      });
    }
  }

  const updated =
    assigneeId === null
      ? repository.clearAssignment({ pqrsId: pqrs.id, adminId, requestId, now })
      : repository.setAssignment({
          pqrsId: pqrs.id,
          assigneeAdminId: assigneeId,
          adminId,
          requestId,
          now,
        });

  return {
    assignment: updated
      ? {
          id: updated.id,
          assignee: updated.assigneeId
            ? { id: updated.assigneeId, displayName: updated.assigneeName }
            : null,
          assignedBy: { id: updated.assignedById, displayName: updated.assignedByName },
        }
      : null,
  };
}
