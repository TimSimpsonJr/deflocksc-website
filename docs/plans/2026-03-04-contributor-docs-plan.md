# Contributor Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create layered contributor documentation so advocacy orgs and developers can fork and adapt the site for their state.

**Architecture:** 5 markdown files — a README as the entry point linking to 4 deep-dive guides in `docs/`. Each guide is self-contained with cross-links where topics overlap.

**Tech Stack:** Markdown only. No build step. GitHub renders everything natively.

---

## Task 1: README.md

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

Structure:
```
# DeflockSC

One-sentence description: static advocacy site tracking ALPR surveillance in South Carolina.

## What This Site Does
- Brief description of the 6 homepage sections (hero, how it works, camera map, bill tracker, FAQ, take action)
- The action modal: geolocation/address/manual → district matching → rep lookup → template letters

## Tech Stack
- Astro 5 (static site generator)
- Tailwind CSS 4
- Python 3.12 (scrapers, boundary builder)
- MapLibre GL JS + OpenFreeMap (camera map)
- Deflock CDN (camera data)
- Netlify (hosting, auto-deploys from master)

## Quick Start
- Prerequisites: Node 22, Python 3.12
- Clone, npm install, pip install -r requirements.txt
- npm run dev → localhost:4321
- Note: scraper data (bills.json, state-legislators.json, local-councils.json) ships with the repo; no scraper run needed to start dev

## Adapting for Your State
High-level checklist (each item links to the relevant guide):
1. Fork the repo
2. Update site copy and branding → link to docs/research-workflow.md
3. Configure scrapers for your state's legislature and local councils → link to docs/adapting-scrapers.md
4. Set up district boundaries → link to docs/adapting-scrapers.md#district-boundaries
5. Write localized action letters → link to docs/research-workflow.md#form-letters
6. Deploy → link to docs/deployment.md

## Documentation
- [Architecture](docs/architecture.md) — site structure, components, data flow
- [Adapting Scrapers](docs/adapting-scrapers.md) — adding your state's rep data
- [Research Workflow](docs/research-workflow.md) — creating localized copy and form letters
- [Deployment](docs/deployment.md) — Netlify, GitHub Actions, environment variables

## Contributing
- Existing contributor guide for manual data: scripts/scrape_reps/CONTRIBUTING.md
- For scraper adapters: see docs/adapting-scrapers.md
- Issues and PRs welcome

## License
MIT (or whatever the current license is — check)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add project README with quick start and adaptation checklist"
```

---

## Task 2: docs/architecture.md

**Files:**
- Create: `docs/architecture.md`

**Step 1: Write architecture.md**

Structure:
```
# Architecture

## Directory Structure
Annotated tree showing:
- src/components/ — 10 Astro components (list each with 1-line description)
- src/data/ — JSON data files (bills, registry, legislators, councils, letters)
- src/lib/ — client-side JS utilities (geo-utils, district-matcher)
- src/scripts/ — client-side TS (camera-map, carousel)
- src/content/ — blog posts (Astro content collections)
- src/pages/ — routes (index, blog/index, blog/[slug], rss.xml)
- scripts/ — Python scrapers and build tools
- public/ — static assets (districts GeoJSON, camera data, hero images, map style)
- .github/workflows/ — 3 CI/CD pipelines

## Component Map
Base.astro shell → Nav, Footer, ActionModal (always present)
index.astro → Hero, HowItWorks, MapSection, BillTracker, FAQ, TakeAction (in order)
Blog pages → content collection with glob loader

## Data Flow
Diagram (text-based):
1. Scrapers run on schedule (GitHub Actions) or manually
2. Output → JSON files in src/data/ and public/
3. Astro builds static HTML importing JSON at build time
4. Client-side JS loads GeoJSON boundaries + camera data at runtime

## Scraper Pipelines
Brief overview (detail in adapting-scrapers.md):
- Bill scraper: scstatehouse.gov → src/data/bills.json
- State legislators: OpenStates CSV → src/data/state-legislators.json
- Local councils: adapter-based scrapers → src/data/local-councils.json
- District boundaries: Census TIGER + ArcGIS → public/districts/*.json
- Camera data: Deflock CDN → public/camera-data.json

## Client-Side Systems
- District matcher: geo-utils.js (point-in-polygon) + district-matcher.js (boundary loading, Census geocoder) → ActionModal
- Camera map: camera-map.ts (MapLibre GL JS, OpenFreeMap tiles, clustering, popups)
- Carousel: carousel.ts (auto-advance, keyboard nav, dot indicators)

## Design System
- Colors: #171717 (bg), #dc2626 (red accent), #fbbf24 (amber), #d4d4d4 (text)
- Font: Inter (400/500/700/800/900)
- Effects: glow frame (cursor-reactive gradient border), section glows (radial gradients), spotlight (mouse-tracking card highlight)
```

**Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add architecture overview"
```

---

## Task 3: docs/adapting-scrapers.md

**Files:**
- Create: `docs/adapting-scrapers.md`

This is the most important doc. Write it with a "what do I change for my state?" lens.

**Step 1: Write adapting-scrapers.md**

Structure:
```
# Adapting Scrapers for Your State

## Overview
Three independent scraper pipelines, each with its own GitHub Actions workflow.
All output JSON files consumed by Astro components at build time.

## 1. State Legislators

### How it works
- `scripts/scrape_reps/state.py` downloads CSV from OpenStates
- Normalizes: name, district, party, email, phone, photo, website
- Backfills missing phones by scraping individual member pages
- Output: `src/data/state-legislators.json` keyed by chamber → district

### What to change for your state
- `src/data/registry.json` → `state.openStatesUrl`: replace with your state's CSV
  - Find yours at: https://data.openstates.org/people/current/{state-abbr}.csv
- Phone backfill: `state.py` scrapes scstatehouse.gov for missing phones — you'll need to
  adapt the `_backfill_phones()` method for your state's legislature website, or remove it
  if OpenStates has complete phone data
- FIPS code: used in Census boundary URLs (SC = 45) — update in registry.json boundary URLs

### Registry config
Show the `state` block from registry.json and explain each field.

## 2. Local Councils

### The adapter pattern
- `scripts/scrape_reps/adapters/base.py` defines the contract: fetch() → parse() → normalize() → scrape()
- Each jurisdiction in registry.json maps to an adapter class (or "manual" for hand-entered data)
- The scraper CLI (`python -m scripts.scrape_reps`) iterates registry entries and dispatches to adapters

### Reusable: CivicPlus adapter
- Many local governments use CivicPlus (civicplus.com) for their websites
- `adapters/civicplus.py` handles: page discovery, Cloudflare fallback, staff directory parsing,
  email de-obfuscation (JS var extraction), title normalization
- To use it: set `"adapter": "civicplus"` in registry.json with `adapterConfig`:
  - `baseUrl`: site root (e.g., "https://spartanburgcounty.org")
  - `councilPageId`: CivicPlus page ID for the council page
  - `directoryDeptId` (optional): auto-discovered if omitted
  - `memberFilter` (optional): title substrings to exclude (e.g., ["clerk"])

### Writing a custom adapter
Step-by-step:
1. Create `scripts/scrape_reps/adapters/your_jurisdiction.py`
2. Subclass `BaseAdapter`
3. Implement `fetch()` — return HTML string
4. Implement `parse(html)` — return list of member dicts
5. Optionally override `normalize()` for custom title mapping
6. Register in `scripts/scrape_reps/adapters/__init__.py`
7. Add registry.json entry with your adapter name

Show the BaseAdapter contract (fetch/parse/normalize/scrape) and explain each method.

Show a minimal adapter example (skeleton with docstrings).

### Manual data entry
- For jurisdictions without a scrapable website
- Set `"adapter": "manual"` in registry.json
- Hand-populate `src/data/local-councils.json`
- See `scripts/scrape_reps/CONTRIBUTING.md` for field schema and title conventions

### Registry entry reference
Document all registry.json fields:
- id, name, type, county, adapter, adapterConfig, url, districts, districtRange,
  atLarge, hasBoundary, boundarySource, boundaryUrl, boundaryDistrictField, boundaryFile, notes

## 3. Bill Scraper

### How it works
- `scripts/scraper.py` scrapes bill pages on scstatehouse.gov
- Parses: status, last action, last action date
- Bills are hardcoded in the script (3 bill URLs)
- Output: `src/data/bills.json`

### What to change for your state
- Replace bill URLs with your state's legislature site
- Rewrite parsing logic — every state legislature site has different HTML structure
- Update `src/data/bills.json` schema if your bills need different fields
- The BillTracker.astro component reads bills.json — may need minor template adjustments

## 4. District Boundaries

