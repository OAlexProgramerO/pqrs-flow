import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as otplib from 'otplib';

const { authenticator } = otplib;

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function getMfaEncryptionKey(rawKey) {
  const text = String(rawKey ?? '').trim();
  const fallback =
    process.env.SESSION_COOKIE_SECRET || process.env.SESSION_SECRET || 'pqrs-flow-mfa-dev-key';
  return createHash('sha256')
    .update(text || fallback)
    .digest();
}

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function createTotpUri(email, secret, issuer = 'PQRS Flow') {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(code, secret, { window = 1 } = {}) {
  if (typeof code !== 'string' || !code.trim() || typeof secret !== 'string' || !secret.trim()) {
    return false;
  }

  try {
    return authenticator.verify({
      token: code.trim(),
      secret,
      window,
    });
  } catch {
    return false;
  }
}

export function encryptMfaSecret(secret, key = process.env.MFA_ENCRYPTION_KEY) {
  const plaintext = String(secret ?? '');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER_ALGORITHM, getMfaEncryptionKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptMfaSecret(value, key = process.env.MFA_ENCRYPTION_KEY) {
  const encoded = String(value ?? '');
  if (!encoded) return null;

  try {
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length <= IV_BYTES + AUTH_TAG_BYTES) return null;

    const iv = buffer.subarray(0, IV_BYTES);
    const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const encrypted = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);
    const decipher = createDecipheriv(CIPHER_ALGORITHM, getMfaEncryptionKey(key), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
