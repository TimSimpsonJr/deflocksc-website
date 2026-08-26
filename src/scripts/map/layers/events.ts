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
import { collapseSeries, countDistinctByField, monthAbbr, dayOfMonth } from '../../../lib/events-view.js';
import type { Occurrence } from '../../../lib/events-view.js';
// Defined in events-constants.ts (a maplibre-free module) so the events-page composer
// can import it WITHOUT statically pulling maplibre-gl into the page's eager chunk.
// Used by the click handlers below and re-exported (see below) so this layer module
// still surfaces it; the single definition and full rationale live in that module.
import { CROSSFADE_ZOOM } from './events-constants.js';

/** [lng, lat] per city slug. */
export type Centroids = Record<string, [number, number]>;

export interface EventLayerData {
  /** County outlines, from /districts/sc-counties.json. */
  counties: GeoJSON.FeatureCollection;
  /**
   * The SC state boundary, from /districts/state-outline.json. Used to build the
   * inverse mask that paints everything outside South Carolina the frame's dark
   * bg, so only SC shows through the base tiles. Optional: without it the mask is
   * skipped and the base tiles show edge to edge, exactly as before.
   */
  stateOutline?: GeoJSON.FeatureCollection;
  /** The occurrences to plot. */
  events: readonly Occurrence[];
  /**
   * City centroids keyed by slug. Each value is either [lng, lat] or
   * { lng, lat }; both are accepted, so raw src/data/city-centroids.json works.
   */
  centroids: Record<string, unknown>;
  /** Display names per city slug, for the pin labels. */
  cityNames: Record<string, string>;
  /**
   * Called when a county fill is clicked, with the county slug — or null when the
   * already-selected county is clicked again (a toggle-off). The layer holds no
   * filter state; the composer decides and calls setSelectedCounty back, which is
   * why the amber outline and the filter chip can never drift apart.
   */
  onCountySelect?: (county: string | null) => void;
  /**
   * Called when an event row in a city pin's popup is activated, with that
   * occurrence and the button that invoked it. The layer owns the popup DOM; the
   * composer owns the shared detail dialog and opens it (openEventPopover), so the
   * map and the sidebar cards open the very same popover from one code path.
   */
  onEventOpen?: (occurrence: Occurrence, invoker: HTMLElement) => void;
}

interface EventLayerState {
  counties: GeoJSON.FeatureCollection;
  centroids: Centroids;
  cityNames: Record<string, string>;
  selectedCounty: string | null;
  onCountySelect: ((county: string | null) => void) | null;
  onEventOpen: ((occurrence: Occurrence, invoker: HTMLElement) => void) | null;
  /** Per-city occurrences for the pin popups, one row per event (its next
   *  occurrence). Rebuilt on every setEventData so it tracks the active filter. */
  cityOccurrences: Map<string, Occurrence[]>;
  teardown: () => void;
}

const EVENT_LAYER_IDS = [
  'sc-mask',
  'county-fill',
  'county-outline',
  'county-highlight',
  'county-badge',
  'city-dots',
  'city-labels',
];

/**
 * The map frame's dark background (#0d0d0d, matching .events-map-frame). The
 * outside-SC mask is painted this colour so the masked area reads as the frame,
 * not as a second map.
 */
const MASK_COLOR = '#0d0d0d';

/**
 * A ring that wraps the whole web-mercator world. Used as the exterior of the
 * mask polygon; the SC boundary rings become holes cut out of it. Wound
 * counter-clockwise; MapLibre keys holes off ring position, not winding, so the
 * order below (world first, SC after) is what makes SC the hole.
 */
const WORLD_RING: GeoJSON.Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/** The exterior ring(s) of the SC boundary, whatever geometry type it ships as. */
function stateExteriorRings(fc: GeoJSON.FeatureCollection): GeoJSON.Position[][] {
  const rings: GeoJSON.Position[][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') rings.push(g.coordinates[0]);
    else if (g.type === 'MultiPolygon') for (const part of g.coordinates) rings.push(part[0]);
  }
  return rings;
}

/**
 * World-with-SC-cut-out, as a one-feature collection. The single polygon has the
 * world ring as its exterior and every SC exterior ring as a hole, so a fill of it
 * covers the globe except South Carolina.
 */
function buildMask(stateOutline: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const holes = stateExteriorRings(stateOutline);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...holes] },
      },
    ],
  };
}

/**
 * The [[west, south], [east, north]] bounds of one county's geometry, or null if
 * the county is unknown. The composer owns view state, so it calls this and drives
 * fitBounds itself; the layer only exposes the geometry it already holds.
 */
