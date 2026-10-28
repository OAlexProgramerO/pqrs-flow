# Changelog

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org).

## [Unreleased]

### Added

- Add a multi-stage Docker image that runs the application as a non-root user and installs only backend production dependencies.
- Add Docker Compose with separate named volumes for SQLite data and uploaded attachments, a loopback-only port binding, and an HTTP health check.
- Add Docker build and container smoke-test coverage to GitHub Actions without publishing an image.
- Document container operations, persistent data, secret handling, and single-instance SQLite limits in English and Spanish.

### Validation

- Container build and runtime behavior must be confirmed by the Docker-capable CI job; do not treat local source checks as a successful image build.

No unreleased application changes yet. The next planned milestone is v0.7.0; see [docs/roadmap/v0.7.0-plan.md](./docs/roadmap/v0.7.0-plan.md).

## [0.6.0] - 2026-10-26

### Added

- Staff self-service TOTP MFA enrollment, verification, disablement and one-time recovery codes. Recovery codes are stored as hashes, consumed once at login and displayed only when generated.
- Administrator-only, paginated security-event API and interface with event-type and UTC date filters.
- Migration `009_mfa_recovery_security_events.sql` adds hashed recovery-code storage, query indexes and append-only protections for security events.
- Focused tests for one-time recovery codes and append-only, filterable security events.

### Security

- TOTP secrets are encrypted at rest. Production deployments must configure `MFA_ENCRYPTION_KEY` (or an existing `SESSION_COOKIE_SECRET` / `SESSION_SECRET` fallback) and keep it outside the database.
- Login security events no longer store the submitted email address; MFA recovery-code use and MFA configuration changes are audited without recording codes or secrets.

### Validation

- Backend suite: 500 passed, 0 failed (local validation reported for this implementation).
- ESLint and Prettier checks passed on the changed source and documentation files. The dependency audit remains to be run in the target development environment; do not treat this entry as proof of a public release or production deployment.

## [0.5.0] - 2026-10-23

### Added

- Built-in Node.js coverage reporting through `npm run test:coverage` and `npm run test:coverage` from the repository root.
- Playwright browser smoke tests for the public PQRS submission flow, status lookup and staff login/dashboard journey.
- Automated accessibility checks with `@axe-core/playwright` on the critical public and staff screens.
- CI workflow steps to install Chromium, run the browser suite and upload browser/coverage artifacts without publishing or deploying the app.

### Changed

- Backend and root package metadata now declare the local `0.5.0` quality-engineering milestone.
- Documentation now describes how to run the unit suite, coverage report, browser E2E suite and accessibility checks locally and in CI.

### Validation

- Local quality checks were run with `npm run check`, `npm run test:coverage`, `npm run test:e2e` and `npm run test:a11y` before preparing the local annotated tag.

## [0.4.1] - 2026-10-22

### Added

- Authenticated `GET /api/admin/pqrs/export.csv`, integrated with the staff reports filters and protected by the existing `pqrs:read` permission.
- A bounded CSV export of at most 5,000 requests with explicit, minimized columns: case number, request type, subject, current status and UTC submission timestamp.
- CSV serializer and API tests for authorization, filters, deterministic ordering, formula injection, privacy, row limits and download headers.

### Changed

- CSV fields are quoted and escaped with UTF-8 encoding and CRLF record endings. Subject text that begins with formula characters, including after whitespace or control characters, is prefixed with an apostrophe; this is a defense-in-depth measure whose behavior can vary across spreadsheet applications.
- The export uses the reports page's inclusive UTC date, type and current-status filters. Exports above 5,000 matching records are rejected instead of silently truncated.
- Package metadata, English and Spanish READMEs, roadmap, API, security and architecture documentation describe the local v0.4.1 implementation. No public release or deployment is claimed.

## [0.4.0] - 2026-10-21

### Added

- Staff-only reporting page at `/admin/reports.html` and read-only `GET /api/admin/reports`, protected by the existing session and `pqrs:read` permission.
- Filtered request totals, UTC day/week/month volume series, canonical type and current-status counts, first-published-response time with sample size, and deadline status counts.
- Migration `008_reporting_indexes.sql` adds a composite index for response-publication and status-transition audit lookups.
- Focused tests for report metrics, historical deadline state, date and enum validation, privacy, authorization, caching, request IDs and schema upgrades.

