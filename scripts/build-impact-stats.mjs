/**
 * build-impact-stats.mjs — atomic camera-refresh generator (design §4.1).
 *
 * Produces two artifacts from a SINGLE point-in-polygon pass over the fetched
 * camera snapshot, so the numbers can never disagree:
 *   - public/camera-counts.json   per-jurisdiction non-zero counts (un-stales
 *                                 the action modal's per-jurisdiction statlines)
 *   - src/data/impact-stats.json  { scTotal, jurisdictions, generatedAt }
 *
 * Figures:
 *   scTotal       = unique camera IDs inside public/districts/state-outline.json
 *                   (the SC boundary polygon, NOT the double-counting sum of the
 *                    per-jurisdiction keys, since place boundaries sit inside
 *                    their county).
 *   jurisdictions = number of non-zero jurisdiction keys in camera-counts.json.
 *
 * pointInRing / pointInPolygon below are a faithful JS port of
 * src/lib/geo-utils.ts (the same ray-casting routine the district matcher runs
 * in production — handles holes, MultiPolygon). It is inlined rather than
 * imported so the weekly CI workflow stays dependency-free: Node 20, no npm ci,
 * no TypeScript toolchain. If geo-utils.ts ever changes its algorithm, mirror
 * the change here.
 *
 * generatedAt defaults to the current time; override for reproducible runs with
 * the IMPACT_STATS_DATE env var (any Date-parseable string, e.g. an ISO date).
 *
 * Run: node scripts/build-impact-stats.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CAMERA_DATA = resolve(ROOT, "public", "camera-data.json");
const DISTRICTS_DIR = resolve(ROOT, "public", "districts");
const STATE_OUTLINE = resolve(DISTRICTS_DIR, "state-outline.json");
const COUNTS_OUT = resolve(ROOT, "public", "camera-counts.json");
const STATS_OUT = resolve(ROOT, "src", "data", "impact-stats.json");

// SC bounding box — cheap pre-filter before the expensive point-in-polygon work
// (mirrors scripts/build-camera-counts.py). The camera snapshot spans the whole
// SE-US CDN tile (~62k cameras); this trims it to a few thousand SC candidates.
const SC_BOUNDS = { minLat: 31.5, maxLat: 35.5, minLon: -84.0, maxLon: -78.0 };

// --- Point-in-polygon (ray-casting) — JS port of src/lib/geo-utils.ts ---
// Ring coordinates are GeoJSON order [lng, lat]; the callers pass (lat, lng).

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

function pointInPolygon(lat, lng, geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates;
    if (!pointInRing(lat, lng, rings[0])) return false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lat, lng, rings[h])) return false;
    }
    return true;
  }

  if (geometry.type === "MultiPolygon") {
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** 'county-greenville.json' -> 'county:greenville', 'place-x.json' -> 'place:x'. */
function keyFromFilename(filename) {
  const name = basename(filename, ".json");
  const m = name.match(/^(county|place)-(.+)$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** True if the point falls inside ANY feature of a jurisdiction FeatureCollection. */
function pointInFeatureCollection(lat, lng, fc) {
  const features = fc.features || [];
  for (let i = 0; i < features.length; i++) {
    if (pointInPolygon(lat, lng, features[i].geometry)) return true;
  }
  return false;
}

function main() {
  const allCameras = readJson(CAMERA_DATA);
  // Pre-filter to the SC bounding box; keep only records with usable coords.
  const cameras = allCameras.filter(
    (c) =>
      typeof c.lat === "number" &&
      typeof c.lon === "number" &&
      c.lat >= SC_BOUNDS.minLat && c.lat <= SC_BOUNDS.maxLat &&
      c.lon >= SC_BOUNDS.minLon && c.lon <= SC_BOUNDS.maxLon
  );
  console.log(`Loaded ${allCameras.length} cameras; ${cameras.length} inside the SC bounding box`);

  // --- SC total: unique camera IDs inside the state boundary polygon ---
  const stateFc = readJson(STATE_OUTLINE);
  const scIds = new Set();
  for (const c of cameras) {
    if (pointInFeatureCollection(c.lat, c.lon, stateFc)) scIds.add(c.id);
  }
  const scTotal = scIds.size;
  console.log(`SC total (unique camera IDs inside state-outline.json): ${scTotal}`);

  // --- Per-jurisdiction counts (county-*.json + place-*.json) ---
  const boundaryFiles = readdirSync(DISTRICTS_DIR)
    .filter((f) => /^(county|place)-.+\.json$/.test(f))
    .sort();

  const counts = {};
  for (const file of boundaryFiles) {
    const key = keyFromFilename(file);
    if (!key) continue;
    const fc = readJson(resolve(DISTRICTS_DIR, file));
    let count = 0;
    for (const c of cameras) {
      if (pointInFeatureCollection(c.lat, c.lon, fc)) count++;
    }
    if (count > 0) {
      counts[key] = count;
      console.log(`  ${key}: ${count}`);
    } else {
      console.log(`  ${key}: 0 (omitted)`);
    }
  }

  const jurisdictions = Object.keys(counts).length;
  console.log(`Non-zero jurisdictions: ${jurisdictions}`);

  // --- Write artifacts ---
  // camera-counts.json: sorted keys, 2-space indent (matches build-camera-counts.py).
  const sortedCounts = {};
  for (const k of Object.keys(counts).sort()) sortedCounts[k] = counts[k];
  writeFileSync(COUNTS_OUT, JSON.stringify(sortedCounts, null, 2) + "\n");
  console.log(`Wrote ${COUNTS_OUT} (${jurisdictions} entries)`);

  const generatedAt = (process.env.IMPACT_STATS_DATE
    ? new Date(process.env.IMPACT_STATS_DATE)
    : new Date()
  ).toISOString();
  const stats = { scTotal, jurisdictions, generatedAt };
  writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2) + "\n");
  console.log(`Wrote ${STATS_OUT}: ${JSON.stringify(stats)}`);
}

main();
