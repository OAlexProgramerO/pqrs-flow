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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export function renderEmailContent(type, data) {
  const caseNumber = String(data.caseNumber ?? '');
  const subject =
    type === EMAIL_NOTIFICATION_TYPES.RESPONSE_PUBLISHED
      ? `Update on your PQRS ${caseNumber}`
      : `We received your PQRS ${caseNumber}`;
  const heading =
    type === EMAIL_NOTIFICATION_TYPES.RESPONSE_PUBLISHED
      ? 'An official response is available'
      : 'We received your request';

  if (type === EMAIL_NOTIFICATION_TYPES.RESPONSE_PUBLISHED) {
    const response = String(data.text ?? '');
    return {
      subject,
      text: `Your PQRS ${caseNumber} has a published response.\n\nResponse: ${response}\n\nKeep your case number to check its status.`,
      html: `<main style="font-family:Arial,sans-serif;line-height:1.5;color:#17212b"><h1 style="font-size:22px">${heading}</h1><p>Your PQRS reference is <strong>${escapeHtml(caseNumber)}</strong>.</p><h2 style="font-size:18px">Official response</h2><p style="white-space:pre-wrap">${escapeHtml(response)}</p><p>Keep your case number to check its status.</p></main>`,
    };
  }

  const requestSubject = String(data.subject ?? '');
  return {
    subject,
    text: `We received your PQRS ${caseNumber}.\n\nReference: ${caseNumber}\nSubject: ${requestSubject}\n\nKeep your case number to check its status.`,
    html: `<main style="font-family:Arial,sans-serif;line-height:1.5;color:#17212b"><h1 style="font-size:22px">${heading}</h1><p>We received your request.</p><p>Reference: <strong>${escapeHtml(caseNumber)}</strong></p><p>Subject: ${escapeHtml(requestSubject)}</p><p>Keep your case number to check its status.</p></main>`,
  };
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
  if (
    !host ||
    /[\s\r\n]/.test(host) ||
    !from ||
    /[\r\n]/.test(from) ||
    !/^(?:[^<>\s@]+@[^<>\s@]+|[^<>\r\n]*<[^<>\s@]+@[^<>\s@]+>)$/.test(from)
  ) {
    throw new Error('EMAIL_ENABLED is true but SMTP_HOST and EMAIL_FROM are not configured.');
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default ?? nodemailer;
  const client = transporter.createTransport({
    host,
    port: Number(config.smtp.port) || 587,
    secure: Boolean(config.smtp.secure),
    connectionTimeout: config.deliveryTimeoutMs,
    greetingTimeout: config.deliveryTimeoutMs,
    socketTimeout: config.deliveryTimeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
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
      if (Array.isArray(info.rejected) && info.rejected.length > 0) {
        const rejection = info.rejectedErrors?.[0] ?? {};
        const error = new Error('SMTP rejected the message.');
        error.code = rejection.code;
        error.responseCode = rejection.responseCode;
        error.permanent = Number(rejection.responseCode) >= 500;
        throw error;
      }
      return {
        accepted: Array.isArray(info.accepted) ? info.accepted.length > 0 : true,
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
  enabled,
  config = env.email,
} = {}) {
  const settings = { ...config, enabled: enabled ?? config.enabled ?? env.email.enabled };
  const transportPromise = transport ? Promise.resolve(transport) : createEmailTransport(settings);
  const repository = createEmailNotificationRepository(db, settings);

  async function getTransport() {
    return transportPromise;
  }

  async function processOnce(
    limit = settings.batchSize,
    now = new Date(),
    getNow = () => new Date(),
  ) {
    if (!settings.enabled) return { sent: 0, processed: 0, skipped: true };
    const resolvedTransport = await getTransport();
    if (!resolvedTransport?.isEnabled?.()) {
      return { sent: 0, processed: 0, skipped: true };
    }

    return repository.processPending({
      limit,
      now,
      getNow,
      transport: resolvedTransport,
      render: renderEmailContent,
      logger,
    });
  }

  function start(intervalMs = settings.workerIntervalMs) {
    const recovery = repository.recoverInterrupted();
    if (recovery.failed > 0) {
      logger.warn?.('Interrupted email notifications reached the retry limit.', {
        count: recovery.failed,
      });
    }

    let inFlight;
    let stopped = false;

    function run() {
      if (stopped) return Promise.resolve();
      if (inFlight) return inFlight;

      inFlight = processOnce()
        .catch((error) => {
          const code = String(error?.code ?? 'EMAIL_WORKER_ERROR')
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '')
            .slice(0, 32);
          logger.error?.('Email outbox processing failed.', { code });
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    }

    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    void run();

    return {
      timer,
      processOnce,
      async stop() {
        stopped = true;
        clearInterval(timer);
        await inFlight;
      },
    };
  }

  return { processOnce, start };
}
