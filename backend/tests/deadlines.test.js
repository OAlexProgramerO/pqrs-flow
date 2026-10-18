import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeadline, getDeadlineStatus, isValidDate } from '../src/services/deadlines.js';
import { sampleRequest, setupAdminApp } from './helpers/admin.js';

const RULE = { businessDays: 2, version: 1 };

test('calculates in UTC, skipping weekends and configured holidays', () => {
  const result = calculateDeadline({
    type: 'petition',
    submittedAt: '2026-10-16T23:30:00.000Z',
    rule: RULE,
    holidays: ['2026-10-19'],
  });
  assert.deepEqual(result, {
    dueDate: '2026-10-21',
    businessDays: 2,
    ruleId: 'petition:v1',
    ruleVersion: 1,
    policyVersion: 'utc-business-days-v1',
    holidaysSnapshot: ['2026-10-19'],
  });
});

test('normalizes an offset timestamp to its UTC submission date', () => {
  const result = calculateDeadline({
    type: 'claim',
    submittedAt: '2026-10-12T01:00:00+05:00',
    rule: { businessDays: 1, version: 3 },
  });
  assert.equal(result.dueDate, '2026-10-12');
});

test('rejects invalid request types, timestamps, rules and holiday dates', () => {
  assert.throws(
    () =>
      calculateDeadline({
        type: 'other',
        submittedAt: '2026-10-12T00:00:00Z',
        rule: RULE,
      }),
    /Request type/,
  );
  assert.throws(
    () =>
      calculateDeadline({
        type: 'petition',
        submittedAt: '2026-10-12',
        rule: RULE,
      }),
    /ISO 8601/,
  );
  assert.throws(
    () =>
      calculateDeadline({
        type: 'petition',
        submittedAt: '2026-02-30T00:00:00Z',
        rule: RULE,
      }),
    /timestamp is invalid/,
  );
  assert.throws(
    () =>
      calculateDeadline({
        type: 'petition',
        submittedAt: '2026-10-12T00:00:00Z',
        rule: { businessDays: 0, version: 1 },
      }),
    /deadline rule/,
  );
  assert.throws(
    () =>
      calculateDeadline({
        type: 'petition',
        submittedAt: '2026-10-12T00:00:00Z',
        rule: RULE,
        holidays: ['2026-02-30'],
      }),
    /Holiday dates/,
  );
  assert.equal(isValidDate('2026-02-30'), false);
});

test('reports due-today, overdue, approaching, completed and unavailable deadlines', () => {
  const snapshot = {
    dueDate: '2026-10-13',
    businessDays: 5,
    holidaysSnapshot: '[]',
    status: 'filed',
  };
  assert.equal(getDeadlineStatus(snapshot, new Date('2026-10-13T12:00:00Z')).status, 'approaching');
  assert.equal(getDeadlineStatus(snapshot, new Date('2026-10-14T00:00:00Z')).status, 'overdue');
  assert.equal(
    getDeadlineStatus({ ...snapshot, status: 'answered' }, new Date('2026-10-12T00:00:00Z')).status,
    'completed',
  );
  assert.equal(
    getDeadlineStatus({ ...snapshot, dueDate: null }, new Date('2026-10-12T00:00:00Z')).status,
    'unavailable',
  );
});

const app = await setupAdminApp();
after(() => app.close());

test('deadline settings are admin-only and reject malformed rule/holiday inputs', async () => {
  const anonymous = app.client();
  assert.equal((await anonymous.get('/api/admin/deadlines')).status, 401);

  await app.admin.accountService.create({
    email: 'processor@example.com',
    displayName: 'Read-only staff',
    password: 'staff-test-password-456',
    role: 'staff',
  });
  const staff = await app.loggedIn('processor@example.com', 'staff-test-password-456');
  assert.equal((await staff.get('/api/admin/deadlines')).status, 403);
  assert.equal(
    (await staff.put('/api/admin/deadlines/rules/petition', { businessDays: 3 })).status,
    403,
  );

  const admin = await app.loggedIn();
  assert.deepEqual((await admin.get('/api/admin/deadlines')).json.rules, []);
  assert.equal(
    (await admin.put('/api/admin/deadlines/rules/petition', { businessDays: 0 })).status,
    400,
  );
  assert.equal(
    (await admin.put('/api/admin/deadlines/holidays/2026-02-30', { name: 'Invalid' })).status,
    400,
  );
});

