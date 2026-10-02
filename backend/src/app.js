import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, '../../frontend');

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// API
app.use('/api', routes);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Static frontend
app.use(express.static(frontendDir));

// Error handling
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
