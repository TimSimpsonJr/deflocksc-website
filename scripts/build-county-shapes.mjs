/**
 * Build public/districts/sc-counties.json — one simplified outline per SC county —
 * from the 46 per-county council-district files that sync-open-civics.mjs copies
 * into public/districts/.
 *
 * Run as part of prebuild, after sync-open-civics.mjs:
 *   node scripts/build-county-shapes.mjs
 *
 * Why: the events map draws a county choropleth below z8. Rendering the raw
 * district polygons would draw internal district seams and cost ~1.2 MB.
 * Dissolving and simplifying gives ~79 KB (~15 KB brotli) with no seams.
 *
 * Method: council districts partition their county, so unioning their polygons yields
 * the county outline with the internal district seams removed. A real areal union
 * (polygon-clipping, the engine @turf/union wraps) computes this robustly; then drop
 * slivers and Douglas-Peucker at 0.004 degrees (~440 m, about 1 px at z8 which is where
 * the choropleth fades out anyway).
 *
 * Vertices are snapped to 4 decimals (~11 m) before the union because the ArcGIS and
 * TIGER-derived sources do not agree on shared vertices to full float precision; snapping
 * lets coincident district edges meet exactly so the union has no gaps.
 *
 * History: an edge-cancellation dissolve was used previously. At multi-district junction
 * corners the source files disagreed on the shared vertex by more than the snap tolerance,
 * so edges failed to cancel and the greedy stitcher spliced spikes / self-crossings into
 * the outline. A post-union validity guard now fails the build if any county outline
 * self-intersects, so a future source regression cannot silently ship spikes again.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const SNAP_DECIMALS = 4;
const SIMPLIFY_TOLERANCE = 0.004;
const SLIVER_AREA = 1e-4; // square degrees; below this a dissolved ring is noise
const OUTPUT_DECIMALS = 4;

// Douglas-Peucker is topology-unaware: at the default tolerance it can fold a tightly
// wiggling boundary (the Lowcountry river county lines) into a self-crossing. On the rare
// ring where that happens, back off toward full detail until the simplified ring is simple
// again. The raw union ring is guaranteed simple, so tolerance 0 always resolves it.
const SIMPLIFY_BACKOFF = [SIMPLIFY_TOLERANCE, 0.0038, 0.0035, 0.003, 0.0025, 0.002, 0.001, 0.0005, 0];
const roundOut = (v) => Number(v.toFixed(OUTPUT_DECIMALS));

const snap = (p) => [
  Number(p[0].toFixed(SNAP_DECIMALS)),
  Number(p[1].toFixed(SNAP_DECIMALS)),
];

/** Shoelace area. Positive for counter-clockwise rings. */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

/**
 * Dissolve a set of closed rings into their outer boundary rings via a real areal union.
 * Input rings are [[lng, lat], ...] with the first point repeated last (one ring per
 * council district). Each ring is snapped to the shared 4-decimal grid so coincident
 * district edges meet exactly, wrapped as a single-ring polygon, and unioned; the outer
 * ring of each resulting polygon is returned (holes are dropped — SC counties are solid).
 * Returns closed rings; returns [] if there is nothing to union or the union fails
 * (caller falls back to the raw district rings).
 */
export function dissolveRings(rings) {
  // One [[ring]] polygon per input district, snapped to the shared grid before union.
  const polys = [];
  for (const raw of rings) {
    const ring = raw.map(snap);
    if (ring.length < 4) continue; // collapsed below a triangle after snapping
    polys.push([ring]);
  }
  if (!polys.length) return [];

  let merged;
  try {
    merged = polygonClipping.union(...polys);
  } catch {
    return [];
  }

  // merged is a MultiPolygon: [[outerRing, ...holes], ...]. Keep the outer ring of each.
  const out = [];
  for (const poly of merged) {
    const outer = poly && poly[0];
    if (outer && outer.length >= 4) out.push(outer);
  }
  return out;
}

/** Orientation of the ordered triple (a, b, c): 1 CCW, -1 CW, 0 collinear. */
function orient(a, b, c) {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

/** True if point c (known collinear with a-b) lies within the a-b bounding box. */
function onSegment(a, b, c) {
  return (
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
  );
}

/** True if segments p1-p2 and p3-p4 intersect (proper crossing or collinear overlap). */
function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;
  return false;
}

