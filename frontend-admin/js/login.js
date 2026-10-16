import { AdminApiError, getSession, login } from './admin-api.js';
import { describeFailure } from './messages.js';

const FIELDS = ['email', 'password'];
const form = document.getElementById('loginForm');
const messageEl = document.getElementById('loginMessage');
const submitBtn = document.getElementById('loginBtn');

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = `message ${kind}`;
  messageEl.hidden = false;
}

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

// Only checks that something was typed. The server decides everything else.
function checkFields({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email address is required.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  messageEl.hidden = true;

  const data = Object.fromEntries(new FormData(form));
  const errors = checkFields(data);

  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    showMessage('Please fix the highlighted fields.', 'error');
    return;
  }

  FIELDS.forEach((field) => showFieldError(field));
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const result = await login({ email: data.email.trim(), password: data.password });
    window.location.assign(
      result.admin.credentialUpdateRequired ? '/admin/security.html' : '/admin/',
    );
  } catch (error) {
    // The password is cleared on any failure, so it does not stay in the form
    form.elements.password.value = '';

    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showFieldErrors(error.details);
      showMessage('Please fix the highlighted fields.', 'error');
    } else {
      showMessage(describeFailure(error), 'error');
      form.elements.password.focus();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
});

// Someone who is already logged in goes straight to the dashboard
getSession()
  .then(({ admin }) =>
    window.location.replace(admin.credentialUpdateRequired ? '/admin/security.html' : '/admin/'),
  )
  .catch(() => {
    if (new URLSearchParams(window.location.search).has('expired')) {
      showMessage('Your session ended. Please log in again.', 'error');
    }
  });
