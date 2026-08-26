/**
 * Events page runtime: view tabs, the baked/overlay merge, and the lazy map load.
 *
 * The list and month views are server-rendered from src/data/events.json, so the
 * page is complete with JavaScript off. This module only patches that markup:
 * it inserts anything submitted since the last weekly fold. The overlay only ADDS —
 * it never tombstones a baked card (a revoked event is removed by the fold rewriting
 * events.json, and stopped at /go in the meantime). Card markup is therefore written
 * twice — once in EventsList.astro, once in buildCard() below. Keep the class names
 * in sync.
 *
 * The map is COMPOSED, not rebuilt: this module calls createMap() from
 * src/scripts/map/core.ts (the shared MapLibre bootstrap) and then addEventLayers()
 * from src/scripts/map/layers/events.ts, the same core-plus-layer split the camera
 * map uses. It never imports the camera layer, so /camera-data.json can never load.
 *
 * All merge and date logic comes from src/lib/events-view.ts, so the browser and
 * the build agree by construction.
 *
 * Nothing here uses innerHTML: every string from an event goes through
 * textContent, so a hostile title cannot become markup even if the sanitizer
 * upstream ever misses one.
 */

import type { PublicEvent } from '../lib/public-event.js';
import type { Occurrence, EventFilter, EventTypeFilter } from '../lib/events-view.js';
import type { MapHandle } from './map/core.js';
// The crossfade zoom is the single source of truth in map/layers/events-constants.ts
// (the events layer re-exports it). The composer imports it so fitToSelection can
// guarantee a county fit reaches it and the city pins become visible + clickable.
// Imported from the constants module, NOT from map/layers/events.ts: that module
// imports maplibre-gl at module scope, so a static import from it would drag the
// ~1 MB maplibre bundle into this page's eager chunk and break the lazy map load.
import { CROSSFADE_ZOOM } from './map/layers/events-constants.js';
import {
  mergeEvents,
  parseOverlayEnvelope,
  expandAll,
  splitByToday,
  collapseSeries,
  recurrenceLabel,
  monthAbbr,
  monthLong,
  dayOfMonth,
  weekdayIndex,
  formatTime12,
  sortKey,
  matchesFilter,
  filterEvents,
  facetCounts,
  countyOptions,
  filterHash,
  parseFilterHash,
  emptyStateProof,
  eventTypeLabel,
  eventTypeSlug,
  upcomingOccurrences,
  upcomingFooter,
} from '../lib/events-view.js';
// The county filter is a searchable combobox built on accessible-autocomplete,
// the same widget (and the same dark `.autocomplete__*` skin in global.css) the
// submit form's city picker uses. escapeHtml guards the county name where it is
// interpolated into a suggestion template that accessible-autocomplete writes as
// innerHTML — county names are build-time-trusted registry data, but the project
// rule is that nothing reaches innerHTML unescaped.
import accessibleAutocomplete from 'accessible-autocomplete';
import { escapeHtml } from '../lib/escape-html.js';

interface Island {
  events: PublicEvent[];
  cityNames: Record<string, string>;
  countyNames: Record<string, string>;
  today: string;
  horizonEnd: string;
  pastCutoff: string;
}

const islandEl = document.getElementById('events-data');
if (!islandEl) throw new Error('events-page: #events-data island missing');
const island: Island = JSON.parse(islandEl.textContent || '{}');

const bakedIds = new Set(island.events.map((e) => e.id));

// The shared "council attendees" Signal group linked from every council popover.
// One open group for all council meetings (not per-event), so it lives as a lone
// constant rather than in each council record. Public by design; the "Before you
// join" warning still gates it. Set on window.location at click time (never a
// static href) to match the organizer intake path's anti-scrape posture.
const COUNCIL_SIGNAL_URL = 'https://signal.group/#CjQKIA_uJV4h7QAWyjqAUiyntTFDhB3AP06DptOuN0iB8m5GEhD5z3IHoRiSVqqMMjPTgLF3';

/** Every event the page knows about. Baked at build, replaced by the overlay merge. */
let allEvents: PublicEvent[] = island.events;

/** The active filter, seeded from the URL hash so a shared #county=… link narrows
 *  on load. The prerendered page is the full list; the client filters over it. */
let filter: EventFilter = parseFilterHash(location.hash);

function upcomingFor(events: readonly PublicEvent[]): Occurrence[] {
  return splitByToday(expandAll(events, island.horizonEnd), island.today).upcoming;
}

/** What the map draws: type-filtered but never county-filtered, so every other
 *  county stays on the choropleth and stays one click away. */
function mapOccurrences(): Occurrence[] {
  return upcomingFor(filterEvents(allEvents, { county: 'all', type: filter.type }));
}

// --- Tabs ---------------------------------------------------------------

const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#events-tabs [role="tab"]'),
);

function selectTab(name: string) {
  for (const tab of tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.classList.toggle('is-selected', on);
    tab.tabIndex = on ? 0 : -1;
  }
  for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.classList.toggle('is-active', panel.dataset.panel === name);
  }
  if (name === 'map') void loadMap();
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab!));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const visible = tabs.filter((t) => t.offsetParent !== null);
    const i = visible.indexOf(tab);
    const next = visible[(i + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
    next.focus();
    selectTab(next.dataset.tab!);
  });
}

// --- Lazy map (composes map/core.ts + map/layers/events.ts) --------------

/** SC bounding box, same values as SC_BBOX in src/lib/district-matcher.ts. */
const SC_BOUNDS: [[number, number], [number, number]] = [
  [-83.5, 32.0],
  [-78.5, 35.3],
];

/** SC_BOUNDS with generous padding, used as the map's maxBounds so the user can
 *  pan within SC and a little past its edges but never off into other states.
 *  Wide enough that the full-SC framing still fits without being clamped. */
const SC_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-85.2, 30.4],
  [-76.8, 36.9],
];

/** Padding (px) and zoom cap for the zoom-to-county animation. The cap keeps a
 *  small county from diving so far in that it loses all context; the county still
 *  crosses the z8 crossfade, so its city pins appear and the amber outline (which
 *  no longer fades at z8) frames them. */
const COUNTY_FIT_PADDING = 40;
const COUNTY_FIT_MAXZOOM = 9;
/** Shared duration for both the zoom-in-to-county and zoom-back-to-SC animations. */
const FIT_DURATION_MS = 650;

let mapHandle: MapHandle | null = null;
let eventsLayer: typeof import('./map/layers/events.js') | null = null;
let mapLoading = false;

