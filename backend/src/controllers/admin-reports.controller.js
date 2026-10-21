import { getReport } from '../services/admin-reports.service.js';

export function createAdminReportsController({ getRepository, getNow = () => new Date() }) {
  return {
    get(req, res, next) {
      try {
        res.status(200).json(getReport(getRepository(), req.query, getNow()));
      } catch (error) {
        next(error);
      }
    },
  };
}
