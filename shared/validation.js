export const REQUEST_TYPES = ['petition', 'complaint', 'claim', 'suggestion'];

export const LIMITS = {
  subject: { min: 5, max: 100 },
  description: { min: 20, max: 2000 },
  requesterName: { min: 2, max: 100 },
  requesterEmail: { max: 254 },
};

const LABELS = {
  subject: 'Subject',
  description: 'Description',
  requesterName: 'Full name',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(input = {}) {
  const read = (key) => String(input[key] ?? '').trim();

  return {
    type: read('type'),
    subject: read('subject'),
    description: read('description'),
    requesterName: read('requesterName'),
    requesterEmail: read('requesterEmail'),
  };
}

function checkLength(errors, data, field) {
  const { min, max } = LIMITS[field];
  const label = LABELS[field];
  const { length } = data[field];

  if (length === 0) errors[field] = `${label} is required.`;
  else if (length < min) errors[field] = `${label} must have at least ${min} characters.`;
  else if (length > max) errors[field] = `${label} must have at most ${max} characters.`;
}

/**
 * Validates the data of a PQRS submission.
 * Returns the cleaned data and one error message per invalid field.
 */
export function validatePqrs(input) {
  const data = normalize(input);
  const errors = {};

  if (!REQUEST_TYPES.includes(data.type)) errors.type = 'Select the type of request.';

  checkLength(errors, data, 'subject');
  checkLength(errors, data, 'description');
  checkLength(errors, data, 'requesterName');

  if (!data.requesterEmail) {
    errors.requesterEmail = 'Email address is required.';
  } else if (
    data.requesterEmail.length > LIMITS.requesterEmail.max ||
    !EMAIL_PATTERN.test(data.requesterEmail)
  ) {
    errors.requesterEmail = 'Enter a valid email address.';
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}

export const CASE_NUMBER_PATTERN = /^PQRS-\d{4}-\d{6,}$/;

/**
 * Cleans what a person types as a case number: spaces removed at the ends, uppercase.
 */
export function normalizeCaseNumber(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Validates the data of a status lookup.
 * The email is returned in lowercase because that is how it is stored.
 */
export function validateLookup(input = {}) {
  const data = {
    caseNumber: normalizeCaseNumber(input.caseNumber),
    requesterEmail: String(input.requesterEmail ?? '')
      .trim()
      .toLowerCase(),
  };
  const errors = {};

  if (!data.caseNumber) {
    errors.caseNumber = 'Case number is required.';
  } else if (!CASE_NUMBER_PATTERN.test(data.caseNumber)) {
    errors.caseNumber = 'Enter a case number like PQRS-2026-000001.';
  }

  if (!data.requesterEmail) {
    errors.requesterEmail = 'Email address is required.';
  } else if (
    data.requesterEmail.length > LIMITS.requesterEmail.max ||
    !EMAIL_PATTERN.test(data.requesterEmail)
  ) {
    errors.requesterEmail = 'Enter a valid email address.';
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}
