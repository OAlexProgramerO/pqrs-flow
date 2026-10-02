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
- **Staff member:** manages and answers cases.
- **Administrator:** manages users and settings.

## Functional requirements (MVP)

1. FR-01: Submit a PQRS with type, subject, description and contact details.
2. FR-02: Generate a unique case number.
3. FR-03: Look up the status with the case number.
4. FR-04: View the history of status changes.

## Non-functional requirements

- NFR-01: Validate all input on the server.
- NFR-02: Do not expose personal data in the public lookup.
- NFR-03: Usable on mobile devices.
- NFR-04: Automated tests on critical routes.

## Request statuses

`Filed → In progress → Answered → Closed`

> Response deadlines depend on each organization's regulations. They will be configurable (phase 0.3).
