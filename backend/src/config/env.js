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

/**
 * Reads CORS_ORIGINS, the websites allowed to call the API from a browser.
 * - empty: nobody. The pages are served by this app, so they do not need CORS (default)
 * - a list separated by commas, such as "https://example.com,http://localhost:5500"
 * - "*": any website (only for a public API without cookies)
 * Returns false, "*" or an array of origins without a trailing slash.
 */
export function parseCorsOrigins(value) {
  const origins = String(value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (origins.length === 0) return false;
  if (origins.includes('*')) return '*';
  return origins;
}

// A whole number greater than zero, or the fallback when the value is missing or wrong
function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

// A whole number of zero or more, or the fallback when the value is missing or wrong
function nonNegativeInteger(value, fallback) {
  if (String(value ?? '').trim() === '') return fallback;

  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

/**
 * Reads a true/false setting such as SESSION_COOKIE_SECURE.
 * "true", "1", "yes" and "on" are true; "false", "0", "no" and "off" are false (any case).
 * An empty or unknown value gives the fallback, so a typo can never switch a protection off.
 */
export function parseBoolean(value, fallback) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function emailBoolean(source, name, fallback) {
  const text = String(source[name] ?? '')
    .trim()
    .toLowerCase();
  if (!text) return fallback;
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  throw new Error(`${name} must be a boolean value.`);
}

function emailInteger(source, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(source[name] ?? '').trim();
  if (!text) return fallback;
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return number;
}

export function parseEmailConfig(source = process.env) {
  const enabled = emailBoolean(source, 'EMAIL_ENABLED', false);
  const deliveryTimeoutMs = emailInteger(source, 'EMAIL_DELIVERY_TIMEOUT_MS', 30_000, {
    min: 1_000,
    max: 300_000,
  });
  const processingLeaseMs = emailInteger(
    source,
    'EMAIL_PROCESSING_LEASE_MS',
    Math.max(60_000, deliveryTimeoutMs + 10_000),
    { min: 1_000, max: 600_000 },
  );
  const retryInitialDelayMs = emailInteger(source, 'EMAIL_RETRY_INITIAL_DELAY_MS', 30_000, {
    max: 86_400_000,
  });
  const retryMaxDelayMs = emailInteger(source, 'EMAIL_RETRY_MAX_DELAY_MS', 1_800_000, {
    max: 86_400_000,
  });
  const config = {
    enabled,
    from: String(source.EMAIL_FROM ?? '').trim(),
    smtp: {
      host: String(source.SMTP_HOST ?? '').trim(),
      port: emailInteger(source, 'SMTP_PORT', 587, { max: 65_535 }),
      secure: emailBoolean(source, 'SMTP_SECURE', false),
      user: String(source.SMTP_USER ?? '').trim(),
      pass: String(source.SMTP_PASS ?? ''),
    },
    maxAttempts: emailInteger(source, 'EMAIL_MAX_ATTEMPTS', 5, { max: 20 }),
    retryInitialDelayMs,
    retryMaxDelayMs,
    workerIntervalMs: emailInteger(source, 'EMAIL_WORKER_INTERVAL_MS', 60_000, {
      min: 1_000,
      max: 3_600_000,
    }),
    batchSize: emailInteger(source, 'EMAIL_BATCH_SIZE', 20, { max: 100 }),
    deliveryTimeoutMs,
    processingLeaseMs,
  };

  if (retryMaxDelayMs < retryInitialDelayMs) {
    throw new Error('EMAIL_RETRY_MAX_DELAY_MS must be at least EMAIL_RETRY_INITIAL_DELAY_MS.');
  }
  if (processingLeaseMs <= deliveryTimeoutMs) {
    throw new Error('EMAIL_PROCESSING_LEASE_MS must exceed EMAIL_DELIVERY_TIMEOUT_MS.');
  }
  if (enabled) {
    if (!config.smtp.host || /[\s\r\n]/.test(config.smtp.host)) {
      throw new Error('SMTP_HOST must be configured as a hostname or IP address.');
    }
    if (
      !config.from ||
      /[\r\n]/.test(config.from) ||
      !/^(?:[^<>\s@]+@[^<>\s@]+|[^<>\r\n]*<[^<>\s@]+@[^<>\s@]+>)$/.test(config.from)
    ) {
      throw new Error('EMAIL_FROM must contain a valid sender email address.');
    }
    if (Boolean(config.smtp.user) !== Boolean(config.smtp.pass)) {
      throw new Error('SMTP_USER and SMTP_PASS must either both be set or both be empty.');
    }
  }

  return config;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
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

  // Websites allowed to call the API from a browser. Nobody by default.
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),

  // How long browsers may keep the styles, scripts and images. Pages are always revalidated.
  // Files have no version in their name, so development and tests keep it at zero.
  staticCacheSeconds: nonNegativeInteger(
    process.env.STATIC_CACHE_SECONDS,
    nodeEnv === 'production' ? 3600 : 0,
  ),

  // Staff sessions. A session ends after `idleMs` without use or after `maxAgeMs`, whichever
  // comes first. The cookie is `Secure` (HTTPS only) in production unless it is switched off.
  session: {
    idleMs: positiveInteger(process.env.SESSION_IDLE_MINUTES, 30) * 60 * 1000,
    maxAgeMs: positiveInteger(process.env.SESSION_MAX_HOURS, 8) * 60 * 60 * 1000,
    cookieSecure: parseBoolean(process.env.SESSION_COOKIE_SECURE, nodeEnv === 'production'),
  },

  // Staff login attempts, counted per client address and per account in the same window.
  loginRateLimit: {
    ip: {
      max: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
      windowMs: positiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    },
    account: {
      max: positiveInteger(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX, 5),
      windowMs: positiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    },
  },

  // Uploaded attachments are kept outside the public web root and are intentionally kept
  // separate from the SQLite database. The content is validated before it is stored.
  attachments: {
    storageDir: path.resolve(rootDir, process.env.ATTACHMENTS_STORAGE_DIR || 'data/attachments'),
    maxFileSize: positiveInteger(process.env.ATTACHMENTS_MAX_FILE_SIZE, 5 * 1024 * 1024),
    maxFilesPerRequest: positiveInteger(process.env.ATTACHMENTS_MAX_FILES_PER_REQUEST, 3),
    maxAggregateSize: positiveInteger(process.env.ATTACHMENTS_MAX_AGGREGATE_SIZE, 10 * 1024 * 1024),
    allowedExtensions: (
      process.env.ATTACHMENTS_ALLOWED_EXTENSIONS || '.pdf,.png,.jpg,.jpeg,.txt,.doc,.docx'
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    allowedMimeTypes: (
      process.env.ATTACHMENTS_ALLOWED_MIME_TYPES ||
      'application/pdf,image/png,image/jpeg,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  },

  // Email delivery configuration is validated strictly, while the feature remains opt-in.
  email: parseEmailConfig(),
};
