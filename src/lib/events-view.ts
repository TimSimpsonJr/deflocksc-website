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
