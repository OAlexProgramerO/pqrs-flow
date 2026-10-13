import { validateNewAdmin, validatePassword, normalizeEmail } from './admin-validation.js';
import { DEFAULT_SCRYPT_PARAMS, hashPassword } from './password.js';

/**
 * An error of the account tools, with a message that is safe to print in the terminal.
 */
export class AccountError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'AccountError';
    this.details = details;
  }
}

/**
 * Operations on staff accounts. There is no HTTP route for them on purpose: accounts are managed
 * with a command (`npm run admin`) by someone who has access to the server.
 */
export function createAccountService({
  adminRepository,
  sessionRepository,
  passwordParams = DEFAULT_SCRYPT_PARAMS,
  now = () => new Date(),
}) {
  function requireAccount(email) {
    const account = adminRepository.findByEmail(normalizeEmail(email));
    if (!account) throw new AccountError('No administrator has that email address.');
    return account;
  }

  return {
    /** Creates an account with a validated password. The password is stored only as a hash. */
    async create(input) {
      const { valid, errors, data } = validateNewAdmin(input);
      if (!valid) throw new AccountError('The account data is not valid.', errors);

      if (adminRepository.findByEmail(data.email)) {
        throw new AccountError('An administrator with that email address already exists.');
      }

      const passwordHash = await hashPassword(data.password, passwordParams);
      return adminRepository.create(
        { email: data.email, displayName: data.displayName, passwordHash },
        { now: now() },
      );
    },

    /**
     * Sets a new password and closes every session of the account, so whoever held an old
     * session (or the old password) is out. A deactivated account stays deactivated.
     */
    async resetPassword({ email, password }) {
      const account = requireAccount(email);

      const { valid, errors } = validatePassword(password, { email: account.email });
      if (!valid) throw new AccountError('The password is not valid.', errors);

      adminRepository.updatePasswordHash(account.id, await hashPassword(password, passwordParams));
      sessionRepository.deleteByAdminId(account.id);
      return adminRepository.findById(account.id);
    },

    /** Deactivated accounts cannot log in and lose their sessions at once. */
    setActive(email, isActive) {
      const account = requireAccount(email);

      adminRepository.setActive(account.id, isActive);
      if (!isActive) sessionRepository.deleteByAdminId(account.id);
      return adminRepository.findById(account.id);
    },

    list() {
      return adminRepository.list();
    },
  };
}
