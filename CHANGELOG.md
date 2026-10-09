# Changelog

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org).

## [Unreleased]

## [0.1.3] - 2026-10-08

### Added

- `CORS_ORIGINS` setting: a list of websites (or `*`) allowed to call the API from a browser.
- `STATIC_CACHE_SECONDS` setting: how long a browser may keep styles, scripts and images. It is `0` in development and tests, and `3600` when `NODE_ENV=production`.
- `Cache-Control` rules for the static files: pages are always revalidated (`no-cache`), the rest uses `public, max-age=N`. The `ETag` still answers `304` to a repeated request.
- `Cache-Control: no-store` on every answer under `/api`, errors included.
- `createApp` accepts `corsOrigins` and `staticCacheSeconds`, so tests can try both.
- Tests for CORS, cache headers and the new environment values.

### Changed

- CORS is off by default. Before, `cors()` allowed every website. The pages are served by the same server, so they keep working; a page served from another address needs its origin in `CORS_ORIGINS`.

## [0.1.2] - 2026-10-08

### Added

- Rate limit for `POST /api/pqrs`: 10 requests per client address every 15 minutes, with `429` and `Retry-After`. Set it with `SUBMIT_RATE_LIMIT_MAX` and `SUBMIT_RATE_LIMIT_WINDOW_MINUTES`.
- Compression middleware (`middlewares/compression.js`) built on Node's `zlib`: brotli and gzip, weights of `Accept-Encoding` respected, `Vary: Accept-Encoding`, weak ETags, streaming with back pressure. It skips images, small answers, partial answers (206), `HEAD`, `204`, `304` and `no-transform`.
- `TRUST_PROXY` setting (a number of proxies, `loopback` and similar values, off by default) so the rate limits see the real visitor behind a reverse proxy. A warning is printed when it is set to `true`.
- Longer keep-alive and header timeouts in `server.js`, so proxies and load balancers do not hit closed connections.
- The submission form shows how long to wait after a `429` (`rateLimitMessage` in `frontend/js/status.js`).
- `createApp` accepts `submitLimit` and `trustProxy`, so tests can try both quickly.
- Tests for the compression middleware and the whole app, the submission limit, the proxy settings, the environment values and the new message.
- Pre-push hook (`.githooks/pre-push`) that runs lint, formatting and tests before anything is pushed.
- `npm run ready` formats every file and then runs all the checks.
- CI troubleshooting guide (`docs/ci-troubleshooting.md`) and rules for working directly on `main`.

### Changed

- CI runs on Node 22 and 24 with `actions/checkout@v7` and `actions/setup-node@v7` on a pinned `ubuntu-24.04` runner.
- The three CI checks always run, so one red build shows every problem at once.
- CI audits the production dependencies.
- Dependabot groups minor and patch updates into one weekly pull request and no longer proposes major versions.
- The minimum Node.js version is 22, because Node 20 reached end of life in April 2026.
- Tests use the `spec` reporter so failures are easier to read in the logs.

### Fixed

- The test script works on Node 22 and newer.
- Formatting of the files of versions 0.1.0 and 0.1.1.

## [0.1.1] - 2026-10-04

### Added

- `POST /api/pqrs/lookup`: the status of a request with its case number **and** the email used to submit it.
- Tracking page (`track.html`) with a progress timeline, friendly status texts and accessible messages.
- Link from the confirmation screen to the tracking page. Only the case number travels in the link and the page removes it from the address bar.
- Public columns only: the lookup returns the case number, type, status and creation date, with `Cache-Control: no-store`.
- Same `404` answer for a wrong email and for an unknown case number.
- In-memory rate limiter with an injectable clock, used per client address (30 per 15 minutes) and per case number (8 per 15 minutes), with `429` and `Retry-After`.
- Lookup validation and case number normalization in the shared module.
- Status, type, date and waiting-time helpers for the browser (`frontend/js/status.js`).
- `retryAfter` in the browser `ApiError` and a `lookupPqrs` call in the API client.
- `npm run seed` prints a case number and email to try on the tracking page.
- Tests for the lookup service, controller, API, rate limiter, status helpers, tracking page and repository query.

### Changed

- The case number pattern lives in `shared/validation.js` and is reused by the server.
- Navigation between the two pages, and a hint on the confirmation screen that no longer says tracking is "coming".
- API reference, architecture, roadmap and README describe the lookup and its privacy choices.

## [0.1.0] - 2026-10-04

### Added

- `POST /api/pqrs` stores a request and returns its case number and public fields.
- Validation module shared by the browser and the server (`shared/validation.js`).
- PQRS service (validation, email saved in lowercase), controller and routes.
- HTTP errors with a central error handler that returns JSON.
- Request id middleware: `X-Request-Id` header on every response and in the logs.
- Anti-spam honeypot field and a 16 KB limit for JSON bodies.
- Frontend API client with timeout and friendly error messages.
- Success screen with the case number, a copy button and a button to submit another request.
- `npm run seed` for demo requests and `npm run db:reset` to start clean.
- `docs/requests.http` for the REST Client extension of VS Code.
- Tests for the service, controller, API, error handler, request id, API client and seed.

### Changed

- The app is built by `createApp()`, so tests can inject an in-memory database.
- The browser loads the validation rules from `/shared/validation.js`.
- CI runs on Node 22 and 24 with `actions/checkout@v7` and `actions/setup-node@v7`, on a pinned `ubuntu-24.04` runner, and audits production dependencies.
- The minimum Node.js version is 22, because Node 20 reached end of life.
- README, roadmap, API reference and architecture documents rewritten for this version.

### Removed

- `frontend/js/validation.js`, replaced by `shared/validation.js`.

## [0.0.3] - 2026-10-03

### Added

- SQLite connection with WAL mode, foreign keys and a busy timeout.
- Versioned SQL migrations (`PRAGMA user_version`), each one applied in a transaction.
- `pqrs` and `case_counters` tables with `CHECK` constraints and `STRICT` typing.
- PQRS repository with prepared statements and atomic case numbers (`PQRS-2026-000001`).
- `DB_PATH` environment variable.
- Tests for migrations, the schema, case numbers and the repository.

### Changed

- Roadmap revised: the public lookup now requires the email, server validation moves into 0.1.0 and performance work gets its own version.
- Architecture document describes the data layer.

## [0.0.2] - 2026-10-03

### Added

- Submission form (type, subject, description, name, email) with accessible labels and error messages.
- Client-side validation module (`frontend/js/validation.js`) with unit tests.
- Character counter for the description field and a light/dark theme.
- Tests for the JSON 404 response, static frontend files, security headers and environment config.
- API reference (`docs/api.md`).
- Dependabot configuration and code owners.

### Changed

- `GET /api/health` now reads the version from `backend/package.json`.
- README expanded with project status, architecture and setup details.

### Fixed

- The `.env` file at the project root is now loaded; before, the server only looked inside `backend/`.

## [0.0.1] - 2026-10-02

### Added

- Initial project structure (`backend/`, `frontend/`, `docs/`).
- Express server with `helmet`, `cors` and `morgan`.
- `GET /api/health` endpoint.
- Landing page that checks the API.
- Smoke tests with `node:test`.
- GitHub Actions CI: lint, format check and tests on Node 20 and 24.
- ESLint and Prettier configuration with shared VS Code settings.
- `.gitattributes` to enforce LF line endings.
- Contributing guide, issue templates and pull request template.
- Favicon.

### Fixed

- Test script now works on Node 22 and newer (`node --test` without a directory argument).
