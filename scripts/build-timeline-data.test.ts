import { describe, it, expect } from 'vitest';
import {
  monthInt,
  ohsomeEndDate,
  roundCoord,
  parseDirectionTag,
  reduceVersionsToRow,
  sortForDeterminism,
  floorToTimelineStart,
  normalizeRows,
  chooseOutput,
  type OhsomeFeature,
} from './build-timeline-data.js';
import { encodeTimelineTable, decodeTimelineTable } from '../src/lib/timeline-codec.js';

describe('monthInt', () => {
  it('encodes an ISO timestamp as a YYYYMM integer', () => {
    expect(monthInt('2024-03-15T09:12:00Z')).toBe(202403);
  });
  it('uses UTC month boundaries', () => {
    expect(monthInt('2020-01-01T00:00:00Z')).toBe(202001);
    expect(monthInt('2020-12-31T23:59:59Z')).toBe(202012);
  });
  it('throws on an unparseable date', () => {
    expect(() => monthInt('not-a-date')).toThrow();
  });
});

describe('ohsomeEndDate', () => {
  it('takes the YYYY-MM-DD slice of a standard ISO timestamp', () => {
    expect(ohsomeEndDate('2026-07-27T00:00:00Z')).toBe('2026-07-27');
  });
  it("handles ohsome's non-standard 09:00Z time form", () => {
    expect(ohsomeEndDate('2026-07-27T09:00Z')).toBe('2026-07-27');
  });
  it('accepts a bare date', () => {
    expect(ohsomeEndDate('2026-07-27')).toBe('2026-07-27');
  });
  it('throws on a malformed timestamp', () => {
    expect(() => ohsomeEndDate('not-a-date')).toThrow();
  });
});

describe('roundCoord', () => {
  it('rounds to 5 decimals', () => {
    expect(roundCoord(-82.3912345)).toBe(-82.39123);
    expect(roundCoord(34.8500049)).toBe(34.85);
  });
});

// Parity with parseDirection in src/scripts/map/layers/cameras.ts
// (same cases as cameras.test.ts — mirror any change there here).
describe('parseDirectionTag', () => {
  it('returns null with no direction', () => {
    expect(parseDirectionTag({ manufacturer: 'Flock Safety' })).toBe(null);
    expect(parseDirectionTag(undefined)).toBe(null);
  });
  it('parses numeric degrees, ranges, cardinals, and lists', () => {
    expect(parseDirectionTag({ direction: '90' })).toBe(90);
    expect(parseDirectionTag({ direction: '138-183' })).toBe(160.5);
    expect(parseDirectionTag({ direction: 'nw' })).toBe(315);
    expect(parseDirectionTag({ direction: '90;270' })).toBe(90);
    expect(parseDirectionTag({ 'camera:direction': '45' })).toBe(45);
  });
});

// Mirrors the ohsome elementsFullHistory/centroid shape confirmed by the live
// probe: each version is a Point Feature ([lon,lat]) whose properties carry the
// @metadata plus each OSM tag as a top-level property (properties=metadata,tags).
function version(
  validFrom: string,
  coords: [number, number] | null,
  tags: Record<string, string> = {},
): OhsomeFeature {
  return {
    geometry: coords ? { type: 'Point', coordinates: coords } : null,
    properties: { '@osmId': 'node/1', '@validFrom': validFrom, ...tags },
  };
}

describe('reduceVersionsToRow', () => {
  it('takes m from the earliest version and position+dir from the latest', () => {
    const row = reduceVersionsToRow([
      version('2021-05-10T00:00:00Z', [-82.4, 34.85], { direction: '90' }),
      version('2024-03-02T00:00:00Z', [-82.41, 34.86], { direction: '180' }),
    ]);
    // earliest validFrom -> month; latest version's coords + direction.
    expect(row).toEqual({ lon: -82.41, lat: 34.86, m: 202105, dir: 180 });
  });
  it('floors a pre-2020 first-seen month to the timeline start', () => {
    const row = reduceVersionsToRow([
      version('2018-07-01T00:00:00Z', [-79.0, 33.0]),
    ]);
    expect(row?.m).toBe(202001);
  });
  it('is order-independent and idempotent under duplicate versions (bbox-edge)', () => {
    const versions = [
      version('2024-03-02T00:00:00Z', [-82.41, 34.86], { direction: '180' }),
      version('2021-05-10T00:00:00Z', [-82.4, 34.85], { direction: '90' }),
    ];
    const a = reduceVersionsToRow(versions);
    const b = reduceVersionsToRow([...versions].reverse());
    const withDupes = reduceVersionsToRow([...versions, ...versions]);
    expect(a).toEqual(b);
    expect(withDupes).toEqual(a);
  });
  it('parses camera:direction from the latest version tags', () => {
    const row = reduceVersionsToRow([
      version('2022-01-01T00:00:00Z', [-80.0, 33.0], { 'camera:direction': 'nw' }),
    ]);
    expect(row?.dir).toBe(315);
  });
  it('yields dir null when the latest version has no direction tag', () => {
    const row = reduceVersionsToRow([
      version('2022-01-01T00:00:00Z', [-80.0, 33.0], { direction: '45' }),
      version('2023-01-01T00:00:00Z', [-80.0, 33.0]),
    ]);
    expect(row?.dir).toBe(null);
  });
  it('uses the latest version WITH coordinates when the newest is a deletion', () => {
    // A since-deleted node: its newest version has null geometry. Fall back to
    // the latest coordinate-bearing version for position; m still first-seen.
    const row = reduceVersionsToRow([
      version('2021-05-10T00:00:00Z', [-82.4, 34.85], { direction: '90' }),
      version('2024-03-02T00:00:00Z', null),
    ]);
    expect(row).toEqual({ lon: -82.4, lat: 34.85, m: 202105, dir: 90 });
  });
  it('returns null when no version has coordinates', () => {
    expect(reduceVersionsToRow([version('2021-05-10T00:00:00Z', null)])).toBe(null);
  });
  it('returns null for an empty version list', () => {
    expect(reduceVersionsToRow([])).toBe(null);
  });
});

