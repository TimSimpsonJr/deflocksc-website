/**
 * build-timeline-data.ts — bakes the compact dated camera table
 * (public/timeline-cameras.json) that drives the surveillance timeline map.
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

// esbuild bundles this generator to node_modules/.cache before Node runs it, so
// import.meta.url resolves INTO node_modules and is useless for finding repo
// files. Resolve every path from process.cwd(), which npm sets to the repo root —
// identical to fetch-camera-data.ts / build-impact-stats.ts.
const ROOT = process.cwd();
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

function readCommitted(): TimelineTable | null {
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf-8')) as TimelineTable;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const featuresById = new Map<number, OhsomeFeature[]>();
  let fresh: TimelineTable | null = null;
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
    fresh = encodeTable(rows);
    console.log(`Resolved ${rows.length}/${featuresById.size} nodes to dated rows`);
  } catch (err) {
    console.error('ohsome dataset build failed; will fall back if possible:', err);
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
