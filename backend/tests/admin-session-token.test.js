import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCsrfToken,
  generateToken,
  hashToken,
  isWellFormedToken,
  safeEqual,
} from '../src/services/session-token.js';

test('tokens are 256 bits of base64url and never repeat', () => {
  const tokens = new Set(Array.from({ length: 200 }, generateToken));

  assert.equal(tokens.size, 200);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(isWellFormedToken(token), true);
  }
});

test('only well formed tokens pass the shape check', () => {
  const good = generateToken();

  assert.equal(isWellFormedToken(good), true);
  for (const bad of [
    undefined,
    null,
    42,
    '',
    'short',
    `${good}x`,
    good.slice(1),
    `${good.slice(1)}!`,
    ['a'],
  ]) {
    assert.equal(isWellFormedToken(bad), false, String(bad));
  }
});

test('the hash of a token is stable, hex and does not contain the token', () => {
  const token = generateToken();
  const hash = hashToken(token);

  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashToken(token));
  assert.notEqual(hash, hashToken(generateToken()));
  assert.equal(hash.includes(token), false);
});

test('the CSRF token depends on the session token and on nothing else', () => {
  const a = generateToken();
  const b = generateToken();

  assert.equal(deriveCsrfToken(a), deriveCsrfToken(a));
  assert.notEqual(deriveCsrfToken(a), deriveCsrfToken(b));
  assert.notEqual(deriveCsrfToken(a), a);
  assert.notEqual(deriveCsrfToken(a), hashToken(a));
});

test('safeEqual compares secrets of any length without throwing', () => {
  assert.equal(safeEqual('secret', 'secret'), true);
  assert.equal(safeEqual('secret', 'secreT'), false);
  assert.equal(safeEqual('secret', 'secret-and-more'), false);
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual(undefined, 'secret'), false);
  assert.equal(safeEqual('secret', null), false);
  assert.equal(safeEqual(1, 1), false);
});
