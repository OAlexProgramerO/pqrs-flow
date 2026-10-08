import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// The scripts run from backend/, so the .env file at the project root must be loaded explicitly.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

/**
 * Reads TRUST_PROXY, which tells Express how many proxies stand between the internet and the app.
 * - empty or "false": no proxy, the client address is the one of the connection (default)
 * - a number such as "1": trust that many proxies, counted from the app
 * - "true": trust every address in X-Forwarded-For (anyone can fake it, so avoid it)
 * - any other text, such as "loopback" or "10.0.0.0/8": passed to Express as it is
 */
export function parseTrustProxy(value) {
  const text = String(value ?? '').trim();

  if (text === '' || text.toLowerCase() === 'false') return false;
  if (text.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(text)) return Number(text) > 0 ? Number(text) : false;

  return text;
}

// A whole number greater than zero, or the fallback when the value is missing or wrong
function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 3000,

  // DB_PATH is resolved relative to the project root.
  dbPath: path.resolve(rootDir, process.env.DB_PATH || 'data/pqrs.db'),

  // Behind a reverse proxy the client address comes from X-Forwarded-For. Off by default.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // Limit for new requests (POST /api/pqrs), counted per client address.
  submitRateLimit: {
    max: positiveInteger(process.env.SUBMIT_RATE_LIMIT_MAX, 10),
    windowMs: positiveInteger(process.env.SUBMIT_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
  },
};
