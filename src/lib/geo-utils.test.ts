import { describe, it, expect } from 'vitest';
import { pointInPolygon, computeBBox, pointInBBox } from './geo-utils.js';

// Simple square polygon: corners at (0,0), (0,10), (10,10), (10,0) in GeoJSON [lng, lat] order
const squarePolygon = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
};

// Square with a hole: outer ring same as above, hole from (3,3) to (7,7)
const polygonWithHole = {
  type: 'Polygon' as const,
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
  ],
};

// MultiPolygon: two separate squares
const multiPolygon = {
  type: 'MultiPolygon' as const,
  coordinates: [
    [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
    [[[20, 20], [25, 20], [25, 25], [20, 25], [20, 20]]],
  ],
};

describe('pointInPolygon', () => {
  it('returns true for a point inside a simple polygon', () => {
    expect(pointInPolygon(5, 5, squarePolygon)).toBe(true);
  });

  it('returns false for a point outside a simple polygon', () => {
    expect(pointInPolygon(15, 15, squarePolygon)).toBe(false);
  });

  it('returns true for a point inside the outer ring but outside the hole', () => {
    expect(pointInPolygon(1, 1, polygonWithHole)).toBe(true);
  });

  it('returns false for a point inside the hole', () => {
    expect(pointInPolygon(5, 5, polygonWithHole)).toBe(false);
  });

  it('returns true for a point inside the first sub-polygon of a MultiPolygon', () => {
    expect(pointInPolygon(2, 2, multiPolygon)).toBe(true);
  });

  it('returns true for a point inside the second sub-polygon of a MultiPolygon', () => {
    expect(pointInPolygon(22, 22, multiPolygon)).toBe(true);
  });

  it('returns false for a point between MultiPolygon sub-polygons', () => {
    expect(pointInPolygon(12, 12, multiPolygon)).toBe(false);
  });

  it('returns false for null geometry', () => {
    expect(pointInPolygon(5, 5, null as any)).toBe(false);
  });

  it('returns false for geometry without type', () => {
    expect(pointInPolygon(5, 5, { coordinates: [] } as any)).toBe(false);
  });

  it('returns false for unsupported geometry type', () => {
    expect(pointInPolygon(5, 5, { type: 'Point', coordinates: [5, 5] } as any)).toBe(false);
  });
});

describe('computeBBox', () => {
  it('computes correct bounding box for a FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: squarePolygon },
      ],
    };
    const bbox = computeBBox(fc);
    expect(bbox).toEqual({ minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 });
  });

  it('spans multiple features', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: squarePolygon },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[50, 50], [60, 50], [60, 60], [50, 60], [50, 50]]] },
        },
      ],
    };
    const bbox = computeBBox(fc);
    expect(bbox).toEqual({ minLat: 0, maxLat: 60, minLng: 0, maxLng: 60 });
  });

  it('handles MultiPolygon features', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: multiPolygon },
      ],
    };
    const bbox = computeBBox(fc);
    expect(bbox).toEqual({ minLat: 0, maxLat: 25, minLng: 0, maxLng: 25 });
  });

  it('returns zeros for empty FeatureCollection', () => {
    expect(computeBBox({ features: [] })).toEqual({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 });
  });

  it('returns zeros for null input', () => {
    expect(computeBBox(null as any)).toEqual({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 });
  });

  it('skips features with missing geometry', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: null },
        { type: 'Feature', properties: {}, geometry: squarePolygon },
      ],
    };
    const bbox = computeBBox(fc);
    expect(bbox).toEqual({ minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 });
  });
});

describe('pointInBBox', () => {
  const bbox = { minLat: 32, maxLat: 35, minLng: -83, maxLng: -79 };

  it('returns true for a point inside the bbox', () => {
    expect(pointInBBox(33, -81, bbox)).toBe(true);
  });

  it('returns false for a point far outside', () => {
    expect(pointInBBox(40, -70, bbox)).toBe(false);
  });

  it('returns true for a point within the margin buffer', () => {
    // Just outside the bbox but within the 0.01 margin
    expect(pointInBBox(31.995, -81, bbox)).toBe(true);
  });

  it('returns false for a point beyond the margin', () => {
    expect(pointInBBox(31.98, -81, bbox)).toBe(false);
  });
});
