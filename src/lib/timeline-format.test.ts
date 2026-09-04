import { describe, it, expect } from 'vitest';
import {
  cutoffFilter,
  formatOsd,
  introCutoffAt,
  monthIndex,
  flareColor,
  timelineFeatureProps,
} from './timeline-format.js';

describe('cutoffFilter', () => {
  it('builds a MapLibre <= filter on the m property', () => {
    expect(cutoffFilter(202403)).toEqual(['<=', ['get', 'm'], 202403]);
  });
});

describe('formatOsd', () => {
  it('formats the camera-OSD readout with the honest "documented" suffix', () => {
    expect(formatOsd(202403, 41208)).toBe('Mar 2024 · 41,208 documented');
  });
  it('groups thousands and handles January', () => {
    expect(formatOsd(202001, 5)).toBe('Jan 2020 · 5 documented');
    expect(formatOsd(202612, 1234567)).toBe('Dec 2026 · 1,234,567 documented');
  });
});

describe('monthIndex', () => {
  it('maps YYYYMM to a linear month index (year*12 + month-1)', () => {
    expect(monthIndex(202001)).toBe(2020 * 12);
    expect(monthIndex(202012) - monthIndex(202001)).toBe(11);
  });
  it('is continuous across the year boundary (the flare-arithmetic bug)', () => {
    // Raw YYYYMM would give 202501 - 202412 = 89; the linear index gives 1.
    expect(monthIndex(202501) - monthIndex(202412)).toBe(1);
  });
});

describe('flareColor', () => {
  it('ramps the hot flare on the linear month delta, not raw YYYYMM arithmetic', () => {
    // cutoff Jan 2025 vs a camera first-seen Dec 2024 must read as 1 month old
    // (amber), not 89 months old (fully cooled) — the year-boundary regression.
    const expr = flareColor(202501) as unknown as unknown[];
    expect(expr[0]).toBe('interpolate');
    expect(expr[2]).toEqual(['-', monthIndex(202501), ['get', 'mi']]);
    // Ramp stops are month counts: 0 (hot), 1 (amber), FLARE_SPAN (cooled red).
    expect(expr[3]).toBe(0);
    expect(expr[5]).toBe(1);
    expect(expr[7]).toBe(3);
  });
});

describe('timelineFeatureProps', () => {
  it('maps a real-bearing row: keeps the direction, sets hasDir, derives mi', () => {
    // Mar 2024, facing 90deg -> dir preserved, hasDir true, mi from monthIndex.
    expect(timelineFeatureProps(202403, 90)).toEqual({
      m: 202403,
      mi: monthIndex(202403),
      dir: 90,
      hasDir: true,
    });
  });
  it('collapses the codec -1 no-direction sentinel to { dir: 0, hasDir: false }', () => {
    expect(timelineFeatureProps(202001, -1)).toEqual({
      m: 202001,
      mi: monthIndex(202001),
      dir: 0,
      hasDir: false,
    });
  });
  it('treats bearing 0 (due north) as a real, known direction', () => {
    // Guards the `dir >= 0` boundary: 0 is a valid bearing, NOT the -1 sentinel.
    const p = timelineFeatureProps(202401, 0);
    expect(p.dir).toBe(0);
    expect(p.hasDir).toBe(true);
  });
});

describe('introCutoffAt', () => {
  const months: number[] = [];
  for (let y = 2020; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) months.push(y * 100 + mo);
  const opts = { lingerMs: 3000, advanceMs: 15000 };

  it('holds the first month through the linger', () => {
    expect(introCutoffAt(0, months, opts)).toBe(months[0]);
    expect(introCutoffAt(3000, months, opts)).toBe(months[0]);
  });
  it('reaches the last month at the end of the advance and stays there', () => {
    expect(introCutoffAt(18000, months, opts)).toBe(months[months.length - 1]);
    expect(introCutoffAt(99999, months, opts)).toBe(months[months.length - 1]);
  });
  it('is monotonically non-decreasing', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 18000; t += 250) {
      const v = introCutoffAt(t, months, opts);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('returns 0 for an empty month list', () => {
    expect(introCutoffAt(1000, [], opts)).toBe(0);
  });
});
