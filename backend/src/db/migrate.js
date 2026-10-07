import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

function getMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .map((file) => ({
      version: Number(file.match(/^(\d+)_/)[1]),
      filename: file,
      path: path.join(migrationsDir, file),
    }))
    .sort((a, b) => a.version - b.version);
}

function getUserVersion(db) {
  return Number(db.pragma('user_version', { simple: true }));
}

function setUserVersion(db, version) {
  db.pragma(`user_version = ${version}`);
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

  return Boolean(row);
}

function tableColumns(db, tableName) {
  return new Set(db.pragma(`table_info(${tableName})`).map((column) => column.name));
}

/**
 * Rebuilds the legacy PQRS table produced by the broken pre-migration implementation.
 *
 * Internal numeric IDs are regenerated.
 * User-facing case numbers and request data are preserved.
 */
function repairLegacyPqrsTable(db) {
  if (!tableExists(db, 'pqrs')) {
    return;
  }

  const columns = tableColumns(db, 'pqrs');

  const required = [
    'id',
    'case_number',
    'type',
    'subject',
    'description',
    'requester_name',
    'requester_email',
    'status',
    'created_at',
  ];

  // The schema is already complete.
  if (required.every((column) => columns.has(column))) {
    return;
  }

  const columnOr = (column, fallback) => (columns.has(column) ? `"${column}"` : fallback);

  db.exec(`
    CREATE TABLE pqrs_legacy_repair (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (
        type IN ('petition', 'complaint', 'claim', 'suggestion')
      ),
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'filed' CHECK (
        status IN ('filed', 'in_progress', 'answered', 'closed')
      ),
      created_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
    ) STRICT;
  `);

  const insert = db.prepare(`
    INSERT INTO pqrs_legacy_repair (
      case_number,
      type,
      subject,
      description,
      requester_name,
      requester_email,
      status,
      created_at
    )
    SELECT
      ${columnOr('case_number', "'LEGACY-' || rowid")},

      CASE ${columnOr('type', "'petition'")}
        WHEN 'petition' THEN 'petition'
        WHEN 'complaint' THEN 'complaint'
        WHEN 'claim' THEN 'claim'
        WHEN 'suggestion' THEN 'suggestion'
        ELSE 'petition'
      END,

      ${columnOr('subject', "'Migrated request'")},
      ${columnOr('description', "''")},
      ${columnOr('requester_name', "'Unknown'")},
      ${columnOr('requester_email', "'unknown@example.com'")},

      CASE ${columnOr('status', "'filed'")}
        WHEN 'filed' THEN 'filed'
        WHEN 'in_progress' THEN 'in_progress'
        WHEN 'answered' THEN 'answered'
        WHEN 'closed' THEN 'closed'
        ELSE 'filed'
      END,

      ${columnOr('created_at', "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")}

    FROM pqrs
  `);

  insert.run();

  db.exec(`
    DROP TABLE pqrs;
    ALTER TABLE pqrs_legacy_repair RENAME TO pqrs;
  `);
}

/**
 * Applies every pending SQL migration in order.
 *
 * PRAGMA user_version stores the last successfully applied migration.
 * Each migration runs inside a transaction.
 *
 * A compatibility repair is also applied to databases created by the
 * previous broken schema implementation.
 */
export function runMigrations(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const migrations = getMigrationFiles(migrationsDir);

  let currentVersion = getUserVersion(db);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    const sql = fs.readFileSync(migration.path, 'utf8');

    const apply = db.transaction(() => {
      db.exec(sql);
      setUserVersion(db, migration.version);
    });

    apply();

    currentVersion = migration.version;
  }

  // Repair the legacy table if this database predates the correct schema.
  repairLegacyPqrsTable(db);

  // Ensure the counter table exists even if an old database had a partial schema.
  if (!tableExists(db, 'case_counters')) {
    db.exec(`
      CREATE TABLE case_counters (
        year INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL DEFAULT 0
          CHECK (last_value >= 0)
      ) STRICT;
    `);
  }

  return currentVersion;
}
