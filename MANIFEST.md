# Project Manifest

## Stack

Astro 5 + Tailwind CSS 4 advocacy site against ALPR surveillance in South Carolina.
MapLibre GL JS for camera map. Self-hosted fonts (Instrument Sans Variable, DM Mono via @fontsource).
Rep data from `open-civics` / `open-civics-boundaries` npm packages. Shopify Storefront API for merch shop. Deployed on Netlify (auto-deploy from master).

## Structure

```
src/
  layouts/
    Base.astro                  # Shell: Nav, main slot, Footer, JSON-LD, skip-to-content
  components/
    Nav.astro                   # Fixed nav — logo, Toolkit dropdown, Blog link, "Take Action" CTA
    Hero.astro                  # Camera PNG + animated SVG light cones
    HowItWorks.astro            # Carousel explaining ALPR surveillance
    HowItWorksOverlays.astro    # Case study overlay panels (extracted from HowItWorks)
    MapSection.astro            # MapLibre camera map with clustering + popups
    BillTracker.astro           # SC legislature bill status cards
    BlogPreview.astro           # Homepage 5-post carousel grid
    FAQ.astro                   # Accordion with optional source citations
    CitizenToolkit.astro        # Homepage toolkit preview cards → links to /toolkit/*
    TakeAction.astro            # CTA section, opens ActionModal
    ActionModal.astro           # Rep lookup: geolocation, address, or manual dropdown
    ShopPreviewCard.astro       # Product preview card for shop grid (image, title, price range)
    Footer.astro                # 3-column: About, Blog, Resources
    ToolkitFoia.astro           # FOIA agency finder + letter templates with auto-fill
    ToolkitSpeaking.astro       # Public comment guide: talk track, tips, rebuttals
    ToolkitOutreach.astro       # One-pager, conversation starters, business cards, share links
    ToolkitLegal.astro          # 4th Amendment primer, state map, bill gap analysis
  pages/
    index.astro                 # Homepage — assembles all section components
    404.astro                   # Branded error page
    shop/
      index.astro               # Shop landing: campaign header, progress bar, product grid
      [slug].astro              # Product detail: size/tier selectors, direct checkout
    toolkit/
      index.astro               # Toolkit hub — card grid linking to 4 subpages + hash redirects
      foia.astro                # FOIA templates subpage
      speaking.astro            # Council meeting prep subpage
      outreach.astro            # Outreach materials subpage
      legal.astro               # Legal resources subpage
    blog/index.astro            # Blog listing — featured hero + grid + tag filtering
    blog/[...slug].astro        # Individual post — TOC sidebar, progress bar, read time, related posts
    blog/[...slug]/og.png.ts    # Dynamic OG image generation per post
    rss.xml.ts                  # RSS feed
  lib/
    blog-utils.ts               # Read time estimation + related posts matching
    district-matcher.ts         # Boundary loading, district matching, Census geocoder (fetch)
    geo-utils.ts                # Point-in-polygon, bounding box geometry
    og-image.ts                 # Satori SVG-to-PNG for OG cards
    shop-utils.ts               # Product grouping: maps Shopify variants into PWYW tiers
    shopify.ts                  # Shopify Storefront API GraphQL client
  scripts/
    action-modal/               # ActionModal client-side logic (extracted)
      index.ts                  #   Entry point, wires up modal events
      group-builder.ts          #   Builds rep groups from matched districts
      results-renderer.ts       #   Renders rep cards, letters, email/copy actions
      modal-controller.ts       #   Open/close, focus trap, scroll lock
      manual-dropdowns.ts       #   Manual district selection fallback
      types.ts                  #   Shared type definitions
    bill-tracker.ts             # Bill card modals, status rendering
    camera-map.ts               # MapLibre init, camera layers, popups, clusters
    carousel.ts                 # Auto-advance, dot/arrow nav, keyboard a11y
    case-studies.ts             # Case study card animations, overlay focus traps
    foia-finder.ts              # Agency finder: location lookup, browse/filter, auto-fill
    shop.ts                     # Shop client-side: option selectors, Shopify SDK checkout, progress bar
    toolkit-legal.ts            # State comparison map, bill gap analysis interactivity
  data/
    bills.json                  # SC legislature bills (populated by scraper)
    action-letters.json         # 85 locally tailored letter templates (all 46 counties)
    registry.json               # Jurisdiction metadata for district matching
    shop-config.json            # Campaign config (batch target, headlines, tier labels, product order)
    foia-contacts.json          # 64 curated FOIA contact records (agencies + custodians)
    toolkit-foia.json           # 4 FOIA request templates
    toolkit-speaking.json       # Public comment tips, talk track, rebuttals
    toolkit-outreach.json       # One-pager, conversation starters, business card designs
    toolkit-legal.json          # 4th Amendment cases, state comparison, bill gap analysis
  styles/
    global.css                  # Self-hosted font imports, Tailwind base, glow-frame, custom utilities
  content/
    blog/                       # 10 Markdown blog posts (8 published + 2 drafts), Astro content collections
  content.config.ts             # Content collection definitions (glob loader)
  umami.d.ts                    # Type declarations for Umami analytics

netlify/
  functions/
    shop-progress.ts            # Netlify Function: fetches profit from Shopify Admin API for progress bar

public/
  robots.txt                    # Search engine crawl directives + sitemap reference
  districts/                    # GeoJSON boundaries (synced from open-civics-boundaries npm)
  camera-data.json              # Cached Deflock camera data
  camera-counts.json            # Per-jurisdiction camera counts (build-time)
  map-style.json                # Customized OpenFreeMap dark tile style
  hero-cameras*.png             # Responsive hero image variants (650w–2600w)
  og-image.png                  # Default Open Graph image
  favicon.svg                   # Site favicon
  _headers                      # Netlify security headers (CSP, X-Frame-Options, Permissions-Policy)

scripts/
  scraper.py                    # SC statehouse bill scraper → bills.json
  validate-bills.py             # Bill data schema validation (runs in CI after scrape)
  sync-open-civics.mjs          # Prebuild: syncs npm package data into project
  build-map-style.mjs           # OpenFreeMap dark style customization
  build-camera-counts.py        # Deflock data → per-jurisdiction camera counts
  build-county-map-iso.py       # Isometric SC county map SVG generator
  build-county-map-svg.py       # Flat SC county map SVG generator
  fetch-camera-data.mjs         # Deflock CDN camera data fetch
  generate-business-cards.js    # Advocacy business card PNG + PDF generator
  generate-toolkit-pdfs.js      # FOIA template PDF generator
  publish.py                    # Obsidian vault → blog post publisher (auto git commit + push)

.github/
  workflows/
    scrape-bills.yml            # Weekly bill scraping (Jan–Jun), monthly off-session
    refresh-camera-data.yml     # Camera data refresh
    lighthouse.yml              # Lighthouse CI on PRs
  dependabot.yml                # Watches open-civics npm packages for updates
  pull_request_template.md      # PR checklist with action modal smoke test

docs/
  architecture.md               # System architecture overview
  adapting-scrapers.md          # Adapting data sources for other states
  research-workflow.md          # Creating localized copy, research, and form letters
  deployment.md                 # Netlify deployment guide
  maintainability.md            # Maintainability evaluation
  plans/                        # Design docs and implementation plans
  research/                     # Research notes backing site copy (toolkit gap analysis, etc.)
  handoffs/                     # Session handoff notes for multi-session work (e.g. blog rewrite)
```

