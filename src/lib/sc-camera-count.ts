/**
 * sc-camera-count.ts — the single source of truth for South Carolina's ALPR
 * camera figures (design 2026-09-04 §3.1).
 *
 * The rigorous, deploy-independent count: unique camera IDs whose coordinates
 * fall inside the SC boundary polygon (public/districts/state-outline.json),
 * plus a per-jurisdiction breakdown from the county-* / place-* boundary files.
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
