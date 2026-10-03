# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)

A lightweight web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions). Built end to end with JavaScript, prioritizing simplicity, no frontend build step and clear architectural boundaries.

**Status: v0.0.2** — Submission form with client-side validation. See [ROADMAP.md](./ROADMAP.md) for the path to v1.0.0.

---

## 📖 The problem and the solution

Many organizations still handle feedback, complaints and requests through scattered emails, paper forms or social media messages. Requests get lost, responses are late and people are left without answers.

**PQRS Flow aims to provide:**

1. **Public submission portal:** a clean, responsive form to submit a request and receive a unique case number (e.g. `PQRS-2026-000001`).
2. **Status lookup:** a public page where people check the status of their request with the case number, no account needed.
3. **Internal management panel:** a protected area where staff review incoming cases, update their status (`Filed → In progress → Answered → Closed`) and answer them.

### Project status

| Feature                                      | Version | Status  |
| -------------------------------------------- | ------- | ------- |
| Express server, health endpoint, static site | 0.0.1   | Done    |
| Submission form with client-side validation  | 0.0.2   | Done    |
| Database and `pqrs` table                    | 0.0.3   | Planned |
| Save a request and return a case number      | 0.1.0   | Planned |
| Status lookup by case number                 | 0.1.1   | Planned |
| Staff panel (login, list, status changes)    | 0.2.0   | Planned |

## 🛠️ Tech stack

This project deliberately avoids heavy frontend frameworks and ORMs to show strong fundamentals in vanilla JavaScript, DOM manipulation, SQL and REST API design.

- **Backend:** Node.js 20+, Express (REST API, routing, middleware).
- **Frontend:** HTML5, CSS3 and vanilla JavaScript (ES modules), served as static files.
- **Database (planned):** SQLite via `better-sqlite3`, chosen for zero configuration and single-file portability.
- **Validation (planned on the server):** Zod schemas for incoming payloads.
- **Quality and CI:** Node's native test runner (`node:test`), ESLint, Prettier and GitHub Actions.

### Architecture

The backend grows towards a layered **Controller → Service → Repository** structure:

- **Routes** map HTTP endpoints to controllers.
- **Controllers** handle the request and send the response.
- **Services** hold the business rules (e.g. generating case numbers).
- **Repositories** run the SQL queries.
- **Validators** check the data before it reaches the service layer.

Only routes exist today; the other layers are added in v0.1.0. More details in [docs/architecture.md](./docs/architecture.md).

---

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or higher
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

## 📜 Available scripts

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Start the Express server with auto-reload         |
| `npm start`      | Start the server                                  |
| `npm test`       | Run the test suite with Node's native test runner |
| `npm run lint`   | Find code problems with ESLint                    |
| `npm run format` | Format all files with Prettier                    |
| `npm run check`  | Run lint, format check and tests in sequence      |

## 🤝 Contributing

Branch names, commit conventions (Conventional Commits) and the release process are described in [CONTRIBUTING.md](./CONTRIBUTING.md).

## 🏷️ Versioning

This project follows [Semantic Versioning](https://semver.org) adapted to learning phases:

- `0.0.x`: small steps, each one leaves the app working.
- `0.x.0`: milestones that deliver a complete feature.
- `1.0.0`: first stable release.

The full history is in [CHANGELOG.md](./CHANGELOG.md).

## 📄 License

MIT. See [LICENSE](./LICENSE).
