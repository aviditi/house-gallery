'use strict';

const id = location.pathname.split('/').pop();
const gallery = document.getElementById('gallery');
const addrEl = document.getElementById('addr');
const factsEl = document.getElementById('facts');
const counterEl = document.getElementById('counter');
const shareBtn = document.getElementById('share');
const shareLabel = document.getElementById('share-label');
const toastEl = document.getElementById('toast');

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCount = document.getElementById('lb-count');

let photos = [];
let current = 0;

const src = (p) => p.webp || p.jpeg;

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
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

  gallery.innerHTML = '';
  photos.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'photo';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = src(p);
    img.alt = `Photo ${i + 1} of ${photos.length}`;
    fig.appendChild(img);
    fig.addEventListener('click', () => open(i));
    gallery.appendChild(fig);
  });
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
  lbImg.src = src(photos[current]);
  lbCount.textContent = `${current + 1} / ${photos.length}`;
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

shareBtn.addEventListener('click', async () => {
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: addrEl.textContent, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
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
  toast('Link copied — prices stay hidden');
  shareLabel.textContent = 'Copied';
  shareBtn.classList.add('copied');
  setTimeout(() => { shareLabel.textContent = 'Share'; shareBtn.classList.remove('copied'); }, 1600);
});

load();
