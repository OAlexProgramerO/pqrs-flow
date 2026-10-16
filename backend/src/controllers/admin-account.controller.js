import { AccountConflictError } from '../errors/account-conflict.js';
import { HttpError, ValidationError } from '../errors/http-error.js';
import { AccountError } from '../services/admin-accounts.js';
import {
  validateAccountIdParam,
  validateNewAdmin,
  validatePasswordChange,
  validatePasswordReset,
  validateStaffListQuery,
  validateStaffUpdate,
} from '../services/admin-validation.js';

function forwardAccountError(error, next) {
  if (error instanceof AccountConflictError) {
    return next(new HttpError(409, error.message));
  }
  if (error instanceof AccountError) {
    if (error.details) return next(new ValidationError(error.details));
    const duplicate = error.message.includes('already exists');
    return next(new HttpError(duplicate ? 409 : 400, error.message));
  }
  return next(error);
}

function accountId(value, next) {
  const result = validateAccountIdParam(value);
  if (!result.valid) {
    next(new ValidationError(result.errors));
    return null;
  }
  return result.data.id;
}

function pagination(query) {
  const errors = {};
  for (const key of Object.keys(query)) {
    if (!['page', 'pageSize'].includes(key)) errors[key] = 'Unexpected query parameter.';
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    (query.page !== undefined && typeof query.page !== 'string') ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000
  ) {
    errors.page = 'Page must be a positive whole number.';
  }
  if (
    (query.pageSize !== undefined && typeof query.pageSize !== 'string') ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    errors.pageSize = 'Page size must be a whole number from 1 to 100.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { page, pageSize };
}

export function createAdminAccountController({ getAdmin, adminAuth }) {
  function getService() {
    return getAdmin().accountService;
  }

  return {
    list(req, res, next) {
      const validation = validateStaffListQuery(req.method === 'POST' ? req.body : req.query);
      if (!validation.valid) return next(new ValidationError(validation.errors));
      if (req.method === 'GET' && Object.hasOwn(req.query, 'q')) {
        return next(
          new ValidationError({ q: 'Use POST /api/admin/staff/search for private searches.' }),
        );
      }
      try {
        res.status(200).json(getService().listPage(validation.data));
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { confirmPassword, ...fields } = body;
      const validation = validateNewAdmin({ ...fields, role: fields.role ?? 'staff' });
      if (!validation.valid) return next(new ValidationError(validation.errors));
      if (validation.data.password !== confirmPassword) {
        return next(new ValidationError({ confirmPassword: 'The passwords do not match.' }));
      }
      try {
        const account = await getService().create(validation.data, {
          actorAdminId: req.admin.id,
          requestId: req.id,
          mustChangePassword: true,
        });
        return res.status(201).json({ account });
      } catch (error) {
        return forwardAccountError(error, next);
      }
    },

    update(req, res, next) {
      const id = accountId(req.params.id, next);
      if (id === null) return;
      const validation = validateStaffUpdate(req.body);
      if (!validation.valid) return next(new ValidationError(validation.errors));
      try {
        const account = getService().update(id, validation.data, {
          actorAdminId: req.admin.id,
          requestId: req.id,
        });
        if (!account) return next(new HttpError(404, 'Staff account not found.'));
        return res.status(200).json({ account });
      } catch (error) {
        return forwardAccountError(error, next);
      }
    },

    async resetPassword(req, res, next) {
      const id = accountId(req.params.id, next);
      if (id === null) return;
      const account = getAdmin().adminRepository.findById(id);
      if (!account) return next(new HttpError(404, 'Staff account not found.'));
      const validation = validatePasswordReset(req.body, { email: account.email });
      if (!validation.valid) return next(new ValidationError(validation.errors));
      try {
        const updated = await getService().resetPasswordForAccount(id, validation.data.password, {
          actorAdminId: req.admin.id,
          requestId: req.id,
        });
        return res.status(200).json({ account: updated, mustSetNewPassword: true });
      } catch (error) {
        return forwardAccountError(error, next);
      }
    },

    audit(req, res, next) {
      const id = accountId(req.params.id, next);
      if (id === null) return;
      try {
        if (!getAdmin().adminRepository.findById(id)) {
          return next(new HttpError(404, 'Staff account not found.'));
        }
        const page = pagination(req.query);
        const result = getService().listAudit(id, page);
        const items = result.items.map((item) => ({
          ...item,
          metadata: JSON.parse(item.metadata),
        }));
        return res.status(200).json({
          items,
          totalItems: result.totalItems,
          ...page,
        });
      } catch (error) {
        return next(error);
      }
    },

    async changePassword(req, res, next) {
      const validation = validatePasswordChange(req.body, { email: req.admin.email });
      if (!validation.valid) return next(new ValidationError(validation.errors));
      try {
        await getService().changePassword(
          {
            adminId: req.admin.id,
            sessionId: req.sessionId,
            ...validation.data,
          },
          { requestId: req.id },
        );
        return res.status(204).end();
      } catch (error) {
        return forwardAccountError(error, next);
      }
    },

    sessions(req, res, next) {
      try {
        const sessions = getService()
          .listSessions(req.admin.id)
          .map((session) => ({
            ...session,
            current: session.sessionId === req.sessionId,
          }));
        return res.status(200).json({ sessions });
      } catch (error) {
        return next(error);
      }
    },

    revokeSession(req, res, next) {
      const id = accountId(req.params.sessionId, next);
      if (id === null) return;
      try {
        const removed = getService().revokeSession(id, req.admin.id, {
          requestId: req.id,
        });
        if (!removed) return next(new HttpError(404, 'Session not found.'));
        if (id === req.sessionId) adminAuth.clearSessionCookie(res);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },

    revokeOtherSessions(req, res, next) {
      try {
        const revoked = getService().revokeOtherSessions(req.admin.id, req.sessionId, {
          requestId: req.id,
        });
        return res.status(200).json({ revoked });
      } catch (error) {
        return next(error);
      }
    },
  };
}
