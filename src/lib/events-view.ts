/**
 * Pure view helpers for the events calendar.
 *
 * Shared by three callers: the build-time render in src/pages/events.astro,
 * the browser patch pass in src/scripts/events-page.ts, and the tests.
 *
 * Nothing here touches the DOM, the network, or the local time zone. Dates are
 * handled as 'YYYY-MM-DD' strings and compared lexically; the only Date use is
 * Date.UTC(), which is time-zone independent. `new Date('2026-09-01')` parses as
 * UTC midnight and then renders in local time, which shifts the day west of
 * Greenwich — that bug is why none of this uses it.
 */

import type { PublicEvent } from './public-event.js';
import { expandOccurrences } from './recurrence.js';

export interface Occurrence {
  /** The stored event this occurrence belongs to. */
  event: PublicEvent;
  /** ISO 'YYYY-MM-DD' for this specific occurrence. */
  date: string;
}

const MONTHS_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Lexically sortable key: date, then time, then id as the tiebreak. */
export function sortKey(date: string, time: string, id: string): string {
  return `${date}T${time}#${id}`;
}

/**
 * Merge the git-baked event set with the /api/events overlay.
 *
 * Overlay ADDS, never removes. Start from the full baked set; the overlay can
 * only contribute ids the baked set does not already carry.
 *
 *   overlay === null  -> the fetch failed; render baked only (graceful degradation)
 *   overlay === []    -> nothing to add; render baked only
 *   id in both        -> the baked record wins (git is the authoritative content)
 *   baked only        -> kept; the overlay legitimately omits revoked and past
 *                        events, so its absence is NOT a tombstone. Revocation is
 *                        enforced by the fold rewriting events.json and by /go
 *                        refusing the link in the meantime, never by this merge.
 *   overlay only      -> appended (submitted since the last weekly fold)
 */
export function mergeEvents(
  baked: readonly PublicEvent[],
  overlay: readonly PublicEvent[] | null,
): PublicEvent[] {
  const out: PublicEvent[] = [...baked];

  if (overlay) {
    const bakedIds = new Set(baked.map((e) => e.id));
    for (const e of overlay) if (!bakedIds.has(e.id)) out.push(e);
  }

  out.sort((a, b) =>
    sortKey(a.date, a.time, a.id) < sortKey(b.date, b.time, b.id) ? -1 : 1,
  );
  return out;
}

/**
 * Pull the event array out of the /api/events response envelope.
 *
 * The endpoint returns `{ events: PublicEvent[] }` (netlify/functions/events.ts),
 * never a bare array. Any body that is not that envelope — a bare array, null, a
 * malformed shape — returns null, which mergeEvents() treats as "overlay
 * unavailable, show baked", the same graceful path as a failed fetch. An empty
 * `{ events: [] }` returns `[]`, which merges to the baked set unchanged.
 */
export function parseOverlayEnvelope(body: unknown): PublicEvent[] | null {
  if (
    body !== null &&
    typeof body === 'object' &&
    Array.isArray((body as { events?: unknown }).events)
  ) {
    return (body as { events: PublicEvent[] }).events;
  }
  return null;
}

/**
 * Expand every event's recurrence rule into dated occurrences, bounded by
 * `horizonEndIso`, and return them in calendar order.
 */
export function expandAll(
  events: readonly PublicEvent[],
  horizonEndIso: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) {
    for (const date of expandOccurrences(event.date, event.recurrence, horizonEndIso)) {
      out.push({ event, date });
    }
  }
  out.sort((a, b) =>
    sortKey(a.date, a.event.time, a.event.id) < sortKey(b.date, b.event.time, b.event.id)
      ? -1
      : 1,
  );
  return out;
}

/**
 * Split expanded occurrences at `todayIso`. Today counts as upcoming.
 * `past` comes back newest-first, which is the order it is displayed in.
 */
export function splitByToday(
  occurrences: readonly Occurrence[],
  todayIso: string,
): { upcoming: Occurrence[]; past: Occurrence[] } {
  const upcoming: Occurrence[] = [];
  const past: Occurrence[] = [];
  for (const o of occurrences) (o.date >= todayIso ? upcoming : past).push(o);
  past.reverse();
  return { upcoming, past };
}

/**
 * Collapse a sorted occurrence list to one row per event — the LIST-view model.
 *
 * The month grid shows every occurrence of a recurring series, but the list must
 * not: a weekly series would otherwise flood it with one row per week. Keep the
 * FIRST occurrence of each event id and drop the rest. Because the input is
 * sorted ascending (expandAll → splitByToday preserve that order), the first
 * occurrence of an id is its NEXT upcoming one, which is the date/time the row
 * should show. A one-off event has a single occurrence and passes through
 * unchanged; a recurring series contributes exactly one row. The result is one
 * entry per distinct EVENT, in calendar order of each event's next occurrence —
 * so its length is the count the "N upcoming" heading and the chip badges show.
 *
 * Order-preserving and pure: it never mutates the input or the occurrences.
 */
