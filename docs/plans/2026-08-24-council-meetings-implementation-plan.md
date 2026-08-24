# Council Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a curated third event type — `council` — to the events calendar, with indefinite/multi-slot recurrence, a blue accent, a separate type filter, and a popover "Upcoming meetings" list, so activists can find and act on their city/county council meetings.

**Architecture:** Council meetings are a curated, build-time data source (`src/data/council-meetings.json`) validated by a strict schema and merged into the existing baked event list in `src/pages/events.astro`; they reuse the calendar's occurrence-expansion, collapse-per-series, filter, and popover machinery. The recurrence engine (`src/lib/recurrence.ts`) gains an indefinite `until: null` and an optional `nths` list so "1st & 3rd Monday, forever" is one entry, while its UTC calendar-day discipline and `MAX_OCCURRENCES` bound are preserved. All non-view logic lives in pure, unit-tested lib functions; the `.astro`/browser wiring is covered by a build check plus a precise manual pass.

**Tech Stack:** Astro 5, TypeScript, Zod 4.4.3, Vitest 4 (tests run under `TZ=America/New_York` to catch local-time bugs). Tests: `npx vitest run <file>` (focused) / `npm test` (full suite).

---

## Task 1 — Recurrence: indefinite `until` (`until: string | null`)

Make `Recurrence.until` nullable. `null` means "no series end — clamp only by the caller's horizon." The submission schema is untouched; only curated council entries use `null`.

**Files**
- Modify: `src/lib/recurrence.ts` (interface `Recurrence`, lines 46-50; `endMs` computation, lines 129-135)
- Test: `src/lib/recurrence.test.ts` (append new `describe` blocks)

**Steps**

- [ ] **Step 1 — Write the failing test.** Append to `src/lib/recurrence.test.ts` (the file already sets `process.env.TZ = 'America/New_York'` at the top, which every `describe` inherits):

```ts
describe('expandOccurrences: indefinite until (until === null)', () => {
  it('weekly with null until expands to the horizon and no further', () => {
    expect(
      expandOccurrences('2026-09-01', { freq: 'weekly', until: null }, '2026-09-22'),
    ).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']);
  });

  it('monthly_nth with null until expands to the horizon and no further', () => {
    // 2026-08-11 is the 2nd Tuesday; the horizon (Nov 30) is the only bound.
    expect(
      expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: null }, '2026-11-30'),
    ).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10']);
  });

  it('still caps a null-until runaway at 400 occurrences', () => {
    const out = expandOccurrences(
      '2026-01-01',
      { freq: 'weekly', until: null },
      '2046-01-01',
    );
    expect(out.length).toBe(400);
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/recurrence.test.ts` — FAILS to type-check/compile: `until: null` is not assignable to `Recurrence.until` (currently `string`), and at runtime `parseIsoDate(null, …)` would throw `RangeError` rather than clamping to the horizon.

- [ ] **Step 3 — Implement.** In `src/lib/recurrence.ts`, widen the interface:

```ts
export interface Recurrence {
  freq: 'weekly' | 'monthly_nth';
  /**
   * Inclusive last calendar day of the series, "YYYY-MM-DD", or null for an
   * indefinite series that is clamped only by the caller's horizon. Organizer
   * submissions always set a concrete date; only curated (council) entries use null.
   */
  until: string | null;
}
```

Then change the `endMs` computation inside `expandOccurrences` (the `if (rec) { … }` block) so `null` clamps only by the horizon:

```ts
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
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/recurrence.test.ts` — PASS: the 3 new tests are green and every pre-existing recurrence test still passes (a concrete `until` string still flows through `Math.min(parseIsoDate(...), horizonMs)` unchanged).

- [ ] **Step 5 — Commit.**
```
git add src/lib/recurrence.ts src/lib/recurrence.test.ts
git commit -m "feat(recurrence): allow indefinite series with until: null"
```

---

## Task 2 — Recurrence: multiple monthly slots (`nths`)

`monthly_nth` gains optional `nths?: Array<1 | 2 | 3 | 4 | 5 | 'last'>`. Absent = current single-nth-from-`startDate` (back-compat). Present = emit every listed slot's nth-weekday per month (weekday derived from `startDate`; `'last'` = final such weekday of the month), merged in date order; `startDate` stays occurrence #1 and must be one of its month's slots. UTC and `MAX_OCCURRENCES` preserved.

**Files**
- Modify: `src/lib/recurrence.ts` (interface `Recurrence`; add `lastWeekdayOfMonth` + `resolveSlot` helpers after `nthWeekdayOfMonth`, ~line 101; rewrite the `monthly_nth` branch of `expandOccurrences`, lines 140-176)
- Test: `src/lib/recurrence.test.ts` (append new `describe` block)

**Steps**

- [ ] **Step 1 — Write the failing test.** Append to `src/lib/recurrence.test.ts`:

```ts
describe('expandOccurrences: monthly_nth with an nths list', () => {
  it('emits 1st & 3rd Monday of every month in date order', () => {
    // Sep 2026 Mondays: 7, 14, 21, 28 -> 1st = Sep 7, 3rd = Sep 21.
    expect(
      expandOccurrences('2026-09-07', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-11-30'),
    ).toEqual([
      '2026-09-07', '2026-09-21',
      '2026-10-05', '2026-10-19',
      '2026-11-02', '2026-11-16',
    ]);
  });

  it('keeps startDate as occurrence #1 and skips earlier same-month slots', () => {
    // startDate is the 3rd Monday; the 1st Monday (Sep 7) is before it and is dropped.
    expect(
      expandOccurrences('2026-09-21', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-10-31'),
    ).toEqual(['2026-09-21', '2026-10-05', '2026-10-19']);
  });

  it("resolves 'last' to the final weekday of each month (4th or 5th)", () => {
    // Last Tuesday: Sep 29 (5th), Oct 27 (4th), Nov 24 (4th), Dec 29 (5th).
    expect(
      expandOccurrences('2026-09-29', { freq: 'monthly_nth', nths: ['last'], until: null }, '2026-12-31'),
    ).toEqual(['2026-09-29', '2026-10-27', '2026-11-24', '2026-12-29']);
  });

  it('skips a listed slot that a month does not contain (a missing 5th)', () => {
    // 1st & 5th Monday: only November 2026 has a 5th Monday (Nov 30).
    expect(
      expandOccurrences('2026-09-07', { freq: 'monthly_nth', nths: [1, 5], until: null }, '2026-11-30'),
    ).toEqual(['2026-09-07', '2026-10-05', '2026-11-02', '2026-11-30']);
  });

  it('de-duplicates a month where two slots resolve to the same date', () => {
    // 5th & last Tuesday collapse to one date in a five-Tuesday month (Sep 29),
    // and 'last' still fires in a four-Tuesday month (Oct 27) where 5 does not.
    expect(
      expandOccurrences('2026-09-29', { freq: 'monthly_nth', nths: [5, 'last'], until: '2026-10-31' }, '2026-12-31'),
    ).toEqual(['2026-09-29', '2026-10-27']);
  });

  it('is UTC-correct across the fall-back DST boundary (Nov 1 2026)', () => {
    // 1st & 3rd Sunday spanning the fall-back date; the day must not shift.
    expect(
      expandOccurrences('2026-10-04', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-11-30'),
    ).toEqual(['2026-10-04', '2026-10-18', '2026-11-01', '2026-11-15']);
  });

  it('absent nths behaves identically to an explicit single-nth list', () => {
    const absent = expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31');
    const explicit = expandOccurrences('2026-08-11', { freq: 'monthly_nth', nths: [2], until: '2026-12-31' }, '2027-01-31');
    expect(explicit).toEqual(absent);
    expect(absent).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08']);
  });

  it('throws when startDate is not one of the listed slots', () => {
    // 2026-09-14 is the 2nd Monday; nths [1, 3] does not include it.
    expect(() =>
      expandOccurrences('2026-09-14', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-12-31'),
    ).toThrow(RangeError);
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/recurrence.test.ts` — FAILS to type-check: `nths` is not a property of `Recurrence`. (Even once typed, the current single-nth loop would emit wrong sequences and never throw for a startDate outside the slots.)

