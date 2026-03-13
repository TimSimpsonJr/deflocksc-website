/**
 * District Matcher -- client-side point-in-polygon district matching
 *
 * Matches a lat/lng to SC state legislative districts, county council
 * districts, and city council districts using bundled GeoJSON boundary
 * files and ray-casting. No external dependencies beyond geo-utils.
 */

import { pointInPolygon, computeBBox, pointInBBox } from './geo-utils.js';
import type { BBox, FeatureCollection } from './geo-utils.js';
import registry from '../data/registry.json';

// Re-export pointInPolygon for consumers that imported it from here
export { pointInPolygon };

export interface DistrictMatch {
  senate: string | null;
  house: string | null;
  county: string | null;
  countyDistrict: string | null;
  city: string | null;
  cityDistrict: string | null;
}

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  senate: string | null;
  house: string | null;
}

// --- Boundary file configuration (derived from registry.json) ---

const COUNTY_FILES: Record<string, string> = {};
const CITY_FILES: Record<string, string> = {};
const COUNTY_CITIES: Record<string, string[]> = {};

for (const j of ((registry as any).jurisdictions || [])) {
  if (!j.hasBoundary || !j.boundaryFile || !j.county || !j.id) continue;
  const countyLower: string = j.county.toLowerCase();
  if (j.type === 'county') {
    COUNTY_FILES[countyLower] = j.boundaryFile;
  } else if (j.type === 'place') {
    const cityName: string = j.id.split(':')[1];
    CITY_FILES[cityName] = j.boundaryFile;
    if (!COUNTY_CITIES[countyLower]) COUNTY_CITIES[countyLower] = [];
    COUNTY_CITIES[countyLower].push(cityName);
  }
}

// SC rough bounding box for early rejection
const SC_BBOX: BBox = { minLat: 32, maxLat: 35.3, minLng: -83.5, maxLng: -78.5 };

// --- In-memory cache for fetched boundary files ---

const boundaryCache = new Map<string, FeatureCollection | null>();

// --- Boundary File Loader ---

/**
 * Fetches and caches a GeoJSON boundary file from /districts/.
 */
export async function loadBoundary(filename: string): Promise<FeatureCollection | null> {
  if (boundaryCache.has(filename)) {
    return boundaryCache.get(filename)!;
  }

  try {
    const res = await fetch('/districts/' + filename);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Validate GeoJSON structure
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      console.warn('Invalid GeoJSON in boundary file: ' + filename);
      boundaryCache.set(filename, null);
      return null;
    }

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
 */
function findDistrict(lat: number, lng: number, fc: FeatureCollection | null): string | null {
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

// --- District Matcher ---

/**
 * Matches a lat/lng to all relevant districts: state senate, state house,
 * county council, and (if applicable) city council.
 */
export async function matchDistricts(lat: number, lng: number): Promise<DistrictMatch> {
  const result: DistrictMatch = {
    senate: null,
    house: null,
    county: null,
    countyDistrict: null,
    city: null,
    cityDistrict: null,
  };

  // Validate inputs are finite numbers
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
    return result;
  }

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
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const result: GeocodeResult = { lat: null, lng: null, senate: null, house: null };

  try {
    const params = new URLSearchParams({
      address: address,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'json',
    });

    const res = await fetch('/api/geocode?' + params.toString());

    if (!res.ok) throw new Error('Census geocoder HTTP ' + res.status);

    const data = await res.json();

    // The result structure: data.result.addressMatches[0]
    const matches = data.result && data.result.addressMatches;
    if (!matches || matches.length === 0) return result;

    const match = matches[0];

    // Extract and validate coordinates
    if (match.coordinates) {
      const x = match.coordinates.x;
      const y = match.coordinates.y;
      if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
        result.lng = x;
        result.lat = y;
      }
    }

    // Extract state legislative districts from geographies
    const geographies = match.geographies;
    if (geographies) {
      const upper = geographies['2024 State Legislative Districts - Upper'] || geographies['State Legislative Districts - Upper'];
      if (upper && upper.length > 0 && upper[0].BASENAME) {
        result.senate = upper[0].BASENAME;
      }

      const lower = geographies['2024 State Legislative Districts - Lower'] || geographies['State Legislative Districts - Lower'];
      if (lower && lower.length > 0 && lower[0].BASENAME) {
        result.house = lower[0].BASENAME;
      }
    }
  } catch (e) {
    console.warn('Census geocoder failed:', e);
  }

  return result;
}
