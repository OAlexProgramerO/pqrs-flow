import { Router } from 'express';
import { createPqrsController } from '../controllers/pqrs.controller.js';

export function createPqrsRoutes({ getRepository, lookupLimiters = [], submitLimiters = [] }) {
  const router = Router();
  const controller = createPqrsController({ getRepository });

  // The limiters run first, so every attempt counts, even the ones that fail
  router.post('/', ...submitLimiters, controller.create);
  router.post('/lookup', ...lookupLimiters, controller.lookup);

  return router;
}