### How it works
- `scripts/build-districts.py` generates simplified GeoJSON for client-side point-in-polygon matching
- Sources: Census TIGER/Line (state legislative), ArcGIS REST (local councils), SC RFA statewide shapefile
- Processing: download → filter → simplify → round coordinates → export

### What to change for your state
- State legislative boundaries: update Census TIGER URLs with your state's FIPS code
  - Senate: TIGER2024/SLDU/tl_2024_{FIPS}_sldu.zip
  - House: TIGER2024/SLDL/tl_2024_{FIPS}_sldl.zip
- Local boundaries: find ArcGIS REST endpoints for your counties/cities
  - Many counties publish council district boundaries via their GIS portal
  - Typical URL pattern: https://{county-gis-server}/arcgis/rest/services/.../MapServer/{layer-id}
- Update `boundaryDistrictField` in registry.json for each jurisdiction (varies by source)

## 5. Camera Data

### How it works
- `scripts/fetch-camera-data.mjs` fetches from Deflock CDN
- Source: https://cdn.deflock.me/regions/{z}/{x}.json (tile-based)
- Output: `public/camera-data.json`

### What to change for your state
- Update the tile coordinates in fetch-camera-data.mjs for your region
- The camera map component (MapSection.astro + camera-map.ts) centers on SC by default —
  update the initial center coordinates and zoom level

## 6. GitHub Actions

### Workflows
- `.github/workflows/scrape-bills.yml` — bill status (weekly during session, monthly off-session)
- `.github/workflows/scrape-reps.yml` — state legislators (weekly) + local councils + boundaries (monthly)
- `.github/workflows/refresh-camera-data.yml` — camera data (weekly)

### What to change
- Cron schedules: adjust for your legislature's session calendar
- Python/Node versions: currently Python 3.12, Node 22
- Workflow OAuth scope: pushing repos with .github/workflows/ requires `workflow` scope
  (`gh auth refresh --hostname github.com --scopes workflow`)

## Running Scrapers Locally

Commands reference:
- Bills: `python scripts/scraper.py`
- State legislators only: `python -m scripts.scrape_reps --state-only`
- Local councils only: `python -m scripts.scrape_reps --local-only`
- Single jurisdiction: `python -m scripts.scrape_reps --jurisdiction county:greenville`
- Dry run (no file writes): `python -m scripts.scrape_reps --dry-run`
- Boundaries: `python scripts/build-districts.py [--dry-run]`
- Camera data: `node scripts/fetch-camera-data.mjs`
```

**Step 2: Commit**

```bash
git add docs/adapting-scrapers.md
git commit -m "docs: add scraper adaptation guide"
```

---

## Task 4: docs/research-workflow.md

**Files:**
- Create: `docs/research-workflow.md`

**Step 1: Write research-workflow.md**

Structure:
```
# Research Workflow for Localized Copy

## What Is It?
- Link to https://github.com/TimSimpsonJr/research-workflow
- Claude Code skill set that automates research: web search → content fetch → classification → vault note synthesis
- Designed for Obsidian vaults; produces sourced, cited, formatted notes
- Used by DeflockSC to create all site copy, FAQ citations, and form letters

## The Pipeline
Brief description of the 4 stages:
1. Search (Haiku): identifies 3-7 relevant URLs for a topic
2. Fetch & Cache (Python): retrieves pages via Jina Reader API, converts to markdown, 7-day cache
3. Classify (Haiku): maps content to your vault folder structure, suggests tags and wikilinks
4. Synthesize (Sonnet): writes formatted vault notes with citations, updates parent MOCs

## How DeflockSC Used It

### Site Copy
- FAQ section: each FAQ entry has a `source` field with cited links
  - Example: "According to the EFF Atlas of Surveillance..." with amber source link
  - The research workflow found and verified each claim, producing sourced notes that became FAQ entries
- Case studies (HowItWorks carousel): each card references a real incident
  - Research workflow gathered news articles, court documents, council minutes
  - Output was synthesized into concise case study copy
- Bill descriptions: research workflow tracked bill status, committee assignments, sponsor history

