import { env } from './config/env.js';
import { createAdminPqrsRepository } from './repositories/admin-pqrs.repository.js';
import { createAdminReportsRepository } from './repositories/admin-reports.repository.js';
import { createAdminRepository } from './repositories/admin.repository.js';
import { createAccountAuditRepository } from './repositories/account-audit.repository.js';
import { createDeadlinesRepository } from './repositories/deadlines.repository.js';
import { createSecurityEventRepository } from './repositories/security-events.repository.js';
import { createMfaRepository } from './repositories/mfa.repository.js';
import { createSessionRepository } from './repositories/session.repository.js';
import { createAccountService } from './services/admin-accounts.js';
import { createAuthService } from './services/auth.service.js';
import { createMfaService } from './services/mfa.service.js';

/**
 * Builds everything the staff area needs on top of one database connection.
 * The app and the account tools both use it; tests give it an in-memory database, a fake clock
 * and a cheap password cost.
 */
export function createAdminContext(db, { sessionPolicy = env.session, passwordParams, now } = {}) {
  const accountAuditRepository = createAccountAuditRepository(db);
  const adminRepository = createAdminRepository(db, accountAuditRepository);
  const sessionRepository = createSessionRepository(db, accountAuditRepository);
  const securityEventRepository = createSecurityEventRepository(db);
  const mfaRepository = createMfaRepository(db);
  const adminPqrsRepository = createAdminPqrsRepository(db);
  const adminReportsRepository = createAdminReportsRepository(db);
  const deadlinesRepository = createDeadlinesRepository(db);

  const clock = now ?? (() => new Date());
  const options = {
    adminRepository,
    sessionRepository,
    accountAuditRepository,
    sessionPolicy,
    passwordParams,
    now: clock,
  };

  return {
    db,
    now: clock,
    adminRepository,
    sessionRepository,
    accountAuditRepository,
    securityEventRepository,
    mfaRepository,
    adminPqrsRepository,
    adminReportsRepository,
    deadlinesRepository,
    authService: createAuthService({
      ...options,
      securityEventRepository,
      mfaRepository,
      sessionPolicy,
    }),
    mfaService: createMfaService({
      adminRepository,
      mfaRepository,
      securityEventRepository,
      passwordParams,
      now: clock,
    }),
    accountService: createAccountService(options),
  };
}
