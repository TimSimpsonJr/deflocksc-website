# Surveillance Timeline Map — Design Spec

**One-line summary:** An animated, interactive MapLibre map embedded in a blog post where red glowing dots — one per ALPR camera — bloom in over time (≈Jan 2020 → present) as a scrubber advances, showing the surveillance network spreading nationally, then zooming into South Carolina.

**Date:** 2026-09-04
**Status:** Design — approved in brainstorming; incorporates an accepted
visual-design review pass (see Appendix).
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

**Blog-post-embedded feature**, hosted in a **dedicated, newly authored blog
post** (subject/topic TBD — the *placement* is decided, the post's subject is
not). The map lives inline in this new published blog post (`src/content/blog/*.md`),
rendered through the existing blog pipeline (`src/pages/blog/[...slug].astro`). The
post body carries the narrative and the honest-methodology paragraph; the map is an
interactive figure inside it.

**Superseded:** an earlier brainstorm idea placed this as a homepage section. That
is explicitly **superseded** by the blog-embedded decision. A homepage adaptation
is listed under Out of Scope, not built now.

Scope of this doc: the data build, the render layer, the basemap style, the
in-article chrome, and the blog-embedding mechanism for **one** host post. Not a
generic reusable Astro component library, not a homepage integration.

---

## User experience

### Hybrid: guided intro → free exploration

**Trigger = visibility, not island load.** The guided intro fires when the map
becomes **substantially visible in the viewport** — not merely when the lazy island
loads. (The island lazy-imports ahead of the viewport via `rootMargin` — see Blog
embedding — so "loaded" and "on screen" are *different moments*; the intro must wait
for the latter so the viewer actually sees the map go red from the start rather than
arriving mid-animation.) Use a separate, tighter IntersectionObserver threshold (the
map mostly in view) to start playback, distinct from the load-ahead observer.

Once substantially visible (and unless `prefers-reduced-motion`), the map
**autoplays a guided intro**:

1. Start national, near-empty (early-2020 cutoff), dark.
2. Advance the timeline — dots bloom in across the US as the cutoff month
   increases. National scale, small dots.
3. Smoothly fly/ease into South Carolina (`map.flyTo`) while the timeline
   continues, so SC fills in under the viewer's eye.
4. **End on a deliberate held frame** — the map holds, framed on South Carolina with
   the full network shown; the **counter finishes rolling up** to the present-day
   total; and the **methodology line fades in beneath it**. This held frame is
   designed to be the **shareable screenshot**.

**Pacing (shape set; exact durations/easing plan-level).** Keep the full intro
**under ~25 seconds**, with **non-uniform easing**:

- **Linger 2–3 beats** on the sparse **2020 opening** (the near-empty map is the
  baseline the viewer measures growth against). The real data is **genuinely sparse
  pre-2024 and surges in 2025–26** (first-seen by year: 2020: 72, 2021: 50, 2022:
  258, 2023: 801, 2024: 6,638, 2025: 58,544, 2026: 64,239), so the full Jan-2020 →
  present range is kept and this linger now **literally shows the quiet before the
  surge** — the empty 2020 map is real, not a staged pause.
- **Accelerate through the middle years** as density builds.
- **Begin the national→SC fly-through in roughly the last ~18 months** of the
  timeline, so **SC fills in *after* arrival** — the viewer lands on their state and
  then watches it go red, rather than arriving to a finished map.

When the intro finishes, **unlock free exploration**: the scrubber, pan/zoom, and
a National ⇄ South Carolina control all become live. The intro can be interrupted
by any user interaction (scrub, pan, zoom, toggle, or a Skip control), which stops
autoplay and hands over control immediately. After the intro ends (whether it played
out or was skipped), offer a **replay affordance** (a themed "Replay intro" control)
so a viewer can watch the network go red again.

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

