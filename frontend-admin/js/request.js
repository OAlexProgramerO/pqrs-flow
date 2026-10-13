import { AdminApiError, changeStatus, getRequest } from './admin-api.js';
import { describeFailure } from './messages.js';
import { goToLogin, isUnauthorized, startSession } from './session.js';
import { describeStatus, formatDateTime, typeLabel } from '/js/status.js';
import { CASE_NUMBER_PATTERN, normalizeCaseNumber } from '/shared/validation.js';

const els = {
  detailState: document.getElementById('detailState'),
  retryRow: document.getElementById('detailRetryRow'),
  retryBtn: document.getElementById('detailRetryBtn'),
  detail: document.getElementById('detail'),
  statusPanel: document.getElementById('statusPanel'),
  historyPanel: document.getElementById('historyPanel'),
  statusForm: document.getElementById('statusForm'),
  newStatus: document.getElementById('newStatus'),
  statusBtn: document.getElementById('statusBtn'),
  statusError: document.getElementById('status-error'),
  statusMessage: document.getElementById('statusMessage'),
  noTransitions: document.getElementById('noTransitions'),
  history: document.getElementById('history'),
};

const caseNumber = normalizeCaseNumber(new URLSearchParams(window.location.search).get('case'));

// The status the person is looking at. It travels with the change, so the server can tell when
// someone else changed the request in the meantime.
let currentStatus = null;

function showState(text, kind = '') {
  els.detailState.textContent = text;
  els.detailState.className = `message ${kind}`.trim();
  els.detailState.hidden = !text;
}

function showStatusMessage(text, kind) {
  els.statusMessage.textContent = text;
  els.statusMessage.className = `message ${kind}`;
  els.statusMessage.hidden = false;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function buildHistoryItem({ when, text }) {
  const item = document.createElement('li');

  const time = document.createElement('time');
  time.dateTime = when;
  time.textContent = formatDateTime(when);

  const span = document.createElement('span');
  span.textContent = text;

  item.append(time, span);
  return item;
}

function showHistory(pqrs, history) {
  // Filing a request is done by the citizen, so it has no audit record: it is the first line
  const entries = [{ when: pqrs.createdAt, text: 'Request received (filed by the requester).' }];

  for (const entry of history) {
    entries.push({
      when: entry.createdAt,
      text: `${describeStatus(entry.previousStatus).label} → ${describeStatus(entry.newStatus).label} by ${entry.admin.displayName}`,
    });
  }

  els.history.replaceChildren(...entries.map(buildHistoryItem));
}

function showTransitions(allowedTransitions) {
  const options = allowedTransitions.map((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = describeStatus(status).label;
    return option;
  });

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a status…';
  placeholder.disabled = true;
  placeholder.selected = true;

  els.newStatus.replaceChildren(placeholder, ...options);

  const canChange = allowedTransitions.length > 0;
  els.statusForm.hidden = !canChange;
  els.noTransitions.hidden = canChange;
}

function showDetail({ pqrs, allowedTransitions, history }) {
  currentStatus = pqrs.status;
  document.title = `${pqrs.caseNumber} · PQRS Flow staff`;

  setText('caseNumber', pqrs.caseNumber);
  setText('type', typeLabel(pqrs.type));
  setText('createdAt', formatDateTime(pqrs.createdAt));
  setText('requesterName', pqrs.requesterName);
  setText('requesterEmail', pqrs.requesterEmail);
  setText('subject', pqrs.subject);
  setText('description', pqrs.description);

  const badge = document.getElementById('statusBadge');
  badge.textContent = describeStatus(pqrs.status).label;
  badge.className = `status-badge status-${pqrs.status}`;

  showTransitions(allowedTransitions);
  showHistory(pqrs, history);

  showState('');
  els.retryRow.hidden = true;
  els.detail.hidden = false;
  els.statusPanel.hidden = false;
  els.historyPanel.hidden = false;
}

async function loadDetail() {
  showState('Loading the request…');
  els.retryRow.hidden = true;

  try {
    showDetail(await getRequest(caseNumber));
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();

    els.detail.hidden = true;
    els.statusPanel.hidden = true;
    els.historyPanel.hidden = true;

    if (error instanceof AdminApiError && error.status === 404) {
      showState('No request has that case number.', 'error');
    } else {
      showState(describeFailure(error), 'error');
      els.retryRow.hidden = false;
    }
  }
}

els.statusForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.statusMessage.hidden = true;
  els.statusError.textContent = '';
  els.newStatus.removeAttribute('aria-invalid');

  const status = els.newStatus.value;
  if (!status) {
    els.statusError.textContent = 'Select the new status.';
    els.newStatus.setAttribute('aria-invalid', 'true');
    els.newStatus.focus();
    return;
  }

  els.statusBtn.disabled = true;
  els.statusBtn.textContent = 'Updating…';

  try {
    const result = await changeStatus(caseNumber, { status, expectedStatus: currentStatus });
    showDetail(result);
    showStatusMessage(`Status changed to "${describeStatus(status).label}".`, 'success');
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();

    if (error instanceof AdminApiError && error.status === 409) {
      // Somebody else changed it first: show what the request looks like now
      showStatusMessage(error.message, 'error');
      await loadDetail();
      showStatusMessage(error.message, 'error');
    } else if (error instanceof AdminApiError && error.status === 403) {
      showStatusMessage('Your session is out of date. Reload the page and try again.', 'error');
    } else {
      showStatusMessage(describeFailure(error), 'error');
    }
  } finally {
    els.statusBtn.disabled = false;
    els.statusBtn.textContent = 'Update status';
    if (!els.statusMessage.hidden) els.statusMessage.focus();
  }
});

els.retryBtn.addEventListener('click', loadDetail);

try {
  if (!CASE_NUMBER_PATTERN.test(caseNumber)) {
    showState(
      'The case number is missing or not valid. Open the request from the dashboard.',
      'error',
    );
  } else {
    await startSession();
    await loadDetail();
  }
} catch (error) {
  showState(describeFailure(error), 'error');
}
