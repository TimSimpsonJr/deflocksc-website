# Overpass camera-data migration + map declustering — design

Date: 2026-09-17
Issue: #125 (SC camera count undercounts by ~18%)
Status: approved (brainstorm), pending implementation plan

## Problem

Two problems, fixed together because they share the camera dataset:

1. **The SC count undercounts by ~18%.** `scripts/fetch-camera-data.ts` fetches a
   single DeFlock CDN tile, `https://cdn.deflock.me/regions/20/-100.json`, which
   covers longitude `[-100, -80)`. SC extends east to ~-78.5, so every camera east
   of -80 (Charleston, Mount Pleasant, Summerville, Myrtle Beach, Florence,
   Georgetown) is never fetched. A comparison spike against OpenStreetMap via
   Overpass, using the production point-in-polygon clip
   (`src/lib/sc-camera-count.ts` over `public/districts/state-outline.json`) and an
   OSM-id set diff, found:

   | | Count |
   |---|---:|
   | Overpass (OSM) SC total | **2,084** |
   | Committed DeFlock SC total | 1,700 |
   | In both | 1,700 |
   | Overpass-only (DeFlock missing) | 384 (378 east of -80) |
   | DeFlock-only (Overpass missing) | 0 |

   DeFlock's set is a perfect subset of OSM, so Overpass is DeFlock's own upstream
   with no divergence. The true SC total is **2,084**.

2. **The refresh can't run from CI.** DeFlock's Cloudflare CDN returns 403 to all
   datacenter egress (GitHub Actions, Netlify). The daily workflow was moved to a
   local Windows Scheduled Task on a residential IP as a stopgap
   (`scripts/refresh-camera-data.local.ps1`, see the prior design doc). Overpass
   serves datacenter IPs, so sourcing from Overpass lets the refresh return to CI
   and drops the DeFlock dependency.

Separately, the user asked to **remove camera-dot clustering** on the map and scale
the dots with zoom, fading the directional cones out at the zoom where grouping
used to begin. This is feasible precisely because migrating to Overpass (option A
below) shrinks the rendered set to the ~6,500 SC-area cameras, which draw
individually without clustering.

## Decisions

- **Data source: Overpass (OpenStreetMap), option A** — `public/camera-data.json`
  is *replaced* by the Overpass SC-bbox set. It serves double duty (count input +
  the map's client-side fallback snapshot); making it the SC set fixes the count
  and makes the map's fallback SC-focused, which suits an SC site. No second data
  file.
- **Remove clustering; scale dots by zoom; fade cones** at the old grouping
  threshold, with a plain dot under every camera so directional cameras become
  dots (not nothing) when their cone fades on zoom-out.
- **Fail-red on total Overpass failure** (snapshot preserved), and return the
  refresh to a daily CI schedule; retire the local Scheduled Task.

## Design

### 1. Data pipeline (`scripts/fetch-camera-data.ts`)

Replace the single-tile CDN GET with an Overpass POST:

```
[out:json][timeout:120];
node["man_made"="surveillance"]["surveillance:type"="ALPR"](31.5,-84.0,35.5,-78.0);
out body;
```

- The bbox is `SC_BOUNDS` (already exported from `sc-camera-count.ts`), formatted
  as Overpass `(south,west,north,east)`. The production polygon clip does the real
  SC trimming downstream, exactly as today.
- Mirror fallback list, tried in order with a short retry each:
  `https://overpass-api.de/api/interpreter`,
  `https://overpass.kumi.systems/api/interpreter`,
  `https://lz4.overpass-api.de/api/interpreter`.
  Send a descriptive `User-Agent` (`deflocksc-website/1.0 (+repo url)`).
- Map each element with `type === 'node'` to the existing camera shape
  `{ id, lat, lon, tags }`. **Preserve `tags`** — the map reads `direction` /
  `camera:direction`, `manufacturer`, `operator`, `wikimedia_commons` from them
  for popups and the `hasDirection` split. OSM uses the same tag keys the map
  already parses, so no map-side parsing change is needed.
- Run the existing `assertValidCameraPayload` gate (all-or-nothing) before writing
  `public/camera-data.json`, unchanged in format `JSON.stringify(array)`.
- On total fetch failure (all mirrors, after retries): throw → non-zero exit → the
  prior committed snapshot is untouched (existing fail-safe). No partial writes.

`build-impact-stats.ts` and `sc-camera-count.ts` are unchanged: same clip, same
`camera-counts.json` / `impact-stats.json` outputs. `scTotal` becomes ~2,084;
`Hero`/`Base` floor it to "2,000", `ImpactBand`/`MapSection` show 2,084 — all
already dynamic, no copy edits.

### 2. Reliability + rollout

- `.github/workflows/refresh-camera-data.yml`: restore the daily `schedule:` cron
  (uncomment the block preserved in the prior change); keep `workflow_dispatch`.
  The commit/derive steps are unchanged; only the fetch source moved.
- Retire the local task: unregister the `DeflockSC-RefreshCameraData` Windows
  Scheduled Task and delete `scripts/refresh-camera-data.local.ps1` (its reason
  for existing — the datacenter 403 — is gone). Update MANIFEST + memory.
- Attribution: add `© OpenStreetMap contributors` (ODbL) as data credit near the
  map, consistent with the existing OSM tile attribution on EventsMap.

### 3. Map rendering (`src/scripts/map/layers/cameras.ts`)

- Source `cameras`: set `cluster: false` (drop `clusterMaxZoom` / `clusterRadius`).
- Remove layers `cluster-glow`, `clusters`, `cluster-count`; remove the cluster
  click handler (`getClusterExpansionZoom` path) and the cluster hover handlers;
  update `CAMERA_LAYER_IDS` and the teardown.
- `camera-dots`: **remove the filter entirely** so every camera gets a dot. Today
  it is `['all', ['!', ['has', 'point_count']], ['!', ['get', 'hasDirection']]]`
  (non-clustered, non-directional only); with `cluster: false` the `point_count`
  clause is moot, and dropping the `hasDirection` clause is what puts a dot under
  every camera — including directional ones — so they persist as dots when the
  cone fades on zoom-out. `circle-radius` becomes a zoom interpolation, a starting
  point to tune live: `['interpolate', ['linear'], ['zoom'], 4, 2, 10, 4, 14, 6]`.
- `camera-cones`: filter `['get', 'hasDirection']`; add `icon-opacity` zoom fade
  matching the old `clusterMaxZoom: 9` boundary, e.g.
  `['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1]`. Optionally scale
  `icon-size` with zoom to match the dots. Net effect: zoomed out = uniform small
  dots (cones invisible); zoomed in ≥10 = facing cones over their dots.

### 4. Testing / verification

- Unit (vitest): add coverage for the Overpass element→`Camera[]` mapping
  (node filter, tag preservation) and the mirror-fallback (first mirror fails →
  second succeeds). Existing `sc-camera-count` and payload-validator tests hold.
- Browser (dev preview): no cluster bubbles at any zoom; dots scale with zoom;
  cones fade out below ~zoom 10 and directional cameras remain as dots; popups and
  OSM links still work; homepage shows 2,000 / 2,084.

## Out of scope

- Repointing the map's *live* per-viewport tile-loader off the DeFlock CDN. It
  still 403s in prod and falls back to `camera-data.json` (now the SC set), which
  is acceptable. A separate, larger change.
- Any change to the count methodology or the SC boundary polygon.
