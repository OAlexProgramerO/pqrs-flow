import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGINATION,
  validateCaseNumberParam,
  validateListQuery,
  validateLogin,
  validateNewAdmin,
  validatePassword,
  validateStatusChange,
} from '../src/services/admin-validation.js';
import {
  STATUSES,
  TRANSITIONS,
  allowedTransitions,
  canTransition,
} from '../src/services/status-workflow.js';

test('login input is normalized: the email is trimmed and lowercased', () => {
  const { valid, data } = validateLogin({ email: '  Staff@Example.COM ', password: 'x' });

  assert.equal(valid, true);
  assert.equal(data.email, 'staff@example.com');
  assert.equal(data.password, 'x');
});

test('login rejects missing, malformed and non-string values', () => {
  for (const body of [undefined, null, [], 'text', {}, { email: 'a@b.co' }, { password: 'x' }]) {
    assert.equal(validateLogin(body).valid, false, JSON.stringify(body));
  }
  assert.equal(
    validateLogin({ email: 'not-an-email', password: 'x' }).errors.email.length > 0,
    true,
  );
  assert.equal(validateLogin({ email: { $ne: '' }, password: 'x' }).valid, false);
  assert.equal(validateLogin({ email: 'a@b.co', password: ['x'] }).valid, false);
  assert.equal(validateLogin({ email: 'a@b.co', password: 'x'.repeat(129) }).valid, false);
  assert.equal(validateLogin({ email: `${'a'.repeat(250)}@b.co`, password: 'x' }).valid, false);
});

test('new passwords need 12 to 128 characters and must not be the email', () => {
  assert.equal(validatePassword('a'.repeat(11)).valid, false);
  assert.equal(validatePassword('a'.repeat(12)).valid, true);
  assert.equal(validatePassword('a'.repeat(128)).valid, true);
  assert.equal(validatePassword('a'.repeat(129)).valid, false);
  assert.equal(validatePassword('Staff@Example.com', { email: 'staff@example.com' }).valid, false);
  assert.equal(validatePassword(undefined).valid, false);
});

test('a new administrator needs a valid email, a name and a good password', () => {
  const good = validateNewAdmin({
    email: ' Ana@Example.com ',
    displayName: ' Ana Gomez ',
    password: 'a long enough pass',
  });

  assert.equal(good.valid, true);
  assert.deepEqual(good.data, {
    email: 'ana@example.com',
    displayName: 'Ana Gomez',
    password: 'a long enough pass',
  });

  const bad = validateNewAdmin({ email: 'nope', displayName: 'A', password: 'short' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['displayName', 'email', 'password']);
});

test('the list query has safe defaults', () => {
  const { valid, data } = validateListQuery({});

  assert.equal(valid, true);
  assert.equal(data.page, 1);
  assert.equal(data.pageSize, PAGINATION.defaultPageSize);
  assert.equal(data.sort, 'createdAt');
  assert.equal(data.order, 'desc');
  assert.equal(data.q, '');
  assert.equal(data.status, null);
  assert.equal(data.createdFrom, null);
  assert.equal(data.createdBefore, null);
});

test('the list query accepts every valid filter', () => {
  const { valid, data } = validateListQuery({
    q: '  tax  ',
    status: 'answered',
    type: 'claim',
    from: '2026-02-28',
    to: '2026-03-01',
    sort: 'caseNumber',
    order: 'ASC',
    page: '3',
    pageSize: '50',
  });

  assert.equal(valid, true);
  assert.equal(data.q, 'tax');
  assert.equal(data.order, 'asc');
  assert.equal(data.page, 3);
  assert.equal(data.pageSize, 50);
  assert.equal(data.createdFrom, '2026-02-28T00:00:00.000Z');
  // The end date includes its whole day
  assert.equal(data.createdBefore, '2026-03-02T00:00:00.000Z');
});

test('the end date of a month or a year rolls over correctly', () => {
  assert.equal(
    validateListQuery({ to: '2026-12-31' }).data.createdBefore,
    '2027-01-01T00:00:00.000Z',
  );
  assert.equal(
    validateListQuery({ to: '2028-02-29' }).data.createdBefore,
    '2028-03-01T00:00:00.000Z',
  );
});

test('empty values count as not given', () => {
  const { valid, data } = validateListQuery({ q: '  ', status: '', type: '', page: '', from: '' });

  assert.equal(valid, true);
  assert.equal(data.status, null);
  assert.equal(data.page, 1);
});

test('pagination values are strict whole numbers within limits', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '1e3', '0x10', '100001', ' ', '9'.repeat(7)]) {
    const result = validateListQuery({ page });
    if (page.trim() === '') continue;
    assert.equal(result.valid, false, `page ${page}`);
  }
  for (const pageSize of ['0', '101', '-5', '2.5', 'ten', '1000']) {
    assert.equal(validateListQuery({ pageSize }).valid, false, `pageSize ${pageSize}`);
  }
  assert.equal(validateListQuery({ pageSize: '100' }).valid, true);
  assert.equal(validateListQuery({ pageSize: '1' }).valid, true);
});

