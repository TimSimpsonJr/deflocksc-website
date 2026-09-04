import type { Config, Context } from '@netlify/functions';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countScCameras,
  keyFromFilename,
  assertValidCameraPayload,
  type Camera,
} from '../../src/lib/sc-camera-count.js';
import type { FeatureCollection } from '../../src/lib/geo-utils.js';

/**
 * GET /api/sc-camera-count — the daily-fresh SC camera total (design §3.2).
 *
 * Fetches the DeFlock CDN snapshot the same way scripts/fetch-camera-data.ts
 * does (same URL + User-Agent + shared validator), applies the SC bounding-box pre-filter and the
 * shared point-in-polygon count (src/lib/sc-camera-count.ts — identical
 * methodology to the build-time impact-stats.json), and returns an aggregate
 * count only (no coordinates, no PII).
 *
 * Edge-cached for a day with day-long stale-while-revalidate, so DeFlock is hit
 * at most ~once/day site-wide and viewers get an instant edge response. To keep
 * that politeness guarantee, any request carrying a query string is rejected
 * BEFORE the upstream fetch — Netlify's default cache key includes the query, so
 * a cache-busting `?x=` would otherwise miss the edge cache and hit DeFlock on
 * every request.
 *
 * Fail-soft contract (never 5xxs, never caches a bad number): the upstream fetch
 * is bounded by an abort timeout (so a hung DeFlock cannot ride the platform
 * function timeout); the payload is validated ALL-OR-NOTHING (array, non-empty,
 * and EVERY record well-formed — one malformed record rejects the whole payload
 * rather than silently caching a filtered undercount); and the computed result is
 * validated (both scTotal and jurisdictions must be positive integers, so a zero
 * total or an incomplete boundary bundle cannot cache as success) before caching.
 * The timeout, non-ok, non-array, empty-array, any-malformed-record, zero-result,
 * and non-positive-jurisdictions cases all return HTTP 200 { stale:true } with no
 * scTotal and NO durable caching, so the homepage silently keeps its build-time
 * number and the next request can recover immediately.
 *
 * Live-vs-build validation boundaries (the SAME gate on both paths): the shared
 * counter (src/lib/sc-camera-count.ts) does NO structural/data-quality filtering —
 * it applies only the geographic SC-bbox clip that IS the counting methodology
 * (identical in both paths) and counts exactly the records it is handed.
 * STRUCTURAL validation lives at each boundary, and it is the SAME shared
 * validator on both: THIS function calls assertValidCameraPayload on its untrusted
 * live DeFlock fetch, and the refresh/build fetch step
 * (scripts/fetch-camera-data.ts) calls the identical assertValidCameraPayload on
 * the untrusted CDN response BEFORE it writes public/camera-data.json — so the
 * committed snapshot the build derives figures from is clean because it was
 * validated at fetch, not "trusted by assumption". Both paths reject a non-array,
 * empty, or any-malformed payload all-or-nothing (one bad record fails the WHOLE
 * payload — never a filtered undercount), so both feed the shared counter
 * structurally-clean records without either ever silently dropping a malformed
 * subset.
 */

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const USER_AGENT =
  'deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)';

// Bound the upstream fetch well under Netlify's ~10s function timeout, so a hung
// DeFlock aborts here and fails soft (see the catch) instead of 5xx-ing. The
// point-in-polygon pass over a few thousand SC candidates is fast, leaving ample
// headroom.
const FETCH_TIMEOUT_MS = 8000;

// state-outline.json + county-*/place-*.json are generated into public/districts
// by the prebuild (scripts/sync-open-civics.mjs) and bundled into this function
// via `included_files` in netlify.toml (they are otherwise gitignored).
//
// Where those bundled files land relative to a RUNNING function is not something
// we can assume: process.cwd() is NOT reliably the project root in the Netlify
// Functions runtime (with esbuild bundling the function module is nested under a
// generated directory, and the cwd/base can differ from the repo root that
// included_files are copied relative to). Assuming `resolve(process.cwd(),
// 'public','districts')` is why the endpoint silently fell back to {stale:true}:
// the readFileSync threw and the catch served the stale sentinel.
//
// So resolve the districts dir EMPIRICALLY at runtime: probe a list of candidate
// locations and pick the first that actually contains state-outline.json. We try
// the cwd-relative path first (correct when cwd IS the site root), then walk up
// from this module's own location (fileURLToPath(import.meta.url)) checking
// `<ancestor>/public/districts` at each level — included_files preserve their
// repo-relative path, so `/var/task/public/districts` is an ancestor of wherever
// the bundled module ends up. If none contains the boundary bundle we return
// null and loadBoundaries fails soft (preserving the {stale:true} contract).
function resolveDistrictsDir(): string | null {
  const candidates: string[] = [resolve(process.cwd(), 'public', 'districts')];
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 10; i++) {
      candidates.push(resolve(dir, 'public', 'districts'));
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  } catch {
    // import.meta.url unavailable (e.g. a CJS bundle) — the cwd candidate stands.
  }
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'state-outline.json'))) return candidate;
  }
  return null;
}

