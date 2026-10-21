import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/database.js';
import { removeDatabaseFiles } from '../src/db/maintenance.js';
import { runMigrations } from '../src/db/migrate.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../src/db/migrations');
const tempDirs = [];
const open = [];

after(() => {
  open.forEach((db) => db.open && db.close());
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-mig-'));
  tempDirs.push(dir);
  return dir;
}

// A folder with only the migrations of v0.1.3, to build a database like the previous release made
function releaseOneMigrations() {
  const dir = tempDir();
  fs.copyFileSync(path.join(MIGRATIONS, '001_initial.sql'), path.join(dir, '001_initial.sql'));
  return dir;
}

function releaseTwoMigrations() {
  const dir = tempDir();
  for (const filename of ['001_initial.sql', '002_admin_panel.sql']) {
    fs.copyFileSync(path.join(MIGRATIONS, filename), path.join(dir, filename));
  }
  return dir;
}

function releaseThreeMigrations() {
  const dir = tempDir();
  for (const filename of [
    '001_initial.sql',
    '002_admin_panel.sql',
    '003_staff_roles_accounts.sql',
  ]) {
    fs.copyFileSync(path.join(MIGRATIONS, filename), path.join(dir, filename));
  }
  return dir;
}

function releaseSevenMigrations() {
  const dir = tempDir();
  for (const filename of fs
    .readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 7)) {
    fs.copyFileSync(path.join(MIGRATIONS, filename), path.join(dir, filename));
  }
  return dir;
}

function raw(filename = ':memory:') {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  open.push(db);
  return db;
}

const names = (db, type) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'")
    .all(type)
    .map((row) => row.name);

const insertPqrs = (db, caseNumber = 'PQRS-2026-000001') =>
  db
    .prepare(
      `INSERT INTO pqrs (case_number, type, subject, description, requester_name, requester_email)
       VALUES (?, 'claim', 'Subject here', 'Some description', 'Ana', 'ana@example.com')`,
    )
    .run(caseNumber).lastInsertRowid;

const insertAdmin = (db, email = 'a@example.com') =>
  db
    .prepare(
      "INSERT INTO admins (email, display_name, password_hash) VALUES (?, 'Staff One', 'scrypt$x')",
    )
    .run(email).lastInsertRowid;

test('a fresh database ends at version 8 with every new table, index and trigger', () => {
  const db = openDatabase({ filename: ':memory:' });
  open.push(db);

  assert.equal(db.pragma('user_version', { simple: true }), 8);
  for (const table of [
    'admins',
    'admin_sessions',
    'pqrs_audit',
    'account_audit',
    'pqrs',
    'case_counters',
    'pqrs_responses',
    'pqrs_notes',
    'pqrs_assignments',
    'deadline_rules',
    'deadline_holidays',
    'attachments',
  ]) {
    assert.ok(names(db, 'table').includes(table), table);
  }
  for (const index of [
    'idx_admin_sessions_admin_id',
    'idx_admin_sessions_expires_at',
    'idx_pqrs_audit_pqrs_id',
    'idx_pqrs_audit_action_created',
    'idx_pqrs_audit_request_action_created',
    'idx_pqrs_created_at',
    'idx_pqrs_status',
    'idx_pqrs_type',
    'idx_pqrs_notes_pqrs_id',
    'idx_pqrs_assignments_assignee',
    'idx_admins_role_active',
    'idx_account_audit_target',
    'idx_account_audit_created',
    'idx_pqrs_deadline_due_status',
    'idx_attachments_pqrs',
    'idx_attachments_visibility',
  ]) {
    assert.ok(names(db, 'index').includes(index), index);
  }
  assert.deepEqual(names(db, 'trigger').sort(), [
    'account_audit_no_delete',
    'account_audit_no_update',
    'pqrs_audit_no_delete',
    'pqrs_audit_no_update',
  ]);
  assert.deepEqual(
    db.pragma('table_info(pqrs_audit)').map((column) => column.name),
    [
      'id',
      'pqrs_id',
      'case_number',
      'admin_id',
      'action',
      'previous_status',
      'new_status',
      'request_id',
      'created_at',
    ],
  );
});

