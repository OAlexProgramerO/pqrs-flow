# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)

A web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions). Built end to end with JavaScript, prioritizing simplicity, no frontend build step and clear architectural boundaries.

**Status: v0.2.0** — Citizens can submit a request, receive a case number and track its status. Authorized staff now log in to a protected panel, search and filter requests, move them through the status workflow and leave a permanent audit trail. It is a step toward a complete PQRS system: the plan for the next versions is in the _Future versions_ section below and in [ROADMAP.md](./ROADMAP.md). It has not been through a production deployment yet, see [docs/security.md](./docs/security.md) before exposing it.

---

## 📖 The problem and the solution

Many organizations still handle feedback, complaints and requests through scattered emails, paper forms or social media messages. Requests get lost, responses are late and people are left without answers.

**PQRS Flow provides:**

1. **Public submission portal:** a responsive form that saves the request and returns a unique case number such as `PQRS-2026-000001`.
2. **Status lookup:** a public page where people check the status with the case number and their email, no account needed.
3. **Internal staff panel:** a protected area (`/admin/`) where authorized staff log in, review incoming cases, search and filter them, and update their status (`Filed → In progress → Answered → Closed`). Every change is recorded in an audit history.

### Project status

| Feature                                                   | Version | Status  |
| --------------------------------------------------------- | ------- | ------- |
| Express server, health endpoint, static site              | 0.0.1   | Done    |
| Submission form with client-side validation               | 0.0.2   | Done    |
| Database, migrations and repository                       | 0.0.3   | Done    |
| `POST /api/pqrs`, form connected to the API, case number  | 0.1.0   | Done    |
| Status lookup with case number and email                  | 0.1.1   | Done    |
| Rate limit for submissions, compression, proxy settings   | 0.1.2   | Done    |
| Cache headers for static files, CORS from the environment | 0.1.3   | Done    |
| Staff panel: login, dashboard, search, status changes     | 0.2.0   | Done    |
| Audit history of every status change                      | 0.2.0   | Done    |
| Roles, replies, deadlines, attachments, emails, reports   | 0.2.x+  | Planned |

## ✨ What it does today

- Submission form with live validation, a character counter and accessible error messages.
- The same validation rules run in the browser and on the server (`shared/validation.js`).
- SQLite storage with versioned migrations. Case numbers are generated atomically, one counter per year.
- Success screen with the case number, a copy button and a link to track the request.
- Tracking page: case number plus email shows the status with a progress timeline.
- Privacy by design: the lookup returns only status, type and dates, a wrong email and an unknown case number look the same, and every attempt is rate limited.
- Anti-spam field, 16 KB body limit and a request id on every response.
- Submissions are rate limited per client address (10 every 15 minutes by default, set in `.env`).
- Text answers (pages, styles, scripts, JSON) are compressed with gzip or brotli, with no extra dependency.
- Works behind a reverse proxy: `TRUST_PROXY` makes the rate limits see the real visitor.
- Cache rules: pages are always revalidated, styles and scripts are kept for an hour in production, and API answers are never stored.
- CORS is closed by default, because the pages come from the same server. `CORS_ORIGINS` opens it for the websites you list.
- **Staff login** with `scrypt` password hashes, opaque server-side sessions (only the hash of the token is stored), an `HttpOnly` + `SameSite=Strict` cookie (and `Secure` in production), CSRF protection and login rate limits per address and per account.
- **Protected panel** under `/admin/`: anonymous visitors only see the login page. The panel folder is outside `frontend/`, so the public static handler cannot serve it.
- **Dashboard**: counters per status, a paginated list with search, filters by status, type and date range, sorting, and a detail page for each request. Responsive and keyboard friendly.
- **Status workflow** with permitted transitions (`closed` is final) and protection against two people changing the same request.
- **Audit history**: every status change records who, from which status to which, when and with which request id. It is saved in the same transaction as the change, is append-only and is never shown to the public.
- **Account tool** (`npm run admin`): create and recover staff accounts from the server's terminal. There are no default accounts.
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

The tool uses the same database as the server (`DB_PATH`). Accounts cannot be created or recovered over HTTP on purpose: whoever can run the command already controls the server. If you are locked out by the login limits, wait for the window to pass or restart the server (the counters live in memory).

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

