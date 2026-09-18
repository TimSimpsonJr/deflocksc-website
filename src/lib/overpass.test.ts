import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OVERPASS_MIRRORS,
  OverpassResponseError,
  buildOverpassQuery,
  assertOverpassEnvelope,
  assertFresh,
  mapOverpassElements,
  assertNoRegression,
} from './overpass.js';
import {
  SC_BOUNDS,
  assertValidCameraPayload,
  InvalidCameraPayloadError,
  type Camera,
} from './sc-camera-count.js';

/** n well-formed records inside SC_BOUNDS. */
const inSc = (n: number): Camera[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, lat: 34, lon: -81 }));
/** n well-formed records far outside SC_BOUNDS (Kansas). */
const outSc = (n: number): Camera[] =>
  Array.from({ length: n }, (_, i) => ({ id: 100_000 + i, lat: 40, lon: -100 }));

describe('OVERPASS_MIRRORS', () => {
  it('lists the three mirrors in fallback order (design §1)', () => {
    expect(OVERPASS_MIRRORS).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
    ]);
  });
});

describe('buildOverpassQuery', () => {
  it('formats SC_BOUNDS as (south,west,north,east) with the ALPR node filter', () => {
    expect(buildOverpassQuery(SC_BOUNDS)).toBe(
      '[out:json][timeout:120];\n' +
        'node["man_made"="surveillance"]["surveillance:type"="ALPR"](31.5,-84,35.5,-78);\n' +
        'out body;',
    );
  });

  it('defaults to SC_BOUNDS', () => {
    expect(buildOverpassQuery()).toBe(buildOverpassQuery(SC_BOUNDS));
  });
});

describe('assertOverpassEnvelope', () => {
  const good = {
    version: 0.6,
    generator: 'Overpass API 0.7.62',
    osm3s: { timestamp_osm_base: '2026-09-17T11:30:12Z' },
    elements: [],
  };

  it('accepts a well-formed envelope', () => {
    expect(() => assertOverpassEnvelope(good)).not.toThrow();
  });

  it('rejects a 200 that carries a top-level remark (server-side abort / partial result)', () => {
    const aborted = { ...good, remark: 'runtime error: Query timed out in "query" at line 2' };
    expect(() => assertOverpassEnvelope(aborted)).toThrow(OverpassResponseError);
    expect(() => assertOverpassEnvelope(aborted)).toThrow(/remark/);
  });

  it('rejects an envelope with no elements array', () => {
    const { elements: _omit, ...noElements } = good;
    expect(() => assertOverpassEnvelope(noElements)).toThrow(/elements/);
    expect(() => assertOverpassEnvelope({ ...good, elements: 'nope' })).toThrow(/elements/);
  });

  it('rejects a bare array (the old DeFlock CDN shape is not an Overpass envelope)', () => {
    expect(() => assertOverpassEnvelope([{ id: 1, lat: 34, lon: -81 }])).toThrow(
      OverpassResponseError,
    );
  });

  it('rejects null / non-object payloads', () => {
    expect(() => assertOverpassEnvelope(null)).toThrow(OverpassResponseError);
    expect(() => assertOverpassEnvelope('elements')).toThrow(OverpassResponseError);
  });
});

describe('assertFresh', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  it('accepts a timestamp_osm_base a few minutes old', () => {
    expect(() => assertFresh('2026-09-17T11:30:12Z', now)).not.toThrow();
  });

  it('accepts a timestamp just inside the 48h default window', () => {
    expect(() => assertFresh('2026-09-15T13:00:00Z', now)).not.toThrow(); // 47h old
  });

  it('rejects a stale replica older than maxAgeHours (default 48h)', () => {
    expect(() => assertFresh('2026-09-15T11:00:00Z', now)).toThrow(OverpassResponseError); // 49h old
    expect(() => assertFresh('2026-09-15T11:00:00Z', now)).toThrow(/stale/);
  });

  it('accepts small future skew inside maxFutureSkewHours (default 2h)', () => {
    expect(() => assertFresh('2026-09-17T13:00:00Z', now)).not.toThrow(); // 1h ahead
  });

  it('rejects a timestamp too far in the future', () => {
    expect(() => assertFresh('2026-09-17T15:00:00Z', now)).toThrow(/future/); // 3h ahead
  });

  it('honors custom windows', () => {
    expect(() => assertFresh('2026-09-17T09:00:00Z', now, 2)).toThrow(/stale/); // 3h old, max 2h
    expect(() => assertFresh('2026-09-17T15:00:00Z', now, 48, 4)).not.toThrow(); // 3h ahead, skew 4h
  });

  it('rejects a missing timestamp_osm_base (presence is required, not assumed)', () => {
    expect(() => assertFresh(undefined, now)).toThrow(/timestamp_osm_base/);
    expect(() => assertFresh(null, now)).toThrow(OverpassResponseError);
  });

  it('rejects an unparseable timestamp', () => {
    expect(() => assertFresh('yesterday-ish', now)).toThrow(/parseable/);
  });
});

