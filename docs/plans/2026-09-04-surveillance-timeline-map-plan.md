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

A dependency-light Node build script bakes a compact, dated national camera table (`public/timeline-cameras.bin`, packed via the shared `src/lib/timeline-codec.ts`) **directly from OSM element history** (HeiGIT ohsome); the site fetches the `.bin`, **decodes it with the same codec**, and renders it through a **new unclustered MapLibre layer module** (its own GeoJSON source, `m ≤ cutoff` filter, zoom-scaled solid dot layer, high-zoom cone resolve) driven by a controller that owns the scrubber, DaisyUI chrome, and the visibility-triggered guided intro. The map is embedded in one dedicated blog post via the existing marker-div + gated-lazy-island precedent (no MDX), reusing `createMap` (`cooperativeGestures: true`) and `createConeImage`/`parseDirection` so the maplibre chunk is shared with the homepage map.

## Tech Stack

- **Astro 5** (`.astro` island, blog pipeline), **TypeScript** (client modules **and** the build script — esbuild-bundled and run via `npm run build-timeline-data`, the same idiom as `fetch-camera-data.ts` / `build-impact-stats.ts`, and it imports the shared `src/lib/timeline-codec.ts` so the Node encoder and the browser decoder share one `.bin` format).
- **MapLibre GL 5.x** (`maplibre-gl`) — reused via `src/scripts/map/core.ts`.
- **DaisyUI 5 `deflock` theme** + **Tailwind 4** for all chrome.
- **Vitest 4** (`npm test` → `vitest run`) for pure-logic TDD; **`npm run dev`** (`astro dev`, port 4321) for browser verification.
- **HeiGIT ohsome API** (network, no local binary) as the **sole source** of the dated rows (OSM element history), with a graceful reuse-last-committed-`.bin` fallback.

---

## Plan-level decisions (resolving the spec's open questions)

These resolve the design doc's "Open questions." The user may override any of them; each carries a one-line rationale.

