---
codex_design_review_status: approved
codex_design_review_approved_hash: 91f67c8309c7e308d9c6633ae0bfbce0f646e0e96ca5f49d94eeb49fb912f364
codex_thread_id: 01a04de7-361b-7653-bcab-4cb0bf9714fd
---

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
   with no divergence. The current SC total is **~2,084** — a measured snapshot
   that drifts day to day as OSM is edited, not a fixed "true" number — up from the
   committed 1,700.

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
- **Overpass envelope validation (new, runs per mirror BEFORE mapping).** An
  HTTP 200 from Overpass does not mean a complete result: on a server-side abort
  it returns 200 with a `remark` field and a partial or empty `elements` array,
  and mirrors can serve stale replicas. A partial array would pass the existing
  structural validator and silently overwrite the snapshot with an undercount. So
  a response is accepted only if ALL hold:
  - **No error envelope:** no top-level `remark` (Overpass writes the abort reason
    there) and a present `elements` array.
  - **Fresh, not just present:** parse `osm3s.timestamp_osm_base` and reject if it
    is older than `maxAgeHours` (start: 48) or more than `maxFutureSkewHours`
    (start: 2) in the future. Presence alone does not prove a mirror isn't serving
    a stale replica.
  - **No implausible regression, compared like-scope to like-scope:** project BOTH
    the candidate AND the prior committed `public/camera-data.json` through the
    SAME geographic scope (`filterToScBounds`) before counting. This is essential
    for the FIRST migration run, where the prior snapshot is the old ~64,826-record
    regional tile and the candidate is the ~6,500 SC-bbox set — a raw-length
    compare would wrongly reject it, but `filterToScBounds(prior)` (~5,700) vs the
    candidate (~6,500) is a valid comparison. Reject if the projected candidate
    count drops below `max(floor, priorProjected * (1 - maxDrop))` — start
    `floor = 1000`, `maxDrop = 0.10` (deliberately tighter than the ~18% undercount
    this migration fixes, so a comparable regression can't slip through). Skipped
    only when there is no prior snapshot. A genuine large removal is allowed
    through an explicit, logged `ALLOW_CAMERA_DROP=1` env override — never by
    loosening the default threshold.

  A response failing any check is treated as a mirror failure: advance to the next
  mirror. A write happens only when a mirror passes every check.
- Map each accepted element with `type === 'node'` to the existing camera shape
  `{ id, lat, lon, tags }`. **Preserve `tags`** — the map reads `direction` /
  `camera:direction`, `manufacturer`, `operator`, `wikimedia_commons` from them
  for popups and the `hasDirection` split. OSM uses the same tag keys the map
  already parses, so no map-side parsing change is needed.
- Re-run the existing `assertValidCameraPayload` gate (all-or-nothing) on the
  mapped array before writing `public/camera-data.json` (format unchanged,
  `JSON.stringify(array)`).
- On total failure (all mirrors fail the fetch OR the envelope/regression checks,
  after retries): throw → non-zero exit → the prior committed snapshot is
  untouched (fail-red). No partial writes. This is what makes "fail-red" real: a
  200-with-`remark` undercount can no longer be committed.

`build-impact-stats.ts` and `sc-camera-count.ts` are unchanged: same clip, same
`camera-counts.json` / `impact-stats.json` outputs. `scTotal` becomes ~2,084;
`Hero`/`Base` floor it to "2,000", `ImpactBand`/`MapSection` show 2,084 — all
already dynamic, no copy edits.

### 2. Reliability + rollout

- `.github/workflows/refresh-camera-data.yml`: restore the daily `schedule:` cron
  (uncomment the block preserved in the prior change); keep `workflow_dispatch`.
  The commit/derive steps are unchanged; only the fetch source moved.
- Retire the local task **only after CI proves out**: keep the
  `DeflockSC-RefreshCameraData` Windows Scheduled Task and
  `scripts/refresh-camera-data.local.ps1` running until the restored CI workflow
  has completed **at least one successful Overpass refresh on `master`**. That
  preserves an easy rollback path if Overpass proves unreliable in CI. Once
  confirmed, unregister the task, delete the local script, and update MANIFEST +
  memory. (This staging is a rollout step, not a code dependency; the two refresh
  paths are idempotent and commit-if-changed, so briefly running both is safe.)
- **Provenance / copy truth-up.** The migration + declustering invalidate existing
  public copy; fix all of it in this change:
  - Add a linked `© OpenStreetMap contributors` (ODbL) **data** credit near the
    camera map (distinct from the existing basemap-tile attribution), describing
    the dataset honestly: cameras come from OpenStreetMap (the same crowdsourced
    dataset DeFlock renders), refreshed **daily**.
  - `src/content/blog/building-deflocksc.md` (~L55): "A weekly script grabs the
    latest data" → daily; reconcile the DeFlock framing with the OSM source.
  - `src/content/blog/how-to-fight-alpr-surveillance-sc.md` (~L20, L107): "updates
    hourly" → daily; **remove the "clusters are dense deployments" sentence**
    (clustering is gone); reconcile "sourced from Deflock.org" with the OSM
    provenance.
  - This copy is reader-facing, so the blog edits go through the `copydesk:write`
    gate at implementation time (the attribution/label strings are mechanical).

### 3. Map rendering (`src/scripts/map/layers/cameras.ts`, `src/components/MapSection.astro`)

- Source `cameras`: set `cluster: false` (drop `clusterMaxZoom` / `clusterRadius`).
- Remove layers `cluster-glow`, `clusters`, `cluster-count`; remove the cluster
  click handler (`getClusterExpansionZoom` path) and the cluster hover handlers;
  update `CAMERA_LAYER_IDS` and the teardown.
- **Bound the rendered set to SC (required by declustering).** The map still runs
  the live DeFlock tile loader first (`MapSection.astro` `onUpdate → setData`),
  which accumulates loaded tiles without eviction — a working proxy or a partial
  live load can feed the whole ~64k-record regional tile into the now-unclustered
  source. So clip cameras to `SC_BOUNDS` (reuse `inScBounds` from
  `sc-camera-count.ts`) in `onUpdate` before `toGeoJSON`, so the unclustered
  source only ever holds the ~6,500 SC-area cameras regardless of how many tiles
  the loader has accumulated or which source (live vs. fallback) supplied them.
  The SC snapshot is thus the effective authority for what renders; the fix does
  not depend on DeFlock continuing to 403.
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
- **One interaction owner per camera.** Because every camera now also has a
  `camera-dots` feature, binding click/hover to BOTH layers would fire twice for a
  directional camera (duplicate popup + double analytics), and a zero-opacity cone
  is still hit-queryable in MapLibre. So `camera-dots` becomes the **sole
  interactive layer**: bind click/hover only to `camera-dots`, and make
  `camera-cones` purely decorative (no click/hover handlers). Every camera —
  directional or not — is clicked through its dot, at every zoom.

### 4. Testing / verification

- Unit (vitest): Overpass element→`Camera[]` mapping (node filter, tag
  preservation); **envelope validation** (a 200 with a `remark`, a missing
  `timestamp_osm_base`, or an implausible-regression count is rejected and advances
  to the next mirror); mirror-fallback (first mirror fails → second succeeds);
  total-failure → throw (no write). Existing `sc-camera-count` and payload-
  validator tests hold.
- Browser (dev preview): no cluster bubbles at any zoom; dots scale with zoom;
  cones fade out below ~zoom 10 and directional cameras remain as dots; **a
  directional camera opens exactly one popup on click (no duplicate)**; the
  rendered set stays SC-bounded even when live tiles load; popups and OSM links
  still work; homepage shows 2,000 / 2,084.

## Out of scope

- Repointing the map's *live* per-viewport tile-loader source off the DeFlock CDN
  (it still fetches DeFlock tiles when reachable, with the `camera-data.json`
  fallback). We do NOT change where it fetches — but its rendered output is now
  clipped to `SC_BOUNDS` at the `onUpdate` boundary (§3), so capacity is bounded
  regardless of the CDN's 403 behavior. Fully replacing the live loader with the
  static SC snapshot is a separate, larger change.
- Any change to the count methodology or the SC boundary polygon.
