# Citizen tracking experience — v0.9.0

## Scope

The existing verified lookup (`POST /api/pqrs/lookup`) now returns a public activity timeline in addition to the current request status. The lookup still requires both the case number and the email address used at submission.

## Public event allowlist

Only these audited actions are exposed:

- `status_change`: the resulting status, previous status and event timestamp.
- `response_published`: publication timestamp. The official response body is returned separately in `officialResponse`.

The public contract intentionally excludes internal notes, draft responses, assignment changes, staff identifiers, request IDs, requester details and the original description.

## Operational and privacy notes

- Keep `Cache-Control: no-store` on lookup responses.
- Keep the existing IP and case-number rate limits.
- Do not add an endpoint that searches cases by case number alone.
- Do not expose the raw `pqrs_audit` table or allow clients to choose event types.
- Render all returned strings with `textContent`; do not inject response content as HTML.

## Validation

Run `npm run check`, then `npm run test:e2e` and `npm run test:a11y` from a fully installed development environment. Review the public lookup response to ensure internal notes and draft replies are absent.
