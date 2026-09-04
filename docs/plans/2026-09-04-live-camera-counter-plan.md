# Live SC Camera Counter — Implementation Plan

Date: 2026-09-04
Branch: `feature/live-camera-counter`
Design: [`2026-09-04-live-camera-counter-design.md`](./2026-09-04-live-camera-counter-design.md)

## Goal

Show a **daily-fresh** South Carolina ALPR camera count on the homepage, decoupled from
the (currently manual) deploy pipeline, **without changing the counting methodology** and
degrading gracefully to the server-rendered build-time number. The rigorous
SC-polygon-clipped unique-camera-ID count stays exactly as it is today; only its *freshness*
and *delivery* change.

Concretely, after this plan the SC total (`impact-stats.json` `scTotal`, today 1,624) is
refreshed at most once per day by an edge-cached Netlify Function that fetches DeFlock live,
and the three homepage surfaces that show it — the Hero "more than N" floor, the ImpactBand
count-up stat, and the MapSection statline — update client-side to that live value when
available, or keep the build-time number when not.

## Architecture

Four moving parts, in dependency order:

1. **Shared count module** `src/lib/sc-camera-count.ts` (new) — the single source of truth
   for the methodology (SC-bbox pre-filter → point-in-polygon over `state-outline.json` for
   `scTotal`, per-jurisdiction pass over `county-*`/`place-*` for `jurisdictions`). Reuses the
   canonical `pointInPolygon` from `src/lib/geo-utils.ts`. Imported by BOTH the build script
   and the new function, so the two paths can never diverge.
2. **Endpoint** `netlify/functions/sc-camera-count.ts` (new) — fetches the DeFlock CDN the same
   way `scripts/fetch-camera-data.ts` does (same URL + UA + shared validator), runs `countScCameras`, returns
   `{ scTotal, jurisdictions, generatedAt, stale:false }` with a 24 h durable + SWR edge cache.
   Query-bearing requests are rejected before the fetch (Netlify's cache key includes the query, so
   `?bust=` would bypass the cache and hammer DeFlock); the fetch is bounded by an abort timeout;
   the payload is validated **all-or-nothing** (any malformed record rejects the whole payload — never
   a filtered undercount); and the computed result is validated (both `scTotal` and `jurisdictions`
   must be positive integers). The timeout, non-ok, non-array, empty-array, any-malformed-record,
   zero-result, and non-positive-jurisdictions cases all return HTTP 200 `{ stale:true }` uncached.
   Its boundary dataset is bundled via a **function-scoped**
   `[functions."sc-camera-count"] included_files` so no other function ships it.
3. **Client** `src/scripts/live-count.ts` (new) — fetches `/api/sc-camera-count` once per page,
   and on a valid numeric `scTotal` updates the three `data-live-sc` surfaces; otherwise leaves
   the SSR build-time number untouched. Count-up + reduced-motion are delegated to the existing
   `observeCountUps` in `src/scripts/count-up.ts` (that file is NOT modified).
4. **Build/CI change** — refactor BOTH refresh/build scripts (`fetch-camera-data` and
   `build-impact-stats`) to `.ts` importing the shared module, so the untrusted CDN fetch is
   validated by the SAME all-or-nothing validator the live function uses BEFORE the snapshot is
   written/committed; bump the `refresh-camera-data.yml` cron weekly → daily. A malformed CDN
   payload now fails the refresh step (non-zero exit) and the whole job, leaving the prior
   committed snapshot and counts untouched — never a corrupt fallback commit.

Fallback ladder (the number is never blank, never blocks render): **live** value → **build-time**
`impact-stats.json` value (SSR; used on fetch failure / `stale` / JS off).

## Tech Stack

- Astro 5 (`.astro` components + `type=module` client scripts), TypeScript, Tailwind 4.
- Netlify Functions v2 (`import type { Config, Context } from '@netlify/functions'`; routed by
  `config.path`, matching `netlify/functions/events.ts`).
- Vitest 4 (global `environment: 'node'`; test command `npm test` = `vitest run`). The one
  DOM-capable test file opts into `happy-dom` via a per-file `// @vitest-environment happy-dom`
  docblock — the global env stays `node`.
