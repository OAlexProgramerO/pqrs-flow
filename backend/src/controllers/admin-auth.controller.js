/**
 * HTTP side of the staff login. The rules live in the auth service.
 */
export function createAdminAuthController({ getAuthService, adminAuth }) {
  return {
    async login(req, res, next) {
      try {
        const result = await getAuthService().login(req.body, {
          previousToken: adminAuth.readSessionToken(req),
        });

        adminAuth.setSessionCookie(res, result.token);
        res.status(200).json({
          admin: result.admin,
          csrfToken: result.csrfToken,
          expiresAt: result.expiresAt,
        });
      } catch (error) {
        next(error);
      }
    },

    // Used by the pages to learn who is logged in and to get the CSRF token
    session(req, res) {
      res.status(200).json({
        admin: req.admin,
        csrfToken: req.csrfToken,
        expiresAt: req.sessionExpiresAt,
      });
    },

    // Always succeeds: logging out twice, or with a dead cookie, is not an error
    logout(req, res, next) {
      try {
        if (req.sessionToken) getAuthService().logout(req.sessionToken);
        adminAuth.clearSessionCookie(res);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}