### Changed

- The report range defaults to the latest 30 UTC dates, accepts inclusive date filters up to 366 days, and rejects future end dates. Empty buckets and canonical categories remain visible as zero.
- Response time uses the first `response_published` audit event minus request creation, only when published by the selected period end. Draft responses, internal notes, and responses without a recorded publication event are excluded.
- Overdue rate is measured as of the selected end date. Its numerator is matching requests still open and past deadline at that date; its denominator is all matching requests with stored deadlines. Historical status is reconstructed from the append-only status audit. Requests without deadline snapshots are reported as unavailable and excluded from the rate.
- Package metadata, English and Spanish READMEs, roadmap, API reference and architecture documentation now identify v0.4.0 as the local implementation. This does not claim public release or deployment.

## [0.3.5] - 2026-10-21

### Added

- Transactional SQLite notification outbox for request-received and official-response-published emails, with SMTP transport and retry processing.
- Notification tests covering enqueue, delivery and retry behavior. Notification records and email payloads remain separate from report projections.

### Changed

- Documentation distinguishes the local email implementation from public release status.

## [0.3.4] - 2026-10-19

### Added

- Attachment storage and download API for request-bound files, with filename normalization, size and count limits, strict allowlists and safe storage outside the static web root.
- Migration `006_attachments.sql` to create the attachment table and indexes without altering the request or staff data model.
- Validation helpers that reject empty files, unsupported extensions, mismatched MIME types, and unexpected content signatures before anything is written to disk.
- New tests covering attachment validation and storage integrity.

### Changed

- Bumped package versions to `0.3.4` and updated READMEs, roadmap, API and security documentation to describe the local attachment workflow.
- The test runner script was corrected to avoid passing duplicate `--test-reporter` arguments.

### Validation

- `npm test` passed: all backend tests completed successfully, including the new attachment checks.

## [0.3.3] - 2026-10-18

### Added

- Administrator-only API configuration for per-request-type business-day rules and explicit holidays. No deadline values or jurisdiction-specific holidays are seeded.
- Versioned deadline snapshots on new requests, including the due date, rule version, calculation policy and applicable holiday dates. Requests already in the database and requests filed without a configured rule remain unchanged and deadline-unavailable.
- UTC business-day calculations: submission date is day zero; weekend or holiday submissions begin counting on the next business day; weekends and configured holidays are skipped; due dates always fall on business days.
- Staff-only deadline status and remaining-business-day information in request list and detail responses, with accessible text indicators for on-track, approaching, overdue, completed and unavailable requests.
- Migration `005_deadline_management.sql`, which adds deadline snapshot columns and constrained rule and holiday tables without rewriting existing requests.

### Changed

- Bumped package versions to `0.3.3`. The implementation was local; no public release or deployment is claimed.
- Updated English and Spanish READMEs, roadmap, API, architecture and security documentation. Documentation explicitly requires administrators to verify configured rules against authoritative jurisdictional sources and organizational policy.

### Validation

- Baseline before changes: `npm run check` passed — 459 tests total, 457 passed, 0 failed and 2 skipped on Windows.
- Final checks: `npm run check` passed — lint and formatting checks passed; 465 tests total, 463 passed, 0 failed and 2 skipped because Windows cannot deliver the tested shutdown signals to child processes. `git diff --check` passed.

## [0.3.2] - 2026-10-17

### Added

- Official responses with draft/published state, internal staff notes, request assignment and append-only request audit actions.
- Staff case-detail workflow support for responses, notes and assignment; a broad audit explorer is not included.
- Migration `004_case_resolution.sql` for response, note, assignment and audit records.

### Changed

- Public tracking exposes only a published official response; internal notes, drafts and assignment details remain staff-only.

## [0.3.1] - 2026-10-16

### Added

