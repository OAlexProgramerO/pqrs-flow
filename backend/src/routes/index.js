import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/health', healthRoutes);

// PQRS routes will be mounted here (v0.1.0)

export default router;
