'use strict';

// Extract photos + safe specs from a Zillow listing page.
// IMPORTANT: this module never returns price/zestimate/tax/rent data.
// Photos live in the page's embedded JSON (Apollo/Next data) as
// `responsivePhotos[].mixedSources.{jpeg,webp}[]`, each an array of
// { url, width }. We pick the highest-width URL per photo, per format.

function getZpid(url) {
  const m = String(url).match(/(\d+)_zpid/);
  return m ? m[1] : null;
}

// Pull every <script> JSON blob that might hold listing data.
function extractJsonBlobs(html) {
  const blobs = [];

  // __NEXT_DATA__ and any application/json script
  const scriptRe = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html))) {
    blobs.push(m[1]);
  }

  // application/ld+json (JSON-LD: address, sometimes a photo)
  const ldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    blobs.push(m[1]);
  }

  return blobs;
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// Recursively walk an object, invoking visit(node) on every object/array node.
function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, seen);
  } else {
    for (const k of Object.keys(node)) walk(node[k], visit, seen);
  }
}

function bestFromMixedSources(arr) {
  // arr: [{ url, width }] -> highest width url
  if (!Array.isArray(arr) || arr.length === 0) return null;
  let best = null;
  let bestW = -1;
  for (const it of arr) {
    if (it && typeof it.url === 'string') {
      const w = Number(it.width) || 0;
      if (w >= bestW) {
        bestW = w;
        best = it.url;
      }
    }
  }
  return best;
}

// Given any parsed object tree, collect photo objects shaped like
// { mixedSources: { jpeg:[...], webp:[...] } } or { url } variants.
function collectPhotosFromTree(root) {
  const photos = [];
  const seenUrls = new Set();

  function pushPhoto(jpeg, webp) {
    const key = jpeg || webp;
    if (!key || seenUrls.has(key)) return;
    seenUrls.add(key);
    photos.push({ jpeg: jpeg || null, webp: webp || null });
  }

  walk(root, (node) => {
    if (Array.isArray(node)) return;

    // Shape A: a photo object with mixedSources
    if (node.mixedSources && typeof node.mixedSources === 'object') {
      const jpeg = bestFromMixedSources(node.mixedSources.jpeg);
      const webp = bestFromMixedSources(node.mixedSources.webp);
      if (jpeg || webp) pushPhoto(jpeg, webp);
    }
  });

  return photos;
}

// gdpClientCache is a JSON *string* nested inside __NEXT_DATA__; parse it too.
function expandNestedJsonStrings(root, out) {
  walk(root, (node) => {
    if (Array.isArray(node)) return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string' && v.length > 40) {
        const t = v.trimStart();
        if (t.startsWith('{') || t.startsWith('[')) {
          const parsed = safeParse(v);
          if (parsed) out.push(parsed);
        }
      }
    }
  });
}

// Regex fallback: scrape zillowstatic photo URLs straight from the HTML and
// upgrade each to a high resolution. Groups jpeg/webp by their shared base id.
function regexFallbackPhotos(html) {
  const re = /https:\/\/photos\.zillowstatic\.com\/fp\/([A-Za-z0-9]+)-[a-z_]*?(\d+)\.(jpg|jpeg|webp)/gi;
  const groups = new Map(); // baseId -> { jpeg, webp }
  let m;
  while ((m = re.exec(html))) {
    const base = m[1];
    const fmt = m[3].toLowerCase() === 'webp' ? 'webp' : 'jpeg';
    if (!groups.has(base)) groups.set(base, { jpeg: null, webp: null });
    const g = groups.get(base);
    // normalize to a large size
    const big = `https://photos.zillowstatic.com/fp/${base}-cc_ft_1536.${fmt === 'webp' ? 'webp' : 'jpg'}`;
    if (fmt === 'webp') g.webp = big;
    else g.jpeg = big;
  }
  const photos = [];
  for (const g of groups.values()) {
    if (g.jpeg || g.webp) photos.push(g);
  }
  return photos;
}

