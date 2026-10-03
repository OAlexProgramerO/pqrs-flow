# Changelog

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org).

## [Unreleased]

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