test('the v0.3.1 audit history survives migration without adding non-contract fields', () => {
  const filename = path.join(tempDir(), 'v031-audit.db');
  const old = raw(filename);
  runMigrations(old, releaseThreeMigrations());
  const pqrsId = insertPqrs(old);
  const adminId = insertAdmin(old);
  old
    .prepare(
      `INSERT INTO pqrs_audit (
        pqrs_id, case_number, admin_id, action, previous_status, new_status, request_id
      ) VALUES (?, 'PQRS-2026-000001', ?, 'status_change', 'filed', 'in_progress', 'legacy-req')`,
    )
    .run(pqrsId, adminId);
  old.close();

  const db = openDatabase({ filename });
  open.push(db);
  assert.equal(db.pragma('user_version', { simple: true }), 8);
  assert.deepEqual(
    db
      .prepare(
        'SELECT case_number, action, previous_status, new_status, request_id FROM pqrs_audit',
      )
      .all(),
    [
      {
        case_number: 'PQRS-2026-000001',
        action: 'status_change',
        previous_status: 'filed',
        new_status: 'in_progress',
        request_id: 'legacy-req',
      },
    ],
  );
  const columns = db.pragma('table_info(pqrs_audit)').map((column) => column.name);
  assert.equal(columns.includes('metadata'), false);
  assert.equal(columns.includes('actor_admin_id'), false);
  assert.equal(columns.includes('target_admin_id'), false);
});

