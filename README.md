# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)

A web system to submit, track and manage **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_ (Petitions, Complaints, Claims and Suggestions) — built end to end with JavaScript.

> Status: **v0.0.1** — project foundations. See the [ROADMAP](./ROADMAP.md) for what comes next.

## The problem

Many organizations receive PQRS by email, paper or social media and lose track of them. PQRS Flow provides:

- A public form to **submit** a request and get a case number.
- A **status lookup** using that case number.
- An internal panel to **assign, answer and close** cases on time.

## Tech stack

| Layer    | Technology                                       |
| -------- | ------------------------------------------------ |
| Backend  | Node.js 20+, Express                             |
| Frontend | HTML + CSS + JavaScript (ES modules)             |
| Database | SQLite via `better-sqlite3` (planned for v0.0.3) |
| Quality  | `node:test`, ESLint, Prettier, GitHub Actions    |

## Project structure

```
pqrs-flow/
├── backend/     # REST API (Express)
├── frontend/    # Static web interface
├── docs/        # Requirements and architecture
└── .github/     # CI workflow and templates
```

## Getting started

Requirements: [Node.js 20+](https://nodejs.org) and [Git](https://git-scm.com).

```bash
git clone https://github.com/OAlexProgramerO/pqrs-flow.git
cd pqrs-flow
cp .env.example .env
npm run install:all
npm run dev
```

Open <http://localhost:3000>. The health endpoint is `GET /api/health`.

## Scripts

| Command          | What it does                      |
| ---------------- | --------------------------------- |
| `npm run dev`    | Start the server with auto-reload |
| `npm start`      | Start the server                  |
| `npm test`       | Run the tests                     |
| `npm run lint`   | Lint with ESLint                  |
| `npm run format` | Format with Prettier              |
| `npm run check`  | Lint + format check + tests       |

## Contributing

Branch naming, commit conventions and the release process are described in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Versioning

This project follows [SemVer](https://semver.org) adapted to phases:

- `0.0.x` — small steps, each one leaves something working
- `0.x.0` — phases that deliver a complete feature
- `1.0.0` — first stable, deployed release

History lives in [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
