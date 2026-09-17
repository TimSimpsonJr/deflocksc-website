# Overpass Camera-Data Migration + Map Declustering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Source `public/camera-data.json` from OpenStreetMap via the Overpass API (fixing the ~18% SC undercount and letting the daily refresh run in CI again), and remove camera-dot clustering on the map in favor of zoom-scaled dots with fading directional cones.

**Architecture:** A new pure module `src/lib/overpass.ts` owns every trust decision about an Overpass response (envelope, freshness, like-scope regression, element→`Camera` mapping); the rewritten `scripts/fetch-camera-data.ts` orchestrates mirrors/retries/file I/O around it and fails red (non-zero exit, prior snapshot untouched) when no mirror passes. Downstream count generation (`build-impact-stats.ts` / `sc-camera-count.ts`) is untouched. On the map, `MapSection.astro` clips the fed camera set to `SC_BOUNDS` before `setData`, and `cameras.ts` drops the cluster source/layers so `camera-dots` (sole interactive layer) covers every camera and `camera-cones` becomes a decorative zoom-faded overlay.

**Tech Stack:** TypeScript (esbuild-bundled Node scripts resolving paths from `process.cwd()`), vitest (unit + exec-test harness that stubs global `fetch` via `node --import`), MapLibre GL JS, Astro 5, GitHub Actions.

---

Date: 2026-09-17
Branch: `feature/overpass-camera-migration`
Design: [`2026-09-17-overpass-camera-migration-design.md`](./2026-09-17-overpass-camera-migration-design.md) (Codex-approved, 3 rounds)
Issue: #125

Task order matters: Tasks 1-4 are the data pipeline (each leaves a green, committable tree), Tasks 5-7 are the map + copy, Task 8 is a post-merge rollout checklist. Every task ends with the full suite green (`npm test`; note `tests/config-guards.test.ts` runs a real `astro build` in `beforeAll`, so a compile error anywhere in the site fails the suite; budget ~2-4 min for a full run).

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/overpass.ts` | **Create** | Pure, I/O-free Overpass rules: `OVERPASS_MIRRORS`, `buildOverpassQuery`, `assertOverpassEnvelope`, `assertFresh`, `mapOverpassElements`, `assertNoRegression`, `OverpassResponseError`, `OverpassCamera` type. Imports `SC_BOUNDS` / `filterToScBounds` / `Camera` from `sc-camera-count.ts`. |
| `src/lib/overpass.test.ts` | **Create** | Unit tests for every rule above (vitest, node env). |
| `scripts/fetch-camera-data.ts` | **Rewrite** | Orchestrator: read prior snapshot, POST the query to each mirror in order (2 attempts each), run envelope → fresh → map → regression → `assertValidCameraPayload`, write `public/camera-data.json` on first pass, `process.exit(1)` if all mirrors fail. |
| `tests/fetch-camera-data.exec.test.ts` | **Rewrite** | Exec-test harness: fetch stub now keyed by mirror URL and returning Overpass envelopes; existing all-or-nothing + snapshot-untouched cases kept; new remark / stale / regression / override / mirror-fallback / total-failure cases. |
| `tests/config-guards.test.ts` | **Modify** | Tighten the workflow cron guard so a commented-out `schedule:` no longer passes; add a provenance-copy guard (Task 7). |
| `.github/workflows/refresh-camera-data.yml` | **Modify** | Restore the daily `schedule:` under `on:`; keep `workflow_dispatch`; truth-up header comments. Steps unchanged. |
| `src/scripts/map/layers/cameras.ts` | **Modify** | `cluster: false`; remove `cluster-glow` / `clusters` / `cluster-count` layers and their handlers; `camera-dots` covers all cameras with zoom-interpolated radius and is the sole interactive layer; `camera-cones` gains `icon-opacity` fade; export `CAMERA_LAYER_IDS`. |
| `src/scripts/map/layers/cameras.test.ts` | **Modify** | Add a declustering guard block (layer-id export + source-text assertions). |
| `src/components/MapSection.astro` | **Modify** | Filter `cameras` through `inScBounds` in `onUpdate` before `toGeoJSON`; replace the DeFlock data credit with an OpenStreetMap contributors (ODbL) data credit. |
| `src/content/blog/building-deflocksc.md` | **Modify** (via `copydesk:write`) | ~L55: weekly → daily; DeFlock framing → OSM source. |
| `src/content/blog/how-to-fight-alpr-surveillance-sc.md` | **Modify** (via `copydesk:write`) | L20: hourly → daily, remove the clusters sentence, reconcile provenance; L107: hourly → daily, reconcile provenance. |
| `public/camera-data.json`, `public/camera-counts.json`, `src/data/impact-stats.json` | **Regenerate** (Task 2, real network) | The SC-bbox Overpass snapshot replaces the ~64k-record regional tile; derived counts follow. |
| `scripts/refresh-camera-data.local.ps1` | **Delete — post-merge only** (Task 8) | Retired after ≥1 successful CI Overpass refresh on `master`. |
| `MANIFEST.md` | **Rewrite** (finishing) | Full rewrite to budget before merge, per repo rule. |

Unchanged on purpose: `scripts/build-impact-stats.ts`, `src/lib/sc-camera-count.ts`, `src/scripts/map/tile-loader.ts`, `netlify.toml` (the `/deflock-tiles/*` proxy stays; the live loader is out of scope).

---

## Task 1: `src/lib/overpass.ts` — pure validation/mapping module

**Files:**
- Create: `src/lib/overpass.ts`
- Test: `src/lib/overpass.test.ts`

### 1a. Query builder + envelope check

- [ ] **Step 1: Write the failing tests** — create `src/lib/overpass.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OVERPASS_MIRRORS,
  OverpassResponseError,
  buildOverpassQuery,
  assertOverpassEnvelope,
  assertFresh,
  mapOverpassElements,
  assertNoRegression,
} from './overpass.js';
import {
  SC_BOUNDS,
  assertValidCameraPayload,
  InvalidCameraPayloadError,
  type Camera,
} from './sc-camera-count.js';

/** n well-formed records inside SC_BOUNDS. */
const inSc = (n: number): Camera[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, lat: 34, lon: -81 }));
/** n well-formed records far outside SC_BOUNDS (Kansas). */
const outSc = (n: number): Camera[] =>
  Array.from({ length: n }, (_, i) => ({ id: 100_000 + i, lat: 40, lon: -100 }));

describe('OVERPASS_MIRRORS', () => {
  it('lists the three mirrors in fallback order (design §1)', () => {
    expect(OVERPASS_MIRRORS).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
    ]);
  });
});

describe('buildOverpassQuery', () => {
  it('formats SC_BOUNDS as (south,west,north,east) with the ALPR node filter', () => {
    expect(buildOverpassQuery(SC_BOUNDS)).toBe(
      '[out:json][timeout:120];\n' +
        'node["man_made"="surveillance"]["surveillance:type"="ALPR"](31.5,-84,35.5,-78);\n' +
        'out body;',
    );
  });

  it('defaults to SC_BOUNDS', () => {
    expect(buildOverpassQuery()).toBe(buildOverpassQuery(SC_BOUNDS));
  });
});

