/**
 * Unclustered dated camera layer for the surveillance timeline map.
 *
 * Its OWN GeoJSON source (NOT the clustered `cameras` source or the viewport
 * tile-loader): the full decoded dataset is loaded once via setData at init, and
 * playback only updates a cheap filter/paint — never setData per tick. No
 * clustering at any zoom (clustering would destroy the appear-over-time bloom).
 *
 * Layers (bottom to top):
 *   - timeline-dots : hard, small, SOLID-RED core; hot-flare-then-cool by recency
 *                     (white/amber only for a just-arrived dot, then solid red),
 *                     source-over, filtered m <= cutoff. NO persistent glow layer
 *                     (2026-09-04 dot-styling decision): colorblind / dim-screen
 *                     legibility comes from bright solid red + dot SIZE, not a halo,
 *                     and an additive white pile-up in dense metros is rejected.
 *                     Two paint modes on the handle: setCutoff() drives the
 *                     white→red arrival flare for active playback/scrub; settle()
 *                     holds a FLAT solid red (no flare) for a resting / held-final
 *                     / reduced-motion frame, so the held frame is never white.
 *   - timeline-cones: high-zoom directional cones (icon-rotate from baked dir),
 *                     full-intensity center dot preserved. Same m <= cutoff.
 *
 * Radius is zoom-interpolated with a MOBILE FLOOR (<=375px viewports get larger
 * low-zoom radii so national dots stay perceptible on a phone — size, not glow).
 *
 * The table is the codec's DecodedTimelineTable (typed arrays; dir is -1 where the
 * source direction was null — see src/lib/timeline-codec.ts).
 */

import maplibregl from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import { createConeImage } from './cameras.js';
import {
  cutoffFilter,
  flareColor,
  timelineFeatureProps,
  SETTLED_RED,
} from '../../../lib/timeline-format.js';
import type { DecodedTimelineTable } from '../../../lib/timeline-codec.js';

/** The client consumes the codec's decoded typed-array table directly. */
export type TimelineTable = DecodedTimelineTable;

export interface TimelineLayerHandle {
  /**
   * Cheap filter+paint update — NEVER setData. Renders the white→red arrival
   * flare for the given cutoff. Guarded: a repeat call with the same
   * month-quantized cutoff (as the per-frame intro loop produces) is a no-op, so
   * the filter/paint are not needlessly re-applied over ~130k features.
   */
  setCutoff(cutoff: number): void;
  /**
   * Switch the dots to FLAT solid red (no flare) for a resting / held-final /
   * reduced-motion frame. Keeps the filter where the last setCutoff() left it and
   * only swaps the dot paint, so the most-recent arrivals stop reading white/amber
   * and the held frame is uniformly red — never white. The next setCutoff()
   * restores the flare paint.
   */
  settle(): void;
  /** Camera move only (fit-bounds), same dataset drives both scales. */
  fitTo(scale: 'national' | 'sc'): void;
}

const SC_BOUNDS: maplibregl.LngLatBoundsLike = [[-83.45, 32.0], [-78.45, 35.25]];
const US_BOUNDS: maplibregl.LngLatBoundsLike = [[-125.0, 24.0], [-66.9, 49.5]];
const CONE_MIN_ZOOM = 13; // cones resolve at town scale; dots below

/**
 * Bake the decoded typed-array table into a GeoJSON FeatureCollection. The
 * per-row property mapping (m / mi / dir / hasDir, including the codec's -1
 * no-direction sentinel) lives in the pure, unit-tested timelineFeatureProps() in
 * timeline-format.ts — see its doc + tests for the sentinel semantics.
 */
function tableToGeoJSON(t: TimelineTable): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < t.m.length; i++) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lon[i], t.lat[i]] },
      properties: timelineFeatureProps(t.m[i], t.dir[i]),
    });
  }
  return { type: 'FeatureCollection', features };
}

