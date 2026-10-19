import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { createAttachmentRepository } from '../src/repositories/attachments.repository.js';
import {
  saveAttachmentRecord,
  validateAttachmentFile,
} from '../src/services/attachments.service.js';

const openDatabases = [];
after(() => {
  openDatabases.forEach((db) => db.close());
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const tempDirs = [];

function setupDatabase() {
  const db = openDatabase({ filename: ':memory:' });
  openDatabases.push(db);
  return { db, repository: createPqrsRepository(db), attachments: createAttachmentRepository(db) };
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pqrs-attachments-'));
  tempDirs.push(dir);
  return dir;
}

test('validateAttachmentFile accepts safe image uploads and rejects unsupported files', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const valid = validateAttachmentFile({
    buffer: png,
    originalname: 'example.png',
    mimetype: 'image/png',
  });
  assert.equal(valid.extension, '.png');
  assert.equal(valid.mimeType, 'image/png');

  assert.throws(
    () =>
      validateAttachmentFile({
        buffer: Buffer.from('<html>bad</html>'),
        originalname: 'danger.html',
        mimetype: 'text/html',
      }),
    /not allowed|not supported/i,
  );
});

test('saveAttachmentRecord stores a file outside the public directory and records metadata', () => {
  const { repository, attachments } = setupDatabase();
  const storageDir = makeTempDir();
  const created = repository.create(
    {
      type: 'claim',
      subject: 'Test',
      description: 'A claim with additional evidence attached for review.',
      requesterName: 'Ada Example',
      requesterEmail: 'ada@example.com',
    },
    { now: new Date('2026-12-01T12:00:00Z') },
  );

  const file = {
    buffer: Buffer.from('sample attachment content'),
    originalname: 'document.txt',
    mimetype: 'text/plain',
  };

  const record = saveAttachmentRecord({
    repository: attachments,
    storageDir,
    pqrsId: created.id,
    file,
    uploadedBy: 'citizen',
    visibility: 'public',
  });

  assert.equal(record.originalName, 'document.txt');
  assert.equal(record.visibility, 'public');
  assert.equal(record.sizeBytes, file.buffer.length);
  assert.ok(
    fs.existsSync(
      path.join(storageDir, String(created.id), `${record.storageId}${record.extension}`),
    ),
  );
});
