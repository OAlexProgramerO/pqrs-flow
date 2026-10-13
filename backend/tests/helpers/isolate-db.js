import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const current = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : '';

if (!current.startsWith(os.tmpdir() + path.sep)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-test-db-'));
  process.env.DB_PATH = path.join(dir, 'pqrs.db');

  process.on('beforeExit', async () => {
    try {
      // Import only after the tests have finished configuring their environment.
      const { closeDb } = await import('../../src/db/database.js');
      closeDb();
    } catch {
      // The database module may never have been initialized.
    }

    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY') {
        process.stderr.write(`Could not remove test database directory: ${error.message}\n`);
        process.exitCode = 1;
      }
    }
  });
}
