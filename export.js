'use strict';

// Builds a static site (docs/) from your saved listings so it can be hosted on
// GitHub Pages. The scraper stays local; this only publishes the finished,
// price-free galleries. Run: npm run export

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'listings.json');
const OUT = path.join(ROOT, 'docs');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function readListings() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

const STYLE = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

function coverOf(l) {
  const p = l.photos && l.photos[0];
  return p ? p.jpeg || p.webp : null;
}

function indexHtml(listings) {
  const cards = listings
    .map((l) => {
      const cover = coverOf(l);
      return `<a class="tile" href="v/${esc(l.id)}.html">
        <div class="thumb">${cover ? `<img loading="lazy" src="${esc(cover)}" alt="">` : ''}
          <span class="badge">${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}</span>
        </div>
        <div class="tile-meta"><span class="tile-addr">${esc(l.address || 'Listing')}</span></div>
      </a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Home tour</title><link rel="stylesheet" href="style.css">
</head><body>
<header class="site-header">
  <h1>Home tour</h1>
  <p class="tagline">A few places we're looking at. Tap any home to see the photos.</p>
</header>
<main class="container">
  <section id="gallery-section">
    ${listings.length ? `<div class="grid">${cards}</div>` : '<p class="muted">No homes published yet.</p>'}
  </section>
</main>
</body></html>`;
}

function listingHtml(l) {
  const data = JSON.stringify({ address: l.address, facts: l.facts, photos: l.photos });
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(l.address || 'Home photos')}</title><link rel="stylesheet" href="../style.css">
</head><body class="view-body">
<header class="view-header">
  <a class="back" href="../index.html">&larr; All homes</a>
  <div class="view-titles">
    <h1>${esc(l.address || 'Home')}</h1>
    <p class="facts">${esc((l.facts || []).join('  ·  '))}</p>
  </div>
  <span class="counter">${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}</span>
</header>
<main id="gallery" class="photo-grid"></main>
<div id="lightbox" class="lightbox" hidden>
  <button class="lb-close" aria-label="Close">&times;</button>
  <button class="lb-nav lb-prev" aria-label="Previous">&#8249;</button>
  <img id="lb-img" src="" alt="">
  <button class="lb-nav lb-next" aria-label="Next">&#8250;</button>
</div>
<script>
const DATA = ${data};
const photos = DATA.photos || [];
const gallery = document.getElementById('gallery');
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
let current = 0;
const src = (p) => p.webp || p.jpeg;
photos.forEach((p, i) => {
  const fig = document.createElement('figure'); fig.className = 'photo';
  const img = document.createElement('img'); img.loading = 'lazy'; img.src = src(p); img.alt = 'Photo ' + (i + 1);
  img.addEventListener('click', () => open(i));
  fig.appendChild(img); gallery.appendChild(fig);
});
function open(i){ current=i; lbImg.src=src(photos[i]); lightbox.hidden=false; document.body.style.overflow='hidden'; }
function close(){ lightbox.hidden=true; document.body.style.overflow=''; }
function step(d){ current=(current+d+photos.length)%photos.length; lbImg.src=src(photos[current]); }
lightbox.querySelector('.lb-close').addEventListener('click', close);
lightbox.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); step(-1); });
lightbox.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); step(1); });
lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
});
</script>
</body></html>`;
}

function main() {
  const listings = readListings();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'v'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'style.css'), STYLE);
  fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml(listings));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // let GitHub Pages serve files as-is
  for (const l of listings) {
    fs.writeFileSync(path.join(OUT, 'v', `${l.id}.html`), listingHtml(l));
  }
  console.log(`Exported ${listings.length} listing(s) to docs/`);
  console.log('Pages:');
  console.log('  docs/index.html');
  for (const l of listings) console.log(`  docs/v/${l.id}.html  (${l.address})`);
}

main();
