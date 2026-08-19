/**
 * Events layer.
 *
 * Everything the /events map needs on top of the shared map core: the SC county
 * choropleth with count badges below z8, the crossfade to city-centroid pins
 * above z8, the county-select highlight, and the city/county click handlers.
 *
 * A layer module in the same shape as map/layers/cameras.ts: it takes a map that
 * map/core.ts already built (createMap -> MapHandle) and whose style has loaded,
 * and adds sources, layers and handlers to it. It does NOT build a map, and it
 * does NOT own view state (fit/center lives in the composer).
 *
 * Deliberately does NOT import map/layers/cameras.ts and does NOT fetch
 * /camera-data.json. That 804 KB file is the difference between a 470 KB and a
 * 1,274 KB events page (design §11); a separate layer module is what keeps it
 * unreachable from this page.
 */

import maplibregl from 'maplibre-gl';
import { escapeHtml } from '../../../lib/escape-html.js';
import type { Occurrence } from '../../../lib/events-view.js';

/** [lng, lat] per city slug. */
export type Centroids = Record<string, [number, number]>;

export interface EventLayerData {
  /** County outlines, from /districts/sc-counties.json. */
  counties: GeoJSON.FeatureCollection;
  /** The occurrences to plot. */
  events: readonly Occurrence[];
  /**
   * City centroids keyed by slug. Each value is either [lng, lat] or
   * { lng, lat }; both are accepted, so raw src/data/city-centroids.json works.
   */
  centroids: Record<string, unknown>;
  /** Display names per city slug, for the pin labels. */
  cityNames: Record<string, string>;
}

interface EventLayerState {
  counties: GeoJSON.FeatureCollection;
  centroids: Centroids;
  cityNames: Record<string, string>;
  teardown: () => void;
}

const EVENT_LAYER_IDS = [
  'county-fill',
  'county-outline',
  'county-highlight',
  'county-badge',
  'city-dots',
  'city-labels',
];

/** Per-map state, so setEventData can recompute and removeEventLayers can unbind. */
const eventStates = new WeakMap<maplibregl.Map, EventLayerState>();

/** Accepts either [lng, lat] or { lng, lat } per city slug. */
function normalizeCentroids(raw: Record<string, unknown>): Centroids {
  const out: Centroids = {};
  for (const [slug, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.length >= 2) {
      out[slug] = [Number(value[0]), Number(value[1])];
    } else if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if (typeof v.lng === 'number' && typeof v.lat === 'number') out[slug] = [v.lng, v.lat];
    }
  }
  return out;
}

function countBy(occurrences: readonly Occurrence[], field: 'county' | 'city'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of occurrences) {
    const k = o.event[field];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function cityFeatureCollection(
  state: EventLayerState,
  occurrences: readonly Occurrence[],
): GeoJSON.FeatureCollection {
  const counts = countBy(occurrences, 'city');
  const features: GeoJSON.Feature[] = [];
  for (const [slug, count] of counts) {
    const coords = state.centroids[slug];
    if (!coords) {
      console.warn(`events-map: no centroid for city "${slug}"`);
      continue;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: { city: slug, label: state.cityNames[slug] ?? slug, count },
    });
  }
  return { type: 'FeatureCollection', features };
}

function applyCountyCounts(
  map: maplibregl.Map,
  state: EventLayerState,
  occurrences: readonly Occurrence[],
): void {
  const source = map.getSource('sc-counties') as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const counts = countBy(occurrences, 'county');
  for (const f of state.counties.features) {
    const slug = String(f.properties?.county ?? '');
    (f.properties as Record<string, unknown>).count = counts.get(slug) ?? 0;
  }
  source.setData(state.counties);
}

/**
 * Push a new occurrence set at an events map. Recomputes county counts and city
 * pins from the map's stored state. No-op if the map has no event layers yet.
 */
export function setEventData(map: maplibregl.Map, occurrences: readonly Occurrence[]): void {
  const state = eventStates.get(map);
  if (!state) return;
  applyCountyCounts(map, state, occurrences);
  (map.getSource('event-cities') as maplibregl.GeoJSONSource | undefined)
    ?.setData(cityFeatureCollection(state, occurrences));
}

/**
 * Add the events choropleth, city pins, highlight and interactions to a map that
 * map/core.ts already created and whose style has finished loading.
 */
