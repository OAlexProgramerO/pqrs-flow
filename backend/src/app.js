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

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * Cache rules of the static files. Pages are always checked again with the server (the ETag
 * makes that cheap). Styles, scripts and images may be kept for `seconds`; with zero they are
 * checked again too, so a change shows up at once.
 */
export function setStaticCacheHeaders(seconds) {
  return (res, filePath) => {
    const keep = seconds > 0 && !filePath.endsWith('.html');
    res.setHeader('Cache-Control', keep ? `public, max-age=${seconds}` : 'no-cache');
  };
}

let defaultRepository;

// The database opens on the first request, so importing the app never touches the disk
function getDefaultRepository() {
  defaultRepository ??= createPqrsRepository(getDb());
  return defaultRepository;
}

/**
 * Builds the Express app. Tests pass their own getRepository to use an in-memory database,
 * their own lookupLimits and submitLimit to try the rate limits quickly, and trustProxy,
 * corsOrigins and staticCacheSeconds to try the proxy, CORS and cache settings.
 */
export function createApp({
  getRepository = getDefaultRepository,
  lookupLimits = defaultLookupLimits,
  submitLimit = defaultSubmitLimit,
  trustProxy = env.trustProxy,
  corsOrigins = env.corsOrigins,
  staticCacheSeconds = env.staticCacheSeconds,
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
  // The pages come from this same server, so CORS is only switched on for the origins listed
  if (corsOrigins) app.use(cors({ origin: corsOrigins }));
  app.use(compression());
  // Answers of the API are never kept by a browser or a proxy
  app.use('/api', noStore);
  app.use(express.json({ limit: '16kb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(':id :method :url :status :response-time ms'));

  // API
  app.use('/api', createRoutes({ getRepository, lookupLimiters, submitLimiters }));
  app.use('/api', notFoundHandler);

  // Static frontend, plus the code shared with the server
  const staticOptions = { setHeaders: setStaticCacheHeaders(staticCacheSeconds) };
  app.use('/shared', express.static(sharedDir, staticOptions));
  app.use(express.static(frontendDir, staticOptions));

  app.use(errorHandler);

  return app;
}

export const app = createApp();
