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
   way `scripts/fetch-camera-data.mjs` does, runs `countScCameras`, returns
   `{ scTotal, jurisdictions, generatedAt, stale:false }` with a 24 h durable + SWR edge cache;
   any failure returns HTTP 200 `{ stale:true }` uncached.
3. **Client** `src/scripts/live-count.ts` (new) — fetches `/api/sc-camera-count` once per page,
   and on a valid numeric `scTotal` updates the three `data-live-sc` surfaces; otherwise leaves
   the SSR build-time number untouched. Count-up + reduced-motion are delegated to the existing
   `observeCountUps` in `src/scripts/count-up.ts` (that file is NOT modified).
4. **Build/CI change** — refactor `build-impact-stats` to import the shared module; bump the
   `refresh-camera-data.yml` cron weekly → daily.

Fallback ladder (the number is never blank, never blocks render): **live** value → **build-time**
`impact-stats.json` value (SSR; used on fetch failure / `stale` / JS off).

## Tech Stack

- Astro 5 (`.astro` components + `type=module` client scripts), TypeScript, Tailwind 4.
- Netlify Functions v2 (`import type { Config, Context } from '@netlify/functions'`; routed by
  `config.path`, matching `netlify/functions/events.ts`).
- Vitest 4 (`environment: 'node'`; test command `npm test` = `vitest run`).
- esbuild-bundled TS build scripts (the repo's existing `codes` / `build-wordlist` pattern).

> **For agentic workers:** execute this plan with `superpowers:subagent-driven-development` (or
> `superpowers:executing-plans`). **REQUIRED SUB-SKILL: `superpowers:test-driven-development`.**
> Every task is RED → GREEN → REFACTOR → COMMIT: write the failing test, run it and *watch it
> fail with the stated output*, write the minimal implementation, run it green, then commit with
> the exact message. Do not batch tasks; commit at each task boundary. All paths below are
> repo-relative to the worktree root `C:/Users/tim/workspace/dc-live-counter`.

## File Structure

| File | New/Mod | Responsibility |
|------|---------|----------------|
| `src/lib/sc-camera-count.ts` | **New** | Pure, dependency-free SC-count module: `SC_BOUNDS`, `inScBounds`, `filterToScBounds`, `pointInFeatureCollection`, `keyFromFilename`, `countScCameras`. Reuses `pointInPolygon` from `geo-utils`. Single source of truth. |
| `src/lib/sc-camera-count.test.ts` | **New** | Unit tests (dedup, holes, MultiPolygon, bbox, per-jurisdiction) + **parity** test vs. an inlined copy of the pre-refactor algorithm. |
| `scripts/build-impact-stats.ts` | **New** (replaces `.mjs`) | Build-time generator; now *imports* `countScCameras` instead of an inline copy. Writes `public/camera-counts.json` + `src/data/impact-stats.json`, byte-format unchanged. |
| `scripts/build-impact-stats.mjs` | **Delete** | Replaced by the `.ts` above. |
| `netlify/functions/sc-camera-count.ts` | **New** | `GET /api/sc-camera-count`: fetch DeFlock, `countScCameras`, 24 h durable+SWR cache; failure → 200 `{stale:true}` uncached. |
| `tests/functions/sc-camera-count.test.ts` | **New** | Function tests: success shape + cache header + CDN URL/UA; `!ok` / throw / non-array → `{stale:true}` uncached. |
| `src/scripts/live-count.ts` | **New** | Client: memoized `getLiveCount()`, pure `parseLiveCount`/`cameraFloor`, `applyLiveCount`, idempotent `initLiveCount`. |
| `src/scripts/live-count.test.ts` | **New** | Unit tests for the pure helpers (`parseLiveCount`, `cameraFloor`). |
| `src/components/Hero.astro` | **Mod** | Wrap the floor number in `<span data-live-sc="floor">`; import + call `initLiveCount()`. |
| `src/components/ImpactBand.astro` | **Mod** | Mark SC stat `data-live-sc="exact"`; exclude it from the component's own `observeCountUps`; call `initLiveCount()`. |
| `src/components/MapSection.astro` | **Mod** | Mark SC statline number `data-live-sc="exact"`; exclude it from the component's own `observeCountUps`; call `initLiveCount()`. |
| `netlify.toml` | **Mod** | Add `[functions] included_files = ["public/districts/**"]`. No redirect (routing via `config.path`). CSP unchanged. |
| `astro.config.mjs` | **Mod** | Add `/api/sc-camera-count` dev proxy → functions server. |
| `tests/config-guards.test.ts` | **Mod** | Add guards: refactor happened (no inline `pointInRing`), `included_files` present, function `config.path`, CSP `connect-src 'self'` intact, dev proxy present, built homepage carries the `data-live-sc` hooks + SSR number. |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Cron weekly → daily; add `npm ci` + `npm run prebuild` (the shared-module import + boundary files now require them); Node 20 → 22; run `npm run build-impact-stats`. |
| `package.json` | **Mod** | Add `"build-impact-stats"` esbuild-bundle script. |

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
feat(counter): shared SC camera-count module

Extract the SC point-in-polygon count (scTotal + per-jurisdiction) into a
pure, Vitest-covered module reusing geo-utils.pointInPolygon, so the build
script and the forthcoming live endpoint share one methodology. Includes a
parity test against a verbatim copy of the pre-refactor inline algorithm.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Refactor `build-impact-stats` to import the shared module

Convert `scripts/build-impact-stats.mjs` → `scripts/build-impact-stats.ts`, dropping its inline
`pointInRing`/`pointInPolygon` copy in favor of `countScCameras`. Because a plain-`node` `.mjs`
cannot import a `.ts` module, run it through esbuild — the repo's existing pattern for the
`codes` and `build-wordlist` scripts.

**Files:**
- Create: `scripts/build-impact-stats.ts` (replaces the `.mjs`).
- Delete: `scripts/build-impact-stats.mjs`.
- Modify: `package.json` — add the `build-impact-stats` script.
- Test: `tests/config-guards.test.ts` — add a source-text guard that the refactor happened.

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

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "build-impact-stats refactor"
```

Expected: FAIL — `read('scripts/build-impact-stats.ts')` throws `ENOENT` (the file is still
`.mjs`), so the whole describe errors. (`read` uses `readFileSync`, which throws on a missing
file.)

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
 *
 * generatedAt defaults to now; override for reproducible runs with IMPACT_STATS_DATE.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countScCameras,
  keyFromFilename,
  filterToScBounds,
  type Camera,
} from '../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../src/lib/geo-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAMERA_DATA = resolve(ROOT, 'public', 'camera-data.json');
const DISTRICTS_DIR = resolve(ROOT, 'public', 'districts');
const STATE_OUTLINE = resolve(DISTRICTS_DIR, 'state-outline.json');
const COUNTS_OUT = resolve(ROOT, 'public', 'camera-counts.json');
const STATS_OUT = resolve(ROOT, 'src', 'data', 'impact-stats.json');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function main(): void {
  const allCameras = readJson<Camera[]>(CAMERA_DATA);
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
```

Expected: the three refactor guards pass.

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
git add scripts/build-impact-stats.ts package.json tests/config-guards.test.ts
git rm --cached --ignore-unmatch scripts/build-impact-stats.mjs
git commit -m "$(cat <<'EOF'
refactor(counter): build-impact-stats imports shared count module

Replace the inline point-in-polygon copy in build-impact-stats with the shared
src/lib/sc-camera-count module, and run the (now TypeScript) generator through
the repo's esbuild-bundle script pattern. Output bytes and figures unchanged
(guarded by the parity test); a source-text guard prevents re-inlining.

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

function call(): Promise<Response> {
  return handler(
    new Request('https://deflocksc.org/api/sc-camera-count'),
    {} as unknown as Context,
  );
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
import { countScCameras, keyFromFilename, type Camera } from '../../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../../src/lib/geo-utils.js';

/**
 * GET /api/sc-camera-count — the daily-fresh SC camera total (design §3.2).
 *
 * Fetches the DeFlock CDN snapshot the same way scripts/fetch-camera-data.mjs
 * does (same URL + User-Agent), applies the SC bounding-box pre-filter and the
 * shared point-in-polygon count (src/lib/sc-camera-count.ts — identical
 * methodology to the build-time impact-stats.json), and returns an aggregate
 * count only (no coordinates, no PII).
 *
 * Edge-cached for a day with day-long stale-while-revalidate, so DeFlock is hit
 * at most ~once/day site-wide and viewers get an instant edge response. Any
 * upstream or compute failure returns HTTP 200 { stale:true } with no scTotal
 * and no durable caching, so the homepage silently keeps its build-time number
 * and the next request can recover immediately. The function never 5xxs.
 */

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const USER_AGENT =
  'deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)';

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

export default async (_req: Request, _context: Context): Promise<Response> => {
  try {
    const resp = await fetch(CDN_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return jsonResponse({ stale: true }, false);

    const cameras = (await resp.json()) as unknown;
    if (!Array.isArray(cameras)) return jsonResponse({ stale: true }, false);

    const { stateOutline, boundaries } = loadBoundaries();
    const { scTotal, jurisdictions } = countScCameras(
      cameras as Camera[],
      stateOutline,
      boundaries,
    );

    return jsonResponse(
      { scTotal, jurisdictions, generatedAt: new Date().toISOString(), stale: false },
      true,
    );
  } catch {
    // The caught error is deliberately not inspected or echoed — it can carry
    // internal hostnames. Serve the uncached stale sentinel instead.
    return jsonResponse({ stale: true }, false);
  }
};

export const config: Config = {
  path: '/api/sc-camera-count',
  method: ['GET'],
};
```

Add the `[functions]` block to `netlify.toml` (place it directly after `[build.environment]`):

```toml
# Bundle the generated SC boundary GeoJSON into the sc-camera-count function so
# it can run the point-in-polygon count at runtime. These files are produced by
# the prebuild (scripts/sync-open-civics.mjs) into public/districts and are
# otherwise gitignored, so they must be included explicitly.
[functions]
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
fetch-camera-data.mjs), run the shared countScCameras over the bundled SC
boundary GeoJSON, and return { scTotal, jurisdictions, generatedAt, stale }
with a 24h durable + stale-while-revalidate edge cache. Any failure returns
HTTP 200 { stale:true } uncached, so the homepage keeps its build-time number.
included_files bundles public/districts/** into the function.

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

  it('bundles the boundary files into the function', () => {
    expect(netlifyToml).toMatch(/included_files\s*=\s*\[\s*"public\/districts\/\*\*"\s*\]/);
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
- Test: `src/scripts/live-count.test.ts` — pure helpers.

### Step 1 — Write the failing test

Create `src/scripts/live-count.test.ts` (node env; tests only the pure decision/format helpers —
the DOM wiring is verified in the browser, see the Verification task):

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

### Step 2 — Run it (expect FAIL)

```
npx vitest run src/scripts/live-count.test.ts
```

Expected: FAIL — `Failed to resolve import "./live-count.js"`.

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

### Step 4 — Run the test (expect PASS)

```
npx vitest run src/scripts/live-count.test.ts
```

Expected: all tests pass.

### Step 5 — Commit

```
git add src/scripts/live-count.ts src/scripts/live-count.test.ts
git commit -m "$(cat <<'EOF'
feat(counter): live-count client module

Add src/scripts/live-count.ts: memoized same-origin fetch of
/api/sc-camera-count, pure parseLiveCount/cameraFloor guards, and DOM apply that
updates every [data-live-sc] surface via the existing observeCountUps. On any
failure it leaves the SSR build-time number untouched. Unit-test the pure
helpers; DOM wiring is browser-verified.

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
  it('server-renders the build-time number and the live-count hooks on the homepage', () => {
    const html = readBuilt('index.html');
    const scTotal = JSON.parse(read('src/data/impact-stats.json')).scTotal as number;

    // The real number is in the DOM at first paint (a11y / no-JS contract).
    expect(html).toContain(scTotal.toLocaleString('en-US'));

    // Two exact surfaces (ImpactBand + MapSection) and one floor surface (Hero).
    expect(html.match(/data-live-sc="exact"/g)?.length).toBe(2);
    expect(html).toContain('data-live-sc="floor"');
  });
});
```

### Step 2 — Run it (expect FAIL)

```
npx vitest run tests/config-guards.test.ts -t "Live counter graceful degradation"
```

Expected: FAIL — the built homepage has no `data-live-sc` attributes yet (count is `undefined`,
`toContain('data-live-sc="floor"')` fails).

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

Expected: PASS — the built homepage contains the SSR number, two `data-live-sc="exact"`, and one
`data-live-sc="floor"`.

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

Bump the cron weekly → daily. Because `build-impact-stats` now imports the shared TS module (so
it needs esbuild) and reads the boundary GeoJSON (generated by the prebuild from the
`open-civics-boundaries` dependency), the job must install deps and run the prebuild — steps the
prior install-free job lacked. **See "Resolved ambiguities" #4 — this is broader than the design's
one-line "weekly → daily" and should be confirmed at review.**

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
    expect(wf).toContain('npm run build-impact-stats');
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
      # build-impact-stats now imports the shared TS count module
      # (src/lib/sc-camera-count.ts) via esbuild, and reads the SC boundary
      # GeoJSON that the prebuild copies into public/districts from the
      # open-civics-boundaries package — so this job installs deps and runs the
      # prebuild before deriving the figures. The atomic refresh (design §4.1)
      # then fetches the snapshot and derives the SC total + per-jurisdiction
      # counts + impact stats from that one snapshot so the artifacts agree.
      - run: npm ci
      - run: npm run prebuild
      - run: node scripts/fetch-camera-data.mjs
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
ci(counter): refresh camera data daily

Bump the refresh cron weekly -> daily so the committed fallback number and the
map snapshot stay fresh. Add npm ci + npm run prebuild (and Node 22) because
build-impact-stats now imports the shared TS module and reads the boundary
GeoJSON the prebuild generates from open-civics-boundaries.

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
#       src/lib/sc-camera-count.test.ts        (unit + parity)
#       tests/functions/sc-camera-count.test.ts (function)
#       src/scripts/live-count.test.ts          (client helpers)
#       src/scripts/count-up.test.ts            (unchanged — still green)
#       tests/config-guards.test.ts             (refactor, routing, CSP, workflow,
#                                                graceful-degradation guards)

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
   Confirms `included_files` bundled `public/districts/**` and `process.cwd()` resolves them.
2. Homepage: with JS enabled, the Hero floor / ImpactBand / MapSection SC numbers reflect the live
   value; with JS disabled (or the endpoint 500'd manually), they show the build-time number.
   Confirm no CSP `connect-src` violation in the console (same-origin `/api` fetch).
3. Locally (optional): `npx netlify functions:serve` in one terminal + `npm run dev` in another;
   `GET /api/sc-camera-count` proxies through.

### At-merge housekeeping (owned repo)

- Update `MANIFEST.md`: the `scripts/build-impact-stats.mjs` references (Structure line + Key
  Relationships) become `build-impact-stats.ts`; add the new `src/lib/sc-camera-count.ts`,
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
   Resolved by bundling them into the function with `[functions] included_files = ["public/districts/**"]`
   and reading from `resolve(process.cwd(), 'public', 'districts')`. This path resolution is the
   one item to confirm on a deploy preview (Verification step 1).

3. **TS module imported by a Node build script.** `build-impact-stats.mjs` was intentionally
   plain-Node ("no npm ci, no TS toolchain") with an *inlined* PIP copy. The design's
   single-source-of-truth requirement (import the shared `.ts`) is incompatible with plain-Node
   import. Resolved with the repo's existing pattern (`codes`, `build-wordlist`): author the
   generator as `.ts`, add an esbuild-bundle npm script, run `node` on the bundle. This obsoletes
   the old "dependency-free workflow" note.

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
