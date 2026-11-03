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

        const repository = getRepository();
        const publicRequest = !req.admin
          ? getPqrsRepository().findForLookup(
              req.params.caseNumber,
              req.get('x-requester-email') ?? '',
            )
          : null;
        if (!req.admin && !publicRequest) {
          throw new HttpError(404, 'Request not found.');
        }

        const records = req.admin
          ? listAttachmentRecords(repository, pqrs.id)
          : repository.listPublicByPqrsId(pqrs.id);
        const attachments = records.map((attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
          mimeType: attachment.mimeType,
          uploadedAt: attachment.uploadedAt,
          ...(req.admin
            ? {
                visibility: attachment.visibility,
                uploadedBy: attachment.uploadedBy,
              }
            : {}),
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
        if (
          !req.admin &&
          !getPqrsRepository().findForLookup(req.params.caseNumber, req.body?.requesterEmail ?? '')
        ) {
          throw new HttpError(404, 'Request not found.');
        }

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
            req.get('x-requester-email') ?? '',
          );
          if (!lookup || lookup.caseNumber !== req.params.caseNumber) {
            throw new HttpError(404, 'Attachment not found.');
          }
          if (record.visibility !== 'public') {
            throw new HttpError(404, 'Attachment not found.');
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
