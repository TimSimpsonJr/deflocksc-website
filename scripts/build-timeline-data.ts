/**
 * build-timeline-data.ts — bakes the compact dated camera table
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
 * build-timeline-data.test.ts; main() is guarded (invokedDirectly) so importing
 * this module for tests never runs the network fetch.
 *
 * Run via `npm run build-timeline-data`, which esbuild-bundles this TS (and the
 * shared src/lib validator it imports) before executing it — the repo's
 * fetch-camera-data / build-impact-stats pattern. Because that bundle lands in
 * node_modules/.cache, EVERY path is resolved from process.cwd() (the repo root),
 * NOT import.meta.url (which after bundling points into node_modules/.cache and
 * cannot locate public/). The guard's own import.meta.url compare still holds:
 * under the bundle it equals process.argv[1]; under vitest it does not.
 *
 * parseDirectionTag mirrors parseDirection in
 * src/scripts/map/layers/cameras.ts — mirror any change there here.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidCameraPayload, type Camera } from '../src/lib/sc-camera-count.js';

// esbuild bundles this generator to node_modules/.cache before Node runs it, so
// import.meta.url resolves INTO node_modules and is useless for finding repo
// files. Resolve every path from process.cwd(), which npm sets to the repo root —
// identical to fetch-camera-data.ts / build-impact-stats.ts.
const ROOT = process.cwd();
const CAMERA_DATA = resolve(ROOT, 'public', 'camera-data.json');
const OUT_PATH = resolve(ROOT, 'public', 'timeline-cameras.json');
// Spec: the timeline UI opens at ~Jan 2020. OSM has ALPR nodes predating 2020,
// so first-seen months are FLOORED to this stop and pre-2020 cameras are bucketed
// into it — the scrubber and intro then start at 202001 with no sparse pre-2020
// tail (see monthStops() in timeline-controller.ts, which relies on this floor).
const TIMELINE_START_MONTH = 202001;

// --- Types ---

/** One normalized camera row before columnar encoding. */
export interface TimelineRow {
  lon: number;
  lat: number;
  m: number;
  dir: number | null;
}

/** The compact columnar dated table shipped as public/timeline-cameras.json. */
export interface TimelineTable {
  v: number;
  lon: number[];
  lat: number[];
  m: number[];
  dir: (number | null)[];
}

