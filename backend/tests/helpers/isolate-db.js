import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The tests must never open the database of a developer (data/pqrs.db) or a real deployment.
// The default app opens the file named by DB_PATH on its first request, so every test process
// gets its own temporary file, deleted when the process ends. A test that already chose a
// temporary path for itself keeps it.
const current = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : '';

if (!current.startsWith(os.tmpdir() + path.sep)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-test-db-'));
  process.env.DB_PATH = path.join(dir, 'pqrs.db');
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
}