const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('sortForDeterminism + normalizeRows', () => {
  const rows = [
    { lon: -82.4, lat: 34.85, m: 202105, dir: 90 },
    { lon: -80.0, lat: 33.0, m: 202001, dir: null },
    { lon: -82.4, lat: 34.84, m: 202105, dir: null },
  ];
  it('orders by month, then lon, then lat', () => {
    const s = sortForDeterminism(rows);
    expect(s.map((r) => r.m)).toEqual([202001, 202105, 202105]);
    expect(s.slice(1).map((r) => r.lat)).toEqual([34.84, 34.85]);
  });
  it('rounds coords to 5 decimals and applies the deterministic order', () => {
    const n = normalizeRows([
      { lon: -82.3912345, lat: 34.8500049, m: 202105, dir: 90 },
      { lon: -80.0, lat: 33.0, m: 202001, dir: undefined as unknown as number },
    ]);
    expect(n).toEqual([
      { lon: -80.0, lat: 33.0, m: 202001, dir: null },
      { lon: -82.39123, lat: 34.85, m: 202105, dir: 90 },
    ]);
  });
  it('encodes byte-identically regardless of input order (via the shared codec)', () => {
    const a = encodeTimelineTable(normalizeRows(rows));
    const b = encodeTimelineTable(normalizeRows([...rows].reverse()));
    expect(bytesEqual(a, b)).toBe(true);
  });
  it('is total: rows identical but for dir encode byte-identically in either order', () => {
    // Same month and same 5-decimal coords, differing ONLY in dir — the tie-break
    // on dir makes the ordering total, so input order can no longer leak through.
    const twins = [
      { lon: -82.4, lat: 34.85, m: 202105, dir: 90 },
      { lon: -82.4, lat: 34.85, m: 202105, dir: 270 },
    ];
    const a = encodeTimelineTable(normalizeRows(twins));
    const b = encodeTimelineTable(normalizeRows([...twins].reverse()));
    expect(bytesEqual(a, b)).toBe(true);
  });
});

describe('floorToTimelineStart', () => {
  it('floors a pre-2020 month up to the Jan-2020 timeline start', () => {
    expect(floorToTimelineStart(201907)).toBe(202001);
  });
  it('passes a post-2020 month through unchanged', () => {
    expect(floorToTimelineStart(202403)).toBe(202403);
  });
});

describe('normalizeRows -> shared codec round-trip', () => {
  it('recovers the normalized (rounded, sorted) rows through the .bin codec', () => {
    const rows = [
      { lon: -82.391234, lat: 34.850004, m: 202403, dir: 90 },
      { lon: -80.12345, lat: 33.5, m: 202001, dir: null },
    ];
    const decoded = decodeTimelineTable(encodeTimelineTable(normalizeRows(rows)));
    // Sorted by month: 202001 first, then 202403; coords rounded to 5 decimals.
    expect(Array.from(decoded.lon)).toEqual([-80.12345, -82.39123]);
    expect(Array.from(decoded.lat)).toEqual([33.5, 34.85]);
    expect(Array.from(decoded.m)).toEqual([202001, 202403]);
    expect(Array.from(decoded.dir)).toEqual([-1, 90]); // null -> -1 sentinel
  });
});

describe('chooseOutput (graceful fallback)', () => {
  const committed = encodeTimelineTable([{ lon: -80, lat: 33, m: 202001, dir: null }]);
  const fresh = encodeTimelineTable([{ lon: -81, lat: 34, m: 202105, dir: 90 }]);
  it('reuses the committed bytes when the fresh build is unavailable', () => {
    expect(chooseOutput(null, committed)).toEqual({ bytes: committed, reused: true });
    expect(chooseOutput(new Uint8Array(0), committed)).toEqual({
      bytes: committed,
      reused: true,
    });
  });
  it('uses the fresh bytes when present', () => {
    expect(chooseOutput(fresh, committed)).toEqual({ bytes: fresh, reused: false });
  });
  it('throws when neither fresh nor committed is usable', () => {
    expect(() => chooseOutput(null, null)).toThrow();
    expect(() => chooseOutput(new Uint8Array(0), new Uint8Array(0))).toThrow();
  });
});
