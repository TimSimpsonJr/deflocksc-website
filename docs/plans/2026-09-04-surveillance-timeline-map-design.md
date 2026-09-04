# Surveillance Timeline Map — Design Spec

**One-line summary:** An animated, interactive MapLibre map embedded in a blog post where red glowing dots — one per ALPR camera — bloom in over time (≈Jan 2020 → present) as a scrubber advances, showing the surveillance network spreading nationally, then zooming into South Carolina.

**Date:** 2026-09-04
**Status:** Design — approved in brainstorming, pending spec review.
**Working title:** "Surveillance Timeline Map."

---

## Goal & narrative

Advocacy. The single feeling we are building for is watching the surveillance
network **go red over time**: a dark map that fills with glowing red camera dots
as the timeline runs from ≈2020 to today. National scale establishes the scope
("this is everywhere"); the zoom into South Carolina makes it local and personal
("this is your town"). The map is the argument — the network's growth is the
message, not a chart caption on the side.

This feature is emotional first and exploratory second. The guided intro delivers
the gut-punch; free exploration lets a skeptic verify it.

---

## Placement & scope

**Blog-post-embedded feature**, one post to start. The map lives inline in a
single published blog post (`src/content/blog/*.md`), rendered through the existing
blog pipeline (`src/pages/blog/[...slug].astro`). The post body carries the
narrative and the honest-methodology paragraph; the map is an interactive figure
inside it.

**Superseded:** an earlier brainstorm idea placed this as a homepage section. That
is explicitly **superseded** by the blog-embedded decision. A homepage adaptation
is listed under Out of Scope, not built now.

Scope of this doc: the data build, the render layer, the basemap style, the
in-article chrome, and the blog-embedding mechanism for **one** host post. Not a
generic reusable Astro component library, not a homepage integration.

---

## User experience

### Hybrid: guided intro → free exploration

On load (unless `prefers-reduced-motion`), the map **autoplays a guided intro**:

1. Start national, near-empty (early-2020 cutoff), dark.
2. Advance the timeline — dots bloom in across the US as the cutoff month
   increases. National scale, small dots.
3. Smoothly fly/ease into South Carolina (`map.flyTo`) while the timeline
   continues, so SC fills in under the viewer's eye.
4. End at present day, framed on South Carolina, full network shown.

When the intro finishes, **unlock free exploration**: the scrubber, pan/zoom, and
a National ⇄ South Carolina control all become live. The intro can be interrupted
by any user interaction (scrub, pan, zoom, toggle, or a Skip control), which stops
autoplay and hands over control immediately.

### Scrubber & readout

- **Play/pause** control.
- **Monthly range slider** spanning ≈Jan 2020 → present (one stop per month).
- A **reference-style readout**: `date · running cumulative count` — e.g.
  `Mar 2024 · 41,208 documented`. The count is the real cumulative number of
  cameras whose first-seen month is ≤ the current cutoff (real-scale, not a
  percentage).

The scrubber is the single source of truth for the "cutoff" month; play just
advances it on a timer.

### National ⇄ South Carolina control

A segmented toggle switches the framing between the national view and South
Carolina. It is a camera-move convenience (fit-bounds to US vs. to SC), not a data
switch — the same dataset drives both; SC is a filtered/closer view of the one
national table.

### Zoom → cones

Dots are the default mark. **Past a zoom threshold, dots resolve into the site's
directional camera cones** (reusing `createConeImage` + `parseDirection` from
`src/scripts/map/layers/cameras.ts`), so a viewer zoomed into a town sees which
way each camera faces — consistent with the homepage camera map. **No clustering**
at any zoom: clustering would collapse dots and destroy the appear-over-time
bloom, which is the entire point.

### Reduced motion

Under `prefers-reduced-motion: reduce`: **no autoplay, no fly-through.** The map
loads showing the present-day full network (cutoff = latest month), framed on a
sensible default (SC or national — open question). All controls remain fully
usable — the user can still scrub back through time manually and pan/zoom. Nothing
is disabled; only the automatic motion is suppressed.

### Mobile

- The map is an in-article figure, so it uses `cooperativeGestures: true` (see
  Rendering architecture) — one-finger scroll moves the page past the map;
  two-finger gestures pan/zoom the map. This matches the events map's behavior.
