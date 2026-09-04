import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from '@netlify/functions';

// A square covering SC coords (lon -83..-79, lat 33..35) in GeoJSON [lng, lat].
const scSquare = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-83, 33], [-79, 33], [-79, 35], [-83, 35], [-83, 33]]],
      },
    },
  ],
};

// Mock the districts files the function reads from disk. existsSync is how the
// function probes candidate districts dirs at runtime (see resolveDistrictsDir);
// returning true makes the first candidate resolve to the mocked bundle.
vi.mock('node:fs', () => ({
  existsSync: () => true, // state-outline.json is "present" in the first candidate dir
  readFileSync: (p: string) => JSON.stringify(scSquare), // state-outline + county-test both use it
  readdirSync: () => ['state-outline.json', 'county-test.json'],
}));

import handler from '../../netlify/functions/sc-camera-count.js';

const CDN_URL = 'https://cdn.deflock.me/regions/20/-100.json';
const CDN_CACHE = 'public, durable, s-maxage=86400, stale-while-revalidate=86400';

function call(url = 'https://deflocksc.org/api/sc-camera-count'): Promise<Response> {
  return handler(new Request(url), {} as unknown as Context);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/sc-camera-count — success', () => {
  it('returns the SC count, cache header, and calls the DeFlock CDN with a UA', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 1, lat: 34, lon: -81 }, // inside -> counts
          { id: 1, lat: 34, lon: -81 }, // dup -> deduped
          { id: 2, lat: 34.5, lon: -80 }, // inside -> counts
          { id: 3, lat: 40, lon: -100 }, // outside bbox -> excluded
        ]),
        { status: 200 },
      ),
    );

    const res = await call();
    const body = (await res.json()) as {
      scTotal: number;
      jurisdictions: number;
      stale: boolean;
      generatedAt: string;
    };

    expect(res.status).toBe(200);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe(CDN_CACHE);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.scTotal).toBe(2); // ids 1 (deduped) + 2; id 3 out of bbox
    expect(body.jurisdictions).toBe(1); // one non-zero key (county:test)
    expect(body.stale).toBe(false);
    expect(typeof body.generatedAt).toBe('string');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(CDN_URL);
    expect((opts as RequestInit).headers).toMatchObject({
      'User-Agent': expect.stringContaining('deflocksc-website'),
    });
    // The fetch is bounded by an abort timeout so a hung DeFlock fails soft
    // instead of riding the platform function timeout.
    expect((opts as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('GET /api/sc-camera-count — cache-key hardening', () => {
  it('rejects a cache-busting query WITHOUT touching DeFlock', async () => {
    // Netlify's default durable-cache key includes the query string, so
    // /api/sc-camera-count?bust=<rand> would miss the edge cache and hit DeFlock
    // on every request. A query-bearing request must never reach the upstream.
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));

    const res = await call('https://deflocksc.org/api/sc-camera-count?bust=123456');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/sc-camera-count — fail soft', () => {
  it('returns 200 { stale:true } uncached when the CDN is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 502 }));

    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 200 { stale:true } when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } when the CDN payload is not an array', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ oops: true }), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
  });

  it('returns 200 { stale:true } uncached for an EMPTY camera array (never caches 0)', async () => {
    // An empty upstream snapshot must not be cached as a valid {stale:false}
    // result for 24h; treat it as a soft failure.
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } with NO bogus total when ALL records are malformed', async () => {
    // A record missing an id, or with non-numeric coords, must not be counted
    // into a positive total. Every record here is malformed, so the all-or-nothing
    // check fails the payload and the endpoint fails soft rather than caching a
    // fabricated number.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { lat: 34, lon: -81 }, // no id
          { id: 9, lat: 'x', lon: 'y' }, // non-numeric coords
        ]),
        { status: 200 },
      ),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } uncached for a MIXED valid+malformed payload (no cached undercount)', async () => {
    // ALL-OR-NOTHING: a payload mixing well-formed and malformed records must NOT
    // be filtered down to the valid subset and cached — that would pin a 24h
    // undercount to the edge (and preprocess the live data differently from the
    // build path). ONE bad record fails the WHOLE snapshot soft. The two valid
    // records below (which alone would yield scTotal 2 / jurisdictions 1) must be
    // discarded, not counted. Proven by asserting NO scTotal field and no cache.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 1, lat: 34, lon: -81 }, // well-formed, inside SC
          { id: 2, lat: 34.5, lon: -80 }, // well-formed, inside SC
          { id: 3, lat: 'x', lon: 'y' }, // malformed -> poisons the whole payload
        ]),
        { status: 200 },
      ),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true }); // exactly { stale:true } — no scTotal, no jurisdictions
    expect(body.scTotal).toBeUndefined(); // proves no filtered undercount was cached
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('returns 200 { stale:true } uncached when the count is ZERO (no SC matches)', async () => {
    // Well-formed cameras that all fall outside SC -> scTotal 0. A zero total is
    // an upstream/compute anomaly and must never be cached for a day.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, lat: 40, lon: -100 }]), { status: 200 }),
    );
    const res = await call();
    const body = (await res.json()) as { stale: boolean; scTotal?: number };
    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: true });
    expect(body.scTotal).toBeUndefined();
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
    // The upstream WAS fetched (this is a compute anomaly, not a query reject).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 { stale:true } uncached when the fetch aborts (timeout)', async () => {
    // AbortSignal.timeout fires a TimeoutError; the handler must catch it and
    // fail soft rather than propagate to the platform timeout.
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('does not leak the upstream error message', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'));
    const body = await (await call()).text();
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.0.0.5');
  });
});