export function countyBounds(
  map: maplibregl.Map,
  county: string,
): [[number, number], [number, number]] | null {
  const state = eventStates.get(map);
  if (!state) return null;
  const feature = state.counties.features.find(
    (f) => String(f.properties?.county ?? '') === county,
  );
  if (!feature) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords: unknown): void => {
    if (
      Array.isArray(coords) &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      const x = coords[0] as number;
      const y = coords[1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(coords)) for (const c of coords) walk(c);
  };
  walk((feature.geometry as { coordinates: unknown }).coordinates);
  if (minX === Infinity) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

// Re-exported (imported at the top from events-constants.ts) so the events layer
// module — the composer's natural place to look — still surfaces CROSSFADE_ZOOM,
// while the single definition and the maplibre-free rationale live in that module.
export { CROSSFADE_ZOOM };

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

function cityFeatureCollection(
  state: EventLayerState,
  occurrences: readonly Occurrence[],
): GeoJSON.FeatureCollection {
  const counts = countDistinctByField(occurrences, 'city');
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
  const counts = countDistinctByField(occurrences, 'county');
  for (const f of state.counties.features) {
    const slug = String(f.properties?.county ?? '');
    (f.properties as Record<string, unknown>).count = counts.get(slug) ?? 0;
  }
  source.setData(state.counties);
}

/**
 * Group occurrences by city slug and collapse each city's list to one row per
 * event (its next occurrence). The input is sorted ascending, so collapseSeries
 * keeps each event's earliest upcoming date — the date the popup row and the
 * detail popover then agree on. This is what the pin popups iterate, so a weekly
 * meetup shows as a single row, not one row per week over the horizon.
 */
function groupCityOccurrences(
  occurrences: readonly Occurrence[],
): Map<string, Occurrence[]> {
  const byCity = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const arr = byCity.get(o.event.city);
    if (arr) arr.push(o);
    else byCity.set(o.event.city, [o]);
  }
  for (const [city, list] of byCity) byCity.set(city, collapseSeries(list));
  return byCity;
}

/**
 * Push a new occurrence set at an events map. Recomputes county counts, city
 * pins, and the per-city occurrence index the pin popups read. No-op if the map
 * has no event layers yet.
 */
export function setEventData(map: maplibregl.Map, occurrences: readonly Occurrence[]): void {
  const state = eventStates.get(map);
  if (!state) return;
  applyCountyCounts(map, state, occurrences);
  state.cityOccurrences = groupCityOccurrences(occurrences);
  (map.getSource('event-cities') as maplibregl.GeoJSONSource | undefined)
    ?.setData(cityFeatureCollection(state, occurrences));
}

/**
 * Highlight one county, or none, by pushing its outline into the `county-selected`
 * source the events-page task already created. The composer owns the filter state
 * and calls this; the map never decides on its own what is selected, so the amber
 * outline always matches the active chip. No-op if the map has no event layers yet.
 */