- Chrome (toggle, play, scrubber, readout) must stack/shrink to fit a 375px
  viewport with no horizontal page scroll.
- The guided intro still autoplays on mobile (motion-permitting); it is the
  primary payload for a reader who never touches the controls.

---

## Visual design

### Dark, red, glowing

- **Basemap:** dark (the site's `#171717` ground), deliberately low-contrast so
  the red reads as the only "live" thing on the map.
- **Dots:** surveillance **red** — `#dc2626` core, `#ef4444` / `#f87171` accents,
  with a red **glow** (a larger, blurred, low-opacity circle layer beneath the
  solid dot, echoing the homepage `cluster-glow` treatment).
- **Radius scales with zoom:** small when zoomed out (to fight national crowding
  where ~62k dots overlap) and larger when zoomed in. Implemented as a
  zoom-interpolated `circle-radius` (and matching glow radius).
- **Bloom-in:** when a dot first crosses the cutoff it should feel like it
  *appears* (a brief opacity/scale ramp), not just pop — art direction detail for
  implementation, kept cheap (see Rendering architecture; a paint-driven approach
  is preferred over per-dot animation at 62k dots).
- **Cones:** at high zoom, the existing red directional cone (`createConeImage`,
  an 80×80 canvas wedge in `rgba(239,68,68,0.45)` with an `#ef4444` center dot)
  replaces the dot, date-filtered the same way.

### Branded chrome (DaisyUI, `deflock` theme)

**All** map chrome uses **DaisyUI primitives themed to the site's `deflock`
theme** (registered in `src/styles/global.css`: `--color-primary: #dc2626`,
`--color-secondary`/`--color-accent: #fbbf24`, `--color-base-100: #171717`, etc.).
No hand-rolled pills.

| UI element | DaisyUI primitive |
|---|---|
| National ⇄ SC segmented toggle | `join` + `btn` (active state = `btn-primary`) |
| Play / pause | `btn` (icon button) |
| Monthly scrubber | `range` (themed to primary) |
| Date · count readout | `badge` / `stat`-style text, tabular-nums |
| Guided-intro indicator | **a proper branded element** (see below) |

**Guided-intro indicator — redesigned.** The brainstorm mockup used a floating
chip that read as generic/AI-ish; it is **rejected**. The intro state must be
communicated with a branded, on-theme element — e.g. a DaisyUI `badge`/`btn`
"Skip intro →" control plus the live readout doubling as the progress signal, or
an unobtrusive themed progress affordance on the scrubber itself. Final art
direction is an open question, but "generic floating chip" is ruled out.

MapLibre's own control chrome (nav control, any popups) is styled globally under
`.map-dark` in `src/styles/global.css`; the timeline map container reuses that
class so its controls are not left with default styling.

### Dedicated basemap style (roads on, labels off)

A **dedicated timeline map style**, derived from `public/map-style.json`
(OpenFreeMap dark), tuned so the red is the only thing competing for attention:

- **Keep road networks.** At the **state level**, keep the road layers
  (`highway_minor`, `highway_major_casing`/`_inner`/`_subtle`, `highway_motorway_*`).
  At the **national level**, keep at least major interstates
  (`highway_motorway_subtle` at low zoom + the motorway casing/inner layers,
  which already run from `minzoom: 6`). Roads give the dots geographic anchoring —
  the user must see the network trace real corridors.
- **Hide ALL place/city/state labels** at both levels. Remove the symbol layers:
  `place_other`, `place_suburb`, `place_village`, `place_town`, `place_city`,
  `place_city_large`, `place_state`, `place_country_*`, plus `highway_name_other`,
  `highway_name_motorway`, and `water_name`. The map is a field of red over a road
  skeleton, not a labeled reference map.
- Keep `background`, `water`, `waterway`, boundaries (`boundary_state`,
  `boundary_country_*`) — the coastline and state outlines aid orientation without
  text.

This is a **separate style JSON** (see Components & files), not an edit to the
homepage's `public/map-style.json`, so the homepage map is untouched.

---

## Data architecture

### The reusable dated table

The core artifact is a **compact flat dataset**, one row per camera, keyed by the
existing OSM node IDs:

```
{ lon, lat, m }          // m = first-seen month as an integer, e.g. 202403
   + optional id, dir    // id (OSM node) for cones/debug; dir for cone rotation
```

This single **national** dataset drives **both** scales — SC is just a filtered
view (`lon`/`lat` within SC bounds, or a client-side filter). Optionally also emit
a small **SC-only subset** for a faster first paint (open question).

The table is deliberately **engine-agnostic and reusable**: the same rows can
later render an offline video export without touching the extraction pipeline (see
Out of scope / future).

### Source: OSM first-seen date (a proxy, stated honestly)

The timeline is driven by each camera's **OpenStreetMap first-seen date** — when
its OSM node was first created (version 1 timestamp), truncated to a month. This is
framed honestly as **"documented in OpenStreetMap"** — a *proxy* for real install
dates, never an official registry. See Honest methodology & framing for the
caveats that must appear in the UI and post.

This was chosen over (a) pursuing true install dates and (b) FOIA install-date
callouts — both are out of scope.

### Extraction method — a plan-level decision (with fallback)

A **build step** (peer to `scripts/fetch-camera-data.mjs`, e.g.
`scripts/build-timeline-data.mjs`, a dependency-light Node `.mjs` like the
existing fetch script) resolves the v1 creation date for each OSM node ID and
emits the dated table.

The **exact extraction method is a plan-level decision.** Candidates:

| Method | Notes |
|---|---|
| osmium `.osh.pbf` history extract | Local, deterministic, no rate limits; needs a full-history planet/region extract + the `osmium` tool in the build environment. |
| HeiGIT **ohsome** API | Purpose-built for OSM element history; network dependency + rate limits; good for querying "creation timestamp" per element. |
| OSM node history API | `GET /api/0.6/node/{id}/history`; simplest but ~62k individual calls — must be batched/cached politely, likely too slow for a full rebuild. |

Whichever is chosen, the **output is identical** (`{lon, lat, m}[]`). Document a
**fallback**: if the chosen method is unavailable at build time, the build must
degrade gracefully (e.g. reuse the last committed dated table, or fall back to a
secondary method) rather than break the site build. The starting camera set (node
IDs + current lon/lat/tags) comes from the same Deflock CDN data the site already
uses.

### Encoding & size

- ~62k US cameras → roughly **0.5–1.5 MB** depending on encoding. Object-per-row
  JSON is the fattest; a **compact array/columnar form** (parallel arrays, or
  `[lon, lat, m]` tuples with coordinates rounded to ~5 decimals) is materially
  smaller, and **gzip/brotli** (which Netlify serves) shrinks it further.
- Final encoding is an open question; the plan should pick the smallest form that
  still deserializes cheaply on the client.
- **Lazy-loaded on scroll** — the dataset is fetched only when the map island
  scrolls near the viewport (see Blog embedding), never on initial page load.

### Refresh

The dated-table build **piggybacks on the existing weekly refresh**,
`.github/workflows/refresh-camera-data.yml` (Wednesdays, `0 11 * * 3`). Today that
workflow runs `fetch-camera-data.mjs` + `build-impact-stats.mjs` and commits the
changed artifacts. Add the timeline build as another step and include its output
in the "commit if changed" set.

> **Coordination:** this workflow is also touched by the parallel live-camera-
> counter work — see the Coordination note.

---

## Rendering architecture

### Reuse the map core

Reuse `createMap` from `src/scripts/map/core.ts`, instantiated with
`cooperativeGestures: true` (in-article map, so page scroll must pass through).
`createMap` already returns a `MapHandle` with `resize()`/`destroy()` and sets
`attributionControl: false` + a nav control.

### New unclustered dated layer module

Add a **new** module, e.g. `src/scripts/map/layers/timeline-cameras.ts`, that:

1. Creates a **GeoJSON source from the dated dataset** (its own source; it does
   **not** reuse the `cameras` source, `addCameraLayers`, or the viewport
   `tile-loader.ts` — those are clustered and viewport-driven). No `cluster: true`.
2. Renders a **glow circle layer + solid dot layer** with **zoom-interpolated
   radius** and a red glow, filtered by a data expression on the cutoff month:
   `["<=", ["get", "m"], cutoff]`.
3. At high zoom, shows a **camera-cone symbol layer** (also `m`-filtered),
   toggled by zoom-based layer visibility, reusing `createConeImage` (via
   `map.addImage`) and `parseDirection` for `icon-rotate`. Below the threshold the
   cone layer is hidden and the dot layers show.

The module owns only its own layers; it knows nothing about the scrubber or intro
(those drive it through a small imperative API, e.g. `setCutoff(m)` and
`fitTo('national' | 'sc')`).

### Scrubber updates a cutoff filter (cheap)

The scrubber sets `cutoff` and the module updates the layers' **filter** (or a
paint expression). This is a **cheap filter/paint update — no per-frame refetch and
no `setData`** on tick; the full dataset is loaded once via `setData` at init, and
playback only changes the cutoff. This is what makes 62k dots animate smoothly.