1. **OSM extraction method → HeiGIT ohsome API** (`/elementsFullHistory/centroid`), the **sole source** of the dataset: every continental ALPR node ohsome returns across the region bboxes becomes one row (earliest `@validFrom` = first-seen month; latest version's centroid = position; latest version's tags → direction). The time-interval **end date is derived from ohsome's metadata temporal extent** (`GET /metadata`), not `today` (which 404s every region — ohsome's history data lags real time). Dense bboxes are **adaptively subdivided** into quadrants on request failure. *Rationale: `osmium` is confirmed absent on this machine and needs a multi-GB full-history extract; ohsome is purpose-built for element history and needs no local binary.* **Documented fallback:** if ohsome is unreachable/errors or resolves zero rows, reuse the last committed `public/timeline-cameras.bin` and exit 0 so the site build never breaks (`chooseOutput`). *Upgrade path noted: an `osmium` full-history extract in CI is the deterministic alternative later; output format is identical.*
1a. **Data source → ohsome-direct, NOT the DeFlock snapshot** (reverses the #118-retarget's "reuse the shared validator" decision). The build no longer reads `public/camera-data.json` or runs `assertValidCameraPayload` — the timeline does not consume the DeFlock snapshot anymore. *Rationale: the committed DeFlock snapshot is only the Southeast 20° CDN tile (bbox lon −100..−80, lat 20..40), which clips SC's own coast (Myrtle Beach entirely, Charleston partially) and covers no West Coast / Northeast. ohsome already returns all continental ALPR nodes (~130,602), so the timeline is built entirely from it — national AND fully SC.*
2. **Dataset encoding → compact BINARY via a shared codec** (`src/lib/timeline-codec.ts` → `public/timeline-cameras.bin`, ~1.37 MB for ~130,602 rows). Little-endian structure-of-arrays: a **16-byte header** (`TLC1` magic + `uint16` version + `uint32` count), then columns — `Int32` lon×1e5, `Int32` lat×1e5, `Uint16` direction (`0xFFFF` = null), `Uint8` month index from Jan 2020. Total = `16 + 11N` bytes. Coordinates round to **5 decimals** (~1.1 m) in fixed point; `m` is a **YYYYMM integer floored to 202001**; a null `dir` round-trips through the `0xFFFF`/`-1` sentinel; the OSM `id` is **omitted** (dots need lon/lat/m, cones need `dir`; no popup/OSM-link is in the timeline spec). *Rationale: the binary is materially smaller than columnar JSON, gzips further on the wire, and `decodeTimelineTable` yields typed arrays with no per-row JSON parse; defining the format in one shared module keeps the Node encoder and browser decoder in lockstep. This replaces the earlier columnar-parallel-arrays plan. Flooring `m` to 202001 (bucketing pre-2020 cameras into Jan 2020) honors the spec's ~Jan-2020 timeline start: the scrubber/intro derive their first stop from the data, so a data-level floor keeps them at 202001 with no sparse pre-2020 tail, and no separate UI clamp is needed.*
3. **SC subset → single national `.bin`, client-side filter** (no `timeline-cameras-sc.bin`). *Rationale: the binary lazy-loads on scroll and decodes cheaply, so a second artifact adds build/refresh/commit surface for marginal first-paint gain; SC framing is a camera-move + filter over the one table, exactly as the spec frames it.*
4. **Blog-embedding gate → body check** `post.body.includes('data-timeline-map')` in `[...slug].astro`; **no** `content.config.ts` schema change. *Rationale: surgical, zero schema surface, mirrors the existing `post.body` read for read-time.*
5. **Host-post subject → out of scope**; ship a `draft: true` scaffold post carrying the marker div + honest-methodology paragraph with placeholder editorial copy. *Rationale: the plan ships the mechanism; the editorial subject is the author's call, and `draft: true` keeps an unfinished post out of the build/sitemap. Browser verification temporarily flips it to `draft: false` locally, then reverts.*
6. **Intro pacing (durations/easing) → linger 3.0 s on the 2020 opening, ease-in-out-cubic advance over ~15 s, begin the national→SC `flyTo` (5 s) when the cutoff crosses `present − 18 months`, then a ~2 s held final frame** (counter rolls up, methodology line fades in). Total ≈ 22 s (< 25 s). *Rationale: matches the spec's shape (linger → accelerate → fly-through as SC fills → hold); every number is a named constant tunable after Checkpoint 1.*

---

## File structure

Every file to create or modify, mapped to its single responsibility (mirrors the spec's Components & files table).

| File | New/Mod | Single responsibility |
|---|---|---|
| `scripts/build-timeline-data.ts` | **New** | Build step + exported pure helpers (`monthInt`, `ohsomeEndDate`, `roundCoord`, `floorToTimelineStart`, `parseDirectionTag`, `reduceVersionsToRow`, `sortForDeterminism`, `normalizeRows`, `chooseOutput`). Queries OSM element history via ohsome (**sole source; no DeFlock snapshot, no `assertValidCameraPayload`**), reduces each node to `{lon,lat,m,dir}`, and encodes to `public/timeline-cameras.bin` via the shared codec. Guarded `main()` so the test can import helpers without running the fetch. esbuild-bundled + run via `npm run build-timeline-data`, exactly like `build-impact-stats.ts`. |
| `scripts/build-timeline-data.test.ts` | **New** | Vitest unit tests for the exported pure helpers: month encoding + UTC boundaries, `ohsomeEndDate`, Jan-2020 floor, `reduceVersionsToRow` (earliest-month + latest-position/direction), byte-identical determinism (via the shared codec), fallback selection over encoded bytes, `parseDirection` parity. |
| `src/lib/timeline-codec.ts` | **New** | Shared, dependency-free binary codec (`encodeTimelineTable` / `decodeTimelineTable`): the `.bin` on-disk format defined in one place — the Node build encodes, the browser client decodes into typed arrays. |
| `src/lib/timeline-codec.test.ts` | **New** | Vitest unit tests for the codec: round-trip (lon/lat to 1e-5, m, dir), the `TLC1` header + `16 + 11N` framing, empty-table + unaligned-buffer inputs, and bad-magic / bad-version validation. |
| `public/timeline-cameras.bin` | **New (generated)** | The baked dated dataset as a compact binary (`16 + 11N` bytes, ~1.37 MB for ~130,602 rows) via the shared codec (national; SC is a client-side filter). |
| `public/timeline-map-style.json` | **New (generated once)** | Dedicated basemap style derived from `map-style.json`: roads on; road-name + water labels off; city labels gated to high zoom and muted; state/country/other place labels off. |
| `src/lib/timeline-format.ts` | **New** | Pure client helpers: `cutoffFilter(m)` (MapLibre filter expr), `monthIndex(m)` (YYYYMM -> linear month index), `flareColor(cutoff)` (hot-flare-then-cool paint expr, keyed on the linear index), `formatOsd(m, count)` (`"Mar 2024 · 41,208 documented"`), `introCutoffAt(elapsedMs, months, opts)` (non-uniform easing). |
| `src/lib/timeline-format.test.ts` | **New** | Vitest unit tests for the pure client helpers (including `monthIndex`/`flareColor` year-boundary coverage). |
| `src/scripts/map/layers/timeline-cameras.ts` | **New** | Unclustered dated layer module: own GeoJSON source (from the decoded `.bin`, no clustering) + a **solid dot layer** (zoom-scaled radius, mobile radius floor, hot-flare-then-**solid-red** paint; **no persistent glow**) + high-zoom cone layer (full-intensity center) reusing `createConeImage`; imperative `setCutoff`/`fitTo` API. |
| `src/scripts/map/timeline-controller.ts` | **New** | Orchestration: scrubber state, play/pause timer, guided intro (cutoff + camera moves + held frame), reduced-motion branch, replay, DaisyUI chrome wiring, the two IntersectionObservers. |
| `src/components/TimelineMap.astro` | **New** | The blog island: DaisyUI-branded chrome markup (`join`/`btn`/`range`/`badge`/OSD) + load-ahead IntersectionObserver lazy-import + dataset fetch. Renders where `[data-timeline-map]` exists. |
| `src/content/blog/surveillance-timeline-map.md` | **New (draft scaffold)** | The host post: `draft: true` scaffold carrying narrative placeholder + honest-methodology paragraph + the `data-timeline-map` marker div. |
| `src/pages/blog/[...slug].astro` | **Mod** | Conditionally include the timeline island when `post.body.includes('data-timeline-map')`. |
| `src/styles/global.css` | **Mod** | Small timeline-only chrome tweaks not covered by DaisyUI + `.map-dark` (camera-OSD monospace/tabular readout, intro/live state classes). |
| `.github/workflows/refresh-camera-data.yml` | **Mod** | Add the `npm run build-timeline-data` step after `npm run build-impact-stats`; include `public/timeline-cameras.bin` in the commit-if-changed set. **See Coordination note.** |
| `package.json` | **Mod** | Add the `build-timeline-data` npm script (esbuild-bundle `scripts/build-timeline-data.ts` → `node_modules/.cache`, then run), mirroring `fetch-camera-data` / `build-impact-stats`. |
| `astro.config.mjs` | **No change** | es2022 target already set; dataset is a static `public/` asset (no proxy). |
| `src/pages/timeline-check.astro` | **Temp (not committed)** | Throwaway Checkpoint-1 placement-gate render; deleted before the checkpoint-1 commit. |
| `scripts/_gen-timeline-style.mjs` | **Temp (not committed)** | Throwaway one-shot style generator; run once, commit its JSON output, then delete. |

---

## Coordination note (READ BEFORE Checkpoint 1's workflow task and before opening the PR)

This work is isolated in the **`timeline-map`** worktree on **`feature/surveillance-timeline-map`**, which is branched off **`master` after #118 (`44ca37b`) already merged** — the daily-refreshed SC camera counter that rewrote the shared refresh pipeline into the form this plan targets:

- `.github/workflows/refresh-camera-data.yml`: cron **daily** (`0 11 * * *`); Node **22** with `cache: 'npm'`; an **`npm ci` + `npm run prebuild`** install; `npm run fetch-camera-data` / `npm run build-impact-stats` (esbuild-bundled `.ts`) in place of the old `node scripts/*.mjs` lines.
- `scripts/fetch-camera-data.ts` and `scripts/build-impact-stats.ts` are esbuild-bundled TS importing the shared `src/lib/sc-camera-count.ts` (payload validator + count logic), each run through an npm script that bundles into `node_modules/.cache` first.

**Consequence:** this plan is written **directly in that post-#118 idiom** — there is no earlier base to target and no rebase to defer. Checkpoint 1 adds `scripts/build-timeline-data.ts` (esbuild-bundled, importing the shared `src/lib/timeline-codec.ts` binary codec), a `build-timeline-data` npm script, and a `npm run build-timeline-data` step in the daily workflow **after `npm run build-impact-stats`**.

**Scope of shared surface:** the timeline build **no longer seeds from `public/camera-data.json`** — it sources its rows directly from OSM element history via ohsome — and writes only `public/timeline-cameras.bin` (new, no overlap with the counter's `camera-counts.json` / `impact-stats.json`). It touches `.github/workflows/refresh-camera-data.yml` and `package.json` additively (one workflow step, one npm script). **Flag the workflow + `public/` artifact + `package.json` changes in this branch's PR description** so any concurrent pipeline work can integrate cleanly.

---

## Checkpoint 1 — Build the REAL dated dataset and validate placement (GATE)

> **Status: DONE — gate PASSED (2026-09-04).** The national dataset is built
> **directly from ohsome** (no DeFlock-snapshot seed, no `assertValidCameraPayload`)
> and packed as a compact binary via the shared codec: **`public/timeline-cameras.bin`,
> ~1.37 MB, 130,602 rows, 100% dated**, full continental + SC-coast coverage,
> placement verified quantitatively and visually. First-seen by year: 2020: 72,
> 2021: 50, 2022: 258, 2023: 801, 2024: 6,638, 2025: 58,544, 2026: 64,239 (sparse
> pre-2024, surging in 2025–26). Sub-steps **1a–1c are complete and committed**
> (through `f28c0c4`); **1d (daily-refresh wiring) remains**. The code blocks below
> reflect the shipped reality.

**This checkpoint is a gate.** It builds `public/timeline-cameras.bin` directly from OSM element history (ohsome) and proves the placement matches truth (dots trace road corridors between cities; SC is Upstate-heavy; no geocoding artifacts). **Every later checkpoint assumes this gate passed.** Visual-tuning parameters (dot radius, flare timing, easing) may be adjusted based on what the real data looks like here, but the **architecture does not change**. If the real data does not tell the story, stop and revisit data/placement before building the render layer.

### 1a. Shared codec + tested build helpers  *(DONE — committed)*

Two modules are TDD'd here and committed: the dependency-free binary **codec**
(`src/lib/timeline-codec.ts`) that defines the `.bin` format for both the Node
encoder and the browser decoder, and the build script's exported **pure helpers**
(`scripts/build-timeline-data.ts`) that reduce ohsome element history to dated rows.

- **`src/lib/timeline-codec.ts` (+ `timeline-codec.test.ts`)** — `encodeTimelineTable`
  / `decodeTimelineTable`. Tests cover the round-trip (lon/lat to 1e-5, `m`, `dir`),
  the `TLC1` header + `16 + 11N` framing, empty-table and unaligned-buffer inputs,
  and bad-magic / bad-version validation.
- **`scripts/build-timeline-data.ts` (+ `build-timeline-data.test.ts`)** — the pure
  helpers `monthInt`, `ohsomeEndDate`, `roundCoord`, `floorToTimelineStart`,
  `parseDirectionTag`, `reduceVersionsToRow`, `sortForDeterminism`, `normalizeRows`,
  `chooseOutput`. Tests cover month encoding + UTC boundaries, `ohsomeEndDate` (incl.
  ohsome's non-standard `09:00Z` form), the Jan-2020 floor, `reduceVersionsToRow`
  (earliest-month + latest-position/direction, deletion fallback, order/dupe
  idempotence), `parseDirection` parity, byte-identical determinism through the
  shared codec, and `chooseOutput` fallback over encoded bytes.

Committed shared codec, `src/lib/timeline-codec.ts`:

```ts
/**
 * timeline-codec.ts — the SHARED, dependency-free codec for the surveillance
 * timeline camera table. The Node build (scripts/build-timeline-data.ts) encodes
 * the dated rows to public/timeline-cameras.bin with `encodeTimelineTable`; the
 * browser map client decodes them with `decodeTimelineTable`. Keeping both sides
 * on one codec means the on-disk format is defined in exactly one place.
 *
 * Format — a little-endian, structure-of-arrays packing of N rows
 * `{ lon, lat, m (YYYYMM), dir (degrees or null) }`:
 *
 *   Header (16 bytes):
 *     [0..3]   ASCII magic "TLC1"
 *     [4..5]   uint16 version (= 1)
 *     [6..7]   0 (pad)
 *     [8..11]  uint32 count N
 *     [12..15] 0 (pad — keeps the Int32 columns 4-byte aligned)
 *
 *   Columns, each length N, in this order (chosen so every typed-array view
 *   lands on a naturally aligned byte offset):
 *     1. lonE5  Int32  × N  at 16        — Math.round(lon * 1e5)
 *     2. latE5  Int32  × N  at 16 + 4N   — Math.round(lat * 1e5)
 *     3. dir    Uint16 × N  at 16 + 8N   — Math.round(direction) in [0,360];
 *                                          0xFFFF sentinel for null
 *     4. mIdx   Uint8  × N  at 16 + 10N  — (year-2020)*12 + (month-1) from m
 *
 *   Total = 16 + 11N bytes, padded to an even length when N is odd.
 *
 * The lon/lat/dir fixed-point rounding is the only lossy step: coordinates land
 * on a ~1.1 m grid (5 decimals) and directions on whole degrees. m survives
 * exactly for any month from 2020-01 onward (the timeline start the build floors
 * to). Encoding is a pure function of the input rows, so — given the build's
 * deterministic row sort — reruns produce byte-identical output.
 */

/** One camera row: current position, first-seen month, facing direction. */
export interface TimelineRow {
  lon: number;
  lat: number;
  /** First-seen month as a YYYYMM integer, e.g. 202403. */
  m: number;
  /** Facing direction in degrees [0,360], or null when unknown. */
  dir: number | null;
}

/** The decoded columns, as typed arrays for fast client-side consumption. */
export interface DecodedTimelineTable {
  lon: Float64Array;
  lat: Float64Array;
  /** YYYYMM per row, reconstructed from the stored month index. */
  m: Int32Array;
  /** Degrees per row; -1 where the source direction was null. */
  dir: Int16Array;
}

const MAGIC = 'TLC1';
const VERSION = 1;
const HEADER_BYTES = 16;
/** Null-direction sentinel stored in the Uint16 dir column. */
const DIR_NULL = 0xffff;
/** The timeline's base year — month index 0 is January of this year. */
const BASE_YEAR = 2020;

/**
 * Pack rows into the compact binary table. Coordinates are stored as
 * fixed-point Int32 (×1e5), directions as whole-degree Uint16 (0xFFFF for
 * null), and months as a Uint8 index from January 2020. The returned
 * Uint8Array owns a freshly allocated, exactly-sized buffer.
 */
export function encodeTimelineTable(rows: TimelineRow[]): Uint8Array {
  const n = rows.length;
  const unpadded = HEADER_BYTES + 11 * n;
  const total = unpadded + (unpadded % 2); // pad the tail to an even length
  const ab = new ArrayBuffer(total);
  const dv = new DataView(ab);

  // Header.
  dv.setUint8(0, MAGIC.charCodeAt(0));
  dv.setUint8(1, MAGIC.charCodeAt(1));
  dv.setUint8(2, MAGIC.charCodeAt(2));
  dv.setUint8(3, MAGIC.charCodeAt(3));
  dv.setUint16(4, VERSION, true);
  // bytes 6-7 stay 0 (pad)
  dv.setUint32(8, n, true);
  // bytes 12-15 stay 0 (pad, keeps the Int32 columns 4-byte aligned)

  // Columns. Offsets are all naturally aligned because the buffer starts at 0:
  // 16 % 4 == 0, (16+4N) % 4 == 0, (16+8N) % 2 == 0.
  const lonE5 = new Int32Array(ab, HEADER_BYTES, n);
  const latE5 = new Int32Array(ab, HEADER_BYTES + 4 * n, n);
  const dir = new Uint16Array(ab, HEADER_BYTES + 8 * n, n);
  const mIdx = new Uint8Array(ab, HEADER_BYTES + 10 * n, n);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    lonE5[i] = Math.round(r.lon * 1e5);
    latE5[i] = Math.round(r.lat * 1e5);
    dir[i] = r.dir == null ? DIR_NULL : Math.round(r.dir);
    const year = Math.floor(r.m / 100);
    const month = r.m % 100;
    mIdx[i] = (year - BASE_YEAR) * 12 + (month - 1);
  }

  return new Uint8Array(ab);
}

/**
 * Decode a binary table produced by `encodeTimelineTable`. Accepts an
 * ArrayBuffer or any Uint8Array (including a Node Buffer at an arbitrary
 * byteOffset — the bytes are copied to an aligned buffer when the source view
 * is not already aligned at offset 0). Reconstructs lon/lat from fixed-point,
 * dir with -1 for null, and m as a YYYYMM integer from the stored month index.
 * Throws on a wrong magic or unsupported version.
 */
export function decodeTimelineTable(buf: ArrayBuffer | Uint8Array): DecodedTimelineTable {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Int32Array/Uint16Array views require the byteOffset to be a multiple of the
  // element size. A view already anchored at offset 0 spanning its whole buffer
  // satisfies that (the header size and column ordering keep every column
  // aligned); otherwise copy to a fresh, exactly-sized, offset-0 buffer.
  const ab =
    view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      ? (view.buffer as ArrayBuffer)
      : (view.slice().buffer as ArrayBuffer);

  const dv = new DataView(ab);
  if (
    dv.getUint8(0) !== MAGIC.charCodeAt(0) ||
    dv.getUint8(1) !== MAGIC.charCodeAt(1) ||
    dv.getUint8(2) !== MAGIC.charCodeAt(2) ||
    dv.getUint8(3) !== MAGIC.charCodeAt(3)
  ) {
    throw new Error('timeline-codec: bad magic (expected TLC1)');
  }
  const version = dv.getUint16(4, true);
  if (version !== VERSION) {
    throw new Error(`timeline-codec: unsupported version ${version} (expected ${VERSION})`);
  }
  const n = dv.getUint32(8, true);

  const lonE5 = new Int32Array(ab, HEADER_BYTES, n);
  const latE5 = new Int32Array(ab, HEADER_BYTES + 4 * n, n);
  const dirU16 = new Uint16Array(ab, HEADER_BYTES + 8 * n, n);
  const mIdx = new Uint8Array(ab, HEADER_BYTES + 10 * n, n);

  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const m = new Int32Array(n);
  const dir = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = lonE5[i] / 1e5;
    lat[i] = latE5[i] / 1e5;
    const u = dirU16[i];
    dir[i] = u === DIR_NULL ? -1 : u;
    const idx = mIdx[i];
    const year = BASE_YEAR + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    m[i] = year * 100 + month;
  }

  return { lon, lat, m, dir };
}
```

Committed build script, `scripts/build-timeline-data.ts` (guarded `main()` so the
tests import the pure helpers without running the network fetch):

```ts
/**
 * build-timeline-data.ts — bakes the compact dated camera table
 * (public/timeline-cameras.bin) that drives the surveillance timeline map.
 *
 * The table is packed to a compact little-endian binary via the shared
 * timeline-codec (src/lib/timeline-codec.ts): the Node build encodes it here,
 * the browser map client decodes it with the same module. See that file for the
 * on-disk format. The binary is ~1.4 MB for ~130k rows (vs ~3.9 MB as JSON) and
 * decodes straight into typed arrays.
 *
 * The dataset is sourced ENTIRELY from OSM element history via the HeiGIT ohsome
 * API: every continental ALPR node ohsome returns across the REGIONS bboxes
 * becomes one output row. For each node —
 *   - m (first-seen month): the EARLIEST @validFrom across its versions,
 *     converted via monthInt and floored to the Jan-2020 timeline start;
 *   - lon/lat (position): the CURRENT centroid — the coordinates of the node's
 *     LATEST version (the version with the most recent @validFrom);
 *   - dir (direction): parsed from that latest version's tags.
 * A node with no dated/coordinated version is excluded (it cannot be placed).
 *
 * This deliberately does NOT intersect the local DeFlock snapshot
 * (public/camera-data.json): that snapshot is only the Southeast 20° CDN tile
 * (bbox lon -100..-80, lat 20..40), which clips SC's own coast (Myrtle Beach
 * entirely, Charleston partially) and covers no West Coast / Northeast. The
 * ohsome query already returns ALL continental ALPR nodes (~130k), so the table
 * is built directly from it — national AND fully SC.
 *
 * Graceful fallback (design "Extraction method — fallback"): if ohsome is
 * unreachable/errors or yields zero rows, reuse the last committed table and
 * exit 0 so the site build never breaks.
 *
 * The pure helpers below are exported and unit-tested in
 * build-timeline-data.test.ts; main() is guarded (invokedDirectly) so importing
 * this module for tests never runs the network fetch.
 *
 * Run via `npm run build-timeline-data`, which esbuild-bundles this TS before
 * executing it — the repo's fetch-camera-data / build-impact-stats pattern.
 * Because that bundle lands in node_modules/.cache, EVERY path is resolved from
 * process.cwd() (the repo root), NOT import.meta.url (which after bundling points
 * into node_modules/.cache and cannot locate public/). The guard's own
 * import.meta.url compare still holds: under the bundle it equals
 * process.argv[1]; under vitest it does not.
 *
 * parseDirectionTag mirrors parseDirection in
 * src/scripts/map/layers/cameras.ts — mirror any change there here.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeTimelineTable, decodeTimelineTable } from '../src/lib/timeline-codec.js';

// esbuild bundles this generator to node_modules/.cache before Node runs it, so
// import.meta.url resolves INTO node_modules and is useless for finding repo
// files. Resolve every path from process.cwd(), which npm sets to the repo root —
// identical to fetch-camera-data.ts / build-impact-stats.ts.
const ROOT = process.cwd();
const OUT_PATH = resolve(ROOT, 'public', 'timeline-cameras.bin');
// Spec: the timeline UI opens at ~Jan 2020. OSM has ALPR nodes predating 2020,
// so first-seen months are FLOORED to this stop and pre-2020 cameras are bucketed
// into it — the scrubber and intro then start at 202001 with no sparse pre-2020
// tail (see monthStops() in timeline-controller.ts, which relies on this floor).
const TIMELINE_START_MONTH = 202001;

// --- Types ---

/** One normalized camera row before binary encoding (see timeline-codec). */
export interface TimelineRow {
  lon: number;
  lat: number;
  m: number;
  dir: number | null;
}

/**
 * One version of an OSM node as returned by ohsome elementsFullHistory/centroid:
 * a Point Feature (geometry.coordinates = [lon, lat]) whose `properties` carry
 * the @metadata (`@osmId`, `@validFrom`, `@validTo`, ...) plus each OSM tag as a
 * top-level property (e.g. properties.direction) when `properties=metadata,tags`.
 */
export interface OhsomeFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

// --- Pure helpers (exported, unit-tested) ---

/** ISO timestamp -> YYYYMM integer, e.g. "2024-03-15T..." -> 202403. */
export function monthInt(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date: ${iso}`);
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

/**
 * Derive the ohsome time-interval END from the metadata temporal extent.
 * ohsome's underlying OSM-history data lags real time; its
 * extractRegion.temporalExtent.toTimestamp marks the last date that data covers
 * (e.g. "2026-07-27T09:00Z" — note the slightly non-standard "09:00Z" time).
 * Requesting a `time` end beyond it returns HTTP 404 for EVERY region, so use
 * this date slice as the interval end instead of today. Returns YYYY-MM-DD.
 */
export function ohsomeEndDate(toTimestamp: string): string {
  const date = String(toTimestamp).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Unparseable ohsome temporalExtent toTimestamp: ${toTimestamp}`);
  }
  return date;
}

/** Round a coordinate to 5 decimals (~1.1 m), stable across reruns. */
export function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Floor a YYYYMM month to the Jan-2020 timeline start: pre-2020 first-seen
 * months are bucketed into 202001 so the scrubber/intro open there with no
 * sparse pre-2020 tail (see TIMELINE_START_MONTH).
 */
export function floorToTimelineStart(m: number): number {
  return Math.max(TIMELINE_START_MONTH, m);
}

/** Faithful port of parseDirection (cameras.ts). Degrees, or null. */
export function parseDirectionTag(
  tags: Record<string, string> | null | undefined,
): number | null {
  if (!tags) return null;
  const raw = tags['direction'] || tags['camera:direction'];
  if (!raw) return null;
  const first = String(raw).split(';')[0].trim();
  if (/^\d+-\d+$/.test(first)) {
    const [a, b] = first.split('-').map(Number);
    return (a + b) / 2;
  }
  const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const upper = first.toUpperCase();
  if (upper in cardinals) return cardinals[upper];
  const deg = Number(first);
  return Number.isNaN(deg) ? null : deg;
}

/** True when a Feature carries a finite [lon, lat] Point centroid. */
function hasFinitePointCoords(
  f: OhsomeFeature,
): f is OhsomeFeature & { geometry: { coordinates: [number, number] } } {
  const c = f.geometry?.coordinates;
  return (
    Array.isArray(c) &&
    c.length >= 2 &&
    typeof c[0] === 'number' &&
    Number.isFinite(c[0]) &&
    typeof c[1] === 'number' &&
    Number.isFinite(c[1])
  );
}

/**
 * Extract the OSM tags from an ohsome feature's properties: every non-`@` key
 * (ohsome puts `@`-prefixed metadata like @osmId/@validFrom alongside the real
 * tags when properties=metadata,tags). Values are stringified so
 * parseDirectionTag sees a plain Record<string,string>.
 */
function tagsFromProperties(
  props: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!props) return tags;
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('@')) continue;
    if (v != null) tags[k] = String(v);
  }
  return tags;
}

/**
 * Reduce one OSM node's ohsome version features to a single timeline row:
 *   - m: EARLIEST @validFrom across ALL versions (the creation / first-seen),
 *     converted via monthInt and floored to the Jan-2020 timeline start;
 *   - lon/lat: the node's CURRENT centroid — the coords of its LATEST version
 *     (largest @validFrom) that carries a finite Point geometry;
 *   - dir: parseDirectionTag over that latest version's tags.
 * @validFrom is an ISO-8601 UTC ("...Z") timestamp, so string comparison is
 * chronological. Duplicate versions (a node straddling two REGIONS bboxes) are
 * idempotent under min/max, so grouping need not pre-dedupe them.
 * Returns null when the node has no version with a parseable @validFrom or no
 * version with valid coordinates (e.g. a since-deleted node) — such a node
 * cannot be placed on the timeline and is excluded.
 */
export function reduceVersionsToRow(features: OhsomeFeature[]): TimelineRow | null {
  let earliest: string | null = null; // min @validFrom across ALL versions
  let latest: (OhsomeFeature & { geometry: { coordinates: [number, number] } }) | null = null;
  let latestValidFrom: string | null = null; // max @validFrom among coord-bearing versions
  for (const f of features) {
    const vf = f.properties?.['@validFrom'];
    if (typeof vf !== 'string') continue;
    if (earliest === null || vf < earliest) earliest = vf;
    if (hasFinitePointCoords(f) && (latestValidFrom === null || vf > latestValidFrom)) {
      latestValidFrom = vf;
      latest = f;
    }
  }
  if (earliest === null || latest === null) return null;
  let m: number;
  try {
    m = floorToTimelineStart(monthInt(earliest));
  } catch {
    return null; // unparseable @validFrom -> cannot place
  }
  const [lon, lat] = latest.geometry.coordinates;
  return { lon, lat, m, dir: parseDirectionTag(tagsFromProperties(latest.properties)) };
}

/**
 * Deterministic order (month, then lon, lat, then dir) so reruns are
 * byte-identical. The final dir tie-break makes the ordering TOTAL: two rows
 * identical in month and 5-decimal-rounded coords but differing in direction
 * still sort deterministically instead of leaking their input order through.
 */
export function sortForDeterminism(rows: TimelineRow[]): TimelineRow[] {
  return [...rows].sort(
    (a, b) => a.m - b.m || a.lon - b.lon || a.lat - b.lat || (a.dir ?? -1) - (b.dir ?? -1),
  );
}

/**
 * Normalize rows for encoding: round coords to 5 decimals, then apply the
 * deterministic total order. Rounding BEFORE sorting keeps the byte output
 * stable — two rows whose raw coords differ only past the 5th decimal collapse
 * to the same key and can no longer leak their input order through the sort.
 * The shared codec re-applies the same fixed-point rounding on encode, so this
 * pre-rounding only fixes the ordering; it does not change the stored values.
 */
export function normalizeRows(rows: TimelineRow[]): TimelineRow[] {
  return sortForDeterminism(
    rows.map((r) => ({
      lon: roundCoord(r.lon),
      lat: roundCoord(r.lat),
      m: r.m,
      dir: r.dir ?? null,
    })),
  );
}

/**
 * Graceful-fallback selector over ENCODED bytes. Prefers the fresh build's
 * bytes; falls back to the last committed .bin when the fresh build is
 * unavailable (null) or empty; throws when neither is usable. main() only ever
 * hands a non-null `fresh` when the build resolved rows, so a non-empty buffer
 * here always carries rows.
 */
export function chooseOutput(
  fresh: Uint8Array | null,
  lastCommitted: Uint8Array | null,
): { bytes: Uint8Array; reused: boolean } {
  if (fresh && fresh.length > 0) return { bytes: fresh, reused: false };
  if (lastCommitted && lastCommitted.length > 0) return { bytes: lastCommitted, reused: true };
  throw new Error('Timeline build produced no rows and no committed table to fall back to');
}

// --- OSM ALPR dataset (ohsome) ---

const OHSOME_URL = 'https://api.ohsome.org/v1/elementsFullHistory/centroid';
const OHSOME_METADATA_URL = 'https://api.ohsome.org/v1/metadata';
// ALPR nodes in OSM. This full-history query is the SOLE source of the dataset:
// every node it returns across REGIONS becomes one timeline row.
const OHSOME_FILTER = 'man_made=surveillance and surveillance:type=ALPR and type:node';
// Coarse macro-bboxes covering the lower 48 (west,south,east,north). Batching
// bounds each response and respects ohsome rate limits. Dense regions (the East
// Coast especially) return a full-history response too large for one request, so
// fetchTile adaptively subdivides a bbox into quadrants when a request fails.
const REGIONS: [number, number, number, number][] = [
  [-125.0, 32.0, -114.0, 49.5], // Pacific + Mountain NW
  [-114.0, 31.0, -102.0, 49.5], // Mountain
  [-102.0, 25.0, -90.0, 49.5],  // Plains
  [-90.0, 24.0, -80.0, 40.0],   // SE + Gulf
  [-90.0, 40.0, -80.0, 49.5],   // Great Lakes
  [-80.0, 24.0, -66.9, 40.0],   // Southeast Atlantic (incl. SC)
  [-80.0, 40.0, -66.9, 49.5],   // Northeast
];
// Per-request wall-clock cap: a stalled/oversized full-history request aborts
// into the split path (fetchTile) instead of hanging the whole build.
const OHSOME_TIMEOUT_MS = 120_000;
// A failing bbox is split into quadrants and retried; this bounds the recursion
// (4^5 = up to 1024 leaf tiles for a single region) so a persistent failure
// surfaces as a throw -> graceful fallback, rather than an infinite split.
const MAX_SPLIT_DEPTH = 5;
// Politeness gap between HTTP requests so adaptive subdivision stays within
// ohsome's public rate limits.
const OHSOME_REQUEST_GAP_MS = 250;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch the ohsome history's temporal-extent end date once, from the metadata
 * endpoint. Its data lags real time, so the `time` interval END must be this
 * date — not today, which 404s every region (see ohsomeEndDate). Throws on a
 * failed fetch or missing field so main()'s try/catch routes to the graceful
 * fallback rather than silently querying an out-of-range end.
 */
async function fetchOhsomeEndDate(): Promise<string> {
  const res = await fetch(OHSOME_METADATA_URL);
  if (!res.ok) throw new Error(`ohsome metadata responded ${res.status}`);
  const json = (await res.json()) as {
    extractRegion?: { temporalExtent?: { toTimestamp?: unknown } };
  };
  const toTimestamp = json.extractRegion?.temporalExtent?.toTimestamp;
  if (typeof toTimestamp !== 'string') {
    throw new Error('ohsome metadata missing extractRegion.temporalExtent.toTimestamp');
  }
  return ohsomeEndDate(toTimestamp);
}

async function fetchRegionFeatures(
  bbox: [number, number, number, number],
  endDate: string,
  featuresById: Map<number, OhsomeFeature[]>,
): Promise<void> {
  const body = new URLSearchParams({
    bboxes: bbox.join(','),
    // ohsome requires exactly two comma-separated ISO-8601 timestamps for a
    // start..end interval. The slash form (2016-01-01/<end>) returns HTTP 400
    // ("Wrong time parameter. You need to give exactly two ISO-8601 conform
    // timestamps."), so use the comma form. The END is the metadata temporal
    // extent (endDate), NOT today: today lies beyond the underlying osh-data's
    // coverage and 404s every region.
    time: `2016-01-01,${endDate}`,
    filter: OHSOME_FILTER,
    // metadata (@osmId/@validFrom/@validTo/...) AND tags (direction,
    // camera:direction, ...) as top-level feature properties, so one query
    // yields both the dates+position and the direction the row needs.
    properties: 'metadata,tags',
  });
  await sleep(OHSOME_REQUEST_GAP_MS); // politeness gap before each request
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OHSOME_TIMEOUT_MS);
  let json: { features?: OhsomeFeature[] };
  try {
    const res = await fetch(OHSOME_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ohsome responded ${res.status} for bbox ${bbox.join(',')}`);
    // A throw here (bad status, or a truncated/aborted body that fails to parse)
    // leaves featuresById untouched — the parse is all-or-nothing — so fetchTile
    // can safely split-and-refetch the bbox without partial/double counting.
    json = (await res.json()) as { features?: OhsomeFeature[] };
  } finally {
    clearTimeout(timer);
  }
  for (const f of json.features ?? []) {
    const osmId = f.properties?.['@osmId']; // e.g. "node/51968727"
    if (typeof osmId !== 'string') continue;
    const id = Number(osmId.split('/')[1]);
    if (!Number.isFinite(id)) continue;
    // Group every version of a node by id. A node near a bbox edge appears in
    // multiple tile responses; the duplicate versions are idempotent under
    // reduceVersionsToRow's min/max, so no pre-dedupe is needed.
    const list = featuresById.get(id);
    if (list) list.push(f);
    else featuresById.set(id, [f]);
  }
}

/**
 * Fetch one bbox, subdividing into quadrants on failure. A dense full-history
 * bbox (the East Coast especially) can return a response too large for a single
 * request — the socket drops mid-body or the request times out. Splitting into
 * four smaller bboxes shrinks each response (and each also covers a transient
 * blip by re-requesting), recursing until it succeeds or MAX_SPLIT_DEPTH is hit
 * (then the error propagates to main()'s graceful fallback). featuresById is
 * global across every tile, so a node's versions are grouped even when they land
 * in different tiles (bbox edges, or a relocated camera).
 */
async function fetchTile(
  bbox: [number, number, number, number],
  endDate: string,
  featuresById: Map<number, OhsomeFeature[]>,
  depth = 0,
): Promise<void> {
  try {
    await fetchRegionFeatures(bbox, endDate, featuresById);
  } catch (err) {
    if (depth >= MAX_SPLIT_DEPTH) throw err;
    const [w, s, e, n] = bbox;
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    const quads: [number, number, number, number][] = [
      [w, s, mx, my],
      [mx, s, e, my],
      [w, my, mx, n],
      [mx, my, e, n],
    ];
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`    splitting ${bbox.join(',')} (depth ${depth}) after: ${reason}`);
    for (const q of quads) await fetchTile(q, endDate, featuresById, depth + 1);
  }
}