/** The county the map view is currently framed on ('all' = full SC). Tracked so a
 *  filter change that leaves the county untouched (e.g. a type toggle) does not
 *  re-trigger the fit animation. Seeded when the map first loads. */
let fittedCounty: string | null = null;

/** Frame the map on the active county, or back out to the full SC view, animating
 *  only when the selection actually changed. The layer owns the geometry and
 *  exposes countyBounds(); the composer owns the view and drives the camera here. */
function fitToSelection(animate: boolean): void {
  if (!mapHandle || !eventsLayer) return;
  if (filter.county === fittedCounty) return;
  fittedCounty = filter.county;
  const duration = animate ? FIT_DURATION_MS : 0;
  if (filter.county === 'all') {
    mapHandle.map.fitBounds(SC_BOUNDS, { padding: 20, duration });
    return;
  }
  const bounds = eventsLayer.countyBounds(mapHandle.map, filter.county);
  if (bounds) {
    // A county's natural fit can settle just below the z8 crossfade — especially on
    // a small map container, where the fixed 40px padding eats a big fraction of the
    // viewport (and even some large counties settle just under z8 on desktop). Below
    // z8 the city pins are both invisible (circle-opacity 0) and unclickable
    // (onCityClick bails under CROSSFADE_ZOOM), so probe the fit first and, when it
    // would land short, force the view to exactly CROSSFADE_ZOOM.
    // Trade-off: a large county on a small map may then crop slightly, but its pins
    // stay visible and reachable, which is what the county fit is for.
    const cam = mapHandle.map.cameraForBounds(bounds, {
      padding: COUNTY_FIT_PADDING,
      maxZoom: COUNTY_FIT_MAXZOOM,
    });
    if (cam && typeof cam.zoom === 'number' && cam.zoom < CROSSFADE_ZOOM) {
      mapHandle.map.easeTo({ center: cam.center, zoom: CROSSFADE_ZOOM, duration });
    } else {
      mapHandle.map.fitBounds(bounds, {
        padding: COUNTY_FIT_PADDING,
        maxZoom: COUNTY_FIT_MAXZOOM,
        duration,
      });
    }
  } else {
    mapHandle.map.fitBounds(SC_BOUNDS, { padding: 20, duration });
  }
}

/** How long to wait for the style 'load' event before treating it as a failure. */
const MAP_LOAD_TIMEOUT_MS = 15000;

function clearMapNotice() {
  document.getElementById('events-map-frame')?.querySelector('.events-map-error')?.remove();
}

// Visible, retryable fallback for a failed map load. Without it a rejected import,
// a non-OK sc-counties fetch, or a style-load timeout would leave the map frame
// blank with no explanation and no way back.
function showMapNotice() {
  const frame = document.getElementById('events-map-frame');
  if (!frame || frame.querySelector('.events-map-error')) return;
  const box = el('div', 'events-map-error');
  box.append(
    el('p', 'events-map-error-lead', "The map couldn't load."),
    el('p', 'events-map-error-note', 'The List and Month views show the same events.'),
  );
  const retry = el('button', 'event-signal event-signal-btn', 'Try again') as HTMLButtonElement;
  retry.type = 'button';
  retry.addEventListener('click', () => { clearMapNotice(); void loadMap(); });
  box.append(retry);
  frame.append(box);
}

async function loadMap() {
  if (mapHandle) { mapHandle.resize(); return; }
  if (mapLoading) return;
  mapLoading = true;
  clearMapNotice();

  let handle: MapHandle | null = null;
  try {
    await import('maplibre-gl/dist/maplibre-gl.css');
    const [{ createMap }, layer, centroidsMod, countiesRes, outlineRes] = await Promise.all([
      import('./map/core.js'),
      import('./map/layers/events.js'),
      import('../data/city-centroids.json'),
      fetch('/districts/sc-counties.json'),
      fetch('/districts/state-outline.json'),
    ]);
    if (!countiesRes.ok) throw new Error(`sc-counties.json: ${countiesRes.status}`);
    const counties = (await countiesRes.json()) as GeoJSON.FeatureCollection;
    // The mask is a nice-to-have, not load-bearing: a failed state-outline fetch
    // leaves the map unmasked rather than aborting the whole load.
    const stateOutline = outlineRes.ok
      ? ((await outlineRes.json()) as GeoJSON.FeatureCollection)
      : undefined;

    handle = createMap({
      container: 'events-map',
      style: '/map-style.json',
      center: [-81.0, 33.7],
      zoom: 6,
      interactive: true,
      maxBounds: SC_MAX_BOUNDS,
      // Plain wheel / one-finger drag scrolls the PAGE past the map; Ctrl/Cmd+wheel
      // (desktop) and two-finger drag (mobile) zoom/pan the map. Replaces the manual
      // Ctrl scroll-lock, which was fragile on desktop and trapped one-finger pans on
      // mobile. Scoped to the events map — the camera map keeps its own behaviour.
      cooperativeGestures: true,
    });

    // Wait for the style, but bound the wait: a 'load' event that never fires — a
    // missing or invalid /map-style.json, say — would otherwise hang this promise
    // forever with mapLoading stuck true. The timeout turns that hang into a
    // rejection that the catch below handles, so the load stays retryable. (We do
    // not reject on the map's 'error' event: MapLibre fires it for benign, non-fatal
    // problems like a single dropped tile, which must not abort a working map.)
    const map = handle.map;
    await new Promise<void>((resolve, reject) => {
      if (map.isStyleLoaded()) { resolve(); return; }
      const timer = window.setTimeout(
        () => reject(new Error('events-map: style load timed out')),
        MAP_LOAD_TIMEOUT_MS,
      );
      map.once('load', () => { window.clearTimeout(timer); resolve(); });
    });

    map.fitBounds(SC_BOUNDS, { padding: 20, duration: 0 });

    layer.addEventLayers(map, {
      counties,
      stateOutline,
      events: mapOccurrences(),
      centroids: (centroidsMod as { default: Record<string, unknown> }).default,
      cityNames: island.cityNames,
      onCountySelect: (county) => {
        // The map does not hold filter state; it reports a click and this module
        // decides. That is what makes the chip and the amber outline the same thing.
        pushHash({ ...filter, county: county ?? 'all' });
      },
      onEventOpen: (occurrence, invoker) => openEventPopover(occurrence, invoker),
    });
    layer.setSelectedCounty(map, filter.county === 'all' ? null : filter.county);

    // Commit only once the map is fully built. A mid-build failure therefore leaves
    // mapHandle null, so the next Map-tab click or desktop media-query change retries
    // from scratch instead of resizing a half-initialized handle.
    mapHandle = handle;
    eventsLayer = layer;

    // Seed the view to match the active filter. A bare /events (county 'all') stays
    // on the full-SC framing set above; a shared #county=… link frames that county
    // now, without an animation on first paint. fittedCounty starts here so later
    // selection changes animate and pure type toggles do not.
    fittedCounty = 'all';
    fitToSelection(false);

    // DEV-ONLY test hook. import.meta.env.DEV is statically replaced with `false`
    // in a production build, so Vite dead-code-eliminates this line and the handle
    // never ships. It lets headless E2E read the live map (zoom, bounds, layers)
    // without the composer having to surface its private map state in prod.
    if (import.meta.env.DEV) {
      (window as unknown as { __eventsMap?: unknown }).__eventsMap = map;
    }
  } catch (err) {
    console.warn('events: map unavailable', err);
    handle?.destroy();
    showMapNotice();
    // mapHandle stays null: a later trigger (tab click, media change, Try again) retries.
  } finally {
    mapLoading = false;
  }
}

