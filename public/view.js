'use strict';

const id = location.pathname.split('/').pop();
const gallery = document.getElementById('gallery');
const addrEl = document.getElementById('addr');
const factsEl = document.getElementById('facts');
const counterEl = document.getElementById('counter');
const shareBtn = document.getElementById('share');
const shareLabel = document.getElementById('share-label');
const toastEl = document.getElementById('toast');

const prefsToggle = document.getElementById('prefs-toggle');
const prefsPanel = document.getElementById('prefs-panel');
const showAddressCheckbox = document.getElementById('show-address');
const showSpecsCheckbox = document.getElementById('show-specs');
const showYearCheckbox = document.getElementById('show-year');
const showTypeCheckbox = document.getElementById('show-type');

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCount = document.getElementById('lb-count');

let photos = [];
let current = 0;
let lbToken = 0;

/* Zillow serves every photo at a range of widths; the stored URL is the
   largest. Grid tiles only need a few hundred pixels, so swapping the size
   token avoids pulling ~286KB per thumbnail. */
// Tiles cap out around 380px CSS, so 768 covers even a 2x display. Offering
// anything larger just makes the browser over-fetch.
const SIZES = [384, 576, 768];
const TILE_SIZES = '(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 380px';

function atSize(url, size) {
  if (!url) return url;
  return url.replace(/-cc_ft_\d+\./, `-cc_ft_${size}.`);
}
function isResizable(url) {
  return typeof url === 'string' && /-cc_ft_\d+\./.test(url);
}

const full = (p) => p.webp || p.jpeg;
const thumb = (p) => {
  const u = full(p);
  return isResizable(u) ? atSize(u, 576) : u;
};
function srcsetFor(p) {
  const u = full(p);
  if (!isResizable(u)) return '';
  return SIZES.map((s) => `${atSize(u, s)} ${s}w`).join(', ');
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function loadPrefs() {
  const params = new URLSearchParams(location.search);
  const prefToken = params.get('prefs');

  let prefs = null;

  // Priority 1: URL token (shared link) — highest
  if (prefToken) {
    try {
      const r = await fetch(`/api/prefs/${prefToken}`);
      if (r.ok) {
        prefs = await r.json();
      }
    } catch (e) {
      console.error('Failed to load preferences from token:', e);
    }
  }

  // Priority 2: sessionStorage (from search page customization)
  if (!prefs) {
    const sessionPrefs = sessionStorage.getItem('searchPagePrefs');
    if (sessionPrefs) {
      try {
        prefs = JSON.parse(sessionPrefs);
        sessionStorage.removeItem('searchPagePrefs'); // Clear after use
      } catch (e) {
        console.error('Failed to load preferences from sessionStorage:', e);
      }
    }
  }

  // Priority 3: localStorage (personal preferences)
  if (!prefs) {
    const saved = localStorage.getItem(`prefs_${id}`);
    if (saved) {
      try {
        prefs = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load preferences from localStorage:', e);
      }
    }
  }

  // Apply preferences if found
  if (prefs) {
    showAddressCheckbox.checked = prefs.showAddress !== false;
    showSpecsCheckbox.checked = prefs.showSpecs !== false;
    showYearCheckbox.checked = prefs.showYear !== false;
    showTypeCheckbox.checked = prefs.showType !== false;
  }

  updateVisibility();
}

function savePrefs() {
  const prefs = {
    showAddress: showAddressCheckbox.checked,
    showSpecs: showSpecsCheckbox.checked,
    showYear: showYearCheckbox.checked,
    showType: showTypeCheckbox.checked,
  };
  localStorage.setItem(`prefs_${id}`, JSON.stringify(prefs));
  updateVisibility();
}

function updateVisibility() {
  const showAddr = showAddressCheckbox.checked;
  const showSpecs = showSpecsCheckbox.checked;
  const showYear = showYearCheckbox.checked;
  const showType = showTypeCheckbox.checked;

  addrEl.style.display = showAddr ? '' : 'none';

  if (!showSpecs && !showYear && !showType) {
    factsEl.style.display = 'none';
  } else {
    factsEl.style.display = '';
    const facts = factsEl.textContent.split('  ·  ');
    const filtered = facts.filter((fact, i) => {
      if (i === 0) return showSpecs; // beds, baths, sqft
      if (i === 1) return showYear; // year
      return showType; // type
    });
    factsEl.textContent = filtered.join('  ·  ');
  }
}

async function load() {
  const r = await fetch('/api/listings/' + id);
  if (!r.ok) {
    addrEl.textContent = 'Listing not found';
    return;
  }
  const data = await r.json();
  photos = data.photos || [];

  document.title = (data.address || 'Home photos') + ' — Property Snap';
  addrEl.textContent = data.address || 'Home';
  factsEl.textContent = (data.facts || []).join('  ·  ');
  counterEl.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;

  loadPrefs();

  const frag = document.createDocumentFragment();
  photos.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'photo';

    const img = document.createElement('img');
    img.alt = `Photo ${i + 1} of ${photos.length}`;
    img.decoding = 'async';
    const ss = srcsetFor(p);
    if (ss) {
      img.srcset = ss;
      img.sizes = TILE_SIZES;
    }
    img.src = thumb(p);

    // the first screenful loads immediately; everything else waits for scroll
    if (i < 9) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    } else {
      img.loading = 'lazy';
    }

    const reveal = () => fig.classList.add('loaded');
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    }

    fig.appendChild(img);
    fig.addEventListener('click', () => open(i));
    frag.appendChild(fig);
  });

  gallery.innerHTML = '';
  gallery.appendChild(frag);
}

