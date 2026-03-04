# Architecture

Bird's-eye view of the DeflockSC codebase: directory layout, component relationships, data flow, and design system.

## Directory Structure

```text
deflocksc-website/
├── .github/workflows/
│   ├── refresh-camera-data.yml   — weekly camera data refresh from Deflock CDN
│   ├── scrape-bills.yml          — bill status scraper (weekly in session, monthly off)
│   └── scrape-reps.yml           — legislator + council scraper
├── docs/
│   └── plans/                    — design docs and implementation plans
├── public/
│   ├── camera-data.json          — ALPR camera locations (Deflock CDN extract)
│   ├── districts/                — GeoJSON boundary files (46 counties, 2 cities, sldl, sldu)
│   ├── hero-cameras*.png         — responsive hero images (650w/1000w/1300w/2600w)
│   ├── map-style.json            — OpenFreeMap dark tile style for MapLibre
│   ├── favicon.svg
│   └── og-image.png
├── scripts/
│   ├── build-districts.py        — Census TIGER + ArcGIS shapefiles → GeoJSON
│   ├── build-map-style.mjs       — generate customized OpenFreeMap style JSON
│   ├── fetch-camera-data.mjs     — pull camera data from Deflock CDN
│   ├── publish.py                — Obsidian vault → blog post publisher
│   ├── scraper.py                — bill status scraper (scstatehouse.gov)
│   └── scrape_reps/              — legislator + council scraper package
│       ├── __main__.py           — CLI entry point
│       ├── state.py              — OpenStates CSV → state legislator data
│       └── adapters/             — per-jurisdiction council scrapers
│           ├── base.py           — abstract adapter base class
│           ├── civicplus.py      — CivicPlus CMS adapter
│           ├── greenville_city.py
│           └── greenville_county.py
├── src/
│   ├── components/
│   │   ├── ActionModal.astro     — district-matching modal (geolocation, address, manual)
│   │   ├── BillTracker.astro     — legislative bill status cards with glow frame
│   │   ├── FAQ.astro             — sourced FAQ accordion
│   │   ├── Footer.astro          — site footer (About + Resources columns)
│   │   ├── Hero.astro            — camera image + animated SVG light cones
│   │   ├── HowItWorks.astro      — carousel of ALPR case studies
│   │   ├── HowItWorksOverlays.astro — read-more overlay panels for carousel cards
│   │   ├── MapSection.astro      — MapLibre camera map with clustering and popups
│   │   ├── Nav.astro             — top nav bar (logo + "Take Action" CTA)
│   │   └── TakeAction.astro      — bottom CTA section prompting rep contact
│   ├── content/
│   │   └── blog/                 — Markdown blog posts (Astro content collections)
│   ├── content.config.ts         — content collection schema (blog: title, date, summary, tags)
│   ├── data/
│   │   ├── action-letters.json   — pre-written letter templates for rep contact
│   │   ├── bills.json            — tracked bill statuses (scraped from scstatehouse.gov)
│   │   ├── local-councils.json   — county/city council member rosters
│   │   ├── registry.json         — bill registry metadata
│   │   └── state-legislators.json — SC House + Senate members
│   ├── layouts/
│   │   └── Base.astro            — HTML shell: head meta, Nav, Footer, ActionModal, spotlight script
│   ├── lib/
│   │   ├── district-matcher.js   — boundary loading, district matching, Census geocoder (JSONP)
│   │   └── geo-utils.js          — point-in-polygon, bounding box geometry
│   ├── pages/
│   │   ├── index.astro           — homepage (6 section components)
│   │   ├── blog/
│   │   │   ├── index.astro       — blog listing page
│   │   │   └── [...slug].astro   — individual blog post pages
│   │   └── rss.xml.ts            — RSS feed endpoint
│   ├── scripts/
│   │   ├── camera-map.ts         — MapLibre map init, camera layers, popups, clustering
│   │   └── carousel.ts           — auto-advance, keyboard nav, dot indicators
│   └── styles/
│       └── global.css            — Tailwind import, smooth scroll, glow frame styles
└── astro.config.mjs
```

## Component Map

### Layout Shell

`Base.astro` wraps every page. It renders the `<head>` (meta, fonts, RSS link), then three persistent elements that appear on all pages:

```text
Base.astro
├── Nav              — always visible, transparent → solid on scroll
├── <main><slot /></main>
├── Footer           — always visible
└── ActionModal      — hidden until triggered by any "Contact Your Reps" CTA
```

A `<script>` in Base initializes the spotlight effect (mouse-tracking card highlight via CSS custom properties).

### Homepage (index.astro)

The homepage renders six section components in order:

```text
index.astro
├── Hero                 — headline, camera image with animated light cones
├── HowItWorks           — carousel of case studies + HowItWorksOverlays
├── MapSection           — interactive ALPR camera map
├── BillTracker          — bill status cards in glow frame
├── FAQ                  — accordion with sourced answers
└── TakeAction           — final CTA to open ActionModal
```

### Blog Pages

Blog uses Astro content collections with a glob loader pointed at `src/content/blog/*.md`.

```text
blog/index.astro      — lists all posts by date
blog/[...slug].astro  — renders individual post
rss.xml.ts            — generates RSS feed from the same collection
```

## Data Flow