- [ ] **Step 3 — Implement.** In `src/lib/recurrence.ts`:

(a) Add `nths` to the interface (keep the `until` widening from Task 1):

```ts
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
```

(b) Add two helpers immediately after `nthWeekdayOfMonth` (after its closing brace, ~line 101):

```ts
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
```

(c) Replace the whole body from `const out: string[] = [formatIsoDate(startMs)];` (line 140) through the final `return out;` (line 176) with the branch-split below. The weekly branch is unchanged in behaviour; the `monthly_nth` branch is rewritten to be anchor-inclusive and slot-aware:

```ts
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
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/recurrence.test.ts` — PASS: the 8 new tests plus every pre-existing recurrence test are green (the pre-existing single-nth `monthly_nth` cases now flow through `slots = [derivedNth]`, which reproduces the prior sequence exactly).

- [ ] **Step 5 — Commit.**
```
git add src/lib/recurrence.ts src/lib/recurrence.test.ts
git commit -m "feat(recurrence): support multiple monthly slots (nths) incl. last"
```

---

## Task 3 — Data model: `council` type + `source` field + strict render schema

Widen `PublicEvent.type` to include `'council'`, add an optional `source?: string | null`, mirror the recurrence type change, and add `'council'` (plus `source`, nullable `until`, optional `nths`) to the strict render schema `publicEventSchema`. The submission enum stays `meetup | public`.

**Files**
- Modify: `src/lib/public-event.ts` (`PublicEvent` interface, lines 32-46 — `type`, `recurrence`, add `source`)
- Modify: `src/lib/event-schema.ts` (`publicEventSchema`, lines 224-249 — `type` enum, `recurrence` sub-schema, add `source`)
- Test: `src/lib/event-schema.test.ts` (append a council-accept test)
- Unchanged but re-run: `src/lib/public-event.test.ts` (the 13-field allowlist is deliberately not extended)

**Steps**

- [ ] **Step 1 — Write the failing test.** Append to `src/lib/event-schema.test.ts`, inside the existing `describe('publicEventSchema — the stored/public shape', …)` block:

```ts
  it('accepts a council record with source, indefinite until, and nths', () => {
    const record = {
      id: 'council-greenville-city',
      type: 'council',
      title: 'Greenville City Council',
      description: 'Sign up with the clerk to speak. Each speaker gets 3 minutes.',
      date: '2026-09-14',
      time: '17:30',
      city: 'greenville',
      county: 'greenville',
      address: '206 S Main St, Greenville, SC 29601',
      hasSignalGroup: false,
      recurrence: { freq: 'monthly_nth', nths: [2, 4], until: null },
      organizer: 'Greenville City Council',
      createdAt: '2026-08-17T14:22:00Z',
      source: 'https://www.greenvillesc.gov/185/City-Council',
    };
    expect(publicEventSchema.safeParse(record).success).toBe(true);
  });
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/event-schema.test.ts` — FAILS: `publicEventSchema` rejects `type: 'council'` (enum is `meetup | public`), rejects the unknown `source` key (`.strict()`), rejects `nths` inside `recurrence` (`.strict()`), and rejects `until: null` (currently a required string).

- [ ] **Step 3 — Implement.**

(a) In `src/lib/public-event.ts`, update the `PublicEvent` interface (leave `StoredEvent` — the submission/blob shape — unchanged, and leave `PUBLIC_EVENT_FIELDS` + `toPublicEvent` unchanged so the confidentiality allowlist and its tests stay intact):

```ts
export interface PublicEvent {
  id: string;
  type: 'meetup' | 'public' | 'council';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  county: string;
  address: string | null;
  hasSignalGroup: boolean;
  recurrence: {
    freq: 'weekly' | 'monthly_nth';
    until: string | null;
    nths?: Array<1 | 2 | 3 | 4 | 5 | 'last'>;
  } | null;
  organizer: string;
  createdAt: string;
  /** Curated council entries only: the official schedule URL. Absent on
   *  submitted (meetup/public) events. Not part of PUBLIC_EVENT_FIELDS — it is
   *  set directly by loadCouncilEvents(), never projected from a StoredEvent. */
  source?: string | null;
}
```

(b) In `src/lib/event-schema.ts`, update `publicEventSchema` — widen the `type` enum, make `recurrence.until` nullable, add optional `nths`, and declare the optional `source` field (leave the submission `submissionSchema` and `recurrenceField` untouched — organizers still cannot submit council, null-until, or nths):

```ts
export const publicEventSchema = z
  .object({
    id: z.string(),
    type: z.enum(['meetup', 'public', 'council']),
    title: sanitizedField(TITLE_LIMITS),
    description: sanitizedField(DESCRIPTION_LIMITS).nullable(),
    date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    time: z.string().regex(TIME_RE, 'bad_format'),
    city: z.string(),
    county: z.string(),
    address: sanitizedField(ADDRESS_LIMITS).nullable(),
    hasSignalGroup: z.boolean(),
    recurrence: z
      .object({
        freq: z.enum(['weekly', 'monthly_nth']),
        until: z
          .string()
          .regex(ISO_DATE_RE, 'bad_format')
          .refine(isRealIsoDate, 'not_a_real_date')
          .nullable(),
        nths: z
          .array(
            z.union([
              z.literal(1),
              z.literal(2),
              z.literal(3),
              z.literal(4),
              z.literal(5),
              z.literal('last'),
            ]),
          )
          .min(1)
          .optional(),
      })
      .strict()
      .nullable(),
    organizer: z.string(),
    createdAt: z.string(),
    source: z.string().nullable().optional(),
  })
  .strict();
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/event-schema.test.ts src/lib/public-event.test.ts` — PASS: the new council-accept test is green; the existing `publicEventSchema` tests (valid public record accepted, `signalUrl`/`codeDigest`/`revoked` rejected via `.strict()`) still pass; and every `public-event.test.ts` allowlist test passes unchanged (`source` is optional, `toPublicEvent` still emits exactly the 13 `PUBLIC_EVENT_FIELDS`).

- [ ] **Step 5 — Commit.**
```
git add src/lib/public-event.ts src/lib/event-schema.ts src/lib/event-schema.test.ts
git commit -m "feat(events): add council type + source field to the render model"
```

---

## Task 4 — `councilEventSchema` + `loadCouncilEvents()` loader

New `src/lib/council-events.ts`: a strict `councilEventSchema`, a pure `parseCouncilEvents(raw)` that validates each entry and projects it to a council `PublicEvent`, and `loadCouncilEvents()` that runs it over the committed JSON. A bad entry throws (fails the build). This task creates the data file as an empty array `[]`; Task 5 seeds it.

