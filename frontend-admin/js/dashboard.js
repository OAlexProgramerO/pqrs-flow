import { AdminApiError, getStats, listRequests } from './admin-api.js';
import { describeFailure } from './messages.js';
import { isUnauthorized, goToLogin, startSession } from './session.js';
import { describeStatus, formatDateTime, typeLabel } from '/js/status.js';

const STATUS_ORDER = ['filed', 'in_progress', 'answered', 'closed'];
const FILTER_FIELDS = ['q', 'from', 'to'];

const els = {
  filterForm: document.getElementById('filterForm'),
  metrics: document.getElementById('metrics'),
  metricsMessage: document.getElementById('metricsMessage'),
  listState: document.getElementById('listState'),
  retryRow: document.getElementById('retryRow'),
  retryBtn: document.getElementById('retryBtn'),
  tableWrap: document.getElementById('tableWrap'),
  rows: document.getElementById('rows'),
  pagination: document.getElementById('pagination'),
  pageInfo: document.getElementById('pageInfo'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  applyBtn: document.getElementById('applyBtn'),
};

// What the person asked for. The server checks all of it again.
const state = { page: 1, lastPage: 1 };

// Only the newest answer may draw: a slow old answer must not replace a newer one
let latestRequest = 0;

function readFilters() {
  const form = new FormData(els.filterForm);
  const [sort, order] = String(form.get('sort')).split(':');

  return {
    q: String(form.get('q')).trim(),
    status: form.get('status'),
    type: form.get('type'),
    from: form.get('from'),
    to: form.get('to'),
    sort,
    order,
    pageSize: form.get('pageSize'),
    page: state.page,
  };
}

function showFieldErrors(details = {}) {
  for (const field of ['q', 'from', 'to']) {
    const input = els.filterForm.elements[field];
    document.getElementById(`${field}-error`).textContent = details[field] ?? '';

    if (details[field]) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function showListState(text, kind = '') {
  els.listState.textContent = text;
  els.listState.className = `message ${kind}`.trim();
  els.listState.hidden = !text;
}

function setLoading(loading) {
  els.tableWrap.setAttribute('aria-busy', String(loading));
  els.applyBtn.disabled = loading;
}

function cell(label, content) {
  const td = document.createElement('td');
  td.dataset.label = label;
  td.append(content);
  return td;
}

function buildRow(item) {
  const tr = document.createElement('tr');

  const link = document.createElement('a');
  link.href = `request.html?case=${encodeURIComponent(item.caseNumber)}`;
  link.textContent = item.caseNumber;

  // The text of the badge says the status, so it never depends on the color alone
  const badge = document.createElement('span');
  badge.className = `status-badge status-${item.status}`;
  badge.textContent = describeStatus(item.status).label;

  tr.append(
    cell('Case number', link),
    cell('Type', typeLabel(item.type)),
    cell('Subject', item.subject),
    cell('Requester', item.requesterName),
    cell('Status', badge),
    cell('Submitted', formatDateTime(item.createdAt)),
  );
  return tr;
}

function showPage({ data, pagination }) {
  state.lastPage = Math.max(1, pagination.totalPages);

  els.rows.replaceChildren(...data.map(buildRow));
  els.retryRow.hidden = true;

  if (pagination.totalItems === 0) {
    els.tableWrap.hidden = true;
    els.pagination.hidden = true;
    showListState('No requests match these filters.');
    return;
  }

  showListState('');
  els.tableWrap.hidden = false;
  els.pagination.hidden = false;

  const first = (pagination.page - 1) * pagination.pageSize + 1;
  const last = first + data.length - 1;
  els.pageInfo.textContent =
    data.length === 0
      ? `Page ${pagination.page} has no requests (${pagination.totalItems} in total)`
      : `${first}–${last} of ${pagination.totalItems} · page ${pagination.page} of ${pagination.totalPages}`;

  els.prevBtn.disabled = pagination.page <= 1;
  els.nextBtn.disabled = pagination.page >= pagination.totalPages;
}

async function loadList() {
  const mine = ++latestRequest;

  setLoading(true);
  showListState('Loading requests…');
  els.retryRow.hidden = true;

  try {
    const result = await listRequests(readFilters());
    if (mine !== latestRequest) return;

    showFieldErrors();
    showPage(result);
  } catch (error) {
    if (mine !== latestRequest) return;
    if (isUnauthorized(error)) return goToLogin();

    els.tableWrap.hidden = true;
    els.pagination.hidden = true;

    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showFieldErrors(error.details);
      showListState('Please fix the highlighted filters.', 'error');
    } else {
      showListState(describeFailure(error), 'error');
      els.retryRow.hidden = false;
    }
  } finally {
    if (mine === latestRequest) setLoading(false);
  }
}

function buildMetric({ status, label, count }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `metric${status ? ` status-${status}` : ''}`;
  button.dataset.status = status;
  button.setAttribute('aria-pressed', 'false');

  const number = document.createElement('span');
  number.className = 'metric-count';
  number.textContent = String(count);

  const text = document.createElement('span');
  text.className = 'metric-label';
  text.textContent = label;

  button.append(number, text);
  return button;
}

function markSelectedMetric() {
  const selected = els.filterForm.elements.status.value;

  for (const button of els.metrics.children) {
    button.setAttribute('aria-pressed', String(button.dataset.status === selected));
  }
}

async function loadStats() {
  try {
    const { total, byStatus } = await getStats();

    els.metrics.replaceChildren(
      buildMetric({ status: '', label: 'All requests', count: total }),
      ...STATUS_ORDER.map((status) =>
        buildMetric({ status, label: describeStatus(status).label, count: byStatus[status] ?? 0 }),
      ),
    );
    els.metricsMessage.hidden = true;
    markSelectedMetric();
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();

    els.metricsMessage.textContent = `The numbers could not be loaded. ${describeFailure(error)}`;
    els.metricsMessage.hidden = false;
  }
}

function search() {
  state.page = 1;
  markSelectedMetric();
  return loadList();
}

els.filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});

els.filterForm.addEventListener('reset', () => {
  // The form is reset after this event, so the search waits for the next turn
  setTimeout(search, 0);
});

// Changing a select applies the filter at once. Text and dates wait for the Apply button.
els.filterForm.addEventListener('change', (event) => {
  if (!FILTER_FIELDS.includes(event.target.name)) search();
});

els.metrics.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-status]');
  if (!button) return;

  els.filterForm.elements.status.value = button.dataset.status;
  search();
});

els.prevBtn.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadList();
  }
});

els.nextBtn.addEventListener('click', () => {
  if (state.page < state.lastPage) {
    state.page += 1;
    loadList();
  }
});

els.retryBtn.addEventListener('click', loadList);

try {
  await startSession();
  await Promise.all([loadStats(), loadList()]);
} catch (error) {
  showListState(describeFailure(error), 'error');
  els.retryRow.hidden = true;
}