/** The snapshot record shape this build reads: a Camera plus its OSM tags. */
interface SnapshotCamera extends Camera {
  tags?: Record<string, string> | null;
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

/** Rows [{lon,lat,m,dir}] -> columnar {v,lon[],lat[],m[],dir[]}, coords rounded. */
export function encodeTable(rows: TimelineRow[]): TimelineTable {
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
export function decodeTable(table: TimelineTable): TimelineRow[] {
  const out: TimelineRow[] = [];
  for (let i = 0; i < table.m.length; i++) {
    out.push({ lon: table.lon[i], lat: table.lat[i], m: table.m[i], dir: table.dir[i] });
  }
  return out;
}

/** Graceful fallback selector. Returns { table, reused }. */
export function chooseOutput(
  fresh: TimelineTable | null,
  lastCommitted: TimelineTable | null,
): { table: TimelineTable; reused: boolean } {
  // Each `if` narrows its argument to TimelineTable inside the block.
  if (fresh && Array.isArray(fresh.m) && fresh.m.length > 0) {
    return { table: fresh, reused: false };
  }
  if (lastCommitted && Array.isArray(lastCommitted.m) && lastCommitted.m.length > 0) {
    return { table: lastCommitted, reused: true };
  }
  throw new Error('Timeline build produced no rows and no committed table to fall back to');
}

/** Stable serialization for the shipped artifact (fixed key order, trailing NL). */
export function serializeTable(table: TimelineTable): string {
  return JSON.stringify(table) + '\n';
}

// --- OSM first-seen date resolution (ohsome) ---

const OHSOME_URL = 'https://api.ohsome.org/v1/elementsFullHistory/centroid';
const OHSOME_METADATA_URL = 'https://api.ohsome.org/v1/metadata';
// Deflock ALPR nodes in OSM. Extra matches are harmless — only ids also present
// in camera-data.json are used; unmatched local cameras are excluded.
const OHSOME_FILTER = 'man_made=surveillance and surveillance:type=ALPR and type:node';
// Coarse macro-bboxes covering the lower 48 (west,south,east,north). Batching
// bounds each response and respects ohsome rate limits.
const REGIONS: [number, number, number, number][] = [
  [-125.0, 32.0, -114.0, 49.5], // Pacific + Mountain NW
  [-114.0, 31.0, -102.0, 49.5], // Mountain
  [-102.0, 25.0, -90.0, 49.5],  // Plains
  [-90.0, 24.0, -80.0, 40.0],   // SE + Gulf
  [-90.0, 40.0, -80.0, 49.5],   // Great Lakes
  [-80.0, 24.0, -66.9, 40.0],   // Southeast Atlantic (incl. SC)
  [-80.0, 40.0, -66.9, 49.5],   // Northeast
];

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

async function fetchRegionEarliest(
  bbox: [number, number, number, number],
  endDate: string,
  earliestById: Map<number, string>,
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
    properties: 'metadata',
  });
  const res = await fetch(OHSOME_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`ohsome responded ${res.status} for bbox ${bbox.join(',')}`);
  const json = (await res.json()) as { features?: Array<{ properties?: Record<string, unknown> }> };
  for (const f of json.features ?? []) {
    const osmId = f.properties?.['@osmId']; // e.g. "node/51968727"
    const validFrom = f.properties?.['@validFrom'];
    if (!osmId || typeof validFrom !== 'string') continue;
    const id = Number(String(osmId).split('/')[1]);
    if (!Number.isFinite(id)) continue;
    const prev = earliestById.get(id);
    if (prev === undefined || validFrom < prev) earliestById.set(id, validFrom);
  }
}

function readCommitted(): TimelineTable | null {
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf-8')) as TimelineTable;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(CAMERA_DATA, 'utf-8')) as unknown;
  // Defense-in-depth: re-assert the shared ALL-OR-NOTHING validator (the SAME
  // gate fetch-camera-data.ts applies at the untrusted-input boundary and
  // build-impact-stats.ts re-asserts) BEFORE building, so a stale or hand-edited
  // public/camera-data.json can never silently produce a corrupt timeline table.
  // A throw exits non-zero (via the .catch below) before any writeFileSync.
  assertValidCameraPayload(raw);
  const cameras = raw as SnapshotCamera[];
  console.log(`Loaded ${cameras.length} cameras from the snapshot`);

  const earliestById = new Map<number, string>();
  let fresh: TimelineTable | null = null;
  try {
    // ohsome's OSM-history data lags real time; derive the interval END from the
    // metadata temporal extent once, up front. Using today would 404 every
    // region (the end lies beyond the underlying osh-data's coverage).
    const endDate = await fetchOhsomeEndDate();
    console.log(`ohsome history extent ends ${endDate}; querying 2016-01-01..${endDate}`);
    for (const bbox of REGIONS) {
      await fetchRegionEarliest(bbox, endDate, earliestById);
      console.log(`  ohsome ${bbox.join(',')}: ${earliestById.size} ids so far`);
    }
    const rows: TimelineRow[] = [];
    for (const cam of cameras) {
      const iso = earliestById.get(Number(cam.id));
      if (!iso) continue; // undated -> excluded from the timeline
      // Floor to the Jan-2020 timeline start: cameras first documented before
      // 2020 are bucketed into 202001 so the scrubber/intro open there.
      rows.push({
        lon: cam.lon,
        lat: cam.lat,
        m: floorToTimelineStart(monthInt(iso)),
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
