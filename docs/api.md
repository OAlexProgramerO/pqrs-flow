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
  "version": "0.4.0",
  "timestamp": "2026-10-04T12:00:00.000Z"
}
```

| Field       | Description                              |
| ----------- | ---------------------------------------- |
| `status`    | Always `ok` when the server answers      |
| `service`   | Service name                             |
| `version`   | Version read from `backend/package.json` |
| `timestamp` | Current server time in ISO 8601 format   |

### `GET /api/pqrs/:caseNumber/attachments`

Lists the attachments linked to a request. Public callers may only request attachments for the exact case number and email they have already verified; staff callers use the protected admin API and the normal session-based authorization rules.

**Response `200 OK`**

```json
{
  "data": [
    {
      "id": 1,
      "name": "invoice.pdf",
      "sizeBytes": 12842,
      "mimeType": "application/pdf",
      "visibility": "public",
      "uploadedBy": "citizen",
      "uploadedAt": "2026-10-19T12:00:00.000Z"
    }
  ]
}
```

### `POST /api/pqrs/:caseNumber/attachments`

Uploads one or more validated files for a verified request. The server keeps them in a dedicated `data/attachments` storage directory and never writes the original client file name into the path.

**Request**: multipart/form-data with field name `files`.

**Response `201 Created`**

```json
{
  "data": [
    {
      "id": 1,
      "name": "invoice.pdf",
      "sizeBytes": 12842,
      "mimeType": "application/pdf",
      "visibility": "public",
      "uploadedBy": "citizen",
      "uploadedAt": "2026-10-19T12:00:00.000Z"
    }
  ]
}
```

### `GET /api/pqrs/:caseNumber/attachments/:attachmentId/download`

Returns the stored file as a safe attachment download. The response sets a `Content-Disposition` attachment header, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`.

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
If staff have published an official response, the response also contains
`"officialResponse": { "text": "...", "publishedAt": "..." }`. Draft responses and
internal notes are never included. Without a published response, the original response
shape is unchanged.

**Errors**