// Desktop shows the map permanently, so load it when it scrolls into view.
// Mobile loads it only from the Map tab, which keeps MapLibre (261 KB) out of
// the default mobile page load.
const desktop = window.matchMedia('(min-width: 1024px)');
const mapEl = document.getElementById('events-map');
if (mapEl && desktop.matches) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); void loadMap(); }
    },
    { rootMargin: '200px' },
  );
  io.observe(mapEl);
}
desktop.addEventListener('change', (e) => { if (e.matches) void loadMap(); });

// --- Month chip -> list card --------------------------------------------
// A month chip points at its matching list card. That card lives in the List
// panel, which is display:none while the Month tab is active, so a bare fragment
// jump (#event-<id>) lands on nothing. Intercept the click, switch to the list
// view, then scroll the card in. Delegated on the panel so it also covers chips
// that applyMerge() inserts after load.

function focusListCard(eventId: string, date: string | null) {
  const list = document.getElementById('events-list');
  // Fallback: with no matching card, keep keyboard focus in the calendar by
  // landing it on the List tab rather than letting selectTab() drop it to <body>.
  const focusListTab = () => document.getElementById('tab-list')?.focus();
  if (!list || !eventId) { focusListTab(); return; }
  const cards = Array.from(
    list.querySelectorAll<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`),
  );
  // A recurring event has one card per occurrence, all sharing its id; match the
  // date too so the chip lands on its own day, falling back to the first card.
  const card = (date && cards.find((c) => c.dataset.date === date)) || cards[0];
  if (!card) { focusListTab(); return; }
  card.scrollIntoView({ block: 'center' });
  // selectTab('list') set the Month panel to display:none while the activated chip
  // still held focus, so document.activeElement had already reset to <body>. Move
  // focus onto the card itself (WCAG 2.4.3): make it programmatically focusable and
  // focus without scrolling, since scrollIntoView above already positioned it.
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
  card.classList.add('event-card-flash');
  window.setTimeout(() => card.classList.remove('event-card-flash'), 1200);
}

document.getElementById('panel-month')?.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('.month-chip');
  if (!chip) return;
  e.preventDefault();
  selectTab('list');
  focusListCard(chip.dataset.eventId ?? '', chip.dataset.date ?? null);
});

// --- Card and chip construction (mirrors EventsList / EventsMonth) -------

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function placeLabel(e: PublicEvent): string {
  const city = island.cityNames[e.city] ?? e.city;
  const county = island.countyNames[e.county] ?? e.county;
  return `${city} · ${county} County`;
}

function buildCard(o: Occurrence): HTMLLIElement {
  const e = o.event;
  // eventTypeSlug maps the type to its class suffix through an exhaustive switch
  // (shared with the popover's data-type), so only the three known suffixes can
  // ever reach a class name and a new type fails the build rather than defaulting.
  const typeSuffix = eventTypeSlug(e.type);
  const li = document.createElement('li');
  // The event-card--{type} modifier keys the typeline colour (amber = meetup,
  // green = public, blue = council) in events.astro.
  li.className = `event-card event-card--${typeSuffix}`;
  li.dataset.eventId = e.id;
  li.dataset.date = o.date;
  li.dataset.sort = sortKey(o.date, e.time, e.id);

  const date = el('div', 'event-date');
  date.setAttribute('aria-hidden', 'true');
  // Mirror EventsList.astro's date panel exactly (the class-parity contract):
  // the day, then the month abbr.
  date.append(
    el('span', 'event-date-day', dayOfMonth(o.date)),
    el('span', 'event-date-mon', monthAbbr(o.date)),
  );

  const body = el('div', 'event-body');
  // The title is a button that opens the shared detail popover. Mirrors
  // EventsList.astro's <h3><button class="event-title-btn">…</button></h3> so the
  // server render and this client render stay in class-parity (the documented
  // contract). A delegated handler on #events-list opens the popover, so this
  // renderer attaches no per-card listener.
  const heading = el('h3', 'event-title');
  const titleBtn = el('button', 'event-title-btn', e.title) as HTMLButtonElement;
  titleBtn.type = 'button';
  titleBtn.setAttribute('aria-haspopup', 'dialog');
  heading.append(titleBtn);
  body.append(heading);
  // Mirror EventsList.astro's .event-meta exactly: the visible date block is
  // aria-hidden, so the accessible date lives in an sr-only span here. Without
  // it a screen reader hears the time and place but never the date. Keep the
  // markup identical to the server render (the documented class-parity contract).
  const meta = el('p', 'event-meta');
  meta.append(
    el('span', 'sr-only', `${o.date} `),
    document.createTextNode(`${formatTime12(e.time)} · ${placeLabel(e)}`),
  );
  body.append(meta);
  if (e.address) body.append(el('p', 'event-address', e.address));
  if (e.description) body.append(el('p', 'event-desc', e.description));

  // Quiet type/recurrence line. Mirrors EventsList.astro's <p class="event-typeline">
  // exactly (the class-parity contract): the type label, with " · Repeats …"
  // appended for a collapsed recurring series. The Signal join lives only in the
  // detail popover now, so the card's sole control is the title button above.
  const repeat = recurrenceLabel(e.recurrence);
  const typeLabel = eventTypeLabel(e.type);
  body.append(el('p', 'event-typeline', repeat ? `${typeLabel} · ${repeat}` : typeLabel));

  li.append(date, body);
  return li;
}

function buildChip(o: Occurrence): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'month-chip';
  a.href = `#event-${encodeURIComponent(o.event.id)}`;
  a.dataset.eventId = o.event.id;
  a.dataset.date = o.date;
  a.dataset.sort = sortKey(o.date, o.event.time, o.event.id);
  a.title = `${formatTime12(o.event.time)} · ${island.cityNames[o.event.city] ?? o.event.city}`;
  a.append(el('span', 'event-title month-chip-title', o.event.title));
  return a;
}

function buildPastRow(o: Occurrence): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'event-past-row';
  li.append(
    el('span', 'event-past-date', `${monthAbbr(o.date)} ${dayOfMonth(o.date)}`),
    el('span', 'event-title event-past-title', o.event.title),
    el('span', 'event-past-place', placeLabel(o.event)),
  );
  return li;
}

