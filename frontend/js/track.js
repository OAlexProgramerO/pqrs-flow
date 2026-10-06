import { ApiError, lookupPqrs } from './api.js';
import {
  buildTimeline,
  describeStatus,
  describeWait,
  formatDateTime,
  typeLabel,
} from './status.js';
import { CASE_NUMBER_PATTERN, normalizeCaseNumber, validateLookup } from '/shared/validation.js';

const FIELDS = ['caseNumber', 'requesterEmail'];
const SUBMIT_LABEL = 'Check status';
const STEP_HINTS = { done: 'completed', current: 'current step', upcoming: 'not reached yet' };

export function initTrack() {
  const form = document.getElementById('lookupForm');
  if (!form) return;

  const lookupSection = document.getElementById('lookupSection');
  const messageEl = document.getElementById('lookupMessage');
  const submitBtn = document.getElementById('lookupBtn');
  const resultPanel = document.getElementById('resultPanel');
  const anotherBtn = document.getElementById('anotherBtn');

  const readForm = () => Object.fromEntries(new FormData(form));

  function showFieldError(field, message) {
    const input = form.elements[field];
    document.getElementById(`${field}-error`).textContent = message ?? '';

    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function showFieldErrors(errors) {
    FIELDS.forEach((field) => showFieldError(field, errors[field]));

    const firstInvalid = FIELDS.find((field) => errors[field]);
    if (firstInvalid) form.elements[firstInvalid].focus();
  }

  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = `message ${kind}`;
    messageEl.hidden = false;
  }

  function buildTimelineItem(step) {
    const item = document.createElement('li');
    item.className = step.state;
    if (step.state === 'current') item.setAttribute('aria-current', 'step');

    const hint = document.createElement('span');
    hint.className = 'visually-hidden';
    hint.textContent = ` (${STEP_HINTS[step.state]})`;

    item.append(step.label, hint);
    return item;
  }

  function showResult(result) {
    const info = describeStatus(result.status);

    const badge = document.getElementById('statusBadge');
    badge.textContent = info.label;
    badge.className = `status-badge status-${result.status}`;

    document.getElementById('statusText').textContent = info.description;
    document.getElementById('resultCaseNumber').textContent = result.caseNumber;
    document.getElementById('resultType').textContent = typeLabel(result.type);
    document.getElementById('resultCreated').textContent = formatDateTime(result.createdAt);
    document
      .getElementById('timeline')
      .replaceChildren(...buildTimeline(result.status).map(buildTimelineItem));

    messageEl.hidden = true;
    lookupSection.hidden = true;
    resultPanel.hidden = false;
    resultPanel.focus();
  }

  function showForm() {
    form.reset();
    FIELDS.forEach((field) => showFieldError(field));
    messageEl.hidden = true;
    resultPanel.hidden = true;
    lookupSection.hidden = false;
    form.elements.caseNumber.focus();
  }

  function describeFailure(error) {
    if (error instanceof ApiError && error.status === 429) {
      const wait = describeWait(error.retryAfter);
      return wait ? `${error.message} You can try again in ${wait}.` : error.message;
    }
    return error.message;
  }

  // Validate a field when the user leaves it
  form.addEventListener('focusout', (event) => {
    const field = event.target.name;
    if (!FIELDS.includes(field)) return;

    const { errors } = validateLookup(readForm());
    showFieldError(field, errors[field]);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.hidden = true;

    const { valid, errors, data } = validateLookup(readForm());

    if (!valid) {
      showFieldErrors(errors);
      showMessage('Please fix the highlighted fields.', 'error');
      return;
    }

    FIELDS.forEach((field) => showFieldError(field));
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking…';

    try {
      showResult(await lookupPqrs(data));
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.details) {
        showFieldErrors(error.details);
        showMessage('Please fix the highlighted fields.', 'error');
      } else {
        showMessage(describeFailure(error), 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = SUBMIT_LABEL;
    }
  });

  anotherBtn.addEventListener('click', showForm);

  // The confirmation page links here with ?case=..., so the person only has to type the email
  const params = new URLSearchParams(window.location.search);
  const caseNumber = normalizeCaseNumber(params.get('case'));

  if (CASE_NUMBER_PATTERN.test(caseNumber)) {
    form.elements.caseNumber.value = caseNumber;
    form.elements.requesterEmail.focus();
  }
  // Keep the case number out of the address bar and the browser history
  if (params.has('case')) window.history.replaceState(null, '', window.location.pathname);
}

initTrack();
