import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// The scripts run from backend/, so the .env file at the project root must be loaded explicitly.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 3000,

  // DB_PATH is resolved relative to the project root.
  dbPath: path.resolve(rootDir, process.env.DB_PATH || 'data/pqrs.db'),
};
