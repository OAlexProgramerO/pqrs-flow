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
- **Staff member:** logs in to the panel, reviews cases and changes their status (0.2.0). In 0.3.1, staff can read and process all PQRS but cannot manage accounts.
- **Administrator:** manages staff accounts and has the same PQRS access as staff (0.3.1). The first administrator is created from the server's terminal; there are no default accounts.

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
10. FR-10: The first administrator is created and accounts can be recovered with a server-side command; there are no default accounts.
11. FR-11: Administrators can create accounts, search and filter the account list, edit account details, assign the `staff` or `administrator` role, activate/deactivate accounts, and reset another account's password.
12. FR-12: New accounts and administrator password resets require a password change at next login. Users can change their own password after confirming their current password.
13. FR-13: Users can list their active sessions and revoke one session or all other sessions. Password changes keep the current session and revoke the others.
14. FR-14: The system must always retain at least one active administrator. An administrator cannot change their own role or deactivate themselves.
15. FR-15: Account, role, password and session changes are recorded in an append-only account audit with the actor, target, time, request id and non-secret metadata.

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
- NFR-11: Existing accounts retain their previous full access after migration by becoming administrators; newly-created accounts default to the `staff` role. The migration does not rewrite prior migrations.
- NFR-12: Account endpoints enforce permissions on the server; hiding UI controls is not an authorization boundary.
- NFR-13: Passwords, password hashes, session tokens and token hashes must not appear in API responses or account-audit records.

## Request statuses

`Filed → In progress → Answered → Closed`

Staff may only follow the permitted transitions: `filed → in_progress`, `in_progress → answered`, `answered → closed` and `answered → in_progress` (reopen). `closed` is final. See [api.md](./api.md#status-transitions).

> Response deadlines depend on each organization's regulations. They will be configurable (phase 0.3).