describe('assertOverpassEnvelope', () => {
  const good = {
    version: 0.6,
    generator: 'Overpass API 0.7.62',
    osm3s: { timestamp_osm_base: '2026-09-17T11:30:12Z' },
    elements: [],
  };

  it('accepts a well-formed envelope', () => {
    expect(() => assertOverpassEnvelope(good)).not.toThrow();
  });

  it('rejects a 200 that carries a top-level remark (server-side abort / partial result)', () => {
    const aborted = { ...good, remark: 'runtime error: Query timed out in "query" at line 2' };
    expect(() => assertOverpassEnvelope(aborted)).toThrow(OverpassResponseError);
    expect(() => assertOverpassEnvelope(aborted)).toThrow(/remark/);
  });

  it('rejects an envelope with no elements array', () => {
    const { elements: _omit, ...noElements } = good;
    expect(() => assertOverpassEnvelope(noElements)).toThrow(/elements/);
    expect(() => assertOverpassEnvelope({ ...good, elements: 'nope' })).toThrow(/elements/);
  });

  it('rejects a bare array (the old DeFlock CDN shape is not an Overpass envelope)', () => {
    expect(() => assertOverpassEnvelope([{ id: 1, lat: 34, lon: -81 }])).toThrow(
      OverpassResponseError,
    );
  });

  it('rejects null / non-object payloads', () => {
    expect(() => assertOverpassEnvelope(null)).toThrow(OverpassResponseError);
    expect(() => assertOverpassEnvelope('elements')).toThrow(OverpassResponseError);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (module does not exist yet)**

```
npx vitest run src/lib/overpass.test.ts
```

Expected:

```
 FAIL  src/lib/overpass.test.ts [ src/lib/overpass.test.ts ]
Error: Failed to load url ./overpass.js (resolved id: ./overpass.js) in C:/Users/tim/workspace/deflocksc-website/src/lib/overpass.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

- [ ] **Step 3: Create `src/lib/overpass.ts` with the mirrors, query builder, error class, and envelope check** (the remaining exports are added in 1b-1d; the test file will keep failing on the missing imports until then, which is expected):

```ts
/**
 * overpass.ts — the pure rules for trusting an Overpass (OpenStreetMap)
 * camera response (design 2026-09-17 §1).
 *
 * No I/O lives here: scripts/fetch-camera-data.ts owns the network, retries,
 * mirror fallback, file write, and process exit. This module owns every
 * DECISION about whether a response may be written — so each rule is
 * unit-testable in isolation and the exec-test harness only has to prove the
 * script wires them in the right order.
 *
 * Why an HTTP 200 is not enough: on a server-side abort Overpass returns 200
 * with a top-level `remark` and a partial/empty `elements` array, and a mirror
 * can serve a stale replica. Either would pass the structural payload gate
 * (assertValidCameraPayload) and silently overwrite the snapshot with an
 * undercount. The checks below close that gap; the shared structural gate is
 * still run last by the script, unchanged.
 */
import { SC_BOUNDS, filterToScBounds, type Camera } from './sc-camera-count.js';

/** A camera record as written to public/camera-data.json: the count fields plus OSM tags. */
export interface OverpassCamera extends Camera {
  tags?: Record<string, string>;
}

/** Tried in order; the first mirror whose response passes every check wins. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
] as const;

/** Thrown by every check in this module when a response must not be trusted. */
export class OverpassResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassResponseError';
  }
}

interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Overpass QL for every ALPR surveillance node in the bbox. Overpass bbox order
 * is (south,west,north,east) = (minLat,minLon,maxLat,maxLon). The production
 * point-in-polygon clip downstream does the real SC trimming, exactly as today.
 */
export function buildOverpassQuery(bounds: LatLonBounds = SC_BOUNDS): string {
  const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;
  return [
    '[out:json][timeout:120];',
    `node["man_made"="surveillance"]["surveillance:type"="ALPR"](${bbox});`,
    'out body;',
  ].join('\n');
}

/** The parts of an Overpass JSON envelope the refresh reads. */
export interface OverpassEnvelope {
  elements: unknown[];
  osm3s?: { timestamp_osm_base?: unknown };
}

/**
 * No error envelope: a present top-level `remark` means Overpass aborted
 * (timeout / memory) and `elements` is partial — reject regardless of length.
 * `elements` must be a present array.
 */
export function assertOverpassEnvelope(data: unknown): asserts data is OverpassEnvelope {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new OverpassResponseError('Overpass response is not a JSON object envelope');
  }
  const d = data as Record<string, unknown>;
  if (d.remark !== undefined) {
    throw new OverpassResponseError(
      `Overpass returned a remark (server-side abort or partial result): ${String(d.remark)}`,
    );
  }
  if (!Array.isArray(d.elements)) {
    throw new OverpassResponseError('Overpass response has no elements array');
  }
}
```

- [ ] **Step 4: Run the test** — the file now loads, and the 1a tests PASS; nothing else is exercised yet:

```
npx vitest run src/lib/overpass.test.ts
```

Expected: `✓ src/lib/overpass.test.ts (8 tests)`. (Vitest resolves a missing named export to `undefined` rather than failing at load time, so later sub-steps fail per-test with `TypeError: (0 , __vite_ssr_import_0__.assertFresh) is not a function` — that is the expected red.) Proceed to 1b.

### 1b. Freshness check

- [ ] **Step 5: Append the freshness tests** to `src/lib/overpass.test.ts`:

```ts
describe('assertFresh', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  it('accepts a timestamp_osm_base a few minutes old', () => {
    expect(() => assertFresh('2026-09-17T11:30:12Z', now)).not.toThrow();
  });

  it('accepts a timestamp just inside the 48h default window', () => {
    expect(() => assertFresh('2026-09-15T13:00:00Z', now)).not.toThrow(); // 47h old
  });

  it('rejects a stale replica older than maxAgeHours (default 48h)', () => {
    expect(() => assertFresh('2026-09-15T11:00:00Z', now)).toThrow(OverpassResponseError); // 49h old
    expect(() => assertFresh('2026-09-15T11:00:00Z', now)).toThrow(/stale/);
  });

  it('accepts small future skew inside maxFutureSkewHours (default 2h)', () => {
    expect(() => assertFresh('2026-09-17T13:00:00Z', now)).not.toThrow(); // 1h ahead
  });

  it('rejects a timestamp too far in the future', () => {
    expect(() => assertFresh('2026-09-17T15:00:00Z', now)).toThrow(/future/); // 3h ahead
  });

  it('honors custom windows', () => {
    expect(() => assertFresh('2026-09-17T09:00:00Z', now, 2)).toThrow(/stale/); // 3h old, max 2h
    expect(() => assertFresh('2026-09-17T15:00:00Z', now, 48, 4)).not.toThrow(); // 3h ahead, skew 4h
  });

  it('rejects a missing timestamp_osm_base (presence is required, not assumed)', () => {
    expect(() => assertFresh(undefined, now)).toThrow(/timestamp_osm_base/);
    expect(() => assertFresh(null, now)).toThrow(OverpassResponseError);
  });

  it('rejects an unparseable timestamp', () => {
    expect(() => assertFresh('yesterday-ish', now)).toThrow(/parseable/);
  });
});
```

- [ ] **Step 6: Run — expect the 8 new tests to FAIL** (`npx vitest run src/lib/overpass.test.ts` → `× assertFresh > …` ×8, each `TypeError: (0 , __vite_ssr_import_0__.assertFresh) is not a function`; the 8 tests from 1a stay green).

- [ ] **Step 7: Append `assertFresh` to `src/lib/overpass.ts`:**

```ts
/**
 * Fresh, not just present: `osm3s.timestamp_osm_base` is the OSM data
 * timestamp the mirror answered from. Reject when it is older than
 * `maxAgeHours` (a stale replica) or more than `maxFutureSkewHours` ahead of
 * `now` (a broken clock). A missing/unparseable timestamp is rejected too —
 * presence is a requirement, not an assumption.
 */
export function assertFresh(
  timestampOsmBase: unknown,
  now: Date = new Date(),
  maxAgeHours = 48,
  maxFutureSkewHours = 2,
): void {
  if (typeof timestampOsmBase !== 'string') {
    throw new OverpassResponseError('Overpass response is missing osm3s.timestamp_osm_base');
  }
  const ts = Date.parse(timestampOsmBase);
  if (Number.isNaN(ts)) {
    throw new OverpassResponseError(
      `Overpass timestamp_osm_base is not a parseable date: ${timestampOsmBase}`,
    );
  }
  const ageHours = (now.getTime() - ts) / 3_600_000;
  if (ageHours > maxAgeHours) {
    throw new OverpassResponseError(
      `Overpass data is stale: timestamp_osm_base ${timestampOsmBase} is ${ageHours.toFixed(1)}h old (max ${maxAgeHours}h)`,
    );
  }
  if (-ageHours > maxFutureSkewHours) {
    throw new OverpassResponseError(
      `Overpass timestamp_osm_base ${timestampOsmBase} is ${(-ageHours).toFixed(1)}h in the future (max skew ${maxFutureSkewHours}h)`,
    );
  }
}
```

- [ ] **Step 8: Run** — expect `✓ src/lib/overpass.test.ts (16 tests)`. Proceed.

### 1c. Element → camera mapping

- [ ] **Step 9: Append the mapping tests:**

```ts
describe('mapOverpassElements', () => {
  it('keeps only type === "node" elements', () => {
    const mapped = mapOverpassElements({
      elements: [
        { type: 'way', id: 1, nodes: [2, 3] },
        { type: 'node', id: 2, lat: 34, lon: -81 },
        { type: 'relation', id: 9, members: [] },
      ],
    });
    expect(mapped).toEqual([{ id: 2, lat: 34, lon: -81 }]);
  });

  it('preserves tags verbatim (the map reads direction / camera:direction / manufacturer / operator / wikimedia_commons)', () => {
    const tags = {
      direction: '75',
      'camera:direction': '80',
      manufacturer: 'Flock Safety',
      operator: 'Greenville Police Department',
      wikimedia_commons: 'File:Flock camera.jpg',
      man_made: 'surveillance',
    };
    const [cam] = mapOverpassElements({
      elements: [{ type: 'node', id: 3, lat: 34.85, lon: -82.39, tags }],
    });
    expect(cam.tags).toEqual(tags);
  });

  it('omits the tags key when the node has none', () => {
    const [cam] = mapOverpassElements({ elements: [{ type: 'node', id: 4, lat: 34, lon: -81 }] });
    expect('tags' in cam).toBe(false);
  });

  it('does NOT filter malformed nodes — structural validity is assertValidCameraPayload\'s job (all-or-nothing)', () => {
    const mapped = mapOverpassElements({
      elements: [
        { type: 'node', id: 5, lat: 34, lon: -81 },
        { type: 'node', id: 6, lat: 'x', lon: 'y' },
      ],
    });
    expect(mapped).toHaveLength(2);
    expect(() => assertValidCameraPayload(mapped)).toThrow(InvalidCameraPayloadError);
  });

  it('returns an empty array for an empty elements array', () => {
    expect(mapOverpassElements({ elements: [] })).toEqual([]);
  });
});
```

- [ ] **Step 10: Run** — expect the 5 `mapOverpassElements` tests to FAIL with `TypeError: (0 , __vite_ssr_import_0__.mapOverpassElements) is not a function`; 16 still green.

- [ ] **Step 11: Append `mapOverpassElements` to `src/lib/overpass.ts`:**

```ts
/**
 * Map accepted Overpass elements to the camera shape the snapshot has always
 * held: { id, lat, lon, tags }. Only `type === 'node'` elements are cameras
 * (the query asks for nodes only; ways/relations are dropped defensively).
 *
 * Deliberately NO structural filtering here: id/lat/lon are passed through
 * as-is so that assertValidCameraPayload — the single all-or-nothing gate the
 * build generator also re-asserts — stays the only authority on validity. A
 * malformed node therefore rejects the WHOLE response (fail-red), never a
 * silently filtered undercount.
 */
