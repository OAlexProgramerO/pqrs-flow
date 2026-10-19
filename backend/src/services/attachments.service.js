import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from '../errors/http-error.js';
import { env } from '../config/env.js';

const MAX_EXTENSION_LENGTH = 20;

function normalizeExtensionName(value = '') {
  const text = String(value ?? '').trim().toLowerCase();
  return text.startsWith('.') ? text : `.${text}`;
}

function allowedExtensions() {
  return new Set(env.attachments.allowedExtensions.map((entry) => normalizeExtensionName(entry)));
}

function allowedMimeTypes() {
  return new Set(env.attachments.allowedMimeTypes.map((entry) => String(entry).trim().toLowerCase()));
}

function getFileExtension(filename = '') {
  const cleaned = String(filename ?? '').trim();
  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === cleaned.length - 1) return '';
  return normalizeExtensionName(cleaned.slice(lastDot));
}

function detectSignature(buffer = Buffer.alloc(0)) {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'gif';
  }
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'webp';
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'docx';
  }
  if (buffer.length >= 2 && buffer[0] === 0xd0 && buffer[1] === 0xcf) {
    return 'doc';
  }
  return 'txt';
}

function safeFilename(originalName, extension) {
  const base = String(originalName ?? '')
    .replace(/[\\/]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanName = base.length > 0 ? base : 'upload';
  const ext = extension && extension.length <= MAX_EXTENSION_LENGTH ? extension : '.bin';
  return `${crypto.randomUUID()}-${cleanName.replace(/[^a-zA-Z0-9._-]+/g, '-')}${ext}`;
}

export function validateAttachmentFile(file, { maxFileSize = env.attachments.maxFileSize } = {}) {
  if (!file) throw new HttpError(400, 'No file was provided.');

  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer ?? file.data ?? []);
  if (!buffer || buffer.length === 0) {
    throw new HttpError(400, 'The selected file is empty.');
  }
  if (buffer.length > maxFileSize) {
    throw new HttpError(413, 'The selected file exceeds the maximum allowed size.');
  }

  const originalName = String(file.originalname ?? file.name ?? 'upload');
  const extension = getFileExtension(originalName);
  const allowed = allowedExtensions();
  if (!extension || !allowed.has(extension)) {
    throw new HttpError(415, 'This file type is not allowed.');
  }

  const mimeType = String(file.mimetype ?? file.type ?? 'application/octet-stream').trim().toLowerCase();
  const allowedMime = allowedMimeTypes();
  if (!allowedMime.has(mimeType)) {
    throw new HttpError(415, 'The file content type is not supported.');
  }

  const signature = detectSignature(buffer);
  const expected = {
    '.pdf': 'pdf',
    '.png': 'png',
    '.jpg': 'jpg',
    '.jpeg': 'jpg',
    '.txt': 'txt',
    '.doc': 'doc',
    '.docx': 'docx',
  }[extension];

  if (expected && signature !== expected) {
    throw new HttpError(415, 'The file content does not match the selected file type.');
  }

  return {
    originalName,
    extension,
    mimeType,
    sizeBytes: buffer.length,
    buffer,
  };
}

export function ensureAttachmentStorage(storageDir) {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
}

export function generateAttachmentPath(storageDir, pqrsId, storageId, extension) {
  const safeDir = String(pqrsId).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return path.join(storageDir, safeDir, `${storageId}${extension}`);
}

export function saveAttachmentRecord({ repository, storageDir, pqrsId, file, uploadedBy, visibility }) {
  const validated = validateAttachmentFile(file);
  const storageId = crypto.randomUUID();
  const extension = validated.extension;
  const targetPath = generateAttachmentPath(storageDir, pqrsId, storageId, extension);
  const directory = path.dirname(targetPath);

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  try {
    fs.writeFileSync(targetPath, validated.buffer, { mode: 0o600 });
    const safeName = safeFilename(validated.originalName, extension);
    const record = repository.insert({
      pqrsId: Number(pqrsId),
      storageId,
      originalName: validated.originalName,
      safeName,
      mimeType: validated.mimeType,
      extension,
      sizeBytes: validated.sizeBytes,
      visibility: String(visibility || 'public'),
      uploadedBy: String(uploadedBy || 'citizen'),
      uploadedAt: new Date().toISOString(),
    });
    return record;
  } catch (error) {
    try {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    } catch {
      // Ignore cleanup failures from a partially written file.
    }
    throw error;
  }
}

export function listAttachmentRecords(repository, pqrsId) {
  return repository.listByPqrsId(Number(pqrsId));
}

export function getAttachmentForDownload(repository, attachmentId) {
  const record = repository.getById(Number(attachmentId));
  if (!record) throw new HttpError(404, 'Attachment not found.');

  const targetPath = generateAttachmentPath(env.attachments.storageDir, record.pqrsId, record.storageId, record.extension);
  if (!fs.existsSync(targetPath)) {
    throw new HttpError(404, 'Attachment not found.');
  }

  return { record, targetPath };
}

export function deleteAttachmentRecord({ repository, storageDir, attachmentId }) {
  const existing = repository.getById(Number(attachmentId));
  if (!existing) throw new HttpError(404, 'Attachment not found.');

  const removed = repository.deleteById(Number(attachmentId));
  if (!removed) throw new HttpError(500, 'The attachment could not be deleted.');

  const targetPath = generateAttachmentPath(storageDir, existing.pqrsId, existing.storageId, existing.extension);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  const dir = path.dirname(targetPath);
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) fs.rmdirSync(dir, { recursive: true });
  } catch {
    // Ignore directory cleanup races.
  }

  return removed;
}