function insertSorted(container: Element, node: HTMLElement, key: string) {
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if ((child.dataset.sort ?? '') > key) { container.insertBefore(node, child); return; }
  }
  container.append(node);
}

// --- Event detail popover -----------------------------------------------
// One shared <dialog class="modal"> (server-rendered in events.astro) filled per
// event and opened here. Both the sidebar cards and the map pins reach it through
// openEventPopover, so there is a single detail surface. Native showModal() gives
// the focus trap and Esc-to-close; the dialog's method="dialog" forms give the ✕,
// the Close button, and the backdrop click their close behaviour. Every slot is
// set with textContent or built as nodes — no event string reaches innerHTML.

const detailDialog = document.getElementById('event-detail') as HTMLDialogElement | null;

/** The control that opened the dialog, refocused on close (WCAG 2.4.3). */
let popoverInvoker: HTMLElement | null = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** The external-link glyph beside a public event's address, matching the mockup.
 *  Built via createElementNS (createElement makes HTML, not SVG, elements). */
function extLinkIcon(): SVGElement {
  const svg = svgEl('svg', {
    class: 'event-pop-ext-icon',
    viewBox: '0 0 24 24',
    width: '14',
    height: '14',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
    svgEl('polyline', { points: '15 3 21 3 21 9' }),
    svgEl('line', { x1: '10', y1: '14', x2: '21', y2: '3' }),
  );
  return svg;
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** 'Wednesday, October 14, 2026' for '2026-10-14'. Uses the same zone-independent
 *  helpers the rest of the page does, so the popover date never drifts a day. */
function fullDateLabel(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${monthLong(y, m)} ${dayOfMonth(iso)}, ${y}`;
}

/** 'Wednesday, Oct 14' for '2026-10-14'. Uses the same zone-independent helpers
 *  as fullDateLabel so the popover date never drifts a day. */
function upcomingDateLabel(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${monthLong(y, m).slice(0, 3)} ${dayOfMonth(iso)}`;
}

function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Fill the shared detail dialog for one occurrence and open it as a modal.
 *  `invoker` is refocused when the dialog closes; it falls back to whatever had
 *  focus at call time (the map popup button, say). */
export function openEventPopover(o: Occurrence, invoker?: HTMLElement | null): void {
  if (!detailDialog) return;
  const e = o.event;
  const meetup = e.type === 'meetup';

  // eventTypeSlug maps the type to its data-type through an exhaustive switch
  // (shared with buildCard), so only the known values reach the attribute (amber
  // meetup, green public, blue council); the popover CSS keys the label colour
  // off it, and the label text is a distinct per-type signal, so the type is
  // never carried by colour alone.
  detailDialog.dataset.type = eventTypeSlug(e.type);
  const typeLabel = document.getElementById('event-detail-typelabel');
  if (typeLabel) typeLabel.textContent = eventTypeLabel(e.type);

  // Title (also labels the dialog via aria-labelledby).
  const title = document.getElementById('event-detail-title');
  if (title) title.textContent = e.title;

  // When: full weekday + date + 12h time.
  const when = document.getElementById('event-detail-when');
  if (when) when.textContent = `${fullDateLabel(o.date)} · ${formatTime12(e.time)}`;

  // Where: City · County County (same label the cards use).
  const where = document.getElementById('event-detail-where');
  if (where) where.textContent = placeLabel(e);

  // Address (public → a maps-search link) OR the meetup location note.
  const placeLabelEl = document.getElementById('event-detail-place-label');
  const place = document.getElementById('event-detail-place');
  if (placeLabelEl && place) {
    place.replaceChildren();
    if (!meetup && e.address) {
      placeLabelEl.textContent = 'Address';
      const a = el('a', 'event-pop-addr') as HTMLAnchorElement;
      a.href = mapsSearchUrl(e.address);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.append(
        document.createTextNode(e.address),
        extLinkIcon(),
        el('span', 'sr-only', ' (opens in a new tab)'),
      );
      place.append(a);
    } else {
      placeLabelEl.textContent = 'Location';
      place.textContent = 'Shared in the Signal group.';
    }
  }

  // Official-schedule link. Council entries carry a `source` (the county/city's
  // own agenda page); submitted meetup/public events do not. The label and icon
  // are static in the markup; only the href is event data, set on the property
  // (never innerHTML). Hidden when there is no source.
  const sourceWrap = document.getElementById('event-detail-source');
  const sourceLink = document.getElementById('event-detail-source-link') as HTMLAnchorElement | null;
  if (sourceWrap && sourceLink) {
    if (e.source) {
      sourceLink.href = e.source;
      sourceWrap.hidden = false;
    } else {
      sourceLink.removeAttribute('href');
      sourceWrap.hidden = true;
    }
  }

  // Recurring events show a caveat by the upcoming list: the listed dates are the
  // usual cadence, not a confirmed schedule. Visibility is keyed off recurrence
  // like the upcoming list itself; a one-off event has an exact date and needs no
  // caveat. The COPY is keyed off `source`, not recurrence: the "official schedule"
  // it tells the visitor to confirm against is the same source link shown above, so
  // a recurring event WITHOUT a source (a submitted recurring meetup/public event)
  // gets the source-agnostic wording rather than pointing at a link that is not there.
  const caveat = document.getElementById('event-detail-caveat');
  if (caveat) {
    caveat.hidden = !e.recurrence;
    caveat.textContent = e.source
      ? 'Dates follow the usual schedule; confirm on the official schedule before attending.'
      : 'Dates follow the usual schedule; confirm before attending.';
  }

  // Description (optional).
  const desc = document.getElementById('event-detail-desc');
  if (desc) {
    desc.textContent = e.description ?? '';
    desc.hidden = !e.description;
  }

  // "Upcoming meetings" list for ANY recurring event (council, recurring meetup,
  // recurring public). The next occurrences on/after today, up to 6, via the
  // unit-tested upcomingOccurrences; the first row is tagged "Next" and a muted
  // footer states the cadence. A one-off event shows no list.
  const upcomingWrap = document.getElementById('event-detail-upcoming');
  const upcomingList = document.getElementById('event-detail-upcoming-list');
  const upcomingFoot = document.getElementById('event-detail-upcoming-foot');
  if (upcomingWrap && upcomingList && upcomingFoot) {
    upcomingList.replaceChildren();
    if (e.recurrence) {
      const dates = upcomingOccurrences(e.date, e.recurrence, island.today, island.horizonEnd);
      dates.forEach((d, i) => {
        const row = el('li', 'event-pop-upcoming-item');
        row.append(el('span', 'event-pop-upcoming-date', `${upcomingDateLabel(d)} · ${formatTime12(e.time)}`));
        if (i === 0) row.append(el('span', 'event-pop-upcoming-next badge badge-sm badge-outline', 'Next'));
        upcomingList.append(row);
      });
      upcomingFoot.textContent = upcomingFooter(e.recurrence, dates.length);
      upcomingWrap.hidden = dates.length === 0;
    } else {
      upcomingWrap.hidden = true;
    }
  }

  // Signal CTA (only when the event has a group). The primary action for meetups.
  const signal = document.getElementById('event-detail-signal') as HTMLAnchorElement | null;
  if (signal) {
    if (e.hasSignalGroup) {
      signal.href = `/go/${encodeURIComponent(e.id)}`;
      signal.hidden = false;
    } else {
      signal.removeAttribute('href');
      signal.hidden = true;
    }
  }

  // Council meetings carry no per-event Signal group (hasSignalGroup is false, so
  // the meetup CTA above stays hidden); instead they share one open "find others
  // attending" group. Show that CTA only for council events. It opens the same
  // "Before you join" warning as the organizer intake, pointed at COUNCIL_SIGNAL_URL.
  const councilSignal = document.getElementById('event-detail-council-signal');
  if (councilSignal) councilSignal.hidden = e.type !== 'council';

  popoverInvoker = invoker ?? (document.activeElement as HTMLElement | null);
  detailDialog.showModal();
}

// showModal() already traps focus and closes on Esc; the method="dialog" forms
// handle the ✕, Close, and backdrop-click. All routes fire 'close', so returning
// focus to the invoking control lives in one place here.
detailDialog?.addEventListener('close', () => {
  const invoker = popoverInvoker;
  popoverInvoker = null;
  if (invoker && invoker.isConnected) invoker.focus();
});

// Council popover CTA: close the popover (its close handler above returns focus to
// the invoking card and clears popoverInvoker), then open the shared "Before you
// join" warning pointed at the council attendees group. Capture the invoker first
// so the warning's cancel path can still return focus to it.
document.getElementById('event-detail-council-signal')?.addEventListener('click', () => {
  const returnEl = popoverInvoker;
  detailDialog?.close();
  openIntake(COUNCIL_SIGNAL_URL, returnEl);
});

// Sidebar cards: the title button opens the popover. Delegated on the stable
// #events-list <ul> so it covers both the server-rendered cards and the ones
// buildCard() inserts later, without either renderer wiring a per-card listener.
// The title button is now the card's only control — the Signal join moved to the
// detail popover — so this handler owns every click that lands on a card.
document.getElementById('events-list')?.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>('.event-title-btn');
  if (!btn) return;
  const card = btn.closest<HTMLElement>('[data-event-id]');
  const id = card?.dataset.eventId;
  const date = card?.dataset.date;
  if (!id || !date) return;
  const event = allEvents.find((candidate) => candidate.id === id);
  if (event) openEventPopover({ event, date }, btn);
});