export function setSelectedCounty(map: maplibregl.Map, county: string | null): void {
  const state = eventStates.get(map);
  if (!state) return;
  state.selectedCounty = county;
  const source = map.getSource('county-selected') as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const feature = county
    ? state.counties.features.find((f) => String(f.properties?.county ?? '') === county)
    : undefined;
  source.setData({
    type: 'FeatureCollection',
    features: feature ? [{ type: 'Feature', geometry: feature.geometry, properties: {} }] : [],
  });
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
    selectedCounty: null,
    onCountySelect: data.onCountySelect ?? null,
    onEventOpen: data.onEventOpen ?? null,
    cityOccurrences: new Map(),
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

  // --- Outside-SC mask (bottom-most event layer) ---
  // Everything outside South Carolina is painted the frame's dark bg, so only SC
  // shows through the base tiles. Added first, so it sits beneath the choropleth
  // and pins (both of which live inside SC and are never covered).
  if (data.stateOutline) {
    map.addSource('sc-mask', { type: 'geojson', data: buildMask(data.stateOutline) });
    map.addLayer({
      id: 'sc-mask',
      type: 'fill',
      source: 'sc-mask',
      paint: { 'fill-color': MASK_COLOR, 'fill-opacity': 1 },
    });
  }

  // --- Below z8: county choropleth + count badges ---
  // Every one of the 46 counties paints: a muted grey where there are no events
  // (no badge), red-ramped where there is at least one. Both are clickable — the
  // fill is a hit target regardless of count — so any county can be selected.

  map.addLayer({
    id: 'county-fill',
    type: 'fill',
    source: 'sc-counties',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'count'], 0],
        '#3f3f46',
        [
          'interpolate', ['linear'], ['get', 'count'],
          1, '#7f1d1d',
          3, '#b91c1c',
          8, '#ef4444',
        ],
      ],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 8, 0],
    },
  });

  map.addLayer({
    id: 'county-outline',
    type: 'line',
    source: 'sc-counties',
    paint: {
      // Faint neutral hairline around a zero-event county so it still reads as a
      // distinct region; the reddish outline is reserved for counties with events.
      'line-color': [
        'case',
        ['==', ['get', 'count'], 0],
        'rgba(255,255,255,0.14)',
        '#fca5a5',
      ],
      'line-width': 1,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 8, 0],
    },
  });

  // County-select highlight. Its own source so a setData on sc-counties (a count
  // refresh) never disturbs the selection, and vice versa. Unlike the choropleth,
  // this outline does NOT fade at the z8 crossfade: zoom-to-county carries the view
  // past z8, and the amber outline is what keeps the selected county legible around
  // the city pins once the choropleth underneath it has faded out.
  map.addLayer({
    id: 'county-highlight',
    type: 'line',
    source: 'county-selected',
    paint: {
      'line-color': '#fbbf24',
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 10, 3],
      'line-opacity': 0.9,
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
  for (const id of ['sc-mask', 'sc-counties', 'event-cities', 'county-selected']) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

function bindEventInteractions(map: maplibregl.Map): () => void {
  // City pin -> popup listing the event(s) at that city. Each row is a real
  // <button> that opens the shared detail popover for its occurrence, so a map
  // pin and a sidebar card reach the identical dialog. Built as DOM nodes with
  // setDOMContent (not setHTML): the buttons need click handlers, and no event
  // string ever touches innerHTML. The pin marks a city centroid, not a venue.
  const onCityClick = (e: maplibregl.MapLayerMouseEvent) => {
    // City pins are invisible below the crossfade zoom; a click near a centroid
    // there belongs to the choropleth, not to a pin, so ignore it.
    if (map.getZoom() < CROSSFADE_ZOOM) return;
    const f = e.features?.[0];
    if (!f) return;
    const state = eventStates.get(map);
    if (!state) return;
    const slug = String(f.properties?.city ?? '');
    const label = String(f.properties?.label ?? '');
    const occurrences = state.cityOccurrences.get(slug) ?? [];

    const container = document.createElement('div');
    container.className = 'events-popup';
    const heading = document.createElement('strong');
    heading.textContent = label;
    container.append(heading);

    if (occurrences.length === 0) {
      // Defensive: a rendered pin always has at least one occurrence, but if the
      // index and the source ever drift, show the venue note rather than nothing.
      const note = document.createElement('em');
      note.textContent = 'Pins mark a city center, never a venue.';
      container.append(note);
    } else {
      const list = document.createElement('ul');
      list.className = 'events-popup-list';
      for (const o of occurrences) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'events-popup-event';
        btn.setAttribute('aria-haspopup', 'dialog');
        const date = document.createElement('span');
        date.className = 'events-popup-event-date';
        date.textContent = `${monthAbbr(o.date)} ${dayOfMonth(o.date)}`;
        const title = document.createElement('span');
        title.className = 'events-popup-event-title';
        title.textContent = o.event.title;
        btn.append(date, title);
        btn.addEventListener('click', () => state.onEventOpen?.(o, btn));
        li.append(btn);
        list.append(li);
      }
      container.append(list);
    }

    new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 14 })
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setDOMContent(container)
      .addTo(map);
  };

  // County fill -> report a selection to the composer. The choropleth is a filter
  // control, not a zoom shortcut: clicking a county hands its slug to the composer,
  // which owns the filter state and calls setSelectedCounty back; clicking the
  // already-selected county clears it. We do NOT ease in past z8 here — that would
  // fade the choropleth out, and the choropleth is doubling as the selection UI.
  const onCountyClick = (e: maplibregl.MapLayerMouseEvent) => {
    // At and above the crossfade zoom the choropleth has faded out and the city pins
    // own clicks (see CROSSFADE_ZOOM); the fill is still a hit target, so ignore
    // those clicks or a county selection would fire under a city pin.
    if (map.getZoom() >= CROSSFADE_ZOOM) return;
    const slug = String(e.features?.[0]?.properties?.county ?? '');
    if (!slug) return;
    const state = eventStates.get(map);
    if (!state) return;
    state.onCountySelect?.(slug === state.selectedCounty ? null : slug);
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