describe('mapOverpassElements', () => {
  it('keeps only type === "node" elements', () => {
    const mapped = mapOverpassElements({
      elements: [
        { type: 'way', id: 1, nodes: [2, 3] },
        { type: 'node', id: 2, lat: 34, lon: -81 },
        { type: 'relation', id: 9, members: [] },
      ],
    });
    expect(mapped).toEqual([{ id: 2, lat: 34, lon: -81 }]);
  });

  it('preserves tags verbatim (the map reads direction / camera:direction / manufacturer / operator / wikimedia_commons)', () => {
    const tags = {
      direction: '75',
      'camera:direction': '80',
      manufacturer: 'Flock Safety',
      operator: 'Greenville Police Department',
      wikimedia_commons: 'File:Flock camera.jpg',
      man_made: 'surveillance',
    };
    const [cam] = mapOverpassElements({
      elements: [{ type: 'node', id: 3, lat: 34.85, lon: -82.39, tags }],
    });
    expect(cam.tags).toEqual(tags);
  });

  it('omits the tags key when the node has none', () => {
    const [cam] = mapOverpassElements({ elements: [{ type: 'node', id: 4, lat: 34, lon: -81 }] });
    expect('tags' in cam).toBe(false);
  });

  it('does NOT filter malformed nodes — structural validity is assertValidCameraPayload\'s job (all-or-nothing)', () => {
    const mapped = mapOverpassElements({
      elements: [
        { type: 'node', id: 5, lat: 34, lon: -81 },
        { type: 'node', id: 6, lat: 'x', lon: 'y' },
      ],
    });
    expect(mapped).toHaveLength(2);
    expect(() => assertValidCameraPayload(mapped)).toThrow(InvalidCameraPayloadError);
  });

  it('returns an empty array for an empty elements array', () => {
    expect(mapOverpassElements({ elements: [] })).toEqual([]);
  });
});

describe('assertNoRegression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is skipped when there is no prior snapshot', () => {
    expect(() => assertNoRegression(inSc(5), null)).not.toThrow();
  });

  it('projects the PRIOR through SC_BOUNDS before comparing (first-migration case: regional tile vs SC set)', () => {
    // Prior looks like the old ~64k regional tile: mostly outside SC. Raw-length
    // compare would wrongly reject; like-scope compare (1000 vs 1000) passes.
    const prior = [...inSc(1000), ...outSc(3000)];
    expect(() => assertNoRegression(inSc(1000), prior)).not.toThrow();
  });

  it('projects the CANDIDATE through SC_BOUNDS too (out-of-SC padding cannot mask a drop)', () => {
    const candidate = [...inSc(1200), ...outSc(5000)];
    expect(() => assertNoRegression(candidate, inSc(2000))).toThrow(/Implausible camera regression/);
  });

  it('rejects a drop of more than maxDrop (default 10%) against the projected prior', () => {
    expect(() => assertNoRegression(inSc(1799), inSc(2000))).toThrow(OverpassResponseError);
    expect(() => assertNoRegression(inSc(1800), inSc(2000))).not.toThrow();
  });

  it('never accepts a candidate below the floor (default 1000), even when the prior is tiny', () => {
    expect(() => assertNoRegression(inSc(2), inSc(1))).toThrow(/floor 1000/);
  });

  it('honors custom floor / maxDrop', () => {
    expect(() => assertNoRegression(inSc(2), inSc(1), { floor: 1 })).not.toThrow();
    expect(() => assertNoRegression(inSc(1500), inSc(2000), { maxDrop: 0.3 })).not.toThrow();
    expect(() => assertNoRegression(inSc(1300), inSc(2000), { maxDrop: 0.3 })).toThrow();
  });

  it('allowDrop: warns and accepts instead of throwing (explicit, logged override)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertNoRegression(inSc(1200), inSc(2000), { allowDrop: true })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ALLOW_CAMERA_DROP/);
  });

  it('allowDrop does not warn when there is no regression', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertNoRegression(inSc(2000), inSc(2000), { allowDrop: true });
    expect(warn).not.toHaveBeenCalled();
  });
});