**Files**
- Create: `src/lib/council-events.ts`
- Create: `src/lib/council-events.test.ts`
- Create: `src/data/council-meetings.json` (content: `[]`)
- Test: `src/lib/council-events.test.ts`

**Steps**

- [ ] **Step 1 — Write the failing test.** Create `src/lib/council-events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCouncilEvents } from './council-events.js';

function councilEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'council-greenville-city',
    type: 'council',
    title: 'Greenville City Council',
    description: 'Sign up with the clerk to speak. Each speaker gets 3 minutes.',
    date: '2026-09-14',
    time: '17:30',
    city: 'greenville',
    county: 'greenville',
    address: '206 S Main St, Greenville, SC 29601',
    recurrence: { freq: 'monthly_nth', nths: [2, 4], until: null },
    source: 'https://www.greenvillesc.gov/185/City-Council',
    organizer: 'Greenville City Council',
    ...overrides,
  };
}

describe('parseCouncilEvents — accepted', () => {
  it('projects a valid entry into a council PublicEvent', () => {
    const events = parseCouncilEvents([councilEntry()]);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.type).toBe('council');
    expect(event.hasSignalGroup).toBe(false);
    expect(event.source).toBe('https://www.greenvillesc.gov/185/City-Council');
    expect(event.city).toBe('greenville');
    expect(event.county).toBe('greenville');
    expect(event.recurrence).toEqual({ freq: 'monthly_nth', nths: [2, 4], until: null });
    // createdAt is synthesized from the anchor date (curated entries carry no timestamp).
    expect(event.createdAt).toBe('2026-09-14T00:00:00Z');
  });

  it('accepts a weekly council with a concrete until and no nths', () => {
    const [event] = parseCouncilEvents([
      councilEntry({ recurrence: { freq: 'weekly', until: '2027-02-01' } }),
    ]);
    expect(event.recurrence).toEqual({ freq: 'weekly', until: '2027-02-01' });
  });
});

describe('parseCouncilEvents — rejected (a bad entry fails the build)', () => {
  it('rejects an entry with no source', () => {
    const bad = councilEntry();
    delete bad.source;
    expect(() => parseCouncilEvents([bad])).toThrow(/source/);
  });

  it('rejects a source that is not an http(s) URL', () => {
    expect(() => parseCouncilEvents([councilEntry({ source: 'not-a-url' })])).toThrow();
  });

  it('rejects a county that does not match the city', () => {
    expect(() => parseCouncilEvents([councilEntry({ county: 'spartanburg' })])).toThrow(/county/);
  });

  it('rejects an unknown city slug', () => {
    expect(() => parseCouncilEvents([councilEntry({ city: 'atlantis' })])).toThrow();
  });

  it('rejects nths on a weekly recurrence', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ recurrence: { freq: 'weekly', nths: [1], until: null } })]),
    ).toThrow();
  });

  it('rejects a bad until format', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ recurrence: { freq: 'weekly', until: '2027-2-1' } })]),
    ).toThrow();
  });

  it('rejects a server-only field via strict()', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ signalUrl: 'https://signal.group/#x' })]),
    ).toThrow();
  });

  it('rejects a non-council type', () => {
    expect(() => parseCouncilEvents([councilEntry({ type: 'public' })])).toThrow();
  });

  it('names the record index and field in the error', () => {
    const bad = councilEntry({ county: 'spartanburg' });
    expect(() => parseCouncilEvents([councilEntry(), bad])).toThrow(/record 1/);
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/council-events.test.ts` — FAILS: `src/lib/council-events.ts` does not exist (import error).

- [ ] **Step 3 — Implement.** Create `src/data/council-meetings.json` with exactly:

```json
[]
```

Create `src/lib/council-events.ts`:

```ts
/**
 * Curated council meetings — a build-time data source, not a submission path.
 *
 * src/data/council-meetings.json is version-controlled so every entry is
 * reviewable in the PR diff (the "verify each before shipping" bar). Each entry
 * is validated by the strict councilEventSchema and projected to a council
 * PublicEvent; a bad entry THROWS, which fails the Astro build so no unverified
 * or malformed council data can ship. Council entries never touch Netlify Blobs,
 * /go, or the organizer submission path: they are type 'council', carry a
 * required official-schedule `source`, and have hasSignalGroup === false and no
 * signalUrl (nothing to leak).
 */

import { z } from 'zod';
import type { PublicEvent } from './public-event.js';
import {
  sanitizeText,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  ADDRESS_LIMITS,
  type SanitizeOptions,
} from './sanitize-text.js';
import { isKnownCity, countyForCity } from './jurisdictions.js';
import councilData from '../data/council-meetings.json';

const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ID_RE = /^[a-z0-9-]+$/;

/** UTC real-calendar-day check, mirroring event-schema.ts's isRealIsoDate. */
function isRealIsoDate(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Delegates to the shared sanitizer, the same idiom event-schema.ts uses. */
function sanitizedField(limits: SanitizeOptions) {
  return z.unknown().transform((value, ctx) => {
    const result = sanitizeText(value, limits);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.code });
      return z.NEVER;
    }
    return result.value;
  });
}

const councilRecurrenceSchema = z
  .object({
    freq: z.enum(['weekly', 'monthly_nth']),
    until: z
      .string()
      .regex(ISO_DATE_RE, 'bad_format')
      .refine(isRealIsoDate, 'not_a_real_date')
      .nullable(),
    nths: z
      .array(
        z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal('last'),
        ]),
      )
      .min(1)
      .optional(),
  })
  .strict();

/**
 * The strict shape of one council-meetings.json entry. `.strict()` rejects any
 * unexpected key (a smuggled signalUrl/codeDigest/id-collision). The superRefine
 * enforces two cross-field rules: `county` must be the county the registry
 * derives from `city` (a typo like city greenville / county spartanburg fails),
 * and `nths` is only meaningful for monthly_nth.
 *
 * The startDate-is-a-slot invariant (startDate must fall on one of nths) is not
 * re-checked here: expandOccurrences enforces it at build and throws, which fails
 * the build the same way (locked by a recurrence.test.ts case).
 */
export const councilEventSchema = z
  .object({
    id: z.string().regex(ID_RE, 'bad_id'),
    type: z.literal('council'),
    title: sanitizedField(TITLE_LIMITS),
    description: sanitizedField(DESCRIPTION_LIMITS),
    date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    time: z.string().regex(TIME_RE, 'bad_format'),
    city: z.string().refine(isKnownCity, 'unknown_city'),
    county: z.string(),
    address: sanitizedField(ADDRESS_LIMITS),
    recurrence: councilRecurrenceSchema.nullable(),
    source: z.string().refine(isHttpUrl, 'bad_source'),
    organizer: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const derived = countyForCity(value.city);
    if (!derived.ok || derived.value !== value.county) {
      ctx.addIssue({ code: 'custom', path: ['county'], message: 'county_mismatch' });
    }
    if (value.recurrence?.nths && value.recurrence.freq !== 'monthly_nth') {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'nths'],
        message: 'nths_requires_monthly_nth',
      });
    }
  });

/**
 * Validate a raw array and project each entry to a council PublicEvent. Pure
 * (takes the array as an argument) so it is unit-testable without the file.
 * Throws on the first bad entry, naming its index and field, so the Astro build
 * aborts rather than shipping unverified council data.
 */
export function parseCouncilEvents(raw: readonly unknown[]): PublicEvent[] {
  return raw.map((entry, index) => {
    const parsed = councilEventSchema.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue.path.length > 0 ? issue.path.join('.') : '_record';
      const detail = issue.code === 'unrecognized_keys' ? 'unexpected_field' : issue.message;
      throw new Error(
        `src/data/council-meetings.json: record ${index} at "${at}" failed validation (${detail})`,
      );
    }
    const c = parsed.data;
    // Explicit construction, never a spread — the same discipline toPublicEvent
    // and validateSubmission use. hasSignalGroup is forced false; there is no
    // signalUrl on a council PublicEvent, and createdAt is synthesized from the
    // anchor date so the value is deterministic across build machines.
    return {
      id: c.id,
      type: 'council',
      title: c.title,
      description: c.description,
      date: c.date,
      time: c.time,
      city: c.city,
      county: c.county,
      address: c.address,
      hasSignalGroup: false,
      recurrence: c.recurrence,
      organizer: c.organizer,
      createdAt: `${c.date}T00:00:00Z`,
      source: c.source,
    };
  });
}

/** Read + validate the committed council-meetings.json into council PublicEvents. */
export function loadCouncilEvents(): PublicEvent[] {
  return parseCouncilEvents(councilData as unknown[]);
}
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/council-events.test.ts` — PASS: all accepted/rejected cases are green (10 tests).

