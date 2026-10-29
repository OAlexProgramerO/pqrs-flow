# Roadmap

Path from **v0.0.1** to **v1.0.0**. Implementation status, Git tags and public publication are tracked separately; a merged implementation is not automatically a public release.

## Definition of done (every version)

- Code and tests complete, and `npm run check` is green
- `docs/api.md` and the README status table are updated
- The changelog has an entry; a release tag is created only after checks pass and the release is explicitly approved

## The plan

| Version | Branch                              | Goal                                                                                             | Status              |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 0.0.1   | `chore/project-setup`               | Express server, `/api/health`, static site, CI                                                   | Done                |
| 0.0.2   | `feat/submission-form`              | Submission form with client-side validation                                                      | Done                |
| 0.0.3   | `feat/database`                     | SQLite, migrations, repository and case numbers                                                  | Done                |
| 0.1.0   | `feat/submit-pqrs`                  | `POST /api/pqrs`, shared validation, form connected, success screen                              | Done                |
| 0.1.1   | `feat/track-pqrs`                   | Lookup with case number **and** email, tracking page, rate limits                                | Done                |
| 0.1.2   | `chore/hardening`                   | Rate limit for submissions, compression, proxy settings                                          | Done                |
| 0.1.3   | `chore/http-caching`                | Cache headers for static files and CORS origins from the environment                             | Done                |
| 0.2.0   | `feat/staff-panel`                  | Staff login, protected dashboard, search and filters, status workflow, audit                     | **Done**            |
| 0.3.0   | `chore/maintenance`                 | Clean shutdown, ESM scope of the staff frontend, test-isolation regression tests, Spanish README | **Done**            |
| 0.3.1   | `feat/v0.3.1-staff-roles`           | Roles, account management in the panel, password changes, session management and audit           | Implemented locally |
| 0.3.2   | `feat/v0.3.2-case-resolution`       | Published replies, internal notes, assignment, request-level audit events and focused staff UI   | Implemented locally |
| 0.3.3   | `feat/deadlines`                    | Configurable business-day rules, holidays, immutable due-date snapshots and staff indicators     | Implemented locally |
| 0.3.4   | `feat/attachments`                  | Safe file uploads with size and type limits                                                      | Implemented locally |
| 0.3.5   | `feat/email-notifications`          | Emails on filing and on answer, with an outbox and retries                                       | Implemented locally |
| 0.4.0   | `feat/reports`                      | Staff-only volume, type and status reports, response time and deadline status                    | Implemented locally |
| 0.4.1   | `feat/csv-export`                   | Bounded, filtered staff CSV export with protection against formula injection                     | Implemented locally |
| 0.5.0   | `chore/quality`                     | Coverage report, end-to-end smoke test, accessibility check                                      | Implemented locally |
| 0.6.0   | `feat/v0.6.0-mfa-audit`             | TOTP MFA, one-time recovery codes and administrator security-event explorer                      | Released            |
| 0.7.0   | `feat/v0.7.0-containerization`      | Hardened Docker image, persistent data storage, health check and Docker Compose                  | Released            |
| 0.7.1   | `chore/v0.7.1-version-consistency`  | Align package versions, API health metadata, changelog and project documentation                 | In preparation      |
| 0.8.0   | `feat/v0.8.0-deployment-operations` | Deployment workflow, backup and restore procedures, operations documentation                     | Planned             |
| 0.9.0   | `chore/release-candidate`           | Feature freeze, reproducible demo data, screenshots and final docs                               | Planned             |
| 1.0.0   | `chore/release-1.0`                 | First stable release with a public demo                                                          | Planned             |

The old 0.2.1 (`feat/staff-list`) and 0.2.2 (`feat/status-workflow`) were delivered together with the login in 0.2.0, so the panel is useful from its first release.

0.3.0 was released as a maintenance version before the planned staff accounts (old 0.2.1) and replies (old 0.2.2). So that no number is used twice, those two versions and the planned ones after them were renumbered 0.3.1 to 0.3.5. No released version changed. Their branch names and goals are the same.

