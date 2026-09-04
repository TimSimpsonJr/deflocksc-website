import { describe, it, expect } from 'vitest';
import {
  encodeTimelineTable,
  decodeTimelineTable,
  type TimelineRow,
} from './timeline-codec.js';

// A spread of rows exercising every encoded column's edge cases:
//  - a null direction (0xFFFF sentinel -> -1 on decode),
//  - a pre-2020-floored m = 202001 (month index 0),
//  - the maximum direction 360,
//  - coordinates that only differ at the 5th decimal (fixed-point precision),
//  - a negative-lon / positive-lat continental-US-shaped point.
const rows: TimelineRow[] = [
  { lon: -82.39123, lat: 34.85, m: 202001, dir: null },
  { lon: -80.12345, lat: 33.54321, m: 202403, dir: 360 },
  { lon: -122.41942, lat: 37.77493, m: 202106, dir: 0 },
  { lon: -71.05888, lat: 42.36008, m: 202512, dir: 275 },
];

describe('encodeTimelineTable / decodeTimelineTable round-trip', () => {
  it('reproduces lon/lat (to 1e-5), m, and dir exactly', () => {
    const decoded = decodeTimelineTable(encodeTimelineTable(rows));
    expect(decoded.lon.length).toBe(rows.length);
    for (let i = 0; i < rows.length; i++) {
      expect(decoded.lon[i]).toBeCloseTo(rows[i].lon, 5);
      expect(decoded.lat[i]).toBeCloseTo(rows[i].lat, 5);
      expect(decoded.m[i]).toBe(rows[i].m);
      const wantDir = rows[i].dir == null ? -1 : rows[i].dir;
      expect(decoded.dir[i]).toBe(wantDir);
    }
  });

  it('returns the documented typed-array views', () => {
    const decoded = decodeTimelineTable(encodeTimelineTable(rows));
    expect(decoded.lon).toBeInstanceOf(Float64Array);
    expect(decoded.lat).toBeInstanceOf(Float64Array);
    expect(decoded.m).toBeInstanceOf(Int32Array);
    expect(decoded.dir).toBeInstanceOf(Int16Array);
  });

  it('maps a null dir to the -1 sentinel', () => {
    const decoded = decodeTimelineTable(encodeTimelineTable(rows));
    expect(decoded.dir[0]).toBe(-1);
  });

  it('reconstructs YYYYMM from the stored month index across years', () => {
    const decoded = decodeTimelineTable(encodeTimelineTable(rows));
    expect(Array.from(decoded.m)).toEqual([202001, 202403, 202106, 202512]);
  });

  it('rounds fractional directions to whole degrees', () => {
    const decoded = decodeTimelineTable(
      encodeTimelineTable([{ lon: -80, lat: 33, m: 202001, dir: 160.5 }]),
    );
    expect(decoded.dir[0]).toBe(161);
  });
});

describe('determinism', () => {
  it('two encodes of the same rows are byte-identical', () => {
    const a = encodeTimelineTable(rows);
    const b = encodeTimelineTable(rows);
    expect(a.length).toBe(b.length);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('header + framing', () => {
  it('writes the TLC1 magic and version 1', () => {
    const bytes = encodeTimelineTable(rows);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('TLC1');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint16(4, true)).toBe(1);
    expect(dv.getUint32(8, true)).toBe(rows.length);
  });

  it('sizes the buffer as 16 + 11N padded to an even length', () => {
    // N = 4 (even total already): 16 + 11*4 = 60.
    expect(encodeTimelineTable(rows).length).toBe(60);
    // N = 1: 16 + 11 = 27 -> padded up to 28.
    expect(encodeTimelineTable([rows[0]]).length).toBe(28);
    // N = 0: header only.
    expect(encodeTimelineTable([]).length).toBe(16);
  });

  it('decodes an empty table', () => {
    const decoded = decodeTimelineTable(encodeTimelineTable([]));
    expect(decoded.lon.length).toBe(0);
    expect(decoded.m.length).toBe(0);
  });
});

describe('input shapes', () => {
  it('accepts a raw ArrayBuffer', () => {
    const bytes = encodeTimelineTable(rows);
    const ab = bytes.slice().buffer; // fresh, exactly-sized ArrayBuffer
    const decoded = decodeTimelineTable(ab);
    expect(Array.from(decoded.m)).toEqual([202001, 202403, 202106, 202512]);
  });

  it('accepts a Uint8Array whose byteOffset is unaligned', () => {
    // Embed the encoded table at an odd offset inside a larger buffer so the
    // view's byteOffset is not a multiple of 4 — decode must still work
    // (it copies to an aligned buffer rather than viewing in place).
    const bytes = encodeTimelineTable(rows);
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    const unaligned = padded.subarray(3);
    expect(unaligned.byteOffset % 4).not.toBe(0);
    const decoded = decodeTimelineTable(unaligned);
    expect(Array.from(decoded.m)).toEqual([202001, 202403, 202106, 202512]);
    expect(decoded.dir[0]).toBe(-1);
  });
});

describe('validation', () => {
  it('throws on a bad magic', () => {
    const bytes = encodeTimelineTable(rows);
    bytes[0] = 0x00; // corrupt the magic
    expect(() => decodeTimelineTable(bytes)).toThrow(/magic/i);
  });

  it('throws on an unsupported version', () => {
    const bytes = encodeTimelineTable(rows);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    dv.setUint16(4, 2, true); // version 2
    expect(() => decodeTimelineTable(bytes)).toThrow(/version/i);
  });
});
