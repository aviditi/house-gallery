'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---- tiny .env loader (zero-dep) ------------------------------------------

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

// ---- shared response reader (decompresses) --------------------------------

function readResponse(res) {
  return new Promise((resolve) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      let buf = Buffer.concat(chunks);
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      try {
        if (enc === 'gzip') buf = zlib.gunzipSync(buf);
        else if (enc === 'deflate') buf = zlib.inflateSync(buf);
        else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
      } catch (e) {
        /* fall through with raw buffer */
      }
      resolve({ status: res.statusCode || 0, body: buf.toString('utf8'), headers: res.headers });
    });
  });
}

// ---- direct GET (no proxy / scraping-API URL) -----------------------------

function rawGet(urlString, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (e) {
      return reject(new Error('Bad URL'));
    }
    const lib = urlObj.protocol === 'http:' ? http : https;
    const req = lib.get(urlObj, { timeout: 90_000, headers: BASE_HEADERS }, async (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, urlObj).toString();
        return resolve(rawGet(next, redirectsLeft - 1));
      }
      resolve(await readResponse(res));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

// ---- GET an HTTPS target through an HTTP CONNECT proxy (Webshare) ----------

function tunnelGet(targetUrl, proxyUrl, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    let target;
    let proxy;
    try {
      target = new URL(targetUrl);
      proxy = new URL(proxyUrl);
    } catch (e) {
      return reject(new Error('Bad URL or proxy URL'));
    }
    if (target.protocol !== 'https:') {
      // http target: fetch through proxy as ordinary forward request
      const req = http.request(
        {
          host: proxy.hostname,
          port: proxy.port || 80,
          method: 'GET',
          path: targetUrl,
          headers: Object.assign({ Host: target.host }, BASE_HEADERS, proxyAuthHeader(proxy)),
          timeout: 90_000,
        },
        async (res) => resolve(await readResponse(res))
      );
      req.on('error', reject);
      req.end();
      return;
    }

    const port = target.port || 443;
    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: proxyAuthHeader(proxy),
      timeout: 90_000,
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`Proxy CONNECT failed (HTTP ${res.statusCode})`));
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const req = https.request(
          {
            method: 'GET',
            path: target.pathname + target.search,
            headers: Object.assign({ Host: target.host }, BASE_HEADERS),
            createConnection: () => tlsSocket,
            timeout: 90_000,
          },
          async (r) => {
            const status = r.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && r.headers.location && redirectsLeft > 0) {
              r.resume();
              const next = new URL(r.headers.location, target).toString();
              return resolve(tunnelGet(next, proxyUrl, redirectsLeft - 1));
            }
            resolve(await readResponse(r));
          }
        );
        req.on('error', reject);
        req.end();
      });
      tlsSocket.on('error', reject);
    });

    connectReq.on('timeout', () => connectReq.destroy(new Error('Proxy connection timed out')));
    connectReq.on('error', reject);
    connectReq.end();
  });
}

function proxyAuthHeader(proxyUrlObj) {
  if (!proxyUrlObj.username) return {};
  const user = decodeURIComponent(proxyUrlObj.username);
  const pass = decodeURIComponent(proxyUrlObj.password);
  return { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') };
}

// ---- scraping-API URL builders --------------------------------------------

function buildProxyUrl(provider, key, targetUrl) {
  const enc = encodeURIComponent(targetUrl);
  switch (provider) {
    case 'scraperapi':
      // render=true (JS) is enough for Zillow and works on the free tier.
      // Premium/residential pools require a paid plan; add &premium=true if a
      // listing ever gets blocked on a paid plan.
      return `https://api.scraperapi.com/?api_key=${key}&url=${enc}&render=true&country_code=us`;
    case 'zenrows':
      return `https://api.zenrows.com/v1/?apikey=${key}&url=${enc}&js_render=true&premium_proxy=true&proxy_country=us`;
    case 'scrapeops':
      return `https://proxy.scrapeops.io/v1/?api_key=${key}&url=${enc}&render_js=true&residential=true&country=us&bypass=perimeterx`;
    default:
      return null;
  }
}

// ---- config + dispatch -----------------------------------------------------

function proxyConfig() {
  const provider = (process.env.PROXY_PROVIDER || '').trim().toLowerCase();
  const key = (process.env.PROXY_API_KEY || '').trim();
  const proxyUrl = (process.env.PROXY_URL || '').trim();

  let ready = false;
  if (!provider || provider === 'direct') ready = false;
  else if (provider === 'webshare' || provider === 'proxy') ready = Boolean(proxyUrl);
  else ready = Boolean(key);

  return { provider: provider || 'direct', key, proxyUrl, ready };
}

async function fetchPage(targetUrl) {
  const { provider, key, proxyUrl } = proxyConfig();

  if (!provider || provider === 'direct') {
    return { ...(await rawGet(targetUrl)), via: 'direct' };
  }

  if (provider === 'webshare' || provider === 'proxy') {
    if (!proxyUrl) {
      throw new Error(`PROXY_PROVIDER is "${provider}" but PROXY_URL is empty. Set it in .env`);
    }
    return { ...(await tunnelGet(targetUrl, proxyUrl)), via: provider };
  }

  if (!key) {
    throw new Error(`PROXY_PROVIDER is "${provider}" but PROXY_API_KEY is empty. Set it in .env`);
  }
  const built = buildProxyUrl(provider, key, targetUrl);
  if (!built) {
    throw new Error(`Unknown PROXY_PROVIDER "${provider}". Use scraperapi | zenrows | scrapeops | webshare | direct`);
  }
  return { ...(await rawGet(built)), via: provider };
}

module.exports = { fetchPage, proxyConfig, rawGet, tunnelGet };
