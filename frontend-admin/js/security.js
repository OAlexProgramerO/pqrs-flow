import {
  AdminApiError,
  changePassword,
  getSessions,
  revokeOtherSessions,
  revokeSession,
  getMfaStatus,
  beginMfaSetup,
  enableMfa,
  disableMfa,
  getSecurityEvents,
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

const mfaStatus = document.getElementById('mfaStatus');
const mfaSetupForm = document.getElementById('mfaSetupForm');
const mfaSetupPanel = document.getElementById('mfaSetup');
const mfaEnableForm = document.getElementById('mfaEnableForm');
const mfaDisableForm = document.getElementById('mfaDisableForm');
const mfaRecoveryPanel = document.getElementById('mfaRecoveryPanel');
const mfaMessage = document.getElementById('mfaMessage');

function showMfaMessage(text, kind = '') {
  showMessage(mfaMessage, text, kind);
}

function showRecoveryCodes(codes) {
  document.getElementById('mfaRecoveryCodes').textContent = codes.join('\n');
  document.getElementById('mfaSecret').textContent = '';
  document.getElementById('mfaUri').textContent = '';
  mfaRecoveryPanel.hidden = false;
  mfaSetupPanel.hidden = true;
  mfaSetupForm.hidden = true;
  mfaDisableForm.hidden = true;
  mfaStatus.textContent = 'MFA is enabled. Save your recovery codes before leaving this page.';
}

async function loadMfa() {
  try {
    const status = await getMfaStatus();
    mfaStatus.textContent = status.enabled
      ? `MFA is enabled. ${status.recoveryCodesRemaining} recovery code(s) remain.`
      : 'MFA is not enabled.';
    mfaSetupForm.hidden = status.enabled;
    mfaDisableForm.hidden = !status.enabled;
    mfaSetupPanel.hidden = true;
    mfaRecoveryPanel.hidden = true;
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMessage(mfaStatus, describeFailure(error), 'error');
  }
}

mfaSetupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('mfaSetupBtn');
  button.disabled = true;
  try {
    const { secret, otpauthUri } = await beginMfaSetup(mfaSetupForm.elements.password.value);
    document.getElementById('mfaSecret').textContent = secret;
    document.getElementById('mfaUri').textContent = otpauthUri;
    mfaSetupPanel.hidden = false;
    mfaSetupForm.hidden = true;
    mfaSetupForm.reset();
    showMfaMessage('Scan or enter the secret, then verify a code to enable MFA.');
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMfaMessage(describeFailure(error), 'error');
  } finally {
    button.disabled = false;
  }
});

mfaEnableForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('mfaEnableBtn');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(mfaEnableForm));
    const result = await enableMfa(values);
    mfaEnableForm.reset();
    showRecoveryCodes(result.recoveryCodes);
    showMfaMessage('MFA enabled successfully.', 'success');
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMfaMessage(describeFailure(error), 'error');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('mfaRecoveryDone').addEventListener('click', async () => {
  mfaRecoveryPanel.hidden = true;
  document.getElementById('mfaRecoveryCodes').textContent = '';
  await loadMfa();
});

mfaDisableForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!window.confirm('Disable multi-factor authentication for this account?')) return;
  const button = document.getElementById('mfaDisableBtn');
  button.disabled = true;
  try {
    await disableMfa(Object.fromEntries(new FormData(mfaDisableForm)));
    mfaDisableForm.reset();
    showMfaMessage('MFA has been disabled.', 'success');
    await loadMfa();
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMfaMessage(describeFailure(error), 'error');
  } finally {
    button.disabled = false;
  }
});

const eventsState = document.getElementById('eventsState');
const eventsWrap = document.getElementById('eventsWrap');
const eventsRows = document.getElementById('eventsRows');
const eventsPagination = document.getElementById('eventsPagination');
let eventsPage = 1;
const eventsPageSize = 25;
let eventsTotal = 0;
let eventsAdmin = false;

function eventCell(label, value) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  cell.textContent = value ?? '—';
  return cell;
}

async function loadSecurityEvents() {
  if (!eventsAdmin) return;
  const formValues = Object.fromEntries(new FormData(document.getElementById('eventsFilterForm')));
  showMessage(eventsState, 'Loading security events…');
  eventsWrap.hidden = true;
  eventsPagination.hidden = true;
  try {
    const result = await getSecurityEvents({
      ...formValues,
      page: eventsPage,
      pageSize: eventsPageSize,
    });
    eventsRows.replaceChildren();
    for (const item of result.items) {
      const row = document.createElement('tr');
      row.append(
        eventCell('Time (UTC)', formatDateTime(item.createdAt)),
        eventCell('Event', item.eventType),
        eventCell('Account ID', item.adminId === null ? '—' : String(item.adminId)),
        eventCell('IP address', item.ipAddress),
        eventCell('Request ID', item.requestId),
      );
      eventsRows.append(row);
    }
    eventsTotal = result.totalItems;
    eventsWrap.hidden = result.items.length === 0;
    showMessage(eventsState, result.items.length ? '' : 'No security events match these filters.');
    const pages = Math.max(1, Math.ceil(eventsTotal / eventsPageSize));
    eventsPagination.hidden = false;
    document.getElementById('eventsPageInfo').textContent =
      `Page ${eventsPage} of ${pages} · ${eventsTotal} event(s)`;
    document.getElementById('eventsPrev').disabled = eventsPage <= 1;
    document.getElementById('eventsNext').disabled = eventsPage >= pages;
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    showMessage(eventsState, describeFailure(error), 'error');
  }
}

document.getElementById('eventsFilterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  eventsPage = 1;
  loadSecurityEvents();
});
document.getElementById('eventsPrev').addEventListener('click', () => {
  eventsPage = Math.max(1, eventsPage - 1);
  loadSecurityEvents();
});
document.getElementById('eventsNext').addEventListener('click', () => {
  if (eventsPage * eventsPageSize < eventsTotal) eventsPage += 1;
  loadSecurityEvents();
});

try {
  const admin = await startSession();
  document.getElementById('forcedPasswordNotice').hidden = !admin.credentialUpdateRequired;
  await Promise.all([loadSessions(), loadMfa()]);
  eventsAdmin = admin.role === 'administrator';
  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.hidden = !eventsAdmin;
  });
  await loadSecurityEvents();
} catch (error) {
  showMessage(sessionsState, describeFailure(error), 'error');
}
