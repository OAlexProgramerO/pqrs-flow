import { Router } from 'express';
import { createAdminAuthController } from '../controllers/admin-auth.controller.js';
import { createAdminPqrsController } from '../controllers/admin-pqrs.controller.js';

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
  getAuthService,
  getAdminPqrsRepository,
  getNow = () => new Date(),
  adminAuth,
  loginLimiters = [],
}) {
  const router = Router();
  const auth = createAdminAuthController({ getAuthService, adminAuth });
  const pqrs = createAdminPqrsController({ getRepository: getAdminPqrsRepository, getNow });

  router.use(adminAuth.sameOriginOnly);

  // The limiters run first, so every attempt counts, even the ones that fail
  router.post('/login', ...loginLimiters, auth.login);
  router.post('/logout', adminAuth.optionalAdmin, adminAuth.requireCsrf, auth.logout);

  router.use(adminAuth.requireAdmin);
  router.use(adminAuth.requireCsrf);

  router.get('/session', auth.session);
  router.get('/stats', pqrs.summary);
  router.get('/pqrs', pqrs.list);
  router.get('/pqrs/:caseNumber', pqrs.detail);
  router.patch('/pqrs/:caseNumber/status', pqrs.changeStatus);

  return router;
}
