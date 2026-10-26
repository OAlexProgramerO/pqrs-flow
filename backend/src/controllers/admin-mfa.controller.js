function context(req) {
  return {
    requestId: req.id,
    ipAddress: req.ip,
    userAgent: String(req.get('user-agent') ?? '').slice(0, 512),
  };
}

function objectBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export function createAdminMfaController({ getAdmin }) {
  return {
    status(req, res, next) {
      try {
        return res.status(200).json(getAdmin().mfaService.status(req.admin.id));
      } catch (error) {
        return next(error);
      }
    },

    async setup(req, res, next) {
      try {
        const body = objectBody(req.body);
        const result = await getAdmin().mfaService.beginEnrollment(
          req.admin.id,
          { password: body.password },
          context(req),
        );
        res.set('Cache-Control', 'no-store');
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },

    async enable(req, res, next) {
      try {
        const body = objectBody(req.body);
        const result = await getAdmin().mfaService.enable(
          req.admin.id,
          { password: body.password, code: body.code },
          context(req),
        );
        res.set('Cache-Control', 'no-store');
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },

    async disable(req, res, next) {
      try {
        const body = objectBody(req.body);
        const result = await getAdmin().mfaService.disable(
          req.admin.id,
          { password: body.password, code: body.code },
          context(req),
        );
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },
  };
}