export function addTimelineLayers(
  map: maplibregl.Map,
  table: TimelineTable,
  opts: { cutoff: number; mobile: boolean },
): TimelineLayerHandle {
  const { mobile } = opts;
  const filter = cutoffFilter(opts.cutoff);

  // Cone filter: the same `m <= cutoff` expression AND a known direction. Built
  // from cutoffFilter's ExpressionSpecification, so the whole thing stays a typed
  // expression — no cast. Reused by the layer setup and setCutoff.
  const coneFilter = (f: ExpressionSpecification): ExpressionSpecification =>
    ['all', f, ['get', 'hasDir']];

  map.addSource('timeline', { type: 'geojson', data: tableToGeoJSON(table) });

  // Zoom-scaled radius. Mobile floors the national end so dots stay visible —
  // SIZE carries legibility at national scale (there is no glow layer to lean on).
  // Typed as ExpressionSpecification so the interpolate literal is checked here at
  // the declaration (circle-radius accepts an expression directly, no cast).
  const dotRadius: ExpressionSpecification = mobile
    ? ['interpolate', ['exponential', 1.4], ['zoom'], 3, 2.6, 7, 3.6, 11, 6, 14, 9]
    : ['interpolate', ['exponential', 1.4], ['zoom'], 3, 1.6, 7, 2.6, 11, 5, 14, 8];

  // Solid dot — hard core; hot-flare-then-SOLID-RED color (white/amber only for a
  // just-arrived dot, keyed on recency in flareColor); source-over, full opacity.
  // NO persistent glow layer: the 2026-09-04 dot-styling decision reserves
  // white/brightness for the transient arrival flare and rejects an additive glow
  // that would turn dense metros white.
  map.addLayer({
    id: 'timeline-dots',
    type: 'circle',
    source: 'timeline',
    filter,
    paint: {
      'circle-color': flareColor(opts.cutoff),
      'circle-radius': dotRadius,
      'circle-opacity': 1,
    },
  });

  // Cones at high zoom only (>= CONE_MIN_ZOOM). ACCEPTED DEVIATION from the
  // spec's "cones replace dots": the dot layer is intentionally NOT capped with
  // a maxzoom, so above the threshold cones OVERLAY the dots rather than
  // replacing them. Rationale: (1) no-direction cameras have no cone, so
  // they must stay visible as dots at high zoom — a blanket dot maxzoom would
  // make every no-dir camera vanish at town scale; (2) createConeImage's own
  // center dot is full-intensity, so a dir-tagged camera reads as one strong
  // core with a wedge, not a doubled blob. Strict replacement is achievable — a
  // ['zoom']-aware filter is valid in MapLibre (filters may reference ['zoom'],
  // evaluated at integer zoom levels), or split dir/no-dir sources — but the
  // overlay is the deliberate choice: it keeps no-dir cameras visible and keeps
  // full-intensity centers with no extra source/filter machinery.
  map.addImage('timeline-cone', createConeImage());
  map.addLayer({
    id: 'timeline-cones',
    type: 'symbol',
    source: 'timeline',
    minzoom: CONE_MIN_ZOOM,
    filter: coneFilter(filter),
    layout: {
      'icon-image': 'timeline-cone',
      'icon-size': 1.0,
      'icon-rotate': ['get', 'dir'],
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
    },
  });

  // The layer is created already showing the flare paint at opts.cutoff, so seed
  // the guard with it: `appliedCutoff` is the last cutoff whose filter+flare paint
  // are on the map, and `flat` records whether settle() has since forced the flat
  // red paint (which setCutoff must undo even when the cutoff is unchanged).
  let appliedCutoff: number = opts.cutoff;
  let flat = false;

  return {
    setCutoff(cutoff: number) {
      // Per-frame no-op guard: the intro loop calls this every animation frame,
      // but most frames repeat the same month-quantized cutoff. Skip re-applying
      // the filter (re-evaluated over ~130k features) and paint when nothing that
      // matters changed — but never skip while flat, so we always restore the flare.
      if (cutoff === appliedCutoff && !flat) return;
      const f = cutoffFilter(cutoff);
      map.setFilter('timeline-dots', f);
      map.setFilter('timeline-cones', coneFilter(f));
      map.setPaintProperty('timeline-dots', 'circle-color', flareColor(cutoff));
      appliedCutoff = cutoff;
      flat = false;
    },
    settle() {
      // Flat solid red, no flare — the resting / held-final / reduced-motion frame.
      // Only the dot paint changes (the filter stays at the latest cutoff), which
      // drops the white/amber most-recent arrivals so the held frame is all red.
      if (flat) return;
      map.setPaintProperty('timeline-dots', 'circle-color', SETTLED_RED);
      flat = true;
    },
    fitTo(scale) {
      map.fitBounds(scale === 'sc' ? SC_BOUNDS : US_BOUNDS, {
        padding: 24,
        duration: 0,
      });
    },
  };
}
