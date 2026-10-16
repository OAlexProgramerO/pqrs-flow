import {
  AdminApiError,
  changePassword,
  getSessions,
  revokeOtherSessions,
  revokeSession,
} from './admin-api.js';
import { describeFailure } from './messages.js';
import { goToLogin, isUnauthorized, startSession } from './session.js';
import { formatDateTime } from '/js/status.js';

const form = document.getElementById('passwordForm');
const passwordMessage = document.getElementById('passwordMessage');
const passwordButton = document.getElementById('passwordBtn');
const sessionsState = document.getElementById('sessionsState');
const sessionsWrap = document.getElementById('sessionsWrap');
const sessionRows = document.getElementById('sessionRows');
const revokeOthersButton = document.getElementById('revokeOthersBtn');

function showMessage(element, text, kind = '') {
  element.textContent = text;
  element.className = `message ${kind}`.trim();
  element.hidden = !text;
}

function showPasswordErrors(errors = {}) {
  for (const field of ['currentPassword', 'newPassword', 'confirmPassword']) {
    const input = form.elements[field];
    const message = errors[field] ?? '';
    document.getElementById(`${field}-error`).textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function sessionCell(label, value) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  cell.textContent = value;
  return cell;
}

function showSessions(sessions) {
  sessionRows.replaceChildren();
  sessionsWrap.hidden = sessions.length === 0;
  showMessage(
    sessionsState,
    sessions.length ? '' : 'No active sessions.',
    sessions.length ? '' : '',
  );
  revokeOthersButton.disabled = sessions.filter((session) => !session.current).length === 0;

  for (const session of sessions) {
    const row = document.createElement('tr');
    const actionCell = document.createElement('td');
    actionCell.dataset.label = 'Action';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = 'Revoke';
    button.setAttribute(
      'aria-label',
      `Revoke session started ${formatDateTime(session.createdAt)}${session.current ? ', this session' : ''}`,
    );
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await revokeSession(session.sessionId);
        if (session.current) return goToLogin({ expired: false });
        await loadSessions();
      } catch (error) {
        if (isUnauthorized(error)) return goToLogin();
        showMessage(sessionsState, describeFailure(error), 'error');
        button.disabled = false;
      }
    });
    actionCell.append(button);
    row.append(
      sessionCell('Started', formatDateTime(session.createdAt)),
      sessionCell('Last activity', formatDateTime(session.lastSeenAt)),
      sessionCell('Expires', formatDateTime(session.expiresAt)),
      sessionCell('This session', session.current ? 'Yes' : 'No'),
      actionCell,
    );
    sessionRows.append(row);
  }
}

async function loadSessions() {
  sessionsWrap.hidden = true;
  showMessage(sessionsState, 'Loading sessions…');
  try {
    const { sessions } = await getSessions();
    showSessions(sessions);
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMessage(sessionsState, describeFailure(error), 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(passwordMessage, '');
  const values = Object.fromEntries(new FormData(form));
  showPasswordErrors();
  if (values.newPassword !== values.confirmPassword) {
    showPasswordErrors({ confirmPassword: 'The new passwords do not match.' });
    return;
  }

  passwordButton.disabled = true;
  passwordButton.textContent = 'Updating…';
  try {
    await changePassword(values);
    form.reset();
    showMessage(passwordMessage, 'Password updated. Your other sessions were closed.', 'success');
    document.getElementById('forcedPasswordNotice').hidden = true;
    await loadSessions();
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showPasswordErrors(error.details);
    }
    showMessage(passwordMessage, describeFailure(error), 'error');
    form.elements.currentPassword.value = '';
    form.elements.currentPassword.focus();
  } finally {
    passwordButton.disabled = false;
    passwordButton.textContent = 'Update password';
  }
});

revokeOthersButton.addEventListener('click', async () => {
  revokeOthersButton.disabled = true;
  try {
    const { revoked } = await revokeOtherSessions();
    showMessage(
      sessionsState,
      `${revoked} other session${revoked === 1 ? '' : 's'} revoked.`,
      'success',
    );
    await loadSessions();
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMessage(sessionsState, describeFailure(error), 'error');
    revokeOthersButton.disabled = false;
  }
});

try {
  const admin = await startSession();
  document.getElementById('forcedPasswordNotice').hidden = !admin.credentialUpdateRequired;
  await loadSessions();
} catch (error) {
  showMessage(sessionsState, describeFailure(error), 'error');
}