/**
 * Validity guard: true if a closed ring self-intersects (a spike or crossing chord).
 * Tests every pair of non-adjacent edges; adjacent edges share an endpoint by design,
 * and the closing edge is adjacent to the first, so both are skipped.
 */
export function ringSelfIntersects(ring) {
  const n = ring.length - 1; // number of edges in the closed ring
  if (n < 4) return false; // a triangle cannot self-intersect
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1) continue; // consecutive edges share a vertex
      if (i === 0 && j === n - 1) continue; // first and last edges wrap-share a vertex
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Iterative Douglas-Peucker over a closed ring. Returns a closed ring. */
export function simplifyRing(ring, tolerance) {
  if (ring.length < 5) return ring;
  const open = ring.slice(0, -1);
  const keep = new Uint8Array(open.length);
  keep[0] = 1;
  keep[open.length - 1] = 1;

  const stack = [[0, open.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let idx = -1;
    let max = 0;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistance(open[i], open[s], open[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tolerance) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }

  const res = [];
  for (let i = 0; i < open.length; i++) if (keep[i]) res.push(open[i]);
  if (res.length < 3) return ring;
  res.push(res[0]);
  return res;
}

/**
 * Simplify a ring to the output grid, backing off the Douglas-Peucker tolerance until the
 * result is simple (non-self-intersecting). Almost every ring stays at SIMPLIFY_TOLERANCE;
 * only a few Lowcountry counties need finer detail to avoid a DP-induced crossing. The
 * self-intersection is checked on the rounded coordinates because that is what ships.
 */
export function simplifyRingValid(ring, round = roundOut) {
  let last = null;
  for (const tolerance of SIMPLIFY_BACKOFF) {
    const s = simplifyRing(ring, tolerance).map((p) => [round(p[0]), round(p[1])]);
    last = s;
    if (s.length >= 4 && !ringSelfIntersects(s)) return s;
  }
  return last; // full-detail union ring; already verified simple upstream
}

function collectRings(featureCollection) {
  const rings = [];
  for (const feature of featureCollection.features ?? []) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') rings.push(...g.coordinates);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) rings.push(...poly);
  }
  return rings;
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const districtsDir = join(here, '..', 'public', 'districts');
  const outPath = join(districtsDir, 'sc-counties.json');

  const files = readdirSync(districtsDir)
    .filter((f) => f.startsWith('county-') && f.endsWith('.json'))
    .sort();

  const features = [];
  const fallbacks = [];
  const invalid = [];

  for (const file of files) {
    const county = file.replace(/^county-/, '').replace(/\.json$/, '');
    const fc = JSON.parse(readFileSync(join(districtsDir, file), 'utf-8'));
    const rings = collectRings(fc);

    let outline = dissolveRings(rings).filter((r) => Math.abs(ringArea(r)) > SLIVER_AREA);
    if (!outline.length) {
      // Stitching failed (overlapping or malformed district geometry). Fall back to
      // the raw district rings: the fill still covers the county, it just carries
      // internal seams. Reported below so it is visible, not silent.
      outline = rings;
      fallbacks.push(county);
    }

    const simplified = outline
      .map((r) => simplifyRingValid(r))
      .filter((r) => r.length >= 4);

    // Validity guard: a spike or crossing chord shows up as a self-intersecting ring.
    // simplifyRingValid already backs off DP tolerance to avoid its own artifacts, so a
    // ring that still self-intersects here signals a real source regression; fail the
    // build (below) rather than silently shipping a kinked county outline.
    if (simplified.some(ringSelfIntersects)) invalid.push(county);

    features.push({
      type: 'Feature',
      properties: { county },
      geometry: { type: 'MultiPolygon', coordinates: simplified.map((r) => [r]) },
    });
  }

  const json = JSON.stringify({ type: 'FeatureCollection', features });
  writeFileSync(outPath, json + '\n');
  console.log(
    `Wrote ${features.length} county outlines to public/districts/sc-counties.json ` +
      `(${json.length} bytes)`,
  );
  if (fallbacks.length) {
    console.log(`  dissolve fell back to raw district rings for: ${fallbacks.join(', ')}`);
  }
  if (invalid.length) {
    for (const county of invalid) {
      console.error(`  WARNING: ${county} outline self-intersects (spike or crossing chord)`);
    }
  }
  if (features.length !== 46) {
    throw new Error(`Expected 46 SC counties, found ${features.length}`);
  }
  if (invalid.length) {
    throw new Error(
      `${invalid.length} county outline(s) self-intersect: ${invalid.join(', ')}`,
    );
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
