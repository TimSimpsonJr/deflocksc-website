# Architecture

Bird's-eye view of the DeflockSC codebase: directory layout, component relationships, data flow, and design system.

## Directory Structure

```text
deflocksc-website/
├── .github/workflows/
│   ├── refresh-camera-data.yml   — weekly camera data refresh from Deflock CDN
│   └── scrape-bills.yml          — bill status scraper (weekly in session, monthly off)
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
│   ├── build-map-style.mjs       — generate customized OpenFreeMap style JSON
│   ├── fetch-camera-data.mjs     — pull camera data from Deflock CDN
│   ├── publish.py                — Obsidian vault → blog post publisher
│   ├── scraper.py                — bill status scraper (scstatehouse.gov)
│   └── sync-open-civics.mjs      — prebuild: syncs npm package data into project
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
│   │   ├── local-councils.json   — county/city council members (synced from open-civics npm)
│   │   └── registry.json         — jurisdiction metadata for district matching
│   ├── layouts/
│   │   └── Base.astro            — HTML shell: head meta, Nav, Footer, ActionModal, spotlight script
│   ├── lib/
│   │   ├── district-matcher.ts   — boundary loading, district matching, Census geocoder
│   │   └── geo-utils.ts          — point-in-polygon, bounding box geometry
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
  npm packages      │   Astro SSG Build   │          │   Browser (client)   │
  (open-civics)     │                     │          │                      │
       │            │                     │          │                      │
       ▼            │                     │          │                      │
  ┌──────────────┐  │  ┌──────────────┐   │          │  ┌────────────────┐  │
  │sync-open-    ├──┼─►│src/data/*.json├───┼──HTML──► │  │ district-      │  │
  │civics.mjs    │  │  └──────────────┘   │          │  │ matcher.ts     │  │
  └──────────────┘  │                     │          │  │ (loads GeoJSON │  │
       │            │  ┌──────────────┐   │          │  │  boundaries)   │  │
       └────────────┼─►│public/       │   │          │  └────────────────┘  │
                    │  │districts/*.json───┼──fetch──►│                      │
  GitHub Actions    │  └──────────────┘   │          │                      │
  (scrapers)        │                     │          │                      │
       │            │                     │          │                      │
       ▼            │                     │          │                      │
  ┌──────────────┐  │                     │          │                      │
  │scraper.py    ├──┼─►src/data/bills.json│          │                      │
  └──────────────┘  │                     │          │                      │
                    │                     │          │                      │
  ┌──────────────┐  │                     │          │                      │
  │fetch-camera- ├──┼─►public/camera-     │          │                      │
  │data.mjs     │  │  │data.json ─────────┼──fetch──►│  camera-map.ts      │
  └──────────────┘  │                     │          │  (MapLibre GL JS)    │
                    └─────────────────────┘          └──────────────────────┘
```

1. **Rep data** comes from `open-civics` and `open-civics-boundaries` npm packages. A prebuild script (`sync-open-civics.mjs`) assembles local council data and copies boundary files into the project.
2. **Bill scraper** runs on schedule via GitHub Actions and commits updated JSON.
3. **Build-time data** (`src/data/*.json`) is imported directly by Astro components and baked into static HTML.
4. **Runtime data** (`public/` files) is fetched by client-side JavaScript:
   - `camera-data.json` is loaded by `camera-map.ts` for the MapLibre camera map.
   - `districts/*.json` boundary files are loaded by ActionModal's district matcher when a user looks up their representatives.

## Data Pipelines

For details on each pipeline and how to adapt them for other states, see [adapting-scrapers.md](adapting-scrapers.md).

| Pipeline | Source | Output | Update method |
|---|---|---|---|
| State legislators | `open-civics` npm package | Imported in ActionModal | `npm update` |
| Local councils | `open-civics` npm package | `src/data/local-councils.json` | `npm update` + prebuild sync |
| District boundaries | `open-civics-boundaries` npm package | `public/districts/*.json` | `npm update` + prebuild sync |
| Bill status | `scripts/scraper.py` | `src/data/bills.json` | GitHub Actions (weekly/monthly) |
| Camera data | `scripts/fetch-camera-data.mjs` | `public/camera-data.json` | GitHub Actions (weekly) |

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

**Instrument Sans Variable** + **DM Mono**, self-hosted via @fontsource. Body line-height is 1.7.

### Visual Effects

- **Glow frame:** cursor-reactive `radial-gradient` border with backdrop-filter, defined in `global.css` as `.glow-frame`. Used on MapSection and BillTracker. Each instance binds its own `pointermove` listener.
- **Section glows:** multi-layer `radial-gradient` backgrounds with organic positioning, layered behind content (`relative z-10`).
- **Spotlight:** mouse-tracking card highlight via CSS custom properties (`--mouse-x`, `--mouse-y`), initialized in Base.astro's inline script. Applied to any element with `data-spotlight`.
- **Hero light cones:** SVG overlays on the camera image with CSS keyframe sweep animations and randomized timing. Outer cones hidden on mobile.

## Blog Publishing

Blog posts originate in an Obsidian vault and are published to the site via `scripts/publish.py`. The script scans the vault for markdown files with `publish: deflocksc` in their YAML frontmatter, then:

1. Strips vault-internal metadata (tags prefixed with `area-`, `type-`, `status-`)
2. Converts `[[wikilinks]]` to plain text
3. Validates required fields (`title`, `date`, `summary`)
4. Copies processed files into `src/content/blog/`

Run it with `python scripts/publish.py`. The vault path is hardcoded at the top of the script -- update `VAULT_PATH` if you fork the project.

## Map Style Customization

The camera map uses a custom dark style derived from OpenFreeMap. `scripts/build-map-style.mjs` fetches the base OpenFreeMap dark style and remaps its neutral gray palette to the site's dark-blue color scheme (slate tones from `#0f172a` to `#94a3b8`).

Run it with `node scripts/build-map-style.mjs`. The output is `public/map-style.json`, which MapLibre loads at runtime. If you change the site's color palette, update the color map in `buildExactMap()` to match.

## Known Issues

- **`define:vars` import limitation:** Astro's `define:vars` scripts cannot use ES module imports. The ActionModal works around this by inlining district-matcher functions with a `dm` prefix rather than importing from `src/lib/district-matcher.ts`.
- **Census geocoder CORS:** The Census geocoder API has no CORS headers. The site uses JSONP (`format=jsonp&callback=NAME`) instead of `fetch()`.
- **Census API geography keys:** Key names include a year prefix (e.g., `"2024 State Legislative Districts - Upper"` instead of `"State Legislative Districts - Upper"`). The district matcher uses fallback lookups for both formats.
- **CSS blur bleed:** `filter: blur()` bleeds past `overflow: hidden`. Fix with `clip-path: inset(0)` on a wrapping container.
- **Grid + flex overflow:** CSS Grid items default to `min-width: auto`, so flex children (carousel cards with `min-width: 100%`) can push a grid column wider than the viewport. Fix with `min-w-0` on grid items.
