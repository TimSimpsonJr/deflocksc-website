---
codex_plan_review_status: approved
codex_plan_review_rounds: 2
codex_thread_id: 01a04de7-361b-7653-bcab-4cb0bf9714fd
---

# Camera Map Live Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed the homepage camera map live per-viewport tiles from the Deflock CDN (via a same-origin Netlify proxy) instead of the weekly single-tile snapshot, and uncluster dots at zoom 13.

**Architecture:** A `/deflock-tiles/*` Netlify 200 rewrite (plus a matching Vite dev proxy) makes `cdn.deflock.me/regions/*` fetchable same-origin. A new `src/scripts/map/tile-loader.ts` fetches the tile index once (single-flight, contract-validated, 60 s failure back-off), then fetches every 20-degree tile intersecting the viewport — capped at 8 tiles per viewport — on map `load` (immediate) and debounced `moveend` (250 ms trailing), dedupes cameras by OSM id, and pushes merged data into the existing `cameras` GeoJSON source via `setData()`. On CDN failure it falls back once to the committed `/camera-data.json` snapshot (live tile records always win over fallback records with the same id) and latches back-offs so repeated moveend events never retry-storm. Rendering, layers, popups, and cones are untouched except `clusterMaxZoom: 15 → 12`.

**Tech Stack:** Astro 5, MapLibre GL JS 5, Netlify redirects, Vitest.

**Design spec:** `docs/plans/2026-08-29-camera-map-live-data-design.md` — read it first; it records the approved decisions, the observed CDN data contract, and two deliberate deviations from the upstream deflock.org reference implementation.

**Branch:** create `feature/camera-map-live-data` off `master` before Task 1.

**Facts you need (verified 2026-08-29):**

- `https://cdn.deflock.me/regions/index.json` returns:
  `{"expiration_utc": 1788010667, "regions": ["20/-100", "20/-80", ...], "tile_url": "https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1788006947", "tile_size_degrees": 20}`
  — `expiration_utc` is Unix **seconds**; region keys are `"{lat}/{lon}"` tile origins; each tile covers `[origin, origin+20)` degrees.
- Tile `20/-100` (lon −100…−80) is the current snapshot; tile `20/-80` (lon −80…−60) holds the SC coast (Charleston −79.93, Myrtle Beach −78.89) and is ~1 MB. Both are in `regions`.
- The live index lists ~54 region keys; individual tiles run ~1–2.8 MB. A fully zoomed-out viewport could intersect 30–60 MB of tiles, which is why the loader caps tile fetches at 8 per viewport (Task 4).
- The CDN sends no CORS headers for our origin — every browser fetch must go through the proxy.
- There is no `public/_redirects` file; `netlify.toml` is the only redirect source.
- `tests/config-guards.test.ts` has a file-level `beforeAll` that runs a full Astro build (~2–5 min). Every `vitest run` of that file pays that cost — expected, not a hang.

---

### Task 1: Netlify proxy redirect for the Deflock CDN

**Files:**
- Modify: `netlify.toml` (after the `/api/geocode` redirect block, line ~25)
- Test: `tests/config-guards.test.ts` (inside `describe('netlify.toml', ...)`, after the CSP-redefinition test at line ~138)

- [ ] **Step 1: Write the failing guard test**

Add inside the existing `describe('netlify.toml', () => { ... })` block:

