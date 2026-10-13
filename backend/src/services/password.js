import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const PASSWORD_LIMITS = { min: 12, max: 128 };

// Cost of scrypt: N is the CPU/memory cost (32 MiB of memory with r = 8), r the block size and
// p the parallelism. Tests pass much cheaper values so the suite stays fast.
export const DEFAULT_SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// A hash read from the database is never trusted blindly: absurd costs would freeze the server
const MAX_COST = { N: 2 ** 20, r: 32, p: 8 };

const isPowerOfTwo = (n) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;

function scryptOptions({ N, r, p }) {
  // scrypt needs about 128 * N * r bytes. Twice that leaves room for the overhead.
  return { N, r, p, maxmem: 256 * N * r };
}

// NFKC makes the same password typed on different keyboards or systems hash the same way
function prepare(password) {
  return String(password).normalize('NFKC');
}

/**
 * Hashes a password with Node's built-in scrypt and a random salt.
 * The result is one string, "scrypt$N$r$p$salt$hash", so the cost can change in the future
 * and old hashes still verify.
 */
export async function hashPassword(password, params = DEFAULT_SCRYPT_PARAMS) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(prepare(password), salt, KEY_BYTES, scryptOptions(params));

  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

function parseHash(stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');

  const valid =
    isPowerOfTwo(N) &&
    N <= MAX_COST.N &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= MAX_COST.r &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= MAX_COST.p &&
    salt.length >= 8 &&
    key.length >= 16;

  return valid ? { N, r, p, salt, key } : null;
}

/**
 * Checks a password against a stored hash in constant time.
 * A malformed hash never verifies and never throws.
 */
export async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;

  const { N, r, p, salt, key } = parsed;

  try {
    const candidate = await scryptAsync(
      prepare(password),
      salt,
      key.length,
      scryptOptions({ N, r, p }),
    );
    return timingSafeEqual(candidate, key);
  } catch {
    return false;
  }
}
