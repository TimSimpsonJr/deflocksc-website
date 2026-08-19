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
import {
  mergeEvents,
  parseOverlayEnvelope,
  expandAll,
  splitByToday,
  collapseSeries,
  recurrenceLabel,
  monthAbbr,
  dayOfMonth,
  formatTime12,
  sortKey,
  matchesFilter,
  filterEvents,
  facetCounts,
  filterHash,
  parseFilterHash,
  emptyStateProof,
} from '../lib/events-view.js';

interface Island {
  events: PublicEvent[];
  cityNames: Record<string, string>;
  countyNames: Record<string, string>;
  today: string;
  horizonEnd: string;
  pastCutoff: string;
  counties: string[];
}

const islandEl = document.getElementById('events-data');
if (!islandEl) throw new Error('events-page: #events-data island missing');
const island: Island = JSON.parse(islandEl.textContent || '{}');

const bakedIds = new Set(island.events.map((e) => e.id));

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

let mapHandle: MapHandle | null = null;
let eventsLayer: typeof import('./map/layers/events.js') | null = null;
let mapLoading = false;

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
    const [{ createMap }, layer, centroidsMod, countiesRes] = await Promise.all([
      import('./map/core.js'),
      import('./map/layers/events.js'),
      import('../data/city-centroids.json'),
      fetch('/districts/sc-counties.json'),
    ]);
    if (!countiesRes.ok) throw new Error(`sc-counties.json: ${countiesRes.status}`);
    const counties = (await countiesRes.json()) as GeoJSON.FeatureCollection;

    handle = createMap({
      container: 'events-map',
      style: '/map-style.json',
      center: [-81.0, 33.7],
      zoom: 6,
      interactive: true,
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
      events: mapOccurrences(),
      centroids: (centroidsMod as { default: Record<string, unknown> }).default,
      cityNames: island.cityNames,
      onCountySelect: (county) => {
        // The map does not hold filter state; it reports a click and this module
        // decides. That is what makes the chip and the amber outline the same thing.
        pushHash({ ...filter, county: county ?? 'all' });
      },
    });
    layer.setSelectedCounty(map, filter.county === 'all' ? null : filter.county);

    // Commit only once the map is fully built. A mid-build failure therefore leaves
    // mapHandle null, so the next Map-tab click or desktop media-query change retries
    // from scratch instead of resizing a half-initialized handle.
    mapHandle = handle;
    eventsLayer = layer;
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
  const li = document.createElement('li');
  li.className = 'event-card';
  li.dataset.eventId = e.id;
  li.dataset.date = o.date;
  li.dataset.sort = sortKey(o.date, e.time, e.id);

  const date = el('div', 'event-date');
  date.setAttribute('aria-hidden', 'true');
  date.append(
    el('span', 'event-date-mon', monthAbbr(o.date)),
    el('span', 'event-date-day', dayOfMonth(o.date)),
  );

  const body = el('div', 'event-body');
  body.append(el('h3', 'event-title', e.title));
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

  const actions = el('p', 'event-actions');
  const meetup = e.type === 'meetup';
  actions.append(
    el(
      'span',
      `event-badge ${meetup ? 'event-badge-meetup' : 'event-badge-public'}`,
      meetup ? 'Location in group' : 'Public event',
    ),
  );
  // Mirror EventsList.astro: a collapsed recurring series carries a frequency
  // badge next to the type badge. One-off events get null and no badge.
  const repeat = recurrenceLabel(e.recurrence);
  if (repeat) actions.append(el('span', 'event-badge event-badge-repeat', repeat));
  if (e.hasSignalGroup) {
    const a = el('a', 'event-signal', 'Join Signal group') as HTMLAnchorElement;
    a.href = `/go/${encodeURIComponent(e.id)}`;
    a.rel = 'noreferrer';
    actions.append(a);
  }
  body.append(actions);

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

// --- Merge and patch ----------------------------------------------------

function applyMerge(merged: PublicEvent[]) {
  const live = new Set(merged.map((e) => e.id));

  // 1. Defensive prune: drop any rendered card whose id is not in the merged set.
  //    Under add-only merge the baked set is always retained (the overlay never
  //    tombstones), so in practice this removes nothing — a revoked-but-not-yet-
  //    folded event stays listed here and is stopped at /go instead. It remains as a
  //    guard against a card with no backing record.
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-event-id]'))) {
    if (!live.has(node.dataset.eventId!)) node.remove();
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
// The chips do not exist without this file: the <nav id="events-filters"> the
// page ships is empty and hidden, so a no-JavaScript visitor sees the complete
// list and no dead control. Here we build the chips, filter the list in place,
// and keep the choice in the URL hash so a filtered view is shareable and the
// back button works. `el`, `buildCard`, `buildChip`, and `placeLabel` already
// exist in this module (the events-page task); they are used, not redefined.

function chipButton(
  key: string,
  value: string,
  label: string,
  count: number,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'filter-chip';
  b.dataset.filterKey = key;
  b.dataset.filterValue = value;
  b.dataset.count = String(count);
  b.append(document.createTextNode(label), el('span', 'filter-chip-count', String(count)));
  return b;
}

/** Build the two chip rows and the clear button, once, from the counties that
 *  have events. Counts and active states are set here and then maintained by
 *  syncChrome(); this only decides which chips exist. */