function open(i) {
  current = i;
  render();
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function close() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}
function step(d) {
  current = (current + d + photos.length) % photos.length;
  render();
}

function render() {
  const p = photos[current];
  const hiRes = full(p);
  const token = ++lbToken;

  lbCount.textContent = `${current + 1} / ${photos.length}`;

  // show the already-cached thumbnail instantly, blurred, then sharpen to the
  // full-size photo once it arrives — avoids a blank frame on first view
  lbImg.src = thumb(p);
  lbImg.classList.add('loading');

  const hi = new Image();
  hi.onload = () => {
    if (token !== lbToken) return;
    lbImg.src = hiRes;
    lbImg.classList.remove('loading');
  };
  hi.onerror = () => {
    if (token === lbToken) lbImg.classList.remove('loading');
  };
  hi.src = hiRes;

  preloadNeighbors();
}

function preloadNeighbors() {
  [1, -1].forEach((d) => {
    const p = photos[(current + d + photos.length) % photos.length];
    if (p) new Image().src = full(p);
  });
}

lightbox.querySelector('.lb-close').addEventListener('click', close);
lightbox.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
lightbox.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });

document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

prefsToggle.addEventListener('click', () => {
  prefsPanel.hidden = !prefsPanel.hidden;
  if (!prefsPanel.hidden) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

prefsPanel.addEventListener('click', (e) => {
  if (e.target === prefsPanel) {
    prefsPanel.hidden = true;
    document.body.style.overflow = '';
  }
});

showAddressCheckbox.addEventListener('change', savePrefs);
showSpecsCheckbox.addEventListener('change', savePrefs);
showYearCheckbox.addEventListener('change', savePrefs);
showTypeCheckbox.addEventListener('change', savePrefs);

shareBtn.addEventListener('click', async () => {
  // Create a server-stored preference token and build URL with it
  const prefs = {
    showAddress: showAddressCheckbox.checked,
    showSpecs: showSpecsCheckbox.checked,
    showYear: showYearCheckbox.checked,
    showType: showTypeCheckbox.checked,
  };

  try {
    const r = await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (!r.ok) throw new Error('Failed to create preferences');
    const { token } = await r.json();

    const baseUrl = location.pathname + location.hash;
    const url = `${baseUrl}?prefs=${token}`;
    const fullUrl = location.origin + url;
    if (navigator.share) {
      try {
        await navigator.share({ title: addrEl.textContent, url: fullUrl });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = url;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    toast('Link copied — settings encrypted');
    shareLabel.textContent = 'Copied';
    shareBtn.classList.add('copied');
    setTimeout(() => { shareLabel.textContent = 'Share'; shareBtn.classList.remove('copied'); }, 1600);
  } catch (e) {
    console.error('Share failed:', e);
    toast('Share failed, try again');
  }
});

load();