test('unknown statuses, types, sort fields and orders are rejected', () => {
  assert.equal(validateListQuery({ status: 'deleted' }).errors.status.length > 0, true);
  assert.equal(validateListQuery({ status: 'FILED' }).valid, false);
  assert.equal(validateListQuery({ type: 'other' }).valid, false);
  assert.equal(validateListQuery({ sort: 'requester_email' }).valid, false);
  assert.equal(validateListQuery({ sort: 'created_at' }).valid, false);
  assert.equal(validateListQuery({ sort: 'id; DROP TABLE pqrs' }).valid, false);
  assert.equal(validateListQuery({ sort: '__proto__' }).valid, false);
  assert.equal(validateListQuery({ sort: 'constructor' }).valid, false);
  assert.equal(validateListQuery({ order: 'sideways' }).valid, false);
});

test('dates must be real calendar dates and the range must be in order', () => {
  for (const from of [
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '26-01-01',
    '2026/01/01',
    '2026-1-1',
    'today',
    '2026-01-01T00:00:00Z',
  ]) {
    assert.equal(validateListQuery({ from }).valid, false, from);
  }
  assert.equal(validateListQuery({ from: '2026-05-02', to: '2026-05-01' }).valid, false);
  assert.equal(validateListQuery({ from: '2026-05-01', to: '2026-05-01' }).valid, true);
});

test('repeated and nested query values are refused', () => {
  for (const name of ['q', 'status', 'type', 'from', 'to', 'sort', 'order', 'page', 'pageSize']) {
    assert.equal(validateListQuery({ [name]: ['a', 'b'] }).valid, false, `${name} as array`);
    assert.equal(validateListQuery({ [name]: { $gt: '' } }).valid, false, `${name} as object`);
  }
});

test('the search term has a length limit and no control characters', () => {
  assert.equal(validateListQuery({ q: 'a'.repeat(100) }).valid, true);
  assert.equal(validateListQuery({ q: 'a'.repeat(101) }).valid, false);
  assert.equal(validateListQuery({ q: 'bad\u0000term' }).valid, false);
  assert.equal(validateListQuery({ q: 'line\nbreak' }).valid, false);
});

test('SQL text in the search is only text: it is accepted as a string, never as SQL', () => {
  const { valid, data } = validateListQuery({ q: "'; DROP TABLE pqrs; --" });

  assert.equal(valid, true);
  assert.equal(data.q, "'; DROP TABLE pqrs; --");
});

test('case number parameters are normalized and strict', () => {
  assert.deepEqual(validateCaseNumberParam(' pqrs-2026-000001 ').data, {
    caseNumber: 'PQRS-2026-000001',
  });
  assert.equal(validateCaseNumberParam('PQRS-2026-000001').valid, true);

  for (const bad of [
    '',
    'PQRS-26-1',
    "PQRS-2026-000001' OR '1'='1",
    '../etc/passwd',
    undefined,
    `PQRS-2026-${'9'.repeat(40)}`,
  ]) {
    assert.equal(validateCaseNumberParam(bad).valid, false, String(bad));
  }
});

test('a status change needs one of the four statuses', () => {
  for (const status of STATUSES) assert.equal(validateStatusChange({ status }).valid, true, status);

  for (const body of [
    undefined,
    null,
    [],
    {},
    { status: 'open' },
    { status: 'CLOSED' },
    { status: ['closed'] },
    { status: 1 },
  ]) {
    assert.equal(validateStatusChange(body).valid, false, JSON.stringify(body));
  }
  assert.equal(validateStatusChange({ status: 'closed', expectedStatus: 'nope' }).valid, false);
  assert.equal(validateStatusChange({ status: 'closed', expectedStatus: null }).valid, true);
  assert.equal(
    validateStatusChange({ status: 'closed', expectedStatus: 'answered' }).data.expectedStatus,
    'answered',
  );
});

test('the workflow allows exactly the documented transitions', () => {
  assert.deepEqual(allowedTransitions('filed'), ['in_progress']);
  assert.deepEqual(allowedTransitions('in_progress'), ['answered']);
  assert.deepEqual(allowedTransitions('answered'), ['closed', 'in_progress']);
  assert.deepEqual(allowedTransitions('closed'), []);
  assert.deepEqual(allowedTransitions('mystery'), []);

  // Every pair that is not listed is refused, including staying where you are
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      assert.equal(canTransition(from, to), TRANSITIONS[from].includes(to), `${from} -> ${to}`);
    }
    assert.equal(canTransition(from, from), false);
  }
});

test('the list of transitions cannot be changed from outside', () => {
  const copy = allowedTransitions('filed');
  copy.push('closed');

  assert.deepEqual(allowedTransitions('filed'), ['in_progress']);
  assert.throws(() => TRANSITIONS.filed.push('closed'));
});
