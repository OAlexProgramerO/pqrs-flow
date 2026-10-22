import { AdminApiError, downloadCsv, getReports } from './admin-api.js';
import { describeFailure } from './messages.js';
import { goToLogin, isUnauthorized, startSession } from './session.js';

const TYPE_LABELS = {
  petition: 'Petition',
  complaint: 'Complaint',
  claim: 'Claim',
  suggestion: 'Suggestion',
};
const STATUS_LABELS = {
  filed: 'Received',
  in_progress: 'In progress',
  answered: 'Answered',
  closed: 'Closed',
};
const DEADLINE_LABELS = {
  overdue: 'Overdue',
  approaching: 'Approaching',
  onTime: 'On time',
  completed: 'Completed',
  unavailable: 'Deadline unavailable',
};
const form = document.getElementById('reportFilterForm');
const fields = ['from', 'to', 'type', 'status'];
let latestRequest = 0;

function setDefaultDates() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  form.elements.from.value = start.toISOString().slice(0, 10);
  form.elements.to.value = end.toISOString().slice(0, 10);
}

function readFilters() {
  return Object.fromEntries(fields.map((field) => [field, form.elements[field].value]));
}

function showFieldErrors(details = {}) {
  for (const field of fields) {
    const input = form.elements[field];
    const message = document.getElementById(`${field}-error`);
    message.textContent = details[field] ?? '';
    if (details[field]) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function setState(text, kind = '') {
  const state = document.getElementById('reportState');
  state.textContent = text;
  state.className = `message ${kind}`.trim();
  state.hidden = !text;
}

function metric(label, value, detail = '') {
  const card = document.createElement('article');
  card.className = 'report-card';
  const title = document.createElement('h3');
  title.textContent = label;
  const number = document.createElement('strong');
  number.className = 'report-card-value';
  number.textContent = value;
  card.append(title, number);
  if (detail) {
    const description = document.createElement('p');
    description.textContent = detail;
    card.append(description);
  }
  return card;
}

function renderSummary(report) {
  const response = report.responseTime.averageHours;
  const deadlines = report.deadlines;
  const overdueValue =
    deadlines.ratePercent === null ? 'Not available' : `${deadlines.ratePercent}%`;
  const overdueDetail = `${deadlines.numeratorOverdue} overdue of ${deadlines.denominatorWithDeadline} with a stored deadline`;

  document
    .getElementById('reportSummary')
    .replaceChildren(
      metric('Requests in period', String(report.totalRequests)),
      metric(
        'Average response time',
        response === null ? 'Not available' : `${response} hours`,
        `${report.responseTime.sampleSize} published responses in the sample`,
      ),
      metric('Overdue rate', overdueValue, overdueDetail),
    );
}

function barItem(label, count, max) {
  const item = document.createElement('li');
  item.className = 'report-bar-item';
  const text = document.createElement('span');
  text.className = 'report-bar-label';
  text.textContent = `${label}: ${count}`;
  const bar = document.createElement('progress');
  bar.className = 'report-bar-track';
  bar.max = max || 1;
  bar.value = count;
  bar.setAttribute('aria-hidden', 'true');
  item.append(text, bar);
  return item;
}

function renderBars(element, values, labelFor = (value) => value.period) {
  const max = Math.max(0, ...values.map((value) => value.count));
  element.replaceChildren(
    ...values.map(({ count, ...value }) => barItem(labelFor(value), count, max)),
  );
}

function renderReport(report) {
  showFieldErrors();
  renderSummary(report);
  renderBars(document.getElementById('volumeChart'), report.volume, ({ period }) =>
    report.filters.bucket === 'week' ? `Week of ${period}` : period,
  );
  renderBars(
    document.getElementById('typeChart'),
    Object.entries(report.byType).map(([type, count]) => ({ type, count })),
    ({ type }) => TYPE_LABELS[type] ?? type,
  );
  renderBars(
    document.getElementById('statusChart'),
    Object.entries(report.byStatus).map(([status, count]) => ({ status, count })),
    ({ status }) => STATUS_LABELS[status] ?? status,
  );

  const responseHasSample = report.responseTime.sampleSize > 0;
  document.getElementById('responseMethod').textContent = responseHasSample
    ? `Average time from request submission to the first published official response, measured in UTC.`
    : 'No published official responses are available in this period; no average is shown.';
  document.getElementById('responseSample').textContent =
    `Sample: ${report.responseTime.sampleSize} request${report.responseTime.sampleSize === 1 ? '' : 's'}. Drafts and internal notes are not responses.`;

  const deadline = report.deadlines;
  document.getElementById('deadlineRate').textContent =
    deadline.ratePercent === null
      ? 'Overdue rate is unavailable because no matching requests have a stored deadline.'
      : `${deadline.ratePercent}% (${deadline.numeratorOverdue} overdue out of ${deadline.denominatorWithDeadline} matching requests with a stored deadline).`;
  document.getElementById('deadlineMethod').textContent =
    `Deadline states are evaluated as of the end of ${deadline.asOf} UTC. Historical open or completed status is reconstructed from status-change audit records.`;
  document.getElementById('deadlineCounts').replaceChildren(
    ...Object.entries(deadline.counts).map(([key, count]) => {
      const item = document.createElement('li');
      item.textContent = `${DEADLINE_LABELS[key]}: ${count}`;
      return item;
    }),
  );

  const empty = report.totalRequests === 0;
  document.getElementById('volumeEmpty').hidden = !empty;
  document.getElementById('volumeChart').hidden = empty;
  setState(
    `Showing ${report.totalRequests} request${report.totalRequests === 1 ? '' : 's'} from ${report.filters.from} to ${report.filters.to} UTC.`,
  );
}

async function refresh() {
  const mine = ++latestRequest;
  const button = document.getElementById('refreshReportBtn');
  button.disabled = true;
  document.getElementById('reportSummary').replaceChildren();
  document.getElementById('volumeChart').replaceChildren();
  document.getElementById('typeChart').replaceChildren();
  document.getElementById('statusChart').replaceChildren();
  document.getElementById('deadlineCounts').replaceChildren();
  document.getElementById('volumeChart').hidden = true;
  document.getElementById('volumeEmpty').hidden = true;
  setState('Loading report…');

  try {
    const report = await getReports(readFilters());
    if (mine !== latestRequest) return;
    renderReport(report);
  } catch (error) {
    if (mine !== latestRequest) return;
    if (isUnauthorized(error)) return goToLogin();
    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showFieldErrors(error.details);
      setState('Please correct the highlighted filters.', 'error');
    } else {
      setState(describeFailure(error), 'error');
    }
  } finally {
    if (mine === latestRequest) button.disabled = false;
  }
}

async function exportCsv() {
  const button = document.getElementById('exportCsvBtn');
  const state = document.getElementById('exportState');
  button.disabled = true;
  state.textContent = 'Preparing CSV download…';
  state.className = 'message';
  state.hidden = false;

  try {
    await downloadCsv(readFilters());
    state.textContent = 'CSV download started.';
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showFieldErrors(error.details);
      state.textContent = 'Please correct the highlighted filters before exporting.';
    } else if (error instanceof AdminApiError && error.status === 403) {
      state.textContent = 'Your account is not allowed to export these requests.';
    } else if (error instanceof AdminApiError && error.status === 413) {
      state.textContent =
        'More than 5,000 requests match. Narrow the date range or add a type or status filter, then try again.';
    } else {
      state.textContent = 'The CSV could not be downloaded. Check your connection and try again.';
    }
    state.className = 'message error';
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  refresh();
});
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

try {
  await startSession();
  setDefaultDates();
  await refresh();
} catch (error) {
  setState(describeFailure(error), 'error');
}
