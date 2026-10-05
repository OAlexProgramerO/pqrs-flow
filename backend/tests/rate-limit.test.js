import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/errors/http-error.js';
import { createRateLimiter } from '../src/middlewares/rate-limit.js';

function makeClock(start = 1_000_000) {
  const clock = { time: start, now: () => clock.time };
  return clock;
}

// Runs the limiter once and reports what it did
function hit(limiter, req = { ip: '10.0.0.1' }) {
  const res = {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  let error;
  let passed = false;

  limiter(req, res, (value) => {
    if (value) error = value;
    else passed = true;
  });

  return { error, passed, headers: res.headers };
}

test('lets requests through until the limit is reached', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: makeClock().now });

  for (let i = 0; i < 3; i += 1) assert.equal(hit(limiter).passed, true, `request ${i + 1}`);
});

test('blocks the request after the limit with a 429 and a Retry-After header', () => {
  const clock = makeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });
  hit(limiter);
  hit(limiter);
  clock.time += 10_000;

  const blocked = hit(limiter);

  assert.equal(blocked.passed, false);
  assert.ok(blocked.error instanceof HttpError);
  assert.equal(blocked.error.status, 429);
  assert.equal(blocked.headers['Retry-After'], '50');
});

test('starts a new window when the old one ends', () => {
  const clock = makeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });

  assert.equal(hit(limiter).passed, true);
  assert.equal(hit(limiter).passed, false);

  clock.time += 60_000;

  assert.equal(hit(limiter).passed, true);
});

test('counts every key on its own', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: makeClock().now });

  assert.equal(hit(limiter, { ip: '10.0.0.1' }).passed, true);
  assert.equal(hit(limiter, { ip: '10.0.0.1' }).passed, false);
  assert.equal(hit(limiter, { ip: '10.0.0.2' }).passed, true);
});

test('uses the key function when there is one', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    key: (req) => `case:${req.body.caseNumber}`,
    now: makeClock().now,
  });

  assert.equal(hit(limiter, { ip: 'a', body: { caseNumber: 'X' } }).passed, true);
  assert.equal(hit(limiter, { ip: 'b', body: { caseNumber: 'X' } }).passed, false);
  assert.equal(hit(limiter, { ip: 'a', body: { caseNumber: 'Y' } }).passed, true);
});

test('keeps blocking inside the window even when requests keep coming', () => {
  const clock = makeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
  hit(limiter);

  for (let i = 0; i < 5; i += 1) {
    clock.time += 1_000;
    assert.equal(hit(limiter).passed, false);
  }
});

test('never keeps more keys than maxKeys', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 3, now: makeClock().now });

  for (const ip of ['a', 'b', 'c', 'd', 'e']) hit(limiter, { ip });

  // "a" was forgotten to make room, so it starts counting from zero again
  assert.equal(hit(limiter, { ip: 'a' }).passed, true);
});
