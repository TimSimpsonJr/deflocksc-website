# Project Manifest

## Stack

Astro 5 + Tailwind CSS 4 single-page advocacy site against ALPR surveillance in South Carolina.
MapLibre GL JS for camera map. Satori + Sharp for OG images. TinaCMS for blog editing.
Deployed on Netlify (auto-deploy from master). Analytics via Umami (proxied).

## Structure

```
src/
  layouts/
    Base.astro                  # Shell: Nav, main slot, Footer
  components/
    Nav.astro                   # Fixed nav — logo + "Take Action" CTA
    Hero.astro                  # Camera PNG + animated SVG light cones
    HowItWorks.astro            # Carousel explaining ALPR surveillance
    HowItWorksOverlays.astro    # Case study overlay panels (extracted from HowItWorks)
    MapSection.astro             # MapLibre camera map with clustering + popups
    BillTracker.astro           # SC legislature bill status cards
    FAQ.astro                   # Accordion with optional source citations
    TakeAction.astro            # CTA section, opens ActionModal
    ActionModal.astro           # Rep lookup: geolocation, address, or manual dropdown
    Footer.astro                # 2-column: About + Resources
    ToolkitTabs.astro           # Four-tab container with sticky nav + hash routing
    ToolkitFoia.astro           # FOIA letter templates with placeholder highlighting
    ToolkitSpeaking.astro       # Public comment guide: talk track, tips, rebuttals
    ToolkitOutreach.astro       # One-pager, conversation starters, business cards, share links
    ToolkitLegal.astro          # 4th Amendment primer, state map, bill gap analysis
  pages/
    index.astro                 # Homepage — assembles all section components
    toolkit.astro               # Citizen toolkit page (FOIA, speaking, outreach, legal)
    blog/index.astro            # Blog listing page
    blog/[...slug].astro        # Individual blog post
    blog/[...slug]/og.png.ts    # Dynamic OG image generation per post
    rss.xml.ts                  # RSS feed
  lib/
    district-matcher.js         # Boundary loading, district matching, Census geocoder (fetch)
    geo-utils.js                # Point-in-polygon, bounding box geometry
    og-image.ts                 # Satori SVG-to-PNG for OG cards
  scripts/
    camera-map.ts               # MapLibre init, camera layers, popups, clusters
    carousel.ts                 # Auto-advance, dot/arrow nav, keyboard a11y
  data/
    bills.json                  # SC legislature bills (populated by scraper)
    state-legislators.json      # State reps and senators
    local-councils.json         # County/city council members
    action-letters.json         # 85 locally tailored letter templates (all 46 counties)
    registry.json               # Rep data registry (adapter metadata)
    toolkit-foia.json           # 4 FOIA request templates
    toolkit-speaking.json       # Public comment tips, talk track, rebuttals
    toolkit-outreach.json       # One-pager, conversation starters, business card designs
    toolkit-legal.json          # 4th Amendment cases, state comparison, bill gap analysis
  styles/
    global.css                  # Tailwind base, glow-frame, custom utilities
  content/
    blog/                       # Markdown blog posts (Astro content collections)
  content.config.ts             # Content collection definitions (glob loader)
  umami.d.ts                    # Type declarations for Umami analytics

scripts/
  scraper.py                    # SC statehouse bill scraper → bills.json
  scrape_reps/                  # Rep data scraper package
    __main__.py                 #   Entry point
    state.py                    #   State legislator scraper (scstatehouse.gov)
    adapters/                   #   Local council scrapers (CivicPlus, custom)
  build-districts.py            # Census TIGER/Line → simplified GeoJSON
  build-map-style.mjs           # OpenFreeMap dark style customization
  fetch-camera-data.mjs         # Deflock CDN camera data fetch
  publish.py                    # Obsidian vault → blog post publisher

public/
  districts/                    # GeoJSON boundaries (state leg, county, city)
  camera-data.json              # Cached Deflock camera data
  map-style.json                # Customized OpenFreeMap dark tile style
  hero-cameras*.png             # Responsive hero image variants (650w–2600w)
  og-image.png                  # Default Open Graph image
  favicon.svg                   # Site favicon

.github/workflows/
  scrape-bills.yml              # Weekly bill scraping (Jan–Jun), monthly off-session
  scrape-reps.yml               # Rep data scraping
  refresh-camera-data.yml       # Camera data refresh
  lighthouse.yml                # Lighthouse CI on PRs

docs/
  architecture.md               # System architecture overview
  adapting-scrapers.md           # Adding your state's rep data
  research-workflow.md           # Creating localized copy, research, and form letters
  deployment.md                 # Netlify deployment guide
  plans/                        # Design docs and implementation plans
```

## Key Relationships

- **ActionModal inlines district-matcher.js** — Astro `define:vars` scripts can't import ES modules; functions are duplicated with `dm` prefix
- **camera-map.ts extracted from MapSection** — MapLibre init, layers, popups, cluster handling
- **carousel.ts extracted from HowItWorks** — auto-advance, navigation, keyboard a11y
- **HowItWorksOverlays.astro extracted from HowItWorks** — case study overlay panels
- **scraper.py → bills.json** — GitHub Actions runs scraper, commits updated bill data
- **build-districts.py → public/districts/** — generates GeoJSON consumed by district-matcher.js at runtime
- **publish.py ← Obsidian vault** — pulls blog posts tagged `publish: deflocksc`
- **fetch-camera-data.mjs → camera-data.json** — caches Deflock CDN data for the map
