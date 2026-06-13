'use strict';

const form = document.getElementById('scrape-form');
const urlInput = document.getElementById('url');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const proxyNote = document.getElementById('proxy-note');

function setStatus(msg, kind) {
  if (!msg) {
    statusEl.hidden = true;
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (kind || '');
}

async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    const c = await r.json();
    if (!c.configured && c.provider === 'direct') {
      proxyNote.hidden = false;
      proxyNote.innerHTML =
        'No proxy configured — direct fetches to Zillow are usually blocked. ' +
        'Set <code>PROXY_PROVIDER</code> + credentials in <code>.env</code>, then restart.';
    } else if (!c.configured) {
      const isProxy = c.provider === 'webshare' || c.provider === 'proxy';
      const missing = isProxy ? 'PROXY_URL' : 'PROXY_API_KEY';
      proxyNote.hidden = false;
      proxyNote.innerHTML =
        'Proxy provider <code>' + c.provider + '</code> selected but <code>' + missing +
        '</code> is not set in <code>.env</code>.';
    }
  } catch (e) {
    /* ignore */
  }
}

async function loadListings() {
  const r = await fetch('/api/listings');
  const items = await r.json();
  grid.innerHTML = '';
  emptyEl.hidden = items.length > 0;
  for (const it of items) {
    const card = document.createElement('a');
    card.className = 'tile';
    card.href = '/v/' + it.id;
    card.innerHTML = `
      <div class="thumb">${it.cover ? `<img loading="lazy" src="${it.cover}" alt="">` : ''}
        <span class="badge">${it.count} photo${it.count === 1 ? '' : 's'}</span>
      </div>
      <div class="tile-meta">
        <span class="tile-addr">${escapeHtml(it.address || 'Listing')}</span>
        <button class="del" data-id="${it.id}" title="Remove">&times;</button>
      </div>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll('.del').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await fetch('/api/listings/' + b.dataset.id, { method: 'DELETE' });
      loadListings();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  goBtn.disabled = true;
  setStatus('Fetching listing and stripping prices… (can take 20–40s via proxy)', 'working');
  try {
    const r = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await r.json();
    if (!r.ok) {
      setStatus(data.error || 'Something went wrong.', 'error');
    } else {
      setStatus(`Added "${data.address || 'listing'}" — ${data.count} photos.`, 'ok');
      urlInput.value = '';
      loadListings();
    }
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  } finally {
    goBtn.disabled = false;
  }
});

loadConfig();
loadListings();
