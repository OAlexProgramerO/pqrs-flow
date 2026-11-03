import { randomUUID } from 'node:crypto';

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

export function createEmailNotificationRepository(
  db,
  {
    maxAttempts = 5,
    retryInitialDelayMs = 30_000,
    retryMaxDelayMs = 1_800_000,
    processingLeaseMs = 60_000,
  } = {},
) {
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
    WHERE status = 'pending'
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= @now
    ORDER BY next_attempt_at ASC, id ASC
    LIMIT @limit
  `);

  const markProcessing = db.prepare(`
    UPDATE email_notifications
    SET status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempt_at = @now,
        claim_token = @claimToken
    WHERE id = @id AND status = 'pending'
  `);

  const markSent = db.prepare(`
    UPDATE email_notifications
    SET status = 'sent',
        last_attempt_at = @now,
        next_attempt_at = NULL,
        sent_at = @now,
        last_error = NULL,
        last_error_at = NULL,
        claim_token = NULL
    WHERE id = @id AND status = 'processing' AND claim_token = @claimToken
  `);

  const markRetry = db.prepare(`
    UPDATE email_notifications
    SET status = 'pending',
        last_attempt_at = @now,
        next_attempt_at = @nextAttemptAt,
        last_error = @lastError,
        last_error_at = @now,
        claim_token = NULL
    WHERE id = @id AND status = 'processing' AND claim_token = @claimToken
  `);

  const markFailed = db.prepare(`
    UPDATE email_notifications
    SET status = 'failed',
        last_attempt_at = @now,
        next_attempt_at = NULL,
        last_error = @lastError,
        last_error_at = @now,
        claim_token = NULL
    WHERE id = @id AND status = 'processing' AND claim_token = @claimToken
  `);
  const countInterruptedAtLimit = db.prepare(`
    SELECT COUNT(*) AS total
    FROM email_notifications
    WHERE status = 'processing'
      AND attempt_count >= @maxAttempts
      AND last_attempt_at <= @staleBefore
  `);
  const recoverInterrupted = db.prepare(`
    UPDATE email_notifications
    SET status = CASE WHEN attempt_count >= @maxAttempts THEN 'failed' ELSE 'pending' END,
        next_attempt_at = CASE WHEN attempt_count >= @maxAttempts THEN NULL ELSE @now END,
        last_error = CASE
          WHEN attempt_count >= @maxAttempts THEN @lastError
          ELSE NULL
        END,
        last_error_at = CASE
          WHEN attempt_count >= @maxAttempts THEN @now
          ELSE last_error_at
        END,
        claim_token = NULL
    WHERE status = 'processing' AND last_attempt_at <= @staleBefore
  `);
  const summaryQuery = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') AS pendingCount,
      COUNT(*) FILTER (WHERE status = 'processing') AS processingCount,
      COUNT(*) FILTER (WHERE status = 'sent') AS deliveredCount,
      COUNT(*) FILTER (WHERE status = 'failed') AS failedCount,
      MIN(created_at) FILTER (WHERE status = 'pending') AS oldestPendingAt,
      MAX(sent_at) FILTER (WHERE status = 'sent') AS lastSuccessfulDeliveryAt,
      MAX(last_error_at) FILTER (WHERE last_error_at IS NOT NULL) AS lastFailureAt
    FROM email_notifications
  `);

  function classifyError(error) {
    const responseCode = Number(error?.responseCode);
    const code = String(error?.code ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '')
      .slice(0, 32);
    const hasResponseCode = responseCode >= 400 && responseCode <= 599;
    const permanent =
      error?.permanent === true ||
      (hasResponseCode ? responseCode >= 500 : code === 'EAUTH' || code === 'EENVELOPE');

    return {
      retryable: !permanent,
      code: hasResponseCode ? `SMTP_${responseCode}` : code || 'SMTP_DELIVERY_FAILED',
      message: permanent
        ? 'SMTP permanently rejected the message.'
        : 'SMTP delivery failed temporarily.',
    };
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
    const delayMs = Math.min(retryInitialDelayMs * 2 ** (attempts - 1), retryMaxDelayMs);
    return new Date(baseDate.getTime() + delayMs).toISOString();
  }

  const recoverInterruptedTransaction = db.transaction((now) => {
    const staleBefore = new Date(now.getTime() - processingLeaseMs).toISOString();
    const failed = countInterruptedAtLimit.get({ maxAttempts, staleBefore }).total;
    const result = recoverInterrupted.run({
      now: now.toISOString(),
      maxAttempts,
      staleBefore,
      lastError: 'Delivery was interrupted after the maximum number of attempts.',
    });
    return { requeued: result.changes - failed, failed };
  });

  return {
    MAX_ATTEMPTS: maxAttempts,
    RETRY_INITIAL_DELAY_MS: retryInitialDelayMs,
    RETRY_MAX_DELAY_MS: retryMaxDelayMs,
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
    markProcessing(id, now = new Date(), claimToken = randomUUID()) {
      return (
        markProcessing.run({
          id,
          now: new Date(now).toISOString(),
          claimToken,
        }).changes === 1
      );
    },
    markSent(id, claimToken, now = new Date()) {
      return (
        markSent.run({
          id,
          now: new Date(now).toISOString(),
          claimToken,
        }).changes === 1
      );
    },
    markRetry(id, claimToken, now = new Date(), lastError, attemptCount) {
      return (
        markRetry.run({
          id,
          now: new Date(now).toISOString(),
          nextAttemptAt: nextAttemptAt(new Date(now), attemptCount),
          lastError,
          claimToken,
        }).changes === 1
      );
    },
    markFailed(id, claimToken, now = new Date(), lastError) {
      return (
        markFailed.run({
          id,
          now: new Date(now).toISOString(),
          lastError,
          claimToken,
        }).changes === 1
      );
    },
    recoverInterrupted(now = new Date()) {
      return recoverInterruptedTransaction.immediate(new Date(now));
    },
    getOperationalSummary(now = new Date()) {
      const summary = summaryQuery.get();
      const oldestPendingAt = summary.oldestPendingAt ?? null;
      return {
        pendingCount: summary.pendingCount,
        processingCount: summary.processingCount,
        deliveredCount: summary.deliveredCount,
        failedCount: summary.failedCount,
        oldestPendingAt,
        oldestPendingAgeMs: oldestPendingAt
          ? Math.max(0, new Date(now).getTime() - new Date(oldestPendingAt).getTime())
          : null,
        lastSuccessfulDeliveryAt: summary.lastSuccessfulDeliveryAt ?? null,
        lastFailureAt: summary.lastFailureAt ?? null,
      };
    },
    nextAttemptAt,
    classifyError,
    parsePayload,
    async processPending({
      limit = 20,
      now = new Date(),
      getNow = () => new Date(),
      transport,
      render,
      logger = console,
    } = {}) {
      const rows = this.findDue(limit, now);
      let sent = 0;
      let processed = 0;

      for (const row of rows) {
        const claimToken = randomUUID();
        if (!this.markProcessing(row.id, now, claimToken)) continue;
        processed += 1;

        try {
          const payload = this.parsePayload(row.payload);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            const error = new Error('Invalid email notification payload.');
            error.permanent = true;
            error.code = 'INVALID_PAYLOAD';
            throw error;
          }
          const content = render
            ? render(row.notificationType, payload)
            : {
                subject: payload.subject ?? `PQRS notification (${row.notificationType})`,
                text: payload.text ?? '',
                html: payload.html ?? null,
              };
          const result = await transport.send({
            to: row.recipientEmail,
            ...content,
          });

          const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
          if (result?.accepted === false || rejected.length > 0) {
            const rejection = rejected[0] ?? {};
            const error = new Error('SMTP rejected the message.');
            error.responseCode = rejection.responseCode;
            error.code = rejection.code;
            error.permanent = rejection.permanent;
            throw error;
          }

          if (this.markSent(row.id, claimToken, getNow())) {
            sent += 1;
          } else {
            logger.error?.('Email outbox claim was lost after delivery.', {
              id: row.id,
              type: row.notificationType,
            });
          }
        } catch (error) {
          const attempts = Number(row.attemptCount ?? 0) + 1;
          const failure = this.classifyError(error);
          const failureAt = getNow();
          if (!failure.retryable || attempts >= maxAttempts) {
            if (
              this.markFailed(row.id, claimToken, failureAt, `${failure.code}: ${failure.message}`)
            ) {
              logger.warn?.('Email notification failed permanently.', {
                id: row.id,
                type: row.notificationType,
                attempts,
                code: failure.code,
              });
            }
          } else if (
            !this.markRetry(
              row.id,
              claimToken,
              failureAt,
              `${failure.code}: ${failure.message}`,
              attempts,
            )
          ) {
            logger.error?.('Email outbox claim was lost after a delivery failure.', {
              id: row.id,
              type: row.notificationType,
              code: failure.code,
            });
          }
        }
      }

      return { sent, processed };
    },
  };
}