For the **bloom-in** effect, prefer a paint-expression approach (e.g. a short
opacity ramp keyed off how recently `m` crossed the cutoff) over per-dot JS
animation, to stay performant at national scale. Exact technique is an
implementation detail.

### Guided intro drives camera + cutoff

The guided intro is an orchestration layer that advances `cutoff` on a timer and
issues `map.easeTo`/`flyTo` for the national→SC move, then releases control. It
uses the module's **own dated dataset via `setData`** and does **not** use the
viewport tile-loader. Any user interaction cancels it.

### Build gotcha

The **es2022 build target** in `astro.config.mjs` (`esbuild`, `build`,
`optimizeDeps`) is mandatory for maplibre's blob workers and already set — the
timeline layer inherits it. Do not regress it.

---

## Blog embedding architecture

### MDX is not installed — use the marker-div precedent

MDX is **not** installed and adding it is the heaviest option; avoid it. The blog
collection is markdown-only (`src/content.config.ts`: `glob('**/*.md')`), and
`src/pages/blog/[...slug].astro` renders `<Content />` inside
`.prose prose-invert`.

**Recommended pattern** (extends the existing `data-open-action` precedent — a
raw-HTML `<button data-open-action>` written directly into `.md` and picked up by a
global querySelectorAll script, already used across 10 posts):