- Role-based staff authorization: administrators manage accounts; staff can access PQRS but not account administration. Existing accounts become administrators during migration `003` to preserve access; new panel-created accounts default to `staff`.
- Administrator account screens and API for searching, creating, editing, activating/deactivating and resetting accounts. New and reset accounts from the panel must change the temporary password at next login.
- Self-service password changes with current-password verification, preservation of the current session and revocation of other sessions.
- Session review and revocation, including logout auditing. Session responses expose only identifiers and timestamps, never tokens or hashes.
- Append-only account audit records for account, role, password and session-management changes, including actor, target, request id and non-secret metadata.
- Migration `003_staff_roles_accounts.sql`, which adds roles, password-update requirements and the account audit table without changing prior migrations, requests or case numbers.
- Administrator protection against self-demotion/self-deactivation and against removing the last active administrator.

### Changed

- Existing login and session responses include the account role and whether a password update is required. Accounts with a temporary password can only change it or log out until updated.
- Login revalidates account activity and the password hash in the transaction that creates a session, preventing a concurrent account or credential change from opening a stale session.
- Account-management and sensitive session/password operations are rate-limited and protected by the existing CSRF and same-origin guards.
- Documentation now describes v0.3.1 behavior, migration guarantees, account/session endpoints and remaining security limitations.

### Validation

- `npm run check`: passed — lint and format checks passed; 453 tests total, 451 passed, 0 failed and 2 skipped because Windows cannot deliver the tested shutdown signals to child processes.
- `git diff --check`: passed.
- Startup smoke test: a fresh temporary SQLite database migrated successfully; `/api/health` returned `0.3.1` and `/admin/login.html` returned HTTP `200`. Temporary database and log files were removed.

## [0.3.0] - 2026-10-14

A maintenance and hardening release. No new feature, no change to the public or staff API, and no change to the database schema.

### Added

- **Graceful shutdown** (`backend/src/shutdown.js`, used by `server.js`). `SIGINT` and `SIGTERM` stop the server from accepting new connections, let the requests in progress finish, and then close the shared SQLite connection with the existing `closeDb()`, so the WAL is checkpointed and its `-wal` and `-shm` files are removed. The whole shutdown is limited to 10 seconds: after that the remaining connections are cut, the database is closed and the process ends with code 1. Repeated signals do nothing extra. Before, the process was killed with the connection still open.
- `frontend-admin/package.json` with `{ "type": "module" }`, like `frontend/` and `shared/`.
- 16 new tests: the shutdown logic with a fake server and fake timers (`shutdown.test.js`), a real server stopped with `SIGINT` and `SIGTERM` in a child process (`shutdown-signal.test.js`, skipped on Windows, where signals cannot be delivered to a child), and regression tests for the order in which the test helper loads the database (`db-isolation.test.js`).
- `README.es.md`, the Spanish version of the README.

### Changed

- Version `0.3.0` in `package.json`, `backend/package.json` and their lock files (made with `npm version`). `GET /api/health` reports it, because it reads the version from `backend/package.json`.
- **Roadmap:** 0.3.0 was used for this maintenance release, which came before the planned staff accounts (old 0.2.1) and replies (old 0.2.2). So that no number is used twice, those two versions and the planned ones after them were renumbered 0.3.1 to 0.3.5 in `ROADMAP.md`, both READMEs and the docs. No released version changed.
- `maintenance/` holds the patch from 0.2.0 to 0.3.0 and the notes to apply it to an older checkout.

### Fixed

- The test run no longer prints the `MODULE_TYPELESS_PACKAGE_JSON` warning for `frontend-admin/js/admin-api.js`.
- Removed the UTF-8 byte order mark from `backend/src/db/database.js` and `backend/tests/helpers/isolate-db.js`. Nothing else in those files changed.
- The `0.2.0` entry said 192 new tests and 420 in total. The suite of that release already had 423 tests (228 before, 195 new).

### Documentation

- `docs/security.md` now explains that the public lookup has its own limits (30 attempts per client address and 8 per case number, every 15 minutes), that someone who knows a case number can use up the 8 attempts and make the real owner wait, and that the limits did not change.
- `docs/security.md` and the README describe the shutdown behavior, and `docs/api.md` shows the new version.

### Not changed on purpose

