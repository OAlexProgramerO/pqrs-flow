import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { runMigrations } from './migrate.js';

/**
 * Opens a SQLite database, applies safe defaults and runs the pending migrations.
 */
export function openDatabase({ filename = env.dbPath, migrationsDir } = {}) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);

  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    runMigrations(db, migrationsDir);
  } catch (error) {
    db.close();
    throw error;
  }

  return db;
}

let shared;

/**
 * Shared connection for the app.
 * It opens on first use, so importing the app never touches the disk.
 */
export function getDb() {
  shared ??= openDatabase();
  return shared;
}

export function closeDb() {
  shared?.close();
  shared = undefined;
}
