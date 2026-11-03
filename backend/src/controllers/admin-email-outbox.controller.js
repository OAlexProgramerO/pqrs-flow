export function createAdminEmailOutboxController({ getRepository, getNow = () => new Date() }) {
  return {
    summary(_req, res, next) {
      try {
        res.set('Cache-Control', 'no-store');
        res.status(200).json(getRepository().getOperationalSummary(getNow()));
      } catch (error) {
        next(error);
      }
    },
  };
}