export function collapseSeries(occurrences: readonly Occurrence[]): Occurrence[] {
  const seen = new Set<string>();
  const out: Occurrence[] = [];
  for (const o of occurrences) {
    if (seen.has(o.event.id)) continue;
    seen.add(o.event.id);
    out.push(o);
  }
  return out;
}

/**
 * The LIST-view recurrence label text, or null for a one-off event.
 *
 * Appended to the card's quiet type line in the muted DM Mono `.event-typeline`
 * idiom, e.g. "Public event · Repeats weekly" (CSS uppercases it, so it reads
 * "… · REPEATS WEEKLY"). A one-off event returns null and gets no suffix.
 */
export function recurrenceLabel(
  recurrence: PublicEvent['recurrence'],
): string | null {
  if (!recurrence) return null;
  return recurrence.freq === 'weekly' ? 'Repeats weekly' : 'Repeats monthly';
}

/**
 * The human type label shown on the card's quiet type line and in the popover.
 * The single source of truth for the three type labels, shared by the server
 * card (EventsList.astro) and the client card (buildCard) so they cannot drift.
 * The label always NAMES the type, so the type colour is reinforcing, never the
 * sole cue.
 */
export function eventTypeLabel(type: PublicEvent['type']): string {
  switch (type) {
    case 'meetup':
      return 'Location in group';
    case 'public':
      return 'Public event';
    case 'council':
      return 'Council meeting';
    default: {
      // Exhaustiveness guard: adding a member to PublicEvent['type'] without a
      // label here fails the build (the unhandled type is no longer `never`)
      // instead of silently rendering as 'Public event'.
      const unhandled: never = type;
      return unhandled;
    }
  }
}

/** 'AUG' for '2026-08-22'. */
export function monthAbbr(iso: string): string {
  return MONTHS_ABBR[Number(iso.slice(5, 7)) - 1];
}

/** 'August' for '2026-08-22'. */
export function monthLong(year: number, monthIndex0: number): string {
  return MONTHS_LONG[monthIndex0];
}

/** '22' for '2026-08-22', '5' for '2026-08-05'. */
export function dayOfMonth(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

/** '7:00 PM' for '19:00'. */
export function formatTime12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** 0 = Sunday. Uses Date.UTC so the result never depends on the runtime zone. */
export function weekdayIndex(iso: string): number {
  return new Date(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))),
  ).getUTCDay();
}

/** Days in the given month. `monthIndex0` is 0-based. */
export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' from numeric parts. */
export function isoDate(year: number, monthIndex0: number, day: number): string {
  const mm = String(monthIndex0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** `iso` shifted forward by `months`, clamped to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const targetY = y + Math.floor((m + months) / 12);
  const targetM = ((m + months) % 12 + 12) % 12;
  return isoDate(targetY, targetM, Math.min(d, daysInMonth(targetY, targetM)));
}

/**
 * Group occurrences by calendar month, keyed 'YYYY-MM', keys in calendar order.
 * EventsMonth.astro renders a fixed three-month window and reads from this map.
 */
export function groupByMonth(
  occurrences: readonly Occurrence[],
): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = o.date.slice(0, 7);
    const bucket = out.get(key);
    if (bucket) bucket.push(o);
    else out.set(key, [o]);
  }
  return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/* ------------------------------------------------------------------------ *
 * Filtering (design §12)
 *
 * Three callers share every function below, which is the entire point of
 * putting them here: the prerender in src/pages/events.astro (which renders the
 * full, unfiltered list), the browser in src/scripts/events-page.ts (which
 * narrows it), and the tests. A filter that is computed one way at build and
 * another way at runtime is a filter that eventually shows a visitor a list the
 * URL disagrees with.
 * ------------------------------------------------------------------------ */

/** URL slug for each event type, used in the hash. No SC county is named
 *  "meetups" or "public", so the two dimensions never collide in one hash. */
export const TYPE_SLUGS = { meetup: 'meetups', public: 'public', council: 'council' } as const;

export type EventTypeFilter = 'all' | 'meetup' | 'public' | 'council';

export interface EventFilter {
  /** A county slug, or the literal 'all'. Unknown slugs are legal and match nothing. */
  county: string;
  type: EventTypeFilter;
}

/** The unfiltered state, i.e. what /events renders with no hash. */
export const ALL_EVENTS: EventFilter = { county: 'all', type: 'all' };

export function matchesFilter(event: PublicEvent, filter: EventFilter): boolean {
  if (filter.county !== 'all' && event.county !== filter.county) return false;
  if (filter.type !== 'all' && event.type !== filter.type) return false;
  return true;
}

