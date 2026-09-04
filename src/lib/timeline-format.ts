/**
 * Pure, framework-free helpers for the surveillance timeline map. Kept out of
 * the layer/controller modules so they can be unit-tested without MapLibre.
 */

import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';

/** MapLibre filter: show only cameras first-seen on or before the cutoff month. */
export function cutoffFilter(cutoff: number): FilterSpecification {
  return ['<=', ['get', 'm'], cutoff] as unknown as FilterSpecification;
}

/**
 * YYYYMM integer -> a LINEAR month index (year*12 + month-1), so consecutive
 * calendar months always differ by exactly 1 — including across a year boundary
 * (202412 -> 24299, 202501 -> 24300). Raw YYYYMM arithmetic does NOT have this
 * property (202501 - 202412 = 89), which is why the hot-flare ramp keys on this
 * index, not on YYYYMM. The `m <= cutoff` visibility filter can still use raw
 * YYYYMM because that comparison only needs monotonic ordering, which YYYYMM has.
 */
export function monthIndex(m: number): number {
  const year = Math.floor(m / 100);
  const mo = m % 100;
  return year * 12 + (mo - 1);
}

/** Months of "recency" the hot flare ramps over as the cutoff advances. */
export const FLARE_SPAN = 3;

/**
 * Hot-flare-then-cool fill expression. Interpolates on the LINEAR month delta
 * `cutoffIndex - featureMonthIndex` (baked property `mi`): a dot freshly crossed
 * by the cutoff (delta 0) is near-white/amber hot; by FLARE_SPAN months it has
 * cooled to surveillance red. Keying on the linear index (not `cutoff - ['get',
 * 'm']`) is what keeps the flare correct across year boundaries. Pure and
 * MapLibre-free at call time (returns a plain expression array), so it is
 * unit-testable — see timeline-format.test.ts.
 */
export function flareColor(cutoff: number): ExpressionSpecification {
  const ci = monthIndex(cutoff);
  return [
    'interpolate', ['linear'], ['-', ci, ['get', 'mi']],
    0, '#fff7ed', // just arrived — hot
    1, '#fbbf24', // amber
    FLARE_SPAN, '#ef4444', // cooled to surveillance red
  ] as unknown as ExpressionSpecification;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Camera-OSD readout: (202403, 41208) -> "Mar 2024 · 41,208 documented". */
export function formatOsd(m: number, count: number): string {
  const year = Math.floor(m / 100);
  const name = MONTHS[(m % 100) - 1] ?? '???';
  return `${name} ${year} · ${count.toLocaleString('en-US')} documented`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Non-uniform intro easing. Holds months[0] through `lingerMs` (the sparse 2020
 * opening), then advances across the ordered `months` with an ease-in-out-cubic
 * curve over `advanceMs` (slow → fast through the middle years → slowing as SC
 * fills), landing exactly on the last month at lingerMs + advanceMs.
 */
export function introCutoffAt(
  elapsedMs: number,
  months: number[],
  opts: { lingerMs: number; advanceMs: number },
): number {
  if (months.length === 0) return 0;
  if (elapsedMs <= opts.lingerMs) return months[0];
  const t = Math.min((elapsedMs - opts.lingerMs) / opts.advanceMs, 1);
  const idx = Math.min(months.length - 1, Math.floor(easeInOutCubic(t) * (months.length - 1)));
  return months[idx];
}
