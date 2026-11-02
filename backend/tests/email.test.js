import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createEmailNotificationRepository } from '../src/repositories/email-notifications.repository.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { createEmailProcessor } from '../src/services/email.js';

const databases = [];
after(() => databases.forEach((db) => db.close()));

function setup() {
  const db = openDatabase({ filename: ':memory:' });
  databases.push(db);
  return db;
}

function addRequest(db, now = new Date('2026-11-02T12:00:00.000Z')) {
  return createPqrsRepository(db).create(
    {
      type: 'petition',
      subject: 'Broken streetlight',
      description: 'Private request description.',
      requesterName: 'Ana Gomez',
      requesterEmail: 'ana@example.com',
    },
    { now },
  );
}

test('outbox delivery renders citizen-safe receipts and published-response notices', async () => {
  const db = setup();
  const now = new Date('2026-11-02T12:00:00.000Z');
  const request = addRequest(db, now);
  const notifications = createEmailNotificationRepository(db);
  notifications.enqueue({
    notificationType: 'response_published',
    pqrsId: request.id,
    recipientEmail: request.requesterEmail,
    data: { caseNumber: request.caseNumber, text: 'Your request has been addressed.' },
    createdAt: now,
  });
  const messages = [];
  const processor = createEmailProcessor({
    db,
    enabled: true,
    transport: {
      isEnabled: () => true,
      async send(message) {
        messages.push(message);
        return { accepted: true, rejected: [] };
      },
    },
  });

  assert.deepEqual(await processor.processOnce(20, now), { sent: 2, processed: 2 });
  assert.equal(messages[0].subject, `We received your PQRS ${request.caseNumber}`);
  assert.match(messages[0].text, /Reference: PQRS-2026-000001/);
  assert.doesNotMatch(messages[0].text, /Private request description/);
  assert.equal(messages[1].subject, `Update on your PQRS ${request.caseNumber}`);
  assert.match(messages[1].text, /Your request has been addressed/);
  assert.ok(
    db.prepare("SELECT COUNT(*) AS total FROM email_notifications WHERE status = 'sent'").get()
      .total === 2,
  );
});

test('stopping the outbox worker waits for its in-flight delivery', async () => {
  const db = setup();
  addRequest(db);
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let finishDelivery;
  const processor = createEmailProcessor({
    db,
    enabled: true,
    transport: {
      isEnabled: () => true,
      send() {
        markStarted();
        return new Promise((resolve) => {
          finishDelivery = resolve;
        });
      },
    },
  });
  const worker = processor.start(60_000);

  await started;
  let stopped = false;
  const stopping = worker.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);

  finishDelivery({ accepted: true, rejected: [] });
  await stopping;
  assert.equal(stopped, true);
  assert.equal(
    db
      .prepare(
        "SELECT status FROM email_notifications WHERE notification_type = 'request_received'",
      )
      .get().status,
    'sent',
  );
});

test('worker startup recovers a delivery interrupted by a previous process', async () => {
  const db = setup();
  const request = addRequest(db);
  const notifications = createEmailNotificationRepository(db);
  const row = notifications.findDue()[0];
  assert.equal(notifications.markProcessing(row.id), true);

  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const processor = createEmailProcessor({
    db,
    enabled: true,
    transport: {
      isEnabled: () => true,
      async send(message) {
        assert.equal(message.to, request.requesterEmail);
        markStarted();
        return { accepted: true, rejected: [] };
      },
    },
  });
  const worker = processor.start(60_000);

  await started;
  await worker.stop();
  const recovered = db
    .prepare(
      "SELECT status, attempt_count AS attemptCount FROM email_notifications WHERE notification_type = 'request_received'",
    )
    .get();
  assert.equal(recovered.status, 'sent');
  assert.equal(recovered.attemptCount, 2);
});

test('worker startup warns when an interrupted delivery has exhausted its retries', async () => {
  const db = setup();
  addRequest(db);
  db.prepare(
    `
    UPDATE email_notifications
    SET status = 'processing', attempt_count = 5, last_attempt_at = ?, next_attempt_at = NULL
  `,
  ).run(new Date().toISOString());
  const warnings = [];
  const processor = createEmailProcessor({
    db,
    enabled: true,
    logger: { warn: (...args) => warnings.push(args) },
    transport: {
      isEnabled: () => true,
      async send() {
        assert.fail('Exhausted notifications must not be sent again.');
      },
    },
  });
  const worker = processor.start(60_000);

  await worker.stop();
  const notification = db
    .prepare('SELECT status, last_error AS lastError FROM email_notifications')
    .get();
  assert.equal(notification.status, 'failed');
  assert.match(notification.lastError, /maximum number of attempts/);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].count, 1);
});
