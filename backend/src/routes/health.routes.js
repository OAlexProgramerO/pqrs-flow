import { createRequire } from 'node:module';
import { Router } from 'express';

const requireModule = createRequire(import.meta.url);
const { version } = requireModule('../../package.json');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pqrs-flow',
    version,
    timestamp: new Date().toISOString(),
  });
});

export default router;
