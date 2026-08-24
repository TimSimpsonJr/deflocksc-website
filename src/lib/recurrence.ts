/**
 * Recurrence expansion for the events calendar.
 *
 * WHY EVERY DATE OPERATION IN THIS FILE IS UTC:
 *
 * The values here are calendar days ("2026-08-22"), not instants. JavaScript's
 * local-time accessors (getDate, getMonth, setDate, and the Date(y, m, d)
 * constructor) resolve against the host timezone, which breaks calendar-day
 * arithmetic in two separate ways:
 *
 *   1. Offset. A date string parses as UTC midnight. On a host behind UTC --
 *      America/New_York, where this site's organizers and its build box both
 *      sit -- getDate() on that value reports the PREVIOUS day, so a formatted
 *      round trip silently shifts every occurrence back one day.
 *   2. DST. Adding "7 days" in local time crosses a transition twice a year.
 *      A midnight-anchored value plus seven local days lands at 23:00 the
 *      evening before (spring forward) or 01:00 (fall back) -- and once the
 *      value is no longer at midnight, the next formatting step can round to
 *      the wrong calendar day.
 *
 * Date.UTC and the getUTC* accessors have no offset and no DST, so day N plus
 * seven days is always day N plus seven days. This matters beyond tidiness:
 * the same rule is expanded at build time (page render, expiry guard) and at
 * request time inside a Netlify function, on machines in different timezones.
 * If those disagree, an event appears on two different days depending on where
 * it was rendered.
 *
 * Do not introduce a local-time Date call here, and do not "simplify" the
 * parse/format helpers into `new Date(string)` plus `toISOString().slice(0, 10)`
 * -- the latter is UTC-correct but the former accepts non-ISO input under
 * implementation-defined local-time rules.
 */

const DAY_MS = 86_400_000;

/**
 * Hard stop on the number of occurrences. Submission validation caps
 * `until` at six months out, which is ~27 weekly occurrences; this bound only
 * exists so a hand-edited or fold-corrupted events.json cannot spin the loop.
 */
const MAX_OCCURRENCES = 400;

/** Shape check only. Real-date-ness is checked by the round trip in parseIsoDate. */
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export interface Recurrence {
  freq: 'weekly' | 'monthly_nth';
  /**
   * Inclusive last calendar day of the series, "YYYY-MM-DD", or null for an
   * indefinite series that is clamped only by the caller's horizon. Organizer
   * submissions always set a concrete date; only curated (council) entries use null.
   */
  until: string | null;
  /**
   * monthly_nth only. When absent, the series is the single nth-weekday that
   * startDate itself falls on (back-compatible). When present, every listed
   * slot's nth-weekday is emitted each month ('last' = the final such weekday),
   * merged in date order; startDate must be one of its month's slots.
   */
  nths?: Array<1 | 2 | 3 | 4 | 5 | 'last'>;
}

/** Format a UTC millisecond value as a "YYYY-MM-DD" calendar day. */
function formatIsoDate(ms: number): string {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" calendar day into UTC milliseconds.
 *
 * Throws RangeError naming the field but never quoting the value: these
 * strings come from a public submission path and from a committed JSON file
 * that a bad commit can edit, and an error message is a log sink.
 */
function parseIsoDate(value: unknown, label: string): number {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new RangeError(`${label} must be a YYYY-MM-DD calendar date`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC silently rolls over: "2026-02-30" becomes March 2nd and
  // "0026-01-01" becomes 1926. Round-tripping the format rejects both.
  if (formatIsoDate(ms) !== value) {
    throw new RangeError(`${label} must be a real calendar date`);
  }
  return ms;
}

/**
 * UTC milliseconds for the `nth` occurrence of `weekday` (0 = Sunday) in the
 * given month, or null when that month does not contain an nth one.
 */
function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  nth: number,
): number | null {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return Date.UTC(year, monthIndex, day);
}

/** UTC milliseconds for the final `weekday` (0 = Sunday) of the given month.
 *  Every month has one, so this never returns null. */
function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, monthIndex, daysInMonth)).getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return Date.UTC(year, monthIndex, daysInMonth - offset);
}

/**
 * UTC milliseconds for one month-slot: the nth (1-5) weekday via
 * nthWeekdayOfMonth, or the final weekday of the month for 'last'. Returns null
 * only for an nth the month does not contain (a 5th weekday in a four-weekday
 * month); 'last' never returns null.
 */
function resolveSlot(
  year: number,
  monthIndex: number,
  weekday: number,
  slot: 1 | 2 | 3 | 4 | 5 | 'last',
): number | null {
  return slot === 'last'
    ? lastWeekdayOfMonth(year, monthIndex, weekday)
    : nthWeekdayOfMonth(year, monthIndex, weekday, slot);
}

