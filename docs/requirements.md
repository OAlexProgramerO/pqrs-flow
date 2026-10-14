# Requirements

## Request types

| Type                    | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| Petition (Petición)     | Request for information, a document or an action               |
| Complaint (Queja)       | Dissatisfaction with an employee's conduct or with the service |
| Claim (Reclamo)         | Demand for a right or a service not properly delivered         |
| Suggestion (Sugerencia) | Proposal to improve the service                                |

## Actors

- **Citizen:** submits and tracks requests (no account needed).
- **Staff member:** logs in to the panel, reviews cases and changes their status (0.2.0). Answering cases arrives in 0.3.2.
- **Administrator:** manages accounts. In 0.2.0 an account is created and recovered from the server's terminal; roles and a screen for it arrive in 0.3.1.

## Functional requirements (MVP)

1. FR-01: Submit a PQRS with type, subject, description and contact details.
2. FR-02: Generate a unique case number.
3. FR-03: Look up the status with the case number.
4. FR-04: View the history of status changes (staff side, since 0.2.0).
5. FR-05: Staff log in with an email and a password, and log out. Without a login there is no access to the panel or to its API.
6. FR-06: Staff list requests with pagination, search (case number, subject, name, email), filters by status, type and date range, and sorting.
7. FR-07: Staff open the detail of a request.
8. FR-08: Staff change the status only through the permitted transitions. A move that is not permitted, or based on an old view, is refused.
9. FR-09: Every status change is recorded with who, when, and the previous and new status.
10. FR-10: Staff accounts are created and recovered with a command, with no default account.

## Non-functional requirements

- NFR-01: Validate all input on the server.
- NFR-02: Do not expose personal data in the public lookup.
- NFR-03: Usable on mobile devices.
- NFR-04: Automated tests on critical routes.
- NFR-05: Passwords are stored only as salted `scrypt` hashes. Session tokens are stored only as hashes. Neither appears in a response or a log.
- NFR-06: Every request that changes data in the staff area is protected against CSRF and cross-site requests.
- NFR-07: Failed logins give one generic answer and are rate limited per address and per account.
- NFR-08: A status change and its audit record are saved together or not at all. The audit history cannot be changed by the application and is never public.
- NFR-09: The staff panel is responsive and usable with a keyboard and a screen reader (labels, focus, text on every status).
- NFR-10: Migrations keep existing requests and case numbers.

## Request statuses

`Filed → In progress → Answered → Closed`

Staff may only follow the permitted transitions: `filed → in_progress`, `in_progress → answered`, `answered → closed` and `answered → in_progress` (reopen). `closed` is final. See [api.md](./api.md#status-transitions).

> Response deadlines depend on each organization's regulations. They will be configurable (phase 0.3).