- esbuild-bundled TS build scripts (the repo's existing `codes` / `build-wordlist` pattern).

> **For agentic workers:** execute this plan with `superpowers:subagent-driven-development` (or
> `superpowers:executing-plans`). **REQUIRED SUB-SKILL: `superpowers:test-driven-development`.**
> Every task is RED → GREEN → REFACTOR → COMMIT: write the failing test, run it and *watch it
> fail with the stated output*, write the minimal implementation, run it green, then commit with
> the exact message. Do not batch tasks; commit at each task boundary. All paths below are
> repo-relative to the worktree root `C:/Users/tim/workspace/dc-live-counter`.
>
> **Run all `git` commands through the Bash tool (Git Bash), NOT PowerShell** — the commit
> messages below use `$(cat <<'EOF' … EOF)` heredocs, which Git Bash handles but PowerShell does
> not. (`npm`/`npx`/`vitest` may run under either shell.)

## File Structure

| File | New/Mod | Responsibility |
|------|---------|----------------|
| `src/lib/sc-camera-count.ts` | **New** | Pure, dependency-free SC-count module: `SC_BOUNDS`, `inScBounds`, `filterToScBounds`, `pointInFeatureCollection`, `keyFromFilename`, `countScCameras`, **plus the shared payload validator `isWellFormedCamera` + `assertValidCameraPayload` (single source of truth for structural validity, called by BOTH the live function and the refresh/build fetch step)**. Reuses `pointInPolygon` from `geo-utils`. Single source of truth. |
| `src/lib/sc-camera-count.test.ts` | **New** | Unit tests (dedup, holes, MultiPolygon, bbox, per-jurisdiction, **validator: well-formed/malformed/empty/non-array**) + **parity** test vs. an inlined copy of the pre-refactor algorithm. |
| `scripts/fetch-camera-data.ts` | **New** (replaces `.mjs`) | Refresh step: fetches the DeFlock CDN, validates the payload **all-or-nothing** with the shared `assertValidCameraPayload` BEFORE writing `public/camera-data.json`; a malformed/empty/mixed payload throws → non-zero exit → prior snapshot left intact. Esbuild-bundled (like `build-impact-stats`); `ROOT`=`process.cwd()`. |
| `scripts/fetch-camera-data.mjs` | **Delete** | Replaced by the validating `.ts` above. |
| `tests/fetch-camera-data.exec.test.ts` | **New** | Execution-level regression: bundles the fetch step, stubs `fetch` (via `--import` preload) to return a malformed/empty payload, runs it from a fixture cwd, and asserts a NON-ZERO exit that does NOT overwrite `public/camera-data.json` / `camera-counts.json` / `impact-stats.json`; positive control proves a well-formed payload DOES write. |
| `scripts/build-impact-stats.ts` | **New** (replaces `.mjs`) | Build-time generator; now *imports* `countScCameras` instead of an inline copy, and defensively re-asserts the snapshot via `assertValidCameraPayload` before any write. Writes `public/camera-counts.json` + `src/data/impact-stats.json`, byte-format unchanged. |
| `scripts/build-impact-stats.mjs` | **Delete** | Replaced by the `.ts` above. |
| `tests/build-impact-stats.exec.test.ts` | **New** | Execution-level regression: bundles the generator (esbuild) and runs it from a fixture cwd, asserting `ROOT`=`process.cwd()` finds the boundary files + writes correct figures. Catches the `import.meta.url`→`node_modules` bug a unit test can't. |
| `netlify/functions/sc-camera-count.ts` | **New** | `GET /api/sc-camera-count`: reject query-bearing requests (cache-key politeness), fetch DeFlock with a bounded abort timeout, validate payload **all-or-nothing via the SHARED `assertValidCameraPayload`** (same validator as the refresh/build fetch step — any malformed record → whole payload rejected) + computed result (`scTotal` and `jurisdictions` both positive integers), `countScCameras`, 24 h durable+SWR cache; timeout/`!ok`/non-array/empty/any-malformed/mixed/zero/non-positive-jurisdictions → 200 `{stale:true}` uncached. |
| `tests/functions/sc-camera-count.test.ts` | **New** | Function tests: success shape + cache header + CDN URL/UA + bounded signal; cache-busting query never reaches upstream; `!ok` / throw / non-array / empty-array / all-malformed / **mixed valid+malformed** / zero-result / timeout → `{stale:true}` uncached (mixed proves no filtered undercount is cached). |
| `src/scripts/live-count.ts` | **New** | Client: memoized `getLiveCount()`, pure `parseLiveCount`/`cameraFloor`, `applyLiveCount`, idempotent `initLiveCount`. |
| `src/scripts/live-count.test.ts` | **New** | Unit tests for the pure helpers (`parseLiveCount`, `cameraFloor`) — `node` env. |
| `src/scripts/live-count.dom.test.ts` | **New** | DOM wiring tests (`happy-dom` per-file env): success updates all 3 surfaces; stale/rejected leaves all 3 at SSR values; one fetch per page; exact-vs-floor formatting. |
| `src/components/Hero.astro` | **Mod** | Wrap the floor number in `<span data-live-sc="floor">`; import + call `initLiveCount()`. |
| `src/components/ImpactBand.astro` | **Mod** | Mark SC stat `data-live-sc="exact"`; exclude it from the component's own `observeCountUps`; call `initLiveCount()`. |
| `src/components/MapSection.astro` | **Mod** | Mark SC statline number `data-live-sc="exact"`; exclude it from the component's own `observeCountUps`; call `initLiveCount()`. |
| `netlify.toml` | **Mod** | Add **function-scoped** `[functions."sc-camera-count"] included_files = ["public/districts/**"]` (NOT a global `[functions]` table). No redirect (routing via `config.path`). CSP unchanged. |
| `astro.config.mjs` | **Mod** | Add `/api/sc-camera-count` dev proxy → functions server. |
| `tests/config-guards.test.ts` | **Mod** | Add guards: refactor happened (no inline `pointInRing`), `included_files` scoped to `[functions."sc-camera-count"]` only (no global `[functions]`, exactly one `included_files`), function `config.path`, CSP `connect-src 'self'` intact, dev proxy present, built homepage wraps the SSR number inside each `data-live-sc` hook. |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Cron weekly → daily; add `npm ci` + `npm run prebuild` (the shared-module import + boundary files now require them); Node 20 → 22; run `npm run fetch-camera-data` (validating TS bundle, no longer `node scripts/fetch-camera-data.mjs`) then `npm run build-impact-stats`. The fetch step's validation failure exits non-zero and fails the job, so no corrupt snapshot/count is committed. |
| `package.json` | **Mod** | Add `"fetch-camera-data"` + `"build-impact-stats"` esbuild-bundle scripts; add `happy-dom` (pinned) to `devDependencies` for the DOM test env. |

---

## Task 1 — Shared SC-count module + unit/parity tests

**Files:**
- Create: `src/lib/sc-camera-count.ts` — the pure count module.
- Test: `src/lib/sc-camera-count.test.ts` — unit + parity.

### Step 1 — Write the failing test

Create `src/lib/sc-camera-count.test.ts`. It imports the not-yet-existing module and inlines a
verbatim copy of the *pre-refactor* algorithm (from `build-impact-stats.mjs`) as
`legacyCountScCameras`, so the parity block proves the refactor preserves behavior.

```ts
import { describe, it, expect } from 'vitest';
import {
  countScCameras,
  filterToScBounds,
  keyFromFilename,
  inScBounds,
  isWellFormedCamera,
  assertValidCameraPayload,
  InvalidCameraPayloadError,
  SC_BOUNDS,
  type Camera,
} from './sc-camera-count.js';
import type { FeatureCollection } from './geo-utils.js';

// A square inside SC_BOUNDS (lon -83..-79, lat 33..35), with a hole at
// lon -81.5..-80.5 / lat 33.5..34.5. Rings are GeoJSON [lng, lat] order.
const squareWithHole: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-83, 33], [-79, 33], [-79, 35], [-83, 35], [-83, 33]],
          [[-81.5, 33.5], [-80.5, 33.5], [-80.5, 34.5], [-81.5, 34.5], [-81.5, 33.5]],
        ],
      },
    },
  ],
};

// Two disjoint squares in SC (a MultiPolygon jurisdiction).
const multiJurisdiction: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[-83, 33], [-82, 33], [-82, 34], [-83, 34], [-83, 33]]],
          [[[-80, 34], [-79, 34], [-79, 35], [-80, 35], [-80, 34]]],
        ],
      },
    },
  ],
};

// No duplicate ids here: per-jurisdiction counts tally RECORDS (not unique ids),
// so a duplicate would inflate them. scTotal dedup is proven in its own test.
const cameras: Camera[] = [
  { id: 1, lat: 33.2, lon: -82.5 }, // inside outer, outside hole; in place:multi sq1
  { id: 2, lat: 34.0, lon: -81.0 }, // inside the hole -> excluded from state/county
  { id: 3, lat: 34.5, lon: -79.5 }, // inside outer; in place:multi sq2
  { id: 4, lat: 40.0, lon: -100.0 }, // outside SC_BOUNDS -> pre-filtered out
];

describe('inScBounds / filterToScBounds', () => {
  it('keeps SC-area coords and drops out-of-box coords', () => {
    expect(inScBounds({ id: 1, lat: 34, lon: -81 })).toBe(true);
    expect(inScBounds({ id: 2, lat: 40, lon: -100 })).toBe(false);
    expect(filterToScBounds(cameras).map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe('keyFromFilename', () => {
  it('maps county/place filenames to keys and rejects others', () => {
    expect(keyFromFilename('county-greenville.json')).toBe('county:greenville');
    expect(keyFromFilename('place-mauldin.json')).toBe('place:mauldin');
    expect(keyFromFilename('state-outline.json')).toBeNull();
  });
});

describe('countScCameras', () => {
  const boundaries = new Map<string, FeatureCollection>([
    ['county:test', squareWithHole],
    ['place:multi', multiJurisdiction],
  ]);
  const result = countScCameras(cameras, squareWithHole, boundaries);

  it('clips to the polygon, excludes holes and out-of-box points', () => {
    // ids 1 and 3 are inside the outer ring and outside the hole; id 2 is in the
    // hole; id 4 is outside SC_BOUNDS. So scTotal = 2.
    expect(result.scTotal).toBe(2);
  });

  it('dedups repeated camera ids in scTotal', () => {
    const dupCams: Camera[] = [
      { id: 7, lat: 33.2, lon: -82.5 },
      { id: 7, lat: 33.2, lon: -82.5 },
    ];
    expect(countScCameras(dupCams, squareWithHole, new Map()).scTotal).toBe(1);
  });

  it('counts per jurisdiction (record tally) and reports only non-zero keys', () => {
    // county:test = same square-with-hole -> ids 1,3 = 2.
    // place:multi = two squares; id 1 (lon -82.5,lat 33.2) is in the first square,
    // id 3 (lon -79.5,lat 34.5) in the second -> 2. id 2 is in neither.
    expect(result.perJurisdiction).toEqual({ 'county:test': 2, 'place:multi': 2 });
    expect(result.jurisdictions).toBe(2);
  });

  it('exposes SC_BOUNDS as the documented SC box', () => {
    expect(SC_BOUNDS).toEqual({ minLat: 31.5, maxLat: 35.5, minLon: -84.0, maxLon: -78.0 });
  });
});

// --- Shared payload validator: the single source of truth both boundaries call ---

describe('isWellFormedCamera', () => {
  it('accepts a record with an id and finite numeric lat/lon', () => {
    expect(isWellFormedCamera({ id: 1, lat: 34, lon: -81 })).toBe(true);
    expect(isWellFormedCamera({ id: 'abc', lat: 33.5, lon: -80.2 })).toBe(true);
  });

  it('rejects a missing id, non-numeric coords, and non-finite coords', () => {
    expect(isWellFormedCamera({ lat: 34, lon: -81 })).toBe(false); // no id
    expect(isWellFormedCamera({ id: 1, lat: 'x', lon: 'y' })).toBe(false); // string coords
    expect(isWellFormedCamera({ id: 1, lat: Number.NaN, lon: -81 })).toBe(false); // NaN
    expect(isWellFormedCamera({ id: 1, lat: Infinity, lon: -81 })).toBe(false); // Infinity
    expect(isWellFormedCamera(null)).toBe(false);
    expect(isWellFormedCamera('nope')).toBe(false);
  });
});

describe('assertValidCameraPayload (all-or-nothing)', () => {
  it('passes a non-empty array of fully well-formed records', () => {
    expect(() =>
      assertValidCameraPayload([
        { id: 1, lat: 34, lon: -81 },
        { id: 2, lat: 34.5, lon: -80 },
      ]),
    ).not.toThrow();
  });

  it('throws InvalidCameraPayloadError for a non-array', () => {
    expect(() => assertValidCameraPayload({ oops: true })).toThrow(InvalidCameraPayloadError);
    expect(() => assertValidCameraPayload(null)).toThrow(InvalidCameraPayloadError);
  });

  it('throws for an empty array (never a valid snapshot)', () => {
    expect(() => assertValidCameraPayload([])).toThrow(InvalidCameraPayloadError);
  });

  it('throws when ANY record is malformed — never a filtered subset', () => {
    // One bad record poisons the whole payload; the two valid ones are NOT
    // silently kept. This is the property both boundaries rely on so a mixed
    // snapshot can never be written/committed or cached as a partial count.
    expect(() =>
      assertValidCameraPayload([
        { id: 1, lat: 34, lon: -81 }, // well-formed
        { id: 2, lat: 34.5, lon: -80 }, // well-formed
        { id: 3, lat: 'x', lon: 'y' }, // malformed
      ]),
    ).toThrow(InvalidCameraPayloadError);
  });
});

// --- Parity: the new module must match the pre-refactor inline logic exactly ---

function legacyPointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function legacyPointInPolygon(lat: number, lng: number, geometry: any): boolean {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    if (!legacyPointInRing(lat, lng, rings[0])) return false;
    for (let h = 1; h < rings.length; h++) if (legacyPointInRing(lat, lng, rings[h])) return false;
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (let p = 0; p < geometry.coordinates.length; p++) {
      const rings = geometry.coordinates[p];
      if (!legacyPointInRing(lat, lng, rings[0])) continue;
      let inHole = false;
      for (let h = 1; h < rings.length; h++) if (legacyPointInRing(lat, lng, rings[h])) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}
function legacyPointInFc(lat: number, lng: number, fc: any): boolean {
  const features = fc.features || [];
  for (let i = 0; i < features.length; i++) if (legacyPointInPolygon(lat, lng, features[i].geometry)) return true;
  return false;
}
function legacyCount(
  all: Camera[],
  stateFc: FeatureCollection,
  boundaries: Map<string, FeatureCollection>,
) {
  const cams = all.filter(
    (c) =>
      typeof c.lat === 'number' && typeof c.lon === 'number' &&
      c.lat >= 31.5 && c.lat <= 35.5 && c.lon >= -84.0 && c.lon <= -78.0,
  );
  const scIds = new Set<Camera['id']>();
  for (const c of cams) if (legacyPointInFc(c.lat, c.lon, stateFc)) scIds.add(c.id);
  const counts: Record<string, number> = {};
  for (const [key, fc] of boundaries) {
    let n = 0;
    for (const c of cams) if (legacyPointInFc(c.lat, c.lon, fc)) n++;
    if (n > 0) counts[key] = n;
  }
  return { scTotal: scIds.size, jurisdictions: Object.keys(counts).length, perJurisdiction: counts };
}

describe('parity with pre-refactor inline logic', () => {
  it('produces identical results over a mixed fixture (dedup, holes, MultiPolygon, bbox)', () => {
    // Includes a duplicate id so the parity check covers both the deduped scTotal
    // path and the record-tally per-jurisdiction path.
    const parityCams: Camera[] = [
      ...cameras,
      { id: 1, lat: 33.2, lon: -82.5 }, // duplicate of id 1
    ];
    const boundaries = new Map<string, FeatureCollection>([
      ['county:test', squareWithHole],
      ['place:multi', multiJurisdiction],
    ]);
    expect(countScCameras(parityCams, squareWithHole, boundaries)).toEqual(
      legacyCount(parityCams, squareWithHole, boundaries),
    );
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run src/lib/sc-camera-count.test.ts
```

Expected: the suite fails to load — `Error: Failed to resolve import "./sc-camera-count.js"`
(the module does not exist yet). 0 tests passed.

### Step 3 — Minimal implementation

Create `src/lib/sc-camera-count.ts`:

```ts
/**
 * sc-camera-count.ts — the single source of truth for South Carolina's ALPR
 * camera figures (design 2026-09-04 §3.1).
 *
 * The rigorous, deploy-independent count: unique camera IDs whose coordinates
 * fall inside the SC boundary polygon (public/districts/state-outline.json),
 * plus a per-jurisdiction breakdown from the county-*/place-* boundary files.
 * The point-in-polygon test is the repo's canonical routine, imported from
 * ./geo-utils (holes + MultiPolygon handled there), so this module and the
 * production district matcher can never disagree.
 *
 * Imported by BOTH scripts/build-impact-stats.ts (build-time impact-stats.json
 * + camera-counts.json) and netlify/functions/sc-camera-count.ts (the daily
 * live endpoint), so the two paths share one methodology.
 */
import { pointInPolygon, type FeatureCollection } from './geo-utils.js';

/** A DeFlock camera record — the fields the count needs. */
export interface Camera {
  id: number | string;
  lat: number;
  lon: number;
}

/**
 * A camera record is well-formed only with an id (number|string) and FINITE
 * numeric lat/lon. This is the single source of truth for structural validity,
 * imported by BOTH boundaries — the live Netlify function and the refresh/build
 * fetch step (scripts/fetch-camera-data.ts) — so neither path can silently count,
 * cache, or commit a malformed record. (A string/NaN/Infinity coord or a missing
 * id fails.)
 */
export function isWellFormedCamera(record: unknown): record is Camera {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  return (
    (typeof r.id === 'number' || typeof r.id === 'string') &&
    typeof r.lat === 'number' &&
    Number.isFinite(r.lat) &&
    typeof r.lon === 'number' &&
    Number.isFinite(r.lon)
  );
}

/** Thrown by assertValidCameraPayload when a snapshot is unusable. */
export class InvalidCameraPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCameraPayloadError';
  }
}

/**
 * ALL-OR-NOTHING payload gate — the single validator BOTH boundaries call before
 * a raw camera snapshot is trusted. Throws InvalidCameraPayloadError unless `raw`
 * is a NON-EMPTY array in which EVERY record is well-formed: one malformed record
 * rejects the WHOLE payload (never a filtered undercount). On return, `raw` is
 * narrowed to Camera[].
 *
 * Usage differs only in how each boundary handles the throw, never in what counts
 * as valid:
 *   - the live function (netlify/functions/sc-camera-count.ts) calls it inside its
 *     try/catch, so a throw becomes the uncached { stale:true } sentinel;
 *   - the refresh/build fetch step (scripts/fetch-camera-data.ts) calls it BEFORE
 *     writing public/camera-data.json, so a throw exits the process non-zero and
 *     leaves the prior committed snapshot intact.
 * Neither path ever writes/caches/commits a malformed snapshot, and the shared
 * counter (countScCameras) does only its geographic SC-bbox clip — no structural
 * filtering of its own.
 */
export function assertValidCameraPayload(raw: unknown): asserts raw is Camera[] {
  if (!Array.isArray(raw)) {
    throw new InvalidCameraPayloadError('camera payload is not an array');
  }
  if (raw.length === 0) {
    throw new InvalidCameraPayloadError('camera payload is empty');
  }
  if (!raw.every(isWellFormedCamera)) {
    throw new InvalidCameraPayloadError(
      'camera payload contains a malformed record (missing id or non-finite lat/lon)',
    );
  }
}

/**
 * SC bounding box — the cheap pre-filter run before the expensive
 * point-in-polygon work (mirrors scripts/build-camera-counts.py). The DeFlock
 * snapshot spans the whole SE-US CDN tile (~62k cameras); this trims it to a
 * few thousand SC candidates. Longitude is `lon` to match the camera records.
 */
export const SC_BOUNDS = {
  minLat: 31.5,
  maxLat: 35.5,
  minLon: -84.0,
  maxLon: -78.0,
} as const;

export interface ScCountResult {
  /** Unique camera IDs inside the state-outline polygon. */
  scTotal: number;
  /** Number of county/place keys with a non-zero count. */
  jurisdictions: number;
  /** Non-zero per-jurisdiction counts, keyed "county:x" / "place:y". */
  perJurisdiction: Record<string, number>;
}

/** True when a camera has usable coords inside the SC bounding box. */
export function inScBounds(camera: Camera): boolean {
  return (
    typeof camera.lat === 'number' &&
    typeof camera.lon === 'number' &&
    camera.lat >= SC_BOUNDS.minLat &&
    camera.lat <= SC_BOUNDS.maxLat &&
    camera.lon >= SC_BOUNDS.minLon &&
    camera.lon <= SC_BOUNDS.maxLon
  );
}

/** Trim a full CDN snapshot to the SC-area candidates worth testing. */
export function filterToScBounds(cameras: Camera[]): Camera[] {
  return cameras.filter(inScBounds);
}

/** True if the point falls inside ANY feature of a jurisdiction FeatureCollection. */
export function pointInFeatureCollection(
  lat: number,
  lng: number,
  fc: FeatureCollection,
): boolean {
  const features = fc.features ?? [];
  for (let i = 0; i < features.length; i++) {
    if (pointInPolygon(lat, lng, features[i].geometry)) return true;
  }
  return false;
}

/** 'county-greenville.json' -> 'county:greenville', 'place-x.json' -> 'place:x'. */
export function keyFromFilename(filename: string): string | null {
  const name = filename.replace(/^.*[\\/]/, '').replace(/\.json$/i, '');
  const m = name.match(/^(county|place)-(.+)$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * The full SC count. `cameras` is a raw snapshot — the SC-bbox pre-filter is
 * applied here so every caller shares it. `stateOutline` is state-outline.json;
 * `boundaries` maps each jurisdiction key to its FeatureCollection.
 *
 * Coordinate-order note: pointInPolygon takes (lat, lng); camera records carry
 * lat/lon; GeoJSON rings are [lng, lat]. The swap is handled by passing
 * (c.lat, c.lon).
 */
export function countScCameras(
  cameras: Camera[],
  stateOutline: FeatureCollection,
  boundaries: Map<string, FeatureCollection>,
): ScCountResult {
  const candidates = filterToScBounds(cameras);

  const scIds = new Set<Camera['id']>();
  for (const c of candidates) {
    if (pointInFeatureCollection(c.lat, c.lon, stateOutline)) scIds.add(c.id);
  }

  const perJurisdiction: Record<string, number> = {};
  for (const [key, fc] of boundaries) {
    let count = 0;
    for (const c of candidates) {
      if (pointInFeatureCollection(c.lat, c.lon, fc)) count++;
    }
    if (count > 0) perJurisdiction[key] = count;
  }

  return {
    scTotal: scIds.size,
    jurisdictions: Object.keys(perJurisdiction).length,
    perJurisdiction,
  };
}
```

### Step 4 — Run the test (expect PASS)

```
npx vitest run src/lib/sc-camera-count.test.ts
```

Expected: all tests pass (parity block included).

### Step 5 — Commit

```
git add src/lib/sc-camera-count.ts src/lib/sc-camera-count.test.ts
git commit -m "$(cat <<'EOF'
feat(counter): shared SC camera-count module + payload validator

Extract the SC point-in-polygon count (scTotal + per-jurisdiction) into a
pure, Vitest-covered module reusing geo-utils.pointInPolygon, so the build
script and the forthcoming live endpoint share one methodology. Also add the
shared all-or-nothing payload validator (isWellFormedCamera +
assertValidCameraPayload) that both the live function and the refresh/build
fetch step call, so a malformed CDN snapshot is rejected identically at both
boundaries and can never be counted, cached, or committed. Includes unit tests
for the validator and a parity test against a verbatim copy of the pre-refactor
inline algorithm.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Refactor `build-impact-stats` to import the shared module

Convert `scripts/build-impact-stats.mjs` → `scripts/build-impact-stats.ts`, dropping its inline
`pointInRing`/`pointInPolygon` copy in favor of `countScCameras`. Because a plain-`node` `.mjs`
cannot import a `.ts` module, run it through esbuild — the repo's existing pattern for the
`codes` and `build-wordlist` scripts. It also imports the shared `assertValidCameraPayload` and
re-asserts the snapshot before any write (defense-in-depth behind the primary fetch-boundary gate
added in Task 2.5).

**Files:**
- Create: `scripts/build-impact-stats.ts` (replaces the `.mjs`).
- Delete: `scripts/build-impact-stats.mjs`.
- Modify: `package.json` — add the `build-impact-stats` script.
- Test: `tests/config-guards.test.ts` — add a source-text guard that the refactor happened.
- Test: `tests/build-impact-stats.exec.test.ts` — **execution-level** regression: bundle the
  generator exactly as the npm script does, run the bundle from a fixture project root, and assert
  it resolves the boundary files from `process.cwd()` and writes correct figures. This is the guard
  that fails if `ROOT` ever regresses to an `import.meta.url` walk (which points into
  `node_modules/.cache` post-bundle). A unit test alone cannot catch that — the bug only exists in
  the bundled artifact, so it must be *executed*.

### Step 1 — Write the failing test

Add to `tests/config-guards.test.ts` (after the existing `netlify.toml` describe):

```ts
describe('build-impact-stats refactor (single source of truth)', () => {
  const script = read('scripts/build-impact-stats.ts');

  it('imports the shared count module instead of an inline copy', () => {
    expect(script).toMatch(/from ['"]\.\.\/src\/lib\/sc-camera-count\.js['"]/);
    expect(script).toContain('countScCameras');
  });

  it('no longer defines an inline point-in-polygon routine', () => {
    expect(script).not.toMatch(/function pointInRing/);
    expect(script).not.toMatch(/function pointInPolygon/);
  });

  it('exposes an esbuild-bundled npm script', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['build-impact-stats']).toContain('esbuild scripts/build-impact-stats.ts');
    expect(pkg.scripts['build-impact-stats']).toContain('node node_modules/.cache/build-impact-stats.mjs');
  });
});
```

Then create `tests/build-impact-stats.exec.test.ts` — the execution-level regression that runs the
**bundled** generator (not the `.ts` source) and proves it locates the boundary files and writes
correct output. It bundles with the same esbuild flags as the npm script, then runs the bundle with
its cwd pointed at a throwaway fixture project root. If `ROOT` were derived from `import.meta.url`,
the bundle (living under `node_modules/.cache`) would look for `public/camera-data.json` there,
throw `ENOENT`, and this test would fail — so a clean run IS the assertion that `ROOT` is
`process.cwd()`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'build-impact-stats.exec-test.mjs');

// A square covering the SC test coords (lon -83..-79, lat 33..35), GeoJSON [lng, lat].
const scSquare = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-83, 33], [-79, 33], [-79, 35], [-83, 35], [-83, 33]]],
      },
    },
  ],
};

// Two cameras inside the square, one outside the SC bbox (pre-filtered out).
const cameras = [
  { id: 1, lat: 34, lon: -81 },
  { id: 2, lat: 34.5, lon: -80 },
  { id: 3, lat: 40, lon: -100 },
];

let fixtureRoot: string;

beforeAll(async () => {
  // Bundle the generator with the EXACT flags the `build-impact-stats` npm script
  // uses (bundle + platform node + esm + external packages). This produces the
  // same node_modules/.cache artifact whose ROOT resolution is under test.
  await build({
    entryPoints: [join(repoRoot, 'scripts', 'build-impact-stats.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: bundlePath,
  });

  // A throwaway project root holding ONLY the inputs the generator reads, so a
  // pass proves it resolved them from process.cwd() (this dir), not from the
  // bundle's own location under node_modules/.cache.
  fixtureRoot = mkdtempSync(join(tmpdir(), 'impact-stats-exec-'));
  mkdirSync(join(fixtureRoot, 'public', 'districts'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  writeFileSync(join(fixtureRoot, 'public', 'camera-data.json'), JSON.stringify(cameras));
  writeFileSync(
    join(fixtureRoot, 'public', 'districts', 'state-outline.json'),
    JSON.stringify(scSquare),
  );
  writeFileSync(
    join(fixtureRoot, 'public', 'districts', 'county-test.json'),
    JSON.stringify(scSquare),
  );
}, 120_000);

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
});

describe('build-impact-stats bundled execution (cluster: bundled-script-root)', () => {
  it('resolves public/ + src/data from process.cwd() and writes correct figures', () => {
    // Run the bundle from the fixture root. A throw here (ENOENT) is the failure
    // signal that ROOT regressed to an import.meta.url walk into node_modules.
    execFileSync(process.execPath, [bundlePath], {
      cwd: fixtureRoot,
      env: { ...process.env, IMPACT_STATS_DATE: '2026-09-04T00:00:00Z' },
      stdio: 'ignore',
    });

    const stats = JSON.parse(
      readFileSync(join(fixtureRoot, 'src', 'data', 'impact-stats.json'), 'utf8'),
    );
    const counts = JSON.parse(
      readFileSync(join(fixtureRoot, 'public', 'camera-counts.json'), 'utf8'),
    );

    // ids 1 + 2 are inside the square; id 3 is outside the SC bbox.
    expect(stats.scTotal).toBe(2);
    expect(stats.jurisdictions).toBe(1);
    expect(stats.generatedAt).toBe('2026-09-04T00:00:00.000Z');
    expect(counts).toEqual({ 'county:test': 2 });
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "build-impact-stats refactor"
npx vitest run tests/build-impact-stats.exec.test.ts
```

Expected: BOTH fail — `read('scripts/build-impact-stats.ts')` throws `ENOENT` (the file is still
`.mjs`), so the config-guards describe errors; and the exec test's `beforeAll` esbuild `build`
fails to resolve the not-yet-created `scripts/build-impact-stats.ts` entry point. (`read` uses
`readFileSync`, which throws on a missing file.)

### Step 3 — Minimal implementation

Create `scripts/build-impact-stats.ts` (the header keeps the atomic-refresh rationale; the PIP
port is gone, replaced by the import):

```ts
/**
 * build-impact-stats.ts — atomic camera-refresh generator (design §4.1).
 *
 * Produces two artifacts from a SINGLE point-in-polygon pass over the fetched
 * camera snapshot, so the numbers can never disagree:
 *   - public/camera-counts.json   per-jurisdiction non-zero counts
 *   - src/data/impact-stats.json  { scTotal, jurisdictions, generatedAt }
 *
 * The count methodology lives in src/lib/sc-camera-count.ts (imported below and
 * shared with netlify/functions/sc-camera-count.ts), so the build-time figure
 * and the live endpoint use identical logic. Run via `npm run build-impact-stats`,
 * which esbuild-bundles this TS (and the shared module) before executing it.
 * Because that bundle lands in node_modules/.cache, all paths are resolved from
 * process.cwd() (the repo root) — NOT from import.meta.url, which after bundling
 * points into node_modules/.cache and cannot locate public/ or src/data/.
 *
 * generatedAt defaults to now; override for reproducible runs with IMPACT_STATS_DATE.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countScCameras,
  keyFromFilename,
  filterToScBounds,
  assertValidCameraPayload,
  type Camera,
} from '../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../src/lib/geo-utils.js';

// esbuild bundles this generator to node_modules/.cache/build-impact-stats.mjs
// before Node runs it, so import.meta.url resolves INTO node_modules and is
// useless for finding repo files. Resolve every path from process.cwd(), which
// npm sets to the repo root — identical to the build-wordlist / organizer-codes
// scripts (see their headers). Deriving ROOT from import.meta.url here would make
// the generator (and the daily refresh workflow) read from node_modules and fail.
const ROOT = process.cwd();
const CAMERA_DATA = resolve(ROOT, 'public', 'camera-data.json');
const DISTRICTS_DIR = resolve(ROOT, 'public', 'districts');
const STATE_OUTLINE = resolve(DISTRICTS_DIR, 'state-outline.json');
const COUNTS_OUT = resolve(ROOT, 'public', 'camera-counts.json');
const STATS_OUT = resolve(ROOT, 'src', 'data', 'impact-stats.json');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function main(): void {
  const raw = readJson<unknown>(CAMERA_DATA);
  // Defense-in-depth: the committed snapshot is already validated at the fetch
  // boundary (scripts/fetch-camera-data.ts) with this SAME shared validator, but
  // re-assert here BEFORE any artifact write so a standalone/local run on a stale
  // or hand-edited public/camera-data.json can never derive (or overwrite the
  // committed figures with) a malformed count. A throw exits non-zero before any
  // writeFileSync.
  assertValidCameraPayload(raw);
  const allCameras: Camera[] = raw;
  console.log(
    `Loaded ${allCameras.length} cameras; ${filterToScBounds(allCameras).length} inside the SC bounding box`,
  );

  const stateOutline = readJson<FeatureCollection>(STATE_OUTLINE);

  const boundaries = new Map<string, FeatureCollection>();
  const boundaryFiles = readdirSync(DISTRICTS_DIR)
    .filter((f) => /^(county|place)-.+\.json$/.test(f))
    .sort();
  for (const file of boundaryFiles) {
    const key = keyFromFilename(file);
    if (!key) continue;
    boundaries.set(key, readJson<FeatureCollection>(resolve(DISTRICTS_DIR, file)));
  }

  const { scTotal, jurisdictions, perJurisdiction } = countScCameras(
    allCameras,
    stateOutline,
    boundaries,
  );
  console.log(`SC total (unique camera IDs inside state-outline.json): ${scTotal}`);
  console.log(`Non-zero jurisdictions: ${jurisdictions}`);

  // camera-counts.json: sorted keys, 2-space indent, trailing newline
  // (matches build-camera-counts.py and the prior generator byte-for-byte).
  const sortedCounts: Record<string, number> = {};
  for (const k of Object.keys(perJurisdiction).sort()) sortedCounts[k] = perJurisdiction[k];
  writeFileSync(COUNTS_OUT, JSON.stringify(sortedCounts, null, 2) + '\n');
  console.log(`Wrote ${COUNTS_OUT} (${jurisdictions} entries)`);

  const generatedAt = (
    process.env.IMPACT_STATS_DATE ? new Date(process.env.IMPACT_STATS_DATE) : new Date()
  ).toISOString();
  const stats = { scTotal, jurisdictions, generatedAt };
  writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2) + '\n');
  console.log(`Wrote ${STATS_OUT}: ${JSON.stringify(stats)}`);
}

main();
```

Delete the old script:

```
git rm scripts/build-impact-stats.mjs
```

Add the npm script to `package.json` (mirrors the existing `codes` script exactly):

```jsonc
    "build-wordlist": "esbuild scripts/build-wordlist.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/build-wordlist.mjs && node node_modules/.cache/build-wordlist.mjs",
    "build-impact-stats": "esbuild scripts/build-impact-stats.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/build-impact-stats.mjs && node node_modules/.cache/build-impact-stats.mjs",
```

(`--packages=external` keeps `node:*` builtins external; the relative `../src/lib/*` imports are
bundled. esbuild resolves the `.js` import specifiers to their `.ts` sources — the same
mechanism the `codes`/`build-wordlist` scripts already rely on.)

### Step 4 — Run the tests (expect PASS) + parity re-verify

```
npx vitest run tests/config-guards.test.ts -t "build-impact-stats refactor"
npx vitest run tests/build-impact-stats.exec.test.ts
```

Expected: the three refactor guards pass, and the bundled-execution regression passes — the bundle
ran from a fixture cwd, found the boundary files there, and wrote scTotal 2 / jurisdictions 1.

Then prove behavioral parity on real data (requires deps + generated boundary files):

```
npm ci
npm run prebuild                # populates public/districts from open-civics-boundaries
npm run build-impact-stats
git --no-pager diff src/data/impact-stats.json
```

Expected: `scTotal` and `jurisdictions` are unchanged from HEAD (only `generatedAt` differs);
`git --no-pager diff public/camera-counts.json` shows no change. This confirms the refactor
reproduced the committed 1,624 / 37 figures.

### Step 5 — Commit

```
git add scripts/build-impact-stats.ts package.json tests/config-guards.test.ts tests/build-impact-stats.exec.test.ts
git rm --cached --ignore-unmatch scripts/build-impact-stats.mjs
git commit -m "$(cat <<'EOF'
refactor(counter): build-impact-stats imports shared count module

Replace the inline point-in-polygon copy in build-impact-stats with the shared
src/lib/sc-camera-count module, and run the (now TypeScript) generator through
the repo's esbuild-bundle script pattern. Resolve paths from process.cwd() (not
import.meta.url, which points into node_modules/.cache after bundling). Output
bytes and figures unchanged (guarded by the parity test); a source-text guard
prevents re-inlining and an execution-level regression runs the bundled
generator against a fixture root to prove ROOT resolves from cwd.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.5 — Validate the fetched CDN payload at the refresh/build boundary

**Why (Codex round 3, blocking).** `scripts/fetch-camera-data.mjs` writes the untrusted DeFlock CDN
response straight to `public/camera-data.json` with NO structural validation, and the daily workflow
immediately derives figures from it and commits them. So a malformed/mixed snapshot that the live
function would reject could still generate and commit a corrupted fallback count. Fix: apply the
SAME shared all-or-nothing validator (`assertValidCameraPayload`, Task 1) at this boundary, BEFORE
the snapshot is written — the untrusted-input choke point of the refresh/build pipeline. Because a
plain-`node` `.mjs` cannot import the shared `.ts`, convert `fetch-camera-data` to `.ts` + an
esbuild-bundle npm script (identical to Task 2 / `codes` / `build-wordlist`), so there is exactly
ONE validator definition shared across both boundaries — not a re-inlined copy.

**Files:**
- Create: `scripts/fetch-camera-data.ts` (replaces the `.mjs`).
- Delete: `scripts/fetch-camera-data.mjs`.
- Modify: `package.json` — add the `fetch-camera-data` esbuild-bundle script.
- Test: `tests/config-guards.test.ts` — source-text guard that the fetch step imports the shared
  validator and the npm script is bundled.
- Test: `tests/fetch-camera-data.exec.test.ts` — **execution-level** regression: bundle the fetch
  step, stub `fetch` (via a `--import` preload) to return a malformed / empty payload, run the
  bundle from a fixture cwd, and assert a NON-ZERO exit that does NOT overwrite the prior committed
  `public/camera-data.json` (nor the downstream `camera-counts.json` / `impact-stats.json`, which
  the fetch step never touches — proving it fails BEFORE the build step that would). A positive
  control proves a well-formed payload exits 0 and DOES write.

### Step 1 — Write the failing test

Add to `tests/config-guards.test.ts` (after the `build-impact-stats refactor` describe):

```ts
describe('fetch-camera-data validation boundary (single shared validator)', () => {
  const script = read('scripts/fetch-camera-data.ts');

  it('validates via the shared all-or-nothing validator before writing', () => {
    expect(script).toMatch(/from ['"]\.\.\/src\/lib\/sc-camera-count\.js['"]/);
    expect(script).toContain('assertValidCameraPayload');
  });

  it('does not re-inline a local well-formed check (one definition only)', () => {
    expect(script).not.toMatch(/function isWellFormedCamera/);
  });

  it('exposes an esbuild-bundled npm script', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['fetch-camera-data']).toContain('esbuild scripts/fetch-camera-data.ts');
    expect(pkg.scripts['fetch-camera-data']).toContain(
      'node node_modules/.cache/fetch-camera-data.mjs',
    );
  });
});
```

Then create `tests/fetch-camera-data.exec.test.ts` — the execution-level regression that runs the
**bundled** fetch step against a stubbed `fetch` and proves a malformed payload fails before any
artifact is overwritten. `fetch` is replaced in a child process via a `--import` preload module (so
the bundle's own `globalThis.fetch` call is intercepted without any network or port), and the
fixture seeds a prior committed snapshot plus the two downstream artifacts so the "not overwritten"
guarantee is asserted byte-for-byte:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'fetch-camera-data.exec-test.mjs');

// A prior committed snapshot the fetch step must NOT clobber on a bad payload,
// plus the two downstream artifacts the fetch step never writes (seeded so the
// "artifacts unchanged" guarantee is literal — the build step that would write
// them never runs because fetch fails first).
const PRIOR_SNAPSHOT = JSON.stringify([{ id: 42, lat: 34, lon: -81 }]);
const PRIOR_COUNTS = JSON.stringify({ 'county:test': 5 }) + '\n';
const PRIOR_STATS = JSON.stringify({ scTotal: 5, jurisdictions: 1, generatedAt: 'x' }) + '\n';

// A preload module that stubs global fetch to return `records` as the CDN body.
// Evaluated (via `node --import`) BEFORE the bundle's entry point, so the
// bundle's fetch(CDN_URL) call hits this stub — no network, no port.
function preload(records: unknown): string {
  return (
    'globalThis.fetch = async () => new Response(' +
    JSON.stringify(JSON.stringify(records)) +
    ", { status: 200, headers: { 'content-type': 'application/json' } });\n"
  );
}

let fixtureRoot: string;
let cameraData: string;
let countsOut: string;
let statsOut: string;

beforeAll(async () => {
  // Bundle the fetch step with the EXACT flags the `fetch-camera-data` npm script
  // uses, producing the same node_modules/.cache artifact whose behavior is under
  // test.
  await build({
    entryPoints: [join(repoRoot, 'scripts', 'fetch-camera-data.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: bundlePath,
  });
}, 120_000);

afterAll(() => {
  rmSync(bundlePath, { force: true });
});

function seedFixture(): void {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'fetch-camera-exec-'));
  mkdirSync(join(fixtureRoot, 'public'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  cameraData = join(fixtureRoot, 'public', 'camera-data.json');
  countsOut = join(fixtureRoot, 'public', 'camera-counts.json');
  statsOut = join(fixtureRoot, 'src', 'data', 'impact-stats.json');
  writeFileSync(cameraData, PRIOR_SNAPSHOT);
  writeFileSync(countsOut, PRIOR_COUNTS);
  writeFileSync(statsOut, PRIOR_STATS);
}

// Run the bundle from the fixture cwd with `fetch` stubbed to return `records`.
// Returns whether the process exited 0. A throw (non-zero exit) is the failure
// signal the validation boundary produces on a bad payload.
function runBundle(records: unknown): boolean {
  const preloadPath = join(fixtureRoot, 'mock-fetch.mjs');
  writeFileSync(preloadPath, preload(records));
  try {
    execFileSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, bundlePath], {
      cwd: fixtureRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

describe('fetch-camera-data validation boundary (cluster: refresh-boundary-validation)', () => {
  it('FAILS non-zero on a MIXED valid+malformed payload and overwrites NOTHING', () => {
    seedFixture();
    // Two well-formed records + one malformed: the shared all-or-nothing gate must
    // reject the WHOLE payload, so no filtered undercount is ever written.
    const ok = runBundle([
      { id: 1, lat: 34, lon: -81 }, // well-formed, inside SC
      { id: 2, lat: 34.5, lon: -80 }, // well-formed, inside SC
      { id: 3, lat: 'x', lon: 'y' }, // malformed -> poisons the whole payload
    ]);
    expect(ok).toBe(false); // process exited non-zero -> refresh step failed
    // Prior snapshot + both downstream artifacts are byte-for-byte intact.
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expect(readFileSync(countsOut, 'utf8')).toBe(PRIOR_COUNTS);
    expect(readFileSync(statsOut, 'utf8')).toBe(PRIOR_STATS);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero on an EMPTY array and does not write an empty snapshot', () => {
    seedFixture();
    expect(runBundle([])).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('positive control: a fully well-formed payload exits 0 and DOES write the new snapshot', () => {
    seedFixture();
    const fresh = [
      { id: 1, lat: 34, lon: -81 },
      { id: 2, lat: 34.5, lon: -80 },
    ];
    expect(runBundle(fresh)).toBe(true); // exited 0
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(fresh); // snapshot replaced
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "fetch-camera-data validation boundary"
npx vitest run tests/fetch-camera-data.exec.test.ts
```

Expected: BOTH fail — `read('scripts/fetch-camera-data.ts')` throws `ENOENT` (the file is still
`.mjs`), so the config-guards describe errors; and the exec test's `beforeAll` esbuild `build` fails
to resolve the not-yet-created `scripts/fetch-camera-data.ts` entry point.

### Step 3 — Minimal implementation

Create `scripts/fetch-camera-data.ts` (the `.mjs`'s CORS-avoidance purpose is unchanged; the new
part is the shared-validator gate before the write, and `ROOT`=`process.cwd()` for the bundled
artifact):

```ts
/**
 * fetch-camera-data.ts — fetch the DeFlock CDN snapshot and write it to
 * public/camera-data.json for the build-time impact-stats generator (design §4.1).
 * (Fetching server-side also avoids the CDN's missing CORS header.)
 *
 * This is the UNTRUSTED-INPUT boundary of the refresh/build pipeline: the CDN
 * response is validated ALL-OR-NOTHING with the SHARED validator
 * (assertValidCameraPayload from src/lib/sc-camera-count.ts — the SAME gate the
 * live Netlify function applies) BEFORE the snapshot is written. A non-array,
 * empty, or any-malformed payload throws, the process exits non-zero (via
 * main().catch below), and the prior committed public/camera-data.json is left
 * untouched — so a malformed CDN response can never be written or committed as a
 * corrupt fallback, and can never flow into build-impact-stats.
 *
 * Run via `npm run fetch-camera-data`, which esbuild-bundles this TS (and the
 * shared module) before executing it — the repo's codes / build-wordlist /
 * build-impact-stats pattern. Because that bundle lands in node_modules/.cache,
 * the output path is resolved from process.cwd() (the repo root), NOT
 * import.meta.url (which after bundling points into node_modules/.cache).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertValidCameraPayload } from '../src/lib/sc-camera-count.js';

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const USER_AGENT =
  'deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)';
const OUT_PATH = resolve(process.cwd(), 'public', 'camera-data.json');

async function main(): Promise<void> {
  console.log(`Fetching camera data from ${CDN_URL}...`);
  const resp = await fetch(CDN_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) {
    throw new Error(`CDN responded with ${resp.status} ${resp.statusText}`);
  }

  const raw = (await resp.json()) as unknown;
  // Structural gate at the untrusted-input boundary. Throws (-> non-zero exit)
  // BEFORE the write if the payload is not a NON-EMPTY array of well-formed
  // records, so the prior committed snapshot survives and no corrupt snapshot is
  // ever written or committed. Same shared validator the live endpoint uses, so
  // both boundaries reject identical payloads.
  assertValidCameraPayload(raw);
  console.log(`Fetched ${raw.length} cameras (all well-formed)`);

  writeFileSync(OUT_PATH, JSON.stringify(raw));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Failed to fetch camera data:', err);
  process.exit(1);
});
```

Delete the old script:

```
git rm scripts/fetch-camera-data.mjs
```

Add the npm script to `package.json` (immediately above `build-impact-stats`, mirroring it exactly):

```jsonc
    "fetch-camera-data": "esbuild scripts/fetch-camera-data.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/fetch-camera-data.mjs && node node_modules/.cache/fetch-camera-data.mjs",
```

### Step 4 — Run the tests (expect PASS)

```
npx vitest run tests/config-guards.test.ts -t "fetch-camera-data validation boundary"
npx vitest run tests/fetch-camera-data.exec.test.ts
```

Expected: the source-text guards pass, and the exec regression passes — the mixed and empty payloads
each exit non-zero without overwriting any artifact, and the well-formed positive control writes the
new snapshot.

### Step 5 — Commit

```
git add scripts/fetch-camera-data.ts package.json tests/config-guards.test.ts tests/fetch-camera-data.exec.test.ts
git rm --cached --ignore-unmatch scripts/fetch-camera-data.mjs
git commit -m "$(cat <<'EOF'
feat(counter): validate fetched CDN payload at the refresh/build boundary

Close the gap where fetch-camera-data wrote the untrusted DeFlock response to
public/camera-data.json with no validation, letting the daily workflow derive
and commit a corrupted fallback count from a malformed/mixed snapshot that the
live function would have rejected.

Convert fetch-camera-data.mjs -> .ts (esbuild-bundled, like build-impact-stats /
codes / build-wordlist) so it imports the SHARED assertValidCameraPayload and
runs the SAME all-or-nothing validation the live endpoint does, BEFORE writing
the snapshot. A non-array / empty / any-malformed payload throws, exits non-zero,
and leaves the prior committed snapshot intact. Resolve the output path from
process.cwd() (bundle lands in node_modules/.cache). An execution-level
regression stubs fetch to return a mixed valid+malformed payload, runs the
bundle, and proves the non-zero exit overwrites neither the snapshot nor the
downstream artifacts (with a well-formed positive control).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Netlify function `sc-camera-count.ts` + `included_files`

**Files:**
- Create: `netlify/functions/sc-camera-count.ts` — the endpoint.
- Modify: `netlify.toml` — add `[functions] included_files`.
- Test: `tests/functions/sc-camera-count.test.ts` — mocks `node:fs` + `fetch`.

### Step 1 — Write the failing test

Create `tests/functions/sc-camera-count.test.ts` (mirrors the `events.test.ts` mocking style):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from '@netlify/functions';

// A square covering SC coords (lon -83..-79, lat 33..35) in GeoJSON [lng, lat].
const scSquare = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-83, 33], [-79, 33], [-79, 35], [-83, 35], [-83, 33]]],
      },
    },
  ],
};

// Mock the districts files the function reads from disk.
vi.mock('node:fs', () => ({
  readFileSync: (p: string) => JSON.stringify(scSquare), // state-outline + county-test both use it
  readdirSync: () => ['state-outline.json', 'county-test.json'],
}));

import handler from '../../netlify/functions/sc-camera-count.js';

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const CDN_CACHE = 'public, durable, s-maxage=86400, stale-while-revalidate=86400';

function call(url = 'https://deflocksc.org/api/sc-camera-count'): Promise<Response> {
  return handler(new Request(url), {} as unknown as Context);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/sc-camera-count — success', () => {
  it('returns the SC count, cache header, and calls the DeFlock CDN with a UA', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 1, lat: 34, lon: -81 }, // inside -> counts
          { id: 1, lat: 34, lon: -81 }, // dup -> deduped
          { id: 2, lat: 34.5, lon: -80 }, // inside -> counts
          { id: 3, lat: 40, lon: -100 }, // outside bbox -> excluded
        ]),
        { status: 200 },
      ),
    );

    const res = await call();
    const body = (await res.json()) as {
      scTotal: number;
      jurisdictions: number;
      stale: boolean;
      generatedAt: string;
    };

    expect(res.status).toBe(200);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe(CDN_CACHE);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.scTotal).toBe(2); // ids 1 (deduped) + 2; id 3 out of bbox
    expect(body.jurisdictions).toBe(1); // one non-zero key (county:test)
    expect(body.stale).toBe(false);
    expect(typeof body.generatedAt).toBe('string');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(CDN_URL);
    expect((opts as RequestInit).headers).toMatchObject({
      'User-Agent': expect.stringContaining('deflocksc-website'),
    });
    // The fetch is bounded by an abort timeout so a hung DeFlock fails soft
    // instead of riding the platform function timeout.
    expect((opts as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('GET /api/sc-camera-count — cache-key hardening', () => {
  it('rejects a cache-busting query WITHOUT touching DeFlock', async () => {
    // Netlify's default durable-cache key includes the query string, so
    // /api/sc-camera-count?bust=<rand> would miss the edge cache and hit DeFlock
    // on every request. A query-bearing request must never reach the upstream.
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));

    const res = await call('https://deflocksc.org/api/sc-camera-count?bust=123456');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/sc-camera-count — fail soft', () => {
  it('returns 200 { stale:true } uncached when the CDN is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 502 }));

    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 200 { stale:true } when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } when the CDN payload is not an array', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ oops: true }), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
  });

  it('returns 200 { stale:true } uncached for an EMPTY camera array (never caches 0)', async () => {
    // An empty upstream snapshot must not be cached as a valid {stale:false}
    // result for 24h; treat it as a soft failure.
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } with NO bogus total when ALL records are malformed', async () => {
    // A record missing an id, or with non-numeric coords, must not be counted
    // into a positive total. Every record here is malformed, so the all-or-nothing
    // check fails the payload and the endpoint fails soft rather than caching a
    // fabricated number.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { lat: 34, lon: -81 }, // no id
          { id: 9, lat: 'x', lon: 'y' }, // non-numeric coords
        ]),
        { status: 200 },
      ),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } uncached for a MIXED valid+malformed payload (no cached undercount)', async () => {
    // ALL-OR-NOTHING: a payload mixing well-formed and malformed records must NOT
    // be filtered down to the valid subset and cached — that would pin a 24h
    // undercount to the edge (and preprocess the live data differently from the
    // build path). ONE bad record fails the WHOLE snapshot soft. The two valid
    // records below (which alone would yield scTotal 2 / jurisdictions 1) must be
    // discarded, not counted. Proven by asserting NO scTotal field and no cache.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 1, lat: 34, lon: -81 }, // well-formed, inside SC
          { id: 2, lat: 34.5, lon: -80 }, // well-formed, inside SC
          { id: 3, lat: 'x', lon: 'y' }, // malformed -> poisons the whole payload
        ]),
        { status: 200 },
      ),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true }); // exactly { stale:true } — no scTotal, no jurisdictions
    expect(body.scTotal).toBeUndefined(); // proves no filtered undercount was cached
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } uncached when the count is ZERO (no SC matches)', async () => {
    // Well-formed cameras that all fall outside SC -> scTotal 0. A zero total is
    // an upstream/compute anomaly and must never be cached for a day.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, lat: 40, lon: -100 }]), { status: 200 }),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    // The upstream WAS fetched (this is a compute anomaly, not a query reject).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 { stale:true } uncached when the fetch aborts (timeout)', async () => {
    // AbortSignal.timeout fires a TimeoutError; the handler must catch it and
    // fail soft rather than propagate to the platform timeout.
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('does not leak the upstream error message', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'));
    const body = await (await call()).text();
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.0.0.5');
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/functions/sc-camera-count.test.ts
```

Expected: FAIL — `Failed to resolve import "../../netlify/functions/sc-camera-count.js"`.

### Step 3 — Minimal implementation

Create `netlify/functions/sc-camera-count.ts`:

```ts
import type { Config, Context } from '@netlify/functions';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countScCameras,
  keyFromFilename,
  assertValidCameraPayload,
  type Camera,
} from '../../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../../src/lib/geo-utils.js';

/**
 * GET /api/sc-camera-count — the daily-fresh SC camera total (design §3.2).
 *
 * Fetches the DeFlock CDN snapshot the same way scripts/fetch-camera-data.ts
 * does (same URL + User-Agent + shared validator), applies the SC bounding-box pre-filter and the
 * shared point-in-polygon count (src/lib/sc-camera-count.ts — identical
 * methodology to the build-time impact-stats.json), and returns an aggregate
 * count only (no coordinates, no PII).
 *
 * Edge-cached for a day with day-long stale-while-revalidate, so DeFlock is hit
 * at most ~once/day site-wide and viewers get an instant edge response. To keep
 * that politeness guarantee, any request carrying a query string is rejected
 * BEFORE the upstream fetch — Netlify's default cache key includes the query, so
 * a cache-busting `?x=` would otherwise miss the edge cache and hit DeFlock on
 * every request.
 *
 * Fail-soft contract (never 5xxs, never caches a bad number): the upstream fetch
 * is bounded by an abort timeout (so a hung DeFlock cannot ride the platform
 * function timeout); the payload is validated ALL-OR-NOTHING (array, non-empty,
 * and EVERY record well-formed — one malformed record rejects the whole payload
 * rather than silently caching a filtered undercount); and the computed result is
 * validated (both scTotal and jurisdictions must be positive integers, so a zero
 * total or an incomplete boundary bundle cannot cache as success) before caching.
 * The timeout, non-ok, non-array, empty-array, any-malformed-record, zero-result,
 * and non-positive-jurisdictions cases all return HTTP 200 { stale:true } with no
 * scTotal and NO durable caching, so the homepage silently keeps its build-time
 * number and the next request can recover immediately.
 *
 * Live-vs-build validation boundaries (the SAME gate on both paths): the shared
 * counter (src/lib/sc-camera-count.ts) does NO structural/data-quality filtering —
 * it applies only the geographic SC-bbox clip that IS the counting methodology
 * (identical in both paths) and counts exactly the records it is handed.
 * STRUCTURAL validation lives at each boundary, and it is the SAME shared
 * validator on both: THIS function calls assertValidCameraPayload on its untrusted
 * live DeFlock fetch, and the refresh/build fetch step
 * (scripts/fetch-camera-data.ts) calls the identical assertValidCameraPayload on
 * the untrusted CDN response BEFORE it writes public/camera-data.json — so the
 * committed snapshot the build derives figures from is clean because it was
 * validated at fetch, not "trusted by assumption" (the earlier reconciliation that
 * called the build input already-trusted was wrong: that snapshot is itself an
 * unvalidated CDN fetch until this gate runs). Both paths reject a non-array,
 * empty, or any-malformed payload all-or-nothing (one bad record fails the WHOLE
 * payload — never a filtered undercount), so both feed the shared counter
 * structurally-clean records without either ever silently dropping a malformed
 * subset.
 */

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const USER_AGENT =
  'deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)';

// Bound the upstream fetch well under Netlify's ~10s function timeout, so a hung
// DeFlock aborts here and fails soft (see the catch) instead of 5xx-ing. The
// point-in-polygon pass over a few thousand SC candidates is fast, leaving ample
// headroom.
const FETCH_TIMEOUT_MS = 8000;

// state-outline.json + county-*/place-*.json are generated into public/districts
// by the prebuild (scripts/sync-open-civics.mjs) and bundled into this function
// via `included_files` in netlify.toml (they are otherwise gitignored). Netlify
// runs functions with the project root as cwd, so the bundled files resolve here.
const DISTRICTS_DIR = resolve(process.cwd(), 'public', 'districts');

const CDN_CACHE = 'public, durable, s-maxage=86400, stale-while-revalidate=86400';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function loadBoundaries(): {
  stateOutline: FeatureCollection;
  boundaries: Map<string, FeatureCollection>;
} {
  const stateOutline = readJson<FeatureCollection>(resolve(DISTRICTS_DIR, 'state-outline.json'));
  const boundaries = new Map<string, FeatureCollection>();
  const files = readdirSync(DISTRICTS_DIR)
    .filter((f) => /^(county|place)-.+\.json$/.test(f))
    .sort();
  for (const file of files) {
    const key = keyFromFilename(file);
    if (!key) continue;
    boundaries.set(key, readJson<FeatureCollection>(resolve(DISTRICTS_DIR, file)));
  }
  return { stateOutline, boundaries };
}

function jsonResponse(body: unknown, cacheable: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    // Browsers must not hold this; the CDN is the only cache tier that does.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (cacheable) headers.set('Netlify-CDN-Cache-Control', CDN_CACHE);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    // Query params are part of Netlify's default durable-cache key, so a
    // cache-busting `?x=` would miss the edge cache and hit DeFlock on every
    // request (design §6 politeness). The homepage only ever fetches the bare
    // path, so reject anything carrying a query BEFORE the upstream fetch — this
    // request can never reach DeFlock and is never cached. Done inside the try so
    // a malformed URL still fails soft.
    if (new URL(req.url).search !== '') return jsonResponse({ stale: true }, false);

    const resp = await fetch(CDN_URL, {
      headers: { 'User-Agent': USER_AGENT },
      // Bounded so a hung upstream aborts (TimeoutError -> catch) rather than
      // riding the platform function timeout into a 5xx.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return jsonResponse({ stale: true }, false);

    const raw = (await resp.json()) as unknown;
    // ALL-OR-NOTHING structural validation via the SHARED validator
    // (src/lib/sc-camera-count.ts) — the SAME gate scripts/fetch-camera-data.ts
    // applies at the refresh/build boundary, so the live and build paths reject
    // identical payloads (one definition, no divergent preprocessing). It throws on
    // a non-array, EMPTY, or ANY-malformed payload (mixing well-formed + malformed
    // is itself a corruption signal; filtering to the valid subset would silently
    // CACHE an undercount for 24h). The throw is caught below and served as the
    // uncached { stale:true } sentinel; only a fully well-formed snapshot reaches
    // the shared counter, which does no structural filtering of its own (it counts
    // exactly what it is given, after its geographic SC-bbox clip). `raw` is
    // narrowed to Camera[] by the assertion.
    assertValidCameraPayload(raw);
    const cameras: Camera[] = raw;

    const { stateOutline, boundaries } = loadBoundaries();
    const { scTotal, jurisdictions } = countScCameras(cameras, stateOutline, boundaries);

    // Validate the RESULT before caching: never pin a bad figure to the edge for
    // 24h (a transient upstream hiccup must recover, not stick). scTotal must be a
    // positive integer (zero SC matches is treated as a soft failure), AND
    // jurisdictions must be a positive integer — a zero/non-positive jurisdictions
    // count means an incomplete boundary bundle (missing county-*/place-* files),
    // which must not be cached as a successful result.
    if (!Number.isInteger(scTotal) || scTotal <= 0) return jsonResponse({ stale: true }, false);
    if (!Number.isInteger(jurisdictions) || jurisdictions <= 0) {
      return jsonResponse({ stale: true }, false);
    }

    return jsonResponse(
      { scTotal, jurisdictions, generatedAt: new Date().toISOString(), stale: false },
      true,
    );
  } catch {
    // The caught error is deliberately not inspected or echoed — it can carry
    // internal hostnames. Serve the uncached stale sentinel instead. This catches
    // the fetch-abort TimeoutError AND the assertValidCameraPayload throw (non-array
    // / empty / any-malformed payload), so every anomaly fails soft, uncached.
    return jsonResponse({ stale: true }, false);
  }
};

export const config: Config = {
  path: '/api/sc-camera-count',
  method: ['GET'],
};
```

Add the per-function `included_files` block to `netlify.toml` (place it directly after
`[build.environment]`). Scope it to `[functions."sc-camera-count"]`, NOT a top-level `[functions]`
table — the latter would bundle the multi-MB district dataset into every function:

```toml
# Bundle the generated SC boundary GeoJSON into ONLY the sc-camera-count function
# so it can run the point-in-polygon count at runtime. Scope this to the
# per-function table [functions."sc-camera-count"]: a top-level [functions] block
# would ship the (multi-MB) district dataset into every function (events,
# submit-event, go, address-suggest, fold-events), none of which read it. These
# files are produced by the prebuild (scripts/sync-open-civics.mjs) into
# public/districts and are otherwise gitignored, so they must be included
# explicitly.
[functions."sc-camera-count"]
  included_files = ["public/districts/**"]
```

### Step 4 — Run the test (expect PASS)

```
npx vitest run tests/functions/sc-camera-count.test.ts
```

Expected: all tests pass.

### Step 5 — Commit

```
git add netlify/functions/sc-camera-count.ts tests/functions/sc-camera-count.test.ts netlify.toml
git commit -m "$(cat <<'EOF'
feat(counter): sc-camera-count Netlify function

Add GET /api/sc-camera-count: fetch the DeFlock CDN (same URL + UA as
fetch-camera-data.ts), run the shared countScCameras over the bundled SC
boundary GeoJSON, and return { scTotal, jurisdictions, generatedAt, stale }
with a 24h durable + stale-while-revalidate edge cache.

Politeness + fail-soft hardening: reject query-bearing requests before the
upstream fetch (Netlify's cache key includes the query, so ?bust= would bypass
the edge cache and hammer DeFlock); bound the fetch with an abort timeout;
validate the payload ALL-OR-NOTHING via the SHARED assertValidCameraPayload (the
same validator scripts/fetch-camera-data.ts uses at the refresh/build boundary:
array, non-empty, and EVERY record well-formed — any malformed record rejects the
whole payload instead of caching a filtered undercount, keeping the live path's
preprocessing identical to the build path) and the computed result (both scTotal
and jurisdictions positive integers,
so a zero total or incomplete boundary bundle cannot cache as success) before
caching. Timeout, empty-array, any-malformed-record, mixed valid+malformed,
zero-result, and non-positive-jurisdictions all return HTTP 200 { stale:true }
uncached, so the homepage keeps its build-time number. included_files is scoped to
[functions."sc-camera-count"] so only this function ships public/districts/**.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Routing (`config.path`), dev proxy, and CSP confirmation

The repo routes v2 functions by `config.path` (see `netlify/functions/events.ts` →
`/api/events`, with **no** `netlify.toml` redirect). So `/api/sc-camera-count` needs **no
`[[redirects]]` entry** — the `config.path` set in Task 3 is the production route. This task adds
the local dev proxy (functions do not run under `astro dev`) and locks the routing/CSP facts with
guards.

**Files:**
- Modify: `astro.config.mjs` — add the dev proxy.
- Test: `tests/config-guards.test.ts` — routing + CSP + dev-proxy guards.

### Step 1 — Write the failing test

Add to `tests/config-guards.test.ts`:

```ts
describe('sc-camera-count routing + CSP (design §3.3, §6)', () => {
  const fn = read('netlify/functions/sc-camera-count.ts');
  const astroConfig = read('astro.config.mjs');

  it('routes via the v2 config.path (matching /api/events; no redirect needed)', () => {
    expect(fn).toMatch(/path:\s*'\/api\/sc-camera-count'/);
    // Belt-and-suspenders: no stray redirect was added for it.
    expect(netlifyToml).not.toContain('/api/sc-camera-count');
  });

  it('scopes the boundary bundle to ONLY the sc-camera-count function', () => {
    // Under the per-function table, NOT a global [functions] block — otherwise the
    // multi-MB district dataset would ship into events / submit-event / go /
    // address-suggest / fold-events, none of which read it.
    expect(netlifyToml).toMatch(
      /\[functions\."sc-camera-count"\]\s*\r?\n\s*included_files\s*=\s*\[\s*"public\/districts\/\*\*"\s*\]/,
    );
    // No unscoped [functions] table header (which would apply to every function).
    expect(netlifyToml).not.toMatch(/^\s*\[functions\]\s*$/m);
    // Exactly one included_files declaration — no stray global copy.
    expect(netlifyToml.match(/included_files/g)?.length).toBe(1);
  });

  it('leaves CSP connect-src as self (same-origin fetch needs no CSP change)', () => {
    expect(cspLine).toMatch(/connect-src 'self'/);
  });

  it('proxies /api/sc-camera-count to the functions server for astro dev', () => {
    expect(astroConfig).toContain("'/api/sc-camera-count'");
    expect(astroConfig).toContain(
      "path.replace('/api/sc-camera-count', '/.netlify/functions/sc-camera-count')",
    );
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "sc-camera-count routing"
```

Expected: FAIL — the dev-proxy assertions fail (`astro.config.mjs` has no
`/api/sc-camera-count` block yet). (The function/`included_files` assertions pass from Task 3.)

### Step 3 — Minimal implementation

In `astro.config.mjs`, add the proxy entry immediately after the `/api/events` block:

```js
        '/api/events': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/events', '/.netlify/functions/events'),
        },
        '/api/sc-camera-count': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace('/api/sc-camera-count', '/.netlify/functions/sc-camera-count'),
        },
```

### Step 4 — Run the test (expect PASS)

```
npx vitest run tests/config-guards.test.ts -t "sc-camera-count routing"
```

Expected: all four guards pass.

### Step 5 — Commit

```
git add astro.config.mjs tests/config-guards.test.ts
git commit -m "$(cat <<'EOF'
feat(counter): route /api/sc-camera-count + dev proxy

Production routing is the function's own config.path (matching /api/events, no
redirect). Add the astro dev proxy to the functions server for local
`netlify functions:serve`, and guard the route, included_files, and the
unchanged connect-src 'self' CSP.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Client module `live-count.ts` + unit tests

**Files:**
- Create: `src/scripts/live-count.ts` — fetch + apply.
- Test: `src/scripts/live-count.test.ts` — pure helpers (`node` env).
- Test: `src/scripts/live-count.dom.test.ts` — **DOM-capable** wiring tests (per-file `happy-dom`
  env): success updates all three surfaces, a stale/rejected fetch leaves all three at their SSR
  values, one request per page load, and exact-vs-floor formatting.
- Modify: `package.json` — add `happy-dom` to `devDependencies` (the DOM test env; the global
  Vitest env stays `node`).

### Step 1 — Write the failing tests

Create `src/scripts/live-count.test.ts` (the global `node` env; tests only the pure
decision/format helpers):

```ts
import { describe, it, expect } from 'vitest';
import { parseLiveCount, cameraFloor } from './live-count.js';

describe('parseLiveCount', () => {
  it('returns the floored total for a valid live payload', () => {
    expect(parseLiveCount({ scTotal: 1700, stale: false })).toBe(1700);
    expect(parseLiveCount({ scTotal: 1699.9, stale: false })).toBe(1699);
  });

  it('returns null for the stale sentinel', () => {
    expect(parseLiveCount({ stale: true })).toBeNull();
  });

  it('returns null for missing / non-numeric / non-positive totals', () => {
    expect(parseLiveCount({})).toBeNull();
    expect(parseLiveCount({ scTotal: '1700' as unknown as number })).toBeNull();
    expect(parseLiveCount({ scTotal: Number.NaN })).toBeNull();
    expect(parseLiveCount({ scTotal: 0 })).toBeNull();
    expect(parseLiveCount({ scTotal: -5 })).toBeNull();
  });

  it('returns null for null / undefined', () => {
    expect(parseLiveCount(null)).toBeNull();
    expect(parseLiveCount(undefined)).toBeNull();
  });
});

describe('cameraFloor', () => {
  it('rounds down to the nearest hundred (the Hero "more than N" floor)', () => {
    expect(cameraFloor(1624)).toBe(1600);
    expect(cameraFloor(1700)).toBe(1700);
    expect(cameraFloor(1699)).toBe(1600);
  });
});
```

The pure helpers do not exercise the DOM apply/no-op logic the design's graceful-degradation
contract depends on, so also add a DOM-capable test. The repo's Vitest env is `node`, so this ONE
file opts into `happy-dom` via a per-file docblock (the global env is unchanged). Install the env
first (an established, mature test DOM — pinned to a version comfortably older than 30 days so the
machine's package-age gate allows it):

```
npm install --save-dev happy-dom@20.11.1
```

This adds to `package.json` `devDependencies`:

```jsonc
    "happy-dom": "20.11.1",
```

Create `src/scripts/live-count.dom.test.ts` (the fixture DOM is built with `createElement` +
`textContent`, never `innerHTML`, so no HTML-injection surface):

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SSR_EXACT = '1,624'; // impact-stats.json scTotal, comma-formatted
const SSR_FLOOR = '1,600'; // Math.floor(1624/100)*100, comma-formatted

// An exact surface mirrors the component markup after Task 6:
//   <TAG class=CLS data-live-sc="exact">
//     <span class="sr-only">V</span><span aria-hidden data-count-up>V</span>
//   </TAG>
function exactSurface(tag: string, cls: string, value: string): HTMLElement {
  const wrap = document.createElement(tag);
  wrap.className = cls;
  wrap.setAttribute('data-live-sc', 'exact');
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = value;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  vis.setAttribute('data-count-up', '');
  vis.textContent = value;
  wrap.append(sr, vis);
  return wrap;
}

// Two exact surfaces (ImpactBand istat-v + MapSection statline .n) and one floor
// surface (Hero prose span).
function buildHomepage(): void {
  document.body.replaceChildren();
  document.body.append(
    exactSurface('div', 'istat-v', SSR_EXACT),
    exactSurface('span', 'n', SSR_EXACT),
  );
  const floor = document.createElement('span');
  floor.setAttribute('data-live-sc', 'floor');
  floor.textContent = SSR_FLOOR;
  document.body.append(floor);
}

function surfaceTexts() {
  const exacts = Array.from(document.querySelectorAll('[data-live-sc="exact"]'));
  const floor = document.querySelector('[data-live-sc="floor"]')!;
  return {
    exactVisible: exacts.map((el) => el.querySelector('[data-count-up]')!.textContent),
    exactSr: exacts.map((el) => el.querySelector('.sr-only')!.textContent),
    floor: floor.textContent?.trim(),
  };
}

function jsonFetch(body: unknown) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

// live-count.ts memoizes the fetch and guards init with module-level state, so
// each test re-imports the module to reset `started`/`cached`.
async function freshModule() {
  vi.resetModules();
  return import('./live-count.js');
}

beforeEach(() => {
  buildHomepage();
  // Force count-up.ts into its no-animation branch so the DOM lands on the FINAL
  // value synchronously — no IntersectionObserver callbacks (which never fire
  // without layout) to await, so assertions see the applied value, not a mid-
  // animation 0.
  vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('live-count DOM wiring (design §3.3, §7)', () => {
  it('a successful fetch updates all three surfaces (two exact + one floor)', async () => {
    const fetchMock = jsonFetch({ scTotal: 1725, jurisdictions: 40, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().floor).toBe('1,700'));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual(['1,725', '1,725']); // full total on both exact surfaces
    expect(t.exactSr).toEqual(['1,725', '1,725']); // sr-only mirror updated too
    expect(t.floor).toBe('1,700'); // cameraFloor(1725)
  });

  it('a stale response leaves all three surfaces at their SSR build values', async () => {
    const fetchMock = jsonFetch({ stale: true });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Flush the full promise chain (fetch -> json -> parse -> observeBuildValues).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.exactSr).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.floor).toBe(SSR_FLOOR);
  });

  it('a rejected fetch also leaves the SSR build values unchanged', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.floor).toBe(SSR_FLOOR);
  });

  it('fetches exactly once per page even when all three components init', async () => {
    const fetchMock = jsonFetch({ scTotal: 1725, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    // Hero, ImpactBand, and MapSection each call initLiveCount on load.
    initLiveCount(document);
    initLiveCount(document);
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().floor).toBe('1,700'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/sc-camera-count', expect.anything());
  });

  it('formats exact surfaces as the full total and the floor as the rounded-down hundred', async () => {
    const fetchMock = jsonFetch({ scTotal: 1699, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().exactVisible[0]).toBe('1,699'));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual(['1,699', '1,699']); // exact = full total
    expect(t.floor).toBe('1,600'); // floor = Math.floor(1699/100)*100
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run src/scripts/live-count.test.ts src/scripts/live-count.dom.test.ts
```

Expected: FAIL — both files error with `Failed to resolve import "./live-count.js"` (the module
does not exist yet). If `happy-dom` is not yet installed, the DOM file additionally fails to load
its environment — install it first (above).

### Step 3 — Minimal implementation

Create `src/scripts/live-count.ts`:

```ts
/**
 * live-count.ts — daily-fresh SC camera total on the homepage (design §3.3).
 *
 * Fetches the same-origin /api/sc-camera-count endpoint and, on a valid live
 * number, updates every surface that shows the SC total: the ImpactBand
 * count-up, the Hero "more than N" floor, and the MapSection statline. On any
 * failure — network error, non-numeric payload, or the endpoint's { stale:true }
 * sentinel — it does nothing: every element already server-rendered the
 * build-time number (impact-stats.json), so the value is never blank and JS-off
 * visitors are unaffected.
 *
 * Surfaces are tagged data-live-sc="exact" (ImpactBand, MapSection) or
 * data-live-sc="floor" (Hero). The count-up animation and prefers-reduced-motion
 * are handled entirely by the existing observeCountUps (count-up.ts, unchanged).
 * The three components exclude their SC element from their OWN observeCountUps
 * call, so live-count is the sole owner of the SC count-up — no double-observe.
 */
import { observeCountUps } from './count-up.js';

export interface LiveCountResponse {
  scTotal?: unknown;
  stale?: unknown;
}

/**
 * Extract a usable SC total from the endpoint payload, or null. Returns null for
 * a stale sentinel, a missing/non-finite/non-positive scTotal, or anything
 * non-numeric, so a bad payload can never overwrite the good build-time value.
 */
export function parseLiveCount(payload: LiveCountResponse | null | undefined): number | null {
  if (!payload || payload.stale === true) return null;
  const value = payload.scTotal;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/** The Hero's "more than N" floor: the live total rounded down to the hundred. */
export function cameraFloor(scTotal: number): number {
  return Math.floor(scTotal / 100) * 100;
}

let started = false;
let cached: Promise<number | null> | null = null;

/** Fetch the endpoint once per page; memoized so three components share one hit. */
export function getLiveCount(): Promise<number | null> {
  if (!cached) {
    cached = fetch('/api/sc-camera-count', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<LiveCountResponse>) : null))
      .then(parseLiveCount)
      .catch(() => null);
  }
  return cached;
}

/** Set a surface's visible text and its .sr-only sibling (if any) to `text`. */
function setStatText(el: HTMLElement, text: string): void {
  const srOnly = el.querySelector<HTMLElement>('.sr-only');
  if (srOnly) srOnly.textContent = text;
  const visible = el.querySelector<HTMLElement>('[data-count-up]');
  if (visible) visible.textContent = text;
  else el.textContent = text; // plain prose target (the Hero floor span)
}

/**
 * Update every [data-live-sc] surface to the live value. "exact" shows the
 * total (ImpactBand, MapSection); "floor" shows the Hero floor. A count-up
 * surface is (re-)handed to observeCountUps so it animates to the fresh value on
 * view; the Hero floor is inline prose and is set directly.
 */
export function applyLiveCount(root: ParentNode, scTotal: number): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-live-sc]'))) {
    const value = el.getAttribute('data-live-sc') === 'floor' ? cameraFloor(scTotal) : scTotal;
    setStatText(el, value.toLocaleString('en-US'));
    const countUp = el.matches('[data-count-up]')
      ? el
      : el.querySelector<HTMLElement>('[data-count-up]');
    if (countUp) observeCountUps([countUp]);
  }
}

/** Fallback: animate the build-time value already in the DOM on scroll. */
function observeBuildValues(root: ParentNode): void {
  const countUps = root.querySelectorAll<HTMLElement>(
    '[data-live-sc] [data-count-up], [data-live-sc][data-count-up]',
  );
  if (countUps.length) observeCountUps(countUps);
}

/** Wire the live counter once per page (idempotent across the 3 components). */
export function initLiveCount(root: ParentNode = document): void {
  if (started) return;
  started = true;
  void getLiveCount().then((scTotal) => {
    if (scTotal == null) observeBuildValues(root);
    else applyLiveCount(root, scTotal);
  });
}
```

### Step 4 — Run the tests (expect PASS)

```
npx vitest run src/scripts/live-count.test.ts src/scripts/live-count.dom.test.ts
```

Expected: all tests pass — the pure helpers AND the happy-dom wiring tests (success updates all
three surfaces, stale/rejected leaves the SSR values, one fetch per page, exact-vs-floor
formatting).

### Step 5 — Commit

```
git add src/scripts/live-count.ts src/scripts/live-count.test.ts src/scripts/live-count.dom.test.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(counter): live-count client module

Add src/scripts/live-count.ts: memoized same-origin fetch of
/api/sc-camera-count, pure parseLiveCount/cameraFloor guards, and DOM apply that
updates every [data-live-sc] surface via the existing observeCountUps. On any
failure it leaves the SSR build-time number untouched. Unit-test the pure
helpers, and add happy-dom DOM tests proving a success updates all three
surfaces, a stale/rejected fetch leaves all three at their SSR values, exactly
one request fires per page load, and exact-vs-floor formatting.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Wire the live counter into the three homepage components

Mark each SC surface with `data-live-sc`, exclude it from the component's own `observeCountUps`
so live-count is the sole owner, and call `initLiveCount()`. Guard the result against the built
homepage HTML (graceful-degradation contract: the hooks and the SSR number are present with no
JS).

**Files:**
- Modify: `src/components/Hero.astro`, `src/components/ImpactBand.astro`, `src/components/MapSection.astro`.
- Test: `tests/config-guards.test.ts` — built-homepage guard (reuses the existing `dist/` build).

### Step 1 — Write the failing test

Add to `tests/config-guards.test.ts` (inside the existing top-level scope that has `readBuilt`
and builds `dist/` in `beforeAll`):

```ts
describe('Live counter graceful degradation (design §3.3)', () => {
  it('server-renders the SSR number INSIDE each live-count hook on the homepage', () => {
    const html = readBuilt('index.html');
    const scTotal = JSON.parse(read('src/data/impact-stats.json')).scTotal as number;
    const exactStr = scTotal.toLocaleString('en-US'); // e.g. "1,624"
    const floorStr = (Math.floor(scTotal / 100) * 100).toLocaleString('en-US'); // e.g. "1,600"
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each exact hook must WRAP the SSR total in its sr-only mirror AND its
    // count-up span — this associates the value with the element. An empty hook
    // (e.g. <span data-live-sc="exact"></span>) would pass a bare
    // count/contains check because the number also appears elsewhere on the
    // page, but it fails this one. (Astro compresses inter-tag whitespace at
    // build; \s* tolerates either form.)
    const exactHook = new RegExp(
      `data-live-sc="exact"[^>]*>\\s*<span class="sr-only">${esc(exactStr)}</span>` +
        `\\s*<span[^>]*data-count-up[^>]*>${esc(exactStr)}</span>`,
      'g',
    );
    expect(html.match(exactHook)?.length).toBe(2); // ImpactBand + MapSection

    // The floor hook (Hero) must directly contain the floored SSR value.
    expect(html).toMatch(new RegExp(`data-live-sc="floor"[^>]*>${esc(floorStr)}</span>`));
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "Live counter graceful degradation"
```

Expected: FAIL — the built homepage has no `data-live-sc` hooks yet, so `exactHook` matches 0 (not
2) and the floor-hook `toMatch` fails.

### Step 3 — Minimal implementation

**`src/components/Hero.astro`** — wrap the floor number and add the init call.

Change the support line (currently around line 79):

```astro
        South Carolina has more than <span data-live-sc="floor">{cameraFloor}</span> of these cameras logging your daily movements, and not one state law that says who can look, or for how long they keep it.
```

Add to the end of the component's existing `<script>` (after the cone-animation code):

```ts
  import { initLiveCount } from '../scripts/live-count.js';
  initLiveCount();
```

**`src/components/ImpactBand.astro`** — tag the SC stat and exclude it from the local observe.

The SC stat is `stats[0]`. Change the `.map` so the first stat's `.istat-v` carries the hook
(the other two are unchanged):

```astro
      {stats.map((stat, i) => (
        <div class="istat" data-reveal="up" data-reveal-delay={String(i + 1)}>
          <div class="istat-v" data-live-sc={i === 0 ? 'exact' : undefined}>
            <span class="sr-only">{stat.value}</span>
            <span aria-hidden="true" data-count-up>{stat.value}</span>
          </div>
          <div class="istat-t">{stat.caption}</div>
        </div>
      ))}
```

Update the `<script>` so the component observes only the NON-live stats and delegates the SC one
to live-count:

```ts
  import { observeCountUps } from '../scripts/count-up';
  import { initLiveCount } from '../scripts/live-count.js';

  // Scope to this band; exclude the SC stat — live-count owns it, so it is
  // never observed twice.
  const band = document.querySelector('.impact-band');
  if (band) {
    const countUps = Array.from(band.querySelectorAll<HTMLElement>('[data-count-up]')).filter(
      (el) => !el.closest('[data-live-sc]'),
    );
    observeCountUps(countUps);
  }
  initLiveCount();
```

**`src/components/MapSection.astro`** — tag the SC statline number and exclude it locally.

Change the statline so the cameras number (not the jurisdictions number) carries the hook
(around line 60):

```astro
        <p class="map-statline"><span class="n" data-live-sc="exact"><span class="sr-only">{scTotal}</span><span aria-hidden="true" data-count-up>{scTotal}</span></span> cameras &middot; <span class="n"><span class="sr-only">{jurisdictions}</span><span aria-hidden="true" data-count-up>{jurisdictions}</span></span> jurisdictions</p>
```

Add the `initLiveCount` import alongside the existing `observeCountUps` import at the top of
MapSection's `<script>` (do not duplicate the `observeCountUps` import — it is already there,
line 232):

```ts
  import { initLiveCount } from '../scripts/live-count.js';
```

Then replace ONLY the final line of the script — currently
`observeCountUps(document.querySelectorAll<HTMLElement>('.map-statline [data-count-up]'));` — with
the filtered version plus the init call (the SC cameras number is excluded because live-count owns
it, so it is never observed twice):

```ts
  // Count-up on the statline numbers, EXCEPT the SC cameras number (live-count owns it).
  const statUps = Array.from(
    document.querySelectorAll<HTMLElement>('.map-statline [data-count-up]'),
  ).filter((el) => !el.closest('[data-live-sc]'));
  observeCountUps(statUps);
  initLiveCount();
```

### Step 4 — Run the test (expect PASS)

```
npx vitest run tests/config-guards.test.ts -t "Live counter graceful degradation"
```

Expected: PASS — each of the two exact hooks wraps the SSR total (in both its sr-only mirror and
its count-up span), and the floor hook wraps the floored SSR value.

### Step 5 — Commit

```
git add src/components/Hero.astro src/components/ImpactBand.astro src/components/MapSection.astro tests/config-guards.test.ts
git commit -m "$(cat <<'EOF'
feat(counter): wire live counter into homepage components

Tag the SC total on the Hero floor, the ImpactBand stat, and the MapSection
statline with data-live-sc, exclude those from each component's own
observeCountUps (live-count is the sole owner, so no double-observe), and call
initLiveCount(). Build guard asserts the SSR number + hooks render with no JS.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Refresh camera data daily (workflow)

Bump the cron weekly → daily. Because BOTH `fetch-camera-data` and `build-impact-stats` are now
esbuild-bundled TS that import the shared module (so they need esbuild) and `build-impact-stats`
reads the boundary GeoJSON (generated by the prebuild from the `open-civics-boundaries`
dependency), the job must install deps and run the prebuild — steps the prior install-free job
lacked — and it now calls the validating `npm run fetch-camera-data` (not `node
scripts/fetch-camera-data.mjs`). Because that step validates the CDN payload all-or-nothing before
writing the snapshot, a malformed/empty/mixed response exits non-zero, which fails the step and the
whole job (GitHub Actions stops on the first non-zero step by default), so `build-impact-stats` and
the commit step never run — no corrupt snapshot or count is ever committed. **See "Resolved
ambiguities" #4 — this is broader than the design's one-line "weekly → daily" and should be
confirmed at review.**

**Files:**
- Modify: `.github/workflows/refresh-camera-data.yml`.

### Step 1 — Write the failing test

Add to `tests/config-guards.test.ts`:

```ts
describe('refresh-camera-data workflow (design §3.4)', () => {
  const wf = read('.github/workflows/refresh-camera-data.yml');

  it('runs daily, not weekly', () => {
    expect(wf).toMatch(/cron:\s*'0 11 \* \* \*'/);
    expect(wf).not.toMatch(/cron:\s*'0 11 \* \* 3'/);
  });

  it('installs deps and runs the prebuild before deriving figures', () => {
    expect(wf).toContain('npm ci');
    expect(wf).toContain('npm run prebuild');
    expect(wf).toContain('npm run fetch-camera-data');
    expect(wf).toContain('npm run build-impact-stats');
  });

  it('fetches via the validating TS bundle, not the un-validated .mjs', () => {
    // The validation gate lives in the esbuild-bundled fetch-camera-data.ts; the
    // raw .mjs (which wrote the CDN response with no validation) must be gone.
    expect(wf).not.toContain('node scripts/fetch-camera-data.mjs');
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "refresh-camera-data workflow"
```

Expected: FAIL — the workflow still has the weekly cron `'0 11 * * 3'` and runs
`node scripts/build-impact-stats.mjs` with no `npm ci`/`npm run prebuild`.

### Step 3 — Minimal implementation

Rewrite the top of `.github/workflows/refresh-camera-data.yml` (schedule + steps up to the
commit block; the commit block is unchanged):

```yaml
name: Refresh Camera Data

on:
  schedule:
    # Daily at 6am ET (offset from bill scraper)
    - cron: '0 11 * * *'
  workflow_dispatch: # manual trigger

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      # fetch-camera-data and build-impact-stats are now esbuild-bundled TS that
      # import the shared count module (src/lib/sc-camera-count.ts), and
      # build-impact-stats reads the SC boundary GeoJSON the prebuild copies into
      # public/districts from the open-civics-boundaries package — so this job
      # installs deps and runs the prebuild before deriving figures.
      - run: npm ci
      - run: npm run prebuild
      # Atomic refresh (design §4.1): fetch + VALIDATE the CDN snapshot, then derive
      # the SC total + per-jurisdiction counts + impact stats from that one snapshot
      # so the artifacts agree. fetch-camera-data validates the payload
      # ALL-OR-NOTHING with the shared validator BEFORE writing
      # public/camera-data.json; a malformed/empty/mixed response throws -> non-zero
      # exit, which fails this step and the whole job (GitHub Actions stops on the
      # first non-zero step), so build-impact-stats and the commit step below never
      # run and no corrupt snapshot or count is ever committed. The prior committed
      # snapshot is left untouched.
      - run: npm run fetch-camera-data
      - run: npm run build-impact-stats
      - name: Commit if data changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          # Capture HEAD's impact-stats (empty when the file is new) so we can
          # diff it against the freshly generated one while ignoring generatedAt.
          git show HEAD:src/data/impact-stats.json > "$RUNNER_TEMP/impact-head.json" 2>/dev/null || : > "$RUNNER_TEMP/impact-head.json"
          # Commit when a camera artifact changes, or when impact-stats.json
          # changes in a field other than generatedAt (which bumps every run).
          impact_changed=$(node -e '
            const fs = require("fs");
            const strip = (p) => { try { const { generatedAt, ...rest } = JSON.parse(fs.readFileSync(p, "utf8")); return JSON.stringify(rest); } catch (e) { return null; } };
            const cur = strip("src/data/impact-stats.json");
            const head = strip(process.env.RUNNER_TEMP + "/impact-head.json");
            console.log(head !== null && cur === head ? "0" : "1");
          ')
          if git diff --quiet public/camera-data.json public/camera-counts.json && [ "$impact_changed" = "0" ]; then
            echo "No meaningful data changes; skipping commit."
          else
            git add public/camera-data.json public/camera-counts.json src/data/impact-stats.json
            git commit -m "chore: refresh camera data + impact stats"
            git push
          fi
```

### Step 4 — Run the test (expect PASS)

```
npx vitest run tests/config-guards.test.ts -t "refresh-camera-data workflow"
```

Expected: both guards pass.

### Step 5 — Commit

```
git add .github/workflows/refresh-camera-data.yml tests/config-guards.test.ts
git commit -m "$(cat <<'EOF'
ci(counter): refresh camera data daily via the validating fetch step

Bump the refresh cron weekly -> daily so the committed fallback number and the
map snapshot stay fresh. Add npm ci + npm run prebuild (and Node 22) because
fetch-camera-data and build-impact-stats are now esbuild-bundled TS importing the
shared module, and build-impact-stats reads the boundary GeoJSON the prebuild
generates from open-civics-boundaries. Call `npm run fetch-camera-data` (the
validating bundle) instead of `node scripts/fetch-camera-data.mjs`: its
all-or-nothing payload validation exits non-zero on a malformed CDN response,
failing the job so build-impact-stats and the commit never run and no corrupt
snapshot/count is committed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — Verification

Run the full gate from the worktree root. There is no dedicated lint script in `package.json`;
`npm run build` (Astro build, which runs `prebuild`) is the type/transform gate and `npm test`
(Vitest) is the test gate.

### Commands and expected results

```
# 1. Full test suite — every new + existing test green.
npm test
#    -> vitest run; all files pass, including:
#       src/lib/sc-camera-count.test.ts          (unit + validator + parity)
#       tests/fetch-camera-data.exec.test.ts     (refresh boundary: malformed/empty payload
#                                                 fails non-zero, overwrites no artifact;
#                                                 well-formed positive control writes)
#       tests/build-impact-stats.exec.test.ts    (bundled generator runs from cwd)
#       tests/functions/sc-camera-count.test.ts  (function: success, cache-key reject,
#                                                 fail-soft timeout/empty/malformed/zero)
#       src/scripts/live-count.test.ts           (client pure helpers, node env)
#       src/scripts/live-count.dom.test.ts       (client DOM wiring, happy-dom env)
#       src/scripts/count-up.test.ts             (unchanged — still green)
#       tests/config-guards.test.ts              (build + fetch refactor, routing, scoped
#                                                 included_files, CSP, workflow,
#                                                 graceful-degradation guards)

# 2. Full production build — prebuild generates public/districts, Astro builds dist/.
npm run build
#    -> exits 0; no type/transform errors.

# 3. Regenerate the committed figures with the refactored generator; scTotal/jurisdictions
#    must be unchanged (only generatedAt moves) — proves the live path and the build path agree.
npm run build-impact-stats
git --no-pager diff src/data/impact-stats.json public/camera-counts.json
#    -> impact-stats.json: only "generatedAt" differs; camera-counts.json: no change.
#    (Commit the refreshed impact-stats.json so it is not week-stale at merge — design §3.4.)
```

### Deploy-preview + browser verification (functions do not run under `astro dev`)

Netlify Functions are verified against a deploy preview, never `astro dev` (see the
`astro.config.mjs` header and `go.ts`). On the PR's deploy preview:

1. `GET /api/sc-camera-count` returns `200` with `{ scTotal, jurisdictions, generatedAt, stale:false }`
   and header `Netlify-CDN-Cache-Control: public, durable, s-maxage=86400, stale-while-revalidate=86400`.
   Confirms the function-scoped `included_files` bundled `public/districts/**` and `process.cwd()`
   resolves them. Also `GET /api/sc-camera-count?bust=1` returns `{ stale:true }` with no durable
   cache header (the query-reject path — DeFlock is not hit).
2. Homepage: with JS enabled, the Hero floor / ImpactBand / MapSection SC numbers reflect the live
   value; with JS disabled (or the endpoint 500'd manually), they show the build-time number.
   Confirm no CSP `connect-src` violation in the console (same-origin `/api` fetch).
3. Locally (optional): `npx netlify functions:serve` in one terminal + `npm run dev` in another;
   `GET /api/sc-camera-count` proxies through.

### At-merge housekeeping (owned repo)

- Update `MANIFEST.md`: the `scripts/fetch-camera-data.mjs` and `scripts/build-impact-stats.mjs`
  references (Structure lines + Key Relationships) become `fetch-camera-data.ts` /
  `build-impact-stats.ts`; add the new `src/lib/sc-camera-count.ts`,
  `netlify/functions/sc-camera-count.ts`, and `src/scripts/live-count.ts` rows. Per the global
  rule, the MANIFEST is rewritten wholesale to budget before merge.
- Commit the refreshed `src/data/impact-stats.json` (Task 8 step 3) so production ships a current
  number.

---

## Resolved ambiguities

1. **Routing mechanism.** The design/spec ask for a `netlify.toml` redirect for
   `/api/sc-camera-count`. The repo actually routes v2 functions via `config.path` with **no**
   redirect (`netlify/functions/events.ts` → `/api/events` has no redirect). Resolved by using
   `config.path` (functionally the redirect the design intends) and adding **no** `[[redirects]]`
   entry; a guard asserts the route and the absence of a stray redirect. The design's "confirm CSP
   `connect-src 'self'` needs no change" holds — the fetch is same-origin.

2. **Boundary files at function runtime.** `public/districts/{state-outline,county-*,place-*}.json`
   are **gitignored**, generated at prebuild by `scripts/sync-open-civics.mjs` from the
   `open-civics-boundaries` npm package (the design calls them "committed", which is inaccurate).
   Resolved by bundling them into the function with a **function-scoped**
   `[functions."sc-camera-count"] included_files = ["public/districts/**"]` (a top-level
   `[functions]` table would ship the multi-MB dataset into every function — events, submit-event,
   go, address-suggest, fold-events — which none of them use) and reading from
   `resolve(process.cwd(), 'public', 'districts')`. This path resolution is the one item to confirm
   on a deploy preview (Verification step 1).

3. **TS module imported by the Node refresh/build scripts.** `build-impact-stats.mjs` (and
   `fetch-camera-data.mjs`) were intentionally plain-Node ("no npm ci, no TS toolchain") —
   `build-impact-stats` with an *inlined* PIP copy, `fetch-camera-data` with NO validation at all.
   The single-source-of-truth requirement (import the shared `.ts` for the count AND the payload
   validator) is incompatible with plain-Node import. Resolved with the repo's existing pattern
   (`codes`, `build-wordlist`): author BOTH scripts as `.ts`, add an esbuild-bundle npm script for
   each, run `node` on the bundle. This obsoletes the old "dependency-free workflow" note, and is
   what lets the same `assertValidCameraPayload` guard both the live and refresh/build boundaries
   from one definition (see hardening item #11).

4. **Workflow scope (bigger than "weekly → daily").** For the refactored generator to run in CI it
   now needs `npm ci` (esbuild + `open-civics-boundaries`) and `npm run prebuild` (to generate the
   boundary files) — steps the current install-free job never had, meaning its `build-impact-stats`
   step could not have found `state-outline.json` in a clean checkout. Folded the install + prebuild
   fix into Task 7 alongside the cron bump (small, adjacent, revealed by investigation), and flagged
   here for review since it exceeds the design's one-liner.

5. **`jurisdictions` in the response.** The client only consumes `scTotal`, but the design's
   response shape includes `jurisdictions` and `countScCameras` computes it anyway, so the function
   returns it (requiring all boundary files bundled, not just `state-outline.json`). Kept faithful
   to the approved shape; the daily cadence makes the extra per-jurisdiction pass negligible.

6. **Count-up coordination.** Rather than modify the carefully-tested `count-up.ts`, the three
   components exclude their SC element from their own `observeCountUps` and let `live-count` be the
   sole owner of that element (set value → `observeCountUps([it])`, or fall back to the build value
   on failure). This preserves the a11y/no-JS contract and keeps `count-up.test.ts` green.

---

### Plan-review hardening (Codex plan review)

7. **Bundled-script root (`ROOT`).** esbuild bundles `build-impact-stats.ts` into
   `node_modules/.cache/`, so `import.meta.url`/`fileURLToPath` dirname-walking resolves `ROOT` to
   `node_modules` — the generator (and the daily workflow) would read boundary files from the wrong
   place and fail. Resolved by using `const ROOT = process.cwd()` (npm sets cwd to the repo root),
   matching the sibling `build-wordlist` / `organizer-codes` bundled scripts, plus an
   execution-level regression (`tests/build-impact-stats.exec.test.ts`) that runs the *bundled*
   artifact from a fixture cwd and asserts it locates the boundary files and writes correct output.

8. **Endpoint politeness + fail-soft.** Netlify's default durable-cache key includes the query
   string, so `?bust=` would bypass the 24 h cache and hit DeFlock every request. Resolved by
   rejecting query-bearing requests before the fetch. "Recovers immediately on any failure" is
   fully implemented by: a bounded fetch abort timeout (`AbortSignal.timeout`, so a hung upstream
   cannot ride the platform timeout); payload validation (array, non-empty, well-formed records);
   and result validation (positive-integer `scTotal`) before caching. Timeout, empty-array,
   malformed-record, and zero-result each return an **uncached** `{ stale:true }`, with a test per
   case (and the cache-busting query proven to never reach upstream).

9. **DOM test environment.** The design's client regression (a fetch failure leaves the rendered
   fallback unchanged) needs a real DOM, but the global Vitest env is `node`. Resolved by adding
   `happy-dom` (pinned ≥30 days old for the package-age gate) and a single per-file
   `// @vitest-environment happy-dom` test that exercises all three surfaces on success, the
   unchanged SSR values on stale/reject, one-fetch-per-page memoization, and exact-vs-floor
   formatting — while the global `node` env is untouched. The built-homepage guard is also
   strengthened to associate each hook element with its SSR value (rather than a page-wide
   `toContain`, which an empty hook could pass).

10. **Approved decisions kept.** Production routing stays the function's own `config.path` (matching
    `/api/events`, no redirect), and the daily workflow keeps `npm ci` + `npm run prebuild` before
    deriving figures — both confirmed correct in review.

### Round-3 hardening (Codex impl review, blocking)

11. **Shared payload validator at BOTH boundaries (refresh/build reconciliation was wrong).** The
    earlier plan claimed the live/build reconciliation held because the build script's input was an
    "already-trusted committed snapshot." That was wrong: `scripts/fetch-camera-data.mjs` wrote the
    untrusted DeFlock CDN response to `public/camera-data.json` with NO structural validation, and
    the daily workflow immediately derived figures from it and committed them — so a malformed/mixed
    snapshot the live function would reject could still generate and commit a corrupted fallback
    count. Resolved by making structural validation a **single shared validator**
    (`isWellFormedCamera` + `assertValidCameraPayload` in `src/lib/sc-camera-count.ts`, Task 1) and
    calling it at BOTH boundaries: the live function (Task 3) now calls `assertValidCameraPayload`
    instead of a local `raw.every(isWellFormedCamera)`, and the refresh/build fetch step —
    converted to `scripts/fetch-camera-data.ts` (Task 2.5) — calls the identical validator BEFORE
    writing the snapshot (a throw → non-zero exit → prior committed snapshot untouched → the
    workflow's later `build-impact-stats`/commit steps never run). `build-impact-stats.ts` also
    re-asserts defensively before any write. Both paths reject a non-array/empty/any-malformed
    payload all-or-nothing (one bad record fails the WHOLE payload — never a filtered undercount);
    the shared counter still applies only the geographic SC-bbox clip in both paths. A new
    execution-level regression (`tests/fetch-camera-data.exec.test.ts`) stubs `fetch` to return a
    mixed valid+malformed (and an empty) payload, runs the bundled fetch step, and proves the
    non-zero exit overwrites neither the snapshot nor the downstream `camera-counts.json` /
    `impact-stats.json`, with a well-formed positive control that DOES write.
