# Project Manifest

## Stack

Astro 5 + Tailwind CSS 4 (+ daisyUI `deflock` theme, dark-only) advocacy site against ALPR
surveillance in South Carolina. MapLibre GL JS drives the homepage camera map (live per-viewport
Deflock CDN tiles) and the events map. Self-hosted Instrument Sans Variable via @fontsource (DM Mono
removed site-wide). Rep/boundary data from the `open-civics` npm packages. Community events + council
meetings stored via Netlify Blobs, served through Netlify Functions. Vitest unit suite (co-located
`*.test.ts`). Deployed on Netlify (auto-deploy from `master`); Umami analytics proxied through `/u`.

## Structure

```
src/
  layouts/Base.astro            # Shell: Nav, main slot, Footer, JSON-LD, skip link, copy-toast region; suppresses Umami on /events/*
  components/                    # Homepage sections in index.astro order, then chrome / modal / toolkit / events
    Hero.astro                  # Full-bleed hero — camera PNG + animated SVG light cones
    BlogCarousel.astro          # Latest-5-posts CSS scroll-snap carousel (no JS, keyboard-scrollable)
    ImpactBand.astro            # Three-stat scale band with count-up (SC camera total ← impact-stats.json)
    MapSection.astro            # MapLibre camera map: live CDN tiles, clustering, popups, statline
    LegislationAsks.astro       # Oconee-model ordinance asks (6 cards + ask-frame stats); keeps legacy #bill-tracker anchor
    TakeActionZone.astro        # Primary CTA band (speak at council) → ActionModal; embeds ToolkitCards
    ToolkitCards.astro          # Shared 4-card /toolkit/* row (homepage + toolkit index)
    EventsStrip.astro           # Build-time upcoming-events strip (reuses the events-view pipeline)
    SignalCta.astro             # Closing Signal-group CTA — no analytics, scraper-hidden redirect
    Nav.astro, Footer.astro     # Fixed nav (Toolkit dropdown + Take Action CTA) + multi-column footer
    ActionModal.astro           # Rep lookup: geolocation, address, or manual dropdown
    CouncilBrief.astro          # Shared city/county "leave-behind" brief: dark on screen, light @media print sheet
    ToolkitFoia/Speaking/Outreach/Legal.astro    # The 4 toolkit subpage bodies
    EventsList/Month/Map.astro, SubmitEventForm.astro  # Calendar list/month/map views + community submission form
  pages/
    index.astro                 # Homepage — assembles the section components above
    404.astro                   # Branded error page
    toolkit/index.astro, foia|speaking|outreach|legal.astro  # Toolkit hub (card grid + hash redirects) + 4 subpages
    toolkit/speaking/{city,county}-council-brief.astro  # Printable city/county-council leave-behinds
    events.astro, events/submit.astro  # Events calendar index (no beacon) + submission page
    blog/index.astro            # Blog listing — featured hero + grid + tag filtering
    blog/[...slug].astro        # Individual post — TOC, progress bar, read time, related (+ /og.png.ts per-post OG)
    rss.xml.ts                  # RSS feed
  lib/                          # Pure, Vitest-covered modules (most have a co-located *.test.ts)
    district-matcher.ts, geo-utils.ts, sc-camera-count.ts   # District matching + geometry (rep lookup) + shared SC camera count/payload validator
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
    map/core.ts, map/tile-loader.ts     # MapLibre init/chrome + per-viewport CDN tile fetch/dedupe/fallback (+ tile-loader.test.ts)
    map/layers/cameras.ts, events.ts    # Camera layer (popups/clusters, +test) + event-location layer (+ events-constants.ts)
    events-page.ts              # Events calendar view interactivity (list/month/map, filters)
    count-up.ts, signal-cta.ts  # Shared count-up animation; scraper-hidden Signal redirect (decodes go.ts "intake")
    tab-rail.ts, toast.ts       # Master-detail toolkit tabs; site-wide copy-feedback toast (daisyUI alert)
    foia-finder.ts, toolkit-legal.ts    # Agency finder (reuses district-matcher) + state comparison map / bill-gap analysis
  data/
    bills.json                  # SC legislature bills (populated by scraper)
    action-letters.json         # 85 locally tailored letter templates (all 46 counties)
    registry.json, foia-contacts.json   # Jurisdiction metadata for matching + curated FOIA contacts
    council-meetings.json, events.json, city-centroids.json  # Council schedules → folded event instances + map centroids (+test)
    impact-stats.json           # Build-generated { scTotal, jurisdictions, generatedAt }
    council-brief.ts            # Typed content for the two council leave-behind briefs (city + county)
    brief-icons.ts, homepage-asks.ts    # Shared Tabler glyphs + homepage-abridged ordinance asks/stats (+ homepage-asks.test.ts)
    toolkit-foia|speaking|outreach|legal.json  # Data for the 4 toolkit subpages
  styles/global.css             # Font imports, Tailwind + daisyUI `deflock` theme, prose vars, glow-frame
  content/blog/ + content.config.ts   # 11 Markdown posts (glob content collection) + collection schema
  umami.d.ts                    # Umami analytics type declarations

public/
  _headers, robots.txt          # Netlify security headers (CSP, X-Frame-Options) + crawl directives/sitemap
  districts/sc-counties.json    # County boundary GeoJSON (synced from open-civics)
  camera-data.json, camera-counts.json, map-style.json  # Committed camera snapshot (map fallback), per-jurisdiction counts, OpenFreeMap dark style
  hero-cameras*.{png,webp}, og-image.png, favicon.svg  # Responsive hero variants (650w–2600w) + default OG + favicon
  blog/, docs/, toolkit/, uploads/  # Post images/county map; public FOIA PDFs; toolkit downloads; submitted-event images

scripts/                        # Node/Python build + data tooling
  scraper.py, validate-bills.py # SC statehouse bill scraper → bills.json (+ CI schema check)
  sync-open-civics.mjs          # Prebuild: sync npm package data into project
  build-map-style.mjs, fetch-camera-data.ts, build-impact-stats.ts  # Map style + validating CDN fetch (all-or-nothing payload gate) + one PIP pass → camera-counts.json/impact-stats.json (esbuild-bundled TS, shared src/lib/sc-camera-count.ts)
  build-camera-counts.py, build-city-centroids.py, build-county-map-{iso,svg}.py, build-county-shapes.mjs  # Legacy/count + centroid + SC county map builders
  generate-business-cards.js, generate-toolkit-pdfs.js  # Outreach card + FOIA template PDF generators
  organizer-codes.ts, build-wordlist.ts, update-letters-s447.py  # Organizer code CLI, EFF wordlist build, one-off letter patch
  publish.py, data/             # Obsidian → blog publisher; EFF wordlist + centroid overrides + SOURCES.md

netlify/functions/              # Runtime endpoints (Netlify Blobs backed)
  submit-event.ts, events.ts, fold-events.ts  # Event intake (sanitize + rate-limit), public read API, server-side fold trigger
  go.ts, address-suggest.ts     # Keyed redirect resolver (Signal "intake") + address autocomplete proxy
tina/config.ts, tina-lock.json  # TinaCMS config for blog editing

tests/                          # config-guards + tile-loader invariants; functions/*.test.ts (Netlify function tests)
.github/                        # workflows: scrape-bills, refresh-camera-data, fold-events, lighthouse; dependabot; PR template
docs/                           # architecture/deployment/maintainability/*.md; plans/ (design+impl pairs), research/, handoffs/, reviews/
```

