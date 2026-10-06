import { validateLookup, validatePqrs } from '../../../shared/validation.js';
import { HttpError, ValidationError } from '../errors/http-error.js';

// The same message for "no such case number" and "wrong email", so nobody can tell them apart
export const LOOKUP_NOT_FOUND_MESSAGE = 'No request matches that case number and email.';

/**
 * Validates a submission and stores it.
 * The email is saved in lowercase so the lookup can compare it exactly.
 */
export function submitPqrs(repository, input, options) {
  const { valid, errors, data } = validatePqrs(input);
  if (!valid) throw new ValidationError(errors);

  return repository.create({ ...data, requesterEmail: data.requesterEmail.toLowerCase() }, options);
}

/**
 * Finds a request by case number and email.
 * Returns only the public fields: case number, type, status and creation date.
 */
export function lookupPqrs(repository, input) {
  const { valid, errors, data } = validateLookup(input);
  if (!valid) throw new ValidationError(errors);

  const found = repository.findForLookup(data.caseNumber, data.requesterEmail);
  if (!found) throw new HttpError(404, LOOKUP_NOT_FOUND_MESSAGE);

  return found;
}
