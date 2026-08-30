# Camera Map Live Data — Design Spec

**Date:** 2026-08-29
**Status:** Approved (design-level approval given; this doc captures the approved decisions)
**Scope:** Homepage camera map data source + cluster-zoom threshold ONLY. No rendering, layer, popup, cone, or chrome changes.

## Problem

The homepage camera map (`src/components/MapSection.astro`) loads a single committed
snapshot, `public/camera-data.json`, fetched one-shot on map load (line 237). That file
is a copy of exactly one Deflock CDN tile — `https://cdn.deflock.me/regions/20/-100.json`
(`scripts/fetch-camera-data.mjs` line 14) — refreshed **weekly** by
`.github/workflows/refresh-camera-data.yml`.

Three consequences:

1. **Coverage gap.** Tile `20/-100` covers lat 20–40, lon −100 to −80. Everything in
   South Carolina east of −80° longitude — Charleston (−79.93), Myrtle Beach (−78.89),
   the entire coast — is in tile `20/-80` and has **never appeared on the map**.
2. **Staleness.** The CDN updates hourly; the site serves data up to a week old. The
   on-page claim "Community sourced · Updated hourly" (MapSection.astro line 68) and the
   blog's "updates hourly" claims are currently inaccurate.
3. **Clusters hold too long.** `clusterMaxZoom: 15` (`src/scripts/map/layers/cameras.ts`
   line 180) keeps points clustered until zoom 16, so users rarely see individual
   cameras and their direction cones.

Direct browser fetches to `cdn.deflock.me` are impossible: the CDN only sends
`Access-Control-Allow-Origin` for deflock.org origins.

## Approved Decisions

### 1. Netlify proxy for the CDN

