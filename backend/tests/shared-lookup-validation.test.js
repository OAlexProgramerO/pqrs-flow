import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_NUMBER_PATTERN,
  normalizeCaseNumber,
  validateLookup,
} from '../../shared/validation.js';
import { isCaseNumber } from '../src/services/case-number.js';

const valid = { caseNumber: 'PQRS-2026-000001', requesterEmail: 'ana@example.com' };

test('accepts a valid case number and email', () => {
  const { valid: ok, errors, data } = validateLookup(valid);

  assert.equal(ok, true);
  assert.deepEqual(errors, {});
  assert.deepEqual(data, valid);
});

test('cleans the case number and the email before checking them', () => {
  const { valid: ok, data } = validateLookup({
    caseNumber: '  pqrs-2026-000001 ',
    requesterEmail: '  ANA@Example.COM ',
  });

  assert.equal(ok, true);
  assert.equal(data.caseNumber, 'PQRS-2026-000001');
  assert.equal(data.requesterEmail, 'ana@example.com');
});

test('reports both fields when the input is empty', () => {
  const { valid: ok, errors } = validateLookup({});

  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ['caseNumber', 'requesterEmail']);
});

test('works without any argument', () => {
  assert.equal(validateLookup().valid, false);
});

test('rejects badly formed case numbers', () => {
  for (const caseNumber of [
    'PQRS-26-000001',
    'PQRS-2026-1',
    'PQRS2026000001',
    'ABC',
    '1; DROP TABLE',
  ]) {
    const { errors } = validateLookup({ ...valid, caseNumber });
    assert.match(errors.caseNumber, /case number like/, `${caseNumber} should be rejected`);
  }
});

test('rejects invalid emails', () => {
  for (const requesterEmail of ['ana', 'ana@', 'ana@example', 'a na@example.com']) {
    const { errors } = validateLookup({ ...valid, requesterEmail });
    assert.ok(errors.requesterEmail, `${requesterEmail} should be rejected`);
  }
});

test('rejects an email longer than the limit', () => {
  const requesterEmail = `${'a'.repeat(250)}@example.com`;

  assert.ok(validateLookup({ ...valid, requesterEmail }).errors.requesterEmail);
});

test('does not throw with null or numeric values', () => {
  assert.doesNotThrow(() => validateLookup({ caseNumber: null, requesterEmail: 42 }));
});

test('normalizeCaseNumber trims and uppercases', () => {
  assert.equal(normalizeCaseNumber('  pqrs-2026-000001\n'), 'PQRS-2026-000001');
  assert.equal(normalizeCaseNumber(undefined), '');
  assert.equal(normalizeCaseNumber(null), '');
});

test('the server and the browser use the same case number pattern', () => {
  assert.equal(CASE_NUMBER_PATTERN.test('PQRS-2026-000001'), true);
  assert.equal(isCaseNumber('PQRS-2026-000001'), true);
  assert.equal(isCaseNumber('pqrs-2026-000001'), false);
});
