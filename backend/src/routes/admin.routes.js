import { Router } from 'express';
import { createAdminAuthController } from '../controllers/admin-auth.controller.js';
import { createAdminAccountController } from '../controllers/admin-account.controller.js';
import { createAdminPqrsController } from '../controllers/admin-pqrs.controller.js';
import { PERMISSIONS } from '../services/permissions.js';

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
  const pqrs = createAdminPqrsController({
    getRepository: () => getAdmin().adminPqrsRepository,
    getNow,
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
  router.get('/stats', pqrs.summary);
  router.get('/pqrs', pqrs.list);
  router.get('/pqrs/:caseNumber', pqrs.detail);
  router.patch(
    '/pqrs/:caseNumber/status',
    adminAuth.requirePermission(PERMISSIONS.PQRS_UPDATE),
    pqrs.changeStatus,
  );

  return router;
}
