import fs from 'node:fs';
import { HttpError } from '../errors/http-error.js';
import { env } from '../config/env.js';
import {
  deleteAttachmentRecord,
  ensureAttachmentStorage,
  getAttachmentForDownload,
  listAttachmentRecords,
  saveAttachmentRecord,
  validateAttachmentFile,
} from '../services/attachments.service.js';

export function createAttachmentController({
  getRepository,
  getPqrsRepository,
  storageDir = env.attachments.storageDir,
}) {
  ensureAttachmentStorage(storageDir);

  return {
    async list(req, res, next) {
      try {
        const pqrs = getPqrsRepository().findByCaseNumber(req.params.caseNumber);
        if (!pqrs) throw new HttpError(404, 'Request not found.');

        const attachments = listAttachmentRecords(getRepository(), pqrs.id).map((attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
          mimeType: attachment.mimeType,
          visibility: attachment.visibility,
          uploadedBy: attachment.uploadedBy,
          uploadedAt: attachment.uploadedAt,
        }));

        res.status(200).json({ data: attachments });
      } catch (error) {
        next(error);
      }
    },

    async upload(req, res, next) {
      try {
        if (!req.files || req.files.length === 0) {
          throw new HttpError(400, 'Select at least one file to upload.');
        }

        const pqrs = getPqrsRepository().findByCaseNumber(req.params.caseNumber);
        if (!pqrs) throw new HttpError(404, 'Request not found.');

        const uploaded = req.files.map((file) => {
          const validated = validateAttachmentFile(file);
          if (validated.sizeBytes > env.attachments.maxFileSize) {
            throw new HttpError(413, 'One of the files exceeds the maximum permitted size.');
          }
          return saveAttachmentRecord({
            repository: getRepository(),
            storageDir,
            pqrsId: pqrs.id,
            file,
            uploadedBy: req.admin ? 'staff' : 'citizen',
            visibility: req.admin ? req.body?.visibility || 'internal' : 'public',
          });
        });

        res.status(201).json({
          data: uploaded.map((item) => ({
            id: item.id,
            name: item.originalName,
            sizeBytes: item.sizeBytes,
            mimeType: item.mimeType,
            visibility: item.visibility,
            uploadedBy: item.uploadedBy,
            uploadedAt: item.uploadedAt,
          })),
        });
      } catch (error) {
        next(error);
      }
    },

    async download(req, res, next) {
      try {
        const attachment = getAttachmentForDownload(getRepository(), req.params.attachmentId);
        const { record, targetPath } = attachment;

        if (req.admin) {
          const pqrs = getPqrsRepository().findByCaseNumber(req.params.caseNumber);
          if (!pqrs || pqrs.id !== record.pqrsId) {
            throw new HttpError(404, 'Attachment not found.');
          }
        } else {
          const lookup = getPqrsRepository().findForLookup(
            req.params.caseNumber,
            req.query.requesterEmail ?? '',
          );
          if (!lookup || lookup.caseNumber !== req.params.caseNumber) {
            throw new HttpError(403, 'You are not allowed to access this attachment.');
          }
          if (record.visibility !== 'public') {
            throw new HttpError(403, 'You are not allowed to access this attachment.');
          }
        }

        const file = fs.readFileSync(targetPath);
        res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', String(file.length));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${record.originalName.replace(/"/g, '\\"')}"`,
        );
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.send(file);
      } catch (error) {
        next(error);
      }
    },

    async delete(req, res, next) {
      try {
        const item = deleteAttachmentRecord({
          repository: getRepository(),
          storageDir,
          attachmentId: req.params.attachmentId,
        });
        res.status(200).json({ deleted: item });
      } catch (error) {
        next(error);
      }
    },
  };
}