Add a 200 rewrite in `netlify.toml` (there is no `public/_redirects` file — netlify.toml
is the repo's only redirect source), following the same pattern as the existing `/u`
Umami proxy:

```toml
[[redirects]]
  from = "/deflock-tiles/*"
  to = "https://cdn.deflock.me/regions/:splat"
  status = 200
```

The browser fetches same-origin (`connect-src 'self'` already permits it — no CSP
change needed for tiles); Netlify fetches the CDN server-side. Query strings (the
CDN's `?v=` cache-buster) pass through Netlify proxies automatically.

**Dev parity:** Netlify redirects do not run under `astro dev`, so a matching Vite dev
proxy is added to `astro.config.mjs` `server.proxy` — the exact pattern already used
there for `/api/geocode` → the Census geocoder. Without it, every dev/smoke-test
session would silently exercise only the fallback path.

### 2. Viewport tile loader

Replace the one-shot `fetch('/camera-data.json')` in MapSection.astro (lines 235–267)
with a per-viewport loader in a new module `src/scripts/map/tile-loader.ts`, modeled on
deflock.org's tile store (`webapp/src/stores/tiles.ts` in the FoggedLens/deflock repo):

- Fetch `/deflock-tiles/index.json` once. Observed shape (2026-08-29):

  ```json
  {
    "expiration_utc": 1788010667,
    "regions": ["20/-100", "20/-80", "40/-80", "..."],
    "tile_url": "https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1788006947",
    "tile_size_degrees": 20
  }
  ```

- On map `load` (immediate) and on `moveend` (debounced, 250 ms trailing edge — a
  continuous pan/zoom gesture issues one trailing load, not one per intermediate
  stop), compute the viewport bbox, determine which 20-degree tiles intersect it,
  and fetch each `/deflock-tiles/{lat}/{lon}.json` not already cached. Skip tiles
  absent from `regions` and tiles already in flight. A viewport intersecting more
  than 8 tiles (`MAX_TILES_PER_VIEWPORT`) is skipped outright: zoomed-out
  world/continent views keep whatever is already loaded instead of pulling dozens
  of ~1–2.8 MB tiles.
- Respect `expiration_utc`; after expiry, re-fetch the index. The tile cache is
  invalidated only when the refreshed index's `tile_url` (its `?v=` cache-buster)
  has actually changed; an unchanged `tile_url` keeps cached tiles, so an index
  refresh alone never causes refetch churn.
- Merge and dedupe cameras across tiles by OSM `id`.
- Keep the **exact** existing `DeflockCamera` → GeoJSON property mapping currently in
  MapSection.astro lines 241–263 (`id`, `direction` parsed to number via
  `parseDirection`, `hasDirection`, `manufacturer`, `operator`, `wikimedia_commons`)
  so popups, direction cones, and OSM links are untouched.
- Update the existing `cameras` GeoJSON source incrementally via `source.setData()`.
  The source and layers are added **once** (via the unchanged `addCameraLayers`, seeded
  with an empty FeatureCollection on map load) and never re-added.
- **Fallback:** if the index or any tile fails to load, fetch the committed snapshot
  `/camera-data.json` once (merged through the same dedupe) so the map is never empty.
  Log failures; never throw.

**Deliberate deviations from the upstream reference** (both flagged for review):

- *Tile math:* upstream iterates tile origins up to `Math.ceil(max/size)*size`, which
  fetches one non-intersecting extra row/column (an SC viewport would pull the lat-40
  Canada/northern-US row, ~1 MB each). A tile with origin `o` covers `[o, o+size)`, so
  this design iterates to `Math.floor(max/size)*size` inclusive — exact intersection.
- *Expiration units:* `expiration_utc` is a Unix timestamp in **seconds** (observed
  `1788010667` ≈ 2026-08-29). Upstream passes it to `new Date()` unscaled — a latent
  bug that would make the index appear permanently expired. This design multiplies by
  1000.

### 3. Declustering

In the `cameras` source config (`src/scripts/map/layers/cameras.ts` lines 176–182),
change `clusterMaxZoom: 15` → `12`. Individual dots and cones appear at zoom 13+.
`clusterRadius: 50` and **all** paint / circle-radius settings stay unchanged.

### 4. Keep the snapshot pipeline unchanged

`public/camera-data.json`, `.github/workflows/refresh-camera-data.yml`,
`scripts/fetch-camera-data.mjs`, and `scripts/build-camera-counts.py` are **not
modified**. The snapshot now serves two purposes: (a) build-time jurisdiction counts
for the action modal (`camera-counts.json`), and (b) the runtime fallback.

### 5. Copy truth-up

With live hourly CDN data, three claims become accurate and are **kept as-is** after
verification:

- MapSection.astro line 68: "Community sourced · Updated hourly"
- MapSection.astro line 109: attribution — "Camera data from Deflock.org, a
  community-sourced map…" (no freshness claim; accurate before and after)
- `src/content/blog/how-to-fight-alpr-surveillance-sc.md` lines 20 and 107:
  "updates hourly" / "updated hourly"

Expected outcome: zero copy edits. The verification is recorded in the PR description.

### 6. Folded-in fix: CSP `img-src` for Wikimedia Commons

`public/_headers` `img-src` lists `https://upload.wikimedia.org` but not
`https://commons.wikimedia.org`. Camera popups build thumbnail URLs on
`commons.wikimedia.org/w/thumb.php` (`cameras.ts` line 40), so those images are blocked
in production today. Add `https://commons.wikimedia.org` to `img-src` (its own small
task; in blast radius because the smoke test exercises popups). `upload.wikimedia.org`
stays listed — `thumb.php` redirects there and CSP checks every hop.

## Affected Files

| File | Change |
|---|---|
| `netlify.toml` | Add `/deflock-tiles/*` 200 rewrite |
| `astro.config.mjs` | Add matching Vite dev proxy |
| `public/_headers` | Add `https://commons.wikimedia.org` to CSP `img-src` |
| `src/scripts/map/tile-loader.ts` | **New** — index + viewport tile loader with fallback |
| `src/components/MapSection.astro` | Replace one-shot fetch with loader wiring (script block only) |
| `src/scripts/map/layers/cameras.ts` | `clusterMaxZoom: 15` → `12` (one line) |
| `tests/tile-loader.test.ts` | **New** — unit tests for tile math + loader behavior |
| `tests/config-guards.test.ts` | Guards for the new redirect and the CSP addition |

## Out of Scope

- Any change to map rendering, layers, paint, popups, cones, badges, or controls.
- Swapping the clustering algorithm — MapLibre's built-in supercluster stays.
- The events map (`src/scripts/events-page.ts`) — never imports the camera layer;
  `/events` continues to load zero camera data.
- The snapshot pipeline (workflow, fetch script, camera-counts builder).
- Removing `public/camera-data.json` or its weekly refresh.
- Doc truth-ups in `docs/architecture.md` / `docs/adapting-scrapers.md` (already stale
  in unrelated ways, e.g. references to the long-removed `camera-map.ts`; the MANIFEST
  rewrite at PR merge indexes the new file per repo convention).

## Risks

1. **Netlify bandwidth.** Tiles (~1–2.8 MB each) are proxied through Netlify and count
   against bandwidth, replacing the 804 KB same-origin snapshot — comparable for
   inland viewports (1 tile), up to ~2 MB for viewports spanning −80°. Two loader
   guards bound the worst case: a viewport intersecting more than **8 tiles** is
   skipped entirely (the live index lists ~54 regions, so an unbounded world view
   could otherwise pull 30–60 MB), and `moveend` loads are debounced (250 ms
   trailing) so a continuous pan issues one load, not one per intermediate stop.
   The CDN sends `Cache-Control: max-age=300`, which browsers honor; Netlify's edge
   may or may not cache proxied responses. Watch the bandwidth graph after deploy.
   (A map `minZoom` would also bound zoomed-out fetching, but it touches map init —
   out of scope here; available as a follow-up if the cap proves insufficient.)
2. **CDN contract drift.** The loader validates the index contract on every fetch
   before storing it (`expiration_utc` finite, `regions` an array of strings,
   `tile_url` a string, `tile_size_degrees` finite and > 0). Any malformed index —
   like any failed fetch — logs, falls back to the snapshot once (map never empty),
   and resolves without throwing; a zero/negative `tile_size_degrees` can no longer
   hang the tile math. Failures also latch a back-off (60 s for the index; until the
   next `?v=` rotation for a failed tile) so drift or an outage never causes a
   per-moveend retry storm. Liveness is still silently lost until the contract is
   restored — if tiles stop updating, check console errors on the deploy. The
   `proxiedTileTemplate` helper degrades to a plain
   `/deflock-tiles/{lat}/{lon}.json` template if the host prefix changes.
3. **Stale-camera lingering.** After index expiry, re-fetched tiles merge over the
   camera map keyed by id; a camera *removed* upstream lingers until page reload.
   Accepted: homepage sessions rarely span the hourly refresh.
4. **CSP not enforced in dev.** `public/_headers` only applies on Netlify, so CSP
   violations (including the img-src fix) are verified on the deploy preview, not in
   the dev smoke test.
5. **Cluster-zoom feel.** `clusterMaxZoom: 12` at `clusterRadius: 50` may render many
   overlapping dots in dense deployments at zoom 13. Paint is deliberately untouched;
   if it reads badly, threshold tuning is a follow-up, not a redesign.
