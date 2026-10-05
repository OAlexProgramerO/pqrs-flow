import { HttpError } from '../errors/http-error.js';
import { lookupPqrs, submitPqrs } from '../services/pqrs.service.js';

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

    lookup(req, res, next) {
      try {
        // Answers about a person's request must never be stored by a browser or a proxy
        res.set('Cache-Control', 'no-store');

        const found = lookupPqrs(getRepository(), req.body ?? {});
        res.status(200).json(found);
      } catch (error) {
        next(error);
      }
    },
  };
}