```ts
  it('proxies /deflock-tiles/* to the Deflock CDN regions path', () => {
    // cdn.deflock.me only sends Access-Control-Allow-Origin for deflock.org,
    // so the camera map must fetch tiles same-origin through this rewrite.
    expect(netlifyToml).toMatch(
      /from = "\/deflock-tiles\/\*"\s*\r?\n\s*to = "https:\/\/cdn\.deflock\.me\/regions\/:splat"\s*\r?\n\s*status = 200/
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/config-guards.test.ts`
Expected: the new test FAILS (`expect(netlifyToml).toMatch` assertion error); all pre-existing tests in the file PASS. (The file's `beforeAll` runs an Astro build first — allow several minutes.)

- [ ] **Step 3: Add the redirect**

In `netlify.toml`, insert after the census geocoder `[[redirects]]` block (after line 25, before the `# Security headers.` comment):

```toml
# Proxy Deflock CDN camera tiles: cdn.deflock.me only sends
# Access-Control-Allow-Origin for deflock.org, so the browser fetches
# same-origin /deflock-tiles/* and Netlify fetches the CDN server-side.
# Query strings (the CDN's ?v= cache-buster) pass through automatically.
[[redirects]]
  from = "/deflock-tiles/*"
  to = "https://cdn.deflock.me/regions/:splat"
  status = 200
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/config-guards.test.ts`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify.toml tests/config-guards.test.ts
git commit -m "feat(map): proxy Deflock CDN tiles through /deflock-tiles/*"
```

---

### Task 2: Matching Vite dev proxy (so `astro dev` exercises the real path)

**Files:**
- Modify: `astro.config.mjs` (inside `vite.server.proxy`, after the `/api/geocode` entry at lines 43–47)

- [ ] **Step 1: Add the dev proxy entry**

In `astro.config.mjs`, inside `server.proxy`, insert directly after the `'/api/geocode'` entry (after line 47):

```js
        // Deflock CDN camera tiles: cdn.deflock.me only sends CORS headers for
        // deflock.org, so the browser always fetches same-origin /deflock-tiles/*.
        // netlify.toml proxies it in production; this mirrors that for `astro dev`
        // (Netlify redirects do not run under the dev server).
        '/deflock-tiles': {
          target: 'https://cdn.deflock.me',
          changeOrigin: true,
          rewrite: (path) => path.replace('/deflock-tiles', '/regions'),
        },
```

- [ ] **Step 2: Verify against the dev server**

Run (background): `node node_modules/astro/astro.js dev --host 127.0.0.1`

Then, from PowerShell (use `curl.exe` explicitly — bare `curl` is PowerShell's `Invoke-WebRequest` alias and takes different flags):

```powershell
curl.exe -s "http://127.0.0.1:4321/deflock-tiles/index.json"
```

Expected: JSON containing `"tile_size_degrees": 20` and a `"regions"` array. Also run:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{size_download}" "http://127.0.0.1:4321/deflock-tiles/20/-80.json"
```

Expected: `200` with a size near 1000000. (`NUL` is the Windows null device; from Git Bash the same `curl.exe` commands work with `/dev/null` in place of `NUL`.) Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add astro.config.mjs
git commit -m "feat(map): mirror the /deflock-tiles proxy in astro dev"
```

---

### Task 3: CSP img-src fix for Wikimedia Commons popup thumbnails (folded-in)

**Files:**
- Modify: `public/_headers` (the single CSP line, line 8)
- Test: `tests/config-guards.test.ts` (inside `describe('public/_headers', ...)`)

Camera popups build image URLs on `commons.wikimedia.org/w/thumb.php` (`src/scripts/map/layers/cameras.ts` line 40), but `img-src` only allows `upload.wikimedia.org` (the redirect target). CSP checks every hop, so these images are blocked in production today.

- [ ] **Step 1: Write the failing guard test**

Add inside the existing `describe('public/_headers', () => { ... })` block:

```ts
  it('allows Wikimedia Commons thumbnails in img-src (camera popup images)', () => {
    // cameras.ts builds commons.wikimedia.org/w/thumb.php URLs, which redirect
    // to upload.wikimedia.org — CSP must allow both hops.
    expect(cspLine).toMatch(/img-src[^;]*https:\/\/commons\.wikimedia\.org/);
    expect(cspLine).toMatch(/img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/config-guards.test.ts`
Expected: the new test FAILS on the `commons.wikimedia.org` assertion.

- [ ] **Step 3: Add the host to img-src**

In `public/_headers` line 8, change the `img-src` directive (only this directive — the rest of the line is untouched) from:

```
img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org
```

to:

```
img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org https://commons.wikimedia.org
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/config-guards.test.ts`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/_headers tests/config-guards.test.ts
git commit -m "fix(csp): allow commons.wikimedia.org in img-src for popup thumbnails"
```

---

### Task 4: Viewport tile loader module (TDD)

**Files:**
- Create: `src/scripts/map/tile-loader.ts`
- Create: `tests/tile-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tile-loader.test.ts` (test imports use the repo convention of `.js` specifiers resolving to `.ts`, as in `tests/functions/fold-events.test.ts`):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  visibleTileKeys,
  proxiedTileTemplate,
  createTileLoader,
  type DeflockCamera,
} from '../src/scripts/map/tile-loader.js';

const AVAILABLE = ['20/-100', '20/-80', '40/-100', '40/-80'];

// Greenville-area viewport, entirely inside tile 20/-100
const SC_INLAND = { west: -82.6, south: 34.6, east: -82.1, north: 35.1 };

describe('visibleTileKeys', () => {
  it('returns the single tile containing an inland SC viewport', () => {
    expect(visibleTileKeys(SC_INLAND, 20, AVAILABLE)).toEqual(['20/-100']);
  });

  it('returns both SC tiles when the viewport crosses -80 longitude', () => {
    // Columbia-to-coast viewport spanning the -80 meridian
    expect(
      visibleTileKeys({ west: -81.5, south: 32.5, east: -79.5, north: 34.5 }, 20, AVAILABLE)
    ).toEqual(['20/-100', '20/-80']);
  });

  it('excludes tiles the index does not offer', () => {
    expect(
      visibleTileKeys({ west: -61, south: 32, east: -59, north: 34 }, 20, ['20/-100'])
    ).toEqual([]);
  });

  it('does not fetch the next tile row when the viewport ends below its origin', () => {
    // north = 39.9 stays inside the lat-20 row. Upstream deflock's ceil() math
    // would also pull the non-intersecting 40/* row; our floor() must not.
    expect(
      visibleTileKeys({ west: -82, south: 32, east: -81, north: 39.9 }, 20, AVAILABLE)
    ).toEqual(['20/-100']);
  });
});

describe('proxiedTileTemplate', () => {
  it('rewrites the CDN prefix onto the proxy and keeps the ?v= cache-buster', () => {
    expect(
      proxiedTileTemplate(
        'https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1788006947',
        '/deflock-tiles'
      )
    ).toBe('/deflock-tiles/{lat}/{lon}.json?v=1788006947');
  });

  it('degrades to a plain proxy template for an unexpected host or missing placeholders', () => {
    expect(
      proxiedTileTemplate('https://elsewhere.example/x/{lat}/{lon}.json', '/deflock-tiles')
    ).toBe('/deflock-tiles/{lat}/{lon}.json');
    // Right host but no {lat}/{lon} placeholders — degrade rather than emit a
    // template that would aim every tile fetch at the same URL.
    expect(
      proxiedTileTemplate('https://cdn.deflock.me/regions/all.json?v=123', '/deflock-tiles')
    ).toBe('/deflock-tiles/{lat}/{lon}.json');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeIndex() {
  return {
    expiration_utc: Math.floor(Date.now() / 1000) + 3600, // Unix SECONDS, 1h out
    regions: ['20/-100', '20/-80'],
    tile_url: 'https://cdn.deflock.me/regions/{lat}/{lon}.json?v=123',
    tile_size_degrees: 20,
  };
}

describe('createTileLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fetches the index plus visible tiles, reports cameras, and caches tiles', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return jsonResponse(makeIndex());
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([
          { id: 1, lat: 34.8, lon: -82.4, tags: { manufacturer: 'Flock Safety' } },
          { id: 2, lat: 34.9, lon: -82.3 },
        ]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const updates: number[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => updates.push(cams.length) });

    await loader.loadViewport(SC_INLAND);
    expect(updates).toEqual([2]);

    // Same viewport again: everything cached — no new fetches, no new emit.
    await loader.loadViewport(SC_INLAND);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([2]);
  });

  it('dedupes cameras appearing in more than one tile by OSM id', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return jsonResponse(makeIndex());
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([
          { id: 1, lat: 34.8, lon: -82.4 },
          { id: 7, lat: 33.0, lon: -80.01 },
        ]);
      if (url === '/deflock-tiles/20/-80.json?v=123')
        return jsonResponse([
          { id: 7, lat: 33.0, lon: -80.01 }, // duplicate of the one above
          { id: 8, lat: 32.78, lon: -79.93 },
        ]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let latest: unknown[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => (latest = cams) });
    await loader.loadViewport({ west: -81.5, south: 32.5, east: -79.5, north: 34.5 });

    expect(latest).toHaveLength(3); // ids 1, 7, 8 — id 7 once
  });

  it('falls back once when the index fails, then backs off instead of retrying', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return new Response('bad', { status: 502 });
      if (url === '/camera-data.json')
        return jsonResponse([{ id: 9, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const updates: number[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => updates.push(cams.length) });

    await loader.loadViewport(SC_INLAND);
    await loader.loadViewport(SC_INLAND); // repeated moveend within the back-off window
    await loader.loadViewport(SC_INLAND);

    expect(updates).toEqual([1]);
    const calls = fetchMock.mock.calls.map(([u]) => u);
    // Back-off latch: ONE index attempt and ONE fallback fetch across all
    // three loadViewport calls — an index outage must not retry-storm.
    expect(calls.filter((u) => u === '/deflock-tiles/index.json')).toHaveLength(1);
    expect(calls.filter((u) => u === '/camera-data.json')).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('on a tile failure: falls back once, live records win, failed tile is not re-stormed', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return jsonResponse(makeIndex());
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([
          { id: 1, lat: 34.8, lon: -82.4, tags: { manufacturer: 'Flock Safety' } },
        ]);
      if (url === '/deflock-tiles/20/-80.json?v=123')
        return new Response('bad', { status: 500 });
      if (url === '/camera-data.json')
        return jsonResponse([
          // Same OSM id as the live tile but STALE properties — must lose.
          { id: 1, lat: 34.0, lon: -82.0, tags: { manufacturer: 'Stale Snapshot' } },
          { id: 3, lat: 34.7, lon: -82.5 },
        ]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let latest: DeflockCamera[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => (latest = cams) });
    const COAST = { west: -81.5, south: 32.5, east: -79.5, north: 34.5 };
    await loader.loadViewport(COAST);

    // Live id 1 + fallback-only id 3. Precedence is deterministic: the LIVE
    // record's properties survive; the snapshot only fills in missing ids.
    expect(latest).toHaveLength(2);
    const cam1 = latest.find((c) => c.id === 1);
    expect(cam1?.tags?.manufacturer).toBe('Flock Safety');
    expect(cam1?.lat).toBe(34.8);

    await loader.loadViewport(COAST); // repeated moveend on the same viewport
    const calls = fetchMock.mock.calls.map(([u]) => u);
    // Failed-tile latch: 20/-80 was attempted exactly once, fallback once.
    expect(calls.filter((u) => u === '/deflock-tiles/20/-80.json?v=123')).toHaveLength(1);
    expect(calls.filter((u) => u === '/camera-data.json')).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('issues exactly one index fetch for concurrent loadViewport calls', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return jsonResponse(makeIndex());
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([{ id: 1, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const loader = createTileLoader({ onUpdate: () => {} });
    // Overlapping calls (map load + an early moveend): single-flight index.
    await Promise.all([loader.loadViewport(SC_INLAND), loader.loadViewport(SC_INLAND)]);

    const calls = fetchMock.mock.calls.map(([u]) => u);
    expect(calls.filter((u) => u === '/deflock-tiles/index.json')).toHaveLength(1);
    expect(calls.filter((u) => u === '/deflock-tiles/20/-100.json?v=123')).toHaveLength(1);
  });

  it('clamps a stalled/past expiration_utc so moveend does not refetch the index every time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json')
        // Already-past expiration — without the 60 s clamp this would force a
        // refetch-all on every single moveend.
        return jsonResponse({ ...makeIndex(), expiration_utc: Math.floor(Date.now() / 1000) - 100 });
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([{ id: 1, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const loader = createTileLoader({ onUpdate: () => {} });
    await loader.loadViewport(SC_INLAND);
    await loader.loadViewport(SC_INLAND); // immediately after — inside the 60 s clamp

    expect(
      fetchMock.mock.calls.filter(([u]) => u === '/deflock-tiles/index.json')
    ).toHaveLength(1);
  });

  it('after expiry, refreshes the index and refetches tiles with the new ?v=', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    let indexFetches = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') {
        indexFetches += 1;
        return jsonResponse({
          expiration_utc: Math.floor(Date.now() / 1000) + 3600,
          regions: ['20/-100'],
          tile_url: `https://cdn.deflock.me/regions/{lat}/{lon}.json?v=${indexFetches === 1 ? 111 : 222}`,
          tile_size_degrees: 20,
        });
      }
      if (url.startsWith('/deflock-tiles/20/-100.json?v='))
        return jsonResponse([{ id: 1, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const loader = createTileLoader({ onUpdate: () => {} });
    await loader.loadViewport(SC_INLAND);
    vi.setSystemTime(Date.now() + 3601_000); // cross expiration_utc
    await loader.loadViewport(SC_INLAND);

    const calls = fetchMock.mock.calls.map(([u]) => u);
    expect(calls.filter((u) => u === '/deflock-tiles/index.json')).toHaveLength(2);
    // The rotated ?v= invalidated the tile cache: the SAME tile is refetched
    // through the NEW template.
    expect(calls).toContain('/deflock-tiles/20/-100.json?v=111');
    expect(calls).toContain('/deflock-tiles/20/-100.json?v=222');
  });

  it('keeps cached tiles when a refreshed index has an unchanged tile_url', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json')
        return jsonResponse({ ...makeIndex(), expiration_utc: Math.floor(Date.now() / 1000) + 3600 });
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([{ id: 1, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const loader = createTileLoader({ onUpdate: () => {} });
    await loader.loadViewport(SC_INLAND);
    vi.setSystemTime(Date.now() + 3601_000);
    await loader.loadViewport(SC_INLAND);

    const calls = fetchMock.mock.calls.map(([u]) => u);
    expect(calls.filter((u) => u === '/deflock-tiles/index.json')).toHaveLength(2);
    // Same ?v= — loadedTiles must NOT be cleared, so no tile refetch.
    expect(calls.filter((u) => u === '/deflock-tiles/20/-100.json?v=123')).toHaveLength(1);
  });

  it('discards a tile response that resolves after the index ?v= rotates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    let indexFetches = 0;
    let releaseStaleTile!: (res: Response) => void;
    const staleTileGate = new Promise<Response>((resolve) => (releaseStaleTile = resolve));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') {
        indexFetches += 1;
        return jsonResponse({
          expiration_utc: Math.floor(Date.now() / 1000) + 3600,
          regions: ['20/-100'],
          tile_url: `https://cdn.deflock.me/regions/{lat}/{lon}.json?v=${indexFetches === 1 ? 111 : 222}`,
          tile_size_degrees: 20,
        });
      }
      if (url === '/deflock-tiles/20/-100.json?v=111') return staleTileGate; // stalls in flight
      if (url === '/deflock-tiles/20/-100.json?v=222')
        return jsonResponse([{ id: 2, lat: 34.9, lon: -82.3, tags: { manufacturer: 'Fresh' } }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let latest: DeflockCamera[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => (latest = cams) });

    const first = loader.loadViewport(SC_INLAND); // v=111 tile request stalls in flight
    await vi.advanceTimersByTimeAsync(0); // index resolved; tile v=111 now in flight
    vi.setSystemTime(Date.now() + 3601_000); // cross expiration_utc → ?v= rotates to 222
    await loader.loadViewport(SC_INLAND); // old inflight entry must not block this fetch
    expect(latest.map((c) => c.tags?.manufacturer)).toEqual(['Fresh']);

    // NOW the old-generation request resolves — with stale-version data.
    releaseStaleTile(
      jsonResponse([{ id: 1, lat: 34.8, lon: -82.4, tags: { manufacturer: 'Stale' } }])
    );
    await first;

    // The stale completion was discarded: not merged, no re-emit of old data.
    expect(latest.map((c) => c.tags?.manufacturer)).toEqual(['Fresh']);

    // And it did not mark the key "loaded" either — v=222 is the cached
    // version, so another viewport pass issues no further tile fetch.
    await loader.loadViewport(SC_INLAND);
    const calls = fetchMock.mock.calls.map(([u]) => u);
    expect(calls.filter((u) => u === '/deflock-tiles/20/-100.json?v=222')).toHaveLength(1);
  });

  it.each([
    ['missing regions', { ...makeIndex(), regions: undefined }],
    ['tile_size_degrees of 0', { ...makeIndex(), tile_size_degrees: 0 }],
    ['missing tile_size_degrees', { ...makeIndex(), tile_size_degrees: undefined }],
    [
      'tile_url missing its {lat}/{lon} placeholders',
      { ...makeIndex(), tile_url: 'https://cdn.deflock.me/regions/all.json?v=123' },
    ],
  ])('falls back and resolves when the index is malformed: %s', async (_name, badIndex) => {
    // JSON.stringify drops undefined-valued keys, so the "missing" cases
    // arrive over the wire with the field genuinely absent.
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json') return jsonResponse(badIndex);
      if (url === '/camera-data.json')
        return jsonResponse([{ id: 9, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const updates: number[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => updates.push(cams.length) });

    // Must RESOLVE — never throw, never hang in the tile math (a
    // tile_size_degrees of 0 would loop forever without validation).
    await loader.loadViewport(SC_INLAND);

    expect(updates).toEqual([1]);
    expect(fetchMock.mock.calls.filter(([u]) => u === '/camera-data.json')).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('skips tile fetches when the viewport intersects more tiles than the cap', async () => {
    const worldRegions: string[] = [];
    for (let lat = -60; lat <= 60; lat += 20)
      for (let lon = -180; lon < 180; lon += 20) worldRegions.push(`${lat}/${lon}`);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/deflock-tiles/index.json')
        return jsonResponse({ ...makeIndex(), regions: worldRegions });
      if (url === '/deflock-tiles/20/-100.json?v=123')
        return jsonResponse([{ id: 1, lat: 34.8, lon: -82.4 }]);
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const updates: number[] = [];
    const loader = createTileLoader({ onUpdate: (cams) => updates.push(cams.length) });

    // Fully zoomed-out world view: dozens of intersecting ~1-2.8 MB tiles
    // (30-60 MB live). The loader must skip the fetch and keep whatever is
    // already loaded. No fallback either — this is a deliberate skip, not a
    // failure.
    await loader.loadViewport({ west: -179, south: -59, east: 179, north: 59 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // index only
    expect(updates).toEqual([]);

    // The cap must not latch: a normal SC viewport afterwards loads fine.
    await loader.loadViewport(SC_INLAND);
    expect(fetchMock.mock.calls.map(([u]) => u)).toContain('/deflock-tiles/20/-100.json?v=123');
    expect(updates).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tile-loader.test.ts`
Expected: FAIL — cannot resolve `../src/scripts/map/tile-loader.js` (module does not exist).

- [ ] **Step 3: Implement the module**

Create `src/scripts/map/tile-loader.ts`:

```ts
/**
 * Per-viewport Deflock CDN tile loader.
 *
 * Modeled on deflock.org's tile store (webapp/src/stores/tiles.ts in the
 * FoggedLens/deflock repo): fetch the tile index once, then fetch each
 * 20-degree tile intersecting the viewport that is not already cached, and
 * dedupe cameras across tiles by OSM id. Two deliberate deviations from
 * upstream (see docs/plans/2026-08-29-camera-map-live-data-design.md):
 * exact floor() tile-intersection math instead of upstream's over-fetching
 * ceil(), and expiration_utc treated as Unix SECONDS (upstream passes it to
 * new Date() unscaled, a latent bug).
 *
 * All requests go through the same-origin /deflock-tiles/* proxy —
 * netlify.toml in production, the Vite dev proxy in astro.config.mjs under
 * `astro dev` — because cdn.deflock.me only sends CORS headers for deflock.org.
 *
 * Failure policy: never throw. On the first failed (or contract-invalid)
 * index fetch or failed tile fetch, load the committed snapshot (fallbackUrl)
 * once so the map is never empty — then back off: a failed index latches a
 * 60 s cooldown, and a failed tile is not retried until the index's ?v=
 * rotates, so repeated moveend events never retry-storm. Tile requests are
 * generation-tagged with the index tile_url they were issued under; a
 * completion that arrives after the ?v= has rotated is discarded rather than
 * cached, so stale-version data can never satisfy the new generation. Live
 * tile records always take precedence over fallback records with the same
 * OSM id.
 */

export interface DeflockCamera {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface TileIndex {
  /** Unix timestamp in SECONDS (observed: 1788010667 ≈ 2026-08-29). */
  expiration_utc: number;
  /** Available tile-origin keys, e.g. "20/-80". */
  regions: string[];
  /** e.g. "https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1788006947" */
  tile_url: string;
  /** Observed: 20. */
  tile_size_degrees: number;
}

export interface TileLoaderOptions {
  /** Called with ALL currently loaded cameras (deduped by id) after data changes. */
  onUpdate: (cameras: DeflockCamera[]) => void;
  /** Same-origin proxy prefix. Default '/deflock-tiles'. */
  proxyPrefix?: string;
  /** Snapshot fetched at most once if the CDN fails. Default '/camera-data.json'. */
  fallbackUrl?: string;
}

const CDN_REGIONS_PREFIX = 'https://cdn.deflock.me/regions';

/** Minimum index lifetime; also the cooldown latched after an index failure. */
const INDEX_MIN_TTL_MS = 60_000;

/**
 * Max tiles fetched for a single viewport. The live index lists ~54 regions
 * at ~1-2.8 MB each; a zoomed-out world view intersecting them all would pull
 * 30-60 MB. SC/regional viewports intersect at most a handful of tiles and
 * are unaffected. (A map minZoom would also bound this, but that touches map
 * init — out of scope; noted as a follow-up alternative in the design doc.)
 */
const MAX_TILES_PER_VIEWPORT = 8;

/**
 * Tile-origin keys ("lat/lon") for every tile intersecting the bounds.
 * A tile with origin o covers [o, o+size), so intersecting origins run from
 * floor(min/size)*size to floor(max/size)*size inclusive. Keys not in the
 * index's `available` list are skipped.
 *
 * Wrapped bounds are NOT normalized: this map is SC-focused and globe-wrapped
 * views (west > east across the antimeridian, or longitudes outside ±180) are
 * unsupported. Such bounds are still safe here — west > east makes the lon
 * loop run zero times, and out-of-range origins are never in `available`.
 */
export function visibleTileKeys(
  bounds: TileBounds,
  sizeDeg: number,
  available: string[]
): string[] {
  // Defense-in-depth: a non-finite or non-positive size would make the loops
  // below non-terminating. createTileLoader validates the index before ever
  // calling this, but keep the exported function safe standalone.
  if (!Number.isFinite(sizeDeg) || sizeDeg <= 0) return [];
  const keys: string[] = [];
  const latEnd = Math.floor(bounds.north / sizeDeg) * sizeDeg;
  const lonEnd = Math.floor(bounds.east / sizeDeg) * sizeDeg;
  for (let lat = Math.floor(bounds.south / sizeDeg) * sizeDeg; lat <= latEnd; lat += sizeDeg) {
    for (let lon = Math.floor(bounds.west / sizeDeg) * sizeDeg; lon <= lonEnd; lon += sizeDeg) {
      const key = `${lat}/${lon}`;
      if (available.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Rewrite the CDN's tile_url template onto the same-origin proxy, preserving
 * the ?v= cache-buster. If the CDN ever changes host — or the template loses
 * its {lat}/{lon} placeholders — degrade to a plain proxy template rather
 * than emit tile URLs that could never resolve (the proxy target is pinned
 * in netlify.toml anyway). isValidTileIndex already rejects a
 * placeholder-less tile_url before the loader gets here; this keeps the
 * exported helper safe standalone.
 */
export function proxiedTileTemplate(tileUrl: string, proxyPrefix: string): string {
  const usable =
    tileUrl.startsWith(CDN_REGIONS_PREFIX) &&
    tileUrl.includes('{lat}') &&
    tileUrl.includes('{lon}');
  return usable
    ? proxyPrefix + tileUrl.slice(CDN_REGIONS_PREFIX.length)
    : `${proxyPrefix}/{lat}/{lon}.json`;
}

/**
 * Contract validation for the CDN index, run on every fetched index BEFORE it
 * is stored. A malformed index must never make the loader throw or hang: a
 * zero/negative/missing tile_size_degrees would make visibleTileKeys
 * non-terminating (or NaN math) without this gate. tile_url must carry both
 * the {lat} and {lon} placeholders — a template without them would aim every
 * tile fetch at the same URL, so it is rejected here (the loader falls back
 * to the snapshot) instead of a bad template ever being stored.
 */
function isValidTileIndex(value: unknown): value is TileIndex {
  if (typeof value !== 'object' || value === null) return false;
  const idx = value as Record<string, unknown>;
  return (
    typeof idx.expiration_utc === 'number' &&
    Number.isFinite(idx.expiration_utc) &&
    Array.isArray(idx.regions) &&
    idx.regions.every((r) => typeof r === 'string') &&
    typeof idx.tile_url === 'string' &&
    idx.tile_url.includes('{lat}') &&
    idx.tile_url.includes('{lon}') &&
    typeof idx.tile_size_degrees === 'number' &&
    Number.isFinite(idx.tile_size_degrees) &&
    idx.tile_size_degrees > 0
  );
}

export function createTileLoader(opts: TileLoaderOptions) {
  const proxyPrefix = opts.proxyPrefix ?? '/deflock-tiles';
  const fallbackUrl = opts.fallbackUrl ?? '/camera-data.json';

  let index: TileIndex | null = null;
  let indexExpiresAtMs = 0;
  /** Single-flight: concurrent loadViewport calls share one index request. */
  let indexInflight: Promise<TileIndex | null> | null = null;
  /** After an index failure, no re-attempt before this time (back-off latch). */
  let indexRetryAtMs = 0;
  const loadedTiles = new Set<string>();
  /** Tiles that failed under the current ?v=; retried only after it rotates. */
  const failedTiles = new Set<string>();
  /**
   * In-flight tile fetches, keyed `${generation}|${tileKey}` where the
   * generation is the index tile_url the request was issued under. Keying by
   * generation means a request still in flight for a rotated-away ?v= never
   * blocks — or satisfies — the new generation's fetch. loadedTiles and
   * failedTiles stay keyed by bare tile key: they are cleared on rotation and
   * stale-generation completions are discarded before insert (see fetchTile),
   * so they only ever hold current-generation entries.
   */
  const inflight = new Set<string>();
  /** Live CDN cameras — always win over fallback records with the same id. */
  const liveById = new Map<number, DeflockCamera>();
  /** Snapshot cameras — only fill in ids the live tiles did not supply. */
  const fallbackById = new Map<number, DeflockCamera>();
  let fallbackUsed = false;

  function emit(): void {
    // Deterministic precedence: seed with fallback, overwrite with live —
    // regardless of which source finished fetching last.
    const combined = new Map(fallbackById);
    for (const [id, cam] of liveById) combined.set(id, cam);
    opts.onUpdate([...combined.values()]);
  }

  function merge(target: Map<number, DeflockCamera>, cameras: DeflockCamera[]): void {
    for (const cam of cameras) target.set(cam.id, cam);
  }

  /** Fetch the committed snapshot at most once; emits on success. */
  async function useFallback(): Promise<void> {
    if (fallbackUsed) return;
    fallbackUsed = true;
    try {
      const res = await fetch(fallbackUrl);
      if (!res.ok) throw new Error(`Fallback responded ${res.status}`);
      merge(fallbackById, await res.json());
      emit();
    } catch (err) {
      console.error('Camera data fallback failed:', err);
    }
  }

  async function fetchIndex(): Promise<TileIndex | null> {
    try {
      const res = await fetch(`${proxyPrefix}/index.json`);
      if (!res.ok) throw new Error(`Tile index responded ${res.status}`);
      const next: unknown = await res.json();
      if (!isValidTileIndex(next)) throw new Error('Tile index failed contract validation');
      // Clamp to a 60 s minimum lifetime: a stalled or already-past
      // expiration_utc must not force an index refetch on every moveend.
      indexExpiresAtMs = Math.max(next.expiration_utc * 1000, Date.now() + INDEX_MIN_TTL_MS);
      if (index !== null && index.tile_url !== next.tile_url) {
        // The ?v= cache-buster actually rotated: cached tiles are stale.
        // (An unchanged tile_url keeps the caches — no refetch churn.)
        loadedTiles.clear();
        failedTiles.clear();
      }
      index = next;
      return index;
    } catch (err) {
      console.error('Failed to load camera tile index:', err);
      indexRetryAtMs = Date.now() + INDEX_MIN_TTL_MS;
      await useFallback();
      // A stale-but-valid previous index keeps serving during the back-off.
      return index;
    }
  }

  function ensureIndex(): Promise<TileIndex | null> {
    if (indexInflight) return indexInflight; // single-flight
    if (index && Date.now() < indexExpiresAtMs) return Promise.resolve(index);
    if (Date.now() < indexRetryAtMs) return Promise.resolve(index); // backing off
    indexInflight = fetchIndex().finally(() => {
      indexInflight = null;
    });
    return indexInflight;
  }

  /**
   * @param gen the index tile_url (generation) this request was issued under.
   * @returns true if the tile fetched and merged successfully.
   */
  async function fetchTile(key: string, template: string, gen: string): Promise<boolean> {
    const flightKey = `${gen}|${key}`;
    if (loadedTiles.has(key) || failedTiles.has(key) || inflight.has(flightKey)) return false;
    inflight.add(flightKey);
    try {
      const res = await fetch(template.replace('{lat}/{lon}', key));
      if (!res.ok) throw new Error(`Tile ${key} responded ${res.status}`);
      const cameras: DeflockCamera[] = await res.json();
      if (index?.tile_url !== gen) {
        // The index's ?v= rotated while this request was in flight: this
        // payload is the OLD tile version. Discard it — merging it or marking
        // the key loaded would let stale data suppress the new generation's
        // fetch.
        return false;
      }
      merge(liveById, cameras);
      loadedTiles.add(key);
      return true;
    } catch (err) {
      console.error(`Failed to load camera tile ${key}:`, err);
      if (index?.tile_url === gen) {
        // Latch the failure: no per-moveend retry storm. The key becomes
        // eligible again when the index's ?v= rotates (failedTiles is
        // cleared). A stale-generation failure is NOT latched — the sets
        // already belong to the newer generation.
        failedTiles.add(key);
        await useFallback();
      }
      return false;
    } finally {
      inflight.delete(flightKey);
    }
  }

  return {
    /**
     * Fetch any missing tiles for the viewport, then emit the merged camera
     * set if anything new arrived. Resolves when done; never rejects.
     */
    async loadViewport(bounds: TileBounds): Promise<void> {
      const idx = await ensureIndex();
      if (!idx) return;
      const intersecting = visibleTileKeys(bounds, idx.tile_size_degrees, idx.regions);
      // Bound the worst case: a world/continent viewport can intersect dozens
      // of tiles. Skip the fetch entirely and keep the currently loaded
      // cameras; SC/regional viewports never hit this.
      if (intersecting.length > MAX_TILES_PER_VIEWPORT) return;
      const template = proxiedTileTemplate(idx.tile_url, proxyPrefix);
      const keys = intersecting.filter(
        (k) => !loadedTiles.has(k) && !failedTiles.has(k) && !inflight.has(`${idx.tile_url}|${k}`)
      );
      if (keys.length === 0) return;
      const results = await Promise.all(keys.map((k) => fetchTile(k, template, idx.tile_url)));
      if (results.some(Boolean)) emit();
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tile-loader.test.ts`
Expected: ALL tests PASS (4 visibleTileKeys + 2 proxiedTileTemplate + 14 createTileLoader — the `it.each` malformed-index case counts as 4).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/map/tile-loader.ts tests/tile-loader.test.ts
git commit -m "feat(map): per-viewport Deflock CDN tile loader with snapshot fallback"
```

---

### Task 5: Wire the loader into MapSection.astro

**Files:**
- Modify: `src/components/MapSection.astro` (the `<script>` block only, lines 208–270)

- [ ] **Step 1: Replace the one-shot fetch with loader wiring**

In `src/components/MapSection.astro`, replace everything from `import type { MapHandle } ...` (line 209) through the end of `initCameraMap` (line 270) with the code below. Everything from `/** Idempotent: every caller shares one map instance. */` (line 272) to the end of the script stays **exactly as it is**.

```ts
  import type { MapHandle } from '../scripts/map/core.js';
  import type { GeoJSONSource } from 'maplibre-gl';
  import type { DeflockCamera } from '../scripts/map/tile-loader.js';

  const MAP_CENTER: [number, number] = [-82.39, 34.85];
  const MAP_ZOOM = 11;

  let mapReady: Promise<MapHandle> | null = null;

  async function initCameraMap(): Promise<MapHandle> {
    await import('maplibre-gl/dist/maplibre-gl.css');
    const { createMap } = await import('../scripts/map/core.js');
    const { addCameraLayers, parseDirection } = await import('../scripts/map/layers/cameras.js');
    const { createTileLoader } = await import('../scripts/map/tile-loader.js');

    const handle = createMap({
      container: 'camera-map',
      style: '/map-style.json',
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
    });

    // EXACT property mapping the popups, direction cones, and OSM links depend
    // on — unchanged from the previous one-shot loader. Do not alter fields.
    const toGeoJSON = (cameras: DeflockCamera[]): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: cameras.map((cam) => {
        const direction = parseDirection(cam.tags);
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [cam.lon, cam.lat],
          },
          properties: {
            id: cam.id,
            direction,
            hasDirection: direction !== null,
            manufacturer: cam.tags?.manufacturer || null,
            operator: cam.tags?.operator || null,
            wikimedia_commons: cam.tags?.wikimedia_commons || null,
          },
        };
      }),
    });

    handle.map.on('load', () => {
      // Source + layers are added exactly once, seeded empty. All data arrives
      // through source.setData() below — never re-add the source or layers.
      addCameraLayers(handle.map, { type: 'FeatureCollection', features: [] });

      const loader = createTileLoader({
        onUpdate(cameras) {
          const source = handle.map.getSource('cameras') as GeoJSONSource | undefined;
          source?.setData(toGeoJSON(cameras));
        },
      });

      const viewportBounds = () => {
        const b = handle.map.getBounds();
        return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      };

      // Initial load is immediate; moveend is debounced on a 250 ms trailing
      // edge so a continuous pan/zoom gesture issues one trailing load
      // instead of one per intermediate moveend.
      void loader.loadViewport(viewportBounds());
      let moveendTimer: ReturnType<typeof setTimeout> | undefined;
      handle.map.on('moveend', () => {
        clearTimeout(moveendTimer);
        moveendTimer = setTimeout(() => void loader.loadViewport(viewportBounds()), 250);
      });
    });

    return handle;
  }
```

Notes for the implementer:

- The local `interface DeflockCamera` declaration (old lines 211–216) is **deleted** — the type now comes from `tile-loader.ts`. All three new top-of-script imports are `import type`, which esbuild erases; the runtime module arrives via the dynamic `await import(...)` like the others.
- The old `try { fetch('/camera-data.json') ... } catch` disappears entirely; failure logging now lives inside the loader.
- The moveend debounce is deliberately trailing-edge only: the `loadViewport` on map `load` runs immediately (no 250 ms delay before the first cameras appear); only subsequent pans/zooms coalesce. `clearTimeout(undefined)` is a legal no-op, so no guard is needed on the first event.

- [ ] **Step 2: Verify live tile loading in the dev server**

Run (background): `node node_modules/astro/astro.js dev --host 127.0.0.1`
Open `http://127.0.0.1:4321/` in a browser at desktop width, scroll to the map section, and check the network tab:

- `/deflock-tiles/index.json` fetched once, then `/deflock-tiles/20/-100.json?v=...` — and **no** request for `/camera-data.json`.
- Clusters render over Upstate SC as before.
- Pan the map east until the Charleston area (~lon −79.9) enters the viewport: a request for `/deflock-tiles/20/-80.json?v=...` fires (~250 ms after the pan settles — the moveend debounce) and coastal cameras appear. A rapid multi-step pan issues ONE trailing tile request, not one per intermediate stop.
- Console shows zero errors.

- [ ] **Step 3: Verify the fallback path**

Temporarily break the dev proxy: in `astro.config.mjs`, change the `'/deflock-tiles'` proxy `target` to `'https://127.0.0.1:1'`. Reload the page:

- Console logs `Failed to load camera tile index: ...` (an error is expected here — this is the failure path).
- A single request for `/camera-data.json` fires and the map still shows cameras.

Revert the `target` to `'https://cdn.deflock.me'` and confirm the live path works again. `git diff astro.config.mjs` must show no changes.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat(map): load cameras per-viewport from Deflock CDN tiles"
```

---

### Task 6: Decluster at zoom 13

**Files:**
- Modify: `src/scripts/map/layers/cameras.ts` (line 180)

- [ ] **Step 1: Change clusterMaxZoom**

In `addCameraLayers`, change the `cameras` source config from:

```ts
  map.addSource('cameras', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 15,
    clusterRadius: 50,
  });
```

to:

```ts
  map.addSource('cameras', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 12, // individual dots/cones from zoom 13 (was 15)
    clusterRadius: 50,
  });
```

`clusterRadius` and every paint/layout property in this file stay untouched.

- [ ] **Step 2: Verify visually**

With the dev server running, zoom into downtown Greenville (click a cluster once or twice). Individual red dots and direction cones must replace clusters at city scale (zoom 13) — noticeably earlier than before, where they only appeared near street level (zoom 16).

- [ ] **Step 3: Commit**

```bash
git add src/scripts/map/layers/cameras.ts
git commit -m "feat(map): uncluster camera dots from zoom 13"
```

---

### Task 7: Copy truth-up verification (no edits expected)

**Files:**
- Read only: `src/components/MapSection.astro` (lines 68, 109), `src/content/blog/how-to-fight-alpr-surveillance-sc.md` (lines 20, 107)

- [ ] **Step 1: Verify the freshness claims are now accurate**

Confirm each of these now describes reality (the map reads live CDN tiles that Deflock refreshes hourly):

1. `MapSection.astro` line 68 — "Community sourced · Updated hourly": **accurate now** (was false while the map served the weekly snapshot). Keep unchanged.
2. `MapSection.astro` line 109 — attribution "Camera data from Deflock.org, a community-sourced map…": makes no freshness claim. Keep unchanged.
3. Blog post lines 20 and 107 — "updates hourly" / "updated hourly": **accurate now**. Keep unchanged.

Expected outcome: zero file changes, nothing to commit. Record in the PR description: "Copy truth-up verified: the 'updated hourly' claims on the map section and in the how-to-fight post are accurate now that the map reads live CDN tiles; no copy edits needed."

If any wording is found NOT to match this expectation (e.g. the lines have drifted since 2026-08-29), stop and flag it rather than editing — copy changes route through the copydesk workflow.

---

### Task 8: Full regression smoke test (final gate)

**Files:** none modified. This is the camera-map smoke test required by the repo's regression policy for any PR touching the map.

Preview-server quirk: start the dev server with `node node_modules/astro/astro.js dev --host 127.0.0.1` (npm/npx don't resolve in preview tools on Windows, and Astro binds IPv6-only without `--host 127.0.0.1`). The `.claude/launch.json` `dev` config already does this — `preview_start` with name `dev` is equivalent.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests pass — `tests/tile-loader.test.ts`, `tests/config-guards.test.ts` (including the two new guards), and the pre-existing events/function tests. The config-guards `beforeAll` performs a full Astro build, which also proves the site builds with the new module.

- [ ] **Step 2: Desktop smoke test (1280×800)**

With the dev server running, load `http://127.0.0.1:4321/` and scroll to the map. Verify ALL of:

1. Map loads; network shows `/deflock-tiles/index.json` then `/deflock-tiles/20/-100.json?v=...`; no `/camera-data.json` request.
2. At the initial state view (zoom 11), cameras render as **clusters** with count labels.
3. Zoom in (cluster clicks / nav control) to city-block scale: **individual dots appear at zoom 13** — red dots for direction-less cameras, rotated cones for directional ones.
4. Pan east along I-26 to the SC coast (Charleston, ~lon −79.9): network fires `/deflock-tiles/20/-80.json?v=...` (~250 ms after the pan settles) and **coastal cameras render** — this is the acceptance proof of per-viewport loading (the old single-tile snapshot had zero cameras east of −80°).
5. Zoom the map fully out to a world/continent view: **no burst of tile requests** (the 8-tile per-viewport cap skips oversized viewports), already-loaded cameras stay rendered, and the console stays clean. Zoom back to SC: tiles still load normally.
6. Click a camera dot and a cone: popup renders with image (vendor reference or wikimedia), manufacturer/operator/direction lines as applicable, and a working "VIEW ON OSM" link.
7. Cluster click still zooms toward expansion; the scroll-zoom toggle button still works.
8. Console: **zero errors** end to end. (CSP is not enforced under `astro dev` — the CSP check happens in Step 4.)

- [ ] **Step 3: Mobile smoke test (375×812)**

Resize to the mobile preset (or use `public/dev-preview.html` side-by-side), reload:

1. The map section shows the "Explore the camera map →" button instead of the map.
2. Tap it: the map appears, tiles load (same network requests as desktop), clusters render.
3. Zoom to 13+: individual dots/cones appear; a popup opens on tap.
4. Console: zero errors.

- [ ] **Step 4: Deploy-preview verification (after the PR opens)**

On the Netlify deploy preview URL for the PR branch:

1. `/deflock-tiles/index.json` returns 200 with the index JSON (proves the Netlify rewrite, which `astro dev` cannot exercise). From PowerShell: `curl.exe -s "https://<preview-url>/deflock-tiles/index.json"` (use `curl.exe`, not the bare `curl` Invoke-WebRequest alias), or just open the URL in the browser.
2. The homepage map loads tiles through the proxy; pan to the coast loads `20/-80.json`.
3. Console: **zero CSP violations** — specifically none for `/deflock-tiles/*` (connect-src) and none for popup images (`cms.deflock.me` vendor images; `commons.wikimedia.org` / `upload.wikimedia.org` thumbnails on cameras that have a `wikimedia_commons` tag — if you can't find one on-screen, the absence of any img-src violation while clicking several popups satisfies this).
4. Open `/events`: the network tab shows **zero** requests to `/deflock-tiles/*` or `/camera-data.json` (the events map must stay camera-free).

- [ ] **Step 5: Wrap up**

All boxes above checked → the branch is ready for review. Include in the PR description: the smoke-test results, the Task 7 copy-verification note, and the two deliberate upstream deviations (floor-based tile math; expiration seconds→ms) called out in the design spec.

---

## Self-Review Notes

- Spec coverage: proxy (Task 1–2) ✔, viewport loader with cache/expiry/dedupe/exact property mapping/setData/fallback (Tasks 4–5) ✔, decluster (Task 6) ✔, snapshot pipeline untouched (no task touches it) ✔, copy truth-up (Task 7) ✔, CSP img-src folded-in fix (Task 3) ✔, final smoke test incl. coast pan + world-view cap check + mobile + zero-console-error/CSP gates (Task 8) ✔.
- Reviewer hardening folded in (Codex + Fable review, 2026-08-29): index single-flight + 60 s failure back-off + expiry clamp + tile_url-change-gated cache clear (Task 4), failed-tile latch until the `?v=` rotates (Task 4), deterministic live-over-fallback precedence at emit time (Task 4), index contract validation incl. `tile_size_degrees > 0` so a malformed index can never throw or hang the tile math (Task 4), 8-tile per-viewport fetch cap with a map-`minZoom` alternative noted in the design doc (Task 4), 250 ms trailing moveend debounce with an immediate initial load (Task 5), Windows-safe `curl.exe`/`NUL` verification commands (Tasks 2 and 8), an expiry-crossing fake-timers regression test proving index refresh + tile refetch under the new `?v=` (Task 4), and the `visibleTileKeys` comment narrowed to state wrapped/antimeridian views are unsupported rather than implying handling (Task 4). Net test delta: 8 new createTileLoader tests, 2 amended.
- Post-approval polish (Codex round-2 non-blocking notes, 2026-08-29): `isValidTileIndex` now requires `tile_url` to carry both `{lat}` and `{lon}` placeholders — a placeholder-less template fails contract validation (snapshot fallback; the bad template is never stored) and `proxiedTileTemplate` independently degrades such a template to the plain proxy form for standalone safety. Tile requests are generation-tagged with the index `tile_url` they were issued under: an in-flight request whose generation no longer matches on completion is discarded instead of marking the key loaded, so a `?v=` rotation mid-flight can never poison the new generation's cache (inflight keys are `${generation}|${tileKey}`; loadedTiles/failedTiles stay bare-keyed since rotation clears them and stale completions never insert). Net test delta: +2 (one `it.each` malformed-`tile_url` case; one rotation-during-inflight race test) and one `proxiedTileTemplate` test amended — `tests/tile-loader.test.ts` now specifies 20 tests. Design-doc §2 prose synced to the approved loader behavior (tile_url-gated cache invalidation, 250 ms debounced moveend with immediate initial load, 8-tile viewport cap).
- Type consistency: `DeflockCamera`, `TileBounds`, `visibleTileKeys`, `proxiedTileTemplate`, `createTileLoader`, `loadViewport`, `onUpdate` are used with identical signatures in Tasks 4 and 5.
- The `cameras` source name, layer ids, and `addCameraLayers(map, geojson)` signature are unchanged from the existing `src/scripts/map/layers/cameras.ts` — only the `clusterMaxZoom` value changes.
