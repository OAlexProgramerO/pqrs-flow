/**
 * The life of a request. These are the same four statuses the database accepts and the public
 * lookup shows. Staff may only follow the transitions below:
 *
 *   filed ──► in_progress ──► answered ──► closed
 *                  ▲              │
 *                  └── reopen ────┘
 *
 * `closed` is final. A request that needs more work after being closed is a new request.
 */
export const STATUSES = ['filed', 'in_progress', 'answered', 'closed'];

export const TRANSITIONS = Object.freeze({
  filed: Object.freeze(['in_progress']),
  in_progress: Object.freeze(['answered']),
  answered: Object.freeze(['closed', 'in_progress']),
  closed: Object.freeze([]),
});

export function isStatus(value) {
  return typeof value === 'string' && STATUSES.includes(value);
}

/**
 * The statuses a request can move to from `status`. Unknown statuses have none.
 */
export function allowedTransitions(status) {
  return [...(TRANSITIONS[status] ?? [])];
}

export function canTransition(from, to) {
  return allowedTransitions(from).includes(to);
}
