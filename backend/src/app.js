import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { getDb } from './db/database.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { requestId } from './middlewares/request-id.js';
import { createPqrsRepository } from './repositories/pqrs.repository.js';
import { createRoutes } from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, '../../frontend');
const sharedDir = path.join(__dirname, '../../shared');

morgan.token('id', (req) => req.id);

let defaultRepository;

// The database opens on the first request, so importing the app never touches the disk
function getDefaultRepository() {
  defaultRepository ??= createPqrsRepository(getDb());
  return defaultRepository;
}

/**
 * Builds the Express app. Tests pass their own getRepository to use an in-memory database.
 */
export function createApp({ getRepository = getDefaultRepository } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(':id :method :url :status :response-time ms'));

  // API
  app.use('/api', createRoutes({ getRepository }));
  app.use('/api', notFoundHandler);

  // Static frontend, plus the code shared with the server
  app.use('/shared', express.static(sharedDir));
  app.use(express.static(frontendDir));

  app.use(errorHandler);

  return app;
}

export const app = createApp();
