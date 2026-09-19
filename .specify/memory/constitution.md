# Property Snap Constitution

## Core Principles

### I. Privacy-First Design
Every feature must prioritize user privacy and data minimalism. Strip financial data by default; persist only non-sensitive property specs (beds, baths, sqft, year built, home type). No prices, zestimates, taxes, HOA fees, or any monetary values. When sharing customized galleries, obfuscate preferences server-side with tokens—never expose hiding choices in URLs.

### II. Zero-Dependency Backend
The Node.js backend uses only built-in modules (http, fs, path, crypto). No external npm dependencies for core functionality. External services (proxy providers, CDNs) are optional and swappable; the app works with or without them. Keep the runtime lean, maintainable, and transparent.

### III. Performance by Default
Responsive image optimization is mandatory: use srcset for resolution scaling, blur-up lightbox patterns for smooth loading, content-visibility for large galleries (100+ photos). CSS Grid galleries with fixed aspect ratios prevent layout shift. First-time load experience equals cached experience—no stutter, no pop-in.

### IV. Shareable, Customizable Links
Users can hide address, specs, year, and home type before sharing. Preferences are server-stored and encoded in URLs as opaque tokens—recipients see exactly what was intended, cannot guess or tamper with hiding choices. One link, one intent, no surprises.

### V. Editorial Design
Modern, catchy visual identity with dark-mode support. Clean typography (Fraunces for headlines, Inter for body), thoughtful spacing, and a cohesive color palette (accent green #0f9b6e). Mobile-first responsive design; remove decorative elements on small screens. Gallery is the star, chrome is minimal.

## Technical Constraints

- **Proxy Routing**: Zillow scraping requires residential IPs (datacenter IPs blocked by PerimeterX). Use ScraperAPI, Webshare, or equivalent. Direct mode reserved for testing only.
- **Photo Extraction**: Parse from Zillow's embedded `__NEXT_DATA__` JSON (responsivePhotos array). Regex fallback when JSON parsing fails. Canonical URL format: `https://photos.zillowstatic.com/fp/<id>-cc_ft_<size>.<format>`
- **Storage**: File-based JSON (data/listings.json, data/prefs.json) for MVP. Database upgrade path documented but not required for v1.
- **Deployment**: Render.com free tier with auto-deploy on git push. Accepts render.yaml blueprint. Filesystem resets on restart—okay for MVP, plan database migration for persistence.

## Development Workflow

- **Commits**: Describe the why, not the what. Link PRs to user-facing changes. Attribution: "Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
- **Code Style**: Vanilla JavaScript, no frameworks. Write code that reads like documentation. One-line comments only when the why is non-obvious (hidden constraint, workaround, invariant). Delete unused code completely—no // removed comments.
- **Testing**: Manual verification on localhost before pushing. Test on mobile (iPhone 12), tablet, and desktop. Verify first-time load (stutter test), shared links, preference persistence, and light/dark mode.
- **Scope**: Bug fixes are surgical—no surrounding refactoring unless the bug requires it. New features don't justify abstractions. Three similar lines is better than premature indirection.

## Security & Privacy

- No credentials in code. Use .env for proxy keys, .gitignore to protect secrets.
- URL parameters encode only opaque preference tokens (not financial data, not hiding choices).
- Zillow scraping respects PerimeterX; residential proxy required. No data hoarding—persist only what users explicitly need.
- Server-side preference storage is immutable once shared (tokens don't expire). Cleanup policy: old preferences pruned monthly.

## Governance

This constitution supersedes all other conventions. Amendments require documentation, team discussion, and git history ratification. Every PR must align with these principles. When in doubt, choose simplicity, privacy, and performance—in that order.

**Version**: 1.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-19
