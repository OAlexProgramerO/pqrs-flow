import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const serverFile = fileURLToPath(new URL('../src/server.js', import.meta.url));

// Windows cannot deliver SIGINT or SIGTERM to a child process: kill() ends it at once, without
// running any handler. There the behavior is covered by shutdown.test.js, and CI runs this file
// on Linux.
const skip = process.platform === 'win32' ? 'POSIX signals are not available on Windows' : false;

async function freePort() {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitFor(check, what) {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`the real server closes the HTTP port and the database on ${signal}`, { skip }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-shutdown-'));
    const dbFile = path.join(dir, 'pqrs.db');
    const port = await freePort();

    // A temporary database, so the developer database is never opened
    const child = spawn(process.execPath, [serverFile], {
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_PATH: dbFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const exited = new Promise((resolve) =>
      child.on('exit', (code, sig) => resolve({ code, sig })),
    );

    try {
      await waitFor(() => output.includes('listening'), 'the server to start');

      // One write opens the database in WAL mode, which leaves -wal and -shm files behind
      const created = await fetch(`http://127.0.0.1:${port}/api/pqrs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'petition',
          subject: 'Street light is broken',
          description: 'The street light in front of my house has been off for two weeks.',
          requesterName: 'Ana Gomez',
          requesterEmail: 'ana@example.com',
        }),
      });
      assert.equal(created.status, 201);
      assert.equal(fs.existsSync(`${dbFile}-wal`), true);

      child.kill(signal);
      // A repeated signal must be absorbed by the idempotent shutdown
      child.kill(signal);

      const { code, sig } = await exited;
      assert.equal(sig, null, 'the process must end by itself, not be killed by the signal');
      assert.equal(code, 0);
      assert.match(output, /shutting down/);
      assert.equal(output.match(/Shutdown complete/g)?.length, 1);

      // A closed SQLite connection removes its WAL files
      assert.equal(fs.existsSync(`${dbFile}-wal`), false);
      assert.equal(fs.existsSync(`${dbFile}-shm`), false);
      assert.equal(fs.existsSync(dbFile), true);

      // The port no longer accepts connections
      await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`));
    } finally {
      child.kill('SIGKILL');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
