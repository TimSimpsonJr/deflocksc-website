# Surveillance Timeline Map Implementation Plan

> **For agentic workers:** Execute this plan with **superpowers:subagent-driven-development**
> (dispatch each checkpoint's tasks to implementer subagents in the current session)
> or **superpowers:executing-plans** (separate session with review checkpoints). Work
> top to bottom. Each `- [ ]` is one atomic step; check it off (`- [x]`) only after its
> command/verification passes. Do not batch checkpoints — Checkpoint 1 is a **gate**
> (see below) and everything after it assumes the gate passed. TDD steps give the
> failing test first; run it, see it fail, implement, run it, see it pass, then commit.
> Rendering/visual steps that cannot be honestly unit-tested carry explicit
> browser-verification criteria instead of fake tests.

## Goal

Ship a blog-embedded, animated MapLibre map whose red glowing dots — one per ALPR camera, keyed to each camera's OpenStreetMap first-seen month — bloom in over time as a guided intro runs the timeline from ≈2020 to today and flies from the national view into South Carolina, then unlocks free exploration.

## Architecture

A dependency-light Node build script bakes a compact, dated national camera table (`public/timeline-cameras.json`) from the local Deflock camera snapshot plus OSM element-history dates; the site renders it through a **new unclustered MapLibre layer module** (its own GeoJSON source, `m ≤ cutoff` filter, zoom-scaled glow/dot layers, high-zoom cone resolve) driven by a controller that owns the scrubber, DaisyUI chrome, and the visibility-triggered guided intro. The map is embedded in one dedicated blog post via the existing marker-div + gated-lazy-island precedent (no MDX), reusing `createMap` (`cooperativeGestures: true`) and `createConeImage`/`parseDirection` so the maplibre chunk is shared with the homepage map.

## Tech Stack

- **Astro 5** (`.astro` island, blog pipeline), **TypeScript** (client modules), **plain ESM `.mjs`** (build script, dependency-free like `fetch-camera-data.mjs`).
- **MapLibre GL 5.x** (`maplibre-gl`) — reused via `src/scripts/map/core.ts`.
- **DaisyUI 5 `deflock` theme** + **Tailwind 4** for all chrome.
- **Vitest 4** (`npm test` → `vitest run`) for pure-logic TDD; **`npm run dev`** (`astro dev`, port 4321) for browser verification.
- **HeiGIT ohsome API** (network, no local binary) for OSM first-seen dates, with a graceful reuse-last-committed-table fallback.

---

## Plan-level decisions (resolving the spec's open questions)

These resolve the design doc's "Open questions." The user may override any of them; each carries a one-line rationale.

1. **OSM extraction method → HeiGIT ohsome API** (`/elementsFullHistory/centroid`), region-batched, taking the earliest `@validFrom` per OSM node id. *Rationale: `osmium` is confirmed absent on this machine and needs a multi-GB full-history extract; ohsome is purpose-built for element history, needs no local binary, and fits the "dependency-light `.mjs`" directive.* **Documented fallback:** if ohsome is unreachable/errors or resolves zero dates, reuse the last committed `public/timeline-cameras.json` and exit 0 so the site build never breaks (`chooseOutput`). *Upgrade path noted: an `osmium` full-history extract in CI is the deterministic alternative later; output format is identical.*
2. **Dataset encoding → columnar parallel arrays** `{ v, lon[], lat[], m[], dir[] }`, coordinates rounded to **5 decimals** (~1.1 m), `m` as a **YYYYMM integer floored to 202001**, arrays index-aligned; `dir` is `null` where unknown; the OSM `id` is **omitted** from the shipped file (dots need lon/lat/m, cones need `dir`; no popup/OSM-link is in the timeline spec). *Rationale: columnar gzips best and deserializes cheaply; dropping `id` shrinks the file. `id` can be re-added if a popup is ever wanted. Flooring `m` to 202001 (bucketing pre-2020 cameras into Jan 2020) is how the UI honors the spec's ~Jan-2020 timeline start: the scrubber/intro derive their first stop from the data, so a data-level floor keeps them at 202001 with no sparse pre-2020 tail, and no separate UI clamp is needed.*
3. **SC subset → single national table, client-side filter** (no `timeline-cameras-sc.json`). *Rationale: 62k rows in columnar form gzip well under budget and the file is lazy-loaded on scroll, so a second artifact adds build/refresh/commit surface for marginal first-paint gain; SC framing is a camera-move + filter over the one table, exactly as the spec frames it.*
4. **Blog-embedding gate → body check** `post.body.includes('data-timeline-map')` in `[...slug].astro`; **no** `content.config.ts` schema change. *Rationale: surgical, zero schema surface, mirrors the existing `post.body` read for read-time.*
5. **Host-post subject → out of scope**; ship a `draft: true` scaffold post carrying the marker div + honest-methodology paragraph with placeholder editorial copy. *Rationale: the plan ships the mechanism; the editorial subject is the author's call, and `draft: true` keeps an unfinished post out of the build/sitemap. Browser verification temporarily flips it to `draft: false` locally, then reverts.*
6. **Intro pacing (durations/easing) → linger 3.0 s on the 2020 opening, ease-in-out-cubic advance over ~15 s, begin the national→SC `flyTo` (5 s) when the cutoff crosses `present − 18 months`, then a ~2 s held final frame** (counter rolls up, methodology line fades in). Total ≈ 22 s (< 25 s). *Rationale: matches the spec's shape (linger → accelerate → fly-through as SC fills → hold); every number is a named constant tunable after Checkpoint 1.*

---

## File structure

Every file to create or modify, mapped to its single responsibility (mirrors the spec's Components & files table).

| File | New/Mod | Single responsibility |
|---|---|---|
| `scripts/build-timeline-data.mjs` | **New** | Build step + exported pure helpers (`monthInt`, `roundCoord`, `parseDirectionTag`, `sortForDeterminism`, `encodeTable`, `decodeTable`, `chooseOutput`, `serializeTable`). Reads `public/camera-data.json`, resolves OSM first-seen months via ohsome, emits the compact columnar dated table. Guarded `main()` so the test can import helpers without running the fetch. Peer to `fetch-camera-data.mjs`. |
| `scripts/build-timeline-data.test.mjs` | **New** | Vitest unit tests for the exported pure helpers: month encoding, determinism, round-trip, fallback selection, `parseDirection` parity. |
| `public/timeline-cameras.json` | **New (generated)** | The baked columnar dated dataset: `{ v, lon[], lat[], m[], dir[] }` (national; SC is a client-side filter). |
| `public/timeline-map-style.json` | **New (generated once)** | Dedicated basemap style derived from `map-style.json`: roads on; road-name + water labels off; city labels gated to high zoom and muted; state/country/other place labels off. |
| `src/lib/timeline-format.ts` | **New** | Pure client helpers: `cutoffFilter(m)` (MapLibre filter expr), `monthIndex(m)` (YYYYMM -> linear month index), `flareColor(cutoff)` (hot-flare-then-cool paint expr, keyed on the linear index), `formatOsd(m, count)` (`"Mar 2024 · 41,208 documented"`), `introCutoffAt(elapsedMs, months, opts)` (non-uniform easing). |
| `src/lib/timeline-format.test.ts` | **New** | Vitest unit tests for the pure client helpers (including `monthIndex`/`flareColor` year-boundary coverage). |
| `src/scripts/map/layers/timeline-cameras.ts` | **New** | Unclustered dated layer module: own GeoJSON source (no clustering) + glow/dot layers (zoom-scaled radius, mobile radius floor, hot-flare-then-cool paint) + high-zoom cone layer (full-intensity center) reusing `createConeImage`; imperative `setCutoff`/`fitTo` API. |
| `src/scripts/map/timeline-controller.ts` | **New** | Orchestration: scrubber state, play/pause timer, guided intro (cutoff + camera moves + held frame), reduced-motion branch, replay, DaisyUI chrome wiring, the two IntersectionObservers. |
| `src/components/TimelineMap.astro` | **New** | The blog island: DaisyUI-branded chrome markup (`join`/`btn`/`range`/`badge`/OSD) + load-ahead IntersectionObserver lazy-import + dataset fetch. Renders where `[data-timeline-map]` exists. |
| `src/content/blog/surveillance-timeline-map.md` | **New (draft scaffold)** | The host post: `draft: true` scaffold carrying narrative placeholder + honest-methodology paragraph + the `data-timeline-map` marker div. |
| `src/pages/blog/[...slug].astro` | **Mod** | Conditionally include the timeline island when `post.body.includes('data-timeline-map')`. |
| `src/styles/global.css` | **Mod** | Small timeline-only chrome tweaks not covered by DaisyUI + `.map-dark` (camera-OSD monospace/tabular readout, intro/live state classes). |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Add the timeline-data build step; include `public/timeline-cameras.json` in the commit-if-changed set. **See Coordination note.** |
| `astro.config.mjs` | **No change** | es2022 target already set; dataset is a static `public/` asset (no proxy). |
| `src/pages/timeline-check.astro` | **Temp (not committed)** | Throwaway Checkpoint-1 placement-gate render; deleted before the checkpoint-1 commit. |
| `scripts/_gen-timeline-style.mjs` | **Temp (not committed)** | Throwaway one-shot style generator; run once, commit its JSON output, then delete. |

---

## Coordination note (READ BEFORE Checkpoint 1's workflow task and before opening the PR)

This work is isolated in the **`dc-timeline-map`** worktree on **`feature/surveillance-timeline-map`**. A **parallel session** in **`dc-live-counter`** on **`feature/live-camera-counter`** has **already rewritten the shared pipeline** on that branch (verified against the common base `6406745`):

- `.github/workflows/refresh-camera-data.yml`: cron **weekly → daily** (`0 11 * * *`); Node **20 → 22** with `cache: 'npm'`; **adds `npm ci` + `npm run prebuild`**; replaces `node scripts/fetch-camera-data.mjs` / `build-impact-stats.mjs` with `npm run fetch-camera-data` / `npm run build-impact-stats`.
- `scripts/fetch-camera-data.mjs` → **`.ts`**, `scripts/build-impact-stats.mjs` → **`.ts`** (esbuild-bundled, importing a new `src/lib/sc-camera-count.ts`), plus new npm scripts.

**Consequence:** this plan writes its workflow edit against the **current base** workflow (still `.mjs`, weekly, Node 20). If `feature/live-camera-counter` lands **first**, the timeline branch **must rebase onto it** and re-express the timeline build step in the **new idiom** (a `npm run build-timeline-data` npm script after `npm run prebuild`, Node 22), not the raw `node scripts/…` line — otherwise the workflow edit conflicts hard.

**Recommendation:** land one branch's pipeline change first, then rebase the other. If the counter lands first, convert `scripts/build-timeline-data.mjs` invocation to a bundled npm script matching that branch's pattern (the pure-helper module and dataset are unaffected). **Flag the workflow + `public/` artifact changes prominently in this branch's PR description** so the other session can rebase cleanly. The timeline build seeds from `public/camera-data.json` (shared) but writes only `public/timeline-cameras.json` (new, no overlap with the counter's `camera-counts.json`/`impact-stats.json`).

---

## Checkpoint 1 — Build the REAL dated dataset and validate placement (GATE)

**This checkpoint is a gate.** It builds `public/timeline-cameras.json` from real OSM first-seen dates and proves the placement matches truth (dots trace road corridors between cities; SC is Upstate-heavy; no geocoding artifacts). **Every later checkpoint assumes this gate passed.** Visual-tuning parameters (dot radius, glow strength, flare timing, easing) may be adjusted based on what the real data looks like here, but the **architecture does not change**. If the real data does not tell the story, stop and revisit data/placement before building the render layer.

### 1a. TDD the pure build helpers

- [ ] Create `scripts/build-timeline-data.test.mjs` with the failing tests below (imports don't exist yet, so it fails to import):

```js
import { describe, it, expect } from 'vitest';
import {
  monthInt,
  roundCoord,
  parseDirectionTag,
  sortForDeterminism,
  encodeTable,
  decodeTable,
  chooseOutput,
  serializeTable,
} from './build-timeline-data.mjs';

describe('monthInt', () => {
  it('encodes an ISO timestamp as a YYYYMM integer', () => {
    expect(monthInt('2024-03-15T09:12:00Z')).toBe(202403);
  });
  it('uses UTC month boundaries', () => {
    expect(monthInt('2020-01-01T00:00:00Z')).toBe(202001);
    expect(monthInt('2020-12-31T23:59:59Z')).toBe(202012);
  });
  it('throws on an unparseable date', () => {
    expect(() => monthInt('not-a-date')).toThrow();
  });
});

describe('roundCoord', () => {
  it('rounds to 5 decimals', () => {
    expect(roundCoord(-82.3912345)).toBe(-82.39123);
    expect(roundCoord(34.8500049)).toBe(34.85);
  });
});

// Parity with parseDirection in src/scripts/map/layers/cameras.ts
// (same cases as cameras.test.ts — mirror any change there here).
describe('parseDirectionTag', () => {
  it('returns null with no direction', () => {
    expect(parseDirectionTag({ manufacturer: 'Flock Safety' })).toBe(null);
    expect(parseDirectionTag(undefined)).toBe(null);
  });
  it('parses numeric degrees, ranges, cardinals, and lists', () => {
    expect(parseDirectionTag({ direction: '90' })).toBe(90);
    expect(parseDirectionTag({ direction: '138-183' })).toBe(160.5);
    expect(parseDirectionTag({ direction: 'nw' })).toBe(315);
    expect(parseDirectionTag({ direction: '90;270' })).toBe(90);
    expect(parseDirectionTag({ 'camera:direction': '45' })).toBe(45);
  });
});

describe('sortForDeterminism + encodeTable', () => {
  const rows = [
    { lon: -82.4, lat: 34.85, m: 202105, dir: 90 },
    { lon: -80.0, lat: 33.0, m: 202001, dir: null },
    { lon: -82.4, lat: 34.84, m: 202105, dir: null },
  ];
  it('orders by month, then lon, then lat', () => {
    const s = sortForDeterminism(rows);
    expect(s.map((r) => r.m)).toEqual([202001, 202105, 202105]);
    expect(s.slice(1).map((r) => r.lat)).toEqual([34.84, 34.85]);
  });
  it('is byte-identical regardless of input order', () => {
    const a = serializeTable(encodeTable(rows));
    const b = serializeTable(encodeTable([...rows].reverse()));
    expect(a).toBe(b);
  });
  it('produces index-aligned columnar arrays', () => {
    const t = encodeTable(rows);
    expect(t.v).toBe(1);
    expect(t.lon.length).toBe(3);
    expect(t.m.length).toBe(t.lon.length);
    expect(t.dir.length).toBe(t.lon.length);
  });
});

describe('decodeTable round-trips encodeTable', () => {
  it('recovers the normalized (rounded, sorted) rows', () => {
    const rows = [
      { lon: -82.391234, lat: 34.850004, m: 202403, dir: 160.5 },
      { lon: -80.12345, lat: 33.5, m: 202001, dir: null },
    ];
    const back = decodeTable(encodeTable(rows));
    expect(back).toEqual([
      { lon: -80.12345, lat: 33.5, m: 202001, dir: null },
      { lon: -82.39123, lat: 34.85, m: 202403, dir: 160.5 },
    ]);
  });
});

describe('chooseOutput (graceful fallback)', () => {
  const committed = { v: 1, lon: [-80], lat: [33], m: [202001], dir: [null] };
  it('reuses the committed table when the fresh build is empty', () => {
    expect(chooseOutput({ v: 1, lon: [], lat: [], m: [], dir: [] }, committed))
      .toEqual({ table: committed, reused: true });
    expect(chooseOutput(null, committed)).toEqual({ table: committed, reused: true });
  });
  it('uses the fresh table when it has rows', () => {
    const fresh = { v: 1, lon: [-81], lat: [34], m: [202105], dir: [90] };
    expect(chooseOutput(fresh, committed)).toEqual({ table: fresh, reused: false });
  });
  it('throws when neither fresh nor committed has rows', () => {
    expect(() => chooseOutput(null, null)).toThrow();
  });
});
```

- [ ] Run the test and confirm it **FAILS** (module has no exports yet):

```
npx vitest run scripts/build-timeline-data.test.mjs
```
Expected: `FAIL scripts/build-timeline-data.test.mjs` — an import/resolution error such as *"does not provide an export named 'monthInt'"* or *"Failed to load … build-timeline-data.mjs"*.

- [ ] Create `scripts/build-timeline-data.mjs` with the exported pure helpers **and** the guarded build `main()`:

```js
/**
 * build-timeline-data.mjs — bakes the compact dated camera table
 * (public/timeline-cameras.json) that drives the surveillance timeline map.
 *
 * Placement of WHICH cameras and WHERE is authoritative from the local Deflock
 * snapshot (public/camera-data.json). The first-seen MONTH is resolved from OSM
 * element history via the HeiGIT ohsome API. Cameras whose OSM creation date
 * cannot be resolved are excluded (they cannot be placed on the timeline).
 *
 * Graceful fallback (design "Extraction method — fallback"): if ohsome is
 * unreachable/errors or resolves zero dates, reuse the last committed table and
 * exit 0 so the site build never breaks.
 *
 * The pure helpers below are exported and unit-tested in
 * build-timeline-data.test.mjs; main() is guarded so importing this module for
 * tests never runs the network fetch (same idiom as build-county-shapes.mjs).
 *
 * parseDirectionTag mirrors parseDirection in
 * src/scripts/map/layers/cameras.ts — mirror any change there here.
 *
 * Run: node scripts/build-timeline-data.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAMERA_DATA = resolve(ROOT, 'public', 'camera-data.json');
const OUT_PATH = resolve(ROOT, 'public', 'timeline-cameras.json');
// Spec: the timeline UI opens at ~Jan 2020. OSM has ALPR nodes predating 2020,
// so first-seen months are FLOORED to this stop and pre-2020 cameras are bucketed
// into it — the scrubber and intro then start at 202001 with no sparse pre-2020
// tail (see monthStops() in timeline-controller.ts, which relies on this floor).
const TIMELINE_START_MONTH = 202001;

// --- Pure helpers (exported, unit-tested) ---

/** ISO timestamp -> YYYYMM integer, e.g. "2024-03-15T..." -> 202403. */
export function monthInt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date: ${iso}`);
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

/** Round a coordinate to 5 decimals (~1.1 m), stable across reruns. */
export function roundCoord(n) {
  return Math.round(n * 1e5) / 1e5;
}

/** Faithful port of parseDirection (cameras.ts). Degrees, or null. */
export function parseDirectionTag(tags) {
  if (!tags) return null;
  const raw = tags['direction'] || tags['camera:direction'];
  if (!raw) return null;
  const first = String(raw).split(';')[0].trim();
  if (/^\d+-\d+$/.test(first)) {
    const [a, b] = first.split('-').map(Number);
    return (a + b) / 2;
  }
  const cardinals = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const upper = first.toUpperCase();
  if (upper in cardinals) return cardinals[upper];
  const deg = Number(first);
  return Number.isNaN(deg) ? null : deg;
}

/** Deterministic order (month, then lon, then lat) so reruns are byte-identical. */
export function sortForDeterminism(rows) {
  return [...rows].sort((a, b) => a.m - b.m || a.lon - b.lon || a.lat - b.lat);
}

/** Rows [{lon,lat,m,dir}] -> columnar {v,lon[],lat[],m[],dir[]}, coords rounded. */
export function encodeTable(rows) {
  const norm = sortForDeterminism(
    rows.map((r) => ({
      lon: roundCoord(r.lon),
      lat: roundCoord(r.lat),
      m: r.m,
      dir: r.dir ?? null,
    })),
  );
  return {
    v: 1,
    lon: norm.map((r) => r.lon),
    lat: norm.map((r) => r.lat),
    m: norm.map((r) => r.m),
    dir: norm.map((r) => r.dir),
  };
}

/** Columnar table -> row objects. Inverse of encodeTable. */
export function decodeTable(table) {
  const out = [];
  for (let i = 0; i < table.m.length; i++) {
    out.push({ lon: table.lon[i], lat: table.lat[i], m: table.m[i], dir: table.dir[i] });
  }
  return out;
}

/** Graceful fallback selector. Returns { table, reused }. */
export function chooseOutput(fresh, lastCommitted) {
  const ok = fresh && Array.isArray(fresh.m) && fresh.m.length > 0;
  if (ok) return { table: fresh, reused: false };
  const committedOk = lastCommitted && Array.isArray(lastCommitted.m) && lastCommitted.m.length > 0;
  if (committedOk) return { table: lastCommitted, reused: true };
  throw new Error('Timeline build produced no rows and no committed table to fall back to');
}

/** Stable serialization for the shipped artifact (fixed key order, trailing NL). */
export function serializeTable(table) {
  return JSON.stringify(table) + '\n';
}

// --- OSM first-seen date resolution (ohsome) ---

const OHSOME_URL = 'https://api.ohsome.org/v1/elementsFullHistory/centroid';
// Deflock ALPR nodes in OSM. Extra matches are harmless — only ids also present
// in camera-data.json are used; unmatched local cameras are excluded.
const OHSOME_FILTER = 'man_made=surveillance and surveillance:type=ALPR and type:node';
// Coarse macro-bboxes covering the lower 48 (west,south,east,north). Batching
// bounds each response and respects ohsome rate limits.
const REGIONS = [
  [-125.0, 32.0, -114.0, 49.5], // Pacific + Mountain NW
  [-114.0, 31.0, -102.0, 49.5], // Mountain
  [-102.0, 25.0, -90.0, 49.5],  // Plains
  [-90.0, 24.0, -80.0, 40.0],   // SE + Gulf
  [-90.0, 40.0, -80.0, 49.5],   // Great Lakes
  [-80.0, 24.0, -66.9, 40.0],   // Southeast Atlantic (incl. SC)
  [-80.0, 40.0, -66.9, 49.5],   // Northeast
];

async function fetchRegionEarliest(bbox, earliestById) {
  const today = new Date().toISOString().slice(0, 10);
  const body = new URLSearchParams({
    bboxes: bbox.join(','),
    // ohsome requires exactly two comma-separated ISO-8601 timestamps for a
    // start..end interval. The slash form (2016-01-01/<today>) returns HTTP 400
    // ("Wrong time parameter. You need to give exactly two ISO-8601 conform
    // timestamps."), so use the comma form.
    time: `2016-01-01,${today}`,
    filter: OHSOME_FILTER,
    properties: 'metadata',
  });
  const res = await fetch(OHSOME_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`ohsome responded ${res.status} for bbox ${bbox.join(',')}`);
  const json = await res.json();
  for (const f of json.features ?? []) {
    const osmId = f.properties?.['@osmId']; // e.g. "node/51968727"
    const validFrom = f.properties?.['@validFrom'];
    if (!osmId || !validFrom) continue;
    const id = Number(String(osmId).split('/')[1]);
    if (!Number.isFinite(id)) continue;
    const prev = earliestById.get(id);
    if (prev === undefined || validFrom < prev) earliestById.set(id, validFrom);
  }
}

function readCommitted() {
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const cameras = JSON.parse(readFileSync(CAMERA_DATA, 'utf-8'));
  console.log(`Loaded ${cameras.length} cameras from the snapshot`);

  const earliestById = new Map();
  let fresh = null;
  try {
    for (const bbox of REGIONS) {
      await fetchRegionEarliest(bbox, earliestById);
      console.log(`  ohsome ${bbox.join(',')}: ${earliestById.size} ids so far`);
    }
    const rows = [];
    for (const cam of cameras) {
      const iso = earliestById.get(cam.id);
      if (!iso) continue; // undated -> excluded from the timeline
      // Floor to the Jan-2020 timeline start: cameras first documented before
      // 2020 are bucketed into 202001 so the scrubber/intro open there.
      rows.push({
        lon: cam.lon,
        lat: cam.lat,
        m: Math.max(TIMELINE_START_MONTH, monthInt(iso)),
        dir: parseDirectionTag(cam.tags),
      });
    }
    fresh = encodeTable(rows);
    console.log(`Resolved ${rows.length}/${cameras.length} camera dates from OSM history`);
  } catch (err) {
    console.error('OSM date resolution failed; will fall back if possible:', err);
    fresh = null;
  }

  const { table, reused } = chooseOutput(fresh, readCommitted());
  if (reused) console.warn('Reusing the last committed timeline table (fresh build unavailable).');
  writeFileSync(OUT_PATH, serializeTable(table));
  const months = table.m;
  console.log(
    `Wrote ${OUT_PATH}: ${months.length} rows, months ${months[0]}..${months[months.length - 1]}`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
```

- [ ] Run the test and confirm it **PASSES**:

```
npx vitest run scripts/build-timeline-data.test.mjs
```
Expected: `PASS scripts/build-timeline-data.test.mjs` with all describe blocks green (monthInt, roundCoord, parseDirectionTag, sort/encode determinism, round-trip, chooseOutput).

- [ ] Commit the tested build helpers:

```
git add scripts/build-timeline-data.mjs scripts/build-timeline-data.test.mjs
git commit -m "feat(timeline): dated-table build script + tested encode/fallback helpers"
```

### 1b. Build the real dataset

- [ ] Generate the real dated table (network — hits ohsome):

```
node scripts/build-timeline-data.mjs
```
Expected: log lines `Loaded 62438 cameras…`, per-region `ohsome … ids so far`, `Resolved N/62438 camera dates from OSM history` (N in the tens of thousands), and `Wrote …/public/timeline-cameras.json: N rows, months 202001..2026xx` (the first month is `202001` because pre-2020 first-seen dates are floored to the Jan-2020 timeline start). If ohsome is unreachable it logs the fallback warning instead — in that case retry later; the gate needs a real fresh build.

- [ ] Sanity-check the artifact size and shape:

```
node -e "const t=require('./public/timeline-cameras.json'); console.log('rows',t.m.length,'gzip-relevant keys',Object.keys(t).join(',')); const yrs={}; for(const m of t.m){const y=Math.floor(m/100); yrs[y]=(yrs[y]||0)+1;} console.log('by year',yrs);"
```
Expected: `rows` in the tens of thousands; `keys v,lon,lat,m,dir`; a by-year histogram that **starts at 2020** (no pre-2020 rows — earlier cameras are floored into Jan 2020) with a possibly heavy 2020 bucket (the bucketed pre-2020 tail) and mass concentrating from 2020 onward.

### 1c. Validate placement against truth (THE GATE)

- [ ] Quantitative check — Upstate-heavy SC, no `(0,0)` / degenerate coords, plausible national spread:

```
node -e "const t=require('./public/timeline-cameras.json'); let sc=0,ups=0,zero=0; for(let i=0;i<t.m.length;i++){const lon=t.lon[i],lat=t.lat[i]; if(lon===0&&lat===0)zero++; const inSC=lat>=32.0&&lat<=35.3&&lon>=-83.4&&lon<=-78.4; if(inSC){sc++; if(lat>=34.4&&lon<=-81.7)ups++;}} console.log('SC rows',sc,'Upstate share',(100*ups/sc).toFixed(1)+'%','zero-coord rows',zero);"
```
Acceptance: `SC rows` is a few thousand (same order as `impact-stats.json` `scTotal`); `Upstate share` is clearly disproportionate (the Greenville/Spartanburg/Anderson corner should hold a large fraction, matching known deployment); `zero-coord rows` is `0`. If any fails, stop and fix the data/extraction before proceeding.

- [ ] Visual corridor check — create the throwaway page `src/pages/timeline-check.astro` (NOT committed):

```astro
---
// TEMPORARY placement-gate render for Checkpoint 1. Delete before committing.
---
<html>
  <head><link rel="stylesheet" href="/node_modules/maplibre-gl/dist/maplibre-gl.css" /></head>
  <body style="margin:0;background:#171717">
    <div id="m" style="position:fixed;inset:0"></div>
    <script>
      import maplibregl from 'maplibre-gl';
      const t = await (await fetch('/timeline-cameras.json')).json();
      const features = [];
      for (let i = 0; i < t.m.length; i++) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lon[i], t.lat[i]] }, properties: { m: t.m[i] } });
      }
      const map = new maplibregl.Map({
        container: 'm', style: '/map-style.json', center: [-96, 38], zoom: 3.2,
      });
      map.on('load', () => {
        map.addSource('tl', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({ id: 'tl', type: 'circle', source: 'tl', paint: { 'circle-radius': 1.8, 'circle-color': '#ef4444', 'circle-opacity': 0.8 } });
      });
    </script>
  </body>
</html>
```

- [ ] Start the dev server and open the check page:

```
npm run dev
```
Then browse `http://localhost:4321/timeline-check`.

- [ ] **Gate acceptance (visual):** Confirm all of the following against the spec's truth check. If any fails, the data is wrong — stop and revisit extraction/placement, do not proceed to Checkpoint 2:
  - Dots **trace road/interstate corridors between cities** (e.g. along I-85/I-26 in the Upstate, corridors between metros), **not** tidy metro-only blobs.
  - Zoomed to SC, density is **Upstate-heavy** (Greenville region markedly denser than the Lowcountry).
  - **No geocoding artifacts**: no grid-snapped rows, no dense stack at a single point, no dots in the ocean or at nominal centroids.

- [ ] Remove the throwaway page and stop the dev server (leave `npm run dev` running only while checking):

```
rm src/pages/timeline-check.astro
```

- [ ] Commit the validated dataset:

```
git add public/timeline-cameras.json
git commit -m "feat(timeline): baked real dated camera dataset (checkpoint-1 gate passed)"
```

### 1d. Wire the weekly refresh (piggyback)

> **Coordination:** apply the edit below to the **current base** workflow. If `feature/live-camera-counter` has already landed, instead add a `build-timeline-data` npm script and invoke it via `npm run build-timeline-data` after `npm run prebuild` (Node 22) — see the Coordination note.

- [ ] In `.github/workflows/refresh-camera-data.yml`, add the timeline build step after the `build-impact-stats.mjs` run:

```yaml
      - run: node scripts/build-impact-stats.mjs
      - run: node scripts/build-timeline-data.mjs
```

- [ ] In the same file, add `public/timeline-cameras.json` to both the `git diff --quiet` guard and the `git add` in the "Commit if data changed" step:

```yaml
          if git diff --quiet public/camera-data.json public/camera-counts.json public/timeline-cameras.json && [ "$impact_changed" = "0" ]; then
            echo "No meaningful data changes; skipping commit."
          else
            git add public/camera-data.json public/camera-counts.json public/timeline-cameras.json src/data/impact-stats.json
            git commit -m "chore: refresh camera data + impact stats + timeline"
            git push
          fi
```

- [ ] Confirm the workflow YAML still parses (no tabs, valid structure):

```
node -e "const y=require('fs').readFileSync('.github/workflows/refresh-camera-data.yml','utf8'); if(y.includes('\t'))throw new Error('tab in YAML'); console.log('ok, timeline step present:', y.includes('build-timeline-data.mjs'));"
```
Expected: `ok, timeline step present: true`.

- [ ] Commit the refresh wiring:

```
git add .github/workflows/refresh-camera-data.yml
git commit -m "ci(timeline): build the dated table in the weekly camera refresh"
```

---

## Checkpoint 2 — Rendering layer (unclustered dated layer module)

Builds `src/scripts/map/layers/timeline-cameras.ts`: its own GeoJSON source (no clustering), glow + dot layers with zoom-scaled radius and the hot-flare-then-cool paint, a high-zoom cone layer with full-intensity centers, and the `setCutoff`/`fitTo` API. Pure helpers (`cutoffFilter`, `formatOsd`) are TDD'd first; the render itself is browser-verified.

### 2a. TDD the pure client helpers

- [ ] Create `src/lib/timeline-format.test.ts` with failing tests:

```ts
import { describe, it, expect } from 'vitest';
import { cutoffFilter, formatOsd, introCutoffAt, monthIndex, flareColor } from './timeline-format.js';

describe('cutoffFilter', () => {
  it('builds a MapLibre <= filter on the m property', () => {
    expect(cutoffFilter(202403)).toEqual(['<=', ['get', 'm'], 202403]);
  });
});

describe('formatOsd', () => {
  it('formats the camera-OSD readout with the honest "documented" suffix', () => {
    expect(formatOsd(202403, 41208)).toBe('Mar 2024 · 41,208 documented');
  });
  it('groups thousands and handles January', () => {
    expect(formatOsd(202001, 5)).toBe('Jan 2020 · 5 documented');
    expect(formatOsd(202612, 1234567)).toBe('Dec 2026 · 1,234,567 documented');
  });
});

describe('monthIndex', () => {
  it('maps YYYYMM to a linear month index (year*12 + month-1)', () => {
    expect(monthIndex(202001)).toBe(2020 * 12);
    expect(monthIndex(202012) - monthIndex(202001)).toBe(11);
  });
  it('is continuous across the year boundary (the flare-arithmetic bug)', () => {
    // Raw YYYYMM would give 202501 - 202412 = 89; the linear index gives 1.
    expect(monthIndex(202501) - monthIndex(202412)).toBe(1);
  });
});

describe('flareColor', () => {
  it('ramps the hot flare on the linear month delta, not raw YYYYMM arithmetic', () => {
    // cutoff Jan 2025 vs a camera first-seen Dec 2024 must read as 1 month old
    // (amber), not 89 months old (fully cooled) — the year-boundary regression.
    const expr = flareColor(202501) as unknown as unknown[];
    expect(expr[0]).toBe('interpolate');
    expect(expr[2]).toEqual(['-', monthIndex(202501), ['get', 'mi']]);
    // Ramp stops are month counts: 0 (hot), 1 (amber), FLARE_SPAN (cooled red).
    expect(expr[3]).toBe(0);
    expect(expr[5]).toBe(1);
    expect(expr[7]).toBe(3);
  });
});

describe('introCutoffAt', () => {
  const months = [];
  for (let y = 2020; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) months.push(y * 100 + mo);
  const opts = { lingerMs: 3000, advanceMs: 15000 };

  it('holds the first month through the linger', () => {
    expect(introCutoffAt(0, months, opts)).toBe(months[0]);
    expect(introCutoffAt(3000, months, opts)).toBe(months[0]);
  });
  it('reaches the last month at the end of the advance and stays there', () => {
    expect(introCutoffAt(18000, months, opts)).toBe(months[months.length - 1]);
    expect(introCutoffAt(99999, months, opts)).toBe(months[months.length - 1]);
  });
  it('is monotonically non-decreasing', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 18000; t += 250) {
      const v = introCutoffAt(t, months, opts);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('returns 0 for an empty month list', () => {
    expect(introCutoffAt(1000, [], opts)).toBe(0);
  });
});
```

- [ ] Run and confirm **FAIL** (module missing):

```
npx vitest run src/lib/timeline-format.test.ts
```
Expected: `FAIL` — cannot resolve `./timeline-format.js` / no such exports.

- [ ] Create `src/lib/timeline-format.ts`:

```ts
/**
 * Pure, framework-free helpers for the surveillance timeline map. Kept out of
 * the layer/controller modules so they can be unit-tested without MapLibre.
 */

import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';

/** MapLibre filter: show only cameras first-seen on or before the cutoff month. */
export function cutoffFilter(cutoff: number): FilterSpecification {
  return ['<=', ['get', 'm'], cutoff] as unknown as FilterSpecification;
}

/**
 * YYYYMM integer -> a LINEAR month index (year*12 + month-1), so consecutive
 * calendar months always differ by exactly 1 — including across a year boundary
 * (202412 -> 24299, 202501 -> 24300). Raw YYYYMM arithmetic does NOT have this
 * property (202501 - 202412 = 89), which is why the hot-flare ramp keys on this
 * index, not on YYYYMM. The `m <= cutoff` visibility filter can still use raw
 * YYYYMM because that comparison only needs monotonic ordering, which YYYYMM has.
 */
export function monthIndex(m: number): number {
  const year = Math.floor(m / 100);
  const mo = m % 100;
  return year * 12 + (mo - 1);
}

/** Months of "recency" the hot flare ramps over as the cutoff advances. */
export const FLARE_SPAN = 3;

/**
 * Hot-flare-then-cool fill expression. Interpolates on the LINEAR month delta
 * `cutoffIndex - featureMonthIndex` (baked property `mi`): a dot freshly crossed
 * by the cutoff (delta 0) is near-white/amber hot; by FLARE_SPAN months it has
 * cooled to surveillance red. Keying on the linear index (not `cutoff - ['get',
 * 'm']`) is what keeps the flare correct across year boundaries. Pure and
 * MapLibre-free at call time (returns a plain expression array), so it is
 * unit-testable — see timeline-format.test.ts.
 */
export function flareColor(cutoff: number): ExpressionSpecification {
  const ci = monthIndex(cutoff);
  return [
    'interpolate', ['linear'], ['-', ci, ['get', 'mi']],
    0, '#fff7ed', // just arrived — hot
    1, '#fbbf24', // amber
    FLARE_SPAN, '#ef4444', // cooled to surveillance red
  ] as unknown as ExpressionSpecification;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Camera-OSD readout: (202403, 41208) -> "Mar 2024 · 41,208 documented". */
export function formatOsd(m: number, count: number): string {
  const year = Math.floor(m / 100);
  const name = MONTHS[(m % 100) - 1] ?? '???';
  return `${name} ${year} · ${count.toLocaleString('en-US')} documented`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Non-uniform intro easing. Holds months[0] through `lingerMs` (the sparse 2020
 * opening), then advances across the ordered `months` with an ease-in-out-cubic
 * curve over `advanceMs` (slow → fast through the middle years → slowing as SC
 * fills), landing exactly on the last month at lingerMs + advanceMs.
 */
export function introCutoffAt(
  elapsedMs: number,
  months: number[],
  opts: { lingerMs: number; advanceMs: number },
): number {
  if (months.length === 0) return 0;
  if (elapsedMs <= opts.lingerMs) return months[0];
  const t = Math.min((elapsedMs - opts.lingerMs) / opts.advanceMs, 1);
  const idx = Math.min(months.length - 1, Math.floor(easeInOutCubic(t) * (months.length - 1)));
  return months[idx];
}
```

- [ ] Run and confirm **PASS**:

```
npx vitest run src/lib/timeline-format.test.ts
```
Expected: `PASS` with all four describe blocks green.

- [ ] Commit:

```
git add src/lib/timeline-format.ts src/lib/timeline-format.test.ts
git commit -m "feat(timeline): tested pure helpers (cutoff filter, month index, flare color, OSD format, intro easing)"
```

### 2b. Build the layer module

- [ ] Create `src/scripts/map/layers/timeline-cameras.ts`:

```ts
/**
 * Unclustered dated camera layer for the surveillance timeline map.
 *
 * Its OWN GeoJSON source (NOT the clustered `cameras` source or the viewport
 * tile-loader): the full dated dataset is loaded once via setData at init, and
 * playback only updates a cheap filter/paint — never setData per tick. No
 * clustering at any zoom (clustering would destroy the appear-over-time bloom).
 *
 * Layers (bottom to top):
 *   - timeline-glow : large blurred red circle carrying LUMINANCE (survives
 *                     protanopia / dim screens), filtered m <= cutoff.
 *   - timeline-dots : hard, small red core, hot-flare-then-cool by recency,
 *                     filtered m <= cutoff.
 *   - timeline-cones: high-zoom directional cones (icon-rotate from baked dir),
 *                     full-intensity center dot preserved. Same m <= cutoff.
 *
 * Radius is zoom-interpolated with a MOBILE FLOOR (<=375px viewports get larger
 * low-zoom radii + stronger glow so national dots stay perceptible on a phone).
 */

import maplibregl from 'maplibre-gl';
import { createConeImage } from './cameras.js';
import { cutoffFilter, flareColor, monthIndex } from '../../../lib/timeline-format.js';

export interface TimelineTable {
  v: number;
  lon: number[];
  lat: number[];
  m: number[];
  dir: (number | null)[];
}

export interface TimelineLayerHandle {
  /** Cheap filter+paint update — NEVER setData. */
  setCutoff(cutoff: number): void;
  /** Camera move only (fit-bounds), same dataset drives both scales. */
  fitTo(scale: 'national' | 'sc'): void;
}

const SC_BOUNDS: maplibregl.LngLatBoundsLike = [[-83.45, 32.0], [-78.45, 35.25]];
const US_BOUNDS: maplibregl.LngLatBoundsLike = [[-125.0, 24.0], [-66.9, 49.5]];
const CONE_MIN_ZOOM = 13; // cones resolve at town scale; dots below

/**
 * Feature properties baked per camera:
 *   m       — YYYYMM first-seen month; drives the `m <= cutoff` visibility filter
 *             (raw YYYYMM is fine there: `<=` only needs monotonic ordering).
 *   mi      — LINEAR month index (year*12 + month-1); drives the hot-flare ramp,
 *             which subtracts months and MUST be continuous across year
 *             boundaries. See monthIndex()/flareColor() in timeline-format.ts.
 *   dir     — baked bearing for the cone icon-rotate (0 when unknown).
 *   hasDir  — whether a real direction is known (gates the cone layer).
 */
function tableToGeoJSON(t: TimelineTable): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < t.m.length; i++) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lon[i], t.lat[i]] },
      properties: {
        m: t.m[i],
        mi: monthIndex(t.m[i]),
        dir: t.dir[i] ?? 0,
        hasDir: t.dir[i] != null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function addTimelineLayers(
  map: maplibregl.Map,
  table: TimelineTable,
  opts: { cutoff: number; mobile: boolean },
): TimelineLayerHandle {
  const { mobile } = opts;
  const filter = cutoffFilter(opts.cutoff);

  map.addSource('timeline', { type: 'geojson', data: tableToGeoJSON(table) });

  // Zoom-scaled radii. Mobile floors the national end so dots stay visible.
  const dotRadius = mobile
    ? ['interpolate', ['exponential', 1.4], ['zoom'], 3, 2.6, 7, 3.6, 11, 6, 14, 9]
    : ['interpolate', ['exponential', 1.4], ['zoom'], 3, 1.6, 7, 2.6, 11, 5, 14, 8];
  const glowRadius = mobile
    ? ['interpolate', ['exponential', 1.4], ['zoom'], 3, 6, 7, 8, 11, 13, 14, 20]
    : ['interpolate', ['exponential', 1.4], ['zoom'], 3, 4, 7, 6, 11, 11, 14, 18];

  // Glow — carries brightness, tight (not a nebulous halo). Filtered by cutoff.
  map.addLayer({
    id: 'timeline-glow',
    type: 'circle',
    source: 'timeline',
    filter,
    paint: {
      'circle-color': flareColor(opts.cutoff),
      'circle-radius': glowRadius as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
      'circle-opacity': mobile ? 0.5 : 0.4,
      'circle-blur': 1,
    },
  });

  // Solid dot — hard small core; hot-flare-then-cool color; full opacity.
  map.addLayer({
    id: 'timeline-dots',
    type: 'circle',
    source: 'timeline',
    filter,
    paint: {
      'circle-color': flareColor(opts.cutoff),
      'circle-radius': dotRadius as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
      'circle-opacity': 0.95,
    },
  });

  // Cones at high zoom only (>= CONE_MIN_ZOOM). ACCEPTED DEVIATION from the
  // spec's "cones replace dots": the glow/dot layers are intentionally NOT
  // capped with a maxzoom, so above the threshold cones OVERLAY the dots rather
  // than replacing them. Rationale: (1) no-direction cameras have no cone, so
  // they must stay visible as dots at high zoom — a blanket dot maxzoom would
  // make every no-dir camera vanish at town scale; (2) createConeImage's own
  // center dot is full-intensity, so a dir-tagged camera reads as one strong
  // core with a wedge, not a doubled blob. Strict replacement is achievable — a
  // ['zoom']-aware filter is valid in MapLibre (filters may reference ['zoom'],
  // evaluated at integer zoom levels), or split dir/no-dir sources — but the
  // overlay is the deliberate choice: it keeps no-dir cameras visible and keeps
  // full-intensity centers with no extra source/filter machinery.
  map.addImage('timeline-cone', createConeImage());
  map.addLayer({
    id: 'timeline-cones',
    type: 'symbol',
    source: 'timeline',
    minzoom: CONE_MIN_ZOOM,
    filter: ['all', filter, ['get', 'hasDir']] as unknown as maplibregl.FilterSpecification,
    layout: {
      'icon-image': 'timeline-cone',
      'icon-size': 1.0,
      'icon-rotate': ['get', 'dir'],
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
    },
  });

  return {
    setCutoff(cutoff: number) {
      const f = cutoffFilter(cutoff);
      map.setFilter('timeline-glow', f);
      map.setFilter('timeline-dots', f);
      map.setFilter('timeline-cones', ['all', f, ['get', 'hasDir']] as unknown as maplibregl.FilterSpecification);
      const color = flareColor(cutoff);
      map.setPaintProperty('timeline-glow', 'circle-color', color);
      map.setPaintProperty('timeline-dots', 'circle-color', color);
    },
    fitTo(scale) {
      map.fitBounds(scale === 'sc' ? SC_BOUNDS : US_BOUNDS, {
        padding: 24,
        duration: 0,
      });
    },
  };
}
```

> **Accepted deviation (cones overlay dots, not replace them).** The spec frames
> high zoom as "dots resolve into cones" (cones replacing dots). This module keeps
> `timeline-glow`/`timeline-dots` uncapped and lets `timeline-cones` (minzoom
> `CONE_MIN_ZOOM`) draw on top. This is deliberate: no-direction cameras have no
> cone, so they must stay visible as dots at high zoom — a blanket dot `maxzoom`
> would erase every no-dir camera at town scale. Because `createConeImage` already
> carries a full-intensity center dot, a dir-tagged camera still reads as a single
> strong core under its wedge. Strict replacement is achievable — a `['zoom']`-aware
> filter is valid in MapLibre (filters may reference `['zoom']`, evaluated at
> integer zoom levels), or split the dataset into dir/no-dir sources and cap only
> the dir dots' `maxzoom` at `CONE_MIN_ZOOM` — but overlaying is the deliberate
> choice because it keeps no-dir cameras visible with no extra source/filter
> machinery.

- [ ] Type-check the new module compiles cleanly:

```
npx astro check --minimumSeverity error
```
Expected: no errors attributable to `timeline-cameras.ts` / `timeline-format.ts` (pre-existing project diagnostics unrelated to these files, if any, are acceptable — do not introduce new ones).

- [ ] Commit:

```
git add src/scripts/map/layers/timeline-cameras.ts
git commit -m "feat(timeline): unclustered dated layer module (glow/dot/cone, cutoff API)"
```

### 2c. Browser-verify the render (temporary harness)

> This reuses the temporary check-page approach to verify the layer module before the controller and chrome exist. It's a throwaway; delete it after.

- [ ] Create a temporary `src/pages/timeline-check.astro` that mounts the module via `createMap`:

```astro
---
// TEMPORARY render harness for Checkpoint 2. Delete before committing.
---
<div id="tm" class="map-dark" style="position:fixed;inset:0"></div>
<script>
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { createMap } from '../scripts/map/core.js';
  import { addTimelineLayers } from '../scripts/map/layers/timeline-cameras.js';
  const table = await (await fetch('/timeline-cameras.json')).json();
  const mobile = window.matchMedia('(max-width: 375px)').matches;
  const latest = table.m[table.m.length - 1]; // m is sorted ascending; avoid Math.max(...) spread
  const handle = createMap({ container: 'tm', style: '/map-style.json', center: [-96, 38], zoom: 3.2, cooperativeGestures: true });
  handle.map.on('load', () => {
    const layer = addTimelineLayers(handle.map, table, { cutoff: 202001, mobile });
    // Expose for manual scrubbing in the console.
    (window as any).__tl = { layer, latest };
  });
</script>
```

- [ ] Run the dev server and open the harness:

```
npm run dev
```
Browse `http://localhost:4321/timeline-check`. In the browser console, step the cutoff: `__tl.layer.setCutoff(202006)`, `__tl.layer.setCutoff(202206)`, `__tl.layer.setCutoff(__tl.latest)`.

- [ ] **Acceptance (visual, from the spec):** Confirm:
  - Dots are **surveillance red with a tight bright glow** on the dark ground (not a soft nebulous halo); dead-dark everywhere else.
  - Advancing the cutoff **adds dots**; newly-crossed dots **flare hot (near-white/amber) then cool to red** over a few months of advance — growth stays visible even inside already-red metros.
  - Dot radius **shrinks when zoomed out, grows when zoomed in**; at ≤375px (resize the window / device toolbar) national dots stay perceptible (mobile floor).
  - Zooming past ~z13 into a town **resolves dots into red cones** that point (icon-rotate); the **cone center dot stays full-intensity** (not calmer than the national view).
  - **Grayscale + squint test:** with the page desaturated (devtools Rendering → emulate `grayscale`) and/or eyes squinted, advancing the cutoff still reads as **spreading brightness**. If not, raise glow opacity/brightness in `flareColor`/`glowRadius` (architecture unchanged).

- [ ] Remove the harness:

```
rm src/pages/timeline-check.astro
```

---

## Checkpoint 3 — Dedicated basemap style

Creates `public/timeline-map-style.json` from `map-style.json`: roads on; road-name + water labels off; city labels gated to high zoom and muted; state/country/other place labels off. The zoom-gating means labels are automatically off through the intro and at national/mid zoom (the intro never exceeds mid zoom until the SC fly-through ends ~z7).

- [ ] Create the throwaway generator `scripts/_gen-timeline-style.mjs` (NOT committed):

```js
// One-shot: derive public/timeline-map-style.json from public/map-style.json.
// Run once, commit the JSON output, then delete this file.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const style = JSON.parse(readFileSync(resolve(ROOT, 'public', 'map-style.json'), 'utf-8'));

// Labels removed outright (spec: road-name + water labels off; state/country/
// other place labels off at all scales).
const DROP = new Set([
  'water_name',
  'highway_name_other',
  'highway_name_motorway',
  'place_state',
  'place_country_other',
  'place_country_minor',
  'place_country_major',
  'place_other',
]);

// City-tier labels: kept but GATED to high zoom and MUTED (low-opacity,
// desaturated text, minimal halo). minzoom just below the cone-resolve threshold.
const CITY_MINZOOM = 11;
const CITY_TIERS = new Set([
  'place_city', 'place_city_large', 'place_town', 'place_village', 'place_suburb',
]);

const layers = [];
for (const layer of style.layers) {
  if (DROP.has(layer.id)) continue;
  if (CITY_TIERS.has(layer.id)) {
    layer.minzoom = CITY_MINZOOM;
    layer.paint = {
      ...(layer.paint ?? {}),
      'text-color': 'rgba(115,115,115,0.55)',
      'text-halo-color': 'rgba(23,23,23,0.6)',
      'text-halo-width': 0.6,
      'text-halo-blur': 0.5,
      'icon-opacity': 0.3,
    };
  }
  layers.push(layer);
}

const out = { ...style, layers };
writeFileSync(resolve(ROOT, 'public', 'timeline-map-style.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote timeline-map-style.json: ${layers.length} layers (from ${style.layers.length})`);
```

- [ ] Generate the style and confirm the expected layer delta:

```
node scripts/_gen-timeline-style.mjs
```
Expected: `Wrote timeline-map-style.json: N layers (from M)` where `M - N === 8` (the eight dropped label layers).

- [ ] Verify the transform's invariants:

```
node -e "const s=require('./public/timeline-map-style.json'); const ids=s.layers.map(l=>l.id); const dropped=['water_name','highway_name_other','highway_name_motorway','place_state','place_country_other','place_country_minor','place_country_major','place_other']; console.log('none dropped remain:', dropped.every(d=>!ids.includes(d))); const city=s.layers.find(l=>l.id==='place_city'); console.log('place_city minzoom:', city.minzoom, 'muted:', city.paint['text-color']); console.log('roads kept:', ['highway_minor','highway_major_inner','highway_motorway_casing','highway_motorway_subtle'].every(r=>ids.includes(r))); console.log('boundaries+water kept:', ['background','water','waterway','boundary_state','boundary_country_z5-'].every(r=>ids.includes(r)));"
```
Expected: `none dropped remain: true`; `place_city minzoom: 11 muted: rgba(115,115,115,0.55)`; `roads kept: true`; `boundaries+water kept: true`.

- [ ] Delete the throwaway generator:

```
rm scripts/_gen-timeline-style.mjs
```

- [ ] Browser-verify the style (temporary harness): recreate the Checkpoint-2c `src/pages/timeline-check.astro` but change the `createMap` `style` to `'/timeline-map-style.json'`, run `npm run dev`, open `/timeline-check`.
  - **Acceptance:** roads/interstates visible at national and state scale giving the dots geographic anchoring; **no** road-name, water, state, or country labels at any zoom; **no** city labels until you zoom past ~z11, at which point faint muted city labels fade in; coastline + state outlines present. Then `rm src/pages/timeline-check.astro`.

- [ ] Commit the style:

```
git add public/timeline-map-style.json
git commit -m "feat(timeline): dedicated basemap style (roads on, labels gated/muted)"
```

---

## Checkpoint 4 — Guided intro + DaisyUI scrubber/chrome (controller)

Builds `src/scripts/map/timeline-controller.ts`: scrubber state, play/pause, monthly range, the camera-OSD readout, the National ⇄ SC toggle, the visibility-triggered guided intro (cutoff + `flyTo` + held final frame + interrupt + replay), and the reduced-motion branch. The intro easing math (`introCutoffAt`) is already tested (Checkpoint 2a); the orchestration is browser-verified. The DaisyUI chrome markup is added in Checkpoint 5's island; this checkpoint wires the controller against that markup's element IDs (listed inline).

- [ ] Create `src/scripts/map/timeline-controller.ts`:

```ts
/**
 * Timeline map controller — orchestration only. Owns the cutoff scrubber, the
 * play/pause timer, the guided intro (advancing cutoff on a timer + easing into
 * SC + a held final frame), the National <-> SC toggle, reduced-motion, replay,
 * and wiring to the DaisyUI chrome. Drives the layer module through its
 * setCutoff/fitTo API; knows nothing about MapLibre paint internals.
 *
 * Expected chrome element IDs (rendered by TimelineMap.astro):
 *   #tl-play (btn), #tl-range (range), #tl-osd (OSD readout), #tl-skip (btn),
 *   #tl-replay (btn), #tl-scope-national / #tl-scope-sc (join btns),
 *   #tl-method (methodology line), and the root #tl-root (state classes).
 */

