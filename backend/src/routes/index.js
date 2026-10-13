import { Router } from 'express';
import healthRoutes from './health.routes.js';
import { createAdminRoutes } from './admin.routes.js';
import { createPqrsRoutes } from './pqrs.routes.js';

export function createRoutes({
  getRepository,
  lookupLimiters,
  submitLimiters,
  getAdmin,
  adminAuth,
  loginLimiters,
}) {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/pqrs', createPqrsRoutes({ getRepository, lookupLimiters, submitLimiters }));
  router.use(
    '/admin',
    createAdminRoutes({
      getAuthService: () => getAdmin().authService,
      getAdminPqrsRepository: () => getAdmin().adminPqrsRepository,
      getNow: () => getAdmin().now(),
      adminAuth,
      loginLimiters,
    }),
  );

  return router;
}
