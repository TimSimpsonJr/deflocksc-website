/**
 * fetch-camera-data.ts — refresh public/camera-data.json from OpenStreetMap via
 * the Overpass API (design 2026-09-17 §1), for the build-time impact-stats
 * generator. Replaces the single DeFlock CDN tile fetch, which (a) covered only
 * longitude [-100,-80) and so missed every SC camera east of -80 (~18%
 * undercount, issue #125) and (b) 403'd all datacenter egress, so the daily
 * refresh could not run in CI.
 *
 * This is the UNTRUSTED-INPUT boundary of the refresh pipeline. Per mirror, a
 * response is accepted only if ALL of these pass, in order:
 *   1. assertOverpassEnvelope — no top-level `remark` (server-side abort), a
 *      present `elements` array;
 *   2. assertFresh           — osm3s.timestamp_osm_base within 48h / not >2h
 *                              in the future (a mirror can serve a stale replica);
 *   3. mapOverpassElements   — node elements -> { id, lat, lon, tags };
 *   4. assertNoRegression    — SC_BOUNDS-projected candidate count vs the
 *                              SC_BOUNDS-projected prior snapshot (floor 1000,
 *                              max 10% drop; ALLOW_CAMERA_DROP=1 overrides);
 *   5. assertValidCameraPayload — the SHARED all-or-nothing structural gate
 *                              build-impact-stats.ts re-asserts.
 * Any failure advances to the next mirror. If every mirror fails, main() throws
 * -> non-zero exit -> the prior committed snapshot is left untouched (fail-red).
 * A write happens only after a mirror passes every check.
 *
 * Run via `npm run fetch-camera-data`, which esbuild-bundles this TS (and the
 * shared modules) before executing it. Because that bundle lands in
 * node_modules/.cache, paths are resolved from process.cwd() (the repo root),
 * NOT import.meta.url.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertValidCameraPayload, type Camera } from '../src/lib/sc-camera-count.js';
import {
  OVERPASS_MIRRORS,
  buildOverpassQuery,
  assertOverpassEnvelope,
  assertFresh,
  mapOverpassElements,
  assertNoRegression,
} from '../src/lib/overpass.js';

const USER_AGENT =
  'deflocksc-website/1.0 (+https://github.com/TimSimpsonJr/deflocksc-website)';
const OUT_PATH = resolve(process.cwd(), 'public', 'camera-data.json');
const QUERY = buildOverpassQuery();

/** Network/HTTP attempts per mirror before moving on. Validation failures are NOT retried. */
const ATTEMPTS_PER_MIRROR = 2;
/** Pause between attempts. Overridable so the exec tests do not sleep. */
const RETRY_DELAY_MS = Number(process.env.OVERPASS_RETRY_DELAY_MS ?? 2000);
/** Slightly above the query's own [timeout:120] so Overpass, not us, reports the abort. */
const FETCH_TIMEOUT_MS = 150_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * The committed snapshot, or null ONLY when the file is absent (the one case
 * the design lets the regression check skip). A snapshot that EXISTS but does
 * not parse or fails assertValidCameraPayload is NOT swallowed: the throw
 * propagates out of main() -> non-zero exit BEFORE any mirror fetch or write,
 * so the corrupt file and the derived artifacts are left exactly as they are
 * for manual intervention. Returning null here instead would bypass both the
 * regression check and the absolute floor (assertNoRegression returns early on
 * a null prior) and let a tiny valid candidate overwrite the snapshot. There is
 * deliberately no ALLOW_CAMERA_DROP path for this — a corrupt prior is not a
 * data regression, it is a broken repo state.
 */
function readPriorSnapshot(): Camera[] | null {
  if (!existsSync(OUT_PATH)) return null;
  const raw = JSON.parse(readFileSync(OUT_PATH, 'utf-8')) as unknown;
  assertValidCameraPayload(raw);
  return raw;
}

/** POST the query to one mirror, retrying transient network/HTTP failures. */
async function fetchOverpass(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS_PER_MIRROR; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`${url} responded ${resp.status} ${resp.statusText}`);
      return (await resp.json()) as unknown;
    } catch (err) {
      lastErr = err;
      console.warn(
        `  attempt ${attempt}/${ATTEMPTS_PER_MIRROR} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < ATTEMPTS_PER_MIRROR) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

/** Fetch + run every trust check for one mirror. Throws on the first failure. */
async function tryMirror(url: string, prior: Camera[] | null, allowDrop: boolean): Promise<Camera[]> {
  const data = await fetchOverpass(url);
  assertOverpassEnvelope(data);
  assertFresh(data.osm3s?.timestamp_osm_base);
  const cameras = mapOverpassElements(data);
  assertNoRegression(cameras, prior, { allowDrop });
  // Shared structural gate LAST, on the mapped array — same validator
  // build-impact-stats.ts re-asserts, so both steps reject identical payloads.
  assertValidCameraPayload(cameras);
  return cameras;
}

async function main(): Promise<void> {
  const prior = readPriorSnapshot();
  const allowDrop = process.env.ALLOW_CAMERA_DROP === '1';
  if (allowDrop) {
    console.warn('ALLOW_CAMERA_DROP=1: an implausible regression will be logged and ACCEPTED this run');
  }
  console.log(
    `Prior snapshot: ${prior ? `${prior.length} cameras` : 'none (regression check skipped)'}`,
  );

  const failures: string[] = [];
  for (const url of OVERPASS_MIRRORS) {
    console.log(`Querying Overpass mirror ${url} ...`);
    try {
      const cameras = await tryMirror(url, prior, allowDrop);
      console.log(`Accepted ${cameras.length} cameras from ${url} (all well-formed)`);
      writeFileSync(OUT_PATH, JSON.stringify(cameras));
      console.log(`Wrote ${OUT_PATH}`);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`Mirror ${url} rejected: ${reason}`);
      failures.push(`${url}: ${reason}`);
    }
  }
  throw new Error(
    `All Overpass mirrors failed; prior snapshot left untouched.\n  ${failures.join('\n  ')}`,
  );
}

main().catch((err) => {
  console.error('Failed to fetch camera data:', err);
  process.exit(1);
});
