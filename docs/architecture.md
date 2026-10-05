# Architecture

```
Browser ──HTTP──► Express (backend/)
   │                  ├── /api/*   → REST routes (JSON)
   │                  └── /        → static files from frontend/
   └── frontend/ (HTML + CSS + JS)
```

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Modules | ES Modules (`"type": "module"`) | Current JavaScript standard |
| Frontend | Static files served by Express | One command runs everything in early phases |
| Tests | Native `node:test` | No extra dependencies |
| Config | Environment variables (`.env`) | Same code locally and in production |

## Backend layers (as it grows)

```
routes/        → define endpoints
controllers/   → receive the request and send the response
services/      → business rules
repositories/  → database access
```

The `controllers/`, `services/` and `repositories/` folders are created when there is logic to justify them (v0.1.0 onwards).

## Data layer (v0.0.3)

- **Database:** SQLite through `better-sqlite3`. Its API is synchronous, so no connection pool is needed.
- **Connection settings:** WAL mode (readers do not block the writer), `synchronous = NORMAL`, foreign keys on, 5 second busy timeout.
- **Migrations:** `backend/src/db/migrations/NNN_name.sql`, applied in order. `PRAGMA user_version` stores the last applied number and each migration runs in a transaction. Never edit a migration that was already released; add a new one.
- **Tables:** `pqrs` (with `CHECK` constraints and `STRICT` typing) and `case_counters` (one row per year).
- **Case numbers:** the counter is incremented in the same transaction that inserts the request, so a failed insert never burns a number.
- **Connection lifecycle:** `getDb()` opens the shared connection on first use, so importing the app never touches the disk. Tests use `:memory:` databases.
- **Public data:** repositories return every column. Services decide what the public may see; the lookup in 0.1.1 will never return the description or personal data.

## Submitting a request (v0.1.0)

```
Browser form ──► frontend/js/form.js ──► frontend/js/api.js ──POST /api/pqrs──►
   requestId → helmet → cors → express.json (16 KB) → routes/pqrs.routes.js
      → controllers/pqrs.controller.js   (honeypot, public response)
      → services/pqrs.service.js         (validation, email in lowercase)
      → repositories/pqrs.repository.js  (one transaction: counter + insert)
      → SQLite
```

- **Shared code:** `shared/validation.js` is used by the browser (served at `/shared/validation.js`) and by the service. The rules live in one place, and the server still checks everything again because browser checks can be skipped.
- **Errors:** controllers and services throw `HttpError` or `ValidationError`. The central handler (`middlewares/error-handler.js`) turns them into JSON. Unexpected errors are logged with the request id and the client only sees a generic message.
- **Request id:** `middlewares/request-id.js` gives every request an id, returns it in `X-Request-Id` and prints it in the log line.
- **App factory:** `createApp({ getRepository })` builds the Express app. Tests inject an in-memory repository, and the default app opens the real database on the first request.
- **Privacy:** a submission response contains only the case number, type, subject, status and creation date.
- **Anti-spam:** a hidden `website` field catches bots. Rate limiting arrives in v0.1.2.

## Looking up a request (v0.1.1)

```
track.html ──► js/track.js ──► js/api.js ──POST /api/pqrs/lookup──►
   requestId → helmet → cors → express.json
      → rate limit per client address        (30 / 15 min)
      → rate limit per case number           (8 / 15 min)
      → controllers/pqrs.controller.js       (Cache-Control: no-store)
      → services/pqrs.service.js             (shared validation, same 404 for every miss)
      → repositories/pqrs.repository.js      (case number AND email, public columns only)
      → SQLite
```

- **Two keys, one answer:** the repository query asks for the case number and the email at the same time, so "wrong email" and "unknown case number" follow the same path and give the same `404`.
- **Public columns only:** `findForLookup` selects the case number, type, status and creation date. Nothing else can leave the database through this route.
- **Rate limiter:** `middlewares/rate-limit.js` is a fixed-window counter in memory with an injectable clock and a cap on the number of keys. It has no dependency and is used for the lookup now; version 0.1.2 reuses it for the rest of the API.
- **Browser side:** `js/status.js` holds the texts, the timeline and the date format as pure functions. `js/track.js` builds the page with `textContent` and DOM nodes, never `innerHTML`.
- **Case number in the link:** the confirmation page links to `track.html?case=...`. The page reads it, then removes it from the address bar. The email never goes in a URL.
- **Referrer:** `helmet` sends `Referrer-Policy: no-referrer`, so the case number in a link is not passed to other sites.

