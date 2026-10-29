# PQRS Flow

**English** · [Español](./README.es.md)

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)

A web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions). Built end to end with JavaScript, prioritizing simplicity, no frontend build step and clear architectural boundaries.

**Current code version: v0.7.1 (maintenance release preparation).** The published v0.7.0 milestone adds a hardened Docker image, persistent storage for SQLite and attachments, a container health check, and a documented Docker Compose setup. Version 0.7.1 aligns package metadata, the API health response, the changelog, and project documentation; it does not introduce new application features. See [CHANGELOG.md](./CHANGELOG.md), [ROADMAP.md](./ROADMAP.md), and [docs/roadmap/v0.7.0-plan.md](./docs/roadmap/v0.7.0-plan.md). See [docs/api.md](./docs/api.md) for API details and [docs/security.md](./docs/security.md) before exposing the application.

---

## 📖 The problem and the solution

Many organizations still handle feedback, complaints and requests through scattered emails, paper forms or social media messages. Requests get lost, responses are late and people are left without answers.

**PQRS Flow provides:**

1. **Public submission portal:** a responsive form that saves the request and returns a unique case number such as `PQRS-2026-000001`.
2. **Status lookup:** a public page where people check the status with the case number and their email, no account needed.
3. **Internal staff panel:** a protected area (`/admin/`) where authorized staff log in, review incoming cases, search and filter them, and update their status (`Filed → In progress → Answered → Closed`). Every change is recorded in an audit history.

### Project status

| Feature                                                                     | Version | Status              |
| --------------------------------------------------------------------------- | ------- | ------------------- |
| Express server, health endpoint, static site                                | 0.0.1   | Done                |
| Submission form with client-side validation                                 | 0.0.2   | Done                |
| Database, migrations and repository                                         | 0.0.3   | Done                |
| `POST /api/pqrs`, form connected to the API, case number                    | 0.1.0   | Done                |
| Status lookup with case number and email                                    | 0.1.1   | Done                |
| Rate limit for submissions, compression, proxy settings                     | 0.1.2   | Done                |
| Cache headers for static files, CORS from the environment                   | 0.1.3   | Done                |
| Staff panel: login, dashboard, search, status changes                       | 0.2.0   | Done                |
| Audit history of every status change                                        | 0.2.0   | Done                |
| Clean shutdown, Spanish README, isolation regression tests                  | 0.3.0   | Done                |
| Staff roles, account management and security settings                       | 0.3.1   | Done                |
| Replies, internal notes, assignment and request audit                       | 0.3.2   | Implemented locally |
| Configurable business-day deadlines and holiday calendar                    | 0.3.3   | Implemented locally |
| Secure attachments and application refinement                               | 0.3.4   | Implemented locally |
| Transactional email notifications                                           | 0.3.5   | Implemented locally |
| Staff reports and operational analytics                                     | 0.4.0   | Implemented locally |
| Filtered staff CSV export with spreadsheet formula mitigation               | 0.4.1   | Implemented locally |
| Coverage reports, Playwright browser smoke tests and accessibility checks   | 0.5.0   | Implemented locally |
| TOTP MFA, one-time recovery codes and administrator security-event explorer | 0.6.0   | Done                |
| Hardened Docker image, persistent volumes and container health check        | 0.7.0   | Released            |
| Version metadata and release-documentation consistency                      | 0.7.1   | In preparation      |

## ✨ What it does today