```text
                          BUILD TIME                          RUNTIME
                    ┌─────────────────────┐          ┌──────────────────────┐
                    │                     │          │                      │
  GitHub Actions    │   Astro SSG Build   │          │   Browser (client)   │
  (scrapers)        │                     │          │                      │
       │            │                     │          │                      │
       ▼            │                     │          │                      │
  ┌──────────┐      │  ┌──────────────┐   │          │  ┌────────────────┐  │
  │scraper.py├──────┼─►│src/data/*.json├───┼──HTML──► │  │ district-      │  │
  │scrape_reps│     │  └──────────────┘   │          │  │ matcher.js     │  │
  └──────────┘      │                     │          │  │ (loads GeoJSON │  │
                    │                     │          │  │  boundaries)   │  │
  ┌──────────────┐  │                     │          │  └────────────────┘  │
  │fetch-camera- ├──┼─►public/camera-     │          │                      │
  │data.mjs     │  │  │data.json ─────────┼──fetch──►│  camera-map.ts      │
  └──────────────┘  │                     │          │  (MapLibre GL JS)    │
                    │                     │          │                      │
  ┌──────────────┐  │                     │          │  ┌────────────────┐  │
  │build-        ├──┼─►public/districts/  │          │  │ ActionModal    │  │
  │districts.py  │  │  *.json ────────────┼──fetch──►│  │ (inlined       │  │
  └──────────────┘  │                     │          │  │  district fns) │  │
                    └─────────────────────┘          └──────────────────────┘
```

1. **Scrapers** run on schedule via GitHub Actions (or manually) and commit updated JSON.
2. **Build-time data** (`src/data/*.json`) is imported directly by Astro components and baked into static HTML.
3. **Runtime data** (`public/` files) is fetched by client-side JavaScript:
   - `camera-data.json` is loaded by `camera-map.ts` for the MapLibre camera map.
   - `districts/*.json` boundary files are loaded by ActionModal's inlined district matcher when a user looks up their representatives.

## Scraper Pipelines

Each pipeline has a corresponding GitHub Actions workflow. For adapter architecture and extension details, see [adapting-scrapers.md](adapting-scrapers.md).

| Pipeline | Script | Output | Schedule |
|---|---|---|---|
| Bill status | `scripts/scraper.py` | `src/data/bills.json` | Weekly Mon (session), monthly (off) |
| State legislators | `scripts/scrape_reps/state.py` | `src/data/state-legislators.json` | Weekly Mon |
| Local councils | `scripts/scrape_reps/adapters/*` | `src/data/local-councils.json` | Monthly 1st |
| District boundaries | `scripts/build-districts.py` | `public/districts/*.json` | Monthly 1st |
| Camera data | `scripts/fetch-camera-data.mjs` | `public/camera-data.json` | Weekly Wed |

## Client-Side Systems

### District Matcher (ActionModal)

The action modal lets visitors find their SC representatives through three input paths:

1. **Geolocation** (primary) -- browser location API
2. **Address lookup** (secondary) -- Census geocoder via JSONP (no CORS)
3. **Manual dropdowns** (tertiary) -- county/city/district selectors

Core logic lives in `src/lib/district-matcher.js` and `src/lib/geo-utils.js`, but because Astro `define:vars` scripts cannot use ES module imports, the district matching functions are **inlined** in `ActionModal.astro` with a `dm` prefix.

Flow: user coordinates --> load GeoJSON boundary file --> point-in-polygon test --> match legislator/council data --> render results with district badges.

### Camera Map (MapSection)

`src/scripts/camera-map.ts` initializes a MapLibre GL JS map with:

- **Tiles:** OpenFreeMap dark style (`public/map-style.json`)
- **Data:** `public/camera-data.json` loaded as a GeoJSON source
- **Clustering:** MapLibre built-in clustering with count labels
- **Popups:** custom dark-themed HTML showing manufacturer, operator, direction, vendor photo, and OSM link

### Carousel (HowItWorks)

`src/scripts/carousel.ts` drives the case study carousel:

- Auto-advances on a timer (pauses when not visible via IntersectionObserver)
- Keyboard navigation (arrow keys)
- Dot indicators and prev/next arrows
- Overlay panels (`HowItWorksOverlays.astro`) expand on "Read more"

## Design System

### Colors

| Token | Hex | Usage |
|---|---|---|
| Dark background | `#171717` | Page background, nav (scrolled) |
| Alt background | `#1a1a1a` / `#262626` | Alternating sections |
| Red accent | `#dc2626` | CTAs, alerts, hero highlights |
| Amber | `#fbbf24` | Status badges, source links |
| Text | `#d4d4d4` | Body copy |

### Typography

**Inter** via Google Fonts at weights 400, 500, 700, 800, 900. Body line-height is 1.7.

### Visual Effects

- **Glow frame:** cursor-reactive `radial-gradient` border with backdrop-filter, defined in `global.css` as `.glow-frame`. Used on MapSection and BillTracker. Each instance binds its own `pointermove` listener.
- **Section glows:** multi-layer `radial-gradient` backgrounds with organic positioning, layered behind content (`relative z-10`).
- **Spotlight:** mouse-tracking card highlight via CSS custom properties (`--mouse-x`, `--mouse-y`), initialized in Base.astro's inline script. Applied to any element with `data-spotlight`.
- **Hero light cones:** SVG overlays on the camera image with CSS keyframe sweep animations and randomized timing. Outer cones hidden on mobile.
