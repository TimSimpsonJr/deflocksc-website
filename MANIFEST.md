# Project Manifest

## Stack

Astro 5 + Tailwind CSS 4 (+ daisyUI `deflock` theme) advocacy site against ALPR surveillance in
South Carolina. MapLibre GL JS for the camera map and the events map. Self-hosted fonts (Instrument
Sans Variable via @fontsource). Rep/boundary data from the `open-civics` npm packages.
Community events + council meetings stored via Netlify Blobs. Vitest unit suite (co-located
`*.test.ts`). Deployed on Netlify (auto-deploy from `master`); Umami analytics proxied through `/u`.

## Structure

```
src/
  layouts/
    Base.astro                  # Shell: Nav, main slot, Footer, JSON-LD, skip link; suppresses Umami on /events/*
  components/
    Nav.astro                   # Fixed nav — logo, Toolkit dropdown, Blog, Events, "Take Action" CTA
    Hero.astro                  # Camera PNG + animated SVG light cones
    HowItWorks.astro            # Carousel explaining ALPR surveillance
    HowItWorksOverlays.astro    # Case-study overlay panels (extracted from HowItWorks)
    MapSection.astro            # MapLibre camera map with clustering + popups
    BillTracker.astro           # SC legislature bill status cards
    BlogPreview.astro           # Homepage latest-posts carousel grid
    FAQ.astro                   # Accordion with optional source citations
    CitizenToolkit.astro        # Homepage toolkit preview cards → /toolkit/*
    TakeAction.astro            # CTA section, opens ActionModal
    ActionModal.astro           # Rep lookup: geolocation, address, or manual dropdown
    Footer.astro                # Multi-column footer: About, Explore, Resources
    ToolkitFoia/Speaking/Outreach/Legal.astro  # The 4 toolkit subpage bodies
    CouncilBrief.astro          # Shared city/county "leave-behind" brief: dark on screen, light @media print sheet
    EventsList.astro            # Events calendar list view
    EventsMonth.astro           # Events calendar month grid
    EventsMap.astro             # MapLibre map of event locations
    SubmitEventForm.astro       # Community event submission form (city combobox, date picker)
  pages/
    index.astro                 # Homepage — assembles all section components
    404.astro                   # Branded error page
    toolkit/
      index.astro               # Toolkit hub — card grid + hash redirects
      foia / speaking / outreach / legal.astro  # 4 toolkit subpages
      speaking/city-council-brief.astro         # Printable city-council leave-behind
      speaking/county-council-brief.astro       # Printable county-council leave-behind (defund/deny + FAQ)
    events.astro                # Events calendar index (no analytics beacon)
    events/submit.astro         # Event submission page
    blog/index.astro            # Blog listing — featured hero + grid + tag filtering
    blog/[...slug].astro        # Individual post — TOC, progress bar, read time, related
    blog/[...slug]/og.png.ts    # Per-post OG image generation
    rss.xml.ts                  # RSS feed
  lib/                          # Pure, Vitest-covered modules (most have a co-located *.test.ts)
    district-matcher.ts, geo-utils.ts   # District matching + geometry (rep lookup)
    blog-utils.ts, og-image.ts          # Read-time/related posts + Satori OG image
    event-schema.ts, public-event.ts    # Submitted-event validation + public (private-field-stripped) projection
    recurrence.ts, fold-events.ts       # Recurring-series rule expansion + folding into dated instances
    events-view.ts, council-events.ts   # Calendar view filtering + council-meeting-derived events
    jurisdictions.ts, city-label.ts     # SC jurisdiction lookup + city-name normalization
    organizer-code.ts, organizer-cli.ts # Organizer access codes + local CLI
    rate-limit.ts, sanitize-text.ts, escape-html.ts, signal-url.ts, wordlist-file.ts  # Abuse controls + safe input/links
    json-island.ts, text-result.ts, blob-stores.ts  # Data-island (de)serialize, Result type, Netlify Blobs store
  scripts/                      # Client-side entry points (progressive enhancement)
    action-modal/               # ActionModal logic: index, group-builder, results-renderer, modal-controller, manual-dropdowns, types
    map/core.ts                 # MapLibre init/shared chrome
    map/layers/cameras.ts       # Camera layer, popups, clusters (+ cameras.test.ts)
    map/layers/events.ts        # Event-location layer (+ events-constants.ts)
    events-page.ts              # Events calendar view interactivity (list/month/map, filters)
    bill-tracker.ts             # Bill card modals, status rendering
    case-studies.ts             # Case-study card animations, overlay focus traps
    foia-finder.ts              # Agency finder: location lookup, browse/filter, auto-fill
    toolkit-legal.ts            # State comparison map, bill gap analysis
  data/
    bills.json                  # SC legislature bills (populated by scraper)
    action-letters.json         # 85 locally tailored letter templates (all 46 counties)
    registry.json               # Jurisdiction metadata for district matching
    foia-contacts.json          # Curated FOIA contact records (agencies + custodians)
    council-meetings.json       # SC city/county council meeting schedules (source for calendar)
    events.json                 # Folded event instances served to the calendar
    city-centroids.json         # City centroid coords for the events map (+ city-centroids.test.ts)
    council-brief.ts            # Typed content for the two council leave-behind briefs (city + county)
    toolkit-foia/speaking/outreach/legal.json  # Data for the 4 toolkit subpages
  styles/global.css             # Font imports, Tailwind + daisyUI theme, glow-frame, label-mono utilities
  content/blog/                 # 11 Markdown blog posts (Astro content collection, glob loader)
  content.config.ts             # Content collection definitions
  umami.d.ts                    # Umami analytics type declarations

public/
  _headers                      # Netlify security headers (CSP, X-Frame-Options, Permissions-Policy)
  robots.txt                    # Crawl directives + sitemap reference
  districts/sc-counties.json    # County boundary GeoJSON (synced from open-civics)
  camera-data.json, camera-counts.json, map-style.json  # Cached camera data, per-jurisdiction counts, OpenFreeMap dark style
  hero-cameras*.{png,webp}      # Responsive hero image variants (650w–2600w)
  og-image.png, favicon.svg     # Default OG image + favicon
  blog/                         # Per-post images + SC county map SVG/PNG
  docs/                         # Public FOIA-response PDFs
  toolkit/                      # Toolkit downloads (FOIA PDFs, outreach cards, council-handout.pdf [unlinked])
  uploads/                      # Submitted-event image uploads
  *.html mockups                # Dev-only design mockups (not linked; e.g. modal/map/card mockups)

scripts/                        # Node/Python build + data tooling
  scraper.py, validate-bills.py # SC statehouse bill scraper → bills.json (+ CI schema check)
  sync-open-civics.mjs          # Prebuild: sync npm package data into project
  build-map-style.mjs, fetch-camera-data.mjs  # OpenFreeMap style build + Deflock CDN camera fetch
  build-camera-counts.py        # Deflock data → per-jurisdiction camera counts
  build-county-map-{iso,svg}.py # SC county map SVG generators
  generate-business-cards.js, generate-toolkit-pdfs.js  # Outreach card + FOIA template PDF generators
  publish.py                    # Obsidian vault → blog publisher (auto commit + push)

.github/
  workflows/scrape-bills.yml    # Weekly bill scraping (Jan–Jun), monthly off-season
  workflows/refresh-camera-data.yml  # Camera data refresh
  workflows/fold-events.yml     # Fold council-meetings + submissions into events.json
  workflows/lighthouse.yml      # Lighthouse CI on PRs
  dependabot.yml                # Watches open-civics npm packages
  pull_request_template.md      # PR checklist (action-modal smoke test)

docs/
  architecture.md, deployment.md, maintainability.md, adapting-scrapers.md, research-workflow.md
  plans/                        # Design docs + implementation plans (one pair per feature)
  research/                     # Research notes backing site copy
  handoffs/                     # Multi-session handoff notes
  reviews/                      # Saved review artifacts
```

