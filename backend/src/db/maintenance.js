import fs from 'node:fs';

/**
 * Deletes a SQLite database and the extra files WAL mode creates next to it.
 * Missing files are ignored.
 */
export function removeDatabaseFiles(filename) {
  if (filename === ':memory:') return;

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${filename}${suffix}`, { force: true });
  }
}