## Key Relationships

- **sync-open-civics.mjs (prebuild) → local-councils.json + public/districts/** — assembles npm package data into project formats
- **ActionModal.astro imports open-civics/sc/state.json** — state legislator data comes directly from npm package
- **foia-finder.ts imports district-matcher.ts** — reuses geocoder + district matching for agency location lookup
- **action-modal/ imports district-matcher.ts + geo-utils.ts** — client-side rep lookup, letter rendering, district matching
- **camera-map.ts extracted from MapSection** — MapLibre init, layers, popups, cluster handling
- **carousel.ts extracted from HowItWorks** — auto-advance, navigation, keyboard a11y
- **toolkit/index.astro hub → toolkit/*.astro subpages** — card grid links + client-side hash redirects for backward compat
- **BlogPreview.astro ← content/blog/** — homepage carousel pulls latest 5 published posts
- **scraper.py → bills.json** — GitHub Actions runs scraper, commits updated bill data
- **publish.py ← Obsidian vault** — pulls blog posts tagged `publish: deflocksc`, auto commits + pushes
- **dependabot.yml** — watches open-civics packages, opens PRs when new versions are published
- **netlify.toml + _headers** — both set security headers; _headers has CSP, netlify.toml has the rest (keep in sync)
- **shop-utils.ts groups products from shopify.ts** — maps Shopify variants into PWYW tiers displayed by shop pages
- **shop.ts loads Shopify Buy Button SDK** — direct checkout flow (no cart widget)
- **shop-progress.ts (Netlify Function)** — fetches order profit from Shopify Admin API for progress bar
- **shop-config.json → shop pages** — controls product order, tier labels, batch fundraising target
