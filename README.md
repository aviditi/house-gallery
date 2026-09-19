# House Gallery

A price-free photo gallery viewer for real estate listings. Paste a Zillow or StreetEasy link, and get a clean, shareable gallery of the property photos with all financial data stripped out.

**Live:** [https://house-gallery.onrender.com](https://house-gallery.onrender.com)

## Why

Real estate listings are packed with prices, zestimates, tax history, and financial noise. When you want to show a friend or family member a property you're considering—without disclosing the asking price—this tool strips all of that away and leaves just the photos and basic specs (beds, baths, square footage, year built).

## Features

- **Paste a link.** Drop a Zillow or StreetEasy URL into the home page.
- **Automatic scraping.** Fetches the listing page, extracts all photos at the highest available resolution, and parses out address and specs.
- **No prices.** Strips every financial field: price, zestimate, tax estimates, HOA fees, everything.
- **Shareable galleries.** Each listing gets a permanent `/v/<id>` link to send to family and friends.
- **Click-to-zoom lightbox.** Photos open in a modal viewer with arrow-key navigation and `Esc` to close.
- **Persistent links.** Saved listings live on the server; share links work across devices and sessions.

## Tech Stack

### Backend
- **Node.js** (built-in HTTP, no external dependencies)
- **Residential proxy routing** via:
  - [ScraperAPI](https://scraperapi.com) — full-page rendering (JS execution) + residential IPs
  - [Webshare](https://webshare.io) — raw HTTP/CONNECT proxy tunneling
- **Photo extraction** via JSON parsing of Zillow's embedded `__NEXT_DATA__` and StreetEasy's page markup
- **File-based storage** (JSON; can be replaced with a database)

### Frontend
- **Vanilla JavaScript** (no frameworks)
- **Responsive CSS grid** (mobile, tablet, desktop)
- **Lightbox gallery** with keyboard navigation

### Deployment
- [Render](https://render.com) — free tier with auto-deploy on `git push`
- Auto-restart and environment variable management via `render.yaml`

## Setup & Local Development

### Prerequisites
- Node.js 16+
- A [ScraperAPI](https://scraperapi.com) free account (5,000 monthly credits) OR [Webshare](https://webshare.io) account

### Install & Run

```bash
cd /Users/blakepastrana/Projects/house-gallery

# Copy the example env and add your proxy credentials
cp .env.example .env
# Edit .env and add:
#   PROXY_PROVIDER=scraperapi
#   PROXY_API_KEY=<your-key-here>

# Start the server
node server.js

# Open http://localhost:3000 in your browser
```

### Environment Variables

- `PROXY_PROVIDER` — `scraperapi`, `zenrows`, `scrapeops`, `webshare`, or `direct` (not recommended)
- `PROXY_API_KEY` — Your API key for the chosen provider (not needed for `webshare` or `direct`)
- `PROXY_URL` — Full connection string for raw proxy services (e.g., `http://user:pass@proxy.host:port`)
- `PORT` — Server port (default `3000`)

## How It Works

1. **Paste a Zillow/StreetEasy URL** into the home page.
2. **Server fetches** via a residential proxy / scraping API (to bypass bot protection).
3. **Parser extracts**:
   - High-resolution photo URLs from embedded JSON
   - Address, beds, baths, square footage, year built
   - **Excludes:** price, zestimate, taxes, rent, HOA fees, any `$` amounts
4. **Listing is stored** and assigned a share ID.
5. **Gallery page** displays all photos in a masonry grid with click-to-zoom lightbox.
6. **Share the link** — `https://house-gallery.onrender.com/v/<id>` works on any device.

## Deployment to Render

This repo includes a `render.yaml` blueprint for one-click deployment:

1. Push to GitHub:
   ```bash
   git push origin main
   ```
2. On [render.com](https://render.com), create a new service from this repo.
3. Render auto-detects `render.yaml` and configures the service.
4. Add your `PROXY_API_KEY` as an environment variable in the Render dashboard.
5. Deploy — your app is now live at `https://<service-name>.onrender.com`.

**Auto-deploy:** Every `git push` to `main` triggers a new build and redeploy automatically.

## API

### `GET /` 
Home page — paste a URL form and list of saved homes.

### `POST /api/scrape`
Scrape a listing.  
**Body:** `{ "url": "https://www.zillow.com/..." }`  
**Response:** `{ "id": "abc123", "url": "/v/abc123", "count": 42, "address": "..." }`

### `GET /api/listings`
List all saved homes (metadata only).

### `GET /api/listings/<id>`
Full listing data (address, facts, all photo objects).

### `DELETE /api/listings/<id>`
Remove a saved listing.

### `GET /api/config`
Proxy configuration status (for debugging).

## File Structure

```
house-gallery/
├── server.js              # HTTP server, API routes, storage
├── lib/
│   ├── fetcher.js        # Proxy routing & HTTP with decompression
│   └── parse.js          # Photo & spec extraction (Zillow + generic)
├── public/
│   ├── index.html        # Home page
│   ├── view.html         # Gallery viewer page
│   ├── app.js            # Home page logic
│   ├── view.js           # Gallery lightbox & navigation
│   └── style.css         # Responsive design
├── data/
│   └── listings.json     # Saved homes (file storage)
├── package.json          # Node dependencies (zero runtime deps)
├── .env.example          # Environment template
├── .env                  # Actual secrets (gitignored)
├── .gitignore            # Keeps secrets out of git
└── render.yaml           # Render deployment blueprint
```

## Limitations

- **Zillow fetch requires a residential proxy** (datacenter IPs are blocked by PerimeterX). ScraperAPI's free tier renders JS and routes through residential IPs; it's the recommended provider.
- **StreetEasy listings** require ScraperAPI's paid plan or a residential proxy; the free tier doesn't work.
- **Free Render tier** resets the filesystem on deploy/restart — saved listings survive restarts but will clear if you push code changes. For persistent listings, upgrade to Render's paid tier or use a database.

## Future Ideas

- Browser extension or bookmarklet for in-page capture (works on your own browser, no proxy needed).
- Persistent database (PostgreSQL) instead of JSON file.
- StreetEasy parser tuning (currently requires premium proxy).
- Batch import (paste multiple URLs at once).

## License

Private — for personal use.

---

Built with [Claude Code](https://claude.com/claude-code)
