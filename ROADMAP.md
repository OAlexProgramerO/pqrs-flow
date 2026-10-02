# Roadmap

Path from **v0.0.1** to **v1.0.0**. Every version must leave the project working and be marked with a `git tag` on GitHub.

## Phase 0.0.x — Foundations (small steps)

| Version | Goal | Visible result |
| --- | --- | --- |
| **0.0.1** | Repo, structure, Express server, `/api/health`, test, CI | The API responds and the page shows "API connected" |
| 0.0.2 | Submission form (frontend only) with client-side validation | Usable form, nothing saved yet |
| 0.0.3 | Database and `pqrs` table | Schema created on startup |

## Phase 0.1 — Citizen MVP

| Version | Goal |
| --- | --- |
| **0.1.0** | `POST /api/pqrs` stores the request and returns a **case number** (e.g. `PQRS-2026-000001`); the form is connected to it |
| 0.1.1 | `GET /api/pqrs/:caseNumber` + status lookup screen |
| 0.1.2 | Server-side validation hardening and clear error messages |

## Phase 0.2 — Internal panel

- Staff login (JWT + hashed passwords)
- List with filters by type, status and date
- Status changes: `Filed → In progress → Answered → Closed`
- Reply to the citizen and keep a history log

## Phase 0.3 — Business rules

- **Response deadline** calculation by request type (configurable)
- Alerts for cases close to expiring
- File attachments on submission
- Email notification to the citizen

## Phase 0.4 — Reports

- Dashboard: cases by type, status and average response time
- CSV export

## Phase 0.5 — Quality and deployment

- Test coverage on critical routes
- Docker + `docker-compose`
- Cloud deployment and public demo

## v1.0.0 — First stable release

- Everything above working and documented
- README with screenshots, live demo and technical decisions
- License, CHANGELOG and GitHub release
