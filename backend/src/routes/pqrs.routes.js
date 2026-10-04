import { Router } from 'express';
import { createPqrsController } from '../controllers/pqrs.controller.js';

export function createPqrsRoutes({ getRepository }) {
  const router = Router();
  const controller = createPqrsController({ getRepository });

  router.post('/', controller.create);

  return router;
}
