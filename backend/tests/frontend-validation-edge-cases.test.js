import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, REQUEST_TYPES, validatePqrs } from '../../frontend/js/validation.js';

const validInput = {
  type: 'complaint',
  subject: 'Noise at night',
  description: 'The neighbors play loud music every night after midnight.',
  requesterName: 'Luis Perez',
  requesterEmail: 'luis@example.com',
};

test('accepts the four request types', () => {
  for (const type of REQUEST_TYPES) {
    assert.equal(validatePqrs({ ...validInput, type }).valid, true, `${type} should be valid`);
  }
});

test('accepts values exactly at the minimum and maximum length', () => {
  const atMinimum = {
    ...validInput,
    subject: 'a'.repeat(LIMITS.subject.min),
    description: 'a'.repeat(LIMITS.description.min),
    requesterName: 'a'.repeat(LIMITS.requesterName.min),
  };
  const atMaximum = {
    ...validInput,
    subject: 'a'.repeat(LIMITS.subject.max),
    description: 'a'.repeat(LIMITS.description.max),
    requesterName: 'a'.repeat(LIMITS.requesterName.max),
  };

  assert.equal(validatePqrs(atMinimum).valid, true);
  assert.equal(validatePqrs(atMaximum).valid, true);
});

test('rejects values one character outside the limits', () => {
  const tooShort = validatePqrs({
    ...validInput,
    subject: 'a'.repeat(LIMITS.subject.min - 1),
    description: 'a'.repeat(LIMITS.description.min - 1),
    requesterName: 'a'.repeat(LIMITS.requesterName.min - 1),
  });
  const tooLong = validatePqrs({
    ...validInput,
    subject: 'a'.repeat(LIMITS.subject.max + 1),
    description: 'a'.repeat(LIMITS.description.max + 1),
    requesterName: 'a'.repeat(LIMITS.requesterName.max + 1),
  });

  assert.deepEqual(Object.keys(tooShort.errors).sort(), [
    'description',
    'requesterName',
    'subject',
  ]);
  assert.deepEqual(Object.keys(tooLong.errors).sort(), ['description', 'requesterName', 'subject']);
});

test('treats whitespace-only fields as empty', () => {
  const { errors } = validatePqrs({ ...validInput, subject: '     ', requesterName: '\t\n' });

  assert.equal(errors.subject, 'Subject is required.');
  assert.equal(errors.requesterName, 'Full name is required.');
});

test('does not throw with null, numbers or missing values', () => {
  const { valid, errors } = validatePqrs({ type: null, subject: 12345, description: undefined });

  assert.equal(valid, false);
  assert.ok(errors.type);
  assert.ok(errors.description);
  assert.ok(errors.requesterEmail);
});

test('accepts common email formats', () => {
  for (const email of ['first.last+tag@sub.example.co', 'a@b.io', 'USER@EXAMPLE.COM']) {
    const { errors } = validatePqrs({ ...validInput, requesterEmail: email });
    assert.equal(errors.requesterEmail, undefined, `"${email}" should be accepted`);
  }
});

test('rejects emails longer than the limit', () => {
  const email = `${'a'.repeat(LIMITS.requesterEmail.max)}@example.com`;
  const { errors } = validatePqrs({ ...validInput, requesterEmail: email });

  assert.ok(errors.requesterEmail);
});

test('does not modify the input object', () => {
  const input = { ...validInput, subject: '   Noise at night   ' };
  const copy = { ...input };

  validatePqrs(input);

  assert.deepEqual(input, copy);
});
