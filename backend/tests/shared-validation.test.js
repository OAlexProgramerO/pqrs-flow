import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, validatePqrs } from '../../shared/validation.js';

const validInput = {
  type: 'petition',
  subject: 'Street light is broken',
  description: 'The street light in front of my house has been off for two weeks.',
  requesterName: 'Ana Gomez',
  requesterEmail: 'ana@example.com',
};

test('accepts a complete and valid request', () => {
  const { valid, errors } = validatePqrs(validInput);

  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});

test('trims whitespace before validating', () => {
  const { valid, data } = validatePqrs({ ...validInput, subject: '   Street light is broken   ' });

  assert.equal(valid, true);
  assert.equal(data.subject, 'Street light is broken');
});

test('reports every field when the form is empty', () => {
  const { valid, errors } = validatePqrs({});

  assert.equal(valid, false);
  assert.deepEqual(Object.keys(errors).sort(), [
    'description',
    'requesterEmail',
    'requesterName',
    'subject',
    'type',
  ]);
});

test('rejects an unknown request type', () => {
  const { errors } = validatePqrs({ ...validInput, type: 'other' });

  assert.ok(errors.type);
});

test('rejects text that is too short', () => {
  const { errors } = validatePqrs({ ...validInput, subject: 'Hi', description: 'Too short' });

  assert.match(errors.subject, /at least/);
  assert.match(errors.description, /at least/);
});

test('rejects text that is too long', () => {
  const { errors } = validatePqrs({
    ...validInput,
    subject: 'a'.repeat(LIMITS.subject.max + 1),
  });

  assert.match(errors.subject, /at most/);
});

test('rejects invalid email addresses', () => {
  for (const email of ['ana', 'ana@', 'ana@example', 'a na@example.com']) {
    const { errors } = validatePqrs({ ...validInput, requesterEmail: email });
    assert.ok(errors.requesterEmail, `"${email}" should be rejected`);
  }
});
