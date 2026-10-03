import { LIMITS, validatePqrs } from './validation.js';

const FIELDS = ['type', 'subject', 'description', 'requesterName', 'requesterEmail'];

// Replaced by a POST /api/pqrs request in v0.1.0
async function submitPqrs(data) {
  console.info('PQRS ready to send:', data);
}

export function initForm() {
  const form = document.getElementById('pqrsForm');
  if (!form) return;

  const messageEl = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');
  const counterEl = document.getElementById('descriptionCounter');

  const readForm = () => Object.fromEntries(new FormData(form));

  function showFieldError(field, message) {
    const input = form.elements[field];
    document.getElementById(`${field}-error`).textContent = message ?? '';

    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = `message ${kind}`;
    messageEl.hidden = false;
  }

  function updateCounter() {
    counterEl.textContent = `${form.elements.description.value.length} / ${LIMITS.description.max}`;
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

    const { valid, errors, data } = validatePqrs(readForm());
    FIELDS.forEach((field) => showFieldError(field, errors[field]));

    if (!valid) {
      form.elements[FIELDS.find((field) => errors[field])].focus();
      showMessage('Please fix the highlighted fields.', 'error');
      return;
    }

    submitBtn.disabled = true;
    try {
      await submitPqrs(data);
      form.reset();
      updateCounter();
      showMessage(
        'Your request is valid and ready to send. Saving it on the server arrives in v0.1.0.',
        'success',
      );
    } catch {
      showMessage('Something went wrong. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  updateCounter();
}