// --- Merge and patch ----------------------------------------------------

function applyMerge(merged: PublicEvent[]) {
  const liveById = new Map(merged.map((e) => [e.id, e] as const));

  // 1. Defensive prune: drop any rendered card whose id is not in the merged set,
  //    OR whose event does not match the active filter. Under add-only merge the
  //    baked set is always retained (the overlay never tombstones), so the id check
  //    in practice removes nothing — a revoked-but-not-yet-folded event stays listed
  //    here and is stopped at /go instead. The filter check enforces the same
  //    invariant the insert step below already holds to: an overlay merge that lands
  //    while a county is selected must not leave another county's card (a baked one
  //    the server rendered, say) behind in the narrowed list.
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-event-id]'))) {
    const event = liveById.get(node.dataset.eventId!);
    if (!event || !matchesFilter(event, filter)) node.remove();
  }

  // 2. Insert events submitted since the last fold — but only the ones the active
  //    filter admits, or a filtered list grows rows it is not supposed to show.
  const fresh = merged.filter((e) => !bakedIds.has(e.id) && matchesFilter(e, filter));
  const freshOccurrences = splitByToday(
    expandAll(fresh, island.horizonEnd),
    island.today,
  ).upcoming;

  // The list collapses a recurring series to one row (its next occurrence); the
  // month chips still get every occurrence, so the two loops read different sets.
  const list = document.getElementById('events-list');
  for (const o of collapseSeries(freshOccurrences)) {
    if (list) insertSorted(list, buildCard(o), sortKey(o.date, o.event.time, o.event.id));
  }
  for (const o of freshOccurrences) {
    const chips = document.querySelector(`[data-chips="${CSS.escape(o.date)}"]`);
    if (chips) insertSorted(chips, buildChip(o), sortKey(o.date, o.event.time, o.event.id));
  }

  // 3. The merged set is what every later filter change renders from.
  allEvents = merged;
  syncChrome();
}

// --- Filter ---------------------------------------------------------------
//
// The filter controls do not exist without this file: the <nav id="events-filters">
// the page ships is empty and hidden, so a no-JavaScript visitor sees the complete
// list and no dead control. Here we build a searchable COUNTY combobox
// (accessible-autocomplete — the same widget and dark `.autocomplete__*` skin the
// submit form's city picker uses) and a 4-way TYPE filter (an ARIA radiogroup
// styled as daisyUI tabs-box pills: All / Meetups / Public events / Council
// meetings), filter the
// list in place, and keep the choice in the URL hash so a filtered view is
// shareable and the back button works. `el`, `buildCard`, `buildChip`, and
// `placeLabel` already exist in this module; they are used, not redefined.