import type { MapHandle } from './core.js';
import type { TimelineLayerHandle, TimelineTable } from './layers/timeline-cameras.js';
import { formatOsd, introCutoffAt } from '../../lib/timeline-format.js';

const LINGER_MS = 3000;
const ADVANCE_MS = 15000;
const FLYTHROUGH_LEAD_MONTHS = 18; // begin national->SC in the last ~18 months
const FLYTHROUGH_MS = 5000;
const HELD_FRAME_MS = 2000;

export interface ControllerDeps {
  handle: MapHandle;
  layer: TimelineLayerHandle;
  table: TimelineTable;
  root: HTMLElement;
  /** Resting/default scope, from the marker's `data-default-scale` (default 'sc').
   *  Drives the reduced-motion frame, the Skip destination, and whether the
   *  guided intro flies into SC or stays national. */
  defaultScale: 'national' | 'sc';
}

/**
 * Ordered unique YYYYMM stops present in the dataset. The build script floors
 * every `m` to 202001 (build-timeline-data.mjs, TIMELINE_START_MONTH), so
 * months[0] is the spec's ~Jan-2020 start and the scrubber/intro open there
 * with no sparse pre-2020 tail — no extra clamp is needed here.
 */
function monthStops(table: TimelineTable): number[] {
  return [...new Set(table.m)].sort((a, b) => a - b);
}