**Cones must not de-escalate the threat.** Keep each cone's **center dot at full dot
intensity** (a bright, solid-red core) when the cone resolves, so zooming into your
own street does **not** feel *calmer* than the national view. The cone adds
direction; it must not trade away the menace of the point.

### Reduced motion

Under `prefers-reduced-motion: reduce`: **no autoplay, no fly-through.** The map
loads showing the present-day full network (cutoff = latest month), **framed on
South Carolina**. All controls remain fully usable — the user can still scrub back
through time manually and pan/zoom, and National is one toggle away. Nothing is
disabled; only the automatic motion is suppressed.

**Default framing is South Carolina** for both the reduced-motion static view and
the **post-intro resting state**: the audience is South Carolina, so the map should
rest on SC and let a viewer opt into the national view via the toggle, rather than
the reverse.

### Mobile

- The map is an in-article figure, so it uses `cooperativeGestures: true` (see
  Rendering architecture) — one-finger scroll moves the page past the map;
  two-finger gestures pan/zoom the map. This matches the events map's behavior.
- Chrome (toggle, play, scrubber, readout) must stack/shrink to fit a 375px
  viewport with no horizontal page scroll.
- The guided intro still autoplays on mobile (motion-permitting); it is the
  primary payload for a reader who never touches the controls.
- **Enforce a minimum dot-radius floor on small (≤375px) viewports** (a slightly
  larger, brighter solid-red core), so national-zoom dots stay perceptible on a phone
  screen. On mobile the intro *is* the whole payload — if the national-scale dots
  shrink below perceptibility, the growth story is lost — so the zoom-interpolated
  radius must not fall under a floor at small viewport widths. Legibility here comes
  from dot **size** and solid-red brightness, not a glow.

---

## Visual design

### Dark ground, solid red

> **Revision (2026-09-04, dot styling):** the earlier "glow must carry brightness"
> guidance below is **superseded**. Settled/accumulated dots render **solid red
> (source-over), never white**; there is **no persistent glow**. The additive
> (`globalCompositeOperation: 'lighter'`) pile-up that turns dense areas white is
> **rejected**. White/brightness is reserved for the brief per-dot **arrival flare**
> only. Colorblind legibility now comes from **bright solid red + dot size** (the
> grayscale/squint test still applies), not from a glow.