/**
 * Read the last committed .bin as raw bytes for the graceful fallback. Returns
 * the bytes (not a decoded table) so the fallback path can reuse them verbatim;
 * a missing or empty file yields null.
 */
function readCommitted(): Uint8Array | null {
  if (!existsSync(OUT_PATH)) return null;
  try {
    const buf = readFileSync(OUT_PATH);
    return buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const featuresById = new Map<number, OhsomeFeature[]>();
  let fresh: Uint8Array | null = null;
  try {
    // ohsome's OSM-history data lags real time; derive the interval END from the
    // metadata temporal extent once, up front. Using today would 404 every
    // region (the end lies beyond the underlying osh-data's coverage).
    const endDate = await fetchOhsomeEndDate();
    console.log(`ohsome history extent ends ${endDate}; querying 2016-01-01..${endDate}`);
    for (const bbox of REGIONS) {
      await fetchTile(bbox, endDate, featuresById);
      console.log(`  ohsome ${bbox.join(',')}: ${featuresById.size} nodes so far`);
    }
    console.log(`Loaded ${featuresById.size} ALPR nodes from ohsome history`);
    const rows: TimelineRow[] = [];
    for (const versions of featuresById.values()) {
      const row = reduceVersionsToRow(versions);
      if (row) rows.push(row); // undated / coordinate-less -> excluded
    }
    // Only encode when we resolved rows; an empty build leaves `fresh` null so
    // chooseOutput routes to the committed-table fallback rather than writing an
    // empty 16-byte header.
    fresh = rows.length > 0 ? encodeTimelineTable(normalizeRows(rows)) : null;
    console.log(`Resolved ${rows.length}/${featuresById.size} nodes to dated rows`);
  } catch (err) {
    console.error('ohsome dataset build failed; will fall back if possible:', err);
    fresh = null;
  }

  const { bytes, reused } = chooseOutput(fresh, readCommitted());
  if (reused) console.warn('Reusing the last committed timeline table (fresh build unavailable).');
  writeFileSync(OUT_PATH, Buffer.from(bytes));
  // Decode the bytes we actually wrote to report the shipped row count + range.
  const { m } = decodeTimelineTable(bytes);
  console.log(
    `Wrote ${OUT_PATH}: ${m.length} rows, months ${m[0]}..${m[m.length - 1]}`,
  );
}

// Guard: run main() only when executed directly (the esbuild bundle in
// node_modules/.cache), never when vitest imports this module for the pure
// helpers. A throw (validation failure, or fresh+committed both empty) exits
// non-zero so the refresh job fails rather than committing a corrupt table.
const invokedDirectly =
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [x] Run the codec + build-helper tests and confirm they **PASS**:

```
npx vitest run src/lib/timeline-codec.test.ts scripts/build-timeline-data.test.ts
```
Expected: `PASS` for both, all describe blocks green (codec round-trip / `TLC1` header-framing / bad-magic + bad-version validation; and monthInt, ohsomeEndDate, parseDirectionTag, reduceVersionsToRow, byte-identical determinism, chooseOutput fallback).

- [x] Add the `build-timeline-data` npm script to `package.json` (esbuild-bundle the TS, then run it — the same idiom as `fetch-camera-data` / `build-impact-stats`), in the `"scripts"` block after `"build-impact-stats"`:

```json
    "build-timeline-data": "esbuild scripts/build-timeline-data.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/build-timeline-data.mjs && node node_modules/.cache/build-timeline-data.mjs",
```

- [x] Committed (across `3c4e78f`…`3ba431e`): the shared codec + its test, the build script + its test, and the npm script — including the later refactors that made the build **ohsome-direct** (`e098fb4`), derived the ohsome end date from metadata (`dd25f7f`), added the total-determinism tie-break + Jan-2020 floor (`ca36f23`), and packed the table as the compact **binary** via the codec (`3ba431e`):

```
git add scripts/build-timeline-data.ts scripts/build-timeline-data.test.ts src/lib/timeline-codec.ts src/lib/timeline-codec.test.ts package.json
git commit -m "feat(timeline): dated-table build script + tested encode/fallback helpers"
```

### 1b. Build the real dataset  *(DONE)*

- [x] Generate the real dated table (network — hits ohsome):

```
npm run build-timeline-data
```
Expected: `ohsome history extent ends <YYYY-MM-DD>; querying 2016-01-01..<end>`, per-region `ohsome … nodes so far` (with occasional `splitting …` lines when a dense bbox is subdivided into quadrants), `Loaded ~130k ALPR nodes from ohsome history`, `Resolved N/… nodes to dated rows`, and `Wrote …/public/timeline-cameras.bin: 130602 rows, months 202001..2026xx` (the first month is `202001` because pre-2020 first-seen dates are floored to the Jan-2020 timeline start). If ohsome is unreachable it logs the fallback warning instead — in that case retry later; the gate needs a real fresh build.

- [x] Sanity-check the artifact size and shape (decode the binary header + month column inline):

```
node -e "const fs=require('fs');const b=fs.readFileSync('./public/timeline-cameras.bin');const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);const magic=String.fromCharCode(b[0],b[1],b[2],b[3]);const n=dv.getUint32(8,true);const mOff=16+10*n;const yrs={};for(let i=0;i<n;i++){const y=2020+Math.floor(b[mOff+i]/12);yrs[y]=(yrs[y]||0)+1;}console.log('magic',magic,'rows',n,'bytes',b.length);console.log('by year',yrs);"
```
Expected: `magic TLC1`, `rows 130602`, `bytes 1436638` (= `16 + 11N`, padded to an even length), and a by-year histogram that **starts at 2020** (earlier cameras floored into Jan 2020): `{ 2020: 72, 2021: 50, 2022: 258, 2023: 801, 2024: 6638, 2025: 58544, 2026: 64239 }` — genuinely sparse pre-2024, surging in 2025–26.

### 1c. Validate placement against truth (THE GATE)

- [x] Quantitative check — Upstate-heavy SC, no `(0,0)` / degenerate coords, plausible national spread (decode the lon/lat columns via DataView, which is alignment-safe on a Node Buffer):

```
node -e "const fs=require('fs');const b=fs.readFileSync('./public/timeline-cameras.bin');const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);const n=dv.getUint32(8,true);let sc=0,ups=0,zero=0;for(let i=0;i<n;i++){const lon=dv.getInt32(16+4*i,true)/1e5,lat=dv.getInt32(16+4*n+4*i,true)/1e5;if(lon===0&&lat===0)zero++;const inSC=lat>=32.0&&lat<=35.3&&lon>=-83.4&&lon<=-78.4;if(inSC){sc++;if(lat>=34.4&&lon<=-81.7)ups++;}}console.log('rows',n,'SC rows',sc,'Upstate share',(100*ups/sc).toFixed(1)+'%','zero-coord rows',zero);"
```
Acceptance (**passed**): `SC rows` is a few thousand (same order as `impact-stats.json` `scTotal`); `Upstate share` is clearly disproportionate (the Greenville/Spartanburg/Anderson corner holds a large fraction, matching known deployment); `zero-coord rows` is `0`. If any fails, stop and fix the data/extraction before proceeding.

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
      import { decodeTimelineTable } from '../lib/timeline-codec.js';
      const t = decodeTimelineTable(await (await fetch('/timeline-cameras.bin')).arrayBuffer());
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

- [x] **Gate acceptance (visual) — PASSED.** Confirmed against the spec's truth check:
  - Dots **trace road/interstate corridors between cities** (e.g. along I-85/I-26 in the Upstate, corridors between metros), **not** tidy metro-only blobs.
  - Zoomed to SC, density is **Upstate-heavy** (Greenville region markedly denser than the Lowcountry).
  - **No geocoding artifacts**: no grid-snapped rows, no dense stack at a single point, no dots in the ocean or at nominal centroids.

- [x] Removed the throwaway page:

```
rm src/pages/timeline-check.astro
```

- [x] Committed the validated dataset (`f28c0c4`):

```
git add public/timeline-cameras.bin
git commit -m "feat(timeline): commit national dated dataset (checkpoint-1 gate passed)"
```

### 1d. Wire the daily refresh (piggyback)  *(REMAINING — not yet committed)*

> **Status:** the workflow on this branch does **not** yet carry the timeline step
> (as of the gate commit `f28c0c4`); this is the one part of Checkpoint 1 still to
> do. The `build-timeline-data` npm script already exists (Checkpoint 1a); here you
> only add its `- run:` step and the `.bin` to the commit set. A small binary delta
> is cheap, so the daily cadence is unchanged.

> **Coordination:** the base already carries #118's post-refactor workflow — daily cron, Node 22, `npm ci` + `npm run prebuild`, bundled-`.ts` npm scripts. See the Coordination note.

- [ ] In `.github/workflows/refresh-camera-data.yml`, add the timeline build step after the `npm run build-impact-stats` run:

```yaml
      - run: npm run build-impact-stats
      - run: npm run build-timeline-data
```

- [ ] In the same file, add `public/timeline-cameras.bin` to both the `git diff --quiet` guard and the `git add` in the "Commit if data changed" step:

```yaml
          if git diff --quiet public/camera-data.json public/camera-counts.json public/timeline-cameras.bin && [ "$impact_changed" = "0" ]; then
            echo "No meaningful data changes; skipping commit."
          else
            git add public/camera-data.json public/camera-counts.json public/timeline-cameras.bin src/data/impact-stats.json
            git commit -m "chore: refresh camera data + impact stats + timeline"
            git push
          fi
```

- [ ] Confirm the workflow YAML still parses (no tabs, valid structure):

```
node -e "const y=require('fs').readFileSync('.github/workflows/refresh-camera-data.yml','utf8'); if(y.includes('\t'))throw new Error('tab in YAML'); console.log('ok, timeline step present:', y.includes('npm run build-timeline-data'));"
```
Expected: `ok, timeline step present: true`.

- [ ] Commit the refresh wiring:

```
git add .github/workflows/refresh-camera-data.yml
git commit -m "ci(timeline): build the dated table in the daily camera refresh"
```

---

## Checkpoint 2 — Rendering layer (unclustered dated layer module)

Builds `src/scripts/map/layers/timeline-cameras.ts`: its own GeoJSON source (from the decoded `.bin`, no clustering), a **solid dot layer** with zoom-scaled radius and the hot-flare-then-**solid-red** paint (**no persistent glow**), a high-zoom cone layer with full-intensity centers, and the `setCutoff`/`fitTo` API. Pure helpers (`cutoffFilter`, `formatOsd`) are TDD'd first; the render itself is browser-verified.

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
 * tile-loader): the full decoded dataset is loaded once via setData at init, and
 * playback only updates a cheap filter/paint — never setData per tick. No
 * clustering at any zoom (clustering would destroy the appear-over-time bloom).
 *
 * Layers (bottom to top):
 *   - timeline-dots : hard, small, SOLID-RED core; hot-flare-then-cool by recency
 *                     (white/amber only for a just-arrived dot, then solid red),
 *                     source-over, filtered m <= cutoff. NO persistent glow layer
 *                     (2026-09-04 dot-styling decision): colorblind / dim-screen
 *                     legibility comes from bright solid red + dot SIZE, not a halo,
 *                     and an additive white pile-up in dense metros is rejected.
 *   - timeline-cones: high-zoom directional cones (icon-rotate from baked dir),
 *                     full-intensity center dot preserved. Same m <= cutoff.
 *
 * Radius is zoom-interpolated with a MOBILE FLOOR (<=375px viewports get larger
 * low-zoom radii so national dots stay perceptible on a phone — size, not glow).
 *
 * The table is the codec's DecodedTimelineTable (typed arrays; dir is -1 where the
 * source direction was null — see src/lib/timeline-codec.ts).
 */