test('new requests snapshot their deadline rule and holidays; later config changes do not rewrite it', async () => {
  const admin = await app.loggedIn();
  const rulePath = '/api/admin/deadlines/rules/petition';
  const holidayPath = '/api/admin/deadlines/holidays/2026-10-12';
  const filedBeforeConfiguration = app.repository.create(sampleRequest(0), {
    now: app.clock.now(),
  });

  assert.equal((await admin.put(rulePath, { businessDays: 2 })).status, 200);
  assert.deepEqual((await admin.put(holidayPath, { name: 'Local holiday' })).json, {
    date: '2026-10-12',
    name: 'Local holiday',
  });
  assert.equal((await admin.get('/api/admin/deadlines')).json.holidays.length, 1);

  const publicClient = app.client();
  const publicSubmission = await publicClient.post('/api/pqrs', sampleRequest(0));
  assert.equal(publicSubmission.status, 201);
  assert.equal('deadline' in publicSubmission.json, false);
  const publicLookup = await publicClient.post('/api/pqrs/lookup', {
    caseNumber: publicSubmission.json.caseNumber,
    requesterEmail: 'ana@example.com',
  });
  assert.equal(publicLookup.status, 200);
  assert.equal('deadline' in publicLookup.json, false);
  assert.equal('deadlineDueDate' in publicLookup.json, false);

  const created = app.repository.create(sampleRequest(0), { now: app.clock.now() });
  const first = await admin.get(`/api/admin/pqrs/${created.caseNumber}`);
  assert.equal(first.json.pqrs.deadline.dueDate, '2026-10-14');
  assert.equal(first.json.pqrs.deadline.ruleId, 'petition:v1');
  assert.equal(first.json.pqrs.deadline.status, 'approaching');
  const oldRequest = await admin.get(`/api/admin/pqrs/${filedBeforeConfiguration.caseNumber}`);
  assert.equal(oldRequest.json.pqrs.deadline.status, 'unavailable');

  assert.equal((await admin.put(rulePath, { businessDays: 4 })).json.version, 2);
  assert.equal(
    (await admin.put(holidayPath, { name: 'Renamed local holiday' })).json.name,
    'Renamed local holiday',
  );
  assert.equal((await admin.get('/api/admin/deadlines')).json.holidays.length, 1);
  assert.equal((await admin.delete(holidayPath)).status, 200);
  const next = app.repository.create(sampleRequest(0), { now: app.clock.now() });

  const originalAfterChange = await admin.get(`/api/admin/pqrs/${created.caseNumber}`);
  const future = await admin.get(`/api/admin/pqrs/${next.caseNumber}`);
  assert.equal(originalAfterChange.json.pqrs.deadline.dueDate, '2026-10-14');
  assert.equal(originalAfterChange.json.pqrs.deadline.ruleId, 'petition:v1');
  assert.equal(future.json.pqrs.deadline.ruleId, 'petition:v2');
  assert.equal(future.json.pqrs.deadline.dueDate, '2026-10-15');

  assert.equal((await admin.delete(rulePath)).json.deleted, true);
  assert.equal((await admin.get('/api/admin/deadlines')).json.rules[0].active, 0);
  const withoutActiveRule = app.repository.create(sampleRequest(0), { now: app.clock.now() });
  assert.equal(
    (await admin.get(`/api/admin/pqrs/${withoutActiveRule.caseNumber}`)).json.pqrs.deadline.status,
    'unavailable',
  );
  const reactivated = await admin.put(rulePath, { businessDays: 1 });
  assert.equal(reactivated.json.version, 4);
  const afterReactivation = app.repository.create(sampleRequest(0), { now: app.clock.now() });
  assert.equal(
    (await admin.get(`/api/admin/pqrs/${afterReactivation.caseNumber}`)).json.pqrs.deadline.ruleId,
    'petition:v4',
  );
});
