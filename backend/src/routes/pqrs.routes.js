import { Router } from 'express';
import { createPqrsController } from '../controllers/pqrs.controller.js';

export function createPqrsRoutes({ getRepository, lookupLimiters = [] }) {
  const router = Router();
  const controller = createPqrsController({ getRepository });

  router.post('/', controller.create);
  // The limiters run first, so every attempt counts, even the ones that fail
  router.post('/lookup', ...lookupLimiters, controller.lookup);

  return router;
}
