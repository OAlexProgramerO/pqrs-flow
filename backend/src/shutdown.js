/**
 * Graceful shutdown of the HTTP server and the SQLite connection.
 *
 * - server: the http.Server returned by app.listen()
 * - closeDatabase: closes the shared SQLite connection (closeDb of db/database.js)
 * - timeoutMs: the longest the whole shutdown may take before the process is forced to stop
 * - log, exit, setTimer, clearTimer: replaced in tests
 *
 * The returned function is idempotent: every call after the first returns the same promise and
 * does nothing else. It resolves with the exit code (0 on a clean shutdown, 1 on any problem).
 */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export function createShutdown({
  server,
  closeDatabase,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  log = console,
  exit = (code) => process.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let running;

  // Stops accepting connections and waits for the requests that are still running
  function closeServer() {
    return new Promise((resolve, reject) => {
      server.close((error) => {
        // A server that is not listening any more has nothing left to close
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      });
      // Keep-alive connections without a request would hold the server open for a minute
      server.closeIdleConnections?.();
    });
  }

  async function run(signal) {
    log.log(`Received ${signal}, shutting down...`);

    let finished = false;
    let code;
    let forceStop;
    const forced = new Promise((resolve) => {
      forceStop = resolve;
    });

    const timer = setTimer(() => {
      if (finished) return;
      finished = true;
      log.error(`Shutdown took longer than ${timeoutMs} ms, forcing the process to stop.`);
      server.closeAllConnections?.();
      try {
        closeDatabase();
      } catch (error) {
        log.error('Could not close the database:', error);
      }
      exit(1);
      // Only reached when exit is replaced (tests): the caller must not wait for ever
      forceStop(1);
    }, timeoutMs);
    // The timer must never be the only thing keeping the process alive
    timer?.unref?.();

    const closing = closeServer().then(
      () => 0,
      (error) => {
        log.error('Could not close the HTTP server:', error);
        return 1;
      },
    );
    code = await Promise.race([closing, forced]);

    // After a forced stop the timer already closed the database and ended the process
    if (finished) return 1;

    try {
      closeDatabase();
    } catch (error) {
      code = 1;
      log.error('Could not close the database:', error);
    }

    finished = true;
    clearTimer(timer);
    log.log('Shutdown complete.');
    return code;
  }

  return function shutdown(signal = 'shutdown') {
    running ??= run(signal);
    return running;
  };
}

/**
 * Connects the shutdown to SIGINT and SIGTERM. The exit code is set, not forced: the process
 * ends by itself once the server and the database are closed. Repeated signals are absorbed by
 * the idempotent shutdown.
 */
export function installShutdownHandlers(shutdown, proc = process, signals = ['SIGINT', 'SIGTERM']) {
  for (const signal of signals) {
    proc.on(signal, () => {
      shutdown(signal).then((code) => {
        proc.exitCode = code;
      });
    });
  }
}