export function mapOverpassElements(data: OverpassEnvelope): OverpassCamera[] {
  const cameras: OverpassCamera[] = [];
  for (const el of data.elements) {
    if (typeof el !== 'object' || el === null) continue;
    const e = el as Record<string, unknown>;
    if (e.type !== 'node') continue;
    const cam: OverpassCamera = {
      id: e.id as OverpassCamera['id'],
      lat: e.lat as number,
      lon: e.lon as number,
    };
    if (typeof e.tags === 'object' && e.tags !== null) {
      cam.tags = e.tags as Record<string, string>;
    }
    cameras.push(cam);
  }
  return cameras;
}
```

- [ ] **Step 12: Run** — expect `✓ src/lib/overpass.test.ts (21 tests)`.

### 1d. Like-scope regression check

- [ ] **Step 13: Append the regression tests:**

```ts
describe('assertNoRegression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is skipped when there is no prior snapshot', () => {
    expect(() => assertNoRegression(inSc(5), null)).not.toThrow();
  });

  it('projects the PRIOR through SC_BOUNDS before comparing (first-migration case: regional tile vs SC set)', () => {
    // Prior looks like the old ~64k regional tile: mostly outside SC. Raw-length
    // compare would wrongly reject; like-scope compare (1000 vs 1000) passes.
    const prior = [...inSc(1000), ...outSc(3000)];
    expect(() => assertNoRegression(inSc(1000), prior)).not.toThrow();
  });

  it('projects the CANDIDATE through SC_BOUNDS too (out-of-SC padding cannot mask a drop)', () => {
    const candidate = [...inSc(1200), ...outSc(5000)];
    expect(() => assertNoRegression(candidate, inSc(2000))).toThrow(/Implausible camera regression/);
  });

  it('rejects a drop of more than maxDrop (default 10%) against the projected prior', () => {
    expect(() => assertNoRegression(inSc(1799), inSc(2000))).toThrow(OverpassResponseError);
    expect(() => assertNoRegression(inSc(1800), inSc(2000))).not.toThrow();
  });

  it('never accepts a candidate below the floor (default 1000), even when the prior is tiny', () => {
    expect(() => assertNoRegression(inSc(2), inSc(1))).toThrow(/floor 1000/);
  });

  it('honors custom floor / maxDrop', () => {
    expect(() => assertNoRegression(inSc(2), inSc(1), { floor: 1 })).not.toThrow();
    expect(() => assertNoRegression(inSc(1500), inSc(2000), { maxDrop: 0.3 })).not.toThrow();
    expect(() => assertNoRegression(inSc(1300), inSc(2000), { maxDrop: 0.3 })).toThrow();
  });

  it('allowDrop: warns and accepts instead of throwing (explicit, logged override)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertNoRegression(inSc(1200), inSc(2000), { allowDrop: true })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ALLOW_CAMERA_DROP/);
  });

  it('allowDrop does not warn when there is no regression', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertNoRegression(inSc(2000), inSc(2000), { allowDrop: true });
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 14: Run** — expect the 9 `assertNoRegression` tests to FAIL with `TypeError: (0 , __vite_ssr_import_0__.assertNoRegression) is not a function` (the "is skipped when there is no prior snapshot" case fails the same way, since the call itself throws); 21 still green.

- [ ] **Step 15: Append `assertNoRegression` to `src/lib/overpass.ts`:**

```ts
export interface RegressionOptions {
  /** Absolute minimum accepted SC-bbox count. Default 1000. */
  floor?: number;
  /** Max fractional drop vs the projected prior. Default 0.10 (tighter than the ~18% undercount this migration fixes). */
  maxDrop?: number;
  /** When true, a regression is logged and ACCEPTED (process.env.ALLOW_CAMERA_DROP === '1' in the script). */
  allowDrop?: boolean;
}

/**
 * No implausible regression, compared like-scope to like-scope: BOTH the
 * candidate and the prior committed snapshot are projected through
 * filterToScBounds before counting. This is what makes the FIRST migration run
 * valid — prior = the ~64k-record regional tile (~5,700 inside SC_BOUNDS),
 * candidate = the ~6,500-record SC-bbox set; a raw-length compare would
 * wrongly reject it. Skipped only when there is no prior. A genuine large
 * removal is allowed through `allowDrop` (a logged override), never by
 * loosening the default threshold.
 */
export function assertNoRegression(
  candidate: Camera[],
  prior: Camera[] | null,
  opts: RegressionOptions = {},
): void {
  const { floor = 1000, maxDrop = 0.1, allowDrop = false } = opts;
  if (prior === null) return;
  const candidateCount = filterToScBounds(candidate).length;
  const priorCount = filterToScBounds(prior).length;
  const threshold = Math.max(floor, Math.ceil(priorCount * (1 - maxDrop)));
  if (candidateCount >= threshold) return;
  const detail =
    `SC-bbox candidate count ${candidateCount} is below threshold ${threshold} ` +
    `(prior ${priorCount}, floor ${floor}, maxDrop ${maxDrop})`;
  if (allowDrop) {
    console.warn(`ALLOW_CAMERA_DROP override: accepting implausible regression — ${detail}`);
    return;
  }
  throw new OverpassResponseError(
    `Implausible camera regression: ${detail}. Set ALLOW_CAMERA_DROP=1 to accept a genuine large removal.`,
  );
}
```

- [ ] **Step 16: Run the whole file — expect PASS:**

```
npx vitest run src/lib/overpass.test.ts
```

Expected:

```
 ✓ src/lib/overpass.test.ts (30 tests) 12ms
 Test Files  1 passed (1)
      Tests  30 passed (30)
```

- [ ] **Step 17: Commit**

```
git add src/lib/overpass.ts src/lib/overpass.test.ts
git commit -m "feat(camera): pure Overpass envelope/freshness/regression/mapping module

Adds src/lib/overpass.ts (no I/O) with the trust rules from the 2026-09-17
design: reject 200-with-remark envelopes, stale timestamp_osm_base, and
like-scope (SC_BOUNDS-projected) implausible regressions; map node elements to
the existing { id, lat, lon, tags } camera shape without structural filtering
so assertValidCameraPayload stays the single all-or-nothing gate.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `scripts/fetch-camera-data.ts` around Overpass

**Files:**
- Modify: `scripts/fetch-camera-data.ts` (full rewrite)
- Test: `tests/fetch-camera-data.exec.test.ts` (rewritten in Task 3 — this task first makes the EXISTING harness fail for the right reason, then ships the script; Task 3 brings the harness to the new contract). To keep every commit green, Task 2 and Task 3 land as ONE commit at the end of Task 3; the intermediate red is expected.

- [ ] **Step 1: Run the existing exec test to record the baseline (PASS today):**

```
npx vitest run tests/fetch-camera-data.exec.test.ts
```

Expected: `✓ tests/fetch-camera-data.exec.test.ts (3 tests)`.

- [ ] **Step 2: Replace `scripts/fetch-camera-data.ts` with the Overpass orchestrator:**

```ts
/**
 * fetch-camera-data.ts — refresh public/camera-data.json from OpenStreetMap via
 * the Overpass API (design 2026-09-17 §1), for the build-time impact-stats
 * generator. Replaces the single DeFlock CDN tile fetch, which (a) covered only
 * longitude [-100,-80) and so missed every SC camera east of -80 (~18%
 * undercount, issue #125) and (b) 403'd all datacenter egress, so the daily
 * refresh could not run in CI.
 *
 * This is the UNTRUSTED-INPUT boundary of the refresh pipeline. Per mirror, a
 * response is accepted only if ALL of these pass, in order:
 *   1. assertOverpassEnvelope — no top-level `remark` (server-side abort), a
 *      present `elements` array;
 *   2. assertFresh           — osm3s.timestamp_osm_base within 48h / not >2h
 *                              in the future (a mirror can serve a stale replica);
 *   3. mapOverpassElements   — node elements -> { id, lat, lon, tags };
 *   4. assertNoRegression    — SC_BOUNDS-projected candidate count vs the
 *                              SC_BOUNDS-projected prior snapshot (floor 1000,
 *                              max 10% drop; ALLOW_CAMERA_DROP=1 overrides);
 *   5. assertValidCameraPayload — the SHARED all-or-nothing structural gate
 *                              build-impact-stats.ts re-asserts.
 * Any failure advances to the next mirror. If every mirror fails, main() throws
 * -> non-zero exit -> the prior committed snapshot is left untouched (fail-red).
 * A write happens only after a mirror passes every check.
 *
 * Run via `npm run fetch-camera-data`, which esbuild-bundles this TS (and the
 * shared modules) before executing it. Because that bundle lands in
 * node_modules/.cache, paths are resolved from process.cwd() (the repo root),
 * NOT import.meta.url.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertValidCameraPayload, type Camera } from '../src/lib/sc-camera-count.js';
import {
  OVERPASS_MIRRORS,
  buildOverpassQuery,
  assertOverpassEnvelope,
  assertFresh,
  mapOverpassElements,
  assertNoRegression,
} from '../src/lib/overpass.js';

const USER_AGENT =
  'deflocksc-website/1.0 (+https://github.com/TimSimpsonJr/deflocksc-website)';
const OUT_PATH = resolve(process.cwd(), 'public', 'camera-data.json');
const QUERY = buildOverpassQuery();

/** Network/HTTP attempts per mirror before moving on. Validation failures are NOT retried. */
const ATTEMPTS_PER_MIRROR = 2;
/** Pause between attempts. Overridable so the exec tests do not sleep. */
const RETRY_DELAY_MS = Number(process.env.OVERPASS_RETRY_DELAY_MS ?? 2000);
/** Slightly above the query's own [timeout:120] so Overpass, not us, reports the abort. */
const FETCH_TIMEOUT_MS = 150_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * The committed snapshot, or null when absent/unreadable (the regression check
 * is skipped only in that case, and says so).
 */
function readPriorSnapshot(): Camera[] | null {
  if (!existsSync(OUT_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(OUT_PATH, 'utf-8')) as unknown;
    assertValidCameraPayload(raw);
    return raw;
  } catch (err) {
    console.warn(`Prior snapshot at ${OUT_PATH} is unreadable; regression check will be skipped:`, err);
    return null;
  }
}

/** POST the query to one mirror, retrying transient network/HTTP failures. */
async function fetchOverpass(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS_PER_MIRROR; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`${url} responded ${resp.status} ${resp.statusText}`);
      return (await resp.json()) as unknown;
    } catch (err) {
      lastErr = err;
      console.warn(
        `  attempt ${attempt}/${ATTEMPTS_PER_MIRROR} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < ATTEMPTS_PER_MIRROR) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

/** Fetch + run every trust check for one mirror. Throws on the first failure. */
async function tryMirror(url: string, prior: Camera[] | null, allowDrop: boolean): Promise<Camera[]> {
  const data = await fetchOverpass(url);
  assertOverpassEnvelope(data);
  assertFresh(data.osm3s?.timestamp_osm_base);
  const cameras = mapOverpassElements(data);
  assertNoRegression(cameras, prior, { allowDrop });
  // Shared structural gate LAST, on the mapped array — same validator
  // build-impact-stats.ts re-asserts, so both steps reject identical payloads.
  assertValidCameraPayload(cameras);
  return cameras;
}

async function main(): Promise<void> {
  const prior = readPriorSnapshot();
  const allowDrop = process.env.ALLOW_CAMERA_DROP === '1';
  if (allowDrop) {
    console.warn('ALLOW_CAMERA_DROP=1: an implausible regression will be logged and ACCEPTED this run');
  }
  console.log(
    `Prior snapshot: ${prior ? `${prior.length} cameras` : 'none (regression check skipped)'}`,
  );

  const failures: string[] = [];
  for (const url of OVERPASS_MIRRORS) {
    console.log(`Querying Overpass mirror ${url} ...`);
    try {
      const cameras = await tryMirror(url, prior, allowDrop);
      console.log(`Accepted ${cameras.length} cameras from ${url} (all well-formed)`);
      writeFileSync(OUT_PATH, JSON.stringify(cameras));
      console.log(`Wrote ${OUT_PATH}`);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`Mirror ${url} rejected: ${reason}`);
      failures.push(`${url}: ${reason}`);
    }
  }
  throw new Error(
    `All Overpass mirrors failed; prior snapshot left untouched.\n  ${failures.join('\n  ')}`,
  );
}

main().catch((err) => {
  console.error('Failed to fetch camera data:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the OLD exec harness — it must now FAIL, for the right reason** (its stub returns a bare array, which `assertOverpassEnvelope` rejects, so the positive control exits non-zero):

```
npx vitest run tests/fetch-camera-data.exec.test.ts
```

Expected:

```
 ❯ tests/fetch-camera-data.exec.test.ts (3 tests | 1 failed)
   ✓ FAILS non-zero on a MIXED valid+malformed payload and overwrites NOTHING
   ✓ FAILS non-zero on an EMPTY array and does not write an empty snapshot
   × positive control: a fully well-formed payload exits 0 and DOES write the new snapshot
     AssertionError: expected false to be true
```

- [ ] **Step 4: Run the config guards that read this script (must still PASS — the import and `assertValidCameraPayload` call are preserved):**

```
npx vitest run tests/config-guards.test.ts -t "fetch-camera-data validation boundary"
```

Expected: `✓ validates via the shared all-or-nothing validator before writing`, `✓ does not re-inline a local well-formed check`, `✓ exposes an esbuild-bundled npm script` (the `astro build` in `beforeAll` still runs; ~1-2 min).

Do NOT commit yet — continue straight into Task 3, which turns the harness green.

---

## Task 3: Rewrite `tests/fetch-camera-data.exec.test.ts` for the Overpass contract

**Files:**
- Modify: `tests/fetch-camera-data.exec.test.ts` (full rewrite)
- Then commit Tasks 2 + 3 together.

- [ ] **Step 1: Replace `tests/fetch-camera-data.exec.test.ts`:**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OVERPASS_MIRRORS } from '../src/lib/overpass.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'fetch-camera-data.exec-test.mjs');

const [MIRROR_1, MIRROR_2] = OVERPASS_MIRRORS;

// A prior committed snapshot the fetch step must NOT clobber on a bad payload,
// plus the two downstream artifacts the fetch step never writes (seeded so the
// "artifacts unchanged" guarantee is literal — the build step that would write
// them never runs because fetch fails first). ONE record inside SC: the
// regression check then projects it to 1, so the threshold is the floor (1000).
const PRIOR_SNAPSHOT = JSON.stringify([{ id: 42, lat: 34, lon: -81 }]);
const PRIOR_COUNTS = JSON.stringify({ 'county:test': 5 }) + '\n';
const PRIOR_STATS = JSON.stringify({ scTotal: 5, jurisdictions: 1, generatedAt: 'x' }) + '\n';

// --- Overpass fixtures ---

type OverpassNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

function node(id: number, lat: number, lon: number, tags?: Record<string, string>): OverpassNode {
  return { type: 'node', id, lat, lon, ...(tags ? { tags } : {}) };
}

/** n well-formed nodes inside SC_BOUNDS on a small grid (clears the 1000 regression floor at n >= 1000). */
function scNodes(n: number): OverpassNode[] {
  return Array.from({ length: n }, (_, i) =>
    node(i + 1, 34 + (i % 100) * 0.001, -81 - Math.floor(i / 100) * 0.001, {
      manufacturer: 'Flock Safety',
    }),
  );
}

/** What the script writes for a node list: type dropped, tags preserved. */
function expectedCameras(nodes: OverpassNode[]) {
  return nodes.map(({ id, lat, lon, tags }) => ({ id, lat, lon, tags }));
}

/** A well-formed Overpass JSON envelope. Default timestamp is "now" (fresh). */
function envelope(elements: unknown[], timestampOsmBase: string = new Date().toISOString()) {
  return {
    version: 0.6,
    generator: 'Overpass API 0.7.62',
    osm3s: { timestamp_osm_base: timestampOsmBase, copyright: 'ODbL' },
    elements,
  };
}

// --- fetch stub, keyed by request URL so mirror fallback can be simulated ---

type MockResponse = { status: number; body: unknown } | { throw: string };
type MockPlan = Record<string, MockResponse>;

/** The same response from every mirror. */
function everyMirror(res: MockResponse): MockPlan {
  return Object.fromEntries(OVERPASS_MIRRORS.map((url) => [url, res]));
}

// A preload module that stubs global fetch. Evaluated (via `node --import`)
// BEFORE the bundle's entry point, so the bundle's fetch(mirrorUrl) calls hit
// this stub — no network, no port. A URL with no plan entry throws like a
// network failure would.
function preload(plan: MockPlan): string {
  return [
    `const PLAN = ${JSON.stringify(plan)};`,
    'globalThis.fetch = async (input) => {',
    "  const url = typeof input === 'string' ? input : input.url;",
    '  const spec = PLAN[url];',
    "  if (!spec) throw new TypeError('fetch failed: no mock for ' + url);",
    "  if ('throw' in spec) throw new TypeError(spec.throw);",
    '  return new Response(JSON.stringify(spec.body), {',
    "    status: spec.status, headers: { 'content-type': 'application/json' } });",
    '};',
    '',
  ].join('\n');
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

function seedFixture(priorSnapshot: string = PRIOR_SNAPSHOT): void {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'fetch-camera-exec-'));
  mkdirSync(join(fixtureRoot, 'public'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  cameraData = join(fixtureRoot, 'public', 'camera-data.json');
  countsOut = join(fixtureRoot, 'public', 'camera-counts.json');
  statsOut = join(fixtureRoot, 'src', 'data', 'impact-stats.json');
  writeFileSync(cameraData, priorSnapshot);
  writeFileSync(countsOut, PRIOR_COUNTS);
  writeFileSync(statsOut, PRIOR_STATS);
}

// Run the bundle from the fixture cwd with `fetch` stubbed per `plan`. Returns
// whether the process exited 0. A throw (non-zero exit) is the failure signal
// the validation boundary produces. Retry delay is zeroed so failing cases do
// not sleep between attempts.
function runBundle(plan: MockPlan, env: Record<string, string> = {}): boolean {
  const preloadPath = join(fixtureRoot, 'mock-fetch.mjs');
  writeFileSync(preloadPath, preload(plan));
  try {
    execFileSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, bundlePath], {
      cwd: fixtureRoot,
      stdio: 'ignore',
      env: { ...process.env, OVERPASS_RETRY_DELAY_MS: '0', ...env },
    });
    return true;
  } catch {
    return false;
  }
}

function expectUntouched(): void {
  expect(readFileSync(countsOut, 'utf8')).toBe(PRIOR_COUNTS);
  expect(readFileSync(statsOut, 'utf8')).toBe(PRIOR_STATS);
}

describe('fetch-camera-data validation boundary (cluster: refresh-boundary-validation)', () => {
  it('FAILS non-zero on a MIXED valid+malformed payload and overwrites NOTHING', () => {
    seedFixture();
    // 1200 well-formed nodes + one malformed: the shared all-or-nothing gate must
    // reject the WHOLE payload, so no filtered undercount is ever written. (1200
    // clears the regression floor, so this exercises the STRUCTURAL gate, not
    // the regression check.)
    const ok = runBundle(
      everyMirror({
        status: 200,
        body: envelope([...scNodes(1200), { type: 'node', id: 9999, lat: 'x', lon: 'y' }]),
      }),
    );
    expect(ok).toBe(false); // process exited non-zero -> refresh step failed
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero on an EMPTY elements array and does not write an empty snapshot', () => {
    seedFixture();
    expect(runBundle(everyMirror({ status: 200, body: envelope([]) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('positive control: a fresh, complete envelope exits 0 and DOES write the mapped snapshot', () => {
    seedFixture();
    const nodes = scNodes(1200);
    expect(runBundle(everyMirror({ status: 200, body: envelope(nodes) }))).toBe(true); // exited 0
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes)); // snapshot replaced
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('Overpass envelope integrity (design 2026-09-17 §1)', () => {
  it('FAILS on a 200 that carries a remark (server-side abort) even with a plausible elements array', () => {
    seedFixture();
    const aborted = {
      ...envelope(scNodes(1200)),
      remark: 'runtime error: Query timed out in "query" at line 2 after 120 seconds.',
    };
    expect(runBundle(everyMirror({ status: 200, body: aborted }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS on a stale timestamp_osm_base (mirror serving an old replica)', () => {
    seedFixture();
    const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
    expect(
      runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200), threeDaysAgo) })),
    ).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS on a missing timestamp_osm_base', () => {
    seedFixture();
    const { osm3s: _omit, ...noTimestamp } = envelope(scNodes(1200));
    expect(runBundle(everyMirror({ status: 200, body: noTimestamp }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('implausible-regression guard (like-scope compare)', () => {
  // Seed a prior with 2000 in-SC cameras; a 1200-camera candidate is a 40% drop.
  const priorLarge = JSON.stringify(expectedCameras(scNodes(2000)));

  it('FAILS when the SC-projected count drops more than 10% vs the prior snapshot', () => {
    seedFixture(priorLarge);
    expect(runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200)) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(priorLarge);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('ALLOW_CAMERA_DROP=1 lets a genuine large removal through (logged override)', () => {
    seedFixture(priorLarge);
    const nodes = scNodes(1200);
    expect(
      runBundle(everyMirror({ status: 200, body: envelope(nodes) }), { ALLOW_CAMERA_DROP: '1' }),
    ).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('mirror fallback + fail-red', () => {
  it('advances to the next mirror on a network error and writes the second mirror\'s good envelope', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { throw: 'fetch failed: ECONNRESET' },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
      // MIRROR_3 deliberately absent: it must never be reached.
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('treats a validation failure (200 + remark) as a mirror failure and advances', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { status: 200, body: { ...envelope(scNodes(5)), remark: 'runtime error: out of memory' } },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('advances on a non-2xx status', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { status: 504, body: 'Gateway Timeout' },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero and leaves the snapshot untouched when EVERY mirror fails (fail-red)', () => {
    seedFixture();
    expect(runBundle({})).toBe(false); // every fetch throws (no plan entries)
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the rewritten harness — expect PASS:**

```
npx vitest run tests/fetch-camera-data.exec.test.ts
```

Expected:

```
 ✓ tests/fetch-camera-data.exec.test.ts (12 tests) 2.1s
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

(Each case spawns a Node process; 12 cases at ~150-250 ms each is normal. If a failing case takes >4 s, `OVERPASS_RETRY_DELAY_MS: '0'` is not reaching the child — check the `env` spread in `runBundle`.)

- [ ] **Step 3: Sanity-check a mutation** — temporarily comment out the `assertFresh(...)` line in `tryMirror`, re-run, and confirm exactly the two timestamp tests fail. Restore the line. (Proves the harness can see each check, not just the exit code path.)

- [ ] **Step 4: Real-network integration run** (residential IP or CI both work for Overpass). This is the first migration run: prior = the committed ~64k regional tile (~5,700 inside SC_BOUNDS), candidate = the SC-bbox set (~6,500). The regression check must PASS (candidate ≥ max(1000, 0.9 × 5,700)):

```
npm run fetch-camera-data
```

Expected (numbers drift day to day; order of magnitude matters):

```
Prior snapshot: 64826 cameras
Querying Overpass mirror https://overpass-api.de/api/interpreter ...
Accepted 6512 cameras from https://overpass-api.de/api/interpreter (all well-formed)
Wrote C:\Users\tim\workspace\deflocksc-website\public\camera-data.json
```

Then derive the counts (methodology unchanged):

```
npm run build-impact-stats
```

Expected: `Loaded 6512 cameras; 6512 inside the SC bounding box` and `SC total (unique camera IDs inside state-outline.json): 2084` (±, per the design's measured snapshot; the committed figure was 1,700). Confirm `git diff --stat` shows `public/camera-data.json` shrinking sharply (~7.3 MB → <1 MB) and `src/data/impact-stats.json` `scTotal` rising from 1700 to ~2084.

Also confirm the downstream exec test still holds against the new snapshot shape (tags preserved, ids numeric):

```
npx vitest run tests/build-impact-stats.exec.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Tasks 2 + 3 + the regenerated data together** (one commit keeps the tree green at every point in history):

```
git add scripts/fetch-camera-data.ts tests/fetch-camera-data.exec.test.ts public/camera-data.json public/camera-counts.json src/data/impact-stats.json
git commit -m "feat(camera): source the snapshot from OpenStreetMap via Overpass (fixes #125)

Rewrites scripts/fetch-camera-data.ts to POST the SC_BOUNDS ALPR query to three
Overpass mirrors in order, accepting a response only after envelope (no
remark), freshness (timestamp_osm_base <=48h), like-scope regression (SC-bbox
projected, floor 1000 / max 10% drop, ALLOW_CAMERA_DROP=1 override), and the
shared all-or-nothing payload gate all pass; any failure advances to the next
mirror and total failure exits non-zero with the prior snapshot untouched.

The old single DeFlock CDN tile covered lon [-100,-80) and missed every SC
camera east of -80 (~18% undercount); it also 403'd datacenter egress. The
exec-test harness now stubs fetch per mirror URL with Overpass envelopes and
covers remark / stale / regression / override / fallback / fail-red.

Regenerates public/camera-data.json (SC-bbox set replaces the regional tile),
camera-counts.json, and impact-stats.json from the first Overpass run.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: Restore the daily `schedule:` in the refresh workflow

**Files:**
- Modify: `.github/workflows/refresh-camera-data.yml`
- Test: `tests/config-guards.test.ts` (tighten the existing `refresh-camera-data workflow` block)

Context: the existing guard `expect(wf).toMatch(/cron:\s*'0 11 \* \* \*'/)` passes TODAY against the commented-out line `#     - cron: '0 11 * * *'`, so it does not actually prove the schedule is live. Also note the preserved comment block sits ABOVE `on:`; simply un-commenting it in place produces invalid YAML (`bad indentation of a mapping entry`) — the block must be nested UNDER `on:`.

- [ ] **Step 1: Tighten the guard.** In `tests/config-guards.test.ts`, replace the `describe('refresh-camera-data workflow (design §3.4)', ...)` block (currently the last block in the file) with:

```ts
describe('refresh-camera-data workflow (design 2026-09-17 §2)', () => {
  const wf = read('.github/workflows/refresh-camera-data.yml');

  it('has a LIVE daily schedule nested under on: (not a commented-out block)', () => {
    // Anchored at `on:` so a cron that only appears in a comment above it cannot
    // satisfy this — the 2026-09-04 stopgap commented the block out and the old
    // /cron:.../ guard kept passing.
    expect(wf).toMatch(/^on:\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+schedule:\r?\n[ \t]+- cron: '0 11 \* \* \*'/m);
    expect(wf).not.toMatch(/^\s*#\s*schedule:/m);
    expect(wf).not.toMatch(/cron:\s*'0 11 \* \* 3'/); // never back to weekly
  });

  it('keeps the manual trigger', () => {
    expect(wf).toMatch(/^[ \t]+workflow_dispatch:/m);
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

- [ ] **Step 2: Run the guard — expect the new schedule test to FAIL against the current file:**

```
npx vitest run tests/config-guards.test.ts -t "refresh-camera-data workflow"
```

Expected (after the `astro build` in `beforeAll`):

```
 × has a LIVE daily schedule nested under on: (not a commented-out block)
   AssertionError: expected 'name: Refresh Camera Data\n\n# Manual-only…' to match /^on:\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+schedule:…/m
 ✓ keeps the manual trigger
 ✓ installs deps and runs the prebuild before deriving figures
 ✓ fetches via the validating TS bundle, not the un-validated .mjs
```

- [ ] **Step 3: Replace `.github/workflows/refresh-camera-data.yml`** (steps unchanged; header comment, `on:` block, and the fetch-step comment truthed-up):

```yaml
name: Refresh Camera Data

# Daily refresh of public/camera-data.json from OpenStreetMap via the Overpass
# API (docs/plans/2026-09-17-overpass-camera-migration-design.md). Overpass
# serves datacenter egress, so this runs in CI again. The previous source
# (DeFlock's Cloudflare CDN) 403'd GitHub runners, which forced a local
# Windows Scheduled Task stopgap (scripts/refresh-camera-data.local.ps1); that
# stays registered until this schedule has produced at least one successful
# refresh on master, then is retired (design §2, rollout).
on:
  schedule:
    - cron: '0 11 * * *' # daily 6am ET
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
      # fetch-camera-data and build-impact-stats are esbuild-bundled TS that
      # import the shared count module (src/lib/sc-camera-count.ts), and
      # build-impact-stats reads the SC boundary GeoJSON the prebuild copies into
      # public/districts from the open-civics-boundaries package — so this job
      # installs deps and runs the prebuild before deriving figures.
      - run: npm ci
      - run: npm run prebuild
      # Atomic refresh: fetch + VALIDATE the Overpass response, then derive the
      # SC total + per-jurisdiction counts + impact stats from that one snapshot
      # so the artifacts agree. fetch-camera-data accepts a mirror's response only
      # after the envelope (no `remark`), freshness (timestamp_osm_base), like-scope
      # regression, and shared ALL-OR-NOTHING payload checks pass; it tries the
      # next mirror on any failure and exits non-zero if every mirror fails. A
      # non-zero exit fails this step and the whole job (GitHub Actions stops on
      # the first non-zero step), so build-impact-stats and the commit step below
      # never run and no corrupt or partial snapshot is ever committed. The prior
      # committed snapshot is left untouched.
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

- [ ] **Step 4: YAML-parse the file** (js-yaml 4.1.1 is already in `node_modules` transitively; no install):

```
node -e "const y=require('js-yaml');const d=y.load(require('fs').readFileSync('.github/workflows/refresh-camera-data.yml','utf8'));console.log(JSON.stringify(d.on))"
```

Expected: `{"schedule":[{"cron":"0 11 * * *"}],"workflow_dispatch":null}`

- [ ] **Step 5: Re-run the guard — expect PASS:**

```
npx vitest run tests/config-guards.test.ts -t "refresh-camera-data workflow"
```

Expected: `✓ has a LIVE daily schedule nested under on:` plus the other three.

- [ ] **Step 6: Commit**

```
git add .github/workflows/refresh-camera-data.yml tests/config-guards.test.ts
git commit -m "ci(camera): restore the daily refresh schedule (Overpass serves CI egress)

Nests schedule: under on: (the preserved comment block sat above on: and would
not parse if un-commented in place) and truths-up the header/step comments.
Tightens the config guard so a commented-out cron can no longer satisfy it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: Map declustering in `src/scripts/map/layers/cameras.ts`

**Files:**
- Modify: `src/scripts/map/layers/cameras.ts`
- Test: `src/scripts/map/layers/cameras.test.ts` (add a guard block; existing `parseDirection` / `wikimediaThumbnailUrl` / `createConeImage` tests are untouched and must keep passing)

Layer/paint behavior cannot be exercised in vitest's node environment (no WebGL, no DOM), so the unit guard is (a) the exported `CAMERA_LAYER_IDS` contract and (b) source-text assertions in the repo's existing config-guard style; the rendering itself is verified in the browser preview (Step 7).

- [ ] **Step 1: Add the guard block** to the end of `src/scripts/map/layers/cameras.test.ts`, and extend the import line at the top:

```ts
import { readFileSync } from 'node:fs';
import { CAMERA_LAYER_IDS, parseDirection, wikimediaThumbnailUrl, createConeImage } from './cameras.js';
```

```ts
describe('declustered camera layers (design 2026-09-17 §3)', () => {
  const source = readFileSync(new URL('./cameras.ts', import.meta.url), 'utf8');

  it('registers exactly the dot and cone layers, dots first', () => {
    expect(CAMERA_LAYER_IDS).toEqual(['camera-dots', 'camera-cones']);
  });

  it('does not cluster the source', () => {
    expect(source).toContain('cluster: false');
    expect(source).not.toContain('clusterMaxZoom');
    expect(source).not.toContain('clusterRadius');
    expect(source).not.toContain('getClusterExpansionZoom');
    expect(source).not.toContain("'cluster-glow'");
    expect(source).not.toContain("'cluster-count'");
  });

  it('puts a dot under EVERY camera (no hasDirection / point_count filter on camera-dots)', () => {
    // The dots layer definition must not carry a filter at all.
    const dots = source.slice(source.indexOf("id: 'camera-dots'"), source.indexOf("id: 'camera-cones'"));
    expect(dots).not.toContain('filter:');
    expect(dots).toContain("'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 4, 14, 6]");
  });

  it('fades cones in across the old clusterMaxZoom boundary (9 -> 10)', () => {
    expect(source).toContain("'icon-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1]");
  });

  it('binds click/hover to camera-dots only — cones are decorative (one popup per directional camera)', () => {
    expect(source).toMatch(/map\.on\(\s*'click',\s*'camera-dots'/);
    expect(source).toMatch(/map\.on\(\s*'mouseenter',\s*'camera-dots'/);
    expect(source).not.toMatch(/map\.on\(\s*'(click|mouseenter|mouseleave)',\s*'camera-cones'/);
    expect(source).not.toMatch(/map\.on\(\s*'(click|mouseenter|mouseleave)',\s*'clusters'/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`CAMERA_LAYER_IDS` is not exported yet, and the source still clusters):

```
npx vitest run src/scripts/map/layers/cameras.test.ts
```

Expected: the 29 existing tests stay green and all 5 new tests FAIL — `registers exactly the dot and cone layers` with `AssertionError: expected undefined to deeply equal [ 'camera-dots', 'camera-cones' ]` (vitest resolves the missing export to `undefined`), and the four source-text tests on their `toContain` / `toMatch` assertions against the still-clustered source.

- [ ] **Step 3: Rework the layers section of `src/scripts/map/layers/cameras.ts`.** Update the file header (line 6) from `cluster / dot / cone layers` to `dot / cone layers`, then replace everything from `// --- Layers ---` to the end of the file with:

```ts
// --- Layers ---

/** Add/teardown order. Exported so the declustering guard test can assert the contract. */
export const CAMERA_LAYER_IDS = ['camera-dots', 'camera-cones'];

/** Per-map event teardown, so removeCameraLayers can unbind what it bound. */
const cameraTeardowns = new WeakMap<maplibregl.Map, () => void>();

export function addCameraLayers(map: maplibregl.Map, geojson: GeoJSON.FeatureCollection): void {
  // Popups read this lazily on click, so there is no need to block setup on it.
  void loadVendorImages();

  // Unclustered (design 2026-09-17 §3). MapSection clips the fed set to
  // SC_BOUNDS before setData, so this source only ever holds the ~6,500
  // SC-area cameras, which draw individually without clustering.
  map.addSource('cameras', {
    type: 'geojson',
    data: geojson,
    cluster: false,
  });

  // A dot under EVERY camera — directional ones included — so a camera whose
  // cone fades on zoom-out is still visible as a dot, never nothing. Radius
  // scales with zoom (starting point; tune live). This is the SOLE interactive
  // layer: every camera is clicked/hovered through its dot at every zoom.
  map.addLayer({
    id: 'camera-dots',
    type: 'circle',
    source: 'cameras',
    paint: {
      'circle-color': '#ef4444',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 4, 14, 6],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#991b1b',
    },
  });

  // Directional cone icon
  map.addImage('cone', createConeImage());

  // Decorative overlay for directional cameras: fades in across zoom 9 -> 10,
  // the old clusterMaxZoom boundary where individual features used to appear.
  // NO click/hover handlers here — a zero-opacity symbol is still
  // hit-queryable in MapLibre, and every directional camera also has a dot, so
  // binding both layers would open two popups (and fire analytics twice).
  map.addLayer({
    id: 'camera-cones',
    type: 'symbol',
    source: 'cameras',
    filter: ['get', 'hasDirection'],
    layout: {
      'icon-image': 'cone',
      'icon-size': 1.0,
      'icon-rotate': ['get', 'direction'],
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
    },
    paint: {
      'icon-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1],
    },
  });

  bindCameraEvents(map);
}

export function removeCameraLayers(map: maplibregl.Map): void {
  cameraTeardowns.get(map)?.();
  cameraTeardowns.delete(map);

  for (const id of CAMERA_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.hasImage('cone')) map.removeImage('cone');
  if (map.getSource('cameras')) map.removeSource('cameras');
}

// --- Map event handlers ---

function bindCameraEvents(map: maplibregl.Map): void {
  // Camera dot click -> popup (dots are the one interaction owner per camera)
  const onCameraClick = (e: maplibregl.MapLayerMouseEvent) => showCameraPopup(map, e);

  // Pointer cursor on interactive features
  const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const onLeave = () => { map.getCanvas().style.cursor = ''; };

  map.on('click', 'camera-dots', onCameraClick);
  map.on('mouseenter', 'camera-dots', onEnter);
  map.on('mouseleave', 'camera-dots', onLeave);

  cameraTeardowns.set(map, () => {
    map.off('click', 'camera-dots', onCameraClick);
    map.off('mouseenter', 'camera-dots', onEnter);
    map.off('mouseleave', 'camera-dots', onLeave);
  });
}
```

- [ ] **Step 4: Run the camera tests — expect PASS (existing 29 + 5 new):**

```
npx vitest run src/scripts/map/layers/cameras.test.ts
```

Expected: `✓ src/scripts/map/layers/cameras.test.ts (34 tests)`.

- [ ] **Step 5: Type-check via the site build** (also what `tests/config-guards.test.ts` does in `beforeAll`; an invalid MapLibre paint/filter expression type surfaces here):

```
node node_modules/astro/astro.js build
```

Expected: `[build] Complete!` with no `[ERROR]` lines. (Use `astro.js` directly rather than `npm run build` so the network-hitting prebuild sync is skipped.)

- [ ] **Step 6: Commit**

```
git add src/scripts/map/layers/cameras.ts src/scripts/map/layers/cameras.test.ts
git commit -m "feat(map): decluster camera dots; zoom-scaled dots, zoom-faded cones

Drops the cluster source options and the cluster-glow / clusters /
cluster-count layers plus their click/hover handlers. camera-dots now covers
every camera (no hasDirection filter) with a zoom-interpolated radius and is
the sole interactive layer; camera-cones keeps the hasDirection filter, gains
an icon-opacity fade across zoom 9->10 (the old clusterMaxZoom), and has no
handlers so a directional camera opens exactly one popup.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Browser verification** (after Task 6 lands the SC clip — do both together; see Task 6 Step 4).

---

## Task 6: SC-bbox render clip in `src/components/MapSection.astro`

**Files:**
- Modify: `src/components/MapSection.astro` (the `<script>` block, `onUpdate` around L283-288)
- Test: no unit surface (Astro client script); compile-verified by the `astro build` in `tests/config-guards.test.ts`, behavior-verified in the browser.

Why: the live tile loader accumulates tiles without eviction, so a working proxy or partial live load can feed the whole ~64k-record regional tile into the now-unclustered source. Clipping in `onUpdate` makes the SC snapshot the effective authority for what renders, regardless of source.

- [ ] **Step 1: Add the import** inside the `<script>` block, after `import { observeCountUps } from '../scripts/count-up.js';`:

```ts
  import { inScBounds } from '../lib/sc-camera-count.js';
```

(`sc-camera-count.ts` imports only `./geo-utils.js`, which already ships client-side via the action modal, so this is browser-safe. `DeflockCamera` — `{ id: number; lat; lon; tags? }` — is structurally a `Camera`.)

- [ ] **Step 2: Clip in `onUpdate`.** Replace:

```ts
      const loader = createTileLoader({
        onUpdate(cameras) {
          const source = handle.map.getSource('cameras') as GeoJSONSource | undefined;
          source?.setData(toGeoJSON(cameras));
        },
      });
```

with:

```ts
      const loader = createTileLoader({
        onUpdate(cameras) {
          // Bound the rendered set to SC (design 2026-09-17 §3). The loader
          // accumulates every tile it has ever loaded, so without this clip a
          // working proxy could feed the whole ~64k-record regional tile into
          // the unclustered source. Clipping here keeps the source SC-bounded
          // whichever source (live tiles or the committed snapshot) supplied
          // the records.
          const source = handle.map.getSource('cameras') as GeoJSONSource | undefined;
          source?.setData(toGeoJSON(cameras.filter(inScBounds)));
        },
      });
```

- [ ] **Step 3: Compile check:**

```
node node_modules/astro/astro.js build
```

Expected: `[build] Complete!`, no errors.

- [ ] **Step 4: Browser verification (Tasks 5 + 6 together).** Start the dev server through the Browser pane (`preview_start`; add a `.claude/launch.json` entry `{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":4321}` if absent), open `http://localhost:4321/#camera-map`, and check each item:

  - [ ] No cluster bubbles or counts at ANY zoom (zoom out to ~z5 statewide, in to z14 downtown Greenville).
  - [ ] Dots are small (~2 px) at z4-5, ~4 px at z10, ~6 px at z14 (radius interpolation).
  - [ ] Cones invisible at ≤z9, fully visible at ≥z10; a directional camera remains a dot when zoomed out.
  - [ ] Clicking a directional camera at z12 opens exactly ONE popup (count popups in the DOM: `document.querySelectorAll('.maplibregl-popup').length === 1` via `javascript_tool`).
  - [ ] Popup still shows vendor/operator/direction and the "VIEW ON OSM" link opens `openstreetmap.org/node/<id>`.
  - [ ] Pan east to Charleston / Mount Pleasant / Myrtle Beach: cameras east of -80° now appear (the undercount region).
  - [ ] Pan north to Charlotte NC (lat ~35.2, lon ~-80.8; inside SC_BOUNDS) — dots appear; pan to Atlanta (lon ~-84.4; outside SC_BOUNDS) — no dots even though a live tile may have loaded. Confirms the clip.
  - [ ] Rendered feature count is bounded: `map.querySourceFeatures('cameras').length` is a few thousand, never ~64k. (Expose `handle.map` on `window` temporarily only if needed; do not commit that.)
  - [ ] Homepage figures: Hero "more than 2,000", ImpactBand + MapSection statline show the regenerated `scTotal` (~2,084).
  - [ ] Mobile preset (`resize_window` mobile): tap-to-load still reveals the map and dots render.

- [ ] **Step 5: Commit**

```
git add src/components/MapSection.astro
git commit -m "feat(map): clip the fed camera set to SC_BOUNDS before setData

The unclustered source must stay SC-bounded however many live tiles the loader
has accumulated, so onUpdate filters through inScBounds (shared with the count
module) before toGeoJSON.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: Provenance / copy truth-up

**Files:**
- Modify: `src/components/MapSection.astro` (attribution block, L66-74) — mechanical label string
- Modify: `src/content/blog/building-deflocksc.md` (~L55) — **via `copydesk:write`**
- Modify: `src/content/blog/how-to-fight-alpr-surveillance-sc.md` (L20, L107) — **via `copydesk:write`**
- Test: `tests/config-guards.test.ts` (add a provenance-copy guard)

> **Execution note:** the two blog edits are reader-facing prose and MUST be produced through the `copydesk:write` skill at implementation time (per the design and the global voice rule). The "target facts" and "draft" below are the brief handed to copydesk, not final copy. The MapSection attribution string and the guard test are mechanical and need no copydesk pass.

- [ ] **Step 1: Add the guard** to `tests/config-guards.test.ts` (append after the workflow block):

```ts
describe('camera provenance copy (design 2026-09-17 §2)', () => {
  const mapSection = read('src/components/MapSection.astro');
  const building = read('src/content/blog/building-deflocksc.md');
  const howTo = read('src/content/blog/how-to-fight-alpr-surveillance-sc.md');

  it('credits OpenStreetMap contributors for the camera DATA (distinct from the basemap-tile credit)', () => {
    expect(mapSection).toMatch(
      /Camera locations[^<]*<a href="https:\/\/www\.openstreetmap\.org\/copyright"/,
    );
    expect(mapSection).not.toContain('Camera data from <a href="https://deflock.org"');
  });

  it('drops the stale refresh-cadence claims (the refresh is daily)', () => {
    expect(building).not.toContain('A weekly script');
    expect(howTo).not.toContain('updates hourly');
    expect(howTo).not.toContain('updated hourly');
  });

  it('no longer describes cluster bubbles (clustering was removed)', () => {
    expect(howTo).not.toContain('clusters are dense deployments');
  });
});
```

- [ ] **Step 2: Run — expect all three to FAIL against the current copy:**

```
npx vitest run tests/config-guards.test.ts -t "camera provenance copy"
```

Expected: `× credits OpenStreetMap contributors…`, `× drops the stale refresh-cadence claims…`, `× no longer describes cluster bubbles…`.

- [ ] **Step 3: Replace the camera-data credit in `src/components/MapSection.astro`.** The tile credit line (L68-70) stays as-is. Replace L71-73:

```html
      <p class="text-[#9a9a9a] text-xs mt-1">
        Camera data from <a href="https://deflock.org" target="_blank" rel="noopener" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">Deflock.org</a>, a community-sourced map of Flock Safety camera locations. Help keep it updated by reporting cameras you find.
      </p>
```

with:

```html
      <p class="text-[#9a9a9a] text-xs mt-1">
        Camera locations &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">OpenStreetMap contributors</a> (ODbL), the same crowdsourced dataset <a href="https://deflock.org" target="_blank" rel="noopener" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">DeFlock</a> maps, refreshed daily. Help keep it current by reporting cameras you find.
      </p>
```

- [ ] **Step 4: Blog edits through `copydesk:write`.** Invoke the skill, then hand it this brief. Constraints copydesk must preserve: same paragraph position, same links kept (`/#camera-map`, `https://deflock.org`), matter-of-fact register matching the surrounding paragraphs, and the three guard strings above must not survive.

  **`src/content/blog/building-deflocksc.md` L55** — current: `We started with Mapbox for the camera map, but that came with API keys and usage limits. We switched to OpenFreeMap, which is free and open. Camera locations come from Deflock.org, which already tracks ALPR cameras nationwide. A weekly script grabs the latest data so the map stays current.`
  Target facts: the basemap is OpenFreeMap; camera locations come from OpenStreetMap, the open dataset DeFlock's volunteers map cameras into; a daily job pulls the latest OSM data so the map and the statewide count stay current. Starting draft for copydesk: `We started with Mapbox for the camera map, but that came with API keys and usage limits. We switched to OpenFreeMap, which is free and open. Camera locations come from OpenStreetMap, the open dataset the Deflock.org community maps cameras into. A daily job pulls the latest data so the map and the statewide count stay current.`

  **`src/content/blog/how-to-fight-alpr-surveillance-sc.md` L20** — current: `The [camera map](/#camera-map) on this site shows every known ALPR camera in South Carolina, sourced from [Deflock.org](https://deflock.org), a community-reported database that updates hourly. Individual dots are single cameras; clusters are dense deployments. Zoom in on your neighborhood and see what's there.`
  Target facts: the map shows every known ALPR camera in SC; data comes from OpenStreetMap, the same community-reported dataset DeFlock builds on; refreshed daily; every dot is one camera (no clusters); keep the "zoom in on your neighborhood" call. Starting draft: `The [camera map](/#camera-map) on this site shows every known ALPR camera in South Carolina, drawn from OpenStreetMap, the same community-reported dataset [Deflock.org](https://deflock.org) builds on, and refreshed daily. Every dot is one camera. Zoom in on your neighborhood and see what's there.`

  **`how-to-fight-alpr-surveillance-sc.md` L107** (FAQ) — current: `Yes. The [camera map](/#camera-map) shows every known ALPR camera in South Carolina, sourced from Deflock.org. It's community-reported and updated hourly.`
  Target facts: same provenance; daily. Starting draft: `Yes. The [camera map](/#camera-map) shows every known ALPR camera in South Carolina, drawn from OpenStreetMap, the community-reported dataset Deflock.org builds on. It's refreshed daily.`

  Note for the writer: the visible SC total elsewhere in that post ("more than 1,000 cameras statewide", L22) is a separately sourced historical figure and is NOT in this task's scope; leave it unless copydesk flags it as reading wrong next to the map's ~2,084.

- [ ] **Step 5: Run the guard — expect PASS:**

```
npx vitest run tests/config-guards.test.ts -t "camera provenance copy"
```

Expected: three `✓`.

- [ ] **Step 6: Visual check** in the browser preview: the attribution renders under the map with two working links; each blog post renders the new paragraph (`/blog/building-deflocksc`, `/blog/how-to-fight-alpr-surveillance-sc`).

- [ ] **Step 7: Commit**

```
git add src/components/MapSection.astro src/content/blog/building-deflocksc.md src/content/blog/how-to-fight-alpr-surveillance-sc.md tests/config-guards.test.ts
git commit -m "docs(copy): credit OpenStreetMap for camera data; daily cadence; no clusters

Adds an ODbL data credit under the map (distinct from the basemap-tile
credit) and truths-up the two blog posts: weekly/hourly -> daily, DeFlock
framing reconciled with the OSM source, and the clusters sentence removed
now that clustering is gone. Guarded in config-guards.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Finishing the branch (before PR)

- [ ] Full suite green: `npm test` → all files pass (expect roughly: previous ~890 + 30 overpass unit + 9 net-new exec + 5 camera guard + 4 net-new copy/workflow guard).
- [ ] **Rewrite `MANIFEST.md` from scratch to budget** (repo rule; owned repo). Lines that must change: `src/lib/` entry gains `overpass.ts` (Overpass envelope/freshness/regression rules); `map/layers/cameras.ts` description `popups/clusters` → `popups, unclustered dots + zoom-faded cones`; `scripts/` line 82 `validating CDN fetch` → `validating Overpass fetch (envelope + freshness + like-scope regression + all-or-nothing gate; 3 mirrors)`; line 83 (`refresh-camera-data.local.ps1`) noted as *pending retirement after first successful CI run*; Key Relationships line 104 rewritten: MapSection clips to SC_BOUNDS, `declustering at zoom 13` removed, refresh path is `refresh-camera-data.yml (daily cron) → fetch-camera-data.ts (Overpass)`.
- [ ] Run `cross-model-review:codex-impl-review` against this plan (repo uses the cross-model-review plugin).
- [ ] Open the PR: `gh pr create --base master --title "Overpass camera-data migration + map declustering (fixes #125)"`, body summarizing the four pipeline tasks + three map/copy tasks, the regenerated snapshot (1,700 → ~2,084), and the Task 8 rollout gate. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Verify on the Netlify deploy preview: homepage shows the new count; map has no clusters; `/blog/*` copy updated. Merge with `gh pr merge --merge` (never squash in this repo). Production still needs a manual Netlify deploy.
- [ ] Post-merge: delete the branch (local + remote).

---

## Task 8: Local-task retirement (post-merge rollout step — NOT part of this PR)

**Gate:** proceed only after the restored `Refresh Camera Data` workflow has completed **at least one successful Overpass refresh on `master`** (Actions tab → green run with either a `chore: refresh camera data + impact stats` commit or the "No meaningful data changes" log line). Trigger one manually via `workflow_dispatch` right after merge rather than waiting for 06:00 ET. Until then the Windows Scheduled Task keeps running as the rollback path; both paths are idempotent and commit-if-changed, so briefly running both is safe.

**Files (on `master`, after the gate):**
- Delete: `scripts/refresh-camera-data.local.ps1`
- Modify: `.github/workflows/refresh-camera-data.yml` (header comment: drop the stopgap sentence)
- Modify: `MANIFEST.md` (remove the `refresh-camera-data.local.ps1` line and its Key Relationships mention)
- Memory: `reference_camera_counter.md` + `MEMORY.md` Active Work entry for this migration

- [ ] Confirm the gate: `gh run list --workflow "Refresh Camera Data" --branch master --limit 3` shows a `completed success` run dated after the merge.
- [ ] Confirm the task exists, then unregister it (PowerShell, elevated if it was registered elevated):

```powershell
Get-ScheduledTask -TaskName 'DeflockSC-RefreshCameraData' | Select-Object TaskName, State
Unregister-ScheduledTask -TaskName 'DeflockSC-RefreshCameraData' -Confirm:$false
Get-ScheduledTask -TaskName 'DeflockSC-RefreshCameraData' -ErrorAction SilentlyContinue   # expect no output
```

- [ ] On a fresh `master` checkout: `git rm scripts/refresh-camera-data.local.ps1`; edit the workflow header comment to read `Daily refresh of public/camera-data.json from OpenStreetMap via the Overpass API (docs/plans/2026-09-17-overpass-camera-migration-design.md). Overpass serves datacenter egress, so this runs in CI; the earlier DeFlock CDN source 403'd GitHub runners.`; remove the `.ps1` line + mention from `MANIFEST.md`.
- [ ] `npm test` (the workflow guard does not reference the `.ps1`, so nothing else moves).
- [ ] Commit + push directly (small, code-only, post-merge cleanup):

```
git add -A scripts/refresh-camera-data.local.ps1 .github/workflows/refresh-camera-data.yml MANIFEST.md
git commit -m "chore(camera): retire the local Scheduled Task refresh (CI Overpass refresh proven)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

- [ ] Update memory: `reference_camera_counter.md` (source is Overpass/OSM, daily CI cron, no local task, `ALLOW_CAMERA_DROP=1` override) and the `MEMORY.md` Active Work entry (mark shipped; note the ~2,084 figure and that production needs a manual Netlify deploy).
- [ ] Optional cleanup: the log at `%LOCALAPPDATA%\DeflockSC\refresh-camera-data.log` can be deleted.