/**
 * Expand a recurrence rule into the calendar days it covers.
 *
 * `startDate` is occurrence #1 and is always included, subject to the bounds.
 * Both `rec.until` and `horizonEndIso` are INCLUSIVE, and each clamps
 * independently -- the effective end is the earlier of the two. A start date
 * past the effective end yields an empty array, including when `rec` is null,
 * so the returned list never contains a date past either bound.
 *
 * `monthly_nth` repeats the Nth-weekday-of-month implied by `startDate`
 * (2026-08-11 is the 2nd Tuesday, so the series is every 2nd Tuesday). A month
 * that does not contain an Nth such weekday is skipped, not approximated.
 *
 * @param startDate      "YYYY-MM-DD"
 * @param rec            recurrence rule, or null for a one-off event
 * @param horizonEndIso  "YYYY-MM-DD", the last day the caller wants rendered
 * @throws RangeError on any malformed date or unknown freq
 */
export function expandOccurrences(
  startDate: string,
  rec: Recurrence | null,
  horizonEndIso: string,
): string[] {
  const startMs = parseIsoDate(startDate, 'startDate');
  const horizonMs = parseIsoDate(horizonEndIso, 'horizonEndIso');

  let endMs = horizonMs;
  if (rec) {
    if (rec.freq !== 'weekly' && rec.freq !== 'monthly_nth') {
      throw new RangeError('recurrence.freq must be "weekly" or "monthly_nth"');
    }
    endMs =
      rec.until === null
        ? horizonMs
        : Math.min(parseIsoDate(rec.until, 'recurrence.until'), horizonMs);
  }

  if (startMs > endMs) return [];
  if (!rec) return [formatIsoDate(startMs)];

  if (rec.freq === 'weekly') {
    const out: string[] = [formatIsoDate(startMs)];
    let cursor = startMs + 7 * DAY_MS;
    while (cursor <= endMs && out.length < MAX_OCCURRENCES) {
      out.push(formatIsoDate(cursor));
      cursor += 7 * DAY_MS;
    }
    return out;
  }

  // monthly_nth. The weekday comes from startDate. The month-slots are rec.nths
  // when present, else the single nth that startDate itself falls on (the
  // back-compatible default). startDate must be one of the slots its own month
  // produces, so it is always occurrence #1.
  // Defence in depth: nths is the one field trusted from its TS type alone, and
  // this function's threat model is a hand-edited or fold-corrupted events.json.
  // Garbage members fail OPEN into the output -- a string nth formats as
  // "0NaN-NaN-NaN", a fractional day is truncated onto the wrong weekday, and a
  // zero or negative nth rolls into the previous month past nthWeekdayOfMonth's
  // upper-bound-only guard -- so reject anything that is not absent or an array
  // whose every member is 'last' or an integer 1-5, matching freq/date checks.
  if (
    rec.nths !== undefined &&
    (!Array.isArray(rec.nths) ||
      !rec.nths.every((n) => n === 'last' || (Number.isInteger(n) && n >= 1 && n <= 5)))
  ) {
    throw new RangeError("recurrence.nths must be an array of integers 1-5 or 'last'");
  }

  const start = new Date(startMs);
  const weekday = start.getUTCDay();
  const slots: Array<1 | 2 | 3 | 4 | 5 | 'last'> =
    rec.nths ?? [(Math.floor((start.getUTCDate() - 1) / 7) + 1) as 1 | 2 | 3 | 4 | 5];

  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const startIsASlot = slots.some(
    (slot) => resolveSlot(startYear, startMonth, weekday, slot) === startMs,
  );
  if (!startIsASlot) {
    throw new RangeError('recurrence startDate must fall on one of nths');
  }

  const out: string[] = [];
  let year = startYear;
  let monthIndex = startMonth;
  let firstMonth = true;

  while (out.length < MAX_OCCURRENCES) {
    // Every slot's date in this month, ascending and de-duplicated (nths [5,
    // 'last'] collapse to one date in a five-weekday month).
    const seen = new Set<number>();
    const monthDates: number[] = [];
    for (const slot of slots) {
      const ms = resolveSlot(year, monthIndex, weekday, slot);
      if (ms !== null && !seen.has(ms)) {
        seen.add(ms);
        monthDates.push(ms);
      }
    }
    monthDates.sort((a, b) => a - b);

    let stop = false;
    for (const ms of monthDates) {
      // Anchor month: a slot before startDate is in the past; startDate itself
      // is a slot (validated above), so it is always the first emitted date.
      if (firstMonth && ms < startMs) continue;
      if (ms > endMs) { stop = true; break; }
      out.push(formatIsoDate(ms));
      if (out.length >= MAX_OCCURRENCES) { stop = true; break; }
    }
    if (stop) break;

    firstMonth = false;
    monthIndex += 1;
    if (monthIndex > 11) { monthIndex = 0; year += 1; }
    // Stop once the whole next month is past the end, so a series whose only
    // remaining slots do not exist (a 5th-weekday-only rule) cannot loop forever.
    if (Date.UTC(year, monthIndex, 1) > endMs) break;
  }

  return out;
}