- **Basemap:** dark (the site's `#171717` ground), deliberately low-contrast so
  the red reads as the only "live" thing on the map.
- **Dots:** surveillance **red**, leaned **brighter** (toward `#ef4444`) — a bright,
  **solid** red core over the `#dc2626` end of the palette, composited
  **source-over** so overlapping dots deepen into denser *red*, **never white**.
  There is **no persistent glow layer**: a settled camera is a hard red point, full
  stop. Legibility on dim screens and for **red-colorblind (protanope) viewers**
  comes from the **bright solid red plus dot size**, verified by the grayscale/squint
  test — not from a luminous halo.
- **Radius scales with zoom:** small when zoomed out (to fight national crowding
  where ~130k dots overlap) and larger when zoomed in. Implemented as a
  zoom-interpolated `circle-radius`; dot **size** (with the mobile floor) is what
  carries legibility at national scale.
- **Bloom-in — hot flare, then cool to solid red:** when a dot first crosses the
  cutoff month it briefly **flares hot** (a near-white / amber core) and then
  **cools** to the standard **solid** surveillance red over a short ramp, so a new
  camera *arrives* rather than just popping. **Why this matters:** dense metros
  saturate solid red early, so a plain appear-ramp makes the animation stop visibly
  changing exactly where surveillance is worst — while the running counter keeps
  climbing. This was the review's **top concern**; the hot flare keeps growth legible
  even inside already-red clusters, because each new arrival flashes bright **for that
  one dot** before settling into the red field. The flare is the **only** place
  white/brightness appears — a transient per-arrival effect, not an accumulating glow.
  Implementation technique (a paint expression keyed off how recently `m` crossed the
  cutoff) is a detail only — see Rendering architecture; a paint-driven approach is
  preferred over per-dot animation at ~130k dots.
- **Cones:** at high zoom, the existing red directional cone (`createConeImage`,
  an 80×80 canvas wedge in `rgba(239,68,68,0.45)` with an `#ef4444` center dot)
  resolves at the dot, date-filtered the same way; the **center dot stays a
  full-intensity solid-red core**.

**Restraint is what makes it read as threat, not decoration.** The threat register
depends on discipline: **hard, small, solid-red dot cores** and **dead-dark
everything else**. The red spreads and deepens, but each camera stays a sharp point —
a pretty, diffuse glow-scape would read as ambience, not surveillance, and an additive
white pile-up would erase the very density it should indict. When in doubt, keep the
dot solid, tighten it, and darken everything else.

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
| Guided-intro indicator | **camera-OSD readout** (amber, monospaced/tabular) + scrubber-thumb progress + `btn` "Skip →" (see below) |

**Guided-intro indicator — a camera-OSD treatment.** The brainstorm mockup used a
floating chip that read as generic/AI-ish; it is **rejected**. In its place, the
intro state is communicated with a surveillance-flavored **camera on-screen-display
(OSD)** treatment:

- The **live-advancing scrubber thumb doubles as the progress signal** — as the
  intro plays, the thumb visibly travels the timeline, so the scrubber itself shows
  how far along the intro is (no separate progress widget needed).
- An **amber, camera-OSD-style readout** (monospaced, tabular-nums, terse) shows
  the current **date and running count** during the intro — styled like the burned-in
  status text of a security-camera feed rather than a UI label.
- A themed DaisyUI **"Skip →" button** lets the viewer hand themselves control
  immediately.

**On intro end**, the readout **shifts from amber to neutral** and the controls'
**active states light up** (the scrubber, play/pause, and National ⇄ SC toggle
read as "now live"), signalling the handover to free exploration.

**Rejected:** a pulsing red dot / "REC" idiom was considered and ruled out as too
on-the-nose. The OSD readout carries the surveillance flavor without the cliché.

This resolves the **indicator** half of the guided-intro open question (pacing/art
direction otherwise; see Open questions).

MapLibre's own control chrome (nav control, any popups) is styled globally under
`.map-dark` in `src/styles/global.css`; the timeline map container reuses that
class so its controls are not left with default styling.

### Dedicated basemap style (roads on, labels mostly off; city labels gated to high zoom)

A **dedicated timeline map style**, derived from `public/map-style.json`
(OpenFreeMap dark), tuned so the red is the only thing competing for attention:

- **Keep road networks.** At the **state level**, keep the road layers
  (`highway_minor`, `highway_major_casing`/`_inner`/`_subtle`, `highway_motorway_*`).
  At the **national level**, keep at least major interstates
  (`highway_motorway_subtle` at low zoom + the motorway casing/inner layers,
  which already run from `minzoom: 6`). Roads give the dots geographic anchoring —
  the user must see the network trace real corridors.
- **Labels: off during the intro and at national/mid zoom; faint city labels only
  when zoomed in.** Place/city/state labels stay **off** through the guided intro
  and at national and mid zoom. **Faint, muted city labels fade in *only* at
  high/local zoom during free exploration** (around or just before the cone-resolve
  threshold), so a viewer can locate their own town once they've zoomed in. State
  and place labels stay **off at national scale**. Concretely: rather than removing
  the place-label symbol layers outright, **gate the city labels (`place_city`,
  `place_city_large`, and the smaller `place_town`/`place_village`/`place_suburb`
  tiers as appropriate) to high zoom with a muted style** (low-opacity, desaturated
  text, minimal halo); keep `place_state`, `place_country_*`, and `place_other` off.
  **Keep the other label removals**: road-name labels off (`highway_name_other`,
  `highway_name_motorway`) and water labels off (`water_name`). The map stays a
  field of red over a road skeleton at every scale that matters for the argument,
  gaining just enough labeling to be self-locating up close.

  > **Revision:** this reverses the initial "hide *all* place/city/state labels
  > everywhere" call, per user decision — the only change is that muted city labels
  > are now allowed at high/local zoom.
- Keep `background`, `water`, `waterway`, boundaries (`boundary_state`,
  `boundary_country_*`) — the coastline and state outlines aid orientation without
  text.

This is a **separate style JSON** (see Components & files), not an edit to the
homepage's `public/map-style.json`, so the homepage map is untouched.

---

## Data architecture

### The reusable dated table

The core artifact is a **compact flat dataset**, one row per camera:

```
{ lon, lat, m, dir }     // m = first-seen month as an integer, e.g. 202403
                         // dir = facing direction in degrees, or null (for cones)
```

It is one row per **continental ALPR node in OpenStreetMap** — the dataset is built
directly from OSM element history (see Source, below): ~**130,602** rows, **100%
dated**. It ships as a **compact binary** (`public/timeline-cameras.bin`) encoded via
a shared codec; the browser decodes it into typed arrays (see Encoding & size).

This single **national** dataset drives **both** scales — SC is just a **client-side
filtered view** (`lon`/`lat` within SC bounds). **Resolved:** there is **no separate
SC-only artifact**; the one national `.bin` is lazy-loaded and filtered in the client.

The table is deliberately **engine-agnostic and reusable**: the same rows can
later render an offline video export without touching the extraction pipeline (see
Out of scope / future).

### Source: OSM first-seen date (a proxy, stated honestly)

The timeline is driven by each camera's **OpenStreetMap first-seen date** — the
earliest `@validFrom` across its OSM node's versions (its creation), truncated to a
month and floored to the Jan-2020 timeline start. Position is the node's **current
centroid** (its latest version) and direction comes from that latest version's tags.
This is framed honestly as **"documented in OpenStreetMap"** — a *proxy* for real
install dates, never an official registry. See Honest methodology & framing for the
caveats that must appear in the UI and post.

This was chosen over (a) pursuing true install dates and (b) FOIA install-date
callouts — both are out of scope.

### Extraction method — RESOLVED: ohsome element history (built directly)

A **build step** (`scripts/build-timeline-data.ts`, an esbuild-bundled TS run via
`npm run build-timeline-data`, the same idiom as `fetch-camera-data.ts` /
`build-impact-stats.ts`) queries OSM element history and emits the dated table.

**Resolved (Checkpoint 1):** the method is the **HeiGIT ohsome API**
(`/elementsFullHistory/centroid`), queried over macro-bboxes covering the lower 48
(`man_made=surveillance and surveillance:type=ALPR and type:node`, adaptively
subdividing a bbox into quadrants when a dense full-history response fails). For
each returned node: `m` = the **earliest `@validFrom`** across its versions
(first-seen, floored to Jan 2020); `lon`/`lat` = the **latest version's centroid**;
`dir` = parsed from that latest version's tags. The ohsome query's time-interval
**end date is derived from ohsome's metadata temporal extent** (`GET /metadata` →
`extractRegion.temporalExtent.toTimestamp`), **not `today`** — the OSM-history data
lags real time, and requesting an end beyond its coverage 404s every region.

