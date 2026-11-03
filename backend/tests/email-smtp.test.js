import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { openDatabase } from '../src/db/database.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';
import { createEmailProcessor, createEmailTransport } from '../src/services/email.js';
import { startSmtpTestServer } from './helpers/smtp-test-server.js';

const databases = [];
const smtpServers = [];
after(async () => {
  for (const db of databases) db.close();
  await Promise.all(smtpServers.map((server) => server.close()));
});

function setupDatabase() {
  const db = openDatabase({ filename: ':memory:' });
  databases.push(db);
  const request = createPqrsRepository(db).create(
    {
      type: 'petition',
      subject: 'Subject <script>alert(1)</script>',
      description: 'A request body that must not be sent in notification emails.',
      requesterName: 'Ana Example',
      requesterEmail: 'ana@example.com',
    },
    { now: new Date('2026-11-02T12:00:00.000Z') },
  );
  return { db, request };
}

async function smtpServer(options) {
  const server = await startSmtpTestServer(options);
  smtpServers.push(server);
  return server;
}

function emailConfig(port, overrides = {}) {
  return {
    enabled: true,
    from: 'PQRS Flow <no-reply@example.com>',
    smtp: { host: '127.0.0.1', port, secure: false, user: '', pass: '' },
    maxAttempts: 4,
    retryInitialDelayMs: 1_000,
    retryMaxDelayMs: 8_000,
    workerIntervalMs: 60_000,
    batchSize: 10,
    deliveryTimeoutMs: 2_000,
    processingLeaseMs: 5_000,
    ...overrides,
  };
}

test('real Nodemailer transport delivers a plain-text and escaped HTML receipt to local SMTP', async () => {
  const smtp = await smtpServer();
  const { db, request } = setupDatabase();
  const processor = createEmailProcessor({
    db,
    config: emailConfig(smtp.port),
  });

  assert.deepEqual(await processor.processOnce(), { sent: 1, processed: 1 });
  assert.equal(smtp.messages.length, 1);
  assert.match(smtp.messages[0], /We received your PQRS/);
  assert.match(smtp.messages[0], /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(smtp.messages[0], /A request body that must not be sent/);
  assert.match(smtp.messages[0], new RegExp(request.caseNumber));
});

test('local SMTP 4xx responses are retried while 5xx recipient failures are terminal', async () => {
  const temporarySmtp = await smtpServer({ rejectRecipientCode: 451 });
  const temporary = setupDatabase();
  const temporaryProcessor = createEmailProcessor({
    db: temporary.db,
    config: emailConfig(temporarySmtp.port),
  });
  const now = new Date('2026-11-02T12:00:00.000Z');

  await temporaryProcessor.processOnce(undefined, now, () => now);
  const retry = temporary.db
    .prepare(
      'SELECT status, attempt_count AS attempts, next_attempt_at AS nextAttemptAt FROM email_notifications',
    )
    .get();
  assert.equal(retry.status, 'pending');
  assert.equal(retry.attempts, 1);
  assert.equal(retry.nextAttemptAt, '2026-11-02T12:00:01.000Z');

  const permanentSmtp = await smtpServer({ rejectRecipientCode: 550 });
  const permanent = setupDatabase();
  const permanentProcessor = createEmailProcessor({
    db: permanent.db,
    config: emailConfig(permanentSmtp.port),
    logger: { warn() {}, error() {} },
  });
  await permanentProcessor.processOnce(undefined, now, () => now);
  const failed = permanent.db
    .prepare('SELECT status, attempt_count AS attempts FROM email_notifications')
    .get();
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 1);
});

test('local SMTP authentication failure is terminal and does not expose credentials', async () => {
  const smtp = await smtpServer({ rejectAuth: true });
  const { db } = setupDatabase();
  const config = emailConfig(smtp.port, {
    smtp: {
      host: '127.0.0.1',
      port: smtp.port,
      secure: false,
      user: 'test-user',
      pass: 'test-only-secret',
    },
  });
  const processor = createEmailProcessor({
    db,
    config,
    logger: { warn() {}, error() {} },
  });

  await processor.processOnce();
  const notification = db
    .prepare('SELECT status, last_error AS lastError FROM email_notifications')
    .get();
  assert.equal(notification.status, 'failed');
  assert.doesNotMatch(notification.lastError, /test-user|test-only-secret|credentials/i);
});

test('a local SMTP connection failure is recorded as retryable', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });

  const { db } = setupDatabase();
  const processor = createEmailProcessor({
    db,
    config: emailConfig(port, { deliveryTimeoutMs: 1_000, processingLeaseMs: 2_000 }),
    logger: { warn() {}, error() {} },
  });
  await processor.processOnce();
  const notification = db
    .prepare(
      'SELECT status, attempt_count AS attempts, last_error AS lastError FROM email_notifications',
    )
    .get();
  assert.equal(notification.status, 'pending');
  assert.equal(notification.attempts, 1);
  assert.doesNotMatch(notification.lastError, /pass|secret/i);
});

test('disabled email processing leaves queued deliveries untouched and performs no SMTP work', async () => {
  const { db } = setupDatabase();
  const processor = createEmailProcessor({
    db,
    enabled: false,
    transport: {
      isEnabled() {
        assert.fail('SMTP must not be accessed while email is disabled.');
      },
    },
  });

  assert.deepEqual(await processor.processOnce(), { sent: 0, processed: 0, skipped: true });
  assert.equal(db.prepare('SELECT status FROM email_notifications').get().status, 'pending');
});

test('invalid enabled email configuration is rejected before any delivery attempt', async () => {
  await assert.rejects(
    createEmailTransport({
      enabled: true,
      from: 'sender@example.com\r\nBcc: victim@example.com',
      smtp: { host: '127.0.0.1', port: 25, secure: false, user: '', pass: '' },
      deliveryTimeoutMs: 1_000,
    }),
    /EMAIL_FROM/,
  );
});
