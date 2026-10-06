# API reference

Base URL in development: `http://localhost:3000/api`

All responses are JSON. Errors always have the shape `{ "error": "message" }`, with optional extra fields described below.

## Common behavior

| Topic        | Behavior                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Request id   | Every response has an `X-Request-Id` header. Send your own (8-64 letters, digits, `-`, `_`) to reuse it. |
| Body size    | JSON bodies larger than 16 KB are rejected with `413`.                                                   |
| Content type | Send `Content-Type: application/json`. Other content types are ignored and fail validation.              |
| Security     | Responses carry the headers set by `helmet` (content security policy, `nosniff`, and more).              |
| Rate limit   | Only the lookup is limited for now. A `429` includes a `Retry-After` header in seconds.                  |

## Endpoints

### `GET /api/health`

Checks that the server is running. Used by the frontend and by monitoring tools.

**Response `200 OK`**

```json
{
  "status": "ok",
  "service": "pqrs-flow",
  "version": "0.1.1",
  "timestamp": "2026-10-04T12:00:00.000Z"
}
```

| Field       | Description                              |
| ----------- | ---------------------------------------- |
| `status`    | Always `ok` when the server answers      |
| `service`   | Service name                             |
| `version`   | Version read from `backend/package.json` |
| `timestamp` | Current server time in ISO 8601 format   |

### `POST /api/pqrs`

Submits a new request and returns its case number.

**Request body**

```json
{
  "type": "petition",
  "subject": "Street light is broken",
  "description": "The street light in front of my house has been off for two weeks.",
  "requesterName": "Ana Gomez",
  "requesterEmail": "ana@example.com"
}
```

| Field            | Rules                                                  |
| ---------------- | ------------------------------------------------------ |
| `type`           | One of `petition`, `complaint`, `claim`, `suggestion`  |
| `subject`        | 5 to 100 characters                                    |
| `description`    | 20 to 2000 characters                                  |
| `requesterName`  | 2 to 100 characters                                    |
| `requesterEmail` | Valid email, up to 254 characters. Saved in lowercase. |
| `website`        | Anti-bot field. Must be missing or empty.              |

Text is trimmed before it is checked. The same rules run in the browser and on the server (`shared/validation.js`).

**Response `201 Created`**

```json
{
  "caseNumber": "PQRS-2026-000001",
  "type": "petition",
  "subject": "Street light is broken",
  "status": "filed",
  "createdAt": "2026-10-04T12:00:00.000Z"
}
```

The response never repeats the description, the name or the email.

**Errors**

| Status | Body                                                                                 | When                                      |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "subject": "Subject is required." } }` | One or more fields are invalid            |
| `400`  | `{ "error": "Invalid submission" }`                                                  | The `website` field is filled in          |
| `400`  | `{ "error": "Malformed JSON body" }`                                                 | The body is not valid JSON                |
| `413`  | `{ "error": "Request body too large" }`                                              | The body is larger than 16 KB             |
| `500`  | `{ "error": "Internal server error", "requestId": "..." }`                           | Unexpected failure. Quote the request id. |

### `POST /api/pqrs/lookup`

Checks the status of a request. It needs the case number **and** the email used to submit it.

**Request body**

```json
{
  "caseNumber": "PQRS-2026-000001",
  "requesterEmail": "ana@example.com"
}
```

| Field            | Rules                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `caseNumber`     | Format `PQRS-YYYY-NNNNNN`. Spaces and lowercase letters are accepted. |
| `requesterEmail` | Valid email. The case of the letters does not matter.                 |

**Response `200 OK`**

```json
{
  "caseNumber": "PQRS-2026-000001",
  "type": "petition",
  "status": "filed",
  "createdAt": "2026-10-04T12:00:00.000Z"
}
```

`status` is one of `filed`, `in_progress`, `answered`, `closed`. The response never contains the subject, the description, the name or the email, and it carries `Cache-Control: no-store`.

**Errors**

| Status | Body                                                                                   | When                                      |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "caseNumber": "..." } }`                 | A field is missing or badly formed        |
| `400`  | `{ "error": "Malformed JSON body" }`                                                   | The body is not valid JSON                |
| `404`  | `{ "error": "No request matches that case number and email." }`                        | No request has that case number and email |
| `429`  | `{ "error": "Too many attempts. Please try again later." }` and a `Retry-After` header | Too many attempts (see the limits below)  |

**Why it works this way**

| Choice                                                      | Reason                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Case number **and** email are both required                 | Case numbers are sequential, so anyone could guess them. The email proves who is asking. |
| A wrong email and an unknown case number get the same `404` | Nobody can use the API to find out which case numbers exist.                             |
| `POST` instead of `GET`                                     | URLs are stored in logs and in the browser history. A body is not.                       |
| Only status, type and dates are returned                    | The person already knows the rest, and less data means less to leak.                     |

**Rate limits**

| Limit                       | Value               | Protects against                                   |
| --------------------------- | ------------------- | -------------------------------------------------- |
| Attempts per client address | 30 every 15 minutes | One computer trying many case numbers              |
| Attempts per case number    | 8 every 15 minutes  | Guessing the email of one case from many computers |

Every attempt counts, successful or not. The counters live in the memory of the server and restart with it. Known trade-off: someone who knows a case number can use up its 8 attempts and make the owner wait. Behind a proxy, the server must be told to trust it (`trust proxy`) so the client address is the real one; that is part of the deployment in 0.5.2.

## Other errors

### Unknown routes

Any request under `/api` that does not match a route returns `404`:

```json
{ "error": "Route not found" }
```

### Unexpected errors

Unhandled errors return `500` with the request id. Details are logged on the server together with that id and never sent to the client.

## Planned

| Method | Path               | Version | Description                 |
| ------ | ------------------ | ------- | --------------------------- |
| `POST` | `/api/staff/login` | 0.2.0   | Staff login                 |
| `GET`  | `/api/staff/pqrs`  | 0.2.1   | Paginated list with filters |
