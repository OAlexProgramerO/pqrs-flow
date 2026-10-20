import { createEmailNotificationRepository } from '../repositories/email-notifications.repository.js';
import { env } from '../config/env.js';

export const EMAIL_NOTIFICATION_TYPES = Object.freeze({
  REQUEST_RECEIVED: 'request_received',
  RESPONSE_PUBLISHED: 'response_published',
});

export function sanitizeRecipientEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function renderEmailContent(type, data) {
  const subject =
    type === EMAIL_NOTIFICATION_TYPES.RESPONSE_PUBLISHED
      ? `Update on your PQRS ${data.caseNumber}`
      : `We received your PQRS ${data.caseNumber}`;

  const text =
    type === EMAIL_NOTIFICATION_TYPES.RESPONSE_PUBLISHED
      ? `Your PQRS ${data.caseNumber} has a published response.\n\nResponse: ${data.text}\n\nYou can review the public status for your case at any time.`
      : `We received your PQRS ${data.caseNumber}.\n\nReference: ${data.caseNumber}\nSubject: ${data.subject}\n\nWe will contact you if more information is needed.`;

  return { subject, text, html: null };
}

export async function createEmailTransport(config = env.email) {
  if (!config.enabled) {
    return {
      async send() {
        return { accepted: true, skipped: true, rejected: [] };
      },
      isEnabled() {
        return false;
      },
    };
  }

  const host = String(config.smtp.host ?? '').trim();
  const from = String(config.from ?? '').trim();
  if (!host || !from) {
    throw new Error('EMAIL_ENABLED is true but SMTP_HOST and EMAIL_FROM are not configured.');
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default ?? nodemailer;
  const client = transporter.createTransport({
    host,
    port: Number(config.smtp.port) || 587,
    secure: Boolean(config.smtp.secure),
    auth:
      config.smtp.user || config.smtp.pass
        ? { user: config.smtp.user || '', pass: config.smtp.pass || '' }
        : undefined,
  });

  return {
    async send({ to, subject, text, html }) {
      const info = await client.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      return {
        accepted: Array.isArray(info.accepted) ? info.accepted.length > 0 : true,
        rejected: Array.isArray(info.rejected) ? info.rejected : [],
        messageId: info.messageId,
      };
    },
    isEnabled() {
      return true;
    },
  };
}

export function createEmailProcessor({
  db,
  transport = null,
  logger = console,
  enabled = env.email.enabled,
} = {}) {
  const transportPromise = transport ? Promise.resolve(transport) : createEmailTransport(env.email);
  const repository = createEmailNotificationRepository(db);

  async function getTransport() {
    return transportPromise;
  }

  async function processOnce(limit = 20, now = new Date()) {
    const resolvedTransport = await getTransport();
    if (!enabled || !resolvedTransport?.isEnabled?.()) {
      return { sent: 0, processed: 0, skipped: true };
    }

    return repository.processPending({
      limit,
      now,
      transport: resolvedTransport,
      logger,
    });
  }

  function start(intervalMs = 60_000) {
    const timer = setInterval(async () => {
      try {
        await processOnce();
      } catch (error) {
        logger.error?.('Email outbox processing failed.', error);
      }
    }, intervalMs);
    timer.unref?.();
    return { timer, processOnce, stop: () => clearInterval(timer) };
  }

  return { processOnce, start };
}