/** Cumulative count of cameras with m <= cutoff (real-scale readout). */
function cumulativeCount(sortedMonths: number[], cutoff: number): number {
  // sortedMonths is table.m already sorted ascending (build output is sorted).
  let lo = 0, hi = sortedMonths.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedMonths[mid] <= cutoff) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function initTimelineController(deps: ControllerDeps): () => void {
  const { handle, layer, table, root, defaultScale } = deps;
  const months = monthStops(table);
  const sortedM = table.m; // build output is ascending by m
  const first = months[0];
  const last = months[months.length - 1];
  const flyMonth = months[Math.max(0, months.length - 1 - flyIndexOffset(months))];

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const play = $<HTMLButtonElement>('tl-play');
  const range = $<HTMLInputElement>('tl-range');
  const osd = $('tl-osd');
  const skip = $<HTMLButtonElement>('tl-skip');
  const replay = $<HTMLButtonElement>('tl-replay');
  const scopeNat = $<HTMLButtonElement>('tl-scope-national');
  const scopeSc = $<HTMLButtonElement>('tl-scope-sc');

  range.min = '0';
  range.max = String(months.length - 1);
  range.step = '1';

  let cutoff = first;
  let playing = false;
  let introRafId = 0; // requestAnimationFrame id for the guided intro
  let playTimer = 0;  // setTimeout id for the free-exploration play loop
  let heldTimer = 0;  // setTimeout id for the held-frame settle before going live
  let introRunning = false;
  let flewToSc = false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(idx: number) {
    cutoff = months[idx];
    range.value = String(idx);
    layer.setCutoff(cutoff);
    const label = formatOsd(cutoff, cumulativeCount(sortedM, cutoff));
    osd.textContent = label;
    // Announce the human-readable readout to AT. Without this the slider reports
    // its raw index value (0..N), which is meaningless when scrubbing by keyboard.
    range.setAttribute('aria-valuetext', label);
  }

  /** Reflect the active scope in the segmented control WITHOUT moving the camera. */
  function markScope(scale: 'national' | 'sc') {
    scopeNat.classList.toggle('btn-primary', scale === 'national');
    scopeSc.classList.toggle('btn-primary', scale === 'sc');
  }

  function setScope(scale: 'national' | 'sc') {
    layer.fitTo(scale);
    markScope(scale);
  }

  // ---- Guided intro ----
  function stopIntro() {
    introRunning = false;
    cancelAnimationFrame(introRafId);
    // Cancel any pending held-frame settle. Without this, interrupting during the
    // hold (which runs stopIntro early and reveals Replay) leaves the old timeout
    // armed; clicking Replay within the window would then let that STALE timeout
    // fire stopIntro() and kill the freshly started intro. interrupt() delegates
    // here, so clearing in stopIntro() covers the interrupt path too.
    clearTimeout(heldTimer);
    root.classList.remove('tl-intro');
    root.classList.add('tl-live'); // active states light up; OSD goes neutral
    // NB: controls are never `.disabled` during the intro (so scrub/play/scope
    // can interrupt it — see runIntro), so there is nothing to re-enable here.
    skip.hidden = true;
    replay.hidden = false;
  }

  function heldFrame() {
    root.classList.add('tl-held');
    $('tl-method').classList.add('tl-method-in'); // fade in methodology line
    // Keep the id so an interrupt (via stopIntro) can cancel this before it fires.
    heldTimer = window.setTimeout(() => { root.classList.remove('tl-held'); stopIntro(); }, HELD_FRAME_MS) as unknown as number;
  }

  function runIntro() {
    // Stop any active free-exploration playback first. Otherwise (e.g. Play then
    // "Replay intro") the play loop keeps ticking while the intro rAF also drives
    // render(), and the two fight over the map for the rest of the intro. Now that
    // the intro (introRafId) and the play loop (playTimer) use separate timer ids,
    // this stop is what actually halts the play loop before the intro starts.
    setPlaying(false);
    if (reduce) { // reduced motion: static present-day view at the default scope
      setScope(defaultScale);
      render(months.length - 1);
      stopIntro();
      replay.hidden = true; // nothing to replay
      return;
    }
    introRunning = true;
    flewToSc = false;
    root.classList.add('tl-intro');
    root.classList.remove('tl-live', 'tl-held');
    // Controls stay ENABLED throughout the intro: the spec requires any user
    // interaction (scrub, play, scope toggle, pan, zoom, Skip) to interrupt it,
    // and a disabled control's listener never fires. Interruption is handled by
    // the interrupt()/stopIntro() listeners wired below.
    skip.hidden = false;
    replay.hidden = true;
    setScope('national'); // spec step 1: start national, near-empty
    const start = performance.now();
    const tick = (now: number) => {
      if (!introRunning) return;
      const elapsed = now - start;
      const m = introCutoffAt(elapsed, months, { lingerMs: LINGER_MS, advanceMs: ADVANCE_MS });
      render(months.indexOf(m));
      // Fly into SC only when SC is the default resting scope; a 'national'
      // default keeps the guided view national through the hold.
      if (!flewToSc && defaultScale === 'sc' && m >= flyMonth) {
        flewToSc = true;
        handle.map.flyTo({ center: [-81.0, 33.9], zoom: 6.7, duration: FLYTHROUGH_MS });
        // The camera commits to SC here; sync the toggle to match WITHOUT a
        // fitBounds snap (setScope would jump-cut over the flyTo). Otherwise every
        // completed playthrough ends framed on SC while the control still
        // highlights National, contradicting the spec's SC resting state.
        markScope('sc');
      }
      if (elapsed >= LINGER_MS + ADVANCE_MS) { render(months.length - 1); heldFrame(); return; }
      introRafId = requestAnimationFrame(tick);
    };
    introRafId = requestAnimationFrame(tick);
  }

  // ---- Free-exploration play/pause ----
  function tickPlay() {
    if (!playing) return;
    const idx = Math.min(Number(range.value) + 1, months.length - 1);
    render(idx);
    if (idx >= months.length - 1) { setPlaying(false); return; }
    playTimer = window.setTimeout(tickPlay, 260) as unknown as number;
  }
  function setPlaying(on: boolean) {
    playing = on;
    play.setAttribute('aria-pressed', String(on));
    play.textContent = on ? '⏸' : '▶';
    if (on) tickPlay(); else clearTimeout(playTimer);
  }

  const interrupt = () => { if (introRunning) stopIntro(); };
  range.addEventListener('input', () => { interrupt(); setPlaying(false); render(Number(range.value)); });
  play.addEventListener('click', () => { interrupt(); setPlaying(!playing); });
  skip.addEventListener('click', () => { stopIntro(); render(months.length - 1); setScope(defaultScale); });
  replay.addEventListener('click', () => runIntro());
  scopeNat.addEventListener('click', () => { interrupt(); setScope('national'); });
  scopeSc.addEventListener('click', () => { interrupt(); setScope('sc'); });
  // Only USER-initiated map gestures interrupt the intro. MapLibre fires
  // dragstart/zoomstart for PROGRAMMATIC camera moves too — including the intro's
  // own setScope('national') fitBounds and the national->SC flyTo — and those
  // synthetic events carry no `originalEvent`. Without this guard the intro would
  // cancel itself at t=0 on the opening fitBounds and again mid-flight on the fly
  // into SC; guarding on originalEvent lets only real drag/zoom gestures interrupt.
  const interruptFromGesture = (e: { originalEvent?: unknown }) => {
    if (e && e.originalEvent) interrupt();
  };
  handle.map.on('dragstart', interruptFromGesture);
  handle.map.on('zoomstart', interruptFromGesture);

  // Initial paint (before the visibility observer fires the intro).
  render(reduce ? months.length - 1 : 0);
  if (reduce) {
    // Reduced-motion path rests immediately on the default scope.
    setScope(defaultScale);
  } else {
    // Motion path: KEEP the island's national pre-intro framing ([-96,38], z3.2)
    // — spec step 1 is "start national, near-empty". Do NOT fitTo SC here (that
    // would snap to an SC-framed near-empty map, then jump back to national when
    // runIntro fires). Only reflect national in the toggle state; runIntro moves
    // the camera and, if defaultScale is 'sc', flies into SC near the end.
    markScope('national');
  }

  return function start() { runIntro(); };
}