/** One entry in the county combobox: the slug it filters to, its display name, and
 *  the count shown in the option label (faceted by the active type, exactly as the
 *  old chip badge was). The synthetic slug 'all' is the "All counties (N)" option
 *  that clears the county filter — a dropdown option cannot carry a badge
 *  cross-browser, so the count rides in the label text instead. */
interface CountyResult {
  slug: string;
  name: string;
  count: number;
}

/** The county the combobox currently reflects ('all' = cleared). Tracked so
 *  syncChrome only rebuilds the combobox when the county changed OUTSIDE it (a map
 *  click, the back-to-SC control, a hashchange), never on the change the combobox
 *  itself just made — which would fight accessible-autocomplete's controlled input. */
let comboboxCounty: string | null = null;

/** accessible-autocomplete source: the county list filtered by the typed query,
 *  each option carrying its type-faceted count. Recomputed on every keystroke, so
 *  the counts and the county set stay current with the live merged event data (a
 *  county the overlay introduces appears with no special case). With an empty query
 *  — the showAllValues dropdown, or the query still equal to the active county's
 *  name — it returns the whole list plus the "All counties (N)" clear option on
 *  top. The active county is always present, even at zero upcoming, so a shared
 *  #county= link to an empty county is still shown and clearable. */
function countySource(
  query: string,
  populateResults: (results: CountyResult[]) => void,
): void {
  const q = (query || '').trim().toLowerCase();
  const collapsed = collapseSeries(upcomingFor(allEvents));
  const facets = facetCounts(collapsed, filter);
  const results: CountyResult[] = countyOptions(collapsed).map(({ county }) => ({
    slug: county,
    name: island.countyNames[county] ?? county,
    count: facets.countyCounts[county] ?? 0,
  }));
  if (filter.county !== 'all' && !results.some((c) => c.slug === filter.county)) {
    results.push({
      slug: filter.county,
      name: island.countyNames[filter.county] ?? filter.county,
      count: 0,
    });
  }
  const selectedName =
    filter.county === 'all'
      ? ''
      : (island.countyNames[filter.county] ?? filter.county).toLowerCase();
  const showAll = q === '' || q === selectedName;
  const matched = showAll ? results : results.filter((c) => c.name.toLowerCase().includes(q));
  if (showAll) {
    populateResults([{ slug: 'all', name: 'All counties', count: facets.countyAll }, ...matched]);
  } else {
    populateResults(matched);
  }
}

// accessible-autocomplete seeds state.options with the raw defaultValue STRING in
// its constructor (options: defaultValue ? [defaultValue] : []) and runs both
// templates over it before the source ever replaces it — so a non-empty
// defaultValue (a #county= link on first paint, or the rebuild after a map click)
// hands these templates a plain string, not a CountyResult. They must tolerate it,
// or the widget throws on mount and never renders. The default AA templates handle
// this because they are the identity function; ours carry structure, so they guard.

/** The string dropped into the input when a county is confirmed: its plain name,
 *  or '' for the "All counties" clear option (so clearing empties the field). */
function countyInputValue(result: CountyResult | string | undefined): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  return result.slug !== 'all' ? result.name : '';
}

/** A menu row: the name plus the faceted count in parentheses. Written as innerHTML
 *  by accessible-autocomplete, so the name is escaped (it is build-time-trusted
 *  registry data, but nothing reaches innerHTML unescaped in this project). */
function countySuggestion(result: CountyResult | string | undefined): string {
  if (!result) return '';
  if (typeof result === 'string') return escapeHtml(result);
  const label = result.slug === 'all' ? 'All counties' : result.name;
  return `${escapeHtml(label)} <span class="county-opt-count">(${result.count})</span>`;
}

/** A confirmed county drives the same pushHash path a chip click used to. Guarded
 *  so re-confirming the county already active (e.g. autoselect on the shown value)
 *  is a no-op rather than a redundant history entry. */
function countyOnConfirm(result: CountyResult | undefined): void {
  const slug = result && typeof result === 'object' && result.slug ? result.slug : 'all';
  comboboxCounty = slug;
  if (slug !== filter.county) pushHash({ ...filter, county: slug });
}

/** (Re)mount the county combobox into its container, seeded to the active county.
 *  accessible-autocomplete owns a controlled input, so the only reliable way to
 *  reflect an EXTERNAL county change (map click, back-to-SC, hashchange) is to
 *  rebuild it with a fresh defaultValue. Cheap, and only done when the county
 *  actually changed outside the combobox (see syncChrome). */
function renderCountyCombobox(): void {
  const container = document.getElementById('events-county-ac');
  if (!container) return;
  container.replaceChildren();
  const selectedName =
    filter.county === 'all' ? '' : (island.countyNames[filter.county] ?? filter.county);
  accessibleAutocomplete({
    element: container,
    id: 'events-county',
    name: 'events-county',
    source: countySource,
    minLength: 0,
    showAllValues: true,
    autoselect: true,
    confirmOnBlur: false,
    displayMenu: 'overlay',
    placeholder: 'Search counties',
    defaultValue: selectedName,
    templates: { inputValue: countyInputValue, suggestion: countySuggestion },
    onConfirm: countyOnConfirm,
    tNoResults: () => 'No matching county',
  });
  document.getElementById('events-county')?.setAttribute('autocomplete', 'off');
  comboboxCounty = filter.county;
}

/** One button in the 4-way type filter (an ARIA radiogroup styled as a tabs-box
 *  pill). Roving tabindex and aria-checked are maintained by syncChrome; this
 *  only builds it. */
function typeRadio(value: EventTypeFilter, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  // Borrow the view-tabs pill verbatim (events-tab + daisyUI tab), so the type
  // filter and the List/Month/Map tabs share one pill style and cannot drift.
  // Keeps role="radio" (radiogroup semantics) — the class is visual only.
  b.className = 'events-tab tab events-type-btn';
  b.dataset.filterKey = 'type';
  b.dataset.filterValue = value;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', 'false');
  b.tabIndex = -1;
  b.append(document.createTextNode(label), el('span', 'seg-count', '0'));
  return b;
}

/** Build the county row (label + combobox) and the type row (radiogroup pill
 *  filter + clear button), once. Counts and active states are set here and then maintained
 *  by syncChrome(); this only decides which controls exist. */