- [ ] **Step 5 — Commit.**
```
git add src/lib/council-events.ts src/lib/council-events.test.ts src/data/council-meetings.json
git commit -m "feat(events): councilEventSchema + loadCouncilEvents loader"
```

---

## Task 5 — Seed `council-meetings.json` + merge into the build

Populate the JSON with 2 example entries and wire `loadCouncilEvents()` into the event-assembly point so council events merge into the baked list at build.

> **PROVISIONAL DATA NOTE.** The two seed entries below are EXAMPLES to make the
> feature demonstrable and the merge testable. Their times, addresses, cadence
> (`nths`), and `source` URLs are plausible but UNVERIFIED — they are placeholders
> pending the source-verification pass in the later data-gathering step (design
> §6). Do not treat them as accurate published schedules. Both are real SC
> jurisdictions with registry-valid `city`/`county` slugs
> (greenville→greenville, columbia→richland), and both anchor dates fall on a
> listed `nths` slot (Sep 14 2026 = 2nd Monday ∈ [2,4]; Sep 1 2026 = 1st Tuesday
> ∈ [1,3]).

**Files**
- Modify: `src/data/council-meetings.json` (replace `[]` with the 2 seed entries)
- Modify: `src/pages/events.astro` (frontmatter — import + merge, immediately after the dev-seed block that ends at line 77, before `const today` at line 79)
- Test: `src/lib/council-events.test.ts` (append a committed-seed loader test)

**Steps**

- [ ] **Step 1 — Write the failing test.** Extend the existing top-of-file import in `src/lib/council-events.test.ts` to `import { parseCouncilEvents, loadCouncilEvents } from './council-events.js';`, then append:

```ts
describe('loadCouncilEvents — the committed seed', () => {
  it('loads council-meetings.json as valid council PublicEvents', () => {
    const events = loadCouncilEvents();
    expect(events.length).toBe(2);
    for (const e of events) {
      expect(e.type).toBe('council');
      expect(e.hasSignalGroup).toBe(false);
      expect(typeof e.source).toBe('string');
      expect(e.id.startsWith('council-')).toBe(true);
    }
  });

  it('includes the Greenville and Columbia city councils', () => {
    const ids = loadCouncilEvents().map((e) => e.id).sort();
    expect(ids).toEqual(['council-columbia-city', 'council-greenville-city']);
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/council-events.test.ts` — FAILS: `council-meetings.json` is `[]`, so `loadCouncilEvents()` returns `[]` — `expect(events.length).toBe(2)` fails.

- [ ] **Step 3 — Implement.** Replace the contents of `src/data/council-meetings.json` with:

```json
[
  {
    "id": "council-greenville-city",
    "type": "council",
    "title": "Greenville City Council",
    "description": "Regular council meeting. Public comment sign-up is handled by the City Clerk before the meeting starts; arrive early to add your name. Each speaker gets 3 minutes.",
    "date": "2026-09-14",
    "time": "17:30",
    "city": "greenville",
    "county": "greenville",
    "address": "206 S Main St, Greenville, SC 29601",
    "recurrence": { "freq": "monthly_nth", "nths": [2, 4], "until": null },
    "source": "https://www.greenvillesc.gov/185/City-Council",
    "organizer": "Greenville City Council"
  },
  {
    "id": "council-columbia-city",
    "type": "council",
    "title": "Columbia City Council",
    "description": "Regular council meeting. Sign up with the City Clerk to speak during the public-comment period. Each speaker gets 3 minutes.",
    "date": "2026-09-01",
    "time": "18:00",
    "city": "columbia",
    "county": "richland",
    "address": "1737 Main St, Columbia, SC 29201",
    "recurrence": { "freq": "monthly_nth", "nths": [1, 3], "until": null },
    "source": "https://www.columbiasc.gov/city-council",
    "organizer": "Columbia City Council"
  }
]
```

Then wire the merge into `src/pages/events.astro`. Add the import beside the existing `public-event` / `event-schema` imports in the frontmatter (after line 9):

```ts
import { loadCouncilEvents } from '../lib/council-events.js';
```

And insert the merge immediately after the dev-seed `if (import.meta.env.DEV) { … }` block closes (after line 77), before `const today` (line 79):

```ts
// Curated council meetings (src/data/council-meetings.json), merged into the
// baked list alongside the folded submissions. loadCouncilEvents() validates each
// entry with the strict councilEventSchema and throws on a bad one, so an
// unverified or malformed council entry fails the build here rather than shipping.
// These are curated-only: they never touch Netlify Blobs, /go, or the submission
// path, and carry hasSignalGroup === false with no signalUrl.
bakedEvents.push(...loadCouncilEvents());
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/council-events.test.ts` — PASS: the seed loads as 2 council events with the expected ids. (The build-merge itself is verified by the build check in Task 8.)

- [ ] **Step 5 — Commit.**
```
git add src/data/council-meetings.json src/pages/events.astro src/lib/council-events.test.ts
git commit -m "feat(events): seed council-meetings.json and merge it into the build"
```

---

## Task 6 — Type filter: 4th option (Council meetings) + `eventTypeLabel`

Widen the type-filter model to `all | meetup | public | council`, add the `council` hash slug, count council in the facets, and add a pure `eventTypeLabel(type)` used by both render paths. `matchesFilter`'s predicate already isolates by exact type (`type: 'public'` excludes `council`, `type: 'council'` isolates), so it needs no logic change — only the union widens.

**Files**
- Modify: `src/lib/events-view.ts` (`TYPE_SLUGS` line 251; `EventTypeFilter` line 253; `FilterFacets.typeCounts` line 315; `facetCounts` lines 339-344; `parseFilterHash` lines 385-388; add `eventTypeLabel` near `recurrenceLabel`, ~line 166)
- Test: `src/lib/events-view.test.ts` (append council filter + label tests; update 4 existing `typeCounts` assertions)

**Steps**