test('response visibility and assignment state are constrained by the migration schema', () => {
  const db = raw();
  runMigrations(db);
  const pqrsId = insertPqrs(db);
  const adminId = insertAdmin(db);
  const insertResponse = db.prepare(`
    INSERT INTO pqrs_responses (pqrs_id, author_admin_id, text, state, published_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  assert.throws(
    () => insertResponse.run(pqrsId, adminId, 'Draft', 'draft', '2026-10-11T12:00:00Z'),
    /CHECK/,
  );
  assert.throws(() => insertResponse.run(pqrsId, adminId, 'Published', 'published', null), /CHECK/);
  insertResponse.run(pqrsId, adminId, 'Published', 'published', '2026-10-11T12:00:00Z');

  const insertAssignment = db.prepare(`
    INSERT INTO pqrs_assignments (
      pqrs_id, assignee_admin_id, assigned_by_admin_id, removed_at
    ) VALUES (?, ?, ?, ?)
  `);
  assert.throws(() => insertAssignment.run(pqrsId, null, adminId, null), /CHECK/);
  insertAssignment.run(pqrsId, adminId, adminId, null);
});

test('a database made by v0.1.3 keeps its requests and case numbers when it is migrated', () => {
  const dir = tempDir();
  const filename = path.join(dir, 'old.db');

  // The previous release: only migration 001, with data in it
  const old = new Database(filename);
  old.pragma('foreign_keys = ON');
  runMigrations(old, releaseOneMigrations());
  insertPqrs(old, 'PQRS-2026-000001');
  insertPqrs(old, 'PQRS-2026-000002');
  old.exec("UPDATE pqrs SET status = 'answered' WHERE case_number = 'PQRS-2026-000002'");
  old.exec('INSERT INTO case_counters (year, last_value) VALUES (2026, 2)');
  assert.equal(old.pragma('user_version', { simple: true }), 1);
  old.close();

  // The new release opens it
  const db = openDatabase({ filename });
  open.push(db);

  assert.equal(db.pragma('user_version', { simple: true }), 8);
  assert.deepEqual(db.prepare('SELECT id, case_number, status FROM pqrs ORDER BY id').all(), [
    { id: 1, case_number: 'PQRS-2026-000001', status: 'filed' },
    { id: 2, case_number: 'PQRS-2026-000002', status: 'answered' },
  ]);
  assert.deepEqual(
    db.prepare('SELECT deadline_due_date, deadline_rule_version FROM pqrs ORDER BY id').all(),
    [
      { deadline_due_date: null, deadline_rule_version: null },
      { deadline_due_date: null, deadline_rule_version: null },
    ],
  );
  assert.equal(
    db.prepare('SELECT last_value FROM case_counters WHERE year = 2026').get().last_value,
    2,
  );
  assert.ok(names(db, 'table').includes('pqrs_audit'));
});

test('a pre-v0.3.1 database keeps records and sessions and maps legacy full-access accounts to administrators', () => {
  const filename = path.join(tempDir(), 'v030.db');
  const old = new Database(filename);
  old.pragma('foreign_keys = ON');
  runMigrations(old, releaseTwoMigrations());
  insertPqrs(old, 'PQRS-2026-000019');
  const adminId = insertAdmin(old, 'legacy@example.com');
  old
    .prepare(
      `INSERT INTO admin_sessions (admin_id, token_hash, created_at, last_seen_at, expires_at)
     VALUES (?, 'legacy-session-hash', 'a', 'a', 'b')`,
    )
    .run(adminId);
  old.close();

  const db = openDatabase({ filename });
  open.push(db);
  assert.equal(db.pragma('user_version', { simple: true }), 8);
  assert.deepEqual(db.prepare('SELECT email, role FROM admins').all(), [
    { email: 'legacy@example.com', role: 'administrator' },
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n, 1);
  assert.equal(db.prepare('SELECT case_number FROM pqrs').get().case_number, 'PQRS-2026-000019');
  const newId = insertAdmin(db, 'least-privilege@example.com');
  assert.equal(db.prepare('SELECT role FROM admins WHERE id = ?').get(newId).role, 'staff');
});

test('a database from the broken pre-migration schema is repaired and then migrated', () => {
  const db = raw();
  db.exec('CREATE TABLE pqrs (case_number TEXT, subject TEXT, type TEXT)');
  db.exec("INSERT INTO pqrs VALUES ('PQRS-2025-000007', 'Old subject', 'claim')");

  assert.equal(runMigrations(db), 8);
  assert.deepEqual(db.prepare('SELECT case_number, subject, status FROM pqrs').all(), [
    { case_number: 'PQRS-2025-000007', subject: 'Old subject', status: 'filed' },
  ]);
  assert.ok(names(db, 'index').includes('idx_pqrs_status'));
});

test('running the migrations again does nothing, so a restart is safe', () => {
  const db = raw();

  assert.equal(runMigrations(db), 8);
  const adminId = insertAdmin(db);
  assert.equal(runMigrations(db), 8);
  assert.equal(runMigrations(db), 8);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admins WHERE id = ?').get(adminId).n, 1);
});

test('a database file survives being closed and opened again', () => {
  const dir = tempDir();
  const filename = path.join(dir, 'restart.db');

  const first = openDatabase({ filename });
  insertAdmin(first);
  first.close();

  const second = openDatabase({ filename });
  open.push(second);
  assert.equal(second.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 1);
  assert.equal(second.pragma('user_version', { simple: true }), 8);
  second.close();
  removeDatabaseFiles(filename);
});

test('upgrading from the v0.3.5 schema adds the report index without changing request data', () => {
  const filename = path.join(tempDir(), 'v035.db');
  const old = raw(filename);
  runMigrations(old, releaseSevenMigrations());
  insertPqrs(old, 'PQRS-2026-000123');
  old.exec('PRAGMA user_version = 7');
  old.close();

  const db = openDatabase({ filename });
  open.push(db);
  assert.equal(db.pragma('user_version', { simple: true }), 8);
  assert.deepEqual(db.prepare('SELECT case_number, type FROM pqrs').get(), {
    case_number: 'PQRS-2026-000123',
    type: 'claim',
  });
  assert.ok(names(db, 'index').includes('idx_pqrs_audit_request_action_created'));
});

test('a migration that fails leaves the version and the data untouched', () => {
  const dir = releaseOneMigrations();
  const db = raw();
  runMigrations(db, dir);
  insertPqrs(db);

  fs.writeFileSync(
    path.join(dir, '002_broken.sql'),
    'CREATE TABLE half_done (id INTEGER); INSERT INTO table_that_does_not_exist VALUES (1);',
  );

  assert.throws(() => runMigrations(db, dir));
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  assert.equal(names(db, 'table').includes('half_done'), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pqrs').get().n, 1);
});

test('a failed staff-role migration rolls back its schema and preserves the v0.3.0 data', () => {
  const dir = releaseTwoMigrations();
  const db = raw();
  runMigrations(db, dir);
  const adminId = insertAdmin(db, 'legacy@example.com');
  fs.writeFileSync(
    path.join(dir, '003_broken.sql'),
    'ALTER TABLE admins ADD COLUMN role TEXT; INSERT INTO missing_table VALUES (1);',
  );

  assert.throws(() => runMigrations(db, dir));
  assert.equal(db.pragma('user_version', { simple: true }), 2);
  assert.equal(
    db.pragma('table_info(admins)').some((column) => column.name === 'role'),
    false,
  );
  assert.equal(
    db.prepare('SELECT email FROM admins WHERE id = ?').get(adminId).email,
    'legacy@example.com',
  );
});

test('administrator emails are stored in lowercase and are unique', () => {
  const db = raw();
  runMigrations(db);

  assert.throws(() => insertAdmin(db, 'Upper@Example.com'), /CHECK/);
  insertAdmin(db, 'one@example.com');
  assert.throws(() => insertAdmin(db, 'one@example.com'), /UNIQUE/);
});

test('sessions need an administrator and disappear with them', () => {
  const db = raw();
  runMigrations(db);
  const insertSession = (adminId, hash) =>
    db
      .prepare(
        `INSERT INTO admin_sessions (admin_id, token_hash, created_at, last_seen_at, expires_at)
         VALUES (?, ?, 'a', 'a', 'b')`,
      )
      .run(adminId, hash);

  assert.throws(() => insertSession(999, 'hash-1'), /FOREIGN KEY/);

  const adminId = insertAdmin(db);
  insertSession(adminId, 'hash-1');
  assert.throws(() => insertSession(adminId, 'hash-1'), /UNIQUE/);

  db.prepare('DELETE FROM admins WHERE id = ?').run(adminId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n, 0);
});

test('audit rows are checked: known statuses, existing request and administrator', () => {
  const db = raw();
  runMigrations(db);
  const pqrsId = insertPqrs(db);
  const adminId = insertAdmin(db);
  const add = (overrides = {}) => {
    const row = {
      pqrsId,
      adminId,
      action: 'status_change',
      previous: 'filed',
      next: 'in_progress',
      ...overrides,
    };
    return db
      .prepare(
        `INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, previous_status, new_status)
         VALUES (?, 'PQRS-2026-000001', ?, ?, ?, ?)`,
      )
      .run(row.pqrsId, row.adminId, row.action, row.previous, row.next);
  };

  assert.equal(add().changes, 1);
  assert.throws(() => add({ next: 'reopened' }), /CHECK/);
  assert.throws(() => add({ previous: 'x' }), /CHECK/);
  assert.throws(() => add({ action: 'delete_everything' }), /CHECK/);
  assert.throws(() => add({ pqrsId: 999 }), /FOREIGN KEY/);
  assert.throws(() => add({ adminId: 999 }), /FOREIGN KEY/);
});

test('audit rows cannot be changed or deleted, and their request or administrator cannot be removed', () => {
  const db = raw();
  runMigrations(db);
  const pqrsId = insertPqrs(db);
  const adminId = insertAdmin(db);
  db.prepare(
    `INSERT INTO pqrs_audit (pqrs_id, case_number, admin_id, action, previous_status, new_status)
     VALUES (?, 'PQRS-2026-000001', ?, 'status_change', 'filed', 'in_progress')`,
  ).run(pqrsId, adminId);

  assert.throws(() => db.exec("UPDATE pqrs_audit SET new_status = 'closed'"), /append-only/);
  assert.throws(() => db.exec('DELETE FROM pqrs_audit'), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM pqrs WHERE id = ?').run(pqrsId), /FOREIGN KEY/);
  assert.throws(() => db.prepare('DELETE FROM admins WHERE id = ?').run(adminId), /FOREIGN KEY/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pqrs_audit').get().n, 1);
});

test('the panel queries use their indexes', () => {
  const db = raw();
  runMigrations(db);

  const plan = (sql) =>
    db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all()
      .map((row) => row.detail)
      .join(' | ');

  assert.match(plan("SELECT * FROM pqrs WHERE status = 'filed'"), /idx_pqrs_status/);
  assert.match(plan("SELECT * FROM pqrs WHERE type = 'claim'"), /idx_pqrs_type/);
  assert.match(plan("SELECT * FROM pqrs WHERE created_at >= '2026-01-01'"), /idx_pqrs_created_at/);
  assert.match(
    plan('SELECT * FROM pqrs_audit WHERE pqrs_id = 1 ORDER BY id'),
    /idx_pqrs_audit_pqrs_id/,
  );
});