function buildFilters(): void {
  const nav = document.getElementById('events-filters');
  if (!nav) return;
  // Collapse first so the chip badges count distinct EVENTS (each series once),
  // matching the collapsed list rows rather than the per-occurrence map counts.
  const facets = facetCounts(collapseSeries(upcomingFor(allEvents)), filter);

  const countyRow = document.createElement('div');
  countyRow.className = 'filter-row';
  const countyLegend = document.createElement('span');
  countyLegend.className = 'filter-legend label-mono';
  countyLegend.textContent = 'County';
  countyRow.append(countyLegend, chipButton('county', 'all', 'All counties', facets.countyAll));
  for (const slug of island.counties) {
    countyRow.append(
      chipButton('county', slug, island.countyNames[slug] ?? slug, facets.countyCounts[slug] ?? 0),
    );
  }

  const typeRow = document.createElement('div');
  typeRow.className = 'filter-row';
  const typeLegend = document.createElement('span');
  typeLegend.className = 'filter-legend label-mono';
  typeLegend.textContent = 'Type';
  typeRow.append(
    typeLegend,
    chipButton('type', 'all', 'All types', facets.typeCounts.all),
    chipButton('type', 'meetup', 'Meetups', facets.typeCounts.meetup),
    chipButton('type', 'public', 'Public events', facets.typeCounts.public),
  );

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.id = 'filter-clear';
  clear.className = 'filter-clear';
  clear.dataset.filterKey = 'clear';
  clear.textContent = 'Clear';
  clear.hidden = filter.county === 'all' && filter.type === 'all';
  typeRow.append(clear);

  nav.replaceChildren(countyRow, typeRow);
  nav.hidden = false;
}

/** Chip counts, active states, the clear button, the header count, the past
 *  block, the empty state, and the map. Shared by the filter path and the overlay
 *  merge so the two can never disagree. */
function syncChrome(): void {
  // Collapsed so the chip counts match the collapsed list (distinct events); the
  // header count below reads the rendered row count, which is already collapsed.
  const facets = facetCounts(collapseSeries(upcomingFor(allEvents)), filter);

  const countyRow = document
    .querySelector<HTMLElement>('[data-filter-key="county"]')
    ?.parentElement;

  // A county the overlay introduced has no first-paint chip. Give it a transient
  // one so a map selection into that county is always visible in the chip row.
  if (countyRow && filter.county !== 'all') {
    const known = countyRow.querySelector(`[data-filter-value="${CSS.escape(filter.county)}"]`);
    if (!known) {
      const chip = chipButton(
        'county',
        filter.county,
        island.countyNames[filter.county] ?? filter.county,
        0,
      );
      chip.dataset.transient = '1';
      countyRow.append(chip);
    }
  }
  for (const stale of document.querySelectorAll<HTMLElement>('[data-transient="1"]')) {
    if (stale.dataset.filterValue !== filter.county) stale.remove();
  }

  for (const chip of document.querySelectorAll<HTMLElement>('.filter-chip')) {
    const key = chip.dataset.filterKey;
    const value = chip.dataset.filterValue ?? 'all';

    const active = key === 'county' ? filter.county === value : filter.type === value;
    chip.classList.toggle('is-active', active);
    if (active) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');

    const count =
      key === 'county'
        ? value === 'all'
          ? facets.countyAll
          : facets.countyCounts[value] ?? 0
        : facets.typeCounts[value as 'all' | 'meetup' | 'public'] ?? 0;
    chip.dataset.count = String(count);
    const badge = chip.querySelector('.filter-chip-count');
    if (badge) badge.textContent = String(count);
  }

  const clear = document.getElementById('filter-clear');
  if (clear) clear.hidden = filter.county === 'all' && filter.type === 'all';

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

  // One empty state for both cases: a county filtered down to nothing gets the
  // same lead, the same proof line, and the same two ways in as a calendar that
  // was empty to begin with.
  const empty = document.getElementById('events-empty');
  if (empty) empty.hidden = shown > 0;
  const proof = document.getElementById('events-empty-proof');
  if (proof) proof.textContent = emptyStateProof(pastShown);

  if (mapHandle && eventsLayer) {
    eventsLayer.setEventData(mapHandle.map, mapOccurrences());
    eventsLayer.setSelectedCounty(mapHandle.map, filter.county === 'all' ? null : filter.county);
  }
}

/** Re-render the list, the month chips, and the past rows for a filter, then sync
 *  the chrome. Pure DOM work — no history side effects, so hashchange can call it. */
function applyFilter(next: EventFilter): void {
  filter = next;

  const split = splitByToday(
    expandAll(filterEvents(allEvents, filter), island.horizonEnd),
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

document.getElementById('events-filters')?.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-filter-key]');
  if (!chip) return;
  const key = chip.dataset.filterKey;
  const value = chip.dataset.filterValue ?? 'all';
  if (key === 'clear') pushHash({ county: 'all', type: 'all' });
  else if (key === 'county') pushHash({ ...filter, county: value });
  else pushHash({ ...filter, type: value as EventTypeFilter });
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

// First paint: build the chips, then apply whatever the hash already asked for.
// On a bare /events the server already rendered the identical full list, so a
// re-render would only re-announce the whole aria-live list to a screen reader;
// sync the chip active-states to the DOM instead. A shared #county=… link still
// needs the real re-render to narrow the list.
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
document.getElementById('intake-open')?.addEventListener('click', () => {
  if (!dialog) return;
  dialog.hidden = false;
  document.getElementById('intake-confirm')?.focus();
});
// The confirm control carries no href in the markup. Navigation to /go/intake is
// injected here, at click time, so the path is absent from view-source and a
// scraper that never clicks the button never harvests the intake redirect.
document.getElementById('intake-confirm')?.addEventListener('click', () => {
  window.location.href = '/go/intake';
});
document.getElementById('intake-cancel')?.addEventListener('click', () => {
  if (dialog) dialog.hidden = true;
  document.getElementById('intake-open')?.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialog && !dialog.hidden) {
    dialog.hidden = true;
    document.getElementById('intake-open')?.focus();
  }
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
