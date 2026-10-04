# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)

A web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions). Built end to end with JavaScript, prioritizing simplicity, no frontend build step and clear architectural boundaries.

**Status: v0.1.0** — Citizens can submit a request and receive a case number. See [ROADMAP.md](./ROADMAP.md) for the path to v1.0.0.

---

## 📖 The problem and the solution

Many organizations still handle feedback, complaints and requests through scattered emails, paper forms or social media messages. Requests get lost, responses are late and people are left without answers.

**PQRS Flow provides:**

1. **Public submission portal:** a responsive form that saves the request and returns a unique case number such as `PQRS-2026-000001`.
2. **Status lookup (next):** a public page where people check the status with the case number and their email, no account needed.
3. **Internal management panel (planned):** a protected area where staff review incoming cases, update their status (`Filed → In progress → Answered → Closed`) and answer them.

### Project status

| Feature                                                    | Version | Status  |
| ---------------------------------------------------------- | ------- | ------- |
| Express server, health endpoint, static site               | 0.0.1   | Done    |
| Submission form with client-side validation                | 0.0.2   | Done    |
| Database, migrations and repository                        | 0.0.3   | Done    |
| `POST /api/pqrs`, form connected to the API, case number   | 0.1.0   | Done    |
| Status lookup with case number and email                   | 0.1.1   | Planned |
| Rate limiting, compression, graceful shutdown              | 0.1.2   | Planned |
| Staff panel (login, list, status changes)                  | 0.2.x   | Planned |

## ✨ What it does today

- Submission form with live validation, a character counter and accessible error messages.
- The same validation rules run in the browser and on the server (`shared/validation.js`).
- SQLite storage with versioned migrations. Case numbers are generated atomically, one counter per year.
- Success screen with the case number and a copy button.
- Anti-spam field, 16 KB body limit and a request id on every response.
- Demo data and database reset commands for local development.
- Tests for validation, database, service, controller, API and frontend client.

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
- **Services** hold the business rules (validation, normalization, case numbers).
- **Repositories** run the SQL queries.
- **Middlewares** add the request id and turn errors into JSON.

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

To see data without typing it, add demo requests with `npm run seed`. To start from an empty database, run `npm run db:reset`.

### Configuration

| Variable   | Default         | Description                                                    |
| ---------- | --------------- | -------------------------------------------------------------- |
| `PORT`     | `3000`          | Port of the server                                             |
| `NODE_ENV` | `development`   | `production` disables the seed and reset commands              |
| `DB_PATH`  | `data/pqrs.db`  | SQLite file. Relative paths start at the project root.         |

### Try the API

Open [docs/requests.http](./docs/requests.http) in VS Code with the REST Client extension, or run:

```bash
curl -X POST http://localhost:3000/api/pqrs \
  -H "Content-Type: application/json" \
  -d '{"type":"petition","subject":"Street light is broken","description":"The street light in front of my house has been off for two weeks.","requesterName":"Ana Gomez","requesterEmail":"ana@example.com"}'
```

## 📜 Available scripts

| Command                | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Start the Express server with auto-reload                  |
| `npm start`            | Start the server                                           |
| `npm test`             | Run the test suite with Node's native test runner          |
| `npm run lint`         | Find code problems with ESLint                             |
| `npm run format`       | Format all files with Prettier                             |
| `npm run check`        | Run lint, format check and tests in sequence               |
| `npm run seed`         | Add demo requests to the local database                    |
| `npm run db:reset`     | Delete the local database and its WAL files                |

## 🩺 Troubleshooting

| Problem                          | Solution                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| `EADDRINUSE` when starting       | Another process uses the port. Change `PORT` in `.env`.                   |
| The footer says it cannot reach the API | Start the server with `npm run dev`.                               |
| `better-sqlite3` fails to install | Use Node 22 or 24 so the prebuilt binary is downloaded.                  |
| Old data keeps appearing         | Run `npm run db:reset` and, if you want demo data, `npm run seed`.        |

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
