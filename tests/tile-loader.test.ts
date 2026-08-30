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
    // A sibling path that merely shares the "regions" prefix (no trailing
    // slash boundary) must NOT be treated as the CDN regions root — degrade.
    expect(
      proxiedTileTemplate(
        'https://cdn.deflock.me/regions-other/{lat}/{lon}.json?v=123',
        '/deflock-tiles'
      )
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
    [
      // Both placeholders present but NOT contiguous — fetchTile only replaces
      // the literal '{lat}/{lon}' token, so a non-adjacent template would aim
      // every tile fetch at the same URL. Must be rejected, not accepted.
      'tile_url with non-contiguous {lat} and {lon} placeholders',
      { ...makeIndex(), tile_url: 'https://cdn.deflock.me/regions/{lat}/x/{lon}.json?v=123' },
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