- [ ] **Step 1 — Write the failing test.** First, update the 4 existing `typeCounts` assertions in `src/lib/events-view.test.ts` to include `council: 0` (the `MIXED` and `collapseSeries` fixtures contain no council events):
  - Line 225: `expect(f.typeCounts).toEqual({ all: 4, meetup: 2, public: 2, council: 0 });`
  - Line 449: `expect(f.typeCounts).toEqual({ all: 4, meetup: 2, public: 2, council: 0 });`
  - Line 460: `expect(f.typeCounts).toEqual({ all: 2, meetup: 1, public: 1, council: 0 });`
  - Line 470: `expect(f.typeCounts).toEqual({ all: 0, meetup: 0, public: 0, council: 0 });`

Then add `eventTypeLabel` to the import at the top of the file and append these new `describe` blocks. They reuse the existing `ev()` factory (add `council` fixtures inline):

```ts
describe('matchesFilter — council isolation', () => {
  const gvCouncil = ev({ id: 'gvcncl', county: 'greenville', type: 'council' });
  const gvPublic = ev({ id: 'gvpub', county: 'greenville', type: 'public' });
  const gvMeet = ev({ id: 'gvmeet', county: 'greenville', type: 'meetup' });

  it("'public' matches only public and excludes council", () => {
    expect(matchesFilter(gvPublic, { county: 'all', type: 'public' })).toBe(true);
    expect(matchesFilter(gvCouncil, { county: 'all', type: 'public' })).toBe(false);
  });

  it("'council' isolates council and excludes public and meetup", () => {
    expect(matchesFilter(gvCouncil, { county: 'all', type: 'council' })).toBe(true);
    expect(matchesFilter(gvPublic, { county: 'all', type: 'council' })).toBe(false);
    expect(matchesFilter(gvMeet, { county: 'all', type: 'council' })).toBe(false);
  });

  it("'all' includes council", () => {
    expect(matchesFilter(gvCouncil, { county: 'all', type: 'all' })).toBe(true);
  });
});

describe('facetCounts — council is a counted type', () => {
  it('counts council occurrences under the all/all filter', () => {
    const events = [
      ev({ id: 'm', county: 'greenville', type: 'meetup', date: '2026-09-01' }),
      ev({ id: 'p', county: 'greenville', type: 'public', date: '2026-09-02' }),
      ev({ id: 'c', county: 'greenville', type: 'council', date: '2026-09-03' }),
    ];
    const occ = expandAll(events, '2027-09-01');
    expect(facetCounts(occ, ALL_EVENTS).typeCounts).toEqual({
      all: 3,
      meetup: 1,
      public: 1,
      council: 1,
    });
  });
});

describe('type filter hash — council', () => {
  it('maps the council filter to #type=council', () => {
    expect(filterHash({ county: 'all', type: 'council' })).toBe('#type=council');
  });

  it('parses #type=council back to the council filter', () => {
    expect(parseFilterHash('#type=council')).toEqual({ county: 'all', type: 'council' });
  });

  it('round-trips a composed county + council hash', () => {
    const filter = { county: 'greenville', type: 'council' as const };
    expect(parseFilterHash(filterHash(filter))).toEqual(filter);
  });
});

describe('eventTypeLabel', () => {
  it('labels each type', () => {
    expect(eventTypeLabel('meetup')).toBe('Location in group');
    expect(eventTypeLabel('public')).toBe('Public event');
    expect(eventTypeLabel('council')).toBe('Council meeting');
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/events-view.test.ts` — FAILS: `eventTypeLabel` is not exported; `{ county: 'all', type: 'council' }` is not assignable to `EventFilter` (`EventTypeFilter` lacks `council`); `filterHash`/`parseFilterHash` do not know `council`; and `facetCounts` returns no `council` key.

- [ ] **Step 3 — Implement.** In `src/lib/events-view.ts`:

(a) Add `council` to the slug map (line 251) and widen the type (line 253):

```ts
export const TYPE_SLUGS = { meetup: 'meetups', public: 'public', council: 'council' } as const;

export type EventTypeFilter = 'all' | 'meetup' | 'public' | 'council';
```

(b) Add `council` to the facet totals type (`FilterFacets.typeCounts`, line 315):

```ts
  /** Occurrences per type under the active *county* filter (type ignored). */
  typeCounts: { all: number; meetup: number; public: number; council: number };
```

(c) Compute it in `facetCounts` (the returned `typeCounts`, lines 339-344):

```ts
    typeCounts: {
      all: inCounty.length,
      meetup: inCounty.filter((o) => o.event.type === 'meetup').length,
      public: inCounty.filter((o) => o.event.type === 'public').length,
      council: inCounty.filter((o) => o.event.type === 'council').length,
    },
```

(d) Recognise the council slug in `parseFilterHash` (the `else if (key === 'type')` block, lines 385-388):

```ts
    else if (key === 'type') {
      if (value === TYPE_SLUGS.meetup) type = 'meetup';
      else if (value === TYPE_SLUGS.public) type = 'public';
      else if (value === TYPE_SLUGS.council) type = 'council';
    }
```

(e) Add `eventTypeLabel` immediately after `recurrenceLabel` (after line 166). `matchesFilter` itself is unchanged — `event.type !== filter.type` already excludes council from the `public` filter and isolates it under the `council` filter:

```ts
/**
 * The human type label shown on the card's quiet type line and in the popover.
 * The single source of truth for the three type labels, shared by the server
 * card (EventsList.astro) and the client card (buildCard) so they cannot drift.
 * The label always NAMES the type, so the type colour is reinforcing, never the
 * sole cue.
 */
export function eventTypeLabel(type: PublicEvent['type']): string {
  if (type === 'meetup') return 'Location in group';
  if (type === 'council') return 'Council meeting';
  return 'Public event';
}
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/events-view.test.ts` — PASS: the new council/label tests are green and the 4 updated `typeCounts` assertions pass; all other `events-view` tests are unaffected (the widened union and new slug are additive).

- [ ] **Step 5 — Commit.**
```
git add src/lib/events-view.ts src/lib/events-view.test.ts
git commit -m "feat(events): council type filter option + eventTypeLabel helper"
```

---

## Task 7 — Popover helpers: `upcomingOccurrences` + `upcomingFooter`

Two pure helpers for the popover "Upcoming meetings" list, composed from `expandOccurrences` so UTC + `MAX_OCCURRENCES` are inherited.

> **Signature note.** The design sketch wrote `upcomingOccurrences(startDate, recurrence, horizonIso, limit)`. Dropping past dates needs a "today" floor, so the implemented signature is `upcomingOccurrences(startDate, recurrence, todayIso, horizonEndIso, limit = 6)`. The popover passes the existing `island.horizonEnd` (today + 12 months) as the horizon and slices to `limit`, which reliably surfaces 6 dates even for a once-a-month cadence (a 4-month horizon would surface only ~4).

**Files**
- Modify: `src/lib/events-view.ts` (add `upcomingOccurrences` + `upcomingFooter`, after `eventTypeLabel`)
- Test: `src/lib/events-view.test.ts` (append `describe` blocks)

**Steps**

- [ ] **Step 1 — Write the failing test.** Add `upcomingOccurrences` and `upcomingFooter` to the import at the top of `src/lib/events-view.test.ts`, then append:

