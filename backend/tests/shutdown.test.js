import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createShutdown, installShutdownHandlers, SHUTDOWN_TIMEOUT_MS } from '../src/shutdown.js';

// A stand-in for http.Server: close() answers when the test says so
function fakeServer({ closeError, hang = false } = {}) {
  const calls = [];
  return {
    calls,
    close(callback) {
      calls.push('close');
      if (!hang) queueMicrotask(() => callback(closeError));
    },
    closeIdleConnections: () => calls.push('closeIdleConnections'),
    closeAllConnections: () => calls.push('closeAllConnections'),
  };
}

function setup({ server = fakeServer(), closeDatabase, timeoutMs } = {}) {
  const events = [];
  const timers = [];
  const logs = { log: [], error: [] };
  const exits = [];
  const shutdown = createShutdown({
    server,
    closeDatabase:
      closeDatabase ??
      (() => {
        events.push('db');
      }),
    timeoutMs,
    log: { log: (m) => logs.log.push(m), error: (...a) => logs.error.push(a) },
    exit: (code) => exits.push(code),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
  });
  return { shutdown, server, events, timers, logs, exits };
}

test('stops the server, then closes the database, and resolves 0', async () => {
  const { shutdown, server, events, exits } = setup();

  assert.equal(await shutdown('SIGTERM'), 0);
  assert.deepEqual(server.calls, ['close', 'closeIdleConnections']);
  assert.deepEqual(events, ['db']);
  assert.deepEqual(exits, []);
});

test('the database is closed only after the server has finished closing', async () => {
  const order = [];
  const server = {
    close(callback) {
      order.push('server closing');
      setTimeout(() => {
        order.push('server closed');
        callback();
      }, 20);
    },
  };
  const { shutdown } = setup({ server, closeDatabase: () => order.push('db closed') });

  await shutdown('SIGINT');
  assert.deepEqual(order, ['server closing', 'server closed', 'db closed']);
});

test('repeated calls share one shutdown: no second close of the server or the database', async () => {
  const { shutdown, server, events } = setup();

  const results = await Promise.all([shutdown('SIGINT'), shutdown('SIGTERM'), shutdown('SIGINT')]);
  assert.deepEqual(results, [0, 0, 0]);
  assert.equal(await shutdown('SIGTERM'), 0);
  assert.equal(server.calls.filter((c) => c === 'close').length, 1);
  assert.deepEqual(events, ['db']);
});

test('the timeout is bounded, uses the default and is cleared after a clean shutdown', async () => {
  const { shutdown, timers } = setup();
  await shutdown('SIGTERM');

  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, SHUTDOWN_TIMEOUT_MS);
  assert.ok(SHUTDOWN_TIMEOUT_MS > 0 && SHUTDOWN_TIMEOUT_MS <= 30_000);
  assert.equal(timers[0].cleared, true);
});

test('when requests never finish, the timeout closes the database and forces exit(1)', async () => {
  const { shutdown, server, events, timers, exits, logs } = setup({
    server: fakeServer({ hang: true }),
    timeoutMs: 50,
  });

  const pending = shutdown('SIGTERM');
  assert.equal(timers[0].ms, 50);
  timers[0].fn();

  assert.equal(await pending, 1);
  assert.deepEqual(exits, [1]);
  assert.deepEqual(events, ['db']);
  assert.ok(server.calls.includes('closeAllConnections'));
  assert.match(String(logs.error[0][0]), /longer than 50 ms/);
});

test('a late server close after the forced stop does not close the database again', async () => {
  let release;
  const server = {
    close(callback) {
      release = callback;
    },
  };
  const { shutdown, events, timers, exits } = setup({ server });

  const pending = shutdown('SIGTERM');
  timers[0].fn();
  release();

  assert.equal(await pending, 1);
  assert.deepEqual(events, ['db']);
  assert.deepEqual(exits, [1]);
});

test('an error while closing the server is reported, the database is still closed', async () => {
  const { shutdown, events, logs } = setup({
    server: fakeServer({ closeError: new Error('boom') }),
  });

  assert.equal(await shutdown('SIGTERM'), 1);
  assert.deepEqual(events, ['db']);
  assert.match(logs.error[0][0], /HTTP server/);
});

test('a server that is not running is not an error', async () => {
  const closeError = Object.assign(new Error('not running'), { code: 'ERR_SERVER_NOT_RUNNING' });
  const { shutdown, events } = setup({ server: fakeServer({ closeError }) });

  assert.equal(await shutdown('SIGTERM'), 0);
  assert.deepEqual(events, ['db']);
});

test('an error while closing the database is reported and gives exit code 1', async () => {
  const { shutdown, logs, timers } = setup({
    closeDatabase: () => {
      throw new Error('disk');
    },
  });

  assert.equal(await shutdown('SIGTERM'), 1);
  assert.match(logs.error[0][0], /database/);
  assert.equal(timers[0].cleared, true);
});

test('installShutdownHandlers listens to SIGINT and SIGTERM and sets the exit code', async () => {
  const proc = new EventEmitter();
  const received = [];
  installShutdownHandlers(async (signal) => {
    received.push(signal);
    return 0;
  }, proc);

  assert.deepEqual(proc.eventNames().sort(), ['SIGINT', 'SIGTERM']);
  proc.emit('SIGINT');
  proc.emit('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(received, ['SIGINT', 'SIGTERM']);
  assert.equal(proc.exitCode, 0);
});