import maplibregl from 'maplibre-gl';
import { createConeImage } from './cameras.js';
import { cutoffFilter, flareColor, monthIndex } from '../../../lib/timeline-format.js';
import type { DecodedTimelineTable } from '../../../lib/timeline-codec.js';

/** The client consumes the codec's decoded typed-array table directly. */
export type TimelineTable = DecodedTimelineTable;

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
 *   hasDir  — whether a real direction is known (gates the cone layer). The codec
 *             stores a null direction as -1, so `dir >= 0` means "known".
 */
function tableToGeoJSON(t: TimelineTable): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < t.m.length; i++) {
    const hasDir = t.dir[i] >= 0; // codec: -1 sentinel = no direction
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lon[i], t.lat[i]] },
      properties: {
        m: t.m[i],
        mi: monthIndex(t.m[i]),
        dir: hasDir ? t.dir[i] : 0,
        hasDir,
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

  // Zoom-scaled radius. Mobile floors the national end so dots stay visible —
  // SIZE carries legibility at national scale (there is no glow layer to lean on).
  const dotRadius = mobile
    ? ['interpolate', ['exponential', 1.4], ['zoom'], 3, 2.6, 7, 3.6, 11, 6, 14, 9]
    : ['interpolate', ['exponential', 1.4], ['zoom'], 3, 1.6, 7, 2.6, 11, 5, 14, 8];

  // Solid dot — hard core; hot-flare-then-SOLID-RED color (white/amber only for a
  // just-arrived dot, keyed on recency in flareColor); source-over, full opacity.
  // NO persistent glow layer: the 2026-09-04 dot-styling decision reserves
  // white/brightness for the transient arrival flare and rejects an additive glow
  // that would turn dense metros white.
  map.addLayer({
    id: 'timeline-dots',
    type: 'circle',
    source: 'timeline',
    filter,
    paint: {
      'circle-color': flareColor(opts.cutoff),
      'circle-radius': dotRadius as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
      'circle-opacity': 1,
    },
  });

  // Cones at high zoom only (>= CONE_MIN_ZOOM). ACCEPTED DEVIATION from the
  // spec's "cones replace dots": the dot layer is intentionally NOT capped with
  // a maxzoom, so above the threshold cones OVERLAY the dots rather than
  // replacing them. Rationale: (1) no-direction cameras have no cone, so
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
      map.setFilter('timeline-dots', f);
      map.setFilter('timeline-cones', ['all', f, ['get', 'hasDir']] as unknown as maplibregl.FilterSpecification);
      map.setPaintProperty('timeline-dots', 'circle-color', flareColor(cutoff));
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
> `timeline-dots` uncapped and lets `timeline-cones` (minzoom
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
git commit -m "feat(timeline): unclustered dated layer module (solid dot + cone, cutoff API)"
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
  import { decodeTimelineTable } from '../lib/timeline-codec.js';
  const table = decodeTimelineTable(await (await fetch('/timeline-cameras.bin')).arrayBuffer());
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
  - Dots are **bright, solid surveillance red** on the dark ground (source-over — overlaps deepen to redder red, **never white**); dead-dark everywhere else. No persistent glow layer.
  - Advancing the cutoff **adds dots**; newly-crossed dots **flare hot (near-white/amber) then cool to solid red** over a few months of advance — growth stays visible even inside already-red metros. White appears only on the transient per-dot arrival flare.
  - Dot radius **shrinks when zoomed out, grows when zoomed in**; at ≤375px (resize the window / device toolbar) national dots stay perceptible (mobile size floor).
  - Zooming past ~z13 into a town **resolves dots into red cones** that point (icon-rotate); the **cone center dot stays full-intensity** (not calmer than the national view).
  - **Grayscale + squint test:** with the page desaturated (devtools Rendering → emulate `grayscale`) and/or eyes squinted, advancing the cutoff still reads as **spreading red**. Legibility comes from bright solid red + dot **size**, not a glow — if it only reads in full color, raise the dot brightness/size in `flareColor`/`dotRadius` (architecture unchanged).

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
 * every `m` to 202001 (build-timeline-data.ts, TIMELINE_START_MONTH), so
 * months[0] is the spec's ~Jan-2020 start and the scrubber/intro open there
 * with no sparse pre-2020 tail — no extra clamp is needed here.
 */
function monthStops(table: TimelineTable): number[] {
  return [...new Set(table.m)].sort((a, b) => a - b);
}

/** Cumulative count of cameras with m <= cutoff (real-scale readout). */
function cumulativeCount(sortedMonths: ArrayLike<number>, cutoff: number): number {
  // sortedMonths is table.m (an Int32Array) already sorted ascending — the codec
  // preserves the build's deterministic ascending-by-month row order.
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
      const { decodeTimelineTable } = await import('../lib/timeline-codec.js');
      // Fetch the compact binary as an ArrayBuffer and decode it into typed arrays
      // (no per-row JSON parse). See src/lib/timeline-codec.ts for the format.
      const table = decodeTimelineTable(await (await fetch('/timeline-cameras.bin')).arrayBuffer());

      const mobile = window.matchMedia('(max-width: 375px)').matches;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // table.m is an Int32Array sorted ascending (the build's deterministic row
      // sort, preserved by the codec), so read the ends by index. Do NOT use
      // Math.max/min(...table.m): spreading a ~130k-and-growing array as call
      // arguments exceeds Safari's ~65k argument limit and throws RangeError.
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
  - **Acceptance:** **no horizontal page scroll**; chrome stacks (the range takes its own row, the join + buttons wrap); the guided intro still autoplays (motion-permitting); national-scale dots stay perceptible (mobile dot-radius floor — size, not glow); one-finger drag scrolls the **page** past the map, two-finger pans/zooms the **map** (cooperative gestures; a brief hint overlay may show).

- [ ] **Colorblind + brightness.** In the Rendering panel, emulate `protanopia` and separately `grayscale`; scrub the timeline forward.
  - **Acceptance:** growth reads as **spreading red** even without hue and under protanopia. Legibility comes from bright solid red + dot **size**, not a glow. If it only reads in full color, brighten the dots — `flareColor`'s cooled-red stop toward a brighter value (in `src/lib/timeline-format.ts`) and/or a larger `dotRadius` (in `src/scripts/map/layers/timeline-cameras.ts`) — architecture unchanged; re-verify. Do **not** add a persistent glow.

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

- [ ] Confirm the deferral is recorded (no code): the compact dated table (`public/timeline-cameras.bin`, `{lon,lat,m,dir}` rows via the shared `timeline-codec.ts`) is deliberately **engine-agnostic** so the same rows can later drive an offline video export (a headless MapLibre or canvas renderer stepping the cutoff frame-by-frame) **without touching the extraction pipeline**. Nothing to implement now; note it in the PR's "future work."

---

## Finish: verification + PR

- [ ] Run the full unit-test suite and confirm green:

```
npm test
```
Expected: `PASS` for `src/lib/timeline-codec.test.ts`, `scripts/build-timeline-data.test.ts`, and `src/lib/timeline-format.test.ts` alongside the existing suite; no failures.

- [ ] Run the project type-check once more:

```
npx astro check --minimumSeverity error
```
Expected: no new errors from any timeline file.

- [ ] Coordination check before opening the PR: re-read the **Coordination note**. This branch already targets the post-#118 pipeline idiom (daily cron, Node 22, bundled-`.ts` npm scripts) that is live on `master`, so no rebase or workflow-step retarget is pending. Just confirm `.github/workflows/refresh-camera-data.yml` and `package.json` have not drifted from that base since this branch started; if you integrate any such change, re-run `npm test`.

- [ ] Push and open the PR:

```
git push -u origin feature/surveillance-timeline-map
gh pr create --base master --title "feat: surveillance timeline map (blog-embedded)" --body "$(cat <<'EOF'
Animated blog-embedded MapLibre timeline: ~130,602 ALPR cameras bloom in by OSM
first-seen month from 2020 to today, guided intro flies national -> South
Carolina, then unlocks free exploration. Implements
docs/plans/2026-09-04-surveillance-timeline-map-design.md.

Data: the dated table is built DIRECTLY from OSM element history (HeiGIT ohsome),
not seeded from the DeFlock CDN snapshot — the committed snapshot is only the
Southeast 20-degree tile and clips SC's coast, so ohsome gives a true national +
full-SC dataset (~130,602 rows, 100% dated). It ships as a compact binary
(`public/timeline-cameras.bin`, ~1.37 MB) via a shared codec
(`src/lib/timeline-codec.ts`) that the browser decodes.

Pipeline change: adds a `build-timeline-data` npm script and a
`npm run build-timeline-data` step (after `npm run build-impact-stats`) in
`.github/workflows/refresh-camera-data.yml`, plus `public/timeline-cameras.bin`
in the commit-if-changed set. The build script is esbuild-bundled TS
(`scripts/build-timeline-data.ts`) importing the shared `src/lib/timeline-codec.ts`,
matching the existing `fetch-camera-data` / `build-impact-stats` scripts on the
daily, Node-22 refresh already on `master`.

Host post `src/content/blog/surveillance-timeline-map.md` ships as `draft: true`
(editorial subject TBD) — finish the narrative before publishing.

Future work: the binary dated table is engine-agnostic to enable an offline
video export later (not in this PR).
EOF
)"
```

- [ ] Label the PR/issue per repo convention (owned repo): if a tracking issue exists, ensure it carries exactly one of `autonomous-safe` / `design-input-needed`.

---

## Testing & verification summary (maps to the spec's Testing section)

- **Unit (vitest):** the shared codec — round-trip (`decodeTimelineTable(encodeTimelineTable())`), `TLC1` header + `16 + 11N` framing, unaligned-buffer + empty-table inputs, bad-magic/bad-version validation; the build helpers — month encoding (YYYYMM), `ohsomeEndDate`, Jan-2020 floor, `reduceVersionsToRow` (earliest-month + latest-position/direction), byte-identical determinism (via the codec), graceful fallback (`chooseOutput` reuses committed bytes), `parseDirection` parity; and the client helpers — `cutoffFilter`, `monthIndex` (linear index, year-boundary continuity), `flareColor` (ramp keyed on the linear month delta, year-boundary regression), `formatOsd` (`"Mar 2024 · 41,208 documented"`), `introCutoffAt` easing (linger/monotonic/lands-on-end).
- **Browser (dev server):** Checkpoint-1 placement gate (corridors, Upstate-heavy, no artifacts); render (solid dot, hot-flare-then-solid-red, no persistent glow, zoom radius + mobile size floor, cone resolve with full-intensity center, grayscale/squint); basemap style (roads on, labels gated/muted); guided intro (visibility-triggered, OSD amber, scrubber-thumb progress, national→SC fly-through, held frame, interrupt, replay); embed (chunk reuse); reduced-motion static SC view; keyboard; 375px no-horizontal-scroll + cooperative gestures; protanopia/brightness.
- **Build inspection:** single shared maplibre chunk; workflow YAML parses with the timeline step present.