```ts
describe('upcomingOccurrences', () => {
  it('returns the next `limit` dates on/after today for a recurring event', () => {
    // Weekly from Sep 1; today is Sep 15, so Sep 1/8 drop off.
    expect(
      upcomingOccurrences('2026-09-01', { freq: 'weekly', until: null }, '2026-09-15', '2026-12-31'),
    ).toEqual(['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20']);
  });

  it('defaults to a limit of 6', () => {
    expect(
      upcomingOccurrences('2026-09-01', { freq: 'weekly', until: null }, '2026-09-01', '2026-12-31'),
    ).toHaveLength(6);
  });

  it('honours a custom limit', () => {
    expect(
      upcomingOccurrences('2026-09-01', { freq: 'weekly', until: null }, '2026-09-01', '2026-12-31', 3),
    ).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
  });

  it('returns the single date for a future one-off', () => {
    expect(upcomingOccurrences('2026-09-01', null, '2026-08-01', '2026-12-31')).toEqual(['2026-09-01']);
  });

  it('returns nothing for a past one-off', () => {
    expect(upcomingOccurrences('2026-08-01', null, '2026-09-01', '2026-12-31')).toEqual([]);
  });

  it('expands 1st & 3rd Monday in date order', () => {
    expect(
      upcomingOccurrences(
        '2026-09-07',
        { freq: 'monthly_nth', nths: [1, 3], until: null },
        '2026-09-07',
        '2026-12-31',
        4,
      ),
    ).toEqual(['2026-09-07', '2026-09-21', '2026-10-05', '2026-10-19']);
  });
});

describe('upcomingFooter', () => {
  it('is empty for a one-off event', () => {
    expect(upcomingFooter(null, 0)).toBe('');
  });

  it('names an indefinite series and how many are shown', () => {
    expect(upcomingFooter({ freq: 'monthly_nth', nths: [1, 3], until: null }, 6)).toBe(
      'Recurs indefinitely · showing the next 6',
    );
  });

  it('states the cadence for a bounded series', () => {
    expect(upcomingFooter({ freq: 'weekly', until: '2027-01-01' }, 4)).toBe('Repeats weekly');
    expect(upcomingFooter({ freq: 'monthly_nth', until: '2027-01-01' }, 4)).toBe('Repeats monthly');
  });
});
```

- [ ] **Step 2 — Run it, expect FAIL.** `npx vitest run src/lib/events-view.test.ts` — FAILS: `upcomingOccurrences` and `upcomingFooter` are not exported.

- [ ] **Step 3 — Implement.** In `src/lib/events-view.ts`, add after `eventTypeLabel`:

```ts
/**
 * The next `limit` occurrence dates on or after `todayIso` for an event, bounded
 * by `horizonEndIso`. Built on expandOccurrences, so it inherits the UTC
 * calendar-day discipline and the MAX_OCCURRENCES cap. A one-off event yields
 * its single date when it is today-or-later, else nothing. Powers the popover's
 * "Upcoming meetings" list.
 */
export function upcomingOccurrences(
  startDate: string,
  recurrence: PublicEvent['recurrence'],
  todayIso: string,
  horizonEndIso: string,
  limit = 6,
): string[] {
  return expandOccurrences(startDate, recurrence ?? null, horizonEndIso)
    .filter((date) => date >= todayIso)
    .slice(0, limit);
}

/**
 * The muted footer under the popover's upcoming list: the cadence in words for a
 * bounded series, or an "indefinite / showing the next N" line for a null-until
 * (council) series. Empty for a one-off event (which shows no list).
 */
export function upcomingFooter(
  recurrence: PublicEvent['recurrence'],
  shown: number,
): string {
  if (!recurrence) return '';
  if (recurrence.until === null) return `Recurs indefinitely · showing the next ${shown}`;
  return recurrence.freq === 'weekly' ? 'Repeats weekly' : 'Repeats monthly';
}
```

- [ ] **Step 4 — Run it, expect PASS.** `npx vitest run src/lib/events-view.test.ts` — PASS: the 9 new tests are green; the rest of the suite is unaffected.

- [ ] **Step 5 — Commit.**
```
git add src/lib/events-view.ts src/lib/events-view.test.ts
git commit -m "feat(events): upcomingOccurrences + upcomingFooter popover helpers"
```

---

## Task 8 — View wiring: council accent, 4th filter pill, popover upcoming list

Wire the council type into both render paths (server + client cards), add the 4th filter pill, add the blue council accent, and render the popover "Upcoming meetings" list. This is `.astro`/browser work; it is verified by a build check plus a precise manual pass (the underlying logic is already unit-tested in Tasks 6-7).

**Files**
- Modify: `src/components/EventsList.astro` (import `eventTypeLabel`, line 3; type line, lines 49-51 — card class at line 26 already interpolates `o.event.type`)
- Modify: `src/scripts/events-page.ts` (imports lines 35-63; `buildCard` lines 399-458; `openEventPopover` lines 552-631; `buildFilters` type radios lines 884-888; `syncChrome` value cast line 936; add an `upcomingDateLabel` helper)
- Modify: `src/pages/events.astro` (popover markup lines 216-233; global styles — council colour rules near lines 434-435 and 660-661, add upcoming-list styles)

**Steps**

- [ ] **Step 1 — Write the failing check (build).** Run the build; it must succeed once every edit below is in place. Before the edits it will fail to type-check because `syncChrome`'s `value` is cast to `'all' | 'meetup' | 'public'` while a fourth `council` radio now feeds it. Command:

```
node node_modules/astro/astro.js build
```

