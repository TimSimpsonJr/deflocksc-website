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
 * Method: council districts partition their county, so every interior edge appears
 * twice in opposite directions. Cancel matched edge pairs, stitch what is left into
 * rings, drop slivers, then Douglas-Peucker at 0.004 degrees (~440 m, about 1 px at
 * z8 which is where the choropleth fades out anyway).
 *
 * Vertices are snapped to 4 decimals (~11 m) before cancellation because the ArcGIS
 * and TIGER-derived sources do not agree on shared vertices to full float precision.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAP_DECIMALS = 4;
const SIMPLIFY_TOLERANCE = 0.004;
const SLIVER_AREA = 1e-4; // square degrees; below this a dissolved ring is noise
const OUTPUT_DECIMALS = 4;

const snap = (p) => [
  Number(p[0].toFixed(SNAP_DECIMALS)),
  Number(p[1].toFixed(SNAP_DECIMALS)),
];
const key = (p) => `${p[0]},${p[1]}`;

/** Shoelace area. Positive for counter-clockwise rings. */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

/**
 * Dissolve a set of closed rings into their outer boundary rings.
 * Input rings are [[lng, lat], ...] with the first point repeated last.
 * Returns closed rings; returns [] if nothing stitches (caller falls back).
 */
export function dissolveRings(rings) {
  const edges = new Map();

  for (const raw of rings) {
    const ring = raw.map(snap);
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = key(ring[i]);
      const b = key(ring[i + 1]);
      if (a === b) continue;
      const rev = `${b}|${a}`;
      if (edges.has(rev)) { edges.delete(rev); continue; }
      const fwd = `${a}|${b}`;
      if (edges.has(fwd)) { edges.delete(fwd); continue; }
      edges.set(fwd, [ring[i], ring[i + 1]]);
    }
  }

  // Adjacency: start-vertex key -> list of outgoing segments.
  const adj = new Map();
  for (const [k, seg] of edges) {
    const from = k.slice(0, k.indexOf('|'));
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(seg);
  }

  const out = [];
  for (const [start, list] of adj) {
    while (list.length) {
      const first = list.shift();
      const ring = [first[0], first[1]];
      let cur = key(first[1]);
      let guard = 0;
      while (cur !== start && guard++ < 500000) {
        const next = adj.get(cur);
        if (!next || !next.length) break;
        const seg = next.shift();
        ring.push(seg[1]);
        cur = key(seg[1]);
      }
      if (cur === start && ring.length >= 4) out.push(ring);
    }
  }
  return out;
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

  const round = (v) => Number(v.toFixed(OUTPUT_DECIMALS));
  const features = [];
  const fallbacks = [];

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
      .map((r) => simplifyRing(r, SIMPLIFY_TOLERANCE).map((p) => [round(p[0]), round(p[1])]))
      .filter((r) => r.length >= 4);

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
  if (features.length !== 46) {
    throw new Error(`Expected 46 SC counties, found ${features.length}`);
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