/** Index offset for the fly-through month (~18 months before the end). */
function flyIndexOffset(months: number[]): number {
  return Math.min(FLYTHROUGH_LEAD_MONTHS, months.length - 1);
}
```

- [ ] Type-check the controller:

```
npx astro check --minimumSeverity error
```
Expected: no new errors from `timeline-controller.ts`.

- [ ] Commit (chrome wiring is verified in Checkpoint 5, where the markup exists):

```
git add src/scripts/map/timeline-controller.ts
git commit -m "feat(timeline): controller (scrubber, intro, held frame, reduced-motion, replay)"
```

---

## Checkpoint 5 — Blog embedding (island + marker + gate)

Builds `src/components/TimelineMap.astro` (DaisyUI chrome + load-ahead lazy-import + fetch + the tighter visibility observer that starts the intro), the `data-timeline-map` marker in the host post, and the body-check gate in `[...slug].astro`. Verifies maplibre chunk reuse.

- [ ] Create `src/components/TimelineMap.astro`:

```astro
---
// Timeline map island. Chrome is all DaisyUI (deflock theme); the map + data
// load lazily when the figure scrolls near view (load-ahead observer), and the
// guided intro starts on a tighter visibility threshold. Reuses the homepage
// map's import specifiers so Vite shares the maplibre chunk.
---
<div id="tl-root" class="not-prose tl-root" data-timeline-scope="sc">
  <div class="tl-frame map-dark">
    <div id="tl-map" class="tl-map" role="application" aria-label="Surveillance camera timeline map" tabindex="-1"></div>
    <!-- OSD is AT-readable (no aria-hidden): it carries the feature's core number.
         It is not a live region — the intro updates it every frame, so per-frame
         announcements would spam AT; scrubbing feedback is announced instead via
         the range's aria-valuetext, set on each render in the controller. -->
    <div class="tl-osd-wrap">
      <span id="tl-osd" class="tl-osd">Jan 2020 · 0 documented</span>
    </div>
    <button id="tl-skip" class="btn btn-sm btn-ghost tl-skip" type="button">Skip &rarr;</button>
  </div>

  <div class="tl-controls">
    <div class="join">
      <button id="tl-scope-national" class="btn btn-sm join-item" type="button">National</button>
      <button id="tl-scope-sc" class="btn btn-sm join-item btn-primary" type="button">South Carolina</button>
    </div>
    <button id="tl-play" class="btn btn-sm btn-circle" type="button" aria-pressed="false" aria-label="Play timeline">▶</button>
    <input id="tl-range" class="range range-primary range-sm tl-range" type="range" min="0" max="1" value="0" aria-label="Timeline month" />
    <button id="tl-replay" class="btn btn-sm btn-ghost" type="button" hidden>Replay intro</button>
  </div>

  <p id="tl-method" class="tl-method">
    Dates reflect when each camera was <strong>documented in OpenStreetMap</strong> — a proxy for real install dates, not an official registry.
  </p>
