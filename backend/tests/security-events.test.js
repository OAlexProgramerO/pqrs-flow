import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createSecurityEventRepository } from '../src/repositories/security-events.repository.js';

test('security events are paginated, filterable and append-only', (t) => {
  const db = openDatabase({ filename: ':memory:' });
  t.after(() => db.close());
  const repository = createSecurityEventRepository(db);
  repository.log({
    eventType: 'login_success',
    requestId: 'req-1',
    details: { mfaUsed: true },
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
  });
  repository.log({
    eventType: 'login_failed',
    requestId: 'req-2',
    details: { reason: 'bad_mfa' },
    createdAt: new Date('2026-01-02T12:00:00.000Z'),
  });

  const page = repository.listPage({ eventType: 'login_failed', page: 1, pageSize: 10 });
  assert.equal(page.totalItems, 1);
  assert.equal(page.items[0].requestId, 'req-2');
  assert.deepEqual(page.items[0].details, { reason: 'bad_mfa' });
  assert.throws(
    () => db.prepare("UPDATE security_events SET details = '{}' WHERE request_id = 'req-2'").run(),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM security_events WHERE request_id = 'req-2'").run(),
    /append-only/,
  );
});