- Rate limit thresholds, keys, eviction and error answers are untouched. The in-memory limiter is still planned for 0.5.1.
- Retention and deletion tools and automatic backups (0.5.3), and the deadlines feature (now planned for 0.3.3), are not part of this release.

## [0.2.0] - 2026-10-12

The internal staff panel. It brings together what the roadmap had planned as 0.2.0 (login), 0.2.1 (list) and 0.2.2 (status workflow and history).

### Added

- **Staff login** at `/admin/login.html`: `POST /api/admin/login`, `POST /api/admin/logout` and `GET /api/admin/session`. Passwords are stored only as salted `scrypt` hashes (Node's `crypto`, 32 MiB of memory per hash). A login for an unknown account takes as long as a real one, and every failure gives the same `401`.
- **Server-side sessions** with opaque 256-bit random tokens. Only the SHA-256 of a token is stored. A session ends after 30 idle minutes or 8 hours (`SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`). Every login opens a brand new session and closes the one the browser had (no session fixation).
- **Session cookie**: `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` with the `__Host-` prefix in production (`SESSION_COOKIE_SECURE`).
- **CSRF protection** for every staff request that changes something: a per-session token in the `X-CSRF-Token` header, plus a check of `Origin` and `Sec-Fetch-Site`.
- **Login rate limits** per client address and per account (`LOGIN_RATE_LIMIT_MAX`, `LOGIN_ACCOUNT_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MINUTES`). Public submission and tracking do not depend on them.
- **Protected staff pages** (`frontend-admin/`, served under `/admin`): anonymous visitors only get the login page and its files. The folder lives outside `frontend/`, so the public static handler can never serve it.
- **Dashboard**: counters per status, a paginated list with search (case number, subject, name, email), filters by status, type and date range, sorting, and clear loading, empty, error and session-ended states. Responsive, keyboard friendly, with text on every status badge.
- **Request detail** with the requester data, the description, the allowed next statuses and the status history.
- **Staff API**: `GET /api/admin/stats`, `GET /api/admin/pqrs`, `GET /api/admin/pqrs/:caseNumber` and `PATCH /api/admin/pqrs/:caseNumber/status`. Every parameter is validated, SQL always uses parameters and sorting uses a whitelist of columns.
- **Status workflow**: `filed → in_progress → answered → closed`, with `answered → in_progress` to reopen. `closed` is final. Moves that are not allowed answer `409`. An optional `expectedStatus` detects two people changing the same request.
- **Audit history** (`pqrs_audit`): who changed which request, from which status to which, when, and with which request id. It is written in the same transaction as the status change, so a failed audit rolls the change back. Triggers make the table append-only. It is never exposed by the public API.
- **Account tool**: `npm run admin -- create | reset-password | deactivate | activate | list`. Passwords are asked in the terminal (hidden) or read from standard input, never from arguments or the environment. A password reset closes every session of the account. There are no default accounts.
- **Migration `002_admin_panel.sql`**: `admins`, `admin_sessions`, `pqrs_audit` and the indexes of the list. Existing requests and case numbers are not touched.
- `docs/security.md` with the security model and the deployment checklist.
- 195 new tests (228 before, 423 now): hashing, tokens, validation, migrations from every previous schema, login and sessions, authorization and CSRF, the list and its injection resistance, status changes and conflicts, audit and rollback, the account tool, the staff pages and the API client.

### Changed

- The legacy table repair of the migration runner now runs **before** the migrations, so a migration that adds indexes or foreign keys always sees a complete `pqrs` table. Migration `001` is untouched.
- The access log no longer prints the query string of `/api/admin` requests, because searches may contain names and emails.
- `npm test` gives every test process its own temporary database (`tests/helpers/isolate-db.js`). Before, a test of v0.1.3 could open `data/pqrs.db` of the developer.
- ESLint lints `frontend-admin/` with the browser globals.
- `shared/validation.js` exports `EMAIL_PATTERN` (no behavior change).

### Security notes

- CORS stays closed by default and is never used for the staff area: even a website listed in `CORS_ORIGINS` cannot log in or change a request.
- The in-memory login limits and the sessions of a single process are the known limits of this version. See `docs/security.md`.

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
