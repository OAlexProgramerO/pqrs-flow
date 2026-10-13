import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCRYPT_PARAMS,
  PASSWORD_LIMITS,
  hashPassword,
  verifyPassword,
} from '../src/services/password.js';
import { CHEAP_SCRYPT } from './helpers/admin.js';

test('a hash is a scrypt string that does not contain the password', async () => {
  const hash = await hashPassword('my secret passphrase', CHEAP_SCRYPT);
  const parts = hash.split('$');

  assert.equal(parts.length, 6);
  assert.deepEqual(parts.slice(0, 4), ['scrypt', '16', '1', '1']);
  assert.equal(hash.includes('my secret passphrase'), false);
  assert.equal(Buffer.from(parts[5], 'base64').length, 64);
});

test('the same password gets a different hash every time (random salt)', async () => {
  const [a, b] = await Promise.all([
    hashPassword('same password here', CHEAP_SCRYPT),
    hashPassword('same password here', CHEAP_SCRYPT),
  ]);

  assert.notEqual(a, b);
});

test('verifies the right password and refuses a wrong one', async () => {
  const hash = await hashPassword('right password 123', CHEAP_SCRYPT);

  assert.equal(await verifyPassword('right password 123', hash), true);
  assert.equal(await verifyPassword('right password 124', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('the default cost is the one documented and it verifies', async () => {
  assert.deepEqual(DEFAULT_SCRYPT_PARAMS, { N: 32768, r: 8, p: 1 });

  const hash = await hashPassword('a password with real cost', DEFAULT_SCRYPT_PARAMS);
  assert.equal(await verifyPassword('a password with real cost', hash), true);
  assert.equal(await verifyPassword('a password with real costs', hash), false);
});

test('the same password written in two Unicode forms is the same password', async () => {
  const hash = await hashPassword('caf\u00e9 password!', CHEAP_SCRYPT);

  assert.equal(await verifyPassword('cafe\u0301 password!', hash), true);
});

test('a hash made with another cost still verifies', async () => {
  const hash = await hashPassword('portable password 1', { N: 32, r: 2, p: 1 });

  assert.equal(await verifyPassword('portable password 1', hash), true);
});

test('malformed hashes never verify and never throw', async () => {
  const garbage = [
    undefined,
    null,
    '',
    'plaintext-password',
    'scrypt$16$1$1$only-four',
    'bcrypt$16$1$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==',
    'scrypt$15$1$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==',
    'scrypt$16$0$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==',
    'scrypt$16$1$1$$',
  ];

  for (const hash of garbage) {
    assert.equal(await verifyPassword('anything at all', hash), false, String(hash));
  }
});

test('a stored hash with an absurd cost is refused instead of freezing the server', async () => {
  const salt = Buffer.alloc(16, 1).toString('base64');
  const key = Buffer.alloc(64, 2).toString('base64');
  const started = Date.now();

  assert.equal(await verifyPassword('x', `scrypt$${2 ** 30}$8$1$${salt}$${key}`), false);
  assert.equal(await verifyPassword('x', `scrypt$16$1$9999$${salt}$${key}`), false);
  assert.ok(Date.now() - started < 1000);
});

test('the password limits are 12 to 128 characters', () => {
  assert.deepEqual(PASSWORD_LIMITS, { min: 12, max: 128 });
});
