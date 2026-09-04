import { describe, it, expect } from 'vitest';
import {
  monthInt,
  ohsomeEndDate,
  roundCoord,
  parseDirectionTag,
  sortForDeterminism,
  floorToTimelineStart,
  encodeTable,
  decodeTable,
  chooseOutput,
  serializeTable,
} from './build-timeline-data.js';

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

describe('sortForDeterminism + encodeTable', () => {
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
  it('is byte-identical regardless of input order', () => {
    const a = serializeTable(encodeTable(rows));
    const b = serializeTable(encodeTable([...rows].reverse()));
    expect(a).toBe(b);
  });
  it('produces index-aligned columnar arrays', () => {
    const t = encodeTable(rows);
    expect(t.v).toBe(1);
    expect(t.lon.length).toBe(3);
    expect(t.m.length).toBe(t.lon.length);
    expect(t.dir.length).toBe(t.lon.length);
  });
  it('is total: rows identical but for dir sort byte-identically in either order', () => {
    // Same month and same 5-decimal coords, differing ONLY in dir — the tie-break
    // on dir makes the ordering total, so input order can no longer leak through.
    const twins = [
      { lon: -82.4, lat: 34.85, m: 202105, dir: 90 },
      { lon: -82.4, lat: 34.85, m: 202105, dir: 270 },
    ];
    const a = serializeTable(encodeTable(twins));
    const b = serializeTable(encodeTable([...twins].reverse()));
    expect(a).toBe(b);
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

describe('decodeTable round-trips encodeTable', () => {
  it('recovers the normalized (rounded, sorted) rows', () => {
    const rows = [
      { lon: -82.391234, lat: 34.850004, m: 202403, dir: 160.5 },
      { lon: -80.12345, lat: 33.5, m: 202001, dir: null },
    ];
    const back = decodeTable(encodeTable(rows));
    expect(back).toEqual([
      { lon: -80.12345, lat: 33.5, m: 202001, dir: null },
      { lon: -82.39123, lat: 34.85, m: 202403, dir: 160.5 },
    ]);
  });
});

describe('chooseOutput (graceful fallback)', () => {
  const committed = { v: 1, lon: [-80], lat: [33], m: [202001], dir: [null] };
  it('reuses the committed table when the fresh build is empty', () => {
    expect(chooseOutput({ v: 1, lon: [], lat: [], m: [], dir: [] }, committed))
      .toEqual({ table: committed, reused: true });
    expect(chooseOutput(null, committed)).toEqual({ table: committed, reused: true });
  });
  it('uses the fresh table when it has rows', () => {
    const fresh = { v: 1, lon: [-81], lat: [34], m: [202105], dir: [90] };
    expect(chooseOutput(fresh, committed)).toEqual({ table: fresh, reused: false });
  });
  it('throws when neither fresh nor committed has rows', () => {
    expect(() => chooseOutput(null, null)).toThrow();
  });
});