## Key Relationships

- **sync-open-civics.mjs (prebuild) → data + public/districts/** — assembles npm package data into project formats
- **ActionModal + action-modal/ import district-matcher.ts + geo-utils.ts** — client-side rep lookup, letter rendering, district matching (honors `data-open-action-filter` on triggers)
- **foia-finder.ts reuses district-matcher.ts** — geocoder + district matching for agency location lookup
- **map/core.ts + map/layers/** — shared MapLibre init; cameras.ts (camera map) and events.ts (events map) are the two layer sets
- **CouncilBrief.astro renders cityBrief/countyBrief from council-brief.ts** — one shared component; @media print hides site chrome (nav, footer, `#action-modal`, `.brief-breadcrumb`, `.brief-siblings`) and repaints `.leave-behind` as the light sheet
- **ToolkitSpeaking.astro → /toolkit/speaking/{city,county}-council-brief** — two leave-behind links replaced the old `council-handout.pdf` (kept on disk, unlinked)
- **Events pipeline: council-meetings.json + submissions → fold-events (recurrence.ts/fold-events.ts) → events.json → EventsList/Month/Map** — SubmitEventForm posts through sanitize-text/rate-limit into blob-stores.ts (Netlify Blobs); fold-events.yml refreshes events.json
- **/events + /events/* carry NO analytics beacon** — Base.astro suppresses Umami on those paths (a record of who viewed an event is subpoena-sensitive)
- **BlogPreview.astro ← content/blog/** — homepage carousel pulls latest published posts
- **scraper.py → bills.json; publish.py ← Obsidian vault** — GitHub Actions scrapes bills; publisher pulls posts tagged `publish: deflocksc`, auto commits + pushes
- **netlify.toml + public/_headers** — both set security headers (keep CSP/proxy rules in sync); `/u` proxies Umami
