import multer from 'multer';
import { Router } from 'express';
import { createPqrsController } from '../controllers/pqrs.controller.js';
import { createAttachmentController } from '../controllers/attachments.controller.js';
import { createAttachmentRepository } from '../repositories/attachments.repository.js';
import { env } from '../config/env.js';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: env.attachments.maxFilesPerRequest,
    fileSize: env.attachments.maxFileSize,
    parts: env.attachments.maxFilesPerRequest + 2,
  },
});

export function createPqrsRoutes({ getRepository, lookupLimiters = [], submitLimiters = [] }) {
  const router = Router();
  const controller = createPqrsController({ getRepository });
  const attachments = createAttachmentController({
    getRepository: () => createAttachmentRepository(getRepository().db ?? getRepository()),
    getPqrsRepository: getRepository,
    storageDir: env.attachments.storageDir,
  });

  // The limiters run first, so every attempt counts, even the ones that fail
  router.post('/', ...submitLimiters, controller.create);
  router.post('/lookup', ...lookupLimiters, controller.lookup);
  router.get('/:caseNumber/attachments', attachments.list);
  router.post(
    '/:caseNumber/attachments',
    attachmentUpload.array('files', env.attachments.maxFilesPerRequest),
    attachments.upload,
  );
  router.get('/:caseNumber/attachments/:attachmentId/download', attachments.download);

  return router;
}