</div>

<script>
  const root = document.getElementById('tl-root');
  const marker = document.querySelector('[data-timeline-map]');

  // Render the island WHERE the author placed the marker in the post body.
  // [...slug].astro emits <TimelineMap /> after the article content; move #tl-root
  // into the in-body marker so the map appears at the marker position (between the
  // intro and the methodology section), not after the whole body. This mirrors the
  // existing data-open-action precedent (a script finds the in-body marker and acts
  // on it in place) and needs no MDX.
  if (root && marker && marker !== root.parentElement) {
    marker.appendChild(root);
  }

  // Resting/default scope is authored on the marker (data-default-scale). Anything
  // other than 'national' falls back to the SC-centric default.
  const defaultScale = marker?.getAttribute('data-default-scale') === 'national' ? 'national' : 'sc';

  if (root) {
    let started = false;

    async function boot() {
      if (started) return;
      started = true;
      // Lazy-load maplibre's stylesheet alongside the JS so it is NOT bundled into
      // the blog page's eager CSS — it ships only when the map nears the viewport.
      await import('maplibre-gl/dist/maplibre-gl.css');
      const { createMap } = await import('../scripts/map/core.js');
      const { addTimelineLayers } = await import('../scripts/map/layers/timeline-cameras.js');
      const { initTimelineController } = await import('../scripts/map/timeline-controller.js');
      const table = await (await fetch('/timeline-cameras.json')).json();

      const mobile = window.matchMedia('(max-width: 375px)').matches;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // table.m is sorted ascending (guaranteed by encodeTable/serializeTable in
      // the build), so read the ends by index. Do NOT use Math.max/min(...table.m):
      // spreading a ~62k-and-growing array as call arguments exceeds Safari's
      // ~65k argument limit and throws RangeError as the dataset grows weekly.
      const latest = table.m[table.m.length - 1];
      const earliest = table.m[0];

      // Reduced-motion resting frame follows the default scope.
      const restCenter = (defaultScale === 'sc' ? [-81.0, 33.9] : [-96, 38]) as [number, number];
      const restZoom = defaultScale === 'sc' ? 6.7 : 3.2;

      const handle = createMap({
        container: 'tl-map',
        style: '/timeline-map-style.json',
        center: reduce ? restCenter : [-96, 38],
        zoom: reduce ? restZoom : 3.2,
        cooperativeGestures: true,
      });

      handle.map.on('load', () => {
        const layer = addTimelineLayers(handle.map, table, { cutoff: reduce ? latest : earliest, mobile });
        const start = initTimelineController({ handle, layer, table, root: root as HTMLElement, defaultScale });

        // Tighter observer: start the guided intro only when the map is mostly
        // on screen (distinct from the load-ahead observer below), so the viewer
        // watches it go red from the start rather than arriving mid-animation.
        if (!reduce) {
          const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) { io.disconnect(); start(); }
          }, { threshold: 0.5 });
          io.observe(handle.map.getContainer());
        } else {
          start(); // reduced-motion: paint the static present-day SC view now
        }
      });
    }

    // Load-ahead observer: lazy-import + fetch when the figure nears the viewport.
    const loadAhead = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { loadAhead.disconnect(); void boot(); }
    }, { rootMargin: '200px' });
    loadAhead.observe(root);
  }
