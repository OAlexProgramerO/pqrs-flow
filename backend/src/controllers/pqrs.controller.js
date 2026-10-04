import { HttpError } from '../errors/http-error.js';
import { submitPqrs } from '../services/pqrs.service.js';

// A field real users never see. Bots that fill every input reveal themselves by filling it.
const HONEYPOT_FIELD = 'website';

/**
 * Only these fields leave the server after a submission.
 * The description and the personal data are never echoed back.
 */
function toPublicResponse(pqrs) {
  return {
    caseNumber: pqrs.caseNumber,
    type: pqrs.type,
    subject: pqrs.subject,
    status: pqrs.status,
    createdAt: pqrs.createdAt,
  };
}

export function createPqrsController({ getRepository }) {
  return {
    create(req, res, next) {
      try {
        const body = req.body ?? {};
        if (body[HONEYPOT_FIELD]) throw new HttpError(400, 'Invalid submission');

        const created = submitPqrs(getRepository(), body);
        res.status(201).json(toPublicResponse(created));
      } catch (error) {
        next(error);
      }
    },
  };
}
