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
