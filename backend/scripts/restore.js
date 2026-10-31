import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { env } from '../src/config/env.js';

const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function hashFile(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

if (env.nodeEnv === 'production' && process.env.RESTORE_CONFIRM !== 'YES') {
  fail('Restore in production requires RESTORE_CONFIRM=YES. Stop the application first.');
}
if (!backupPath || !fs.existsSync(backupPath)) {
  fail('Usage: npm run db:restore -- <backup-directory>');
}
const manifestPath = path.join(backupPath, 'manifest.json');
const databaseSource = path.join(backupPath, 'pqrs.db');
const attachmentsSource = path.join(backupPath, 'attachments');
if (
  !fs.existsSync(manifestPath) ||
  !fs.existsSync(databaseSource) ||
  !fs.existsSync(attachmentsSource)
) {
  fail('Backup is incomplete: manifest.json, pqrs.db and attachments/ are required.');
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  fail('Backup manifest is not valid JSON.');
}
if (manifest.formatVersion !== 1 || manifest.database?.file !== 'pqrs.db') {
  fail('Unsupported backup format.');
}
if (hashFile(databaseSource) !== manifest.database.sha256) {
  fail('Database checksum mismatch. Backup may be corrupted.');
}
if (!Array.isArray(manifest.attachments?.files)) fail('Attachment manifest is missing or invalid.');
for (const entry of manifest.attachments.files) {
  if (
    typeof entry.path !== 'string' ||
    path.isAbsolute(entry.path) ||
    entry.path.split(/[\\/]/).includes('..')
  ) {
    fail('Backup contains an unsafe attachment path.');
  }
  const filePath = path.join(attachmentsSource, entry.path);
  if (
    !fs.existsSync(filePath) ||
    !fs.lstatSync(filePath).isFile() ||
    hashFile(filePath) !== entry.sha256
  ) {
    fail(`Attachment checksum mismatch: ${entry.path}`);
  }
}

const check = new Database(databaseSource, { readonly: true, fileMustExist: true });
try {
  const integrity = check.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') fail(`SQLite integrity check failed: ${integrity}`);
  const foreignKeys = check.pragma('foreign_key_check');
  if (foreignKeys.length > 0) fail('SQLite foreign-key check failed.');
} finally {
  check.close();
}

// Stage both resources beside their destinations before replacing live data.
const dbDir = path.dirname(env.dbPath);
const attachmentDir = env.attachments.storageDir;
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(path.dirname(attachmentDir), { recursive: true });
const token = crypto.randomUUID();
const stagedDb = `${env.dbPath}.restore-${token}`;
const stagedAttachments = `${attachmentDir}.restore-${token}`;
const oldDb = `${env.dbPath}.previous-${token}`;
const oldWal = `${env.dbPath}-wal.previous-${token}`;
const oldShm = `${env.dbPath}-shm.previous-${token}`;
const oldAttachments = `${attachmentDir}.previous-${token}`;

try {
  fs.copyFileSync(databaseSource, stagedDb, fs.constants.COPYFILE_EXCL);
  fs.cpSync(attachmentsSource, stagedAttachments, { recursive: true, errorOnExist: true });
  if (fs.existsSync(env.dbPath)) fs.renameSync(env.dbPath, oldDb);
  if (fs.existsSync(`${env.dbPath}-wal`)) fs.renameSync(`${env.dbPath}-wal`, oldWal);
  if (fs.existsSync(`${env.dbPath}-shm`)) fs.renameSync(`${env.dbPath}-shm`, oldShm);
  if (fs.existsSync(attachmentDir)) fs.renameSync(attachmentDir, oldAttachments);
  fs.renameSync(stagedDb, env.dbPath);
  fs.renameSync(stagedAttachments, attachmentDir);
  fs.rmSync(oldDb, { force: true });
  fs.rmSync(oldWal, { force: true });
  fs.rmSync(oldShm, { force: true });
  fs.rmSync(oldAttachments, { recursive: true, force: true });
  console.log(`Backup restored from: ${backupPath}`);
  console.log('Start the application and verify /api/health and representative records.');
} catch (error) {
  // Best-effort rollback if replacement failed midway.
  fs.rmSync(env.dbPath, { force: true });
  fs.rmSync(attachmentDir, { recursive: true, force: true });
  if (fs.existsSync(oldDb)) fs.renameSync(oldDb, env.dbPath);
  if (fs.existsSync(oldWal)) fs.renameSync(oldWal, `${env.dbPath}-wal`);
  if (fs.existsSync(oldShm)) fs.renameSync(oldShm, `${env.dbPath}-shm`);
  if (fs.existsSync(oldAttachments)) fs.renameSync(oldAttachments, attachmentDir);
  throw error;
} finally {
  fs.rmSync(stagedDb, { force: true });
  fs.rmSync(stagedAttachments, { recursive: true, force: true });
}
