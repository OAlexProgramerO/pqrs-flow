# Roadmap

Path from **v0.0.1** to **v1.0.0**. Each version is one branch, one pull request and one `git tag`.

## Definition of done (every version)

- Code and tests merged, and `npm run check` is green
- `docs/api.md` and the README status table are updated
- The changelog has an entry and the release commit is tagged

## The plan

| Version | Branch                    | Goal                                                                  | Status   |
| ------- | ------------------------- | --------------------------------------------------------------------- | -------- |
| 0.0.1   | `chore/project-setup`     | Express server, `/api/health`, static site, CI                        | Done     |
| 0.0.2   | `feat/submission-form`    | Submission form with client-side validation                           | Done     |
| 0.0.3   | `feat/database`           | SQLite, migrations, repository and case numbers                       | Done     |
| 0.1.0   | `feat/submit-pqrs`        | `POST /api/pqrs`, shared validation, form connected, success screen   | Done     |
| 0.1.1   | `feat/track-pqrs`         | Lookup with case number **and** email, tracking page, rate limits     | **Done** |
| 0.1.2   | `chore/hardening`         | Rate limit for submissions, gzip, cache headers, CORS from env, proxy | Next     |
| 0.2.0   | `feat/staff-auth`         | Staff login with hashed passwords and httpOnly cookie sessions        | Planned  |
| 0.2.1   | `feat/staff-list`         | Paginated list with filters and an index                              | Planned  |
| 0.2.2   | `feat/status-workflow`    | State machine, reply text, history table                              | Planned  |
| 0.3.0   | `feat/deadlines`          | Due date per request type, business days, overdue flag                | Planned  |
| 0.3.1   | `feat/attachments`        | Safe file uploads with size and type limits                           | Planned  |
| 0.3.2   | `feat/email-notifications`| Emails on filing and on answer, with an outbox and retries            | Planned  |
| 0.4.0   | `feat/reports`            | Dashboard of cases by type, status and response time                  | Planned  |
| 0.4.1   | `feat/csv-export`         | Streamed CSV export with protection against formula injection         | Planned  |
| 0.5.0   | `chore/quality`           | Coverage report, end-to-end smoke test, accessibility check           | Planned  |
| 0.5.1   | `chore/docker`            | Multi-stage Dockerfile and `docker compose`                           | Planned  |
| 0.5.2   | `chore/deploy`            | Cloud deployment, CI/CD and database backups                          | Planned  |
| 0.9.0   | `chore/release-candidate` | Feature freeze, demo data, screenshots and final docs                 | Planned  |
| 1.0.0   | `chore/release-1.0`       | First stable release with a public demo                               | Planned  |

## Decisions

| Decision                                                          | Reason                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Public lookup needs the case number **and** the email             | Sequential case numbers can be guessed. With the number alone anyone could read other people's requests. |
| Lookup is a `POST`, not a `GET` with the email in the URL         | URLs end up in logs and browser history.                                                    |
| One validation module shared by browser and server (0.1.0)        | The rules live in one place. The server still validates everything again.                   |
| Migrations instead of running a schema file at startup            | The schema can change safely and its history is versioned.                                  |
| Indexes only when a query needs them                              | The only index today is the unique case number. The panel index arrives in 0.2.1.           |
| Performance and security work has its own version (0.1.2)         | It can be reviewed and measured on its own.                                                 |
| Own in-memory rate limiter instead of a package (0.1.1)           | The lookup needed protection now. It is small, has no dependency and is tested with a fake clock. |
| Lookup limits per client address and per case number              | One limit stops a computer, the other stops many computers guessing one email.              |
| Passwords use Node's built-in `scrypt` (0.2.0)                    | No extra dependency for the staff login.                                                    |
| Node 22 is the minimum, CI runs on 22 and 24                      | Node 20 reached end of life in April 2026.                                                  |
| Docker image based on a slim Debian, not Alpine (0.5.1)           | `better-sqlite3` installs from a prebuilt binary instead of compiling.                      |
