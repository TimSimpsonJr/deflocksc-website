import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchDistricts, loadBoundary, geocodeAddress, _clearBoundaryCacheForTesting } from './district-matcher.js';

// Helper: create a simple GeoJSON FeatureCollection with one polygon feature
function makeFC(district: string, coords: number[][][]) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { district },
      geometry: { type: 'Polygon', coordinates: coords },
    }],
  };
}

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  _clearBoundaryCacheForTesting();
});

describe('loadBoundary', () => {
  it('fetches and returns a valid FeatureCollection', async () => {
    const fc = makeFC('1', [[[-80, 33], [-79, 33], [-79, 34], [-80, 34], [-80, 33]]]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fc),
    });

    const result = await loadBoundary('test-boundary.json');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('FeatureCollection');
    expect(result!._bbox).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/districts/test-boundary.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('returns null and caches failure on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await loadBoundary('missing.json');
    expect(result).toBeNull();

    // Second call should not fetch again (cached null)
    const result2 = await loadBoundary('missing.json');
    expect(result2).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for invalid GeoJSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ type: 'Feature', properties: {} }),
    });

    const result = await loadBoundary('bad-geojson.json');
    expect(result).toBeNull();
  });
});

describe('matchDistricts', () => {
  it('returns all nulls for non-finite input', async () => {
    const result = await matchDistricts(NaN, -81);
    expect(result.senate).toBeNull();
    expect(result.house).toBeNull();
    expect(result.county).toBeNull();
  });

  it('returns all nulls for coordinates outside SC', async () => {
    const result = await matchDistricts(40, -74); // New York
    expect(result.senate).toBeNull();
    expect(result.house).toBeNull();
  });

  it('returns all nulls for string inputs', async () => {
    const result = await matchDistricts('abc' as any, 'def' as any);
    expect(result.senate).toBeNull();
  });
});

describe('geocodeAddress', () => {
  it('parses a successful Census geocoder response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        result: {
          addressMatches: [{
            coordinates: { x: -82.394, y: 34.852 },
            geographies: {
              '2024 State Legislative Districts - Upper': [{ BASENAME: '3' }],
              '2024 State Legislative Districts - Lower': [{ BASENAME: '17' }],
            },
          }],
        },
      }),
    });

    const result = await geocodeAddress('123 Main St, Greenville, SC 29601');
    expect(result.lat).toBe(34.852);
    expect(result.lng).toBe(-82.394);
    expect(result.senate).toBe('3');
    expect(result.house).toBe('17');
  });

  it('uses the /api/geocode proxy endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        result: { addressMatches: [] },
      }),
    });

    await geocodeAddress('123 Main St');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/api\/geocode\?/);
  });

  it('returns nulls when no address matches found', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        result: { addressMatches: [] },
      }),
    });

    const result = await geocodeAddress('nonexistent address');
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
    expect(result.senate).toBeNull();
    expect(result.house).toBeNull();
  });

  it('returns nulls on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await geocodeAddress('123 Main St');
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it('handles response without geographies gracefully', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        result: {
          addressMatches: [{
            coordinates: { x: -82.0, y: 34.0 },
            geographies: {},
          }],
        },
      }),
    });

    const result = await geocodeAddress('123 Main St, SC');
    expect(result.lat).toBe(34.0);
    expect(result.lng).toBe(-82.0);
    expect(result.senate).toBeNull();
    expect(result.house).toBeNull();
  });

  it('handles legacy geography key names', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        result: {
          addressMatches: [{
            coordinates: { x: -81.0, y: 33.5 },
            geographies: {
              'State Legislative Districts - Upper': [{ BASENAME: '42' }],
              'State Legislative Districts - Lower': [{ BASENAME: '99' }],
            },
          }],
        },
      }),
    });

    const result = await geocodeAddress('456 Oak Ave, Columbia, SC');
    expect(result.senate).toBe('42');
    expect(result.house).toBe('99');
  });
});
