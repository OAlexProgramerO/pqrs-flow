import { ApiError, createPqrs } from './api.js';
import { LIMITS, validatePqrs } from '/shared/validation.js';

const FIELDS = ['type', 'subject', 'description', 'requesterName', 'requesterEmail'];
const SUBMIT_LABEL = 'Submit PQRS';

export function initForm() {
  const form = document.getElementById('pqrsForm');
  if (!form) return;

  const formSection = document.getElementById('formSection');
  const messageEl = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');
  const counterEl = document.getElementById('descriptionCounter');
  const successPanel = document.getElementById('successPanel');
  const caseNumberEl = document.getElementById('caseNumber');
  const copyBtn = document.getElementById('copyBtn');
  const newRequestBtn = document.getElementById('newRequestBtn');

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

  function updateCounter() {
    counterEl.textContent = `${form.elements.description.value.length} / ${LIMITS.description.max}`;
  }

  function showSuccess(caseNumber) {
    form.reset();
    updateCounter();
    messageEl.hidden = true;

    caseNumberEl.textContent = caseNumber;
    formSection.hidden = true;
    successPanel.hidden = false;
    successPanel.focus();
  }

  function showForm() {
    successPanel.hidden = true;
    formSection.hidden = false;
    form.elements.type.focus();
  }

  // Validate a field when the user leaves it
  form.addEventListener('focusout', (event) => {
    const field = event.target.name;
    if (!FIELDS.includes(field)) return;

    const { errors } = validatePqrs(readForm());
    showFieldError(field, errors[field]);
  });

  form.elements.description.addEventListener('input', updateCounter);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.hidden = true;

    const values = readForm();
    const { valid, errors, data } = validatePqrs(values);

    if (!valid) {
      showFieldErrors(errors);
      showMessage('Please fix the highlighted fields.', 'error');
      return;
    }

    FIELDS.forEach((field) => showFieldError(field));
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      // The hidden "website" field travels with the data so the server can spot bots
      const created = await createPqrs({ ...data, website: values.website ?? '' });
      showSuccess(created.caseNumber);
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        showFieldErrors(error.details);
        showMessage('Please fix the highlighted fields.', 'error');
      } else {
        showMessage(error.message, 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = SUBMIT_LABEL;
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(caseNumberEl.textContent);
      copyBtn.textContent = 'Copied!';
    } catch {
      copyBtn.textContent = 'Select the number and copy it';
    }
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 2500);
  });

  newRequestBtn.addEventListener('click', showForm);

  updateCounter();
}
