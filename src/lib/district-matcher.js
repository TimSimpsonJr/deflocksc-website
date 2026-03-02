/**
 * District Matcher — client-side point-in-polygon district matching
 *
 * Matches a lat/lng to SC state legislative districts, county council
 * districts, and city council districts using bundled GeoJSON boundary
 * files and ray-casting. No external dependencies.
 */

// --- Boundary file configuration ---

const COUNTY_FILES = {
  greenville: 'county-greenville.json',
  spartanburg: 'county-spartanburg.json',
  anderson: 'county-anderson.json',
  pickens: 'county-pickens.json',
  laurens: 'county-laurens.json',
};

const CITY_FILES = {
  greenville: 'place-greenville.json',
};

// Which cities are within which counties (for targeted city lookups)
const COUNTY_CITIES = {
  greenville: ['greenville'],
};

// SC rough bounding box for early rejection
const SC_BBOX = { minLat: 32, maxLat: 35.3, minLng: -83.5, maxLng: -78.5 };

// --- In-memory cache for fetched boundary files ---

const boundaryCache = new Map();

// --- Point-in-Polygon (ray-casting) ---

/**
 * Tests whether a point is inside a single polygon ring using the
 * ray-casting algorithm.
 *
 * @param {number} lat - Latitude of the test point
 * @param {number} lng - Longitude of the test point
 * @param {number[][]} ring - Array of [lng, lat] coordinate pairs (GeoJSON order)
 * @returns {boolean}
 */
function pointInRing(lat, lng, ring) {
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
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} geometry - GeoJSON geometry object (Polygon or MultiPolygon)
 * @returns {boolean}
 */
