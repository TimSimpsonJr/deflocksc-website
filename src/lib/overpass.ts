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
