# Email delivery operations

PQRS Flow writes request-received and published-response notifications to the SQLite outbox in the same transaction as the corresponding request or publication. Delivery is asynchronous: SMTP failures do not undo saved PQRS data. The background worker runs only when `EMAIL_ENABLED=true`; while disabled, notifications remain queued and are not sent.

## Configure SMTP

Set these variables in the private runtime environment (never commit credentials):

| Variable                       | Default   | Purpose                                                                                              |
| ------------------------------ | --------- | ---------------------------------------------------------------------------------------------------- |
| `EMAIL_ENABLED`                | `false`   | Enables the outbox worker.                                                                           |
| `EMAIL_FROM`                   | empty     | Sender mailbox, optionally with a display name.                                                      |
| `SMTP_HOST`                    | empty     | SMTP hostname or IP address. Required when enabled.                                                  |
| `SMTP_PORT`                    | `587`     | SMTP port, from 1 to 65535.                                                                          |
| `SMTP_SECURE`                  | `false`   | Use direct TLS, commonly on port 465. With port 587, leave this false for SMTP STARTTLS negotiation. |
| `SMTP_USER` / `SMTP_PASS`      | empty     | Optional SMTP credentials; set both or neither.                                                      |
| `EMAIL_MAX_ATTEMPTS`           | `5`       | Maximum delivery attempts, 1–20.                                                                     |
| `EMAIL_RETRY_INITIAL_DELAY_MS` | `30000`   | First transient retry delay.                                                                         |
| `EMAIL_RETRY_MAX_DELAY_MS`     | `1800000` | Upper bound for exponential retry delay.                                                             |
| `EMAIL_WORKER_INTERVAL_MS`     | `60000`   | Delay between outbox polling cycles.                                                                 |
| `EMAIL_BATCH_SIZE`             | `20`      | Maximum messages attempted per polling cycle, 1–100.                                                 |
| `EMAIL_DELIVERY_TIMEOUT_MS`    | `30000`   | SMTP connection, greeting and socket inactivity timeout.                                             |
| `EMAIL_PROCESSING_LEASE_MS`    | `60000`   | Age after which an interrupted claim can be recovered; must exceed the delivery timeout.             |

Email booleans and numeric bounds are validated during configuration loading. When email is enabled, the sender and SMTP host are required, sender header newlines are rejected, and SMTP username/password must be paired. Invalid configuration prevents the server from starting rather than silently disabling delivery.

PowerShell example:

```powershell
$env:EMAIL_ENABLED = 'true'
$env:EMAIL_FROM = 'PQRS Flow <no-reply@example.com>'
$env:SMTP_HOST = 'smtp.example.com'
$env:SMTP_PORT = '587'
$env:SMTP_SECURE = 'false'
npm start
```

In Compose, set the same values through the protected `.env` file or the deployment secret manager. Do not put credentials in the Compose file, Docker image, or shell command history.

## Retry and delivery guarantees

- SMTP 4xx responses and network failures are retryable. Retries use exponential delays beginning at the configured initial delay and capped at the configured maximum.
- SMTP 5xx recipient/server rejections, authentication failures and invalid envelopes are terminal. Delivery is marked failed and is not retried indefinitely.
- The worker claims each row using an atomic SQLite state change and a per-attempt claim token. Updates are fenced by that token. This prevents simultaneous workers from sending the same active claim under the supported single-instance deployment model.
- On startup, claims older than the processing lease are recovered for retry, unless they already exhausted their attempt budget.
- SMTP cannot provide general exactly-once delivery. If the SMTP server accepts a message and the process stops before SQLite records success, recovery may send it again. The outbox reduces duplicate risk; it cannot eliminate this crash-boundary case.
- Each message has one recipient. Templates provide plain text and escaped HTML and contain no internal notes, staff identity or unpublished response.

## Check delivery health

An administrator can call `GET /api/admin/email-outbox` from an authenticated staff session. Only administrators have the `email:operations:read` permission. The response includes pending, processing, delivered and failed counts; oldest pending age; and timestamps for the last success and delivery error. It excludes recipient addresses, full message content, SMTP credentials and raw error details.

For startup and worker diagnostics, inspect application logs without copying secrets into support tickets:

```powershell
docker compose logs --tail 200 app
```

Raw SMTP error text and credentials are not logged or returned by the operational endpoint. A failed message's stored error is a bounded, generic failure class/code for internal diagnosis. Correct the SMTP configuration or recipient problem before considering manual data changes; do not directly edit the outbox table while the server is running.

## Local verification

`npm test` includes isolated SMTP protocol tests using an in-process local test server. It verifies successful Nodemailer delivery, 4xx retry, 5xx rejection, authentication failure, connection failure, and disabled delivery. It needs no external provider or real SMTP credentials. These tests do not prove that a production provider accepts mail or that a deployed network permits SMTP traffic.

For Docker, set `EMAIL_ENABLED=false` for an SMTP-free smoke test. To exercise the enabled-but-unreachable path, use an isolated Compose project and a test-only SMTP host; verify the app health and inspect only sanitized worker diagnostics.

## Limits

- PQRS Flow is a single-instance SQLite application. Do not run multiple application replicas against the same database.
- Delivery is asynchronous and best effort; there is no provider webhook, bounce processing, complaint feedback loop, or exactly-once guarantee.
- When email is disabled, pending rows are retained. Enabling delivery later will process eligible queued messages.
- SMTP connectivity and credentials must be verified in the target environment; local protocol tests cannot substitute for that check.