- Coverage report generated with Node's built-in test coverage tooling and a single command in the backend package.
- Real-browser smoke tests with Playwright cover the public submission flow, status lookup and staff login workflow.
- Automated accessibility checks on the critical public and staff screens with `@axe-core/playwright`.
- Submission form with live validation, a character counter and accessible error messages.
- The same validation rules run in the browser and on the server (`shared/validation.js`).
- SQLite storage with versioned migrations. Case numbers are generated atomically, one counter per year.
- Success screen with the case number, a copy button and a link to track the request.
- Tracking page: case number plus email shows the status with a progress timeline.
- Privacy by design: the lookup returns only status, type and dates (plus a published official response, when present); it never exposes staff deadline data, a wrong email and an unknown case number look the same, and every attempt is rate limited.
- Anti-spam field, 16 KB body limit and a request id on every response.
- Submissions are rate limited per client address (10 every 15 minutes by default, set in `.env`).
- Text answers (pages, styles, scripts, JSON) are compressed with gzip or brotli, with no extra dependency.
- Works behind a reverse proxy: `TRUST_PROXY` makes the rate limits see the real visitor.
- Cache rules: pages are always revalidated, styles and scripts are kept for an hour in production, and API answers are never stored.
- CORS is closed by default, because the pages come from the same server. `CORS_ORIGINS` opens it for the websites you list.
- **Staff login** with `scrypt` password hashes, opaque server-side sessions (only the hash of the token is stored), an `HttpOnly` + `SameSite=Strict` cookie (and `Secure` in production), CSRF protection and login rate limits per address and per account.
- **Protected panel** under `/admin/`: anonymous visitors only see the login page. The panel folder is outside `frontend/`, so the public static handler cannot serve it.
- **Dashboard**: counters per status, a paginated list with search, filters by status, type and date range, sorting, and a detail page for each request. Responsive and keyboard friendly.
- **Reports** (`/admin/reports.html`): staff-only UTC-period summaries of request volume, type and current-status distributions, response-time samples, and overdue-rate states. Categories with no matches remain zero; missing response or deadline data is not invented.
- **CSV export**: the reports page downloads matching requests through `GET /api/admin/pqrs/export.csv`. The export reuses the report's UTC date, type and current-status filters, contains only case number, request type, subject, current status and submission time, and rejects more than 5,000 matching rows rather than truncating. Requester contact details, descriptions and data from related tables are excluded.
- **Deadline management**: the staff list and detail show on-track, approaching, overdue, completed or unavailable states. Administrators configure each request type's business-day rule and explicit holidays through the protected staff API. Every new request snapshots the rule version, due date and applicable holiday dates; changing the configuration never silently rewrites old requests.
- **Secure attachments**: uploads are validated by extension, MIME type and file signatures, stored under `data/attachments/` outside the public web root and exposed only through authenticated request-scoped download endpoints. Citizens can access only files attached to the request they verified; staff can access public or internal attachments according to admin permissions. The public metadata is limited to safe names and sizes.
- **Status workflow** with permitted transitions (`closed` is final) and protection against two people changing the same request.
- **Audit history**: every status change records who, from which status to which, when and with which request id. It is saved in the same transaction as the change, is append-only and is never shown to the public.
- **Role-based access**: administrators manage accounts; staff can read and process PQRS but cannot access account administration. Both roles can work on all PQRS; assignment-level access is not implemented.
- **Account management**: administrators can create and edit accounts, assign roles, activate/deactivate accounts and reset passwords in `/admin/accounts.html`. New and reset accounts must change their temporary password at next login.
- **Security settings** (`/admin/security.html`): change your own password, review active sessions and revoke one or all other sessions. Password changes preserve the current session and revoke the rest.
- **Append-only account audit**: account, role, password and session-management changes are recorded transactionally, including the request id. Passwords, session tokens and hashes are never included.
- **Account tool** (`npm run admin`): bootstrap or recover accounts from the server's terminal. There are no default accounts.
- **Email notifications**: request receipts and published-response notices are queued transactionally in SQLite and retried by the outbox processor when SMTP is enabled. Email delivery does not determine whether a request or response is saved.
- **Reporting**: `GET /api/admin/reports` uses SQLite aggregates for counts and response time, and the saved deadline/holiday snapshots plus status audit history for deadline state at the selected period end. See the API reference for denominators and historical limitations.
- Clean shutdown: `Ctrl+C` or `SIGTERM` stop accepting connections, let running requests finish (up to 10 seconds) and close the SQLite database.
- Demo data and database reset commands for local development.
- Tests for validation, database and migrations, service, controller, rate limiter, compression, API, authentication, authorization, audit, status helpers and both frontends.

## 🛠️ Tech stack

This project deliberately avoids heavy frontend frameworks and ORMs to show strong fundamentals in vanilla JavaScript, DOM manipulation, SQL and REST API design.

- **Backend:** Node.js 22+, Express (REST API, routing, middleware).
- **Frontend:** HTML5, CSS3 and vanilla JavaScript (ES modules), served as static files.
- **Database:** SQLite via `better-sqlite3` (WAL mode, versioned SQL migrations), chosen for zero configuration and single-file portability.
- **Authentication:** Node's built-in `crypto` (`scrypt`, secure random tokens). No authentication library was added.
- **Shared code:** one validation module used by the browser and the server.
- **Quality and CI:** Node's native test runner (`node:test`), ESLint, Prettier and GitHub Actions on Node 22 and 24.

### Architecture

The backend follows a layered **Controller → Service → Repository** structure:

- **Routes** map HTTP endpoints to controllers.
- **Controllers** handle the request and send the response.
- **Services** hold the business rules (validation, normalization, case numbers, lookup, login, status workflow).
- **Repositories** run the SQL queries. The staff repositories are separate from the public one, so the public routes cannot reach them.
- **Middlewares** add the request id, compress the answers, limit the attempts, check the staff session and the CSRF token, and turn errors into JSON.

