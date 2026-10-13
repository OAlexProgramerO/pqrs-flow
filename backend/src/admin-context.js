import { env } from './config/env.js';
import { createAdminPqrsRepository } from './repositories/admin-pqrs.repository.js';
import { createAdminRepository } from './repositories/admin.repository.js';
import { createSessionRepository } from './repositories/session.repository.js';
import { createAccountService } from './services/admin-accounts.js';
import { createAuthService } from './services/auth.service.js';

/**
 * Builds everything the staff area needs on top of one database connection.
 * The app and the account tools both use it; tests give it an in-memory database, a fake clock
 * and a cheap password cost.
 */
export function createAdminContext(db, { sessionPolicy = env.session, passwordParams, now } = {}) {
  const adminRepository = createAdminRepository(db);
  const sessionRepository = createSessionRepository(db);
  const adminPqrsRepository = createAdminPqrsRepository(db);

  const clock = now ?? (() => new Date());
  const options = { adminRepository, sessionRepository, passwordParams, now: clock };

  return {
    now: clock,
    adminRepository,
    sessionRepository,
    adminPqrsRepository,
    authService: createAuthService({ ...options, sessionPolicy }),
    accountService: createAccountService(options),
  };
}
