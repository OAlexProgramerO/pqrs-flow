# Architecture

```
Browser ──HTTP──► Express (backend/)
   │                  ├── /api/*   → REST routes (JSON)
   │                  └── /        → static files from frontend/
   └── frontend/ (HTML + CSS + JS)
```

## Decisions

| Decision | Choice                          | Reason                                      |
| -------- | ------------------------------- | ------------------------------------------- |
| Modules  | ES Modules (`"type": "module"`) | Current JavaScript standard                 |
| Frontend | Static files served by Express  | One command runs everything in early phases |
| Tests    | Native `node:test`              | No extra dependencies                       |
| Config   | Environment variables (`.env`)  | Same code locally and in production         |

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
- **Anti-spam:** a hidden `website` field catches bots, and since v0.1.2 every client address has a limit on new requests.

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
- **Rate limiter:** `middlewares/rate-limit.js` is a fixed-window counter in memory with an injectable clock and a cap on the number of keys. It has no dependency. The lookup uses it, and version 0.1.2 reuses it for submissions.
- **Browser side:** `js/status.js` holds the texts, the timeline and the date format as pure functions. `js/track.js` builds the page with `textContent` and DOM nodes, never `innerHTML`.
- **Case number in the link:** the confirmation page links to `track.html?case=...`. The page reads it, then removes it from the address bar. The email never goes in a URL.
- **Referrer:** `helmet` sends `Referrer-Policy: no-referrer`, so the case number in a link is not passed to other sites.

## Hardening (v0.1.2)

```
requestId → helmet → cors (only if CORS_ORIGINS) → compression → /api no-store
   → express.json (16 KB) → morgan
   → /api  (health, pqrs: submit limit or lookup limits → controller)
   → static files (frontend/, shared/) with their cache rules
   → error handler
```

- **Submission limit:** `POST /api/pqrs` passes through one limiter keyed by `req.ip` (10 every 15 minutes by default). It uses the same `createRateLimiter` as the lookup, with its own counters. `SUBMIT_RATE_LIMIT_MAX` and `SUBMIT_RATE_LIMIT_WINDOW_MINUTES` change the numbers.
- **Compression:** `middlewares/compression.js` replaces `res.write` and `res.end` and decides when the first byte is about to leave, when the status and the headers are final. It compresses text of 1 KB or more with brotli (quality 4) or gzip, whichever the client prefers. Static files are compressed while they stream, and when the connection is slow the compressor waits for the `drain` event, so memory does not grow. Partial answers (206), `HEAD`, `204`, `304`, images and answers that are already encoded pass untouched. A strong ETag becomes weak, because the bytes are not the same, and `If-None-Match` still gives a `304`.
- **Why not the `compression` package:** the middleware is under 200 lines, adds no dependency (the lock file and the audit stay the same) and is covered by tests with real HTTP requests. Swapping it later for the package takes one line in `app.js`.
- **Reverse proxy:** `TRUST_PROXY` is passed to Express as `trust proxy`, so `req.ip` is the visitor and not the proxy. It is off by default, because without a proxy anyone can send a fake `X-Forwarded-For` and skip the limits. Use the number of proxies (`1`), not `true`. `server.js` also raises `keepAliveTimeout` to 65 s and `headersTimeout` to 66 s, above the 60 s idle time most proxies use, to avoid random 502 errors.

## HTTP caching and CORS (v0.1.3)

- **API answers:** a middleware on `/api` sets `Cache-Control: no-store` before anything else runs, so success answers, validation errors, `429` and unknown routes are never kept by a browser or a proxy. It sits before `express.json`, so even a malformed body gets it.
- **Static files:** `setStaticCacheHeaders(seconds)` is passed to `express.static` for the frontend and for `/shared`. Pages (`.html`) always get `no-cache`: the browser asks again and the `ETag` turns the answer into a cheap `304`. Other files get `public, max-age=N`. With `N = 0` they also get `no-cache`.
- **Why zero in development:** file names have no version (`styles.css`, not `styles.3f2a.css`), so a cache would hide edits and an old script could meet a new page after a deploy. Production uses one hour by default, a compromise that `STATIC_CACHE_SECONDS` can change. Versioned file names would allow a year and arrive with the build step, if there ever is one.
- **CORS:** the pages and the API share one origin, so the middleware is only added when `CORS_ORIGINS` lists websites (or `*`). The `cors` package then answers the preflight and adds `Vary: Origin`. The staff cookies of 0.2.0 depend on this being closed by default.
