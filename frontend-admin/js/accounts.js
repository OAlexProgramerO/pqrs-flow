import {
  AdminApiError,
  createStaff,
  getStaffAudit,
  listStaff,
  resetStaffPassword,
  updateStaff,
} from './admin-api.js';
import { describeFailure } from './messages.js';
import { goToLogin, isUnauthorized, startSession } from './session.js';
import { formatDateTime } from '/js/status.js';

const createForm = document.getElementById('createForm');
const createButton = document.getElementById('createBtn');
const createMessage = document.getElementById('createMessage');
const filterForm = document.getElementById('filterForm');
const accountsState = document.getElementById('accountsState');
const accountsWrap = document.getElementById('accountsWrap');
const accountRows = document.getElementById('accountRows');
const pagination = document.getElementById('pagination');
const pageInfo = document.getElementById('pageInfo');
const auditDialog = document.getElementById('auditDialog');
const auditState = document.getElementById('auditState');
const auditItems = document.getElementById('auditItems');
const state = { page: 1, lastPage: 1, currentAdminId: null };

function message(element, text, kind = '') {
  element.textContent = text;
  element.className = `message ${kind}`.trim();
  element.hidden = !text;
}

function showCreateErrors(errors = {}) {
  for (const field of ['displayName', 'email', 'password', 'confirmPassword']) {
    const input = createForm.elements[field];
    const text = errors[field] ?? '';
    document.getElementById(`${field}-error`).textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function cell(label, nodeOrText) {
  const td = document.createElement('td');
  td.dataset.label = label;
  if (nodeOrText instanceof Node) td.append(nodeOrText);
  else td.textContent = String(nodeOrText);
  return td;
}

function selectControl(label, value, choices, disabled = false) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  select.disabled = disabled;
  for (const [optionValue, text] of choices) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = text;
    select.append(option);
  }
  select.value = value;
  return select;
}

function makePasswordForm(account) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Reset';
  details.append(summary);
  if (account.id === state.currentAdminId) {
    const hint = document.createElement('p');
    hint.textContent = 'Use Account security to change your own password.';
    details.append(hint);
    return details;
  }

  const form = document.createElement('form');
  form.className = 'reset-form';
  form.noValidate = true;
  for (const [name, label, autocomplete] of [
    ['password', 'Temporary password', 'new-password'],
    ['confirmPassword', 'Confirm temporary password', 'new-password'],
  ]) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const inputLabel = document.createElement('label');
    inputLabel.textContent = label;
    const input = document.createElement('input');
    input.name = name;
    input.type = 'password';
    input.required = true;
    input.minLength = 12;
    input.maxLength = 128;
    input.autocomplete = autocomplete;
    inputLabel.htmlFor = `reset-${account.id}-${name}`;
    input.id = inputLabel.htmlFor;
    group.append(inputLabel, input);
    form.append(group);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-secondary';
  submit.textContent = 'Reset password';
  form.append(submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const status = document.createElement('p');
    status.className = 'message';
    status.setAttribute('role', 'status');
    form.querySelector('.message')?.remove();
    if (values.password !== values.confirmPassword) {
      status.textContent = 'The passwords do not match.';
      status.classList.add('error');
      form.append(status);
      return;
    }
    submit.disabled = true;
    try {
      await resetStaffPassword(account.id, values);
      form.reset();
      status.textContent = 'Password reset. The account must change it at next sign-in.';
      status.classList.add('success');
      await loadAccounts();
    } catch (error) {
      if (isUnauthorized(error)) return goToLogin();
      status.textContent = describeFailure(error);
      status.classList.add('error');
    } finally {
      submit.disabled = false;
      form.append(status);
    }
  });
  details.append(form);
  return details;
}

async function showAudit(account) {
  auditItems.replaceChildren();
  message(auditState, 'Loading account activity…');
  auditDialog.showModal();
  try {
    const { items } = await getStaffAudit(account.id, { page: 1, pageSize: 50 });
    if (items.length === 0) {
      message(auditState, 'No account activity recorded.');
      return;
    }
    message(auditState, '');
    for (const entry of items) {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = entry.createdAt;
      time.textContent = formatDateTime(entry.createdAt);
      const text = document.createElement('span');
      text.textContent = `${entry.action.replaceAll('_', ' ')} · ${entry.actorName ?? 'Server command'}`;
      item.append(time, text);
      auditItems.append(item);
    }
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    message(auditState, describeFailure(error), 'error');
  }
}

