# Contributor Documentation Design

## Goal

Create layered documentation so advocacy orgs can understand and fork the site for their state, and developers can dive into the technical details of adapting scrapers, copy, and deployment.

## Structure

```
README.md                  — Project overview, quick start, adaptation checklist
docs/
  architecture.md          — Site structure, components, data flow, design system
  adapting-scrapers.md     — Adding scrapers for a new state
  research-workflow.md     — Using the research workflow for localized copy and form letters
  deployment.md            — Netlify, GitHub Actions, env vars
```

Existing `docs/plans/` is untouched (internal design docs).

## README.md

- What DeflockSC is (1-2 sentences)
- What the site does (brief description)
- Tech stack: Astro 5, Tailwind 4, Python 3.12, MapLibre GL JS
- Quick start: clone, install, dev server
- "Adapting for Your State" checklist linking to detailed guides
- Links to each doc in `docs/`
- License / contributing note

## docs/architecture.md

- Directory tree overview
- Component map: Base layout → Nav/Footer/6 homepage sections → ActionModal
- Data flow: scrapers → JSON files → Astro components → static site
- Client-side systems: district matcher pipeline, camera map (MapLibre + Deflock CDN), carousel
- Design system: color palette, typography (Inter), glow frame, section glows

## docs/adapting-scrapers.md

- Overview of 3 scraper pipelines (bills, reps, camera data)
- State legislators: OpenStates CSV source, what to change per state (FIPS, URL, phone backfill)
- Local councils: adapter pattern (base.py contract, civicplus.py reusable adapter, custom adapters)
- Registry: how registry.json maps jurisdictions to adapters and boundaries
- District boundaries: Census TIGER + ArcGIS sources, build-districts.py configuration
- Bill scraper: scstatehouse.gov parsing, what changes per state legislature site
- GitHub Actions: scheduled workflows, what to update

## docs/research-workflow.md

- What the research workflow is and where to find it (link to repo)
- 4-stage pipeline overview: search → fetch → classify → synthesize
- How DeflockSC used it for:
  - Localized site copy (FAQ claims with sourced citations, case studies, bill descriptions)
  - Form letter templates (action-letters.json — jurisdiction-specific letters with placeholders)
- Step-by-step setup for adapting to another state's ALPR issue
- Vault rules customization for state-specific content

## docs/deployment.md

- Prerequisites: Node 22, Python 3.12
- Environment variables (.env)
- Netlify configuration
- GitHub Actions setup (workflow OAuth scope gotcha)
- Domain registration and DNS