## Decisions

| Decision                                                              | Reason                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public lookup needs the case number **and** the email                 | Sequential case numbers can be guessed. With the number alone anyone could read other people's requests.                                                                                   |
| Lookup is a `POST`, not a `GET` with the email in the URL             | URLs end up in logs and browser history.                                                                                                                                                   |
| One validation module shared by browser and server (0.1.0)            | The rules live in one place. The server still validates everything again.                                                                                                                  |
| Migrations instead of running a schema file at startup                | The schema can change safely and its history is versioned.                                                                                                                                 |
| Indexes only when a query needs them                                  | The panel list (0.2.0) added indexes on date, status and type. Every other column is searched with `LIKE`.                                                                                 |
| Performance and security work has its own version (0.1.2)             | It can be reviewed and measured on its own.                                                                                                                                                |
| Own in-memory rate limiter instead of a package (0.1.1)               | The lookup needed protection now. It is small, has no dependency and is tested with a fake clock.                                                                                          |
| Lookup limits per client address and per case number                  | One limit stops a computer, the other stops many computers guessing one email.                                                                                                             |
| Submission limit per client address, set in `.env` (0.1.2)            | Real people send one or two requests. A shared address still has room and the numbers change without code.                                                                                 |
| Own compression with Node's `zlib`, not a package (0.1.2)             | No new dependency, so the lock file and the audit stay as they are. Tested with files, ranges and slow clients.                                                                            |
| CORS closed by default, `CORS_ORIGINS` opens it (0.1.3)               | The pages and the API share one origin. The staff cookies of 0.2.0 must never be readable from other sites.                                                                                |
| Static files are not cached in development (0.1.3)                    | Their names have no version, so a long cache would hide edits. Production keeps them for an hour.                                                                                          |
| Proxy trust is off by default, `TRUST_PROXY` turns it on              | Trusting `X-Forwarded-For` without a proxy lets anyone fake an address and skip the limits.                                                                                                |
| Passwords use Node's built-in `scrypt` (0.2.0)                        | No extra dependency for the staff login.                                                                                                                                                   |
| Server-side sessions with opaque tokens, not JWT (0.2.0)              | A session can be closed at once (logout, reset, deactivation). Only the token hash is stored.                                                                                              |
| CSRF token derived from the session token (0.2.0)                     | Nothing extra to store, and another site cannot read the HttpOnly cookie to compute it.                                                                                                    |
| Staff pages live in `frontend-admin/`, outside `frontend/`            | The public static handler cannot serve them by accident, whatever spelling of the address someone tries.                                                                                   |
| The first administrator is bootstrapped from the server CLI           | Account management is available only to authenticated administrators; the CLI remains the recovery path if no administrator can sign in.                                                   |
| `closed` is a final status (0.2.0)                                    | A closed case keeps its meaning for reports. More work after closing is a new request.                                                                                                     |
| Audit rows are protected by triggers (0.2.0)                          | Even a bug in the application cannot rewrite the history. Status and audit are saved in one transaction.                                                                                   |
| Tests never open `data/pqrs.db` (0.2.0)                               | A migration or a write from a test must not change the database of a developer.                                                                                                            |
| Maintenance release 0.3.0 before the planned 0.2.x features           | The audit after 0.2.0 found only small reliability and documentation items. They were shipped first, and the planned versions moved to 0.3.1-0.3.5.                                        |
| Node 22 is the minimum, CI runs on 22 and 24                          | Node 20 reached end of life in April 2026.                                                                                                                                                 |
| Major dependency upgrades are planned, never automatic                | Express 5 and dotenv 18 can change behavior. Each one gets its own version and a checklist.                                                                                                |
| A pre-push hook runs the CI checks                                    | CI turned red three times because the checks were skipped before pushing to main.                                                                                                          |
| Docker image based on a slim Debian, not Alpine (introduced in 0.7.0) | `better-sqlite3` should use a compatible prebuilt binary where available; Debian also avoids Alpine/musl compatibility surprises. The implementation must still verify installation in CI. |