export function addEventLayers(map: maplibregl.Map, data: EventLayerData): void {
  const counties = data.counties;
  for (const f of counties.features) (f.properties as Record<string, unknown>).count = 0;

  const state: EventLayerState = {
    counties,
    centroids: normalizeCentroids(data.centroids),
    cityNames: data.cityNames,
    teardown: () => {},
  };

  map.addSource('sc-counties', { type: 'geojson', data: counties });
  map.addSource('event-cities', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addSource('county-selected', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // --- Below z8: county choropleth + count badges ---

  map.addLayer({
    id: 'county-fill',
    type: 'fill',
    source: 'sc-counties',
    filter: ['>', ['get', 'count'], 0],
    paint: {
      'fill-color': [
        'interpolate', ['linear'], ['get', 'count'],
        1, '#7f1d1d',
        3, '#b91c1c',
        8, '#ef4444',
      ],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 8, 0],
    },
  });

  map.addLayer({
    id: 'county-outline',
    type: 'line',
    source: 'sc-counties',
    filter: ['>', ['get', 'count'], 0],
    paint: {
      'line-color': '#fca5a5',
      'line-width': 1,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 8, 0],
    },
  });

  // County-select highlight. Its own source so a setData on sc-counties (a count
  // refresh) never disturbs the selection, and vice versa.
  map.addLayer({
    id: 'county-highlight',
    type: 'line',
    source: 'county-selected',
    paint: {
      'line-color': '#fbbf24',
      'line-width': 2,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.9, 8, 0],
    },
  });

  map.addLayer({
    id: 'county-badge',
    type: 'symbol',
    source: 'sc-counties',
    filter: ['>', ['get', 'count'], 0],
    layout: {
      'text-field': ['to-string', ['get', 'count']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#450a0a',
      'text-halo-width': 1.4,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 8, 0],
    },
  });

  // --- Above z8: city-centroid pins ---

  map.addLayer({
    id: 'city-dots',
    type: 'circle',
    source: 'event-cities',
    paint: {
      'circle-color': '#ef4444',
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 7, 5, 13],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.75)',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.95],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.9],
    },
  });

  map.addLayer({
    id: 'city-labels',
    type: 'symbol',
    source: 'event-cities',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 1.1],
    },
    paint: {
      'text-color': '#e8e8e8',
      'text-halo-color': '#0d0d0d',
      'text-halo-width': 1.4,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
    },
  });

  state.teardown = bindEventInteractions(map);
  eventStates.set(map, state);

  // Seed the sources now that the state (and its centroids) is registered.
  setEventData(map, data.events);
}

export function removeEventLayers(map: maplibregl.Map): void {
  eventStates.get(map)?.teardown();
  eventStates.delete(map);
  for (const id of EVENT_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ['sc-counties', 'event-cities', 'county-selected']) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

function bindEventInteractions(map: maplibregl.Map): () => void {
  // City pin -> popup. The pin is a city centroid, not a venue; the copy says so —
  // overstating a privacy control on an anti-surveillance site costs more than not
  // having one.
  const onCityClick = (e: maplibregl.MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const label = String(f.properties?.label ?? '');
    const count = Number(f.properties?.count ?? 0);
    const html =
      `<div class="events-popup">` +
      `<strong>${escapeHtml(label)}</strong>` +
      `<span>${count} ${count === 1 ? 'event' : 'events'}</span>` +
      `<em>Exact location shared in the group.</em>` +
      `</div>`;
    new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 14 })
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(html)
      .addTo(map);
  };

  // County fill -> highlight the clicked county and ease in past the crossfade.
  const onCountyClick = (e: maplibregl.MapLayerMouseEvent) => {
    const f = e.features?.[0];
    const selected = map.getSource('county-selected') as maplibregl.GeoJSONSource | undefined;
    selected?.setData({
      type: 'FeatureCollection',
      features: f ? [{ type: 'Feature', geometry: f.geometry, properties: {} }] : [],
    });
    map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom() + 2, 8.5) });
  };

  const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const onLeave = () => { map.getCanvas().style.cursor = ''; };

  map.on('click', 'city-dots', onCityClick);
  map.on('click', 'county-fill', onCountyClick);
  map.on('mouseenter', 'city-dots', onEnter);
  map.on('mouseleave', 'city-dots', onLeave);
  map.on('mouseenter', 'county-fill', onEnter);
  map.on('mouseleave', 'county-fill', onLeave);

  return () => {
    map.off('click', 'city-dots', onCityClick);
    map.off('click', 'county-fill', onCountyClick);
    map.off('mouseenter', 'city-dots', onEnter);
    map.off('mouseleave', 'city-dots', onLeave);
    map.off('mouseenter', 'county-fill', onEnter);
    map.off('mouseleave', 'county-fill', onLeave);
  };
}