### Form Letters
- `src/data/action-letters.json` contains 13 jurisdiction-specific letter templates
- Each letter references local facts: camera counts, specific incidents, named officials, local precedents
- The research workflow produced these by:
  1. Researching each jurisdiction's ALPR deployment (camera counts, contracts, incidents)
  2. Finding precedent cities (Sedona AZ, Hays County TX, Cambridge MA) that restricted or banned Flock
  3. Identifying local angles (e.g., Spartanburg sheriff's federal conviction, Greenville sisters' lawsuit)
  4. Synthesizing jurisdiction-specific letters with placeholders ([NAME], [Your name and address])
- Letters are matched to representatives via `divisionPattern` (e.g., "state:sc/place:greenville")

### How to create letters for your state
1. Research your state's ALPR deployments using the workflow
2. Identify local incidents, camera counts, vendor contracts
3. Find precedent cities in your region that have restricted ALPR
4. Draft letters per jurisdiction tier (state legislators, county council, city council)
5. Add to action-letters.json with appropriate divisionPattern keys
6. The ActionModal automatically matches letters to reps based on district

## Setting Up the Research Workflow

### Prerequisites
- Claude Code
- Obsidian vault
- Python 3.10+
- Anthropic API key

### Installation
1. Clone https://github.com/TimSimpsonJr/research-workflow
2. Run `python scripts/discover_vault.py` to auto-detect vault structure and generate config
3. Install dependencies: `pip install -r requirements.txt`
4. Copy skill folders to `~/.claude/skills/` (or configure as Claude Code plugin)
5. Set environment variables in `.env`:
   - VAULT_ROOT, SCRIPTS_DIR, PYTHON_PATH, ANTHROPIC_API_KEY

### Customizing for Your State
- `scripts/prompts/vault_rules.txt` — formatting rules, citation format, wikilink targets
- Location tags: use `{city}-{state-abbr}` format (e.g., "austin-tx", "tx")
- Content-type tags: 10 categories (research, legislation, campaign, plan, reference, tracking, decision, index, resource, meta)
- Tagging reference: `TAGGING-REFERENCE.md`

### Usage
- `/research "ALPR cameras in {your city}"` — full pipeline
- `/research path/to/existing-note.md` — enrich an existing note with sources
- Output: formatted Obsidian notes with citations, ready to adapt into site copy
```

**Step 2: Commit**

```bash
git add docs/research-workflow.md
git commit -m "docs: add research workflow guide for localized copy and form letters"
```

---

## Task 5: docs/deployment.md

**Files:**
- Create: `docs/deployment.md`

**Step 1: Write deployment.md**

Structure:
```
# Deployment

## Prerequisites
- Node.js 22+
- Python 3.12+ (for scrapers only; not needed for site build)
- npm

## Environment Variables
- `.env` file in project root
- Currently only MAPBOX_TOKEN (unused — OpenFreeMap replaced Mapbox)
- No secrets needed for the site build itself
- GitHub Actions secrets: none required (scrapers commit directly)

## Local Development
- `npm install` — install Node dependencies
- `pip install -r requirements.txt` — install Python dependencies (for scrapers)
- `npm run dev` — start Astro dev server at localhost:4321
- `npm run build` — generate static site in dist/

## Netlify
- Auto-deploys from master branch via GitHub integration
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 22 (set in netlify.toml)
- No build plugins or functions needed

### Setup
1. Connect your GitHub repo to Netlify
2. Netlify auto-detects Astro and uses netlify.toml config
3. Set up custom domain in Netlify dashboard

## GitHub Actions
- 3 workflows in `.github/workflows/`:
  - `scrape-bills.yml` — bill status updates
  - `scrape-reps.yml` — representative data + boundaries
  - `refresh-camera-data.yml` — camera data from Deflock CDN
- All workflows commit directly to master, triggering Netlify rebuild
- Pushing workflow files requires `workflow` OAuth scope:
  `gh auth refresh --hostname github.com --scopes workflow`

## Domain
- Site URL configured in `astro.config.mjs` (`site` field)
- Update this when you set up your own domain
- Netlify handles SSL automatically
```

**Step 2: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: add deployment guide"
```

---

## Summary

| Task | File | Description |
|------|------|-------------|
| 1 | `README.md` | Project overview, quick start, adaptation checklist |
| 2 | `docs/architecture.md` | Directory structure, components, data flow, design system |
| 3 | `docs/adapting-scrapers.md` | All 5 scraper pipelines + how to adapt each for another state |
| 4 | `docs/research-workflow.md` | Research pipeline, how it produced copy + form letters, setup guide |
| 5 | `docs/deployment.md` | Local dev, Netlify, GitHub Actions, domain |