function buildAccountRow(account) {
  const row = document.createElement('tr');
  const name = document.createElement('input');
  name.type = 'text';
  name.value = account.displayName;
  name.required = true;
  name.minLength = 2;
  name.maxLength = 100;
  name.setAttribute('aria-label', `Name for ${account.email}`);
  const email = document.createElement('input');
  email.type = 'email';
  email.value = account.email;
  email.required = true;
  email.maxLength = 254;
  email.setAttribute('aria-label', `Email address for ${account.displayName}`);
  const ownAccount = account.id === state.currentAdminId;
  const role = selectControl(
    `Role for ${account.displayName}`,
    account.role,
    [
      ['staff', 'Staff'],
      ['administrator', 'Administrator'],
    ],
    ownAccount,
  );
  const active = selectControl(
    `Status for ${account.displayName}`,
    account.isActive ? 'active' : 'inactive',
    [
      ['active', 'Active'],
      ['inactive', 'Inactive'],
    ],
    ownAccount,
  );
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-secondary';
  save.textContent = 'Save';
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await updateStaff(account.id, {
        displayName: name.value,
        email: email.value,
        role: role.value,
        isActive: active.value === 'active',
      });
      message(accountsState, 'Account updated.', 'success');
      await loadAccounts();
    } catch (error) {
      if (isUnauthorized(error)) return goToLogin();
      message(accountsState, describeFailure(error), 'error');
      save.disabled = false;
    }
  });
  const audit = document.createElement('button');
  audit.type = 'button';
  audit.className = 'btn btn-secondary';
  audit.textContent = 'Audit';
  audit.addEventListener('click', () => showAudit(account));
  const actions = document.createElement('div');
  actions.className = 'account-actions';
  actions.append(save, audit);

  row.append(
    cell('Name', name),
    cell('Email', email),
    cell('Role', role),
    cell('Status', active),
    cell('Password', makePasswordForm(account)),
    cell('Actions', actions),
  );
  return row;
}

async function loadAccounts() {
  const filters = Object.fromEntries(new FormData(filterForm));
  accountsWrap.hidden = true;
  pagination.hidden = true;
  message(accountsState, 'Loading accounts…');
  document.getElementById('searchBtn').disabled = true;
  try {
    const result = await listStaff({
      ...filters,
      page: state.page,
      pageSize: 20,
    });
    accountRows.replaceChildren(...result.items.map(buildAccountRow));
    state.lastPage = Math.max(1, Math.ceil(result.totalItems / 20));
    if (result.totalItems === 0) {
      message(accountsState, 'No accounts match these filters.');
      return;
    }
    message(accountsState, '');
    accountsWrap.hidden = false;
    pagination.hidden = false;
    pageInfo.textContent = `Page ${state.page} of ${state.lastPage} · ${result.totalItems} accounts`;
    document.getElementById('previousBtn').disabled = state.page <= 1;
    document.getElementById('nextBtn').disabled = state.page >= state.lastPage;
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    message(accountsState, describeFailure(error), 'error');
  } finally {
    document.getElementById('searchBtn').disabled = false;
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showCreateErrors();
  message(createMessage, '');
  const values = Object.fromEntries(new FormData(createForm));
  if (values.password !== values.confirmPassword) {
    showCreateErrors({ confirmPassword: 'The passwords do not match.' });
    return;
  }
  createButton.disabled = true;
  createButton.textContent = 'Creating…';
  try {
    await createStaff(values);
    createForm.reset();
    message(
      createMessage,
      'Account created. Share the initial password with the staff member out of band.',
      'success',
    );
    state.page = 1;
    await loadAccounts();
  } catch (error) {
    if (isUnauthorized(error)) return goToLogin();
    if (error instanceof AdminApiError && error.status === 400 && error.details) {
      showCreateErrors(error.details);
    }
    message(createMessage, describeFailure(error), 'error');
    createForm.elements.password.value = '';
    createForm.elements.confirmPassword.value = '';
  } finally {
    createButton.disabled = false;
    createButton.textContent = 'Create account';
  }
});

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.page = 1;
  loadAccounts();
});
document.getElementById('previousBtn').addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadAccounts();
  }
});
document.getElementById('nextBtn').addEventListener('click', () => {
  if (state.page < state.lastPage) {
    state.page += 1;
    loadAccounts();
  }
});
document.getElementById('closeAudit').addEventListener('click', () => auditDialog.close());
auditDialog.addEventListener('click', (event) => {
  if (event.target === auditDialog) auditDialog.close();
});

try {
  const admin = await startSession();
  state.currentAdminId = admin.id;
  await loadAccounts();
} catch (error) {
  message(accountsState, describeFailure(error), 'error');
}