function buildFilters(): void {
  const nav = document.getElementById('events-filters');
  if (!nav) return;

  const countyRow = document.createElement('div');
  countyRow.className = 'filter-row filter-row-county';
  const countyLabel = document.createElement('label');
  countyLabel.className = 'filter-legend label-mono';
  countyLabel.setAttribute('for', 'events-county');
  countyLabel.textContent = 'County';
  const countyAc = document.createElement('div');
  countyAc.id = 'events-county-ac';
  countyAc.className = 'events-county-ac';
  countyRow.append(countyLabel, countyAc);

  const typeRow = document.createElement('div');
  typeRow.className = 'filter-row filter-row-type';
  const typeLegend = document.createElement('span');
  typeLegend.className = 'filter-legend label-mono';
  typeLegend.id = 'events-type-legend';
  typeLegend.textContent = 'Type';
  const seg = document.createElement('div');
  // Same daisyUI tabs-box tray the view tabs use, so the type filter reads as the
  // same pill control. role="radiogroup" (not tablist) keeps the radio semantics.
  seg.className = 'events-tabs tabs tabs-box';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-labelledby', 'events-type-legend');
  seg.append(
    typeRadio('all', 'All'),
    typeRadio('meetup', 'Meetups'),
    typeRadio('public', 'Public events'),
    typeRadio('council', 'Council meetings'),
  );
  // Arrow keys move the selection like a native radiogroup: focus follows and the
  // filter changes through the same pushHash path a click uses.
  seg.addEventListener('keydown', (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const radios = Array.from(seg.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const current = radios.findIndex((r) => r.dataset.filterValue === filter.type);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = radios.length - 1;
    else {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      next = ((current < 0 ? 0 : current) + dir + radios.length) % radios.length;
    }
    const value = radios[next].dataset.filterValue as EventTypeFilter;
    radios[next].focus();
    if (value !== filter.type) pushHash({ ...filter, type: value });
  });
  typeRow.append(typeLegend, seg);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.id = 'filter-clear';
  clear.className = 'filter-clear';
  clear.dataset.filterKey = 'clear';
  clear.textContent = 'Clear filters';
  clear.hidden = filter.county === 'all' && filter.type === 'all';
  typeRow.append(clear);

  nav.replaceChildren(countyRow, typeRow);
  nav.hidden = false;

  renderCountyCombobox();
}

/** The type-control counts and checked state, the county combobox selection, the
 *  clear button, the header count, the past block, the empty state, and the map.
 *  Shared by the filter path and the overlay merge so the two can never disagree. */
function syncChrome(): void {
  // Collapsed so the option counts match the collapsed list (distinct events); the
  // header count below reads the rendered row count, which is already collapsed.
  const facets = facetCounts(collapseSeries(upcomingFor(allEvents)), filter);

  // Type filter: the faceted count on each option, the checked radio,
  // and the roving tabindex (only the checked radio is a tab stop).
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.events-type-btn')) {
    const value = (btn.dataset.filterValue ?? 'all') as EventTypeFilter;
    const active = filter.type === value;
    // is-selected is the same active-pill hook the view tabs use; aria-checked is
    // the radiogroup state. The shared pill rule keys on both, so they agree.
    btn.classList.toggle('is-selected', active);
    btn.setAttribute('aria-checked', String(active));
    btn.tabIndex = active ? 0 : -1;
    const badge = btn.querySelector('.seg-count');
    if (badge) badge.textContent = String(facets.typeCounts[value] ?? 0);
  }

  // County combobox: rebuild it only when the county changed OUTSIDE the combobox
  // (map click, back-to-SC, hashchange). A change the combobox itself made already
  // left it showing the right value, and rebuilding mid-interaction would fight
  // accessible-autocomplete's controlled input. The combobox option counts refresh
  // from countySource on the next open, so a type toggle needs no rebuild here.
  if (comboboxCounty !== filter.county) renderCountyCombobox();

  const clear = document.getElementById('filter-clear');
  if (clear) clear.hidden = filter.county === 'all' && filter.type === 'all';

  // The map's back-to-state control shows only while a county is selected. Toggled
  // here (not behind the mapHandle guard below) so it is right even before the map
  // finishes its lazy load: the button is server-rendered and always in the DOM.
  const mapBack = document.getElementById('events-map-back');
  if (mapBack) mapBack.hidden = filter.county === 'all';

  const list = document.getElementById('events-list');
  const shown = list ? list.children.length : 0;
  const count = document.getElementById('events-count');
  if (count) count.textContent = String(shown);

  const pastList = document.getElementById('events-past-list');
  const pastShown = pastList ? pastList.children.length : 0;
  const pastBlock = document.getElementById('events-past');
  if (pastBlock) pastBlock.hidden = pastShown === 0;
  const pastCount = document.getElementById('events-past-count');
  if (pastCount) pastCount.textContent = String(pastShown);

  // The empty state serves two cases with the same proof line and the same two
  // ways in. Only the lead differs: a specific county filtered down to nothing
  // names that county ("No events in Greenville County yet"), so selecting a
  // zero-event county reads as a clear answer rather than a blank "0 upcoming";
  // a calendar empty to begin with keeps the general lead.
  const empty = document.getElementById('events-empty');
  if (empty) empty.hidden = shown > 0;
  const lead = document.getElementById('events-empty-lead');
  if (lead) {
    lead.textContent =
      filter.county === 'all'
        ? 'Nothing on the calendar right now.'
        : `No events in ${island.countyNames[filter.county] ?? filter.county} County yet.`;
  }
  const proof = document.getElementById('events-empty-proof');
  if (proof) proof.textContent = emptyStateProof(pastShown);

  if (mapHandle && eventsLayer) {
    eventsLayer.setEventData(mapHandle.map, mapOccurrences());
    eventsLayer.setSelectedCounty(mapHandle.map, filter.county === 'all' ? null : filter.county);
    // Animate the view to the newly selected county, or back out to the full SC
    // view when the selection clears. No-ops when the county is unchanged.
    fitToSelection(true);
  }
}

/** Re-render the list, the month chips, and the past rows for a filter, then sync
 *  the chrome. Pure DOM work — no history side effects, so hashchange can call it. */