const CDN_CACHE = 'public, durable, s-maxage=86400, stale-while-revalidate=86400';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function loadBoundaries(): {
  stateOutline: FeatureCollection;
  boundaries: Map<string, FeatureCollection>;
} {
  const districtsDir = resolveDistrictsDir();
  if (!districtsDir) {
    // No candidate location held the bundled boundary files. Throw so the handler
    // catch serves the uncached {stale:true} sentinel rather than a bad number.
    throw new Error('districts boundary bundle not found at any candidate path');
  }
  const stateOutline = readJson<FeatureCollection>(resolve(districtsDir, 'state-outline.json'));
  const boundaries = new Map<string, FeatureCollection>();
  const files = readdirSync(districtsDir)
    .filter((f) => /^(county|place)-.+\.json$/.test(f))
    .sort();
  for (const file of files) {
    const key = keyFromFilename(file);
    if (!key) continue;
    boundaries.set(key, readJson<FeatureCollection>(resolve(districtsDir, file)));
  }
  return { stateOutline, boundaries };
}

function jsonResponse(body: unknown, cacheable: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    // Browsers must not hold this; the CDN is the only cache tier that does.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (cacheable) headers.set('Netlify-CDN-Cache-Control', CDN_CACHE);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    // Query params are part of Netlify's default durable-cache key, so a
    // cache-busting `?x=` would miss the edge cache and hit DeFlock on every
    // request (design §6 politeness). The homepage only ever fetches the bare
    // path, so reject anything carrying a query BEFORE the upstream fetch — this
    // request can never reach DeFlock and is never cached. Done inside the try so
    // a malformed URL still fails soft.
    if (new URL(req.url).search !== '') return jsonResponse({ stale: true }, false);

    const resp = await fetch(CDN_URL, {
      headers: { 'User-Agent': USER_AGENT },
      // Bounded so a hung upstream aborts (TimeoutError -> catch) rather than
      // riding the platform function timeout into a 5xx.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return jsonResponse({ stale: true }, false);

    const raw = (await resp.json()) as unknown;
    // ALL-OR-NOTHING structural validation via the SHARED validator
    // (src/lib/sc-camera-count.ts) — the SAME gate scripts/fetch-camera-data.ts
    // applies at the refresh/build boundary, so the live and build paths reject
    // identical payloads (one definition, no divergent preprocessing). It throws on
    // a non-array, EMPTY, or ANY-malformed payload (mixing well-formed + malformed
    // is itself a corruption signal; filtering to the valid subset would silently
    // CACHE an undercount for 24h). The throw is caught below and served as the
    // uncached { stale:true } sentinel; only a fully well-formed snapshot reaches
    // the shared counter, which does no structural filtering of its own (it counts
    // exactly what it is given, after its geographic SC-bbox clip). `raw` is
    // narrowed to Camera[] by the assertion.
    assertValidCameraPayload(raw);
    const cameras: Camera[] = raw;

    const { stateOutline, boundaries } = loadBoundaries();
    const { scTotal, jurisdictions } = countScCameras(cameras, stateOutline, boundaries);

    // Validate the RESULT before caching: never pin a bad figure to the edge for
    // 24h (a transient upstream hiccup must recover, not stick). scTotal must be a
    // positive integer (zero SC matches is treated as a soft failure), AND
    // jurisdictions must be a positive integer — a zero/non-positive jurisdictions
    // count means an incomplete boundary bundle (missing county-*/place-* files),
    // which must not be cached as a successful result.
    if (!Number.isInteger(scTotal) || scTotal <= 0) return jsonResponse({ stale: true }, false);
    if (!Number.isInteger(jurisdictions) || jurisdictions <= 0) {
      return jsonResponse({ stale: true }, false);
    }

    return jsonResponse(
      { scTotal, jurisdictions, generatedAt: new Date().toISOString(), stale: false },
      true,
    );
  } catch {
    // The caught error is deliberately not inspected or echoed — it can carry
    // internal hostnames. Serve the uncached stale sentinel instead. This catches
    // the fetch-abort TimeoutError AND the assertValidCameraPayload throw (non-array
    // / empty / any-malformed payload), so every anomaly fails soft, uncached.
    return jsonResponse({ stale: true }, false);
  }
};

export const config: Config = {
  path: '/api/sc-camera-count',
  method: ['GET'],
};