| Status | Body                                                                                   | When                                      |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "caseNumber": "..." } }`                 | A field is missing or badly formed        |
| `400`  | `{ "error": "Malformed JSON body" }`                                                   | The body is not valid JSON                |
| `404`  | `{ "error": "No request matches that case number and email." }`                        | No request has that case number and email |
| `429`  | `{ "error": "Too many attempts. Please try again later." }` and a `Retry-After` header | Too many attempts (see the limits below)  |

**Why it works this way**

| Choice                                                      | Reason                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Case number **and** email are both required                 | Case numbers are sequential, so anyone could guess them. The email proves who is asking.                                       |
| A wrong email and an unknown case number get the same `404` | Nobody can use the API to find out which case numbers exist.                                                                   |
| `POST` instead of `GET`                                     | URLs are stored in logs and in the browser history. A body is not.                                                             |
| Only public status, type and dates are returned             | The person already knows the rest, and less data means less to leak. A published official answer is the only additional field. |

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

## Staff API (v0.3.3)

Everything under `/api/admin` is for authorized staff. The public endpoints above never need a login.

### Roles and account security

| Role            | PQRS access                    | Account management | Deadline configuration |
| --------------- | ------------------------------ | ------------------ | ---------------------- |
| `administrator` | Read and process every request | Full access        | Read and change        |
| `staff`         | Read and process every request | None               | None                   |

Both roles have access to reports through `pqrs:read` and currently have access to every PQRS; per-request assignment permissions are not implemented. Permissions are checked by the server, not inferred from which controls the frontend displays. Existing accounts are migrated as `administrator` to preserve their previous access; newly-created panel accounts default to `staff`. There must always be at least one active administrator.

### Authentication model

| Topic          | Behavior                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session        | `POST /api/admin/login` opens a server-side session. The browser keeps an opaque 256-bit token in a cookie. Only the SHA-256 of the token is stored.                                                                                       |
| Cookie         | `pqrs_session`, or `__Host-pqrs_session` when `Secure` is on (production). Always `HttpOnly`, `SameSite=Strict`, `Path=/`, never a `Domain`.                                                                                               |
| Lifetime       | Ends after `SESSION_IDLE_MINUTES` (30) without use, or after `SESSION_MAX_HOURS` (8). `Max-Age` of the cookie is the maximum.                                                                                                              |
| Rotation       | Every login creates a new session and closes the one the browser sent. A token chosen by the client is never accepted.                                                                                                                     |
| Logout         | `POST /api/admin/logout` deletes the session on the server, records the revocation and clears the cookie.                                                                                                                                  |
| CSRF           | Every request that is not `GET`, `HEAD` or `OPTIONS` needs the header `X-CSRF-Token` with the value of `csrfToken` (from login or session).                                                                                                |
| Origin check   | A request that changes something and carries an `Origin` from another site, or `Sec-Fetch-Site: cross-site` or `same-site`, gets `403`. Login included. Requests with neither header (curl) pass this check and still need the CSRF token. |
| CORS           | Not used. A website in `CORS_ORIGINS` cannot log in or change a request.                                                                                                                                                                   |
| Unknown routes | After login and logout, every path under `/api/admin` answers `401` to anonymous visitors, so nothing about the routes is revealed.                                                                                                        |
| Caching        | Every answer carries `Cache-Control: no-store`.                                                                                                                                                                                            |

Errors of the staff API:

| Status | Body                                                                | When                                                                                         |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `400`  | `{ "error": "Validation failed", "details": { "field": "..." } }`   | A body field or a query parameter is invalid                                                 |
| `401`  | `{ "error": "Authentication required." }`                           | No session, a malformed or unknown token, expired or idle session, deactivated account       |
| `401`  | `{ "error": "Invalid email or password." }`                         | Login failed. The same answer for a wrong password, an unknown account and a deactivated one |
| `403`  | `{ "error": "Invalid or missing CSRF token." }`                     | A change without the right `X-CSRF-Token`                                                    |
| `403`  | `{ "error": "Cross-origin request blocked." }`                      | The request comes from another site                                                          |
| `403`  | `{ "error": "You do not have permission to perform this action." }` | The role lacks the required permission                                                       |
| `403`  | `{ "error": "Set a new password before continuing." }`              | The account must replace its temporary password                                              |
| `404`  | `{ "error": "Request not found." }`                                 | No request has that case number                                                              |
| `404`  | `{ "error": "Staff account not found." }`                           | No staff account has that id                                                                 |
| `409`  | `{ "error": "...", "details": { "currentStatus": "..." } }`         | A request changed meanwhile, an email already exists, or the last administrator is protected |
| `429`  | `{ "error": "Too many attempts. Please try again later." }`         | Too many login or account-management attempts. `Retry-After` says how long                   |

### `POST /api/admin/login`

**Request body** `{ "email": "staff@example.com", "password": "..." }`. The email is trimmed and lowercased.

**Response `200 OK`** and a `Set-Cookie` header:

```json
{
  "admin": {
    "id": 1,
    "email": "staff@example.com",
    "displayName": "Ana Gomez",
    "role": "administrator",
    "credentialUpdateRequired": false
  },
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

Who is logged in. Answers `200` with the same body as the login (`admin`, including `role` and `credentialUpdateRequired`, `csrfToken`, `expiresAt`) or `401`. The pages call it on load to get the CSRF token.

### `POST /api/admin/password/change`

Needs the CSRF token. New passwords must have 12–128 characters and cannot be the account email; the current password is required and reusing it is refused.

**Request body** `{ "currentPassword": "...", "newPassword": "...", "confirmPassword": "..." }`.

**Response `204 No Content`**. The current session stays active and all other sessions are revoked. An account provisioned with a temporary password must use this endpoint before it can access the rest of the protected API.

### `GET /api/admin/sessions`

Lists the signed-in account's sessions that have not expired or exceeded the idle timeout. The response contains no token, token hash, IP address or user-agent:

```json
{
  "sessions": [
    {
      "sessionId": 12,
      "createdAt": "2026-10-16T09:00:00.000Z",
      "lastSeenAt": "2026-10-16T09:30:00.000Z",
      "expiresAt": "2026-10-16T17:00:00.000Z",
      "current": true
    }
  ]
}
```

### `DELETE /api/admin/sessions/:sessionId` and `DELETE /api/admin/sessions/others`

Revoke one owned session (`204`; the cookie is also cleared if it was the current session), or revoke every other session (`200 { "revoked": 2 }`) while retaining the current one. Revocations are recorded in the account audit.

### Account administration (administrator only)

These routes require the `administrator` role and are blocked until any required temporary-password change is complete. Sensitive write, password and session-revocation operations are rate-limited to 30 requests per client address and 10 per administrator account per 15 minutes.

| Method and path                            | Purpose                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/staff`                     | Paginated account list. Accepts `role` (`staff`/`administrator`), `status` (`active`/`inactive`), `page` and `pageSize` (1–100).                                                                                        |
| `POST /api/admin/staff/search`             | Same filters plus `q` (up to 100 chars) in a JSON body; use this for private name/email searches instead of putting search terms in URLs.                                                                               |
| `POST /api/admin/staff`                    | Create an account. Body: `email`, `displayName`, `password`, `confirmPassword`, optional `role` (defaults to `staff`). New accounts must change the supplied password at first login. Returns `201 { "account": ... }`. |
| `PATCH /api/admin/staff/:id`               | Update one or more of `email`, `displayName`, `role`, `isActive`. Returns `200 { "account": ... }`.                                                                                                                     |
| `POST /api/admin/staff/:id/password-reset` | Reset another account's password. Body: `password`, `confirmPassword`. Returns `200 { "account": ..., "mustSetNewPassword": true }`; closes that account's sessions.                                                    |
| `GET /api/admin/staff/:id/audit`           | Paginated audit events for the account (`page`, `pageSize`; maximum 100).                                                                                                                                               |

Account responses include `id`, `email`, `displayName`, `isActive`, `role`, `createdAt` and `lastLoginAt`; they never include a password or hash. A user cannot change their own role or deactivate themselves, and the last active administrator cannot be demoted or deactivated. Account changes, password changes/resets and session revocations are written to the append-only `account_audit` table in the same transaction as the change.

### `GET /api/admin/stats`

```json
{ "total": 12, "byStatus": { "filed": 6, "in_progress": 3, "answered": 2, "closed": 1 } }
```

Every status is present, with zero when it has no requests.

### `GET /api/admin/reports`

Returns aggregates for the staff reports page. Requires a live staff session and `pqrs:read` (both `administrator` and `staff` roles). The endpoint is read-only; it returns no requester identities, request text, response text, notes, attachment details or email data. As with the rest of `/api`, responses have `Cache-Control: no-store` and `X-Request-Id`.

| Parameter | Rules                                                                               | Default             |
| --------- | ----------------------------------------------------------------------------------- | ------------------- |
| `from`    | Real UTC date `YYYY-MM-DD`, included                                                | 29 days before `to` |
| `to`      | Real UTC date `YYYY-MM-DD`, included; cannot be in the future or before `from`      | Current UTC date    |
| `type`    | `petition`, `complaint`, `claim` or `suggestion`                                    | All                 |
| `status`  | `filed`, `in_progress`, `answered` or `closed`; filters the currently stored status | All                 |

Each parameter must appear once as a plain string; unknown or repeated parameters and unsupported enum values return `400` with the normal validation error shape. A range may contain at most 366 UTC calendar dates. The endpoint selects day buckets for ranges up to 31 days, week buckets for 32–183 days and month buckets for longer ranges. Empty buckets and all canonical type and status categories are returned with a count of zero.

**Response `200 OK`**

```json
{
  "filters": {
    "from": "2026-10-01",
    "to": "2026-10-21",
    "type": null,
    "status": null,
    "bucket": "day"
  },
  "totalRequests": 12,
  "volume": [{ "period": "2026-10-01", "count": 2 }],
  "byType": { "petition": 4, "complaint": 3, "claim": 3, "suggestion": 2 },
  "byStatus": { "filed": 5, "in_progress": 3, "answered": 3, "closed": 1 },
  "responseTime": {
    "sampleSize": 6,
    "averageHours": 28.5,
    "definition": "First official response_published audit event minus request creation time.",
    "asOf": "2026-10-21"
  },
  "deadlines": {
    "asOf": "2026-10-21",
    "numeratorOverdue": 2,
    "denominatorWithDeadline": 10,
    "ratePercent": 20,
    "counts": {
      "overdue": 2,
      "approaching": 1,
      "onTime": 3,
      "completed": 4,
      "unavailable": 2
    },
    "definition": "Overdue requests still open at the end of the selected date, divided by all matching requests with a stored deadline."
  }
}
```

`responseTime` starts at the request's persisted `created_at` and ends at the earliest valid `response_published` event in the append-only `pqrs_audit` table no later than the selected end date. Drafts and internal notes are not official responses. Responses published after the selected end date are not in the sample. `sampleSize` counts requests with a valid published-response event; `averageHours` is `null` when the sample is empty. Closure time is never used as a substitute.

Deadline state is calculated at 23:59:59.999 UTC on `to`, using the existing deadline-state helper and each request's saved due date and holiday snapshot. For historical `to` dates, the latest recorded status transition up to that day reconstructs whether a request was open or completed; the request's current status is used only for the `status` filter and current-status distribution. The overdue numerator is the number of matching requests still open and past due at the selected end date. The denominator is every matching request with a stored deadline, including completed and not-yet-due cases; requests with no stored deadline are counted as `unavailable` and excluded from both numerator and denominator. A null rate means the denominator is zero.

Dates and timestamps use UTC. Requests are selected by creation date within the inclusive range. Existing requests without deadline snapshots remain unavailable; no deadlines are recalculated. Historical deadline state depends on retained status audit records and saved deadline snapshots. The rate is an operational indicator, not a legal conclusion.

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

This example assumes an administrator configured a rule for `claim`. Without a rule, the
deadline is unavailable and `dueDate` and `businessDays` are `null`.

```json
{
  "data": [
    {
      "caseNumber": "PQRS-2026-000012",
      "type": "claim",
      "subject": "Wrong amount on my invoice",
      "requesterName": "Maria Lopez",
      "status": "filed",
      "createdAt": "2026-10-04T12:00:00.000Z",
      "deadline": {
        "dueDate": "2026-11-13",
        "businessDays": 30,
        "status": "on_track",
        "overdue": false,
        "approaching": false,
        "remainingBusinessDays": 30,
        "ruleId": "claim:v1",
        "policyVersion": "utc-business-days-v1",
        "timezone": "UTC"
      }
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
    "createdAt": "2026-10-04T12:00:00.000Z",
    "deadline": {
      "dueDate": "2026-11-13",
      "businessDays": 30,
      "status": "on_track",
      "overdue": false,
      "approaching": false,
      "remainingBusinessDays": 30,
      "ruleId": "claim:v1",
      "policyVersion": "utc-business-days-v1",
      "timezone": "UTC"
    }
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
When available, this detail also includes the latest official `response`, private `notes`,
and the current `assignment`. This route is protected by the staff session and
`pqrs:read` permission; these fields are never returned by public endpoints.

### `GET` and `PATCH /api/admin/pqrs/:caseNumber/reply`

Both roles with `pqrs:read` may read the detail (including a draft response). A write
requires `pqrs:update` and the CSRF token. Send `{ "text": "...", "state": "draft" }`
or `{ "text": "...", "state": "published" }`; text must contain 1–2000 characters.
Saving returns the updated request detail. Only a response in `published` state appears
in public lookup.

### `GET` and `POST /api/admin/pqrs/:caseNumber/notes`

Notes are visible only through the authenticated staff API. Creating one requires
`pqrs:update`, a CSRF token, and `{ "text": "..." }` with 1–2000 characters. Citizen
lookup and all public routes omit note text.

### `PATCH /api/admin/pqrs/:caseNumber/assignment`

Requires `pqrs:update` and a CSRF token. Send `{ "assigneeId": 1 }` to assign an active
staff account, or `{ "assigneeId": null }` to unassign. Invalid or inactive accounts are
rejected. Each effective change is recorded with its request id in the append-only
request audit.

### `PATCH /api/admin/pqrs/:caseNumber/status`

Needs the CSRF token.

**Request body** `{ "status": "answered", "expectedStatus": "in_progress" }`. `expectedStatus` is optional: the status the person was looking at. If the request has another status by then, the answer is `409` and nothing changes.

**Response `200 OK`**: the same body as the detail, already updated, with the new audit record at the end of `history`. The status and its audit record are saved in one transaction.

Only `status` and `expectedStatus` are read. Any other field is ignored. There is no route to create, edit or delete requests, or to write the PQRS audit history.

### Deadline configuration (administrator only)

Deadline configuration routes require an administrator session, the appropriate permission,
and a CSRF token for `PUT` and `DELETE`. There is no public deadline endpoint and no staff
configuration screen; administrators maintain the rules and holiday calendar through these
protected endpoints.

`GET /api/admin/deadlines` returns this shape; disabled rules remain listed to preserve their
version history:

```json
{
  "timezone": "UTC",
  "policyVersion": "utc-business-days-v1",
  "approachingBusinessDays": 5,
  "rules": [{ "type": "claim", "businessDays": 30, "version": 1, "active": 1 }],
  "holidays": [{ "date": "2026-12-25", "name": "Organization holiday" }]
}
```

| Method and path                              | Behavior                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/deadlines`                   | Lists configured rules and holidays, plus the fixed policy metadata.                                                                                              |
| `PUT /api/admin/deadlines/rules/:type`       | Sets or revises a rule. Body: `{ "businessDays": 30 }`; integer 1–366. `:type` is one of the four PQRS types. The response's `version` increments on each update. |
| `DELETE /api/admin/deadlines/rules/:type`    | Disables a rule for future submissions. Its version history is retained. Returns `404` if none is active.                                                         |
| `PUT /api/admin/deadlines/holidays/:date`    | Adds or renames an explicit holiday. `:date` must be a real `YYYY-MM-DD` date. Body: `{ "name": "Organization holiday" }`; same-date writes update the entry.     |
| `DELETE /api/admin/deadlines/holidays/:date` | Removes a holiday for future submissions. Returns `404` if none exists.                                                                                           |

No rules or holidays are seeded. Before operational use, an administrator must verify and
configure response periods against authoritative sources for the applicable jurisdiction and
organizational policy. Values are not legal advice and PQRS Flow does not claim legal
compliance.

The policy uses UTC dates. The submission date is day zero; weekends and explicit configured
holidays are skipped, and a due date is therefore always a business date. A submission received
on a weekend or holiday starts counting from the next business date. Requests snapshot their
due date, rule version and applicable holiday dates at creation. Changing or deleting a rule
or holiday affects future submissions only; existing requests are not recomputed. Existing
requests and submissions received while a type has no rule have no deadline and report
`status: "unavailable"`. Five or fewer remaining business days is the staff-only
`approaching` indicator, an operational alert threshold rather than a legal rule.

The `deadline` object on staff list and detail responses contains:

| Field                        | Meaning                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `dueDate`                    | Saved UTC business date, or `null` when unavailable.                                                                                   |
| `businessDays`               | Business-day duration from the saved rule, or `null`.                                                                                  |
| `status`                     | `on_track`, `approaching`, `overdue`, `completed`, or `unavailable`. Answered and closed requests are `completed`.                     |
| `overdue` / `approaching`    | Boolean indicators; a deadline becomes overdue the day after its due date.                                                             |
| `remainingBusinessDays`      | Business days after the current UTC date through the due date; `0` on the due date and after it. `null` when completed or unavailable. |
| `ruleId`                     | Request type plus the immutable rule version, for example `claim:v2`.                                                                  |
| `policyVersion` / `timezone` | Calculation policy identifier and `UTC`.                                                                                               |

Public submission and status-lookup responses do not expose deadline configuration or snapshots.

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