**The dataset is built ENTIRELY from ohsome — it no longer seeds from the DeFlock
CDN snapshot** (`public/camera-data.json`), and it no longer runs the shared
`assertValidCameraPayload` validator (the timeline does not consume the DeFlock
snapshot anymore, reversing the #118-retarget's "reuse the shared validator"
decision). *Rationale:* the committed DeFlock snapshot is only the Southeast 20° CDN
tile (bbox lon −100..−80, lat 20..40), which **clips SC's own coast** (Myrtle Beach
entirely, Charleston partially) and covers no West Coast / Northeast. The ohsome
query returns **all continental ALPR nodes** (~130,602), so building directly from
it yields a **true national dataset with full SC coverage**.

*Alternatives considered:* an `osmium` `.osh.pbf` full-history extract (local,
deterministic, no rate limits, but needs a multi-GB extract + the `osmium` binary,
confirmed absent on this machine) and the OSM node history API (`GET
/api/0.6/node/{id}/history`, ~one call per node — too slow). Output format is
identical, so `osmium`-in-CI remains an upgrade path.

**Fallback:** if ohsome is unreachable/errors or yields zero rows, the build
**reuses the last committed `public/timeline-cameras.bin`** and exits 0 so the site
build never breaks (`chooseOutput`).

### Encoding & size — RESOLVED: compact binary

