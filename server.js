'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchPage, proxyConfig } = require('./lib/fetcher');
const { parseListing } = require('./lib/parse');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'listings.json');
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');

// ---- storage ---------------------------------------------------------------

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
  if (!fs.existsSync(PREFS_FILE)) fs.writeFileSync(PREFS_FILE, '{}');
}

function readListings() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function writeListings(list) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function readPrefs() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function writePrefs(prefs) {
  ensureStore();
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
}

function generatePrefToken() {
  return crypto.randomBytes(12).toString('hex');
}

// ---- price-free sanitization ----------------------------------------------
// Whitelist approach: we ONLY ever persist these fields. Anything financial
// (price, zestimate, rent, taxes, monthlyCost, ...) is dropped on the floor.

const PRICE_WORDS = /(price|zestimate|estimate|rent|payment|mortgage|tax|hoa|cost|\$)/i;

function coverOf(listing) {
  const p = listing.photos && listing.photos[0];
  if (!p) return null;
  return p.jpeg || p.webp || null;
}

function cleanString(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function isPhotoUrl(u) {
  return (
    typeof u === 'string' &&
    /^https:\/\/[a-z0-9.-]*(zillowstatic\.com|streeteasy\.com|nyc-prod-streeteasy|imgix\.net)\//i.test(u) &&
    u.length < 600
  );
}

// Accepts parser output { address, facts, photos:[{jpeg,webp}] } and returns a
// stored record containing ONLY non-financial data.
function sanitizeListing(input, sourceHost) {
  const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
  const photos = [];
  const seen = new Set();
  for (const p of rawPhotos) {
    const jpeg = p && isPhotoUrl(p.jpeg) ? p.jpeg : null;
    const webp = p && isPhotoUrl(p.webp) ? p.webp : null;
    const key = jpeg || webp;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    photos.push({ jpeg, webp });
    if (photos.length >= 150) break;
  }

  const address = cleanString(input.address);

  const facts = [];
  if (Array.isArray(input.facts)) {
    for (const f of input.facts) {
      const t = cleanString(f);
      if (t && !PRICE_WORDS.test(t)) facts.push(t);
      if (facts.length >= 6) break;
    }
  }

  return {
    id: crypto.randomBytes(6).toString('hex'),
    address,
    facts,
    photos,
    sourceHost: sourceHost || 'zillow.com',
    createdAt: new Date().toISOString(),
  };
}

// ---- http helpers ----------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => (tooBig ? reject(new Error('payload too large')) : resolve(data)));
    req.on('error', reject);
  });
}

// ---- routing ---------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // --- API ---
  if (pathname === '/api/config' && req.method === 'GET') {
    const { provider, ready } = proxyConfig();
    sendJson(res, 200, { provider, configured: ready });
    return;
  }

  if (pathname === '/api/prefs' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const prefs = readPrefs();
      const token = generatePrefToken();
      prefs[token] = body;
      writePrefs(prefs);
      return sendJson(res, 201, { token });
    } catch (e) {
      return sendJson(res, 400, { error: 'Invalid request.' });
    }
  }

  const prefMatch = pathname.match(/^\/api\/prefs\/([a-f0-9]+)$/);
  if (prefMatch && req.method === 'GET') {
    const token = prefMatch[1];
    const prefs = readPrefs();
    const found = prefs[token];
    if (!found) return sendJson(res, 404, { error: 'Preferences not found' });
    return sendJson(res, 200, found);
  }

  if (pathname === '/api/listings' && req.method === 'GET') {
    const list = readListings().map((l) => ({
      id: l.id,
      address: l.address,
      facts: l.facts || [],
      cover: coverOf(l),
      count: l.photos.length,
      createdAt: l.createdAt,
    }));
    sendJson(res, 200, list);
    return;
  }

  if (pathname === '/api/scrape' && req.method === 'POST') {
    let targetUrl;
    try {
      const body = JSON.parse(await readBody(req));
      targetUrl = String(body.url || '').trim();
    } catch (e) {
      return sendJson(res, 400, { error: 'Invalid request body.' });
    }
    if (!/^https?:\/\/(www\.)?zillow\.com\//i.test(targetUrl)) {
      return sendJson(res, 400, { error: 'Please paste a Zillow listing URL.' });
    }
    let host = 'zillow.com';
    try {
      host = new URL(targetUrl).hostname.replace(/^www\./, '');
    } catch (e) {}

    try {
      const { status, body, via } = await fetchPage(targetUrl);
      if (status === 403 || status === 401) {
        return sendJson(res, 502, {
          error:
            `Blocked by ${host} (HTTP ${status}). A residential proxy is required — ` +
            `check PROXY_PROVIDER/PROXY_API_KEY in .env (currently via "${via}").`,
        });
      }
      if (status >= 400) {
        return sendJson(res, 502, { error: `Fetch failed (HTTP ${status}) via "${via}".` });
      }
      const parsed = parseListing(targetUrl, body);
      const listing = sanitizeListing(parsed, host);
      if (listing.photos.length === 0) {
        return sendJson(res, 422, {
          error: 'Page fetched, but no photos were found. The listing markup may have changed.',
        });
      }
      const list = readListings();
      list.unshift(listing);
      writeListings(list);
      return sendJson(res, 201, {
        id: listing.id,
        url: `/v/${listing.id}`,
        count: listing.photos.length,
        address: listing.address,
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || 'Scrape failed.' });
    }
  }

  const idMatch = pathname.match(/^\/api\/listings\/([a-f0-9]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const list = readListings();
    const found = list.find((l) => l.id === id);
    if (req.method === 'GET') {
      if (!found) return sendJson(res, 404, { error: 'Not found' });
      return sendJson(res, 200, found);
    }
    if (req.method === 'DELETE') {
      writeListings(list.filter((l) => l.id !== id));
      return sendJson(res, 200, { ok: true });
    }
  }

  // --- pages ---
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (pathname.startsWith('/v/')) {
    return serveFile(res, path.join(PUBLIC_DIR, 'view.html'));
  }

  // --- static ---
  const safePath = path
    .normalize(pathname)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^\//, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Property Snap running at http://localhost:${PORT}`);
});