**Staff area in production:** serve the app over HTTPS (the cookie is `Secure` and uses the `__Host-` prefix, so it does not work over plain HTTP), set `TRUST_PROXY` to the number of proxies so the login limits see the real address, and read [docs/security.md](./docs/security.md). The staff panel works from the same address as the public site only: CORS is never opened for it.

**Behind a reverse proxy** (Nginx, Render, Railway...) set `TRUST_PROXY` to the number of proxies, usually `1`. Without it the server sees the address of the proxy for every visitor, so all of them would share one rate limit. Leave it empty when nobody sits in front of the app, because trusting `X-Forwarded-For` without a proxy lets anyone fake their address. Avoid `TRUST_PROXY=true` for the same reason.

### Try the API

Open [docs/requests.http](./docs/requests.http) in VS Code with the REST Client extension, or run:

```bash
curl -X POST http://localhost:3000/api/pqrs \
  -H "Content-Type: application/json" \
  -d '{"type":"petition","subject":"Street light is broken","description":"The street light in front of my house has been off for two weeks.","requesterName":"Ana Gomez","requesterEmail":"ana@example.com"}'
```

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

## 🗺️ Future versions

The goal is a complete PQRS system, built one small, tested step at a time. Version 0.2.0 is the base of the staff side; everything below is **planned, not implemented**. The order may change. The branch names and the reasons behind each decision are in [ROADMAP.md](./ROADMAP.md).

| Version | Planned work                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.2.1   | **Staff accounts and roles.** Staff and administrator roles, creating and deactivating accounts from the panel, change of own password, list of active sessions with the option to close them.         |
| 0.2.2   | **Replies and internal notes.** The answer text that the citizen can read when tracking a request, private notes between staff, assigning a request to a person, a screen to browse the audit history. |
| 0.3.0   | **Deadlines.** Legal response time per request type, business days and holidays, overdue and soon-to-expire flags in the list.                                                                         |
| 0.3.1   | **Attachments.** Safe uploads (size, type and content checks, files stored outside the web root) for citizens and staff.                                                                               |
| 0.3.2   | **Email notifications.** Email when a request is received and when it is answered, with an outbox and retries so an email failure never loses a request.                                               |
| 0.4.0   | **Reports.** Requests by type and status over time, average response time, overdue rate.                                                                                                               |
| 0.4.1   | **CSV export.** Streamed export of the filtered list, with protection against formula injection in spreadsheets.                                                                                       |
| 0.5.0   | **Quality.** Coverage report, an end-to-end test of the whole flow in a real browser, an automated accessibility check.                                                                                |
| 0.5.1   | **Authentication hardening.** Second factor (TOTP), login limits and sessions that survive a restart and work with more than one server process, a security event log.                                 |
| 0.5.2   | **Docker.** Multi-stage image and `docker compose`.                                                                                                                                                    |
| 0.5.3   | **Deployment.** Cloud deployment, CI/CD and automatic database backups.                                                                                                                                |
| 0.9.0   | **Release candidate.** Feature freeze, demo data, screenshots and final documentation.                                                                                                                 |
| 1.0.0   | **First stable release** with a public demo.                                                                                                                                                           |

### Known limits of 0.2.0

These are deliberate and are the reason for some of the versions above:

- Staff accounts are created from the server's terminal. There is a single kind of staff user: everyone can see and change every request (0.2.1).
- Staff can change the status but cannot write a reply to the citizen or notes yet (0.2.2).
- The login limits and the staff sessions are meant for **one server process**. The limit counters live in memory and restart with the server. With several instances behind a load balancer the limits would be per instance (0.5.1).
- There is no second factor and no email, so there is no "forgot my password" link: recovery needs access to the server (0.5.1, 0.3.2).
- A login counts every attempt toward the account limit, so someone who knows an email can make that account wait. Staff can still be recovered from the terminal.
- The search ignores letter case only for English letters (a limit of SQLite's `LIKE`), and dates in the filters are in UTC.
- Passing the automated tests does not mean the system is ready for production. Review [docs/security.md](./docs/security.md) and test it in your environment first.

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