1. The post author writes a **raw-HTML marker** directly in the `.md` file, inside
   a `not-prose` wrapper so typography styles don't fight the map chrome:

   ```html
   <div class="not-prose">
     <div data-timeline-map data-default-scale="sc"></div>
   </div>
   ```

2. A **processed island script, gated to just that post**, initializes the map
   only where the marker exists. Two gating options (plan-level choice):
   - a **frontmatter flag** (add `timelineMap: z.boolean().optional()` to the blog
     schema in `src/content.config.ts`, and conditionally include the island in
     `[...slug].astro`), or
   - a **body check** in `[...slug].astro`: `post.body.includes('data-timeline-map')`
     (`post.body` is already read there for read-time). No schema change.

3. The island uses an **IntersectionObserver (`rootMargin: '200px'`)**, exactly
   like `MapSection.astro`, to **lazy dynamic-import** the map only when it scrolls
   near view:
   - `import('maplibre-gl/dist/maplibre-gl.css')`
   - `import('../scripts/map/core.js')`
   - `import('../scripts/map/layers/timeline-cameras.js')`
   - then fetch the dated dataset.

### Chunk reuse (maplibre is not duplicated)

Because the import specifiers (`maplibre-gl`, `../scripts/map/core.js`) **match**
the homepage camera map's, Vite reuses the **same code-split chunks** —
maplibre-gl (~200KB+) is **not** duplicated across the homepage bundle and the
blog bundle. Keep the specifiers identical to preserve this.

### Build gotchas to carry over

- **es2022 target** (above) — required for maplibre workers.
- Map chrome is styled globally under `.map-dark` in `src/styles/global.css`; the
  timeline container reuses `.map-dark` so MapLibre controls/popups are themed.
- Keep the map marker inside `not-prose` so `.prose` typography rules
  (list/paragraph spacing, external-link `::after` glyphs) don't leak into the map
  UI.

---

## Components & files

