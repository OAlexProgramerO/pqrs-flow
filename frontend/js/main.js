const statusEl = document.getElementById('api-status');

async function checkApi() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    statusEl.textContent = `API connected (v${data.version})`;
    statusEl.classList.add('ok');
  } catch {
    statusEl.textContent = 'Cannot reach the API. Start the server with "npm run dev".';
    statusEl.classList.add('error');
  }
}

checkApi();