- **Format: a compact little-endian binary** (`public/timeline-cameras.bin`),
  ~**1.37 MB** for the ~130,602 rows, produced and consumed via a **shared codec**
  `src/lib/timeline-codec.ts` (`encodeTimelineTable` / `decodeTimelineTable`). It is
  a structure-of-arrays packing: a **16-byte header** (`TLC1` magic + `uint16`
  version + `uint32` count), then columns — `Int32` lon×1e5, `Int32` lat×1e5,
  `Uint16` direction (`0xFFFF` = null), `Uint8` month-index (from Jan 2020). Total =
  `16 + 11N` bytes. This replaces the earlier columnar-JSON idea (resolves the
  encoding open question).
- The browser **decodes the `.bin` via the codec** — fetch as an `ArrayBuffer` →
  `decodeTimelineTable` → build the GeoJSON source. `decodeTimelineTable` returns
  typed arrays (`Float64Array` lon/lat, `Int32Array` m, `Int16Array` dir with `-1`
  for null), so no per-row JSON parse is needed. **gzip/brotli** (which Netlify
  serves) shrinks the binary further on the wire.
- **Lazy-loaded on scroll** — the dataset is fetched only when the map island
  scrolls near the viewport (see Blog embedding), never on initial page load.

### Refresh

The dated-table build **piggybacks on the existing daily refresh**,
`.github/workflows/refresh-camera-data.yml` (daily, `0 11 * * *` — rewritten to
daily by #118). That workflow runs `npm run fetch-camera-data` + `npm run
build-impact-stats` (esbuild-bundled TS) and commits the changed artifacts. Add
`npm run build-timeline-data` as another step and include `public/timeline-cameras.bin`
in the "commit if changed" set. A small binary delta is cheap, so the daily cadence
is kept unchanged.

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

1. Creates a **GeoJSON source from the decoded dated dataset** (the client fetches
   `timeline-cameras.bin` as an `ArrayBuffer` and runs `decodeTimelineTable` first;
   its own source, it does **not** reuse the `cameras` source, `addCameraLayers`, or
   the viewport `tile-loader.ts` — those are clustered and viewport-driven). No
   `cluster: true`.
2. Renders a **solid dot layer** (source-over red, **no persistent glow**) with
   **zoom-interpolated radius** and the arrival-flare paint, filtered by a data
   expression on the cutoff month: `["<=", ["get", "m"], cutoff]`.
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
playback only changes the cutoff. This is what makes ~130k dots animate smoothly.

For the **bloom-in** effect — a **hot flare that cools to solid red** (see Visual
design) — prefer a **paint-expression approach** (an interpolation keyed off how
recently `m` crossed the cutoff, ramping the **fill** color from a near-white/amber
core down to the standard solid red) over per-dot JS animation, to stay performant at
national scale. Driving color-through-time this way is what keeps new arrivals visible
inside already-saturated metros without touching `setData` per frame — and it keeps
brightness confined to the transient flare rather than an accumulating glow. Exact
technique is an implementation detail.

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
   - `import('../lib/timeline-codec.js')`
   - then **fetch `timeline-cameras.bin` as an `ArrayBuffer` and `decodeTimelineTable`**
     it into typed arrays.

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
| `scripts/build-timeline-data.ts` | **New** | Build step (esbuild-bundled TS, `npm run build-timeline-data`): query OSM element history via ohsome, reduce each node to `{lon,lat,m,dir}`, encode to the binary via the shared codec. Peer to `fetch-camera-data.ts`. |
| `src/lib/timeline-codec.ts` (+ `timeline-codec.test.ts`) | **New** | Shared, dependency-free binary codec (`encodeTimelineTable`/`decodeTimelineTable`): the on-disk `.bin` format defined in one place — Node build encodes, browser decodes. |
| `public/timeline-cameras.bin` | **New (generated)** | The baked dated dataset: a compact binary (`16 + 11N` bytes, ~1.37 MB) of `{lon,lat,m,dir}` rows (national; SC is a client-side filter — no separate SC artifact). |
| `public/timeline-map-style.json` | **New** | Dedicated basemap style derived from `map-style.json`: roads on; road-name/water labels off; city labels gated to high zoom, muted; state/country labels off. |
| `src/scripts/map/layers/timeline-cameras.ts` | **New** | Unclustered dated layer module: GeoJSON source (from the decoded `.bin`) + solid dot layer (zoom-scaled radius, arrival-flare paint, `m`≤cutoff filter) + high-zoom cone layer; `setCutoff`/`fitTo` API. |
| `src/scripts/map/timeline-controller.ts` (name TBD) | **New** | Orchestration: scrubber state, play/pause timer, guided intro (cutoff + camera moves), reduced-motion branch, wiring to DaisyUI chrome. |
| `src/components/TimelineMap.astro` (or an inline island in `[...slug].astro`) | **New** | The blog island: DaisyUI-branded chrome markup (`join`/`btn`/`range`/`badge`) + IntersectionObserver lazy-import + dataset fetch. Renders where `[data-timeline-map]` is present. |
| `src/content/blog/<host-post>.md` | **New** | The host post: a newly authored, dedicated post (subject TBD) carrying the narrative + honest-methodology paragraph + the `data-timeline-map` marker div. |
| `src/pages/blog/[...slug].astro` | **Mod** | Conditionally include the timeline island (frontmatter flag or `post.body.includes` gate). |
| `src/content.config.ts` | **Mod (if flag chosen)** | Add optional `timelineMap` boolean to the blog schema. |
| `src/styles/global.css` | **Mod (if needed)** | Any timeline-specific chrome tweaks not covered by DaisyUI + `.map-dark`. |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Add the `npm run build-timeline-data` step; include `public/timeline-cameras.bin` in the commit-if-changed set. |
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

**The 2025–26 surge is substantially real, not merely a mapping artifact.** The
sharp rise in first-seen dates through 2025–26 reflects **both** a real acceleration
in ALPR **deployment** during the same window **and** OpenStreetMap documentation
catching up. Keep the "documented in OpenStreetMap (a proxy for install dates)"
honesty and the caveats above — but do **not** frame the surge as *only* a
documentation gap: real installations ramped sharply in this period, so the growth
the map shows is substantially real.

The framing is "watch the *documented* network grow," which is both honest and
still damning — the growth is real (and largely real-world), even if the exact dates
are approximate.

---

## Implementation sequencing / checkpoints

1. **Build the REAL dated dataset first, and validate placement against truth.**
   Produce `public/timeline-cameras.bin` directly from OSM element history (ohsome),
   then sanity-check the dots on a throwaway render. The expectation: real ALPR data
   should trace **road corridors between cities**, not tidy metro blobs like the
   illustrative mockup. Only revisit placement/data if it still looks wrong after
   seeing the real data — do not pre-optimize against the mockup's fiction.
   *(Done — Checkpoint 1 gate passed: ~130,602 rows, 100% dated, full continental +
   SC coverage.)*
2. **Rendering layer** — the unclustered dated layer module: solid dot layer
   (arrival-flare paint, no persistent glow), zoom-scaled radius, `m`≤cutoff filter,
   high-zoom cone resolve.
3. **Dedicated basemap style** — `timeline-map-style.json` (roads on, labels off except muted high-zoom city labels).
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
- **Dataset build determinism** — running `build-timeline-data` twice on the
  same OSM input yields byte-identical `.bin` output (deterministic row sort +
  fixed-point codec), so the daily workflow's commit-if-changed check is meaningful
  and doesn't churn.
- **maplibre chunk sharing** — inspect the production build to confirm the
  maplibre-gl chunk is **shared**, not duplicated, between the homepage map and the
  blog island (identical import specifiers).
- **Placement sanity vs. real data** — the checkpoint-1 truth check (**passed**):
  dots follow road corridors, SC density matches known deployment (Upstate-heavy),
  no obvious geocoding artifacts; ~130,602 rows, 100% dated, full continental + SC.
- **Grayscale + squint (colorblind/contrast) test** — with color removed
  (grayscale) and/or eyes squinted, the map must still read as **spreading red** as
  the timeline advances. Legibility comes from **bright solid red + dot size**, not a
  glow (see Visual design): if the growth is only legible in full color, raise the
  dots' brightness/size — do not add a persistent glow.

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

1. **Exact OSM extraction method** — **RESOLVED (Checkpoint 1):** HeiGIT **ohsome**
   `/elementsFullHistory/centroid`, built **directly** (not seeded from the DeFlock
   snapshot, no `assertValidCameraPayload`), with the time-interval end derived from
   ohsome's metadata temporal extent and a reuse-last-committed-`.bin` fallback.
   `osmium`-in-CI remains an identical-output upgrade path.
2. **Post subject/topic** — TBD (placement as a standalone new post is decided).
3. **SC-subset artifact** — **RESOLVED:** a **single national `.bin`** filtered
   **client-side** for the SC view; no separate SC artifact.
4. **Final dataset encoding/size** — **RESOLVED:** a compact **binary**
   (`timeline-cameras.bin`, `16 + 11N` bytes, ~1.37 MB) via the shared
   `timeline-codec.ts`; lon/lat as `Int32`×1e5 (~1.1 m), `Uint16` direction,
   `Uint8` month index.
5. **Guided-intro pacing (durations/easing only)** — the intro's **shape is set**
   (under ~25s total; non-uniform easing that lingers on the sparse 2020 opening,
   accelerates through the middle years, and begins the national→SC fly-through in
   roughly the last ~18 months of the timeline; a replay affordance after it ends).
   Only the **exact durations and easing curves** remain plan-level. The intro
   **indicator is resolved** (camera-OSD readout + scrubber-thumb progress + "Skip →";
   see Visual design).
6. **Reduced-motion default framing** — **resolved: South Carolina** (also the
   post-intro resting-state framing; national is one toggle away). See Reduced
   motion.

---

## Coordination note

This work is isolated in the **`dc-timeline-map`** worktree on branch
**`feature/surveillance-timeline-map`**.

A **parallel session** is running in the **`dc-live-counter`** worktree on branch
**`feature/live-camera-counter`**, building a live camera counter. **Both features
may touch the shared camera-data pipeline** — specifically:

- `.github/workflows/refresh-camera-data.yml` (both may add build steps / commit
  entries),
- `src/data/impact-stats.json` and `scripts/build-impact-stats.ts` (the counter
  likely reads/writes impact stats; the timeline build is added to the same
  workflow).

The timeline build **no longer seeds from the DeFlock CDN snapshot** — it sources its
rows directly from OSM element history via ohsome (see Extraction method), so it
shares only the workflow file and `package.json` with the counter, not the camera
data source.

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

**Visual-design review pass.** This spec incorporates the changes from a subsequent
visual-design review that the user accepted — notably the hot-flare temporal
encoding, the camera-OSD intro indicator, the colorblind/brightness and restraint
guidance, the visibility-triggered intro with a held final frame, the high-zoom
muted city labels, and the South Carolina default framing.