// Find non-financial facts (beds/baths/sqft/year) from a property-ish node.
function collectFacts(root) {
  let beds = null;
  let baths = null;
  let sqft = null;
  let year = null;
  let homeType = null;
  let address = null;

  walk(root, (node) => {
    if (Array.isArray(node)) return;
    if (beds == null && typeof node.bedrooms === 'number') beds = node.bedrooms;
    if (baths == null && typeof node.bathrooms === 'number') baths = node.bathrooms;
    if (sqft == null && typeof node.livingArea === 'number') sqft = node.livingArea;
    if (year == null && typeof node.yearBuilt === 'number') year = node.yearBuilt;
    if (homeType == null && typeof node.homeType === 'string') homeType = node.homeType;

    // address as nested object
    if (!address && node.streetAddress && (node.city || node.addressLocality)) {
      const street = node.streetAddress;
      const city = node.city || node.addressLocality;
      const state = node.state || node.addressRegion || '';
      const zip = node.zipcode || node.postalCode || '';
      address = [street, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim();
    }
  });

  const facts = [];
  if (beds != null) facts.push(`${beds} bd`);
  if (baths != null) facts.push(`${baths} ba`);
  if (sqft != null) facts.push(`${Number(sqft).toLocaleString()} sqft`);
  if (year != null) facts.push(`Built ${year}`);
  if (homeType) facts.push(prettyHomeType(homeType));

  return { facts, address };
}

function prettyHomeType(t) {
  return String(t)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function metaTag(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function parseZillow(url, html) {
  const blobs = extractJsonBlobs(html);
  const trees = [];
  for (const b of blobs) {
    const parsed = safeParse(b);
    if (parsed) {
      trees.push(parsed);
      expandNestedJsonStrings(parsed, trees); // handles gdpClientCache strings
    }
  }

  // photos
  let photos = [];
  for (const t of trees) {
    const found = collectPhotosFromTree(t);
    if (found.length > photos.length) photos = found;
  }
  if (photos.length === 0) {
    photos = regexFallbackPhotos(html);
  }

  // facts + address
  let facts = [];
  let address = null;
  for (const t of trees) {
    const r = collectFacts(t);
    if (r.facts.length > facts.length) facts = r.facts;
    if (!address && r.address) address = r.address;
  }
  if (!address) {
    address = metaTag(html, 'og:title') || metaTag(html, 'twitter:title') || '';
    // og:title often "123 Main St, City, ST 00000 | MLS #..." — keep first segment
    address = address.split('|')[0].trim();
  }

  const jpegImages = photos.map((p) => p.jpeg).filter(Boolean);
  const webpImages = photos.map((p) => p.webp).filter(Boolean);

  return {
    zpid: getZpid(url),
    address,
    facts,
    photos, // [{jpeg, webp}]
    jpegImages,
    webpImages,
    totalPhotos: photos.length,
  };
}

// Generic best-effort parser for non-Zillow hosts (e.g. StreetEasy).
function parseGeneric(url, html) {
  // grab the largest-looking images + og:image
  const urls = new Set();
  const og = metaTag(html, 'og:image');
  if (og) urls.add(og);
  const imgRe = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|webp)/gi;
  let m;
  while ((m = imgRe.exec(html))) {
    urls.add(m[0]);
  }
  const photos = [...urls].map((u) => ({ jpeg: /webp/i.test(u) ? null : u, webp: /webp/i.test(u) ? u : null }));
  let address = metaTag(html, 'og:title') || '';
  address = address.split('|')[0].trim();
  return {
    zpid: null,
    address,
    facts: [],
    photos,
    jpegImages: photos.map((p) => p.jpeg).filter(Boolean),
    webpImages: photos.map((p) => p.webp).filter(Boolean),
    totalPhotos: photos.length,
  };
}

function parseListing(url, html) {
  if (/zillow\.com/i.test(url)) return parseZillow(url, html);
  return parseGeneric(url, html);
}

module.exports = { parseListing, parseZillow, parseGeneric, getZpid };
