import { validatePqrs } from '../../../shared/validation.js';
import { ValidationError } from '../errors/http-error.js';

/**
 * Validates a submission and stores it.
 * The email is saved in lowercase so the lookup of version 0.1.1 can compare it exactly.
 */
export function submitPqrs(repository, input, options) {
  const { valid, errors, data } = validatePqrs(input);
  if (!valid) throw new ValidationError(errors);

  return repository.create({ ...data, requesterEmail: data.requesterEmail.toLowerCase() }, options);
}