Expected FAIL (pre-edit) reason: TypeScript error in `events-page.ts` — `'council'` (the new radio's `data-filter-value`) is not assignable to the narrowed `value` union used to index `facets.typeCounts`.

- [ ] **Step 2 — (covered by Step 1)** The build IS the mechanical check for this view task; the DOM behaviour is verified manually in Step 4. Proceed to implement.

- [ ] **Step 3 — Implement.**

(a) `src/components/EventsList.astro` — import the label helper (line 3) and use it (lines 49-51). The card `class` at line 26 already interpolates `o.event.type`, so `event-card--council` is produced automatically:

Import line (line 3), add `eventTypeLabel`:
```astro
import { monthAbbr, dayOfMonth, formatTime12, sortKey, emptyStateProof, recurrenceLabel, eventTypeLabel } from '../lib/events-view.js';
```

Type line (replace lines 49-51):
```astro
          <p class="event-typeline">
            {eventTypeLabel(o.event.type)}{recurrenceLabel(o.event.recurrence) ? ` · ${recurrenceLabel(o.event.recurrence)}` : ''}
          </p>
```

(b) `src/scripts/events-page.ts` — extend the `events-view` import list (lines 35-55) to add `eventTypeLabel`, `upcomingOccurrences`, and `upcomingFooter`:
```ts
  parseFilterHash,
  emptyStateProof,
  eventTypeLabel,
  upcomingOccurrences,
  upcomingFooter,
} from '../lib/events-view.js';
```

Rewrite `buildCard` (lines 399-458) so the type class suffix is a closed three-way map (only known suffixes reach a class name) and the label comes from `eventTypeLabel`. Replace the two lines that compute `meetup`/`typeSuffix` and the `typeLabel` line:

At the top of `buildCard`, replace:
```ts
  const e = o.event;
  const meetup = e.type === 'meetup';
  // Closed ternary, not `--${e.type}`, so only the two known type suffixes can
  // ever reach a class name.
  const typeSuffix = meetup ? 'meetup' : 'public';
```
with:
```ts
  const e = o.event;
  // Closed ternary, not `--${e.type}`, so only the three known type suffixes can
  // ever reach a class name (amber meetup, green public, blue council).
  const typeSuffix = e.type === 'meetup' ? 'meetup' : e.type === 'council' ? 'council' : 'public';
```
and replace the typeline label line:
```ts
  const repeat = recurrenceLabel(e.recurrence);
  const typeLabel = meetup ? 'Location in group' : 'Public event';
  body.append(el('p', 'event-typeline', repeat ? `${typeLabel} · ${repeat}` : typeLabel));
```
with:
```ts
  const repeat = recurrenceLabel(e.recurrence);
  const typeLabel = eventTypeLabel(e.type);
  body.append(el('p', 'event-typeline', repeat ? `${typeLabel} · ${repeat}` : typeLabel));
```

In `openEventPopover` (lines 552-631): set a closed three-way `data-type`, use `eventTypeLabel`, and replace the old recurrence-badge population with the "Upcoming meetings" section. Keep `const meetup = e.type === 'meetup';` (the address branch reads it; council is not a meetup, so its address shows).

Replace the `data-type` + type-label block:
```ts
  detailDialog.dataset.type = meetup ? 'meetup' : 'public';
  const typeLabel = document.getElementById('event-detail-typelabel');
  if (typeLabel) typeLabel.textContent = meetup ? 'Location in group' : 'Public event';
```
with:
```ts
  // Closed three-way, so only the known values reach the attribute (amber
  // meetup, green public, blue council); the popover CSS keys the label colour
  // off it, and the label text always names the type.
  detailDialog.dataset.type = e.type === 'meetup' ? 'meetup' : e.type === 'council' ? 'council' : 'public';
  const typeLabel = document.getElementById('event-detail-typelabel');
  if (typeLabel) typeLabel.textContent = eventTypeLabel(e.type);
```

Replace the recurrence-badge block (the `const repeat = recurrenceLabel(e.recurrence); … recurrenceBadge.hidden = !repeat;` section) with the upcoming-meetings population:
```ts
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
        if (i === 0) row.append(el('span', 'event-pop-upcoming-next', 'Next'));
        upcomingList.append(row);
      });
      upcomingFoot.textContent = upcomingFooter(e.recurrence, dates.length);
      upcomingWrap.hidden = dates.length === 0;
    } else {
      upcomingWrap.hidden = true;
    }
  }
```

Add the `upcomingDateLabel` helper next to `fullDateLabel` (after line 543). It composes the already-tested zone-independent helpers (`weekdayIndex`, `monthLong`, `dayOfMonth`), so it needs no separate unit test:
```ts
/** 'Wednesday, Oct 14' for '2026-10-14'. Uses the same zone-independent helpers
 *  as fullDateLabel so the popover date never drifts a day. */
function upcomingDateLabel(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${monthLong(y, m).slice(0, 3)} ${dayOfMonth(iso)}`;
}
```

Add the 4th filter pill in `buildFilters` (the `seg.append(...)` at lines 884-888):
```ts
  seg.append(
    typeRadio('all', 'All'),
    typeRadio('meetup', 'Meetups'),
    typeRadio('public', 'Public events'),
    typeRadio('council', 'Council meetings'),
  );
```

Widen the `value` cast in `syncChrome` (line 936) so the four pills index `typeCounts`:
```ts
    const value = (btn.dataset.filterValue ?? 'all') as 'all' | 'meetup' | 'public' | 'council';
```

(c) `src/pages/events.astro` — popover markup, council colour rules, upcoming-list styles.

Popover markup: insert the upcoming section between the `</dl>` (line 225) and the description `<p>` (line 227), and REMOVE the now-redundant recurrence badge from the footer (its cadence is now covered by the upcoming footer). Insert after `</dl>`:
```astro
      <div class="event-pop-upcoming" id="event-detail-upcoming" hidden>
        <p class="event-pop-upcoming-label">Upcoming meetings</p>
        <ul class="event-pop-upcoming-list" id="event-detail-upcoming-list"></ul>
        <p class="event-pop-upcoming-foot" id="event-detail-upcoming-foot"></p>
      </div>
```
In the footer, replace:
```astro
      <div class="modal-action event-pop-foot">
        <span class="badge badge-sm badge-neutral mr-auto" id="event-detail-recurrence" hidden></span>
        <form method="dialog"><button class="btn btn-ghost btn-sm" type="submit">Close</button></form>
        <a class="btn btn-primary btn-sm" id="event-detail-signal" rel="noreferrer" hidden>Join Signal group</a>
      </div>
```
with:
```astro
      <div class="modal-action event-pop-foot">
        <form method="dialog" class="mr-auto"><button class="btn btn-ghost btn-sm" type="submit">Close</button></form>
        <a class="btn btn-primary btn-sm" id="event-detail-signal" rel="noreferrer" hidden>Join Signal group</a>
      </div>
