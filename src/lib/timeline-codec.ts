/**
 * timeline-codec.ts — the SHARED, dependency-free codec for the surveillance
 * timeline camera table. The Node build (scripts/build-timeline-data.ts) encodes
 * the dated rows to public/timeline-cameras.bin with `encodeTimelineTable`; the
 * browser map client decodes them with `decodeTimelineTable`. Keeping both sides
 * on one codec means the on-disk format is defined in exactly one place.
 *
 * Format — a little-endian, structure-of-arrays packing of N rows
 * `{ lon, lat, m /* YYYYMM * /, dir /* degrees or null * / }`:
 *
 *   Header (16 bytes):
 *     [0..3]   ASCII magic "TLC1"
 *     [4..5]   uint16 version (= 1)
 *     [6..7]   0 (pad)
 *     [8..11]  uint32 count N
 *     [12..15] 0 (pad — keeps the Int32 columns 4-byte aligned)
 *
 *   Columns, each length N, in this order (chosen so every typed-array view
 *   lands on a naturally aligned byte offset):
 *     1. lonE5  Int32  × N  at 16        — Math.round(lon * 1e5)
 *     2. latE5  Int32  × N  at 16 + 4N   — Math.round(lat * 1e5)
 *     3. dir    Uint16 × N  at 16 + 8N   — Math.round(direction) in [0,360];
 *                                          0xFFFF sentinel for null
 *     4. mIdx   Uint8  × N  at 16 + 10N  — (year-2020)*12 + (month-1) from m
 *
 *   Total = 16 + 11N bytes, padded to an even length when N is odd.
 *
 * The lon/lat/dir fixed-point rounding is the only lossy step: coordinates land
 * on a ~1.1 m grid (5 decimals) and directions on whole degrees. m survives
 * exactly for any month from 2020-01 onward (the timeline start the build floors
 * to). Encoding is a pure function of the input rows, so — given the build's
 * deterministic row sort — reruns produce byte-identical output.
 */

/** One camera row: current position, first-seen month, facing direction. */
export interface TimelineRow {
  lon: number;
  lat: number;
  /** First-seen month as a YYYYMM integer, e.g. 202403. */
  m: number;
  /** Facing direction in degrees [0,360], or null when unknown. */
  dir: number | null;
}

/** The decoded columns, as typed arrays for fast client-side consumption. */
export interface DecodedTimelineTable {
  lon: Float64Array;
  lat: Float64Array;
  /** YYYYMM per row, reconstructed from the stored month index. */
  m: Int32Array;
  /** Degrees per row; -1 where the source direction was null. */
  dir: Int16Array;
}

const MAGIC = 'TLC1';
const VERSION = 1;
const HEADER_BYTES = 16;
/** Null-direction sentinel stored in the Uint16 dir column. */
const DIR_NULL = 0xffff;
/** The timeline's base year — month index 0 is January of this year. */
const BASE_YEAR = 2020;

/**
 * Pack rows into the compact binary table. Coordinates are stored as
 * fixed-point Int32 (×1e5), directions as whole-degree Uint16 (0xFFFF for
 * null), and months as a Uint8 index from January 2020. The returned
 * Uint8Array owns a freshly allocated, exactly-sized buffer.
 */
export function encodeTimelineTable(rows: TimelineRow[]): Uint8Array {
  const n = rows.length;
  const unpadded = HEADER_BYTES + 11 * n;
  const total = unpadded + (unpadded % 2); // pad the tail to an even length
  const ab = new ArrayBuffer(total);
  const dv = new DataView(ab);

  // Header.
  dv.setUint8(0, MAGIC.charCodeAt(0));
  dv.setUint8(1, MAGIC.charCodeAt(1));
  dv.setUint8(2, MAGIC.charCodeAt(2));
  dv.setUint8(3, MAGIC.charCodeAt(3));
  dv.setUint16(4, VERSION, true);
  // bytes 6-7 stay 0 (pad)
  dv.setUint32(8, n, true);
  // bytes 12-15 stay 0 (pad, keeps the Int32 columns 4-byte aligned)

  // Columns. Offsets are all naturally aligned because the buffer starts at 0:
  // 16 % 4 == 0, (16+4N) % 4 == 0, (16+8N) % 2 == 0.
  const lonE5 = new Int32Array(ab, HEADER_BYTES, n);
  const latE5 = new Int32Array(ab, HEADER_BYTES + 4 * n, n);
  const dir = new Uint16Array(ab, HEADER_BYTES + 8 * n, n);
  const mIdx = new Uint8Array(ab, HEADER_BYTES + 10 * n, n);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    lonE5[i] = Math.round(r.lon * 1e5);
    latE5[i] = Math.round(r.lat * 1e5);
    dir[i] = r.dir == null ? DIR_NULL : Math.round(r.dir);
    const year = Math.floor(r.m / 100);
    const month = r.m % 100;
    mIdx[i] = (year - BASE_YEAR) * 12 + (month - 1);
  }

  return new Uint8Array(ab);
}

/**
 * Decode a binary table produced by `encodeTimelineTable`. Accepts an
 * ArrayBuffer or any Uint8Array (including a Node Buffer at an arbitrary
 * byteOffset — the bytes are copied to an aligned buffer when the source view
 * is not already aligned at offset 0). Reconstructs lon/lat from fixed-point,
 * dir with -1 for null, and m as a YYYYMM integer from the stored month index.
 * Throws on a wrong magic or unsupported version.
 */
export function decodeTimelineTable(buf: ArrayBuffer | Uint8Array): DecodedTimelineTable {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Int32Array/Uint16Array views require the byteOffset to be a multiple of the
  // element size. A view already anchored at offset 0 spanning its whole buffer
  // satisfies that (the header size and column ordering keep every column
  // aligned); otherwise copy to a fresh, exactly-sized, offset-0 buffer.
  const ab =
    view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      ? (view.buffer as ArrayBuffer)
      : (view.slice().buffer as ArrayBuffer);

  const dv = new DataView(ab);
  if (
    dv.getUint8(0) !== MAGIC.charCodeAt(0) ||
    dv.getUint8(1) !== MAGIC.charCodeAt(1) ||
    dv.getUint8(2) !== MAGIC.charCodeAt(2) ||
    dv.getUint8(3) !== MAGIC.charCodeAt(3)
  ) {
    throw new Error('timeline-codec: bad magic (expected TLC1)');
  }
  const version = dv.getUint16(4, true);
  if (version !== VERSION) {
    throw new Error(`timeline-codec: unsupported version ${version} (expected ${VERSION})`);
  }
  const n = dv.getUint32(8, true);

  const lonE5 = new Int32Array(ab, HEADER_BYTES, n);
  const latE5 = new Int32Array(ab, HEADER_BYTES + 4 * n, n);
  const dirU16 = new Uint16Array(ab, HEADER_BYTES + 8 * n, n);
  const mIdx = new Uint8Array(ab, HEADER_BYTES + 10 * n, n);

  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const m = new Int32Array(n);
  const dir = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = lonE5[i] / 1e5;
    lat[i] = latE5[i] / 1e5;
    const u = dirU16[i];
    dir[i] = u === DIR_NULL ? -1 : u;
    const idx = mIdx[i];
    const year = BASE_YEAR + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    m[i] = year * 100 + month;
  }

  return { lon, lat, m, dir };
}
