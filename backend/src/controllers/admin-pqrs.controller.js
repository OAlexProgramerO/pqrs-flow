import {
  changeStatus,
  getRequestDetail,
  getSummary,
  listRequests,
} from '../services/admin-pqrs.service.js';

/**
 * HTTP side of the staff panel. Every route behind it already passed authentication and CSRF.
 */
export function createAdminPqrsController({ getRepository, getNow = () => new Date() }) {
  return {
    list(req, res, next) {
      try {
        res.status(200).json(listRequests(getRepository(), req.query));
      } catch (error) {
        next(error);
      }
    },

    summary(_req, res, next) {
      try {
        res.status(200).json(getSummary(getRepository()));
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
  };
}
