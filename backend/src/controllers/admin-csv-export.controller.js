import { exportRequests } from '../services/admin-csv-export.service.js';

export function createAdminCsvExportController({ getRepository, getNow = () => new Date() }) {
  return {
    get(req, res, next) {
      try {
        const csv = exportRequests(getRepository(), req.query, getNow());
        res
          .status(200)
          .set({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="pqrs-requests.csv"',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          })
          .send(csv);
      } catch (error) {
        next(error);
      }
    },
  };
}