/**
 * Filter stored events. Applied *before* recurrence expansion by the client, so
 * an excluded recurring event cannot leak a single occurrence. An unknown county
 * slug simply matches nothing — it is not an error, because a visitor can paste
 * any #county= hash and an empty calendar with a recruit prompt tells them more
 * than a broken control would.
 */
export function filterEvents(
  events: readonly PublicEvent[],
  filter: EventFilter,
): PublicEvent[] {
  return events.filter((e) => matchesFilter(e, filter));
}

/** The same predicate over already-expanded occurrences. */
export function filterOccurrences(
  occurrences: readonly Occurrence[],
  filter: EventFilter,
): Occurrence[] {
  return occurrences.filter((o) => matchesFilter(o.event, filter));
}

/**
 * The counties worth offering as chips, busiest first, ties broken by slug.
 * Derived from the occurrences that exist — never from the 46-county registry —
 * so the chip row stays a row.
 */
export function countyOptions(
  occurrences: readonly Occurrence[],
): Array<{ county: string; count: number }> {
  const counts = new Map<string, number>();
  for (const o of occurrences) {
    counts.set(o.event.county, (counts.get(o.event.county) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([county, count]) => ({ county, count }))
    .sort((a, b) => b.count - a.count || (a.county < b.county ? -1 : 1));
}

export interface FilterFacets {
  /** Occurrences per county under the active *type* filter (county ignored). */
  countyCounts: Record<string, number>;
  /** Total occurrences under the active *type* filter, for the "All counties" chip. */
  countyAll: number;
  /** Occurrences per type under the active *county* filter (type ignored). */
  typeCounts: { all: number; meetup: number; public: number; council: number };
}

/**
 * Counts for the chip badges. Each dimension is faceted by the *other* one, which
 * is why a chip can read 0: "Greenville 0" under an active Meetups filter means
 * Greenville has events but no meetups, and that is worth showing rather than
 * hiding, because hiding it would strand anyone who filtered into a dead end.
 */
export function facetCounts(
  occurrences: readonly Occurrence[],
  active: EventFilter,
): FilterFacets {
  const countyCounts: Record<string, number> = {};
  let countyAll = 0;
  for (const o of filterOccurrences(occurrences, { county: 'all', type: active.type })) {
    countyCounts[o.event.county] = (countyCounts[o.event.county] ?? 0) + 1;
    countyAll += 1;
  }

  const inCounty = filterOccurrences(occurrences, { county: active.county, type: 'all' });
  return {
    countyCounts,
    countyAll,
    typeCounts: {
      all: inCounty.length,
      meetup: inCounty.filter((o) => o.event.type === 'meetup').length,
      public: inCounty.filter((o) => o.event.type === 'public').length,
      council: inCounty.filter((o) => o.event.type === 'council').length,
    },
  };
}

/**
 * The URL hash for a filter: '' for the unfiltered state, '#county=greenville',
 * '#type=meetups', '#county=greenville&type=meetups'. Shareable among the ~all
 * visitors who have JavaScript; the no-JS page ignores it and shows everything.
 */
export function filterHash(filter: EventFilter): string {
  const parts: string[] = [];
  if (filter.county !== 'all') parts.push(`county=${filter.county}`);
  if (filter.type !== 'all') parts.push(`type=${TYPE_SLUGS[filter.type]}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/**
 * Inverse of filterHash, tolerant of a leading '#' and of an empty string.
 * Anything that is not a recognised type slug under type= is ignored; an unknown
 * county under county= is kept, so a shared #county=<slug> for a county with no
 * current events resolves to the empty state rather than silently widening to
 * every event in the state. A malformed percent-escape in any part is skipped
 * rather than thrown, so a crafted link like #county=% cannot abort the caller.
 */
export function parseFilterHash(hash: string): EventFilter {
  const raw = hash.replace(/^#/, '');
  let county = 'all';
  let type: EventTypeFilter = 'all';
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    let value: string;
    try {
      value = decodeURIComponent(part.slice(eq + 1));
    } catch {
      // A truncated or malformed percent-escape (#county=%, #type=%zz) makes
      // decodeURIComponent throw a URIError. Skip that one part instead of
      // letting the throw abort the whole page module at import time.
      continue;
    }
    if (key === 'county' && value) county = value;
    else if (key === 'type') {
      if (value === TYPE_SLUGS.meetup) type = 'meetup';
      else if (value === TYPE_SLUGS.public) type = 'public';
      else if (value === TYPE_SLUGS.council) type = 'council';
    }
  }
  return { county, type };
}

/**
 * The social-proof line under the empty state (design §12). Shared by the
 * prerender and the browser so a county filtered down to nothing shows the same
 * sentence as a calendar that was empty to begin with.
 */
export function emptyStateProof(pastCount: number): string {
  if (pastCount <= 0)
    return "Nothing has run in the last 90 days either. Join the Signal group and you'll hear when the first one lands.";
  return `${pastCount} ${pastCount === 1 ? 'event has' : 'events have'} run in the last 90 days.`;
}
