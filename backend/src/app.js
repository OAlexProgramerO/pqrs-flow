import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { getDb } from './db/database.js';
import { compression } from './middlewares/compression.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { createRateLimiter } from './middlewares/rate-limit.js';
import { requestId } from './middlewares/request-id.js';
import { createPqrsRepository } from './repositories/pqrs.repository.js';
import { createRoutes } from './routes/index.js';
import { normalizeCaseNumber } from '../../shared/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, '../../frontend');
const sharedDir = path.join(__dirname, '../../shared');

morgan.token('id', (req) => req.id);

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Attempts to check a request are limited per client and per case number. The second limit
// stops someone from guessing the email of one case from many addresses.
const defaultLookupLimits = {
  ip: { windowMs: FIFTEEN_MINUTES, max: 30 },
  caseNumber: { windowMs: FIFTEEN_MINUTES, max: 8 },
};

// New requests are limited per client address. The values come from the environment.
const defaultSubmitLimit = env.submitRateLimit;

let defaultRepository;

// The database opens on the first request, so importing the app never touches the disk
function getDefaultRepository() {
  defaultRepository ??= createPqrsRepository(getDb());
  return defaultRepository;
}

/**
 * Builds the Express app. Tests pass their own getRepository to use an in-memory database,
 * their own lookupLimits and submitLimit to try the rate limits quickly, and trustProxy to
 * try the proxy settings.
 */
export function createApp({
  getRepository = getDefaultRepository,
  lookupLimits = defaultLookupLimits,
  submitLimit = defaultSubmitLimit,
  trustProxy = env.trustProxy,
} = {}) {
  const app = express();
  const submitLimiters = [createRateLimiter({ ...submitLimit, key: (req) => `ip:${req.ip}` })];
  const lookupLimiters = [
    createRateLimiter({ ...lookupLimits.ip, key: (req) => `ip:${req.ip}` }),
    createRateLimiter({
      ...lookupLimits.caseNumber,
      key: (req) => `case:${normalizeCaseNumber(req.body?.caseNumber).slice(0, 40)}`,
    }),
  ];

  // Behind a reverse proxy, req.ip must be the visitor and not the proxy, or every visitor
  // would share one rate limit. Express only believes X-Forwarded-For when this is set.
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(':id :method :url :status :response-time ms'));

  // API
  app.use('/api', createRoutes({ getRepository, lookupLimiters, submitLimiters }));
  app.use('/api', notFoundHandler);

  // Static frontend, plus the code shared with the server
  app.use('/shared', express.static(sharedDir));
  app.use(express.static(frontendDir));

  app.use(errorHandler);

  return app;
}

export const app = createApp();
