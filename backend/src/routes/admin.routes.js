import multer from 'multer';
import { Router } from 'express';
import { createAdminAuthController } from '../controllers/admin-auth.controller.js';
import { createAdminMfaController } from '../controllers/admin-mfa.controller.js';
import { createAdminSecurityEventsController } from '../controllers/admin-security-events.controller.js';
import { createAdminAccountController } from '../controllers/admin-account.controller.js';
import { createAdminPqrsController } from '../controllers/admin-pqrs.controller.js';
import { createAdminReportsController } from '../controllers/admin-reports.controller.js';
import { createAdminCsvExportController } from '../controllers/admin-csv-export.controller.js';
import { createAttachmentController } from '../controllers/attachments.controller.js';
import { createDeadlinesController } from '../controllers/deadlines.controller.js';
import { createAttachmentRepository } from '../repositories/attachments.repository.js';
import { env } from '../config/env.js';
import { PERMISSIONS } from '../services/permissions.js';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: env.attachments.maxFilesPerRequest,
    fileSize: env.attachments.maxFileSize,
    parts: env.attachments.maxFilesPerRequest + 2,
  },
});

/**
 * Staff API, mounted at /api/admin.
 *
 * Order matters here:
 * 1. every request that changes something must come from this site (sameOriginOnly)
 * 2. login and logout, which handle sessions on their own
 * 3. from that point on, everything needs a live session (requireAdmin), so even an unknown
 *    path answers 401 to an anonymous visitor and nothing is revealed
 * 4. requests that change something also need the CSRF token (requireCsrf)
 */
export function createAdminRoutes({
  getAdmin,
  getNow = () => new Date(),
  adminAuth,
  loginLimiters = [],
  managementLimiters = [],
}) {
  const router = Router();
  const auth = createAdminAuthController({
    getAuthService: () => getAdmin().authService,
    adminAuth,
  });
  const accounts = createAdminAccountController({ getAdmin, adminAuth });
  const mfa = createAdminMfaController({ getAdmin });
  const securityEvents = createAdminSecurityEventsController({ getAdmin });
  const pqrs = createAdminPqrsController({
    getRepository: () => getAdmin().adminPqrsRepository,
    getNow,
  });
  const deadlines = createDeadlinesController({
    getRepository: () => getAdmin().deadlinesRepository,
    getNow,
  });
  const reports = createAdminReportsController({
    getRepository: () => getAdmin().adminReportsRepository,
    getNow,
  });
  const csvExport = createAdminCsvExportController({
    getRepository: () => getAdmin().adminPqrsRepository,
    getNow,
  });
  const attachments = createAttachmentController({
    getRepository: () => createAttachmentRepository(getAdmin().adminPqrsRepository.db),
    getPqrsRepository: () => getAdmin().adminPqrsRepository,
    storageDir: env.attachments.storageDir,
  });

  router.use(adminAuth.sameOriginOnly);

  // The limiters run first, so every attempt counts, even the ones that fail
  router.post('/login', ...loginLimiters, auth.login);
  router.post('/logout', adminAuth.optionalAdmin, adminAuth.requireCsrf, auth.logout);

  router.use(adminAuth.requireAdmin);
  router.use(adminAuth.requireCsrf);

  router.get('/session', auth.session);
  router.post('/password/change', ...managementLimiters, accounts.changePassword);
  router.get('/sessions', accounts.sessions);

  // Accounts flagged by an administrator may only change their password or log out.
  router.use(adminAuth.requirePasswordUpdate);

  router.delete('/sessions/others', ...managementLimiters, accounts.revokeOtherSessions);

  router.get('/mfa', mfa.status);
  router.post('/mfa/setup', ...managementLimiters, mfa.setup);
  router.post('/mfa/enable', ...managementLimiters, mfa.enable);
  router.post('/mfa/disable', ...managementLimiters, mfa.disable);
  router.get(
    '/security-events',
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    securityEvents.list,
  );
  router.delete('/sessions/:sessionId', ...managementLimiters, accounts.revokeSession);

  router.get('/staff', adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE), accounts.list);
  router.post(
    '/staff/search',
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    accounts.list,
  );
  router.post(
    '/staff',
    ...managementLimiters,
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    accounts.create,
  );
  router.patch(
    '/staff/:id',
    ...managementLimiters,
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    accounts.update,
  );
  router.post(
    '/staff/:id/password-reset',
    ...managementLimiters,
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    accounts.resetPassword,
  );
  router.get(
    '/staff/:id/audit',
    adminAuth.requirePermission(PERMISSIONS.STAFF_MANAGE),
    accounts.audit,
  );

  router.use(adminAuth.requirePermission(PERMISSIONS.PQRS_READ));
  router.get(
    '/deadlines',
    adminAuth.requirePermission(PERMISSIONS.DEADLINE_MANAGE),
    deadlines.getConfiguration,
  );
  router.put(
    '/deadlines/rules/:type',
    adminAuth.requirePermission(PERMISSIONS.DEADLINE_MANAGE),
    deadlines.setRule,
  );
  router.delete(
    '/deadlines/rules/:type',
    adminAuth.requirePermission(PERMISSIONS.DEADLINE_MANAGE),
    deadlines.deleteRule,
  );
  router.put(
    '/deadlines/holidays/:date',
    adminAuth.requirePermission(PERMISSIONS.DEADLINE_MANAGE),
    deadlines.setHoliday,
  );
  router.delete(
    '/deadlines/holidays/:date',
    adminAuth.requirePermission(PERMISSIONS.DEADLINE_MANAGE),
    deadlines.deleteHoliday,
  );
  router.get('/stats', pqrs.summary);
  router.get('/reports', reports.get);
  router.get('/pqrs/export.csv', csvExport.get);
  router.get('/pqrs', pqrs.list);
  router.get('/pqrs/:caseNumber', pqrs.detail);
  router.get(
    '/pqrs/:caseNumber/attachments',
    adminAuth.requirePermission(PERMISSIONS.PQRS_READ),
    attachments.list,
  );
  router.post(
    '/pqrs/:caseNumber/attachments',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    attachmentUpload.array('files', env.attachments.maxFilesPerRequest),
    attachments.upload,
  );
  router.get(
    '/pqrs/:caseNumber/attachments/:attachmentId/download',
    adminAuth.requirePermission(PERMISSIONS.PQRS_READ),
    attachments.download,
  );
  router.delete(
    '/pqrs/:caseNumber/attachments/:attachmentId',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    attachments.delete,
  );
  router.get('/pqrs/:caseNumber/reply', pqrs.getReply);
  router.post(
    '/pqrs/:caseNumber/reply',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.saveReply,
  );
  router.patch(
    '/pqrs/:caseNumber/reply',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.saveReply,
  );
  router.get('/pqrs/:caseNumber/notes', pqrs.listNotes);
  router.post(
    '/pqrs/:caseNumber/notes',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.createNote,
  );
  router.patch(
    '/pqrs/:caseNumber/assignment',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.changeAssignment,
  );
  router.patch(
    '/pqrs/:caseNumber/status',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.changeStatus,
  );

  return router;
}