function applyFilter(next: EventFilter): void {
  filter = next;

  // Narrow the list from `next` directly, not from the module-level `filter`.
  // They are equal on the line above, but reading `next` here makes the list's
  // county/type narrowing depend only on the argument this call was handed —
  // never on the assignment ordering — so a county selection can never render a
  // list wider than the filter it was called with.
  const split = splitByToday(
    expandAll(filterEvents(allEvents, next), island.horizonEnd),
    island.today,
  );
  const upcoming = split.upcoming;
  const past = split.past.filter((o) => o.date >= island.pastCutoff);

  // The list shows one row per event (collapsed series); the month grid keeps
  // every occurrence, so each reads from a different set of the same `upcoming`.
  const list = document.getElementById('events-list');
  if (list) list.replaceChildren(...collapseSeries(upcoming).map(buildCard));

  for (const chips of document.querySelectorAll<HTMLElement>('[data-chips]')) {
    chips.replaceChildren();
  }
  for (const o of upcoming) {
    const chips = document.querySelector(`[data-chips="${CSS.escape(o.date)}"]`);
    if (chips) chips.append(buildChip(o));
  }

  const pastList = document.getElementById('events-past-list');
  if (pastList) pastList.replaceChildren(...past.map(buildPastRow));

  syncChrome();
}

/** Write the filter to the URL hash and re-render. pushState is deliberately not
 *  a hashchange, so this never double-fires with the hashchange listener below. */
function pushHash(next: EventFilter): void {
  const url = `${location.pathname}${location.search}${filterHash(next)}`;
  history.pushState({ filter: next }, '', url);
  applyFilter(next);
}

// Clicks on the type filter buttons and the clear button. The county combobox
// lives in this same <nav> but its accessible-autocomplete nodes carry no
// data-filter-key, so a click there resolves to null and is ignored — county
// selection goes through countyOnConfirm, not this handler.
document.getElementById('events-filters')?.addEventListener('click', (e) => {
  const control = (e.target as HTMLElement).closest<HTMLElement>('[data-filter-key]');
  if (!control) return;
  const key = control.dataset.filterKey;
  if (key === 'clear') pushHash({ county: 'all', type: 'all' });
  else if (key === 'type') {
    pushHash({ ...filter, type: (control.dataset.filterValue ?? 'all') as EventTypeFilter });
  }
});

// The map's back-to-state button clears just the county, reusing the exact
// county->'all' path a choropleth click uses. As a native <button> it fires this
// on click, Enter, and Space, so keyboard operation needs no extra handler. The
// pushHash drives syncChrome (which hides this button and rewrites the list) and
// fitToSelection (which animates back to the full SC view and clears the amber
// highlight), so no zoom or highlight logic is duplicated here.
document.getElementById('events-map-back')?.addEventListener('click', () => {
  pushHash({ ...filter, county: 'all' });
});

/** Does this hash carry a filter key this page owns? Distinguishes a real filter
 *  hash (#county=…, #type=…) from an in-page anchor like the Base.astro skip
 *  link's #main-content, which must not be read as "clear the filter". */
function hashHasFilterKey(hash: string): boolean {
  const raw = hash.replace(/^#/, '');
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    if (key === 'county' || key === 'type') return true;
  }
  return false;
}

// Back, forward, and any manual edit of the hash are hash changes; the pushState
// in pushHash deliberately is not, so this fires once per user navigation and
// never doubles a re-render. An empty hash clears (back button to a hashless
// URL); a hash with a recognised filter key applies. Any other in-page anchor —
// the skip link's #main-content, a future deep link — is ignored, so activating
// it can never wipe the active county/type selection.
window.addEventListener('hashchange', () => {
  if (location.hash.replace(/^#/, '') === '' || hashHasFilterKey(location.hash)) {
    applyFilter(parseFilterHash(location.hash));
  }
});

// First paint: build the filter controls, then apply whatever the hash already
// asked for. On a bare /events the server already rendered the identical full
// list, so a re-render would only re-announce the whole aria-live list to a
// screen reader; sync the control states to the DOM instead. A shared #county=…
// link still needs the real re-render to narrow the list.
buildFilters();
if (filter.county === 'all' && filter.type === 'all') {
  syncChrome();
} else {
  applyFilter(filter);
}

async function loadOverlay() {
  try {
    const res = await fetch('/api/events', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`/api/events: ${res.status}`);
    // The endpoint returns { events: PublicEvent[] } (netlify/functions/events.ts).
    // parseOverlayEnvelope returns that array, or null for any non-envelope body;
    // mergeEvents(baked, null) then renders the baked set unchanged.
    const overlay = parseOverlayEnvelope(await res.json());
    applyMerge(mergeEvents(island.events, overlay));
  } catch (err) {
    // Fail soft: the baked page stays exactly as rendered.
    console.warn('events: overlay unavailable, showing baked events only', err);
  }
}

void loadOverlay();

// --- Intake dialog ------------------------------------------------------

const dialog = document.getElementById('intake-dialog');

// The warning gate is shared: the organizer intake path (/go/intake) and the
// council "find others attending" group both open this same dialog. openIntake
// records where confirm should navigate and where cancel/Esc should return focus,
// so the copy lives in one place and serves both.
let intakeDestination = '/go/intake';
let intakeReturnFocus: HTMLElement | null = null;

function openIntake(destination: string, returnFocus: HTMLElement | null): void {
  if (!dialog) return;
  intakeDestination = destination;
  intakeReturnFocus = returnFocus;
  dialog.hidden = false;
  document.getElementById('intake-confirm')?.focus();
}

function closeIntake(): void {
  if (dialog) dialog.hidden = true;
  (intakeReturnFocus ?? document.getElementById('intake-open'))?.focus();
}

document.getElementById('intake-open')?.addEventListener('click', () => {
  openIntake('/go/intake', document.getElementById('intake-open') as HTMLElement | null);
});
// The confirm control carries no href in the markup. Navigation is injected here,
// at click time, so the destination is absent from view-source and a scraper that
// never clicks the button never harvests it.
document.getElementById('intake-confirm')?.addEventListener('click', () => {
  window.location.href = intakeDestination;
});
document.getElementById('intake-cancel')?.addEventListener('click', closeIntake);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialog && !dialog.hidden) closeIntake();
});
// Focus trap: an aria-modal dialog must keep Tab focus inside while open, or Tab
// escapes to the page behind the overlay. Mirrors the action-modal trap in
// src/scripts/action-modal/modal-controller.ts (the project a11y standard).
dialog?.addEventListener('keydown', (e) => {
  if (!dialog || e.key !== 'Tab' || dialog.hidden) return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]',
    ),
  ).filter((node) => node.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
