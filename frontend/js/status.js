/**
 * Texts and helpers to show the state of a request.
 * Pure functions, so they can be tested without a browser.
 */
export const STATUS_FLOW = ['filed', 'in_progress', 'answered', 'closed'];

const STATUS_INFO = {
  filed: {
    label: 'Received',
    description: 'Your request was received and is waiting for a staff member.',
  },
  in_progress: {
    label: 'In progress',
    description: 'A staff member is working on your request.',
  },
  answered: {
    label: 'Answered',
    description: 'Your request was answered.',
  },
  closed: {
    label: 'Closed',
    description: 'Your request is closed. Submit a new one if you need anything else.',
  },
};

const TYPE_LABELS = {
  petition: 'Petition',
  complaint: 'Complaint',
  claim: 'Claim',
  suggestion: 'Suggestion',
};

export function describeStatus(status) {
  return (
    STATUS_INFO[status] ?? {
      label: 'Unknown',
      description: 'The status of this request is not available.',
    }
  );
}

export function typeLabel(type) {
  return TYPE_LABELS[type] ?? type;
}

/**
 * The steps of a request with the state of each one: done, current or upcoming.
 */
export function buildTimeline(status) {
  const current = STATUS_FLOW.indexOf(status);

  return STATUS_FLOW.map((step, index) => {
    let state = 'upcoming';
    if (current !== -1 && index < current) state = 'done';
    if (index === current) state = 'current';

    return { status: step, label: STATUS_INFO[step].label, state };
  });
}

/**
 * Formats an ISO date for people. Returns an empty string when the date is not valid.
 */
export function formatDateTime(iso, { locale, timeZone } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

/**
 * Turns the seconds of a Retry-After header into words such as "about 3 minutes".
 */
export function describeWait(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return 'less than a minute';

  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