More details in [docs/architecture.md](./docs/architecture.md). The API is documented in [docs/api.md](./docs/api.md).

```
pqrs-flow/
├── backend/     # REST API (Express) and database layer
├── frontend/       # Public web interface (submit and track)
├── frontend-admin/ # Staff panel, served under /admin behind a login
├── shared/      # Code used by both browser and server
├── docs/        # Requirements, architecture, API reference
└── .github/     # CI workflow and templates
```

---

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or higher
- [Git](https://git-scm.com/)

### Local installation

```bash
git clone https://github.com/OAlexProgramerO/pqrs-flow.git
cd pqrs-flow
cp .env.example .env
npm run install:all
npm run dev
```

Then open:

- Frontend: <http://localhost:3000>
- API health: <http://localhost:3000/api/health>

To see data without typing it, add demo requests with `npm run seed`. It prints a case number and an email you can use on the tracking page (`/track.html`). To start from an empty database, run `npm run db:reset`.

### Staff panel: create the first administrator

There are **no default accounts**. The panel is closed until you create one on the machine that runs the server:

```bash
npm run admin -- create --email you@example.com --name "Your Name"
```

The command asks for the password twice and does not show what you type. It needs at least 12 characters. For scripts, send it through standard input (never as an argument, because arguments end up in shell history and process lists):

```bash
printf '%s' "$PASSWORD" | npm run admin -- create --email you@example.com --name "Your Name" --password-stdin
```

Then open <http://localhost:3000/admin/> and log in. Other commands:

| Command                                       | What it does                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run admin -- list`                       | Show the accounts and whether they are active                              |
| `npm run admin -- reset-password --email ...` | Set a new password and close every session of that account (lost password) |
| `npm run admin -- deactivate --email ...`     | Block an account and close its sessions at once                            |
| `npm run admin -- activate --email ...`       | Allow a deactivated account again                                          |

The tool uses the same database as the server (`DB_PATH`). Use the terminal to bootstrap the first administrator or recover access when no administrator can sign in; administrators can then create and manage accounts through the protected panel. If you are locked out by the login limits, wait for the window to pass or restart the server (the counters live in memory).

After the first account is created, use `/admin/accounts.html` to add staff or administrator accounts. New accounts default to the least-privileged `staff` role and must change the initial password at first login. Existing accounts are migrated as administrators to preserve their previous full access. There must always be at least one active administrator; an administrator cannot demote or deactivate their own account.

### Configuration

| Variable                           | Default                      | Description                                                                           |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                             | `3000`                       | Port of the server                                                                    |
| `NODE_ENV`                         | `development`                | `production` disables the seed and reset commands                                     |
| `DB_PATH`                          | `data/pqrs.db`               | SQLite file. Relative paths start at the project root.                                |
| `SUBMIT_RATE_LIMIT_MAX`            | `10`                         | New requests one client address may send in each window                               |
| `SUBMIT_RATE_LIMIT_WINDOW_MINUTES` | `15`                         | Length of that window in minutes                                                      |
| `TRUST_PROXY`                      | empty (off)                  | Number of reverse proxies in front of the app, for example `1`. See the note below.   |
| `CORS_ORIGINS`                     | empty (none)                 | Websites allowed to call the API from a browser, separated by commas, or `*`          |
| `STATIC_CACHE_SECONDS`             | `0`, or `3600` in production | Seconds a browser may keep styles, scripts and images                                 |
| `SESSION_IDLE_MINUTES`             | `30`                         | A staff session ends after this many minutes without use                              |
| `SESSION_MAX_HOURS`                | `8`                          | A staff session ends after this many hours, even if it is used all the time           |
| `SESSION_COOKIE_SECURE`            | `true` in production         | Adds `Secure` to the cookie, so it only travels over HTTPS. Keep it on in production. |
| `LOGIN_RATE_LIMIT_MAX`             | `10`                         | Staff login attempts per client address in each window                                |
| `LOGIN_ACCOUNT_RATE_LIMIT_MAX`     | `5`                          | Staff login attempts per account in each window                                       |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES`  | `15`                         | Length of the login window in minutes                                                 |

Deadline rules and holidays are managed by an administrator through the protected endpoints documented in [docs/api.md](./docs/api.md). Nothing is preconfigured. The calculation uses UTC, treats the submission date as day zero, and skips weekends and configured holidays. The five-business-day approaching indicator is an operational alert, not a legal rule. Verify deadlines against authoritative jurisdictional sources and organizational policy before use; PQRS Flow does not claim legal compliance.

**Staff area in production:** serve the app over HTTPS (the cookie is `Secure` and uses the `__Host-` prefix, so it does not work over plain HTTP), set `TRUST_PROXY` to the number of proxies so the login limits see the real address, and read [docs/security.md](./docs/security.md). The staff panel works from the same address as the public site only: CORS is never opened for it.

**Behind a reverse proxy** (Nginx, Render, Railway...) set `TRUST_PROXY` to the number of proxies, usually `1`. Without it the server sees the address of the proxy for every visitor, so all of them would share one rate limit. Leave it empty when nobody sits in front of the app, because trusting `X-Forwarded-For` without a proxy lets anyone fake their address. Avoid `TRUST_PROXY=true` for the same reason.

### Try the API

Open [docs/requests.http](./docs/requests.http) in VS Code with the REST Client extension, or run:

```bash
curl -X POST http://localhost:3000/api/pqrs \
  -H "Content-Type: application/json" \
  -d '{"type":"petition","subject":"Street light is broken","description":"The street light in front of my house has been off for two weeks.","requesterName":"Ana Gomez","requesterEmail":"ana@example.com"}'
```

### Docker Compose (optional)

Prerequisites: Docker Engine/Desktop with Compose v2. The existing local Node.js workflow remains available.

From the repository root in PowerShell:

```powershell
docker compose config
docker compose up --build -d
docker compose ps
docker compose logs -f app
Invoke-RestMethod http://localhost:3000/api/health
docker compose down
```

The service binds to `127.0.0.1:3000` by default and runs as UID `10001`, not root. The image is built from the backend lockfile and includes only production dependencies and runtime assets. Docker health reports that the HTTP health endpoint responds; it is not a full security, database-integrity, or external-email check.

SQLite persists in the named volume `pqrs_flow_database`; attachments persist separately in `pqrs_flow_attachments`. Rebuilding the image or running `docker compose down` preserves both volumes. To remove the containers but keep data, use `docker compose down`. **To permanently delete the stored database and attachments**, run `docker compose down --volumes` only after confirming that the data is disposable or safely backed up.

The Compose port is loopback-only. To deliberately expose it on a network, change the port binding only after planning HTTPS, secure cookies, firewall rules, and trusted-proxy settings. Do not set `TRUST_PROXY=true` unless every forwarded address is trustworthy. For HTTPS-terminated deployments, configure `SESSION_COOKIE_SECURE=true`.

Optional SMTP and CORS settings can be supplied as environment variables using the names documented in `.env.example` and `backend/src/config/env.js`. Never place real credentials in the image, Dockerfile, Compose file, or source control. Keep any local `.env` untracked. Keep `MFA_ENCRYPTION_KEY` stable across restarts and upgrades; changing it can make existing encrypted values unreadable. `SESSION_COOKIE_SECRET` and `SESSION_SECRET` are also forwarded when configured.

Back up the SQLite database and attachment volume as one coordinated set. Do not copy only `pqrs.db` while the app is writing, because SQLite WAL data may still be in `-wal` / `-shm` sidecars. For a simple consistent offline backup, stop the service with `docker compose stop`, preserve both volumes using your platform's approved volume-backup procedure, then start it with `docker compose start`. Backup automation is not included in v0.7.0.

This setup is for one application instance using SQLite. Do not scale the service to multiple replicas against the same database volume. Containerization does not by itself certify the application for production or provide cloud deployment, automated backups, or image publishing.

## 📜 Available scripts

| Command            | Description                                       |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | Start the Express server with auto-reload         |
| `npm start`        | Start the server                                  |
| `npm test`         | Run the test suite with Node's native test runner |
| `npm run lint`     | Find code problems with ESLint                    |
| `npm run format`   | Format all files with Prettier                    |
| `npm run check`    | Run lint, format check and tests in sequence      |
| `npm run seed`     | Add demo requests to the local database           |
| `npm run db:reset` | Delete the local database and its WAL files       |
| `npm run admin --` | Manage staff accounts (see above)                 |

`shutdown-signal.test.js` starts the real server and stops it with `SIGINT` and `SIGTERM`. It is skipped on Windows, where signals cannot be delivered to a child process, and runs in CI on Linux. The rest of the suite runs everywhere.

To run one test file use `npm --prefix backend test -- tests/admin-audit.test.js`. Going through `npm` matters: it gives the tests a temporary database, so they never touch `data/pqrs.db`.

## 🩺 Troubleshooting

| Problem                                                  | Solution                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE` when starting                               | Another process uses the port. Change `PORT` in `.env`.                                                     |
| The tracking page says "Too many attempts"               | The lookup allows 8 tries per case number every 15 minutes. Wait, or restart the server in development.     |
| The form says "Too many attempts"                        | Each address may send 10 requests every 15 minutes. Wait, or raise `SUBMIT_RATE_LIMIT_MAX` in `.env`.       |
| The browser blocks the API with a CORS error             | The page is served by another website or port (for example Live Server). Add its address to `CORS_ORIGINS`. |
| A changed script or style does not show up in production | Browsers keep them for `STATIC_CACHE_SECONDS`. Lower it, or force a reload with Ctrl+F5.                    |
| Every visitor is blocked at the same time                | The app is behind a proxy. Set `TRUST_PROXY=1` in the environment of the server.                            |
| The footer says it cannot reach the API                  | Start the server with `npm run dev`.                                                                        |
| `better-sqlite3` fails to install                        | Use Node 22 or 24 so the prebuilt binary is downloaded.                                                     |
| Old data keeps appearing                                 | Run `npm run db:reset` and, if you want demo data, `npm run seed`.                                          |
| The login says "Invalid email or password."              | Check both. The message is the same for a wrong password, an unknown account and a deactivated one.         |
| The login says "Too many attempts"                       | Wait for the window (15 minutes by default) or restart the server. Raise `LOGIN_RATE_LIMIT_MAX` if needed.  |
| Login works but the panel sends me back to the login     | In production the cookie is `Secure`: use HTTPS. Do not set `SESSION_COOKIE_SECURE=false` in production.    |
| "Cross-origin request blocked" in the panel              | The page was opened from another address than the server (for example Live Server). Use the server address. |
| I forgot my password                                     | On the server: `npm run admin -- reset-password --email you@example.com`.                                   |

## 🗺️ Planned next versions

Version `0.7.0` delivers containerization. Version `0.7.1` is a maintenance release in preparation to align version metadata and release documentation; it does not add application functionality. Plans can change after review; see [ROADMAP.md](./ROADMAP.md) for scope and decisions.

| Version | Work                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.7.1   | **Release consistency.** Align package versions, API health metadata, changelog, README files and roadmap with the v0.7.0 release. No new application features.                    |
| 0.8.0   | **Deployment and operations.** CI/CD release workflow, deployment guide, backup and restore procedures, and an operational checklist for secrets, persistent volumes and recovery. |
| 0.9.0   | **Release candidate.** Feature freeze, reproducible demo data, screenshots, end-to-end verification and final documentation.                                                       |
| 1.0.0   | **First stable release** with a public demo, documented support boundaries and a verified release process.                                                                         |

### Known limits of the current implementation

These limits remain relevant while the next milestones are planned:

- Both active staff roles can see and change every request; per-request assignment-based access restrictions are not implemented.
- TOTP MFA and one-time recovery codes are available, but password recovery still requires an administrator with access to the server terminal; there is no self-service password-reset email flow.
- Login and public-lookup rate-limit counters are held in memory. They reset when the process restarts and are not shared between multiple server processes. Run one server process for now; containerization does not change this limitation.
- A person who knows a staff email can consume that account's login-attempt budget. The per-address limit and administrator-assisted terminal recovery are the current mitigations.
- The public lookup has an in-memory limit of 8 attempts per case number per 15-minute window. Someone who knows a case number can temporarily exhaust that budget; lookup still requires the email and does not expose request data.
- Security events and account/status audit trails exist, but automatic retention and deletion policies are not implemented. Define a retention period and review applicable privacy requirements before production use.
- The search ignores letter case only for English letters (a limitation of SQLite `LIKE`), and date filters use UTC.
- SQLite is a single-file database and does not provide high availability. Backups and restore procedures must be established and tested before production use.
- Passing automated tests does not mean the system is production-ready. Review [docs/security.md](./docs/security.md) and validate the deployment in its target environment.

## 🤝 Contributing

Branch names, commit conventions (Conventional Commits), version numbers and the release process are described in [CONTRIBUTING.md](./CONTRIBUTING.md).

## 🏷️ Versioning

This project follows [Semantic Versioning](https://semver.org) adapted to learning phases:

- `0.X.0`: a new capability for users, delivered in one pull request.
- `0.X.Y`: the next step inside the same phase.
- `1.0.0`: first stable release with a public demo.

The plan is in [ROADMAP.md](./ROADMAP.md) and the full history in [CHANGELOG.md](./CHANGELOG.md).

## 📄 License

MIT. See [LICENSE](./LICENSE).