| File | New/Mod | Single responsibility |
|---|---|---|
| `scripts/build-timeline-data.mjs` | **New** | Build step: resolve OSM v1 first-seen month per node, emit the compact dated table. Peer to `fetch-camera-data.mjs`. |
| `public/timeline-cameras.json` (+ optional `timeline-cameras-sc.json`) | **New** | The baked dated dataset artifact(s): `{lon,lat,m}` rows (national; optional SC subset for faster first paint). |
| `public/timeline-map-style.json` | **New** | Dedicated basemap style derived from `map-style.json`: roads on, all place/road-name labels off. |
| `src/scripts/map/layers/timeline-cameras.ts` | **New** | Unclustered dated layer module: GeoJSON source + glow/dot layers (zoom-scaled radius, `m`≤cutoff filter) + high-zoom cone layer; `setCutoff`/`fitTo` API. |
| `src/scripts/map/timeline-controller.ts` (name TBD) | **New** | Orchestration: scrubber state, play/pause timer, guided intro (cutoff + camera moves), reduced-motion branch, wiring to DaisyUI chrome. |
| `src/components/TimelineMap.astro` (or an inline island in `[...slug].astro`) | **New** | The blog island: DaisyUI-branded chrome markup (`join`/`btn`/`range`/`badge`) + IntersectionObserver lazy-import + dataset fetch. Renders where `[data-timeline-map]` is present. |
| `src/content/blog/<host-post>.md` | **New/Mod** | The host post: narrative + honest-methodology paragraph + the `data-timeline-map` marker div. (New post vs. existing post is an open question.) |
| `src/pages/blog/[...slug].astro` | **Mod** | Conditionally include the timeline island (frontmatter flag or `post.body.includes` gate). |
| `src/content.config.ts` | **Mod (if flag chosen)** | Add optional `timelineMap` boolean to the blog schema. |
| `src/styles/global.css` | **Mod (if needed)** | Any timeline-specific chrome tweaks not covered by DaisyUI + `.map-dark`. |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Add the timeline-data build step; include its output in the commit-if-changed set. |
| `astro.config.mjs` | **No change expected** | es2022 target already set; no new proxy needed (dataset is a static `public/` asset). |

---

## Honest methodology & framing

The proxy nature of the data must be surfaced **twice**:

1. **In the feature UI** — a short methodology note attached to the map (e.g. a
   line under the readout, or a small themed info affordance): dates reflect when
   each camera was **documented in OpenStreetMap**, a proxy for real install dates.

2. **In the post body** — a fuller methodology paragraph stating the caveats
   plainly:
   - OSM creation date **lags** real installation (a camera exists before a
     volunteer maps it), so the timeline is a **lower bound** on install dates.
   - **Volunteer mapping campaigns can add a backlog in a single month**, creating
     **artificial spikes** that reflect mapping activity, not installation activity.
   - This is **not an official registry**; it is community-sourced documentation
     (Deflock.org / OpenStreetMap).

The framing is "watch the *documented* network grow," which is both honest and
still damning — the growth is real even if the dates are approximate.

---

## Implementation sequencing / checkpoints

1. **Build the REAL dated dataset first, and validate placement against truth.**
   Produce `public/timeline-cameras.json` from real OSM first-seen dates, then
   sanity-check the dots on a throwaway render. The expectation: real ALPR data
   should trace **road corridors between cities**, not tidy metro blobs like the
   illustrative mockup. Only revisit placement/data if it still looks wrong after
   seeing the real data — do not pre-optimize against the mockup's fiction.
2. **Rendering layer** — the unclustered dated layer module: glow/dot layers,
   zoom-scaled radius, `m`≤cutoff filter, high-zoom cone resolve.
3. **Dedicated basemap style** — `timeline-map-style.json` (roads on, labels off).
4. **Hybrid guided intro + DaisyUI scrubber/chrome** — controller, play/pause,
   monthly range, readout, national⇄SC toggle, intro fly-through, interrupt.
5. **Blog embedding** — marker div, gated lazy island, chunk-reuse verification.
6. **Accessibility + reduced-motion + mobile** — reduced-motion static present-day
   view, keyboard-operable controls, 375px layout with no horizontal scroll.
7. **Optional / future** — offline video export from the same dated table.

