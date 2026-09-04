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
import { createConeImage } from './cameras.js';
import { cutoffFilter, flareColor, monthIndex } from '../../../lib/timeline-format.js';
import type { DecodedTimelineTable } from '../../../lib/timeline-codec.js';

/** The client consumes the codec's decoded typed-array table directly. */
export type TimelineTable = DecodedTimelineTable;

export interface TimelineLayerHandle {
  /** Cheap filter+paint update — NEVER setData. */
  setCutoff(cutoff: number): void;
  /** Camera move only (fit-bounds), same dataset drives both scales. */
  fitTo(scale: 'national' | 'sc'): void;
}

const SC_BOUNDS: maplibregl.LngLatBoundsLike = [[-83.45, 32.0], [-78.45, 35.25]];
const US_BOUNDS: maplibregl.LngLatBoundsLike = [[-125.0, 24.0], [-66.9, 49.5]];
const CONE_MIN_ZOOM = 13; // cones resolve at town scale; dots below

/**
 * Feature properties baked per camera:
 *   m       — YYYYMM first-seen month; drives the `m <= cutoff` visibility filter
 *             (raw YYYYMM is fine there: `<=` only needs monotonic ordering).
 *   mi      — LINEAR month index (year*12 + month-1); drives the hot-flare ramp,
 *             which subtracts months and MUST be continuous across year
 *             boundaries. See monthIndex()/flareColor() in timeline-format.ts.
 *   dir     — baked bearing for the cone icon-rotate (0 when unknown).
 *   hasDir  — whether a real direction is known (gates the cone layer). The codec
 *             stores a null direction as -1, so `dir >= 0` means "known".
 */
function tableToGeoJSON(t: TimelineTable): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < t.m.length; i++) {
    const hasDir = t.dir[i] >= 0; // codec: -1 sentinel = no direction
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lon[i], t.lat[i]] },
      properties: {
        m: t.m[i],
        mi: monthIndex(t.m[i]),
        dir: hasDir ? t.dir[i] : 0,
        hasDir,
      },
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

  map.addSource('timeline', { type: 'geojson', data: tableToGeoJSON(table) });

  // Zoom-scaled radius. Mobile floors the national end so dots stay visible —
  // SIZE carries legibility at national scale (there is no glow layer to lean on).
  const dotRadius = mobile
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
      'circle-radius': dotRadius as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
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
    filter: ['all', filter, ['get', 'hasDir']] as unknown as maplibregl.FilterSpecification,
    layout: {
      'icon-image': 'timeline-cone',
      'icon-size': 1.0,
      'icon-rotate': ['get', 'dir'],
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
    },
  });

  return {
    setCutoff(cutoff: number) {
      const f = cutoffFilter(cutoff);
      map.setFilter('timeline-dots', f);
      map.setFilter('timeline-cones', ['all', f, ['get', 'hasDir']] as unknown as maplibregl.FilterSpecification);
      map.setPaintProperty('timeline-dots', 'circle-color', flareColor(cutoff));
    },
    fitTo(scale) {
      map.fitBounds(scale === 'sc' ? SC_BOUNDS : US_BOUNDS, {
        padding: 24,
        duration: 0,
      });
    },
  };
}
