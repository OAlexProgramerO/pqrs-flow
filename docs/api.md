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
| Rate limit   | Submissions, lookups and staff logins are limited. A `429` includes a `Retry-After` header in seconds.   |
| Caching      | Every answer under `/api` carries `Cache-Control: no-store`.                                             |
| CORS         | Closed by default. Websites listed in `CORS_ORIGINS` may call the API from a browser.                    |
| Compression  | Text answers over 1 KB are sent with `br` or `gzip` when `Accept-Encoding` allows it. `Vary` says so.    |

## Endpoints

### `GET /api/health`

Checks that the server is running. Used by the frontend and by monitoring tools.

**Response `200 OK`**

```json
{
  "status": "ok",
  "service": "pqrs-flow",
  "version": "0.3.0",
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

| Status | Body                                                                                   | When                                      |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "subject": "Subject is required." } }`   | One or more fields are invalid            |
| `400`  | `{ "error": "Invalid submission" }`                                                    | The `website` field is filled in          |
| `400`  | `{ "error": "Malformed JSON body" }`                                                   | The body is not valid JSON                |
| `413`  | `{ "error": "Request body too large" }`                                                | The body is larger than 16 KB             |
| `429`  | `{ "error": "Too many attempts. Please try again later." }` and a `Retry-After` header | Too many submissions from one address     |
| `500`  | `{ "error": "Internal server error", "requestId": "..." }`                             | Unexpected failure. Quote the request id. |

**Rate limit**

| Limit                          | Value               | Protects against                        |
| ------------------------------ | ------------------- | --------------------------------------- |
| Submissions per client address | 10 every 15 minutes | Spam and scripts that fill the database |

Every attempt that reaches the route counts, valid or not. A body that is not valid JSON, or is larger than 16 KB, is rejected before the limit and does not count. The numbers can be changed with `SUBMIT_RATE_LIMIT_MAX` and `SUBMIT_RATE_LIMIT_WINDOW_MINUTES`. The counters live in the memory of the server and restart with it.

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

Every attempt counts, successful or not. The counters live in the memory of the server and restart with it. Known trade-off: someone who knows a case number can use up its 8 attempts and make the owner wait. Behind a proxy, set `TRUST_PROXY` (see the README) so the client address is the real one.

## Other errors

### Unknown routes

Any request under `/api` that does not match a route returns `404`:

```json
{ "error": "Route not found" }
```

### Unexpected errors

Unhandled errors return `500` with the request id. Details are logged on the server together with that id and never sent to the client.

## Staff API (v0.2.0)

Everything under `/api/admin` is for authorized staff. The public endpoints above never need a login.

### Authentication model

| Topic          | Behavior                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session        | `POST /api/admin/login` opens a server-side session. The browser keeps an opaque 256-bit token in a cookie. Only the SHA-256 of the token is stored.                                                                                       |
| Cookie         | `pqrs_session`, or `__Host-pqrs_session` when `Secure` is on (production). Always `HttpOnly`, `SameSite=Strict`, `Path=/`, never a `Domain`.                                                                                               |
| Lifetime       | Ends after `SESSION_IDLE_MINUTES` (30) without use, or after `SESSION_MAX_HOURS` (8). `Max-Age` of the cookie is the maximum.                                                                                                              |
| Rotation       | Every login creates a new session and closes the one the browser sent. A token chosen by the client is never accepted.                                                                                                                     |
| Logout         | `POST /api/admin/logout` deletes the session on the server and clears the cookie.                                                                                                                                                          |
| CSRF           | Every request that is not `GET`, `HEAD` or `OPTIONS` needs the header `X-CSRF-Token` with the value of `csrfToken` (from login or session).                                                                                                |
| Origin check   | A request that changes something and carries an `Origin` from another site, or `Sec-Fetch-Site: cross-site` or `same-site`, gets `403`. Login included. Requests with neither header (curl) pass this check and still need the CSRF token. |
| CORS           | Not used. A website in `CORS_ORIGINS` cannot log in or change a request.                                                                                                                                                                   |
| Unknown routes | After login and logout, every path under `/api/admin` answers `401` to anonymous visitors, so nothing about the routes is revealed.                                                                                                        |
| Caching        | Every answer carries `Cache-Control: no-store`.                                                                                                                                                                                            |

Errors of the staff API:

| Status | Body                                                              | When                                                                                         |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "field": "..." } }` | A body field or a query parameter is invalid                                                 |
| `401`  | `{ "error": "Authentication required." }`                         | No session, a malformed or unknown token, expired or idle session, deactivated account       |
| `401`  | `{ "error": "Invalid email or password." }`                       | Login failed. The same answer for a wrong password, an unknown account and a deactivated one |
| `403`  | `{ "error": "Invalid or missing CSRF token." }`                   | A change without the right `X-CSRF-Token`                                                    |
| `403`  | `{ "error": "Cross-origin request blocked." }`                    | The request comes from another site                                                          |
| `404`  | `{ "error": "Request not found." }`                               | No request has that case number                                                              |
| `409`  | `{ "error": "...", "details": { "currentStatus": "..." } }`       | The status move is not allowed, or the request changed meanwhile                             |
| `429`  | `{ "error": "Too many attempts. Please try again later." }`       | Too many login attempts. `Retry-After` says how long                                         |

### `POST /api/admin/login`

**Request body** `{ "email": "staff@example.com", "password": "..." }`. The email is trimmed and lowercased.

**Response `200 OK`** and a `Set-Cookie` header:

```json
{
  "admin": { "id": 1, "email": "staff@example.com", "displayName": "Ana Gomez" },
  "csrfToken": "u3Kx...",
  "expiresAt": "2026-10-12T20:00:00.000Z"
}
```

`expiresAt` is the absolute end of the session. The answer never contains a password or a hash.

**Rate limits**

| Limit                       | Default             | Protects against                                    |
| --------------------------- | ------------------- | --------------------------------------------------- |
| Attempts per client address | 10 every 15 minutes | One computer trying many accounts                   |
| Attempts per account        | 5 every 15 minutes  | Many computers guessing the password of one account |

Every attempt counts, successful or not. The counters live in the memory of the server. Known trade-off: someone who knows an email can use up its attempts and make that person wait. Behind a proxy set `TRUST_PROXY`, or every visitor shares one address.

### `POST /api/admin/logout`

Needs the CSRF token when there is a session. Answers `204` with no body, also when there was no session or it was already closed.

### `GET /api/admin/session`

Who is logged in. Answers `200` with the same body as the login (`admin`, `csrfToken`, `expiresAt`) or `401`. The pages call it on load to get the CSRF token.

### `GET /api/admin/stats`

```json
{ "total": 12, "byStatus": { "filed": 6, "in_progress": 3, "answered": 2, "closed": 1 } }
```

Every status is present, with zero when it has no requests.

### `GET /api/admin/pqrs`

A page of requests.

| Parameter  | Rules                                                                                                                              | Default     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `q`        | Up to 100 characters, no control characters. Matches case number, subject, name or email (contains). `%`, `_` and `\` are literal. | none        |
| `status`   | `filed`, `in_progress`, `answered` or `closed`                                                                                     | all         |
| `type`     | `petition`, `complaint`, `claim` or `suggestion`                                                                                   | all         |
| `from`     | Real date `YYYY-MM-DD`, UTC, included                                                                                              | none        |
| `to`       | Real date `YYYY-MM-DD`, UTC, the whole day is included. Must not be before `from`.                                                 | none        |
| `sort`     | `createdAt`, `caseNumber`, `status` or `type`. Anything else is rejected.                                                          | `createdAt` |
| `order`    | `asc` or `desc`                                                                                                                    | `desc`      |
| `page`     | Whole number from 1 to 100000                                                                                                      | `1`         |
| `pageSize` | Whole number from 1 to 100                                                                                                         | `20`        |

Each parameter must appear once as a plain string: `status=a&status=b` and `status[x]=a` get `400`. Unknown parameters are ignored. Empty values count as missing. Ties in the sort are broken by the internal id, so pages never repeat or skip rows.

**Response `200 OK`**

```json
{
  "data": [
    {
      "caseNumber": "PQRS-2026-000012",
      "type": "claim",
      "subject": "Wrong amount on my invoice",
      "requesterName": "Maria Lopez",
      "status": "filed",
      "createdAt": "2026-10-04T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 12, "totalPages": 1 }
}
```

The list has no description and no email. A page after the last one answers `200` with an empty `data`.

### `GET /api/admin/pqrs/:caseNumber`

One request. The case number is normalized (uppercase, no spaces) and must have the form `PQRS-YYYY-NNNNNN`.

```json
{
  "pqrs": {
    "caseNumber": "PQRS-2026-000012",
    "type": "claim",
    "subject": "Wrong amount on my invoice",
    "description": "I was charged twice for the same service last month.",
    "requesterName": "Maria Lopez",
    "requesterEmail": "maria@example.com",
    "status": "in_progress",
    "createdAt": "2026-10-04T12:00:00.000Z"
  },
  "allowedTransitions": ["answered"],
  "history": [
    {
      "id": 1,
      "action": "status_change",
      "previousStatus": "filed",
      "newStatus": "in_progress",
      "createdAt": "2026-10-05T09:30:00.000Z",
      "admin": { "id": 1, "displayName": "Ana Gomez" }
    }
  ]
}
```

`history` is oldest first. Filing the request is done by the citizen and has no audit record: it is the `createdAt` of the request. `allowedTransitions` comes from the server, so the interface never decides the workflow.

### `PATCH /api/admin/pqrs/:caseNumber/status`

Needs the CSRF token.

**Request body** `{ "status": "answered", "expectedStatus": "in_progress" }`. `expectedStatus` is optional: the status the person was looking at. If the request has another status by then, the answer is `409` and nothing changes.

**Response `200 OK`**: the same body as the detail, already updated, with the new audit record at the end of `history`. The status and its audit record are saved in one transaction.

Only `status` and `expectedStatus` are read. Any other field is ignored. There is no route to create, edit or delete requests, or to write or read the audit history except through the detail.

### Status transitions

```
filed ──► in_progress ──► answered ──► closed
               ▲              │
               └── reopen ────┘
```

| From          | May move to             |
| ------------- | ----------------------- |
| `filed`       | `in_progress`           |
| `in_progress` | `answered`              |
| `answered`    | `closed`, `in_progress` |
| `closed`      | nothing (final)         |

A status that is not one of the four is `400`. A move that is not in the table, including staying in the same status, is `409` with `details.currentStatus` and `details.allowedTransitions`.

### Staff pages

`GET /admin/` and the pages under it need a session. Without one, a page request is answered with a `302` to `/admin/login.html` and anything else with `401`. Only the login page and the four files it needs are public. Pages are sent with `Cache-Control: no-store`.

## Planned

Planned for later versions (see the README):

| Method | Path                        | Version | Description                |
| ------ | --------------------------- | ------- | -------------------------- |
| `POST` | `/api/admin/pqrs/:id/reply` | 0.3.2   | Reply text for the citizen |
| `GET`  | `/api/admin/users`          | 0.3.1   | Staff accounts and roles   |
