'use strict';

const form = document.getElementById('scrape-form');
const urlInput = document.getElementById('url');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const hintEl = document.getElementById('hint');
const proxyNote = document.getElementById('proxy-note');
const toastEl = document.getElementById('toast');

const ICON = {
  photos:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg>',
  link:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.8-1.7"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>',
};

/* Card covers are ~300px wide; the stored URL is the 1536px original, so swap
   the size token down rather than pulling ~286KB per cover. */
function atSize(url, size) {
  return url.replace(/-cc_ft_\d+\./, `-cc_ft_${size}.`);
}
function coverAttrs(url) {
  if (!/-cc_ft_\d+\./.test(url)) return `src="${escapeHtml(url)}"`;
  const set = [384, 576, 768].map((s) => `${escapeHtml(atSize(url, s))} ${s}w`).join(', ');
  return `src="${escapeHtml(atSize(url, 576))}" srcset="${set}" sizes="(max-width: 700px) 100vw, 340px"`;
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function setStatus(msg, kind) {
  if (!msg) { statusEl.hidden = true; return; }
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (kind || '');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function copyLink(id, btn) {
  const url = `${location.origin}/v/${id}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = url;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast('Share link copied');
  if (btn) {
    const original = btn.innerHTML;
    btn.innerHTML = ICON.check;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 1400);
  }
}

async function loadConfig() {
  try {
    const c = await (await fetch('/api/config')).json();
    if (c.configured) return;
    const isRawProxy = c.provider === 'webshare' || c.provider === 'proxy';
    proxyNote.hidden = false;
    proxyNote.innerHTML = c.provider === 'direct'
      ? 'No proxy configured — direct fetches to Zillow are blocked. Set <code>PROXY_PROVIDER</code> and credentials in <code>.env</code>, then restart.'
      : `Provider <code>${escapeHtml(c.provider)}</code> is selected but <code>${isRawProxy ? 'PROXY_URL' : 'PROXY_API_KEY'}</code> is not set in <code>.env</code>.`;
  } catch (e) { /* non-fatal */ }
}

function showSkeletons(n) {
  grid.innerHTML = Array.from({ length: n }, () =>
    '<div class="skeleton"><div class="sk-media"></div><div class="sk-line"></div><div class="sk-line short"></div></div>'
  ).join('');
}

function cardHtml(it) {
  const facts = (it.facts || []).slice(0, 3).join(' · ');
  return `<article class="card">
    <a href="/v/${encodeURIComponent(it.id)}">
      <div class="card-media">
        ${it.cover ? `<img loading="lazy" decoding="async" ${coverAttrs(it.cover)} alt="">` : ''}
        <span class="pill">${ICON.photos}${it.count}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(it.address || 'Listing')}</h3>
        <p class="card-facts">${escapeHtml(facts || 'Photos only')}</p>
      </div>
    </a>
    <div class="card-actions">
      <button class="icon-btn share" data-id="${escapeHtml(it.id)}" title="Copy share link" aria-label="Copy share link">${ICON.link}</button>
      <button class="icon-btn del" data-id="${escapeHtml(it.id)}" title="Remove" aria-label="Remove">${ICON.trash}</button>
    </div>
  </article>`;
}

async function loadListings() {
  const items = await (await fetch('/api/listings')).json();
  emptyEl.hidden = items.length > 0;
  hintEl.textContent = items.length
    ? `${items.length} home${items.length === 1 ? '' : 's'} · ${items.reduce((n, i) => n + i.count, 0)} photos`
    : '';

  grid.innerHTML = items.map(cardHtml).join('');
  [...grid.children].forEach((el, i) => { el.style.animationDelay = `${i * 45}ms`; });

  grid.querySelectorAll('.share').forEach((b) =>
    b.addEventListener('click', (e) => { e.preventDefault(); copyLink(b.dataset.id, b); })
  );
  grid.querySelectorAll('.del').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/listings/' + b.dataset.id, { method: 'DELETE' });
      toast('Home removed');
      loadListings();
    })
  );
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  goBtn.disabled = true;
  goBtn.innerHTML = '<span class="spinner"></span>Snapping…';
  setStatus('Fetching the listing and stripping prices — this can take 20–40 seconds.', 'working');

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
      setStatus(`Added ${data.address || 'listing'} — ${data.count} photos, no prices.`, 'ok');
      urlInput.value = '';
      await loadListings();
      setTimeout(() => setStatus(''), 5000);
    }
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = 'Snap it';
  }
});

showSkeletons(3);
loadConfig();
loadListings();
