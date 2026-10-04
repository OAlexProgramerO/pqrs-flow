# Changelog

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org).

## [Unreleased]

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
