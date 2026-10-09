# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)

A web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions). Built end to end with JavaScript, prioritizing simplicity, no frontend build step and clear architectural boundaries.

**Status: v0.1.3** — Citizens can submit a request, receive a case number and track its status. Submissions are rate limited, answers are compressed, browsers cache the static files and the server can run behind a reverse proxy. See [ROADMAP.md](./ROADMAP.md) for the path to v1.0.0.

---

## 📖 The problem and the solution

Many organizations still handle feedback, complaints and requests through scattered emails, paper forms or social media messages. Requests get lost, responses are late and people are left without answers.

**PQRS Flow provides:**

1. **Public submission portal:** a responsive form that saves the request and returns a unique case number such as `PQRS-2026-000001`.
2. **Status lookup:** a public page where people check the status with the case number and their email, no account needed.
3. **Internal management panel (planned):** a protected area where staff review incoming cases, update their status (`Filed → In progress → Answered → Closed`) and answer them.

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
| Staff panel (login, list, status changes)                 | 0.2.x   | Planned |

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
- Demo data and database reset commands for local development.
- Tests for validation, database, service, controller, rate limiter, compression, API, status helpers and frontend client.

## 🛠️ Tech stack

This project deliberately avoids heavy frontend frameworks and ORMs to show strong fundamentals in vanilla JavaScript, DOM manipulation, SQL and REST API design.

- **Backend:** Node.js 22+, Express (REST API, routing, middleware).
- **Frontend:** HTML5, CSS3 and vanilla JavaScript (ES modules), served as static files.
- **Database:** SQLite via `better-sqlite3` (WAL mode, versioned SQL migrations), chosen for zero configuration and single-file portability.
- **Shared code:** one validation module used by the browser and the server.
- **Quality and CI:** Node's native test runner (`node:test`), ESLint, Prettier and GitHub Actions on Node 22 and 24.

### Architecture

The backend follows a layered **Controller → Service → Repository** structure:

- **Routes** map HTTP endpoints to controllers.
- **Controllers** handle the request and send the response.
- **Services** hold the business rules (validation, normalization, case numbers, lookup).
- **Repositories** run the SQL queries.
- **Middlewares** add the request id, compress the answers, limit the attempts and turn errors into JSON.

More details in [docs/architecture.md](./docs/architecture.md). The API is documented in [docs/api.md](./docs/api.md).

```
pqrs-flow/
├── backend/     # REST API (Express) and database layer
├── frontend/    # Static web interface
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

### Configuration

| Variable                           | Default                      | Description                                                                         |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `PORT`                             | `3000`                       | Port of the server                                                                  |
| `NODE_ENV`                         | `development`                | `production` disables the seed and reset commands                                   |
| `DB_PATH`                          | `data/pqrs.db`               | SQLite file. Relative paths start at the project root.                              |
| `SUBMIT_RATE_LIMIT_MAX`            | `10`                         | New requests one client address may send in each window                             |
| `SUBMIT_RATE_LIMIT_WINDOW_MINUTES` | `15`                         | Length of that window in minutes                                                    |
| `TRUST_PROXY`                      | empty (off)                  | Number of reverse proxies in front of the app, for example `1`. See the note below. |
| `CORS_ORIGINS`                     | empty (none)                 | Websites allowed to call the API from a browser, separated by commas, or `*`        |
| `STATIC_CACHE_SECONDS`             | `0`, or `3600` in production | Seconds a browser may keep styles, scripts and images                               |

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
