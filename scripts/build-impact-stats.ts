/**
 * build-impact-stats.ts — atomic camera-refresh generator (design §4.1).
 *
 * Produces two artifacts from a SINGLE point-in-polygon pass over the fetched
 * camera snapshot, so the numbers can never disagree:
 *   - public/camera-counts.json   per-jurisdiction non-zero counts
 *   - src/data/impact-stats.json  { scTotal, jurisdictions, generatedAt }
 *
 * The count methodology lives in src/lib/sc-camera-count.ts (imported below and
 * shared with netlify/functions/sc-camera-count.ts), so the build-time figure
 * and the live endpoint use identical logic. Run via `npm run build-impact-stats`,
 * which esbuild-bundles this TS (and the shared module) before executing it.
 * Because that bundle lands in node_modules/.cache, all paths are resolved from
 * process.cwd() (the repo root) — NOT from import.meta.url, which after bundling
 * points into node_modules/.cache and cannot locate public/ or src/data/.
 *
 * generatedAt defaults to now; override for reproducible runs with IMPACT_STATS_DATE.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countScCameras,
  keyFromFilename,
  filterToScBounds,
  assertValidCameraPayload,
  type Camera,
} from '../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../src/lib/geo-utils.js';

// esbuild bundles this generator to node_modules/.cache/build-impact-stats.mjs
// before Node runs it, so import.meta.url resolves INTO node_modules and is
// useless for finding repo files. Resolve every path from process.cwd(), which
// npm sets to the repo root — identical to the build-wordlist / organizer-codes
// scripts (see their headers). Deriving ROOT from import.meta.url here would make
// the generator (and the daily refresh workflow) read from node_modules and fail.
const ROOT = process.cwd();
const CAMERA_DATA = resolve(ROOT, 'public', 'camera-data.json');
const DISTRICTS_DIR = resolve(ROOT, 'public', 'districts');
const STATE_OUTLINE = resolve(DISTRICTS_DIR, 'state-outline.json');
const COUNTS_OUT = resolve(ROOT, 'public', 'camera-counts.json');
const STATS_OUT = resolve(ROOT, 'src', 'data', 'impact-stats.json');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function main(): void {
  const raw = readJson<unknown>(CAMERA_DATA);
  // Defense-in-depth: the committed snapshot is already validated at the fetch
  // boundary (scripts/fetch-camera-data.ts) with this SAME shared validator, but
  // re-assert here BEFORE any artifact write so a standalone/local run on a stale
  // or hand-edited public/camera-data.json can never derive (or overwrite the
  // committed figures with) a malformed count. A throw exits non-zero before any
  // writeFileSync.
  assertValidCameraPayload(raw);
  const allCameras: Camera[] = raw;
  console.log(
    `Loaded ${allCameras.length} cameras; ${filterToScBounds(allCameras).length} inside the SC bounding box`,
  );

  const stateOutline = readJson<FeatureCollection>(STATE_OUTLINE);

  const boundaries = new Map<string, FeatureCollection>();
  const boundaryFiles = readdirSync(DISTRICTS_DIR)
    .filter((f) => /^(county|place)-.+\.json$/.test(f))
    .sort();
  for (const file of boundaryFiles) {
    const key = keyFromFilename(file);
    if (!key) continue;
    boundaries.set(key, readJson<FeatureCollection>(resolve(DISTRICTS_DIR, file)));
  }

  const { scTotal, jurisdictions, perJurisdiction } = countScCameras(
    allCameras,
    stateOutline,
    boundaries,
  );
  console.log(`SC total (unique camera IDs inside state-outline.json): ${scTotal}`);
  console.log(`Non-zero jurisdictions: ${jurisdictions}`);

  // camera-counts.json: sorted keys, 2-space indent, trailing newline
  // (matches build-camera-counts.py and the prior generator byte-for-byte).
  const sortedCounts: Record<string, number> = {};
  for (const k of Object.keys(perJurisdiction).sort()) sortedCounts[k] = perJurisdiction[k];
  writeFileSync(COUNTS_OUT, JSON.stringify(sortedCounts, null, 2) + '\n');
  console.log(`Wrote ${COUNTS_OUT} (${jurisdictions} entries)`);

  const generatedAt = (
    process.env.IMPACT_STATS_DATE ? new Date(process.env.IMPACT_STATS_DATE) : new Date()
  ).toISOString();
  const stats = { scTotal, jurisdictions, generatedAt };
  writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2) + '\n');
  console.log(`Wrote ${STATS_OUT}: ${JSON.stringify(stats)}`);
}

main();