export function pointInPolygon(lat, lng, geometry) {
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
function computeBBox(fc) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  function scanRing(ring) {
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
function pointInBBox(lat, lng, bbox) {
  const margin = 0.01; // ~1km buffer
  return (
    lat >= bbox.minLat - margin &&
    lat <= bbox.maxLat + margin &&
    lng >= bbox.minLng - margin &&
    lng <= bbox.maxLng + margin
  );
}

// --- Boundary File Loader ---

/**
 * Fetches and caches a GeoJSON boundary file from /districts/.
 *
 * @param {string} filename - File name within public/districts/
 * @returns {Promise<object|null>} Parsed GeoJSON FeatureCollection, or null on error
 */
export async function loadBoundary(filename) {
  if (boundaryCache.has(filename)) {
    return boundaryCache.get(filename);
  }

  try {
    const res = await fetch('/districts/' + filename);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // Pre-compute and attach bounding box for fast rejection
    data._bbox = computeBBox(data);
    boundaryCache.set(filename, data);
    return data;
  } catch (e) {
    console.warn('Failed to load boundary file: ' + filename, e);
    boundaryCache.set(filename, null); // cache the failure so we don't retry
    return null;
  }
}

// --- Internal matching helpers ---

/**
 * Finds the district number for a point within a FeatureCollection.
 * Each feature is expected to have a `properties.district` string.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} fc - GeoJSON FeatureCollection
 * @returns {string|null} The district property value, or null
 */
function findDistrict(lat, lng, fc) {
  if (!fc || !fc.features) return null;

  // Skip the whole file if point is outside its bounding box
  if (fc._bbox && !pointInBBox(lat, lng, fc._bbox)) return null;

  for (let i = 0; i < fc.features.length; i++) {
    const feature = fc.features[i];
    if (pointInPolygon(lat, lng, feature.geometry)) {
      return feature.properties.district || null;
    }
  }
  return null;
}

/**
 * Tests whether a point falls anywhere within a FeatureCollection
 * (i.e., is the point inside any feature's geometry at all).
 */
function pointInAnyFeature(lat, lng, fc) {
  if (!fc || !fc.features) return false;
  if (fc._bbox && !pointInBBox(lat, lng, fc._bbox)) return false;
  for (let i = 0; i < fc.features.length; i++) {
    if (pointInPolygon(lat, lng, fc.features[i].geometry)) return true;
  }
  return false;
}

// --- District Matcher ---

/**
 * Matches a lat/lng to all relevant districts: state senate, state house,
 * county council, and (if applicable) city council.
 *
 * Loads boundary files on demand and caches them. Returns null for any
 * field that could not be matched.
 *
 * @param {number} lat - Latitude (from browser geolocation or geocoder)
 * @param {number} lng - Longitude
 * @returns {Promise<{senate: string|null, house: string|null, county: string|null, countyDistrict: string|null, city: string|null, cityDistrict: string|null}>}
 */
export async function matchDistricts(lat, lng) {
  const result = {
    senate: null,
    house: null,
    county: null,
    countyDistrict: null,
    city: null,
    cityDistrict: null,
  };

  // Early rejection: not even in SC
  if (
    lat < SC_BBOX.minLat || lat > SC_BBOX.maxLat ||
    lng < SC_BBOX.minLng || lng > SC_BBOX.maxLng
  ) {
    return result;
  }

  // Load state legislative boundaries in parallel
  const [sldu, sldl] = await Promise.all([
    loadBoundary('sldu.json'),
    loadBoundary('sldl.json'),
  ]);

  result.senate = findDistrict(lat, lng, sldu);
  result.house = findDistrict(lat, lng, sldl);

  // Determine county by testing each county boundary file.
  // Load all county files in parallel, then test each.
  const countyKeys = Object.keys(COUNTY_FILES);
  const countyData = await Promise.all(
    countyKeys.map(function (key) { return loadBoundary(COUNTY_FILES[key]); })
  );

  for (let i = 0; i < countyKeys.length; i++) {
    const fc = countyData[i];
    if (!fc) continue;
    const district = findDistrict(lat, lng, fc);
    if (district !== null) {
      result.county = countyKeys[i];
      result.countyDistrict = district;
      break;
    }
  }

  // If the point is in a county that has cities with boundary data,
  // test those city files.
  if (result.county && COUNTY_CITIES[result.county]) {
    const cityKeys = COUNTY_CITIES[result.county];
    const cityData = await Promise.all(
      cityKeys.map(function (key) {
        return CITY_FILES[key] ? loadBoundary(CITY_FILES[key]) : Promise.resolve(null);
      })
    );

    for (let i = 0; i < cityKeys.length; i++) {
      const fc = cityData[i];
      if (!fc) continue;
      const district = findDistrict(lat, lng, fc);
      if (district !== null) {
        result.city = cityKeys[i];
        result.cityDistrict = district;
        break;
      }
    }
  } else {
    // Even without a county match, try all city files (point might be
    // in a city whose county we don't track council districts for)
    const cityKeys = Object.keys(CITY_FILES);
    if (cityKeys.length > 0) {
      const cityData = await Promise.all(
        cityKeys.map(function (key) { return loadBoundary(CITY_FILES[key]); })
      );
      for (let i = 0; i < cityKeys.length; i++) {
        const fc = cityData[i];
        if (!fc) continue;
        const district = findDistrict(lat, lng, fc);
        if (district !== null) {
          result.city = cityKeys[i];
          result.cityDistrict = district;
          break;
        }
      }
    }
  }

  return result;
}

// --- Census Geocoder ---

/**
 * Geocodes an address using the US Census Bureau's free geocoder.
 * Returns lat/lng and, when available, state legislative district
 * numbers from the Census geographies response.
 *
 * @param {string} address - Full street address (e.g. "123 Main St, Greenville, SC 29601")
 * @returns {Promise<{lat: number|null, lng: number|null, senate: string|null, house: string|null}>}
 */
export async function geocodeAddress(address) {
  const result = { lat: null, lng: null, senate: null, house: null };

  try {
    const params = new URLSearchParams({
      address: address,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'json',
    });

    const res = await fetch(
      'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?' + params.toString()
    );

    if (!res.ok) throw new Error('Census geocoder HTTP ' + res.status);

    const data = await res.json();

    // The result structure: data.result.addressMatches[0]
    const matches = data.result && data.result.addressMatches;
    if (!matches || matches.length === 0) return result;

    const match = matches[0];

    // Extract coordinates
    if (match.coordinates) {
      result.lng = match.coordinates.x;
      result.lat = match.coordinates.y;
    }

    // Extract state legislative districts from geographies
    // The Census geocoder nests these under geographies["State Legislative Districts - Upper"]
    // and ["State Legislative Districts - Lower"]
    const geographies = match.geographies;
    if (geographies) {
      const upper = geographies['State Legislative Districts - Upper'];
      if (upper && upper.length > 0 && upper[0].BASENAME) {
        result.senate = upper[0].BASENAME;
      }

      const lower = geographies['State Legislative Districts - Lower'];
      if (lower && lower.length > 0 && lower[0].BASENAME) {
        result.house = lower[0].BASENAME;
      }
    }
  } catch (e) {
    console.warn('Census geocoder failed:', e);
  }

  return result;
}
