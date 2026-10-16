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
  managementLimiters,
}) {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/pqrs', createPqrsRoutes({ getRepository, lookupLimiters, submitLimiters }));
  router.use(
    '/admin',
    createAdminRoutes({
      getAdmin,
      getNow: () => getAdmin().now(),
      adminAuth,
      loginLimiters,
      managementLimiters,
    }),
  );

  return router;
}