</script>
```

- [ ] Add the timeline-only chrome CSS to `src/styles/global.css` (append near the `.map-dark` block):

```css
/* --- Surveillance timeline map chrome (DaisyUI deflock + a few specifics) --- */
.tl-root { display: flex; flex-direction: column; gap: 0.75rem; }
.tl-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 320px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0.45rem;
  overflow: hidden;
  background: #0d0d0d;
}
.tl-map { position: absolute; inset: 0; }

/* Camera-OSD readout: burned-in security-feed status text (amber during intro,
   neutral once live). Monospaced, tabular. NOT a floating chip, NO "REC" dot. */
.tl-osd-wrap { position: absolute; top: 10px; left: 12px; pointer-events: none; }
.tl-osd {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #a3a3a3; /* neutral by default (live) */
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
}
.tl-root.tl-intro .tl-osd { color: #fbbf24; } /* amber during the guided intro */

.tl-skip { position: absolute; bottom: 10px; right: 12px; }
.tl-root:not(.tl-intro) .tl-skip { display: none; }

.tl-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
.tl-range { flex: 1 1 180px; min-width: 140px; }

/* Controls stay fully interactive during the intro — any use interrupts it (spec
   requirement), so they are NOT dimmed to look locked. The running intro is
   signalled by the amber OSD alone. */

.tl-method {
  font-size: 0.85rem;
  color: #737373;
  line-height: 1.5;
  opacity: 0; /* fades in on the held final frame / once live */
  transition: opacity 0.6s ease;
}
.tl-method.tl-method-in, .tl-root.tl-live .tl-method { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .tl-method { transition: none; }
}
@media (max-width: 375px) {
  .tl-controls { gap: 0.4rem; }
  .tl-range { flex-basis: 100%; order: 3; }
}
```

- [ ] Create the host post scaffold `src/content/blog/surveillance-timeline-map.md`:

```md
---
title: "Watch South Carolina's surveillance network go red"
subtitle: "SUBJECT TBD — author to finish before publishing"
date: 2026-09-04
summary: "An animated map of every documented ALPR camera, blooming in over time from 2020 to today."
tags: ["surveillance", "flock", "data"]
draft: true
---

<!-- SCAFFOLD: editorial copy is a placeholder. Finish the narrative + keep the
     honest-methodology section before flipping draft:false. The map figure and
     the methodology paragraph below are load-bearing; leave the marker div. -->

The surveillance network did not arrive all at once. It spread — camera by
camera, town by town — until it was everywhere. Watch it happen.

<div class="not-prose">
  <div data-timeline-map data-default-scale="sc"></div>
</div>

## How we know when each camera appeared

Every dot's date is the month its camera was **first documented in
OpenStreetMap** — the community map that powers Deflock.org. That is a proxy for
the real install date, and an honest one has caveats:

- **OSM creation lags installation.** A camera exists before a volunteer maps
  it, so this timeline is a **lower bound** on when surveillance actually arrived.
- **Mapping campaigns create artificial spikes.** A volunteer can add a backlog
  of cameras in a single month; that spike reflects mapping activity, not
  installation activity.
- **This is not an official registry.** It is community-sourced documentation
  (Deflock.org / OpenStreetMap), not a government list.

The dates are approximate. The growth is real.
```

- [ ] Gate the island in `src/pages/blog/[...slug].astro`. Add the import and the conditional render. First add the import near the top frontmatter (after the existing imports):

```astro
import TimelineMap from '../../components/TimelineMap.astro';
```

- [ ] Then add a derived flag next to the existing `readTime` computation:

```astro
const hasTimelineMap = post.body?.includes('data-timeline-map') ?? false;
```

- [ ] Then render the island inside the `.prose` article, immediately after `<Content />` is closed but still inside `<article>` — locate the `<div class="prose prose-invert md:prose-lg max-w-none"><Content /></div>` block and change it to:

```astro
      <div class="prose prose-invert md:prose-lg max-w-none">
        <Content />
      </div>
      {hasTimelineMap && <TimelineMap />}
```

> Note: `[...slug].astro` emits the gated `<TimelineMap />` island right after the article content, but the island's boot script then **moves its `#tl-root` into the in-body `<div data-timeline-map>` marker** (see TimelineMap.astro). So the map renders exactly where the author placed the marker — between the intro and the methodology section — not after the whole body. This mirrors the existing `data-open-action` precedent (a script finds the in-body marker and acts on it in place) and needs **no MDX**. The island's `#tl-map` is where MapLibre mounts.

- [ ] Type-check and build to confirm the gated post compiles. Temporarily flip the post to `draft: false` so `getStaticPaths` includes it:

```
npx astro check --minimumSeverity error
```
Expected: no new errors.

- [ ] Browser-verify the embed. With the post temporarily at `draft: false`, run:

```
npm run dev
```
Browse `http://localhost:4321/blog/surveillance-timeline-map`.
- **Acceptance:**
  - The post renders through the normal blog pipeline (hero, prose, TOC); the map figure appears after the body with all DaisyUI chrome (National ⇄ SC `join`, play/pause `btn-circle`, primary `range`, "Replay intro").
  - Scrolling the map into view **starts the guided intro** (not on page load): OSD readout turns **amber**, the scrubber thumb travels, dots bloom in, the view **flies from national into SC** in the last stretch, then **holds** on SC while the OSD/count finish and the methodology line fades in.
  - After the intro, controls **light up** (OSD neutral), scrub works both directions, National ⇄ SC toggles framing, "Replay intro" re-runs it.
  - The `#tl-map` element carries `map-dark` and MapLibre's nav control is themed (not default white).

- [ ] Verify maplibre chunk reuse in a production build. Keep the post at `draft: false` through this check — `getStaticPaths` filters out drafts, so the post must stay `draft: false` to be built and share the chunk. (Restore `draft: true` in the later "Restore the scaffold" step, not here.) Then:

```
npm run build
```
Then inspect the emitted chunks:

```
node -e "const fs=require('fs'),p=require('path'); const dir='dist/_astro'; const files=fs.readdirSync(dir); const ml=files.filter(f=>/maplibre/i.test(f)); console.log('maplibre chunks:', ml); if(ml.length===0) throw new Error('no maplibre chunk found (chunk naming changed? check would false-pass)'); if(ml.length>1) throw new Error('maplibre chunk duplicated'); console.log('OK: single shared maplibre chunk');"
```
Expected: exactly one `maplibre*` chunk (`OK: single shared maplibre chunk`) — the homepage map and the blog island share it because the import specifiers match.

- [ ] Restore the scaffold to `draft: true` (so the unfinished post does not publish):

```
git diff --stat   # confirm only intended files changed
```
Edit `src/content/blog/surveillance-timeline-map.md` back to `draft: true`.

- [ ] Commit the embedding:

```
git add src/components/TimelineMap.astro src/styles/global.css src/pages/blog/[...slug].astro src/content/blog/surveillance-timeline-map.md
git commit -m "feat(timeline): DaisyUI island + marker-div embed gated by body check"
```

---

## Checkpoint 6 — Accessibility, reduced motion, and mobile

Verifies the reduced-motion static present-day SC view, keyboard operability, the 375px layout with no horizontal scroll, and the colorblind/brightness read. These are browser-verified against the spec's testing checklist (temporarily set the host post to `draft: false` for verification, then revert).

- [ ] **Reduced motion.** Run `npm run dev`; in devtools, emulate `prefers-reduced-motion: reduce` (Rendering panel). Reload `/blog/surveillance-timeline-map`.
  - **Acceptance:** **no autoplay, no fly-through**; the map loads showing the **present-day full network framed on South Carolina** (cutoff = latest month); the OSD shows the present month + total; **all controls remain usable** — scrub back through time, pan/zoom, and National is one toggle away; the "Replay intro" control is hidden (nothing to auto-replay). Nothing is disabled.

- [ ] **Keyboard operability.** With motion enabled and the intro finished (or skipped), Tab through the chrome.
  - **Acceptance:** focus reaches National, South Carolina, play/pause, the range slider, and Replay in order; the range slider moves the cutoff with arrow keys; each control shows the global `:focus-visible` red outline; the `#tl-map` is programmatically focusable (`tabindex="-1"`) but not a tab stop.

- [ ] **Mobile 375px.** In devtools device toolbar set width to 375px; reload.
  - **Acceptance:** **no horizontal page scroll**; chrome stacks (the range takes its own row, the join + buttons wrap); the guided intro still autoplays (motion-permitting); national-scale dots stay perceptible (mobile radius floor + stronger glow); one-finger drag scrolls the **page** past the map, two-finger pans/zooms the **map** (cooperative gestures; a brief hint overlay may show).

- [ ] **Colorblind + brightness.** In the Rendering panel, emulate `protanopia` and separately `grayscale`; scrub the timeline forward.
  - **Acceptance:** growth reads as **spreading brightness** even without hue and under protanopia. If it only reads in full color, raise glow luminance/opacity — `flareColor` stops toward brighter values (in `src/lib/timeline-format.ts`) and/or `glowRadius`/`circle-opacity` (in `src/scripts/map/layers/timeline-cameras.ts`) — architecture unchanged; re-verify.

- [ ] If any tuning edits were made during this checkpoint, commit them:

```
git add -A
git commit -m "fix(timeline): a11y/reduced-motion/mobile + brightness tuning per checkpoint-6"
```

- [ ] Ensure the host post is back to `draft: true` and confirm the working tree is clean:

```
git status --short
```
Expected: clean (or only the intended `draft: true` state committed).

---

## Checkpoint 7 — Optional / future (video export)

Per the spec, **not built in v1.** No tasks here — this is a documented deferral.

- [ ] Confirm the deferral is recorded (no code): the compact dated table (`public/timeline-cameras.json`, columnar `{lon,lat,m,dir}`) is deliberately **engine-agnostic** so the same rows can later drive an offline video export (a headless MapLibre or canvas renderer stepping the cutoff frame-by-frame) **without touching the extraction pipeline**. Nothing to implement now; note it in the PR's "future work."

---

## Finish: verification + PR

- [ ] Run the full unit-test suite and confirm green:

```
npm test
```
Expected: `PASS` for `scripts/build-timeline-data.test.mjs` and `src/lib/timeline-format.test.ts` alongside the existing suite; no failures.

- [ ] Run the project type-check once more:

```
npx astro check --minimumSeverity error
```
Expected: no new errors from any timeline file.

- [ ] Rebase/coordinate check before opening the PR: re-read the **Coordination note**. If `feature/live-camera-counter` has merged to `master`, rebase this branch onto it and re-express the workflow step in the counter branch's npm-script idiom (Node 22, after `npm run prebuild`). Re-run `npm test` after any rebase.

- [ ] Push and open the PR:

```
git push -u origin feature/surveillance-timeline-map
gh pr create --base master --title "feat: surveillance timeline map (blog-embedded)" --body "$(cat <<'EOF'
Animated blog-embedded MapLibre timeline: ~62k ALPR cameras bloom in by OSM
first-seen month from 2020 to today, guided intro flies national -> South
Carolina, then unlocks free exploration. Implements
docs/plans/2026-09-04-surveillance-timeline-map-design.md.

Pipeline change (COORDINATION): adds `public/timeline-cameras.json`, a
`scripts/build-timeline-data.mjs` step in `.github/workflows/refresh-camera-data.yml`,
and that file to the commit-if-changed set. The parallel `feature/live-camera-counter`
branch also rewrites this workflow (cron daily, Node 22, .ts scripts, npm ci +
prebuild). Land one first and rebase the other; if the counter lands first,
convert the timeline step to `npm run build-timeline-data` after `npm run prebuild`.

Host post `src/content/blog/surveillance-timeline-map.md` ships as `draft: true`
(editorial subject TBD) — finish the narrative before publishing.

Future work: the columnar dated table is engine-agnostic to enable an offline
video export later (not in this PR).
EOF
)"
```

- [ ] Label the PR/issue per repo convention (owned repo): if a tracking issue exists, ensure it carries exactly one of `autonomous-safe` / `design-input-needed`.

---

## Testing & verification summary (maps to the spec's Testing section)

- **Unit (vitest):** month encoding (YYYYMM), build determinism (byte-identical `serializeTable(encodeTable())`), graceful fallback (`chooseOutput` reuses committed), compact-encoding round-trip (`decodeTable(encodeTable())`), `parseDirection` parity; and the client helpers — `cutoffFilter`, `monthIndex` (linear index, year-boundary continuity), `flareColor` (ramp keyed on the linear month delta, year-boundary regression), `formatOsd` (`"Mar 2024 · 41,208 documented"`), `introCutoffAt` easing (linger/monotonic/lands-on-end).
- **Browser (dev server):** Checkpoint-1 placement gate (corridors, Upstate-heavy, no artifacts); render (glow/dot, hot-flare-then-cool, zoom radius + mobile floor, cone resolve with full-intensity center, grayscale/squint); basemap style (roads on, labels gated/muted); guided intro (visibility-triggered, OSD amber, scrubber-thumb progress, national→SC fly-through, held frame, interrupt, replay); embed (chunk reuse); reduced-motion static SC view; keyboard; 375px no-horizontal-scroll + cooperative gestures; protanopia/brightness.
- **Build inspection:** single shared maplibre chunk; workflow YAML parses with the timeline step present.
