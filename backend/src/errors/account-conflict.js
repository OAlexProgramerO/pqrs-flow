export class AccountConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccountConflictError';
  }
}