Each checkpoint is independently verifiable; step 1 is the gate — if the real data
doesn't tell the story, the rest is premature.

---

## Testing & verification

- **Browser preview** via the dev server (`npm run dev`) — verify bloom-in, the
  national→SC intro, scrub in both directions, the toggle, and zoom→cone
  resolution. (Netlify redirects don't run under `astro dev`, but the dataset is a
  static `public/` asset, so no proxy parity issue here — unlike the tile loader.)
- **Reduced motion** — with `prefers-reduced-motion: reduce`, confirm no autoplay,
  present-day network shown, all controls still usable.
- **Mobile 375px** — no horizontal page scroll; chrome stacks/shrinks; cooperative
  gestures let the page scroll past the map.
- **Dataset build determinism** — running `build-timeline-data.mjs` twice on the
  same OSM input yields byte-identical output (so the weekly workflow's
  commit-if-changed check is meaningful and doesn't churn).
- **maplibre chunk sharing** — inspect the production build to confirm the
  maplibre-gl chunk is **shared**, not duplicated, between the homepage map and the
  blog island (identical import specifiers).
- **Placement sanity vs. real data** — the checkpoint-1 truth check: dots follow
  road corridors, SC density matches known deployment (Upstate-heavy), no obvious
  geocoding artifacts.

---

## Out of scope / YAGNI

- **Homepage version** of the timeline map (explicitly superseded by the
  blog-embedded decision; may be adapted later).
- **National choropleth** — an earlier national-scale choropleth idea is dropped;
  both scales are the same glowing dots.
- **FOIA install-date enrichment** — no pursuit of true install dates; the OSM
  first-seen proxy is the deliberate, stated choice.
- **Per-state dot drill-down** for states other than SC — national and SC are the
  only two framings; no per-state UI.
- **Video export as a v1 requirement** — the dated table is designed to make an
  offline video *possible* later, but shipping a video is not part of v1.
- **MDX** — not installing MDX; the marker-div + gated-island pattern replaces it.

---

## Open questions

1. **Exact OSM extraction method** — osmium history extract vs. ohsome API vs.
   node history API (with a documented fallback). Output is identical regardless.
2. **Which post hosts it** — a new dedicated post vs. an existing post.
3. **SC-subset artifact** — ship a separate `timeline-cameras-sc.json` for a
   faster first paint, or filter the one national table client-side?
4. **Final dataset encoding/size** — object rows vs. compact tuples/columnar;
   coordinate precision; measure gzipped size.
5. **Guided-intro pacing & art direction** — duration, easing, where the
   national→SC transition lands in the timeline, and the exact branded intro
   indicator (the generic floating chip is rejected).
6. **Reduced-motion default framing** — SC or national for the static present-day
   view.

---

## Coordination note

This work is isolated in the **`dc-timeline-map`** worktree on branch
**`feature/surveillance-timeline-map`**.

A **parallel session** is running in the **`dc-live-counter`** worktree on branch
**`feature/live-camera-counter`**, building a live camera counter. **Both features
may touch the shared camera-data pipeline** — specifically:

- `.github/workflows/refresh-camera-data.yml` (both may add build steps / commit
  entries),
- `src/data/impact-stats.json` and `scripts/build-impact-stats.mjs` (the counter
  likely reads/writes impact stats; the timeline build is added to the same
  workflow),
- the Deflock CDN data source the timeline build seeds from.

**Coordinate to avoid merge conflicts** on the workflow file and the impact-stats
artifacts — ideally land one branch's pipeline change first and rebase the other,
or agree on a single combined workflow edit. Flag any pipeline change in the PR
description so the other branch can rebase cleanly.

---

## Appendix: approved brainstorming mockup

The design was approved against a brainstorming mockup. **The mockup is
illustrative only:** it uses **fabricated dates** and a **canvas fake** of the map
(not a real basemap), and its bloom pattern shows tidy metro blobs rather than the
road-corridor spread real data should show. The real build uses **live MapLibre**
with the **real dated dataset** (checkpoint 1). Treat the mockup as a mood/interaction
reference for the *feel* (dark map going red, scrubber + readout, national→SC
zoom), not as a source of truth for data placement or the intro indicator (the
mockup's floating chip is explicitly rejected).
