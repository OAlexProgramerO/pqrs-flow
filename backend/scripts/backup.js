import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { env } from '../src/config/env.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(rootDir, process.env.BACKUP_DIR || 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(outputRoot, `pqrs-flow-${timestamp}`);

function hashFile(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function listFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symbolic links are not allowed in attachment storage: ${absolute}`);
    if (entry.isDirectory()) return listFiles(absolute, base);
    if (!entry.isFile()) throw new Error(`Unsupported attachment entry: ${absolute}`);
    return [
      { path: path.relative(base, absolute).split(path.sep).join('/'), sha256: hashFile(absolute) },
    ];
  });
}

if (!fs.existsSync(env.dbPath)) {
  console.error(`Database does not exist: ${env.dbPath}`);
  process.exit(1);
}

fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
const databaseCopy = path.join(destination, 'pqrs.db');
const db = new Database(env.dbPath, { readonly: true, fileMustExist: true });

try {
  await db.backup(databaseCopy);
} catch (error) {
  fs.rmSync(destination, { recursive: true, force: true });
  throw error;
} finally {
  db.close();
}

const attachmentSource = env.attachments.storageDir;
const attachmentCopy = path.join(destination, 'attachments');
if (fs.existsSync(attachmentSource)) {
  fs.cpSync(attachmentSource, attachmentCopy, { recursive: true, errorOnExist: true });
} else {
  fs.mkdirSync(attachmentCopy, { recursive: true, mode: 0o700 });
}

const manifest = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  database: { file: 'pqrs.db', sha256: hashFile(databaseCopy) },
  attachments: { directory: 'attachments', files: listFiles(attachmentCopy) },
};
fs.writeFileSync(
  path.join(destination, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  {
    mode: 0o600,
  },
);
console.log(`Backup created: ${destination}`);
