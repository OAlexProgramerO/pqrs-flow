import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const preload = path.join(backendDir, 'tests/helpers/isolate-db.js');

// Runs a script in a child process that loads the preload exactly as `npm test` does,
// starting without any DB_PATH so the preload has to pick its own temporary database.
function runWithPreload(script) {
  const env = { ...process.env };
  delete env.DB_PATH;

  const preloadUrl = pathToFileURL(preload).href;

  return spawnSync(
    process.execPath,
    ['--import', preloadUrl, '--input-type=module', '-e', script],
    {
      cwd: backendDir,
      env,
      encoding: 'utf8',
    },
  );
}

test('the preload does not load the database settings before a test sets DB_PATH', () => {
  const chosen = path.join(os.tmpdir(), 'pqrs-order-check', 'chosen.db');
  const script = `
    process.env.DB_PATH = ${JSON.stringify(chosen)};
    const { env } = await import('./src/config/env.js');
    console.log(env.dbPath);
  `;
  const result = runWithPreload(script);

  assert.equal(result.status, 0, result.stderr);
  // If the preload had imported the database module first, the settings would already hold the
  // preload's own folder and the path chosen by the test would be ignored.
  assert.equal(result.stdout.trim(), chosen);
});

test('the preload gives a process its own temporary database and removes it afterwards', () => {
  const script = `
    console.log(process.env.DB_PATH);
    const { openDatabase } = await import('./src/db/database.js');
    const db = openDatabase({ filename: process.env.DB_PATH });
    db.prepare('INSERT INTO case_counters (year, last_value) VALUES (2000, 1)').run();
    db.close();
  `;
  const result = runWithPreload(script);
  assert.equal(result.status, 0, result.stderr);

  const dbPath = result.stdout.trim().split('\n')[0];
  assert.ok(dbPath.startsWith(os.tmpdir() + path.sep));
  assert.notEqual(path.resolve(dbPath), path.resolve(backendDir, '../data/pqrs.db'));
  for (const suffix of ['', '-wal', '-shm']) {
    assert.equal(fs.existsSync(dbPath + suffix), false, `${suffix || 'database'} was left behind`);
  }
  assert.equal(fs.existsSync(path.dirname(dbPath)), false, 'the temporary folder was left behind');
});

test('the shared connection opened during a run is closed and its files are removed', () => {
  const script = `
    console.log(process.env.DB_PATH);
    const { getDb } = await import('./src/db/database.js');
    getDb().prepare('INSERT INTO case_counters (year, last_value) VALUES (2000, 1)').run();
  `;
  const result = runWithPreload(script);
  assert.equal(result.status, 0, result.stderr);

  const dbPath = result.stdout.trim().split('\n')[0];
  assert.equal(fs.existsSync(path.dirname(dbPath)), false, 'the temporary folder was left behind');
});

test('the preload helper keeps the database module out of its static imports', () => {
  const source = fs.readFileSync(preload, 'utf8');

  assert.doesNotMatch(source, /^\s*import[^;]*['"][^'"]*db\/database[^'"]*['"]/m);
  assert.doesNotMatch(source, /^\s*import[^;]*['"][^'"]*config\/env[^'"]*['"]/m);
  assert.match(source, /await import\(['"][^'"]*db\/database\.js['"]\)/);
});
