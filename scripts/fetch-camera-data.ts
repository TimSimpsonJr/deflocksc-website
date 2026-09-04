/**
 * fetch-camera-data.ts — fetch the DeFlock CDN snapshot and write it to
 * public/camera-data.json for the build-time impact-stats generator (design §4.1).
 * (Fetching server-side also avoids the CDN's missing CORS header.)
 *
 * This is the UNTRUSTED-INPUT boundary of the refresh/build pipeline: the CDN
 * response is validated ALL-OR-NOTHING with the SHARED validator
 * (assertValidCameraPayload from src/lib/sc-camera-count.ts — the SAME gate the
 * build generator re-asserts) BEFORE the snapshot is written. A non-array,
 * empty, or any-malformed payload throws, the process exits non-zero (via
 * main().catch below), and the prior committed public/camera-data.json is left
 * untouched — so a malformed CDN response can never be written or committed as a
 * corrupt fallback, and can never flow into build-impact-stats.
 *
 * Run via `npm run fetch-camera-data`, which esbuild-bundles this TS (and the
 * shared module) before executing it — the repo's codes / build-wordlist /
 * build-impact-stats pattern. Because that bundle lands in node_modules/.cache,
 * the output path is resolved from process.cwd() (the repo root), NOT
 * import.meta.url (which after bundling points into node_modules/.cache).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertValidCameraPayload } from '../src/lib/sc-camera-count.js';

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const USER_AGENT =
  'deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)';
const OUT_PATH = resolve(process.cwd(), 'public', 'camera-data.json');

async function main(): Promise<void> {
  console.log(`Fetching camera data from ${CDN_URL}...`);
  const resp = await fetch(CDN_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) {
    throw new Error(`CDN responded with ${resp.status} ${resp.statusText}`);
  }

  const raw = (await resp.json()) as unknown;
  // Structural gate at the untrusted-input boundary. Throws (-> non-zero exit)
  // BEFORE the write if the payload is not a NON-EMPTY array of well-formed
  // records, so the prior committed snapshot survives and no corrupt snapshot is
  // ever written or committed. Same shared validator the build generator
  // (build-impact-stats.ts) re-asserts, so both steps reject identical payloads.
  assertValidCameraPayload(raw);
  console.log(`Fetched ${raw.length} cameras (all well-formed)`);

  writeFileSync(OUT_PATH, JSON.stringify(raw));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Failed to fetch camera data:', err);
  process.exit(1);
});
