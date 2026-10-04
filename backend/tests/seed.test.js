import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePqrs } from '../../shared/validation.js';
import { openDatabase } from '../src/db/database.js';
import { removeDatabaseFiles } from '../src/db/maintenance.js';
import { seedDemoData } from '../src/db/seed.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('seedDemoData creates requests with consecutive case numbers', () => {
  const db = openDatabase({ filename: ':memory:' });
  const created = seedDemoData(createPqrsRepository(db), { now: new Date('2026-10-04T12:00:00Z') });

  assert.equal(created.length, 8);
  assert.equal(created[0].caseNumber, 'PQRS-2026-000001');
  assert.equal(created[7].caseNumber, 'PQRS-2026-000008');
  assert.equal(new Set(created.map((item) => item.caseNumber)).size, 8);

  db.close();
});

test('the demo requests follow the validation rules', () => {
  const db = openDatabase({ filename: ':memory:' });
  const created = seedDemoData(createPqrsRepository(db));

  for (const item of created) {
    const { valid, errors } = validatePqrs(item);
    assert.equal(valid, true, `${item.caseNumber}: ${JSON.stringify(errors)}`);
  }

  db.close();
});

test('the demo requests cover the four request types', () => {
  const db = openDatabase({ filename: ':memory:' });
  const types = new Set(seedDemoData(createPqrsRepository(db)).map((item) => item.type));

  assert.deepEqual([...types].sort(), ['claim', 'complaint', 'petition', 'suggestion']);

  db.close();
});

test('removeDatabaseFiles deletes the database and its WAL files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-reset-'));
  tempDirs.push(dir);
  const filename = path.join(dir, 'test.db');

  for (const suffix of ['', '-wal', '-shm']) fs.writeFileSync(`${filename}${suffix}`, 'x');
  removeDatabaseFiles(filename);

  for (const suffix of ['', '-wal', '-shm']) {
    assert.equal(fs.existsSync(`${filename}${suffix}`), false, `${suffix || 'main file'} remains`);
  }
});

test('removeDatabaseFiles ignores missing files and in-memory databases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-reset-'));
  tempDirs.push(dir);

  assert.doesNotThrow(() => removeDatabaseFiles(path.join(dir, 'missing.db')));
  assert.doesNotThrow(() => removeDatabaseFiles(':memory:'));
});