```

Council card colour: after the `.event-card--public .event-typeline` rule (line 435), add:
```css
  .event-card--council .event-typeline { color: #60a5fa; }
```

Council popover-label colour: after the `#event-detail[data-type="public"] .event-pop-typeline` rule (line 661), add:
```css
  #event-detail[data-type="council"] .event-pop-typeline { color: #60a5fa; }
```

Remove the now-dead `#event-detail-recurrence[hidden]` rule (line 696). Then add the upcoming-list styles just before the reduced-motion block (before line 701):
```css
  /* --- Popover "Upcoming meetings" list ---
     Shown for any recurring event: a bordered list of the next few dates, the
     first tagged "Next", with a muted cadence/indefinite footer. Amber "Next"
     pill matches the site's emphasis idiom; contrast and a real <ul> keep it
     accessible with no reliance on colour. */
  .event-pop-upcoming { margin: 0 0 1.25rem; }
  .event-pop-upcoming[hidden] { display: none; }
  .event-pop-upcoming-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b6b6b;
    margin: 0 0 0.5rem;
  }
  .event-pop-upcoming-list { list-style: none; margin: 0; padding: 0; }
  .event-pop-upcoming-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #d4d4d4;
    font-size: 0.875rem;
    padding: 0.4rem 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .event-pop-upcoming-item:first-child { border-top: 0; }
  .event-pop-upcoming-next {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.5);
    border-radius: 2px;
    padding: 1px 5px;
  }
  .event-pop-upcoming-foot { color: #8a8a8a; font-size: 0.8125rem; margin: 0.5rem 0 0; }
```

- [ ] **Step 4 — Verify.**
  1. Build: `node node_modules/astro/astro.js build` — PASS (no TypeScript or Astro errors; the council merge and the strict schema validate the seed at build).
  2. Full unit suite: `npm test` — PASS (all lib tests green).
  3. Manual (dev server: `node node_modules/astro/astro.js dev --host 127.0.0.1`, open `http://127.0.0.1:4321/events`):
     - The two council cards (Greenville City Council, Columbia City Council) render with a BLUE type line reading `COUNCIL MEETING · REPEATS MONTHLY`.
     - The Type filter shows four pills in order: **All / Meetups / Public events / Council meetings**. Selecting **Council meetings** shows only the two council rows; **Public events** shows public rows and NOT council; arrow keys still move the radiogroup selection.
     - Clicking a council card opens the popover: the type label is blue and reads "Council meeting"; an **Upcoming meetings** list shows the next dates, the first tagged **Next**, with the footer **Recurs indefinitely · showing the next 6**. No console errors.
     - Loading `http://127.0.0.1:4321/events#type=council` opens pre-filtered to council meetings.
     - A one-off event's popover shows **no** upcoming list.

- [ ] **Step 5 — Commit.** (Stage only these three files — never `git add -A`, and never the untracked `public/dev-*.html` / `src/pages/dev/*` dev files.)
```
git add src/scripts/events-page.ts src/components/EventsList.astro src/pages/events.astro
git commit -m "feat(events): council accent, 4th filter pill, popover upcoming list"
```

---

## Task 9 — Toolkit link to council meetings

Add a "Find your council's next meeting" link to `/events#type=council` in the speaking guide.

**Files**
- Modify: `src/data/toolkit-speaking.json` (add a `findMeeting` object)
- Modify: `src/components/ToolkitSpeaking.astro` (render the link after the intro paragraph)

**Steps**

- [ ] **Step 1 — Write the failing check (build).** The verification is a build check plus a manual view check (a static Astro link is not usefully unit-testable). Command:
```
node node_modules/astro/astro.js build
```
Expected: builds today; after Step 3 the link must be present in the rendered speaking page.

- [ ] **Step 2 — (covered by Step 1).** Proceed to implement.

- [ ] **Step 3 — Implement.** In `src/data/toolkit-speaking.json`, add a top-level `findMeeting` key (place it right after the `intro` string, before `tips`):
```json
  "findMeeting": {
    "text": "Find your council's next meeting",
    "href": "/events#type=council"
  },
```

In `src/components/ToolkitSpeaking.astro`, render it inside the intro block, immediately after the intro paragraph (`<p class="text-[#d4d4d4] …">{speakingData.intro}</p>`, which closes at line 25) and before the numbered-tips `<div class="space-y-4">` (line 28):
```astro
  <a
    href={speakingData.findMeeting.href}
    class="inline-flex items-center gap-2 mb-8 label-mono-compact text-[#60a5fa] hover:text-[#93c5fd] border border-[rgba(96,165,250,0.35)] hover:border-[rgba(96,165,250,0.6)] px-4 py-2.5 transition-colors no-underline"
  >
    <span aria-hidden="true">→</span>
    {speakingData.findMeeting.text}
  </a>
```

- [ ] **Step 4 — Verify.**
  1. `node node_modules/astro/astro.js build` — PASS.
  2. Manual: open `http://127.0.0.1:4321/toolkit/speaking`; the intro shows the link "Find your council's next meeting"; clicking it lands on `/events#type=council` filtered to council meetings.

- [ ] **Step 5 — Commit.**
```
git add src/data/toolkit-speaking.json src/components/ToolkitSpeaking.astro
git commit -m "feat(toolkit): link the speaking guide to council meetings on /events"
```

---

## Self-review

Every spec requirement maps to a task, with types/signatures/names consistent across tasks:

| Spec item | Task(s) | Notes |
|---|---|---|
| 1. `Recurrence.until: string \| null` (submission unchanged) | Task 1 | `null` clamps only by horizon; `submissionSchema`/`recurrenceField` untouched (Task 3 leaves them). |
| 2. `monthly_nth` optional `nths` (absent = single nth; present = merged slots; `'last'`; startDate = occ #1, validated; UTC + `MAX_OCCURRENCES` preserved) | Task 2 | `resolveSlot`/`lastWeekdayOfMonth` added; anchor-inclusive loop; throw when startDate ∉ slots. |
| 3. `PublicEvent.type` +`'council'`, optional `source`, mirror recurrence, `'council'` in strict render schema; submission enum stays `meetup \| public` | Task 3 | `PublicEvent` widened; `source?: string \| null` (NOT in `PUBLIC_EVENT_FIELDS`, so `toPublicEvent`/its tests stay intact); `publicEventSchema` gains council + nullable `until` + `nths` + `source`. |
| 4. `council-events.ts` + test: strict `councilEventSchema`, `loadCouncilEvents()` → `PublicEvent[]` (type council, hasSignalGroup false, no signalUrl, required source, valid city/county), bad entry throws | Task 4 | `parseCouncilEvents` (pure) + `loadCouncilEvents`; county validated against `countyForCity(city)`; `.strict()` blocks smuggled fields. |
| 5. `council-meetings.json` with 2 provisional example entries; wire loader at the assembly point | Task 4 (empty file) + Task 5 (seed + merge) | Merge point identified precisely: `src/pages/events.astro` frontmatter, `bakedEvents.push(...loadCouncilEvents())` immediately after the dev-seed block (after line 77). PROVISIONAL note included. |
| 6. `matchesFilter` + 4th filter option (All/Meetups/Public/Council); `public` excludes council, `council` isolates, `all` all; ARIA + tabs-box kept | Task 6 (model) + Task 8 (pill) | `matchesFilter` needs no logic change (exact-type predicate already isolates); union/slug/facets widened; 4th `typeRadio('council', 'Council meetings')`; radiogroup reused. |
| 7. Blue council accent (#60a5fa) on card + popover, label "Council meeting"; both render paths, class-parity | Task 6 (`eventTypeLabel`) + Task 8 (CSS + both paths) | `.event-card--council .event-typeline` + `#event-detail[data-type="council"] .event-pop-typeline`; server (EventsList) + client (buildCard) share `eventTypeLabel`; buildCard suffix is a closed 3-way. |
| 8. Popover upcoming list: pure helper (default 6) unit-tested; bordered list, first "Next", cadence/indefinite footer; one-off shows none | Task 7 (helpers + tests) + Task 8 (render) | `upcomingOccurrences` (with a `todayIso` floor — signature note) + `upcomingFooter`; rendered in `openEventPopover`; old recurrence badge removed to avoid duplication. |
| 9. Toolkit link "Find your council's next meeting" → `/events#type=council` | Task 9 | Added to `toolkit-speaking.json` + rendered in `ToolkitSpeaking.astro`. |

- **Placeholder scan:** no `TBD`/`TODO`/`add validation`/`handle edge cases`/`similar to Task N`/`write tests for the above` appear in any implement step — every code block is complete.
- **Type/name consistency:** `Recurrence`/`PublicEvent['recurrence']`/`publicEventSchema.recurrence`/`councilRecurrenceSchema` all agree on `{ freq; until: string \| null; nths?: Array<1|2|3|4|5|'last'> }`. `EventTypeFilter`, `TYPE_SLUGS`, `FilterFacets.typeCounts`, and the `syncChrome` cast all carry `council`. `eventTypeLabel`, `upcomingOccurrences`, `upcomingFooter`, `parseCouncilEvents`, `loadCouncilEvents`, and `councilEventSchema` are each defined once and referenced with matching signatures. Existing tests that would break under the additive changes (four `typeCounts` assertions in `events-view.test.ts`) are updated in Task 6; `public-event.test.ts`'s 13-field allowlist is deliberately preserved by keeping `source` out of `PUBLIC_EVENT_FIELDS`.
- **Preserved invariants:** UTC calendar-day arithmetic and the `MAX_OCCURRENCES` bound in `recurrence.ts`; the submission path (`submissionSchema` enum `meetup | public`, honeypot/code-gate/blob untouched); `toPublicEvent` confidentiality projection; council entries carry no `signalUrl` and no `/go`.
