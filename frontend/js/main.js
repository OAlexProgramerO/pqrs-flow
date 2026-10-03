import { initForm } from './form.js';

const statusEl = document.getElementById('api-status');
const versionEl = document.getElementById('app-version');

async function checkApi() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    statusEl.textContent = 'API connected';
    statusEl.classList.add('ok');
    versionEl.textContent = `v${data.version}`;
  } catch {
    statusEl.textContent = 'Cannot reach the API. Start the server with "npm run dev".';
    statusEl.classList.add('error');
  }
}

initForm();
checkApi();
