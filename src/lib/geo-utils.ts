/**
 * Geometry utilities — point-in-polygon and bounding box helpers.
 *
 * Pure geometric operations with no external dependencies.
 * Used by district-matcher for spatial lookups.
 */

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

type Ring = [number, number][];

interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Ring[];
}

interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Ring[][];
}

type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface Feature {
  type: string;
  properties: Record<string, any>;
  geometry: Geometry;
}

export interface FeatureCollection {
  type: string;
  features: Feature[];
  _bbox?: BBox;
}

// --- Point-in-Polygon (ray-casting) ---

/**
 * Tests whether a point is inside a single polygon ring using the
 * ray-casting algorithm.
 */
function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Tests whether a point is inside a GeoJSON Polygon or MultiPolygon geometry.
 *
 * For Polygon: tests the outer ring, then ensures the point is not inside
 * any hole rings.
 *
 * For MultiPolygon: returns true if the point is inside any sub-polygon.
 */
export function pointInPolygon(lat: number, lng: number, geometry: Geometry | null | undefined): boolean {
  // Validate inputs: geometry must have type and coordinates
  if (!geometry || !geometry.type || !geometry.coordinates) return false;

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    // Must be inside the outer ring
    if (!pointInRing(lat, lng, rings[0])) return false;
    // Must not be inside any hole
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lat, lng, rings[h])) return false;
    }
    return true;
  }

  if (geometry.type === 'MultiPolygon') {
    for (let p = 0; p < geometry.coordinates.length; p++) {
      const rings = geometry.coordinates[p];
      if (!pointInRing(lat, lng, rings[0])) continue;
      let inHole = false;
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lat, lng, rings[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }

  return false;
}

// --- Bounding Box helpers ---

/**
 * Computes a bounding box from all coordinates in a GeoJSON FeatureCollection.
 * Returns { minLat, maxLat, minLng, maxLng }.
 */
export function computeBBox(fc: { features?: Feature[] } | null | undefined): BBox {
  // Validate FeatureCollection structure
  if (!fc || !fc.features || fc.features.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  function scanRing(ring: Ring) {
    for (let i = 0; i < ring.length; i++) {
      const lng = ring[i][0], lat = ring[i][1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  for (let f = 0; f < fc.features.length; f++) {
    const geom = fc.features[f].geometry;
    if (!geom || !geom.type || !geom.coordinates) continue;
    if (geom.type === 'Polygon') {
      for (let r = 0; r < geom.coordinates.length; r++) scanRing(geom.coordinates[r]);
    } else if (geom.type === 'MultiPolygon') {
      for (let p = 0; p < geom.coordinates.length; p++) {
        for (let r = 0; r < geom.coordinates[p].length; r++) scanRing(geom.coordinates[p][r]);
      }
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Returns true if a point falls within a bounding box (with a small margin).
 */
export function pointInBBox(lat: number, lng: number, bbox: BBox): boolean {
  const margin = 0.01; // ~1km buffer
  return (
    lat >= bbox.minLat - margin &&
    lat <= bbox.maxLat + margin &&
    lng >= bbox.minLng - margin &&
    lng <= bbox.maxLng + margin
  );
}