## Key Relationships

- **sync-open-civics.mjs (prebuild) → data + public/districts/** — assembles npm package data into project formats
- **index.astro → Hero · BlogCarousel · ImpactBand · MapSection · LegislationAsks · TakeActionZone · EventsStrip · SignalCta** — rebuilt single-page homepage; TakeActionZone embeds ToolkitCards
- **MapSection + map/core.ts + map/tile-loader.ts** — live per-viewport camera tiles via the same-origin `/deflock-tiles/*` proxy (netlify.toml in prod, astro.config.mjs dev proxy), declustering at zoom 13; falls back to committed public/camera-data.json when the CDN fails
- **refresh-camera-data.yml (daily) → fetch-camera-data.ts + build-impact-stats.ts (shared src/lib/sc-camera-count.ts)** — validating fetch (all-or-nothing payload gate; non-zero exit + prior snapshot kept on failure) then one PIP pass regenerates camera-data.json (snapshot), camera-counts.json (per-jurisdiction), and impact-stats.json so the numbers never disagree; the build-time SC total in impact-stats.json is what Hero/ImpactBand/MapSection render (SSR, no live endpoint)
- **ImpactBand / LegislationAsks / MapSection statline → count-up.ts** — one shared animation; each ships its final value in the DOM for AT + no-JS
- **LegislationAsks ← homepage-asks.ts + brief-icons.ts** — abridged asks + shared Tabler glyphs; homepage-asks.test.ts guards each ask's `cite` against council-brief.ts (no cite drift)
- **CouncilBrief.astro renders cityBrief/countyBrief from council-brief.ts, glyphs from brief-icons.ts** — one shared component; @media print hides site chrome and repaints `.leave-behind` as the light sheet
- **SignalCta + signal-cta.ts** — button carries no href/data URL; the go.ts "intake" redirect is base64-decoded and assigned at click (scraper-hidden), fires NO analytics
- **ActionModal + action-modal/ import district-matcher.ts + geo-utils.ts; foia-finder.ts reuses the matcher** — client-side rep lookup + agency location lookup (honors `data-open-action-filter`)
- **Events pipeline: council-meetings.json + submissions → fold-events (recurrence.ts/fold-events.ts) → events.json → EventsList/Month/Map + EventsStrip** — SubmitEventForm posts through sanitize-text/rate-limit into blob-stores.ts (Netlify Blobs); fold-events.yml refreshes events.json; EventsStrip bakes the same events-view pipeline at build
- **/events + /events/* carry NO analytics beacon** — Base.astro suppresses Umami on those paths (who viewed an event is subpoena-sensitive)
- **scraper.py → bills.json; publish.py ← Obsidian vault** — GitHub Actions scrapes bills; publisher pulls posts tagged `publish: deflocksc`, auto commits + pushes
- **netlify.toml + public/_headers** — both set security headers (keep CSP/proxy rules in sync); `/u` proxies Umami, `/deflock-tiles/*` proxies the camera CDN
