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

## Endpoints

### `GET /api/health`

Checks that the server is running. Used by the frontend and by monitoring tools.

**Response `200 OK`**

```json
{
  "status": "ok",
  "service": "pqrs-flow",
  "version": "0.1.0",
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

## Other errors

### Unknown routes

Any request under `/api` that does not match a route returns `404`:

```json
{ "error": "Route not found" }
```

### Unexpected errors

Unhandled errors return `500` with the request id. Details are logged on the server together with that id and never sent to the client.

## Planned

| Method | Path               | Version | Description                              |
| ------ | ------------------ | ------- | ---------------------------------------- |
| `POST` | `/api/pqrs/lookup` | 0.1.1   | Status lookup with case number and email |
