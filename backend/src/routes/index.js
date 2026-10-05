import { Router } from 'express';
import healthRoutes from './health.routes.js';
import { createPqrsRoutes } from './pqrs.routes.js';

export function createRoutes({ getRepository, lookupLimiters }) {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/pqrs', createPqrsRoutes({ getRepository, lookupLimiters }));

  return router;
}
