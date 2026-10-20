export const EMAIL_NOTIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
});

export const EMAIL_NOTIFICATION_TYPES = Object.freeze({
  REQUEST_RECEIVED: 'request_received',
  RESPONSE_PUBLISHED: 'response_published',
});

export function createEmailNotificationRepository(db) {
  const insert = db.prepare(`
    INSERT INTO email_notifications (
      notification_type,
      pqrs_id,
      recipient_email,
      payload,
      status,
      attempt_count,
      created_at,
      next_attempt_at,
      notification_key
    )
    VALUES (
      @notificationType,
      @pqrsId,
      @recipientEmail,
      @payload,
      'pending',
      0,
      @createdAt,
      @nextAttemptAt,
      @notificationKey
    )
    ON CONFLICT(notification_key) DO NOTHING
  `);

  const selectDue = db.prepare(`
    SELECT
      id,
      notification_type AS notificationType,
      pqrs_id AS pqrsId,
      recipient_email AS recipientEmail,
      payload,
      status,
      attempt_count AS attemptCount,
      created_at AS createdAt,
      next_attempt_at AS nextAttemptAt,
      last_attempt_at AS lastAttemptAt,
      sent_at AS sentAt,
      last_error AS lastError
    FROM email_notifications
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= @now
    ORDER BY next_attempt_at ASC, id ASC
    LIMIT @limit
  `);

  const markProcessing = db.prepare(`
    UPDATE email_notifications
    SET status = 'processing',
        last_attempt_at = @now
    WHERE id = @id AND status IN ('pending', 'failed')
  `);

  const markSent = db.prepare(`
    UPDATE email_notifications
    SET status = 'sent',
        attempt_count = attempt_count + 1,
        last_attempt_at = @now,
        next_attempt_at = NULL,
        sent_at = @now,
        last_error = NULL
    WHERE id = @id
  `);

  const markRetry = db.prepare(`
    UPDATE email_notifications
    SET status = 'pending',
        attempt_count = attempt_count + 1,
        last_attempt_at = @now,
        next_attempt_at = @nextAttemptAt,
        last_error = @lastError
    WHERE id = @id
  `);

  const markFailed = db.prepare(`
    UPDATE email_notifications
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_attempt_at = @now,
        next_attempt_at = NULL,
        last_error = @lastError
    WHERE id = @id
  `);

  const MAX_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 5 * 60 * 1000;

  function normalizeError(error) {
    const message = String(error ?? 'unknown error').trim();
    return message.length > 200 ? `${message.slice(0, 197)}...` : message;
  }

  function parsePayload(payload) {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  function nextAttemptAt(baseDate, attemptCount) {
    const attempts = Math.max(1, Number(attemptCount) || 1);
    const delayMs = Math.min(RETRY_DELAY_MS * attempts, 30 * 60 * 1000);
    return new Date(baseDate.getTime() + delayMs).toISOString();
  }

  return {
    MAX_ATTEMPTS,
    RETRY_DELAY_MS,
    enqueue({ notificationType, pqrsId, recipientEmail, data, createdAt = new Date() }) {
      const timestamp = new Date(createdAt).toISOString();
      const result = insert.run({
        notificationType,
        pqrsId: Number(pqrsId),
        recipientEmail: String(recipientEmail ?? '')
          .trim()
          .toLowerCase(),
        payload: JSON.stringify({ ...data, notificationType }),
        createdAt: timestamp,
        nextAttemptAt: timestamp,
        notificationKey: `${notificationType}:${Number(pqrsId)}`,
      });
      return result.changes === 1;
    },
    findDue(limit = 20, now = new Date()) {
      return selectDue.all({ now: new Date(now).toISOString(), limit });
    },
    markProcessing(id, now = new Date()) {
      return markProcessing.run({ id, now: new Date(now).toISOString() }).changes === 1;
    },
    markSent(id, now = new Date()) {
      return markSent.run({ id, now: new Date(now).toISOString() }).changes === 1;
    },
    markRetry(id, now = new Date(), lastError, attemptCount) {
      return (
        markRetry.run({
          id,
          now: new Date(now).toISOString(),
          nextAttemptAt: nextAttemptAt(new Date(now), attemptCount),
          lastError: normalizeError(lastError),
        }).changes === 1
      );
    },
    markFailed(id, now = new Date(), lastError) {
      return (
        markFailed.run({
          id,
          now: new Date(now).toISOString(),
          lastError: normalizeError(lastError),
        }).changes === 1
      );
    },
    nextAttemptAt,
    normalizeError,
    parsePayload,
    async processPending({ limit = 20, now = new Date(), transport, logger = console } = {}) {
      const rows = this.findDue(limit, now);
      let sent = 0;
      let processed = 0;

      for (const row of rows) {
        processed += 1;
        if (!this.markProcessing(row.id, now)) continue;

        try {
          const payload = this.parsePayload(row.payload) ?? {};
          const result = await transport.send({
            to: row.recipientEmail,
            subject: payload.subject ?? `PQRS notification (${row.notificationType})`,
            text: payload.text ?? '',
            html: payload.html ?? null,
          });

          const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
          if (result?.accepted === false || rejected.length > 0) {
            throw new Error(result?.error ?? 'The email transport rejected the message.');
          }

          this.markSent(row.id, now);
          sent += 1;
        } catch (error) {
          const newAttempt = Number(row.attemptCount ?? 0) + 1;
          const sanitized = this.normalizeError(error);
          if (newAttempt >= this.MAX_ATTEMPTS) {
            this.markFailed(row.id, now, sanitized);
            logger.warn?.('Email notification failed permanently.', {
              id: row.id,
              type: row.notificationType,
              error: sanitized,
            });
          } else {
            this.markRetry(row.id, now, sanitized, newAttempt);
          }
        }
      }

      return { sent, processed };
    },
  };
}
