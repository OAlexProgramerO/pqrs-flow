import {
  deleteDeadlineHoliday,
  deleteDeadlineRule,
  getDeadlineConfiguration,
  setDeadlineHoliday,
  setDeadlineRule,
} from '../services/deadlines-config.service.js';

export function createDeadlinesController({ getRepository, getNow = () => new Date() }) {
  return {
    getConfiguration(_req, res, next) {
      try {
        res.status(200).json(getDeadlineConfiguration(getRepository()));
      } catch (error) {
        next(error);
      }
    },

    setRule(req, res, next) {
      try {
        res.status(200).json(
          setDeadlineRule(getRepository(), {
            type: req.params.type,
            body: req.body,
            now: getNow(),
          }),
        );
      } catch (error) {
        next(error);
      }
    },

    deleteRule(req, res, next) {
      try {
        res.status(200).json(deleteDeadlineRule(getRepository(), req.params.type, getNow()));
      } catch (error) {
        next(error);
      }
    },

    setHoliday(req, res, next) {
      try {
        res
          .status(200)
          .json(setDeadlineHoliday(getRepository(), { date: req.params.date, body: req.body }));
      } catch (error) {
        next(error);
      }
    },

    deleteHoliday(req, res, next) {
      try {
        res.status(200).json(deleteDeadlineHoliday(getRepository(), req.params.date));
      } catch (error) {
        next(error);
      }
    },
  };
}
