import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pqrs-flow',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
  });
});

export default router;
