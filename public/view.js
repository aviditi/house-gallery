'use strict';

const id = location.pathname.split('/').pop();
const gallery = document.getElementById('gallery');
const addrEl = document.getElementById('addr');
const factsEl = document.getElementById('facts');
const counterEl = document.getElementById('counter');

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
let photos = [];
let current = 0;

function picSrc(p) {
  // prefer webp, fall back to jpeg
  return p.webp || p.jpeg;
}

async function load() {
  const r = await fetch('/api/listings/' + id);
  if (!r.ok) {
    addrEl.textContent = 'Listing not found';
    return;
  }
  const data = await r.json();
  photos = data.photos || [];
  document.title = data.address || 'Home photos';
  addrEl.textContent = data.address || 'Home';
  factsEl.textContent = (data.facts || []).join('  ·  ');
  counterEl.textContent = photos.length + ' photo' + (photos.length === 1 ? '' : 's');

  gallery.innerHTML = '';
  photos.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'photo';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = picSrc(p);
    img.alt = 'Photo ' + (i + 1);
    img.addEventListener('click', () => openLightbox(i));
    fig.appendChild(img);
    gallery.appendChild(fig);
  });
}

function openLightbox(i) {
  current = i;
  lbImg.src = picSrc(photos[current]);
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}
function step(d) {
  current = (current + d + photos.length) % photos.length;
  lbImg.src = picSrc(photos[current]);
}

lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);
lightbox.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
lightbox.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

load();
