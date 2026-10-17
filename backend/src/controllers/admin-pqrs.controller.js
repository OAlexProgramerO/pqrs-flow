import {
  changeAssignment,
  changeStatus,
  createNote,
  getRequestDetail,
  getSummary,
  listNotes,
  listRequests,
  upsertOfficialResponse,
} from '../services/admin-pqrs.service.js';

export function createAdminPqrsController({ getRepository, getNow = () => new Date() }) {
  return {
    list(req, res, next) {
      try {
        res.status(200).json(listRequests(getRepository(), req.query));
      } catch (error) {
        next(error);
      }
    },

    summary(req, res, next) {
      try {
        res.status(200).json(getSummary(getRepository(), req.admin?.id ?? null));
      } catch (error) {
        next(error);
      }
    },

    detail(req, res, next) {
      try {
        res.status(200).json(getRequestDetail(getRepository(), req.params.caseNumber));
      } catch (error) {
        next(error);
      }
    },

    changeStatus(req, res, next) {
      try {
        const result = changeStatus(getRepository(), {
          caseNumber: req.params.caseNumber,
          body: req.body,
          adminId: req.admin.id,
          requestId: req.id,
          now: getNow(),
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },

    getReply(req, res, next) {
      try {
        res.status(200).json(getRequestDetail(getRepository(), req.params.caseNumber));
      } catch (error) {
        next(error);
      }
    },

    saveReply(req, res, next) {
      try {
        const result = upsertOfficialResponse(getRepository(), {
          caseNumber: req.params.caseNumber,
          body: req.body,
          adminId: req.admin.id,
          requestId: req.id,
          now: getNow(),
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },

    listNotes(req, res, next) {
      try {
        res.status(200).json(listNotes(getRepository(), req.params.caseNumber));
      } catch (error) {
        next(error);
      }
    },

    createNote(req, res, next) {
      try {
        const result = createNote(getRepository(), {
          caseNumber: req.params.caseNumber,
          text: req.body?.text,
          adminId: req.admin.id,
          requestId: req.id,
          now: getNow(),
        });
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },

    changeAssignment(req, res, next) {
      try {
        const result = changeAssignment(getRepository(), {
          caseNumber: req.params.caseNumber,
          body: req.body,
          adminId: req.admin.id,
          requestId: req.id,
          now: getNow(),
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}
