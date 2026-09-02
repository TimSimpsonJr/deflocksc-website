# Events Month View (Cally) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the events Month view's fixed 7-column title grid (unusable at phone widths — titles wrap one character per line) with the Cally `<calendar-date>` web component showing day numbers, an amber dot on meeting-days, and an agenda of the selected day's meetings below it. Implements `docs/plans/2026-09-01-events-month-cally-design.md` exactly.

**Architecture:** `EventsMonth.astro` becomes static scaffolding (a Cally calendar + empty agenda containers); all month-view data work moves to the client in `src/scripts/events-page.ts`, driven by three new pure, unit-tested helpers in `src/lib/events-view.ts` (`groupByDate`, `nextMeetingDay`, `callyDayIso`). The agenda card reuses the list card's interactive contract (`.event-title-btn` → shared popover, `.event-share-inline` → share), so the popover and share features come for free via a delegated handler that mirrors `#events-list`'s. An accessibility layer makes the visual affordances non-visual too: sr-only slotted text names Cally's shadow nav buttons, a visually-hidden summary lists the visible month's meeting-days (the amber dots' accessible equivalent, refreshed via Cally's `focusday` event), and a polite live region announces each selected day + meeting count. The List view stays server-rendered as the no-JS fallback; the data/recurrence layer is untouched.

**Tech Stack:** Astro 5, TypeScript, Cally 0.9.2 (already a dependency — `SubmitEventForm.astro` uses it), vitest (node environment — **no jsdom**, so DOM/Cally work is verified by typecheck + build + manual browser checks, never faked unit tests), Tailwind/plain CSS in `EventsExplorer.astro`'s `<style is:global>`.

---

## Recorded baselines (measured 2026-09-01 on `master` @ 55574e7)

Every task's verification is judged against these. **Do not chase pre-existing failures.**

- **Tests:** `npm test` → `Test Files 32 passed (32)`, `Tests 794 passed (794)`.
- **Typecheck:** `node node_modules/typescript/bin/tsc --noEmit` exits non-zero with **exactly these 14 pre-existing errors** (use `npx` nowhere — it is flaky on this machine; always the full `node node_modules/typescript/bin/tsc` form):
  1. `astro.config.mjs(29,15): error TS2322`
  2. `src/lib/geo-utils.test.ts(30,33): error TS2345`
  3. `src/lib/geo-utils.test.ts(34,35): error TS2345`
  4. `src/lib/geo-utils.test.ts(38,33): error TS2345`
  5. `src/lib/geo-utils.test.ts(42,33): error TS2345`
  6. `src/lib/geo-utils.test.ts(46,33): error TS2345`
  7. `src/lib/geo-utils.test.ts(50,35): error TS2345`
  8. `src/lib/geo-utils.test.ts(54,35): error TS2345`
  9. `src/lib/geo-utils.test.ts(78,30): error TS2345`
  10. `src/lib/geo-utils.test.ts(94,30): error TS2345`
  11. `src/lib/geo-utils.test.ts(105,30): error TS2345`
  12. `src/lib/geo-utils.test.ts(125,30): error TS2345`
  13. `src/pages/blog/[...slug]/og.png.ts(17,23): error TS2345`
  14. `src/scripts/events-page.ts(70,36): error TS7016` (accessible-autocomplete has no types)
- **Build:** `npm run build` → exit 0, `21 page(s) built`.

**Branch:** work on `feature/events-month-cally` (create from `master` if the worktree is not already on it). Every commit message ends with the trailer:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## Design decisions resolved during planning (deviations are flagged, not silent)

1. **Dot colour is literal `#fbbf24`, not `var(--color-accent)`.** The design's CSS snippet says `background: var(--color-accent); /* amber */`, but the shared `.deflock-calendar` theme in `src/styles/global.css` binds `--color-accent` to `#dc2626` — the RED selected-day fill. The design's own prose ("single amber dot") wins; `#fbbf24` is the site's amber, used throughout `EventsExplorer.astro`.
2. **Prev/next slots are SVG chevrons plus sr-only text, not `<button slot>` elements.** Cally's shadow DOM already renders the prev/next controls as buttons (`part="button previous/next"`); slotting a `<button>` would nest interactive elements (invalid HTML). The SVG matches the existing in-repo Cally usage (`SubmitEventForm.astro:136-144`), and each slot ALSO carries a visually-hidden `<span class="sr-only">` ("Previous month" / "Next month") alongside the aria-hidden SVG — a slot accepts multiple assigned nodes — so the shadow buttons get accessible names. `sr-only` is the repo's visually-hidden idiom (EventsExplorer.astro's popover markup, `el('span', 'sr-only', …)` in events-page.ts).
3. **`first-day-of-week="0"` is set — the kebab-case attribute.** Atomico observes the hyphenated attribute name; a camelCase attribute in HTML parses lowercased to an unobserved `firstdayofweek` and silently does nothing. This keeps the Sunday-first week the replaced grid used (its DOW header was `S M T W T F S`); the design markup is silent on week start.
4. **The dot CSS lives in `EventsExplorer.astro`** (the design allowed either file). The selector names the shared `calendar-month.deflock-month`, but only the events calendar's `getDayParts` ever assigns the `has-events` part, so the submit form's date picker cannot match it.
5. **`focusListCard` is deleted along with the month-chip handler** — the chip handler was its only caller (verified by grep; the deep-link resolver does its own scroll).
6. **The by-date map is built from the FILTERED, uncollapsed upcoming set** (`upcomingFor(filterEvents(allEvents, filter))`). The design's data-flow bullet says "the full upcoming set (`upcomingFor(allEvents)`)" where "full" contrasts with *collapsed* (the list view), not with *filtered*: its own refresh bullet requires "if the filter removes the selected day's only meetings, show the empty line", and the grid this replaces rendered the filtered set in `applyFilter`.
7. **The meeting-day summary refreshes on `focusday`, not `pagechange`.** The installed — and latest released — cally 0.9.2 dispatches only `change`, `focusday`, `selectday`, `hoverday`, `rangestart`, and `rangeend`; **`pagechange` does not exist in any released cally** (verified by grepping `node_modules/cally/dist/cally.js` for dispatched event names and by `npm view cally time` — 0.9.2, 2026-02-05, is the newest version; `pagechange` appears only in the unreleased main branch's docs). The design's intent survives intact: cally 0.9.2 routes every ‹ › page through its internal `goto()`, which dispatches `focusday` carrying a `Date` inside the newly visible month (source-verified), so a `focusday` listener refreshes the visually-hidden summary on paging — and, per the settled behavior, that listener never touches the selection.
8. **Cally ships its own TypeScript declarations** (`dist/cally.d.ts`, including `declare global` `HTMLElementTagNameMap` entries for `calendar-date`/`calendar-month` with typed `value`/`min`/`max`/`focusedDate`/`getDayParts`). The controller aliases `HTMLElementTagNameMap['calendar-date']` rather than hand-rolling an interface; the alias exists only because the compound selector `'#panel-month calendar-date'` defeats `querySelector`'s tag-name inference.
9. **`callyDayIso` reads with UTC getters — source-verified, not assumed:** cally builds every outgoing `Date` as `new Date(Date.UTC(year, month - 1, day))` (its internal PlainDate→Date converter in `dist/cally.js`), so local getters would report the previous calendar day anywhere west of Greenwich (Eastern time included) and land every meeting dot a day early.

---

## Task 1 — Pure helpers: `groupByDate` + `nextMeetingDay` + `callyDayIso`, drop dead `groupByMonth` (TDD)

**Files:**
- `src/lib/events-view.test.ts`
- `src/lib/events-view.ts`

- [ ] 1. **Write the failing tests.** In `src/lib/events-view.test.ts`, add `groupByDate` and `nextMeetingDay` to the import list from `'./events-view.js'` (after `deepLinkAction,` on line 29):

    ```ts
      deepLinkAction,
      groupByDate,
      nextMeetingDay,
      callyDayIso,
    ```

- [ ] 2. Append these three describe blocks at the very end of `src/lib/events-view.test.ts` (after the closing `});` of `describe('deepLinkAction')`):

    ```ts
    describe('groupByDate', () => {
      const occ = (event: PublicEvent, date: string): Occurrence => ({ event, date });

      it('buckets occurrences by their real date', () => {
        const a = ev({ id: 'e1111111' });
        const b = ev({ id: 'e2222222' });
        const map = groupByDate([occ(a, '2026-09-01'), occ(b, '2026-09-03')]);
        expect([...map.keys()]).toEqual(['2026-09-01', '2026-09-03']);
        expect(map.get('2026-09-01')!.map((o) => o.event.id)).toEqual(['e1111111']);
        expect(map.get('2026-09-03')!.map((o) => o.event.id)).toEqual(['e2222222']);
      });

      it('keeps multiple occurrences on one day in input order', () => {
        const early = ev({ id: 'e1111111', time: '09:00' });
        const late = ev({ id: 'e2222222', time: '19:00' });
        const map = groupByDate([occ(early, '2026-09-05'), occ(late, '2026-09-05')]);
        expect(map.get('2026-09-05')!.map((o) => o.event.id)).toEqual(['e1111111', 'e2222222']);
      });

      it('gives a recurring series one bucket per occurrence date', () => {
        const weekly = ev({
          id: 'gvweekly',
          date: '2026-09-01',
          recurrence: { freq: 'weekly', until: '2026-09-15' },
        });
        const map = groupByDate(expandAll([weekly], '2027-09-01'));
        expect([...map.keys()]).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
      });

      it('returns an empty map for no occurrences', () => {
        expect(groupByDate([]).size).toBe(0);
      });
    });

    describe('nextMeetingDay', () => {
      const occ = (date: string): Occurrence => ({ event: ev(), date });
      const mapOf = (...dates: string[]) => groupByDate(dates.map(occ));

      it('returns fromIso itself when that day has events', () => {
        expect(nextMeetingDay(mapOf('2026-09-01', '2026-09-05'), '2026-09-01')).toBe('2026-09-01');
      });

      it('returns the next day with events when fromIso has none', () => {
        expect(nextMeetingDay(mapOf('2026-09-05', '2026-09-09'), '2026-09-02')).toBe('2026-09-05');
      });

      it('ignores days before fromIso', () => {
        expect(nextMeetingDay(mapOf('2026-08-20', '2026-09-05'), '2026-09-01')).toBe('2026-09-05');
      });

      it('returns null when every event day is before fromIso', () => {
        expect(nextMeetingDay(mapOf('2026-08-20', '2026-08-25'), '2026-09-01')).toBeNull();
      });

      it('returns null for an empty map', () => {
        expect(nextMeetingDay(new Map(), '2026-09-01')).toBeNull();
      });

      it('does not depend on the map insertion order', () => {
        const map = new Map<string, Occurrence[]>([
          ['2026-09-09', [occ('2026-09-09')]],
          ['2026-09-05', [occ('2026-09-05')]],
        ]);
        expect(nextMeetingDay(map, '2026-09-01')).toBe('2026-09-05');
      });
    });

    describe('callyDayIso', () => {
      it('reads a UTC-midnight Date as its UTC calendar day', () => {
        // Cally constructs every callback Date as new Date(Date.UTC(...));
        // local getters would report Aug 31 anywhere west of Greenwich and
        // land every meeting dot a day early.
        expect(callyDayIso(new Date(Date.UTC(2026, 8, 1)))).toBe('2026-09-01');
      });

      it('pads single-digit months and days', () => {
        expect(callyDayIso(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
      });

      it('holds at the year boundary', () => {
        expect(callyDayIso(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31');
      });
    });
    ```

- [ ] 3. **Run the tests; expect FAIL.** Run:

    ```
    npm test -- src/lib/events-view.test.ts
    ```

    Expected: the file fails to run (or every new test fails) with an error naming one of the missing exports (`groupByDate`, `nextMeetingDay`, `callyDayIso`), e.g. `SyntaxError: The requested module './events-view.js' does not provide an export named 'groupByDate'`. If it passes, STOP — something is wrong.

- [ ] 4. **Implement.** In `src/lib/events-view.ts`, replace the entire `groupByMonth` function AND its doc comment (lines 310–325 — from `/**` above `Group occurrences by calendar month` through the `}` that closes `groupByMonth`) with:

    ```ts
    /**
     * Group occurrences by their exact calendar date, keyed 'YYYY-MM-DD'.
     *
     * The month view's client model: the calendar's getDayParts marks the map's
     * keys with the has-events dot, and the day agenda renders the map's values
     * for the selected date. Values keep input order, so a sorted input
     * (expandAll order) yields each day's occurrences already sorted by time.
     */
    export function groupByDate(
      occurrences: readonly Occurrence[],
    ): Map<string, Occurrence[]> {
      const out = new Map<string, Occurrence[]>();
      for (const o of occurrences) {
        const bucket = out.get(o.date);
        if (bucket) bucket.push(o);
        else out.set(o.date, [o]);
      }
      return out;
    }

    /**
     * The first day on/after `fromIso` that has events, or null when none does.
     * Drives the month view's default selection: today if it has meetings, else
     * the next day that does (the caller falls back to today on null). Scans the
     * keys rather than trusting the map's insertion order, so an unsorted map
     * still answers correctly. ISO date strings compare lexically, so no Date.
     */
    export function nextMeetingDay(
      byDate: ReadonlyMap<string, Occurrence[]>,
      fromIso: string,
    ): string | null {
      let best: string | null = null;
      for (const day of byDate.keys()) {
        if (day < fromIso) continue;
        if (best === null || day < best) best = day;
      }
      return best;
    }

    /**
     * The ISO 'YYYY-MM-DD' day for a Date the Cally calendar hands to its
     * callbacks (getDayParts, the focusday event detail). Cally constructs
     * those Dates at UTC midnight — new Date(Date.UTC(...)) — so the UTC
     * getters are the only safe read: local getters would report the PREVIOUS
     * day anywhere west of Greenwich (Eastern time included), landing every
     * meeting dot a day early.
     */
    export function callyDayIso(d: Date): string {
      return isoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    ```

    (This adds the three new helpers and removes the dead `groupByMonth`, whose docstring falsely claimed `EventsMonth.astro` uses it. Grep confirmed no test and no import references `groupByMonth`. `isoDate(year, monthIndex0, day)` is defined earlier in this same file — its second parameter is 0-based, matching `getUTCMonth()`.)

- [ ] 5. **Fold-in comment fix.** Still in `src/lib/events-view.ts`, the `parseEventIdHash` doc comment references the month chips this feature removes. Change these lines of that docstring:

    ```ts
     * Reserved in-page anchors (#main-content, the month chips' #event-<id> hrefs)
     * deliberately parse to a token: the id lookup downstream is the real guard,
     * and those tokens simply match no event.
    ```

    to:

    ```ts
     * Reserved in-page anchors (#main-content, stale #event-<id> links from the
     * removed month chips) deliberately parse to a token: the id lookup downstream
     * is the real guard, and those tokens simply match no event.
    ```

- [ ] 6. **Run the tests; expect PASS.** Run:

    ```
    npm test -- src/lib/events-view.test.ts
    ```

    Expected: `1 passed` test file, all tests green (the file previously held its share of the 794; it now runs 13 more, all passing).

- [ ] 7. **Typecheck.** Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: exactly the 14 baseline errors, none in `src/lib/events-view.ts` or `src/lib/events-view.test.ts`.

- [ ] 8. **Commit:**

    ```
    git add src/lib/events-view.ts src/lib/events-view.test.ts
    git commit -m "feat(events): add groupByDate, nextMeetingDay + callyDayIso; drop dead groupByMonth

    Pure view-model for the Cally month calendar: a by-date occurrence map
    (dots + agenda), the default-day pick (today, else the next day with
    meetings), and the UTC-safe Cally Date->ISO conversion (Cally hands
    callbacks UTC-midnight Dates; local getters would shift a day west of
    Greenwich). groupByMonth was exported but imported nowhere.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

## Task 2 — `EventsMonth.astro`: replace the grid with the Cally calendar + agenda scaffold (manual-verify)

**Files:**
- `src/components/EventsMonth.astro`

- [ ] 1. Replace the ENTIRE contents of `src/components/EventsMonth.astro` (frontmatter and template — the whole file) with:

    ```astro
    ---
    // The Month view: a Cally <calendar-date> plus the selected day's agenda.
    //
    // Static scaffolding only. Cally is a web component (registered by the
    // side-effect `import 'cally'` in src/scripts/events-page.ts), so with
    // JavaScript off it never upgrades and this panel stays empty — accepted:
    // the List panel is the no-JS view, and the tab bar that reaches this
    // panel is itself JS. The client controller (events-page.ts) sets
    // min/max/value/focusedDate, marks meeting-days via getDayParts (the
    // `has-events` shadow part gets the amber dot), and renders the agenda.
    //
    // The calendar reuses the deflock-calendar / deflock-month dark theme from
    // src/styles/global.css — the same theme the submit form's date picker
    // uses. Cally's own shadow buttons carry the previous/next slots, so the
    // slotted content is an icon plus text, never a nested <button>: the
    // aria-hidden SVG draws the chevron and the sr-only span gives the shadow
    // button its accessible name (a slot accepts multiple assigned nodes).
    // first-day-of-week="0" — the kebab attribute Atomico observes; camelCase
    // in HTML lowercases to an unobserved name — keeps the Sunday-first week
    // of the old grid's S M T W T F S header.
    //
    // Accessibility scaffolding, filled by events-page.ts:
    //  - #events-cal-summary: sr-only list of the visible month's meeting
    //    days — the accessible equivalent of the amber dots, refreshed on
    //    load, on filter/overlay refresh, and on month paging (focusday).
    //  - #events-agenda-head: a real <h3> that labels the agenda list.
    //  - #events-agenda-status: polite live region announcing each selected
    //    day + its meeting count.
    ---

    <div class="events-cal-wrap">
      <calendar-date class="deflock-calendar events-cal" months="1" first-day-of-week="0">
        <span slot="previous" class="sr-only">Previous month</span>
        <svg slot="previous" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6"></path>
        </svg>
        <span slot="next" class="sr-only">Next month</span>
        <svg slot="next" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"></path>
        </svg>
        <calendar-month class="deflock-month"></calendar-month>
      </calendar-date>
      <p class="sr-only" id="events-cal-summary"></p>
      <div class="events-agenda" id="events-agenda">
        <h3 class="events-agenda-head" id="events-agenda-head"></h3>
        <p class="sr-only" id="events-agenda-status" aria-live="polite"></p>
        <ul class="events-agenda-list" id="events-agenda-list" aria-labelledby="events-agenda-head"></ul>
        <p class="events-agenda-empty" id="events-agenda-empty" hidden>No meetings this day.</p>
      </div>
    </div>
    ```

    Note the old file's imports (`monthLong`, `daysInMonth`, `weekdayIndex`, `isoDate`, `formatTime12`, `sortKey`), its `Props` interface, and the `byDay` pre-render all go — the component now takes no props. (`EventsExplorer.astro` still passes props at this point; with no `Props` interface Astro ignores them, and Task 3 removes them.)

- [ ] 2. **Typecheck.** Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: exactly the 14 baseline errors.

- [ ] 3. **Build.** Run `npm run build`. Expected: exit 0, `21 page(s) built`. (The Month panel is intentionally inert until Task 4 wires the client — do not chase that in the browser yet.)

- [ ] 4. **Commit:**

    ```
    git add src/components/EventsMonth.astro
    git commit -m "feat(events): replace the month day-cell grid with a Cally calendar scaffold

    Static <calendar-date months=1 first-day-of-week=0> (deflock theme,
    chevron slots with sr-only button names) plus the agenda containers the
    client controller fills: an h3 head labelling the list, a polite live
    region for day announcements, and an sr-only meeting-day summary (the
    dots' accessible equivalent). The server byDay pre-render and all props
    are gone; the panel is client-rendered by design (List stays the no-JS
    view).

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

## Task 3 — `EventsExplorer.astro`: swap the month CSS, drop the props (manual-verify)

**Files:**
- `src/components/EventsExplorer.astro`

- [ ] 1. Change the month panel render (line ~142) from:

    ```astro
          <EventsMonth occurrences={upcoming} today={today} cityNames={cityNames} />
    ```

    to:

    ```astro
          <EventsMonth />
    ```

    (`upcoming`, `today`, and `cityNames` all remain used elsewhere in the frontmatter — do not remove them.)

- [ ] 2. In the `<style is:global>` block, replace the ENTIRE `/* --- Month grids --- */` section (lines ~518–554: the rules for `.events-months`, `.month-title`, `.month-dow`, `.month-grid`, `.month-dow span`, `.month-cell`, `.month-cell-empty`, `.month-cell-today`, `.month-daynum`, `.month-chips`, `.month-chip`, `.month-chip:hover`, `.month-chip:focus-visible`, `.month-chip-title`) with:

    ```css
      /* --- Month view: Cally calendar + day agenda ---
         The calendar is the Cally <calendar-date> web component (registered by
         events-page.ts via `import 'cally'`), themed by the shared
         .deflock-calendar / .deflock-month ::part() rules in global.css. Here
         live the wrapper card, the meeting-day dot, and the agenda the client
         renders below the calendar — global on purpose, like everything else
         in this sheet: agenda cards are runtime-created nodes. */
      .events-cal-wrap {
        background: #1a1a1a;
        border: 1px solid rgba(255, 255, 255, 0.07);
        padding: 1rem;
      }
      .events-cal {
        display: block;
        width: fit-content;
        margin-inline: auto;
      }
      /* Meeting-day dot: a small amber marker under the day number, on the
         `has-events` shadow part that events-page.ts's getDayParts assigns.
         Literal #fbbf24 (the site's amber emphasis colour) — NOT
         var(--color-accent), which the shared .deflock-calendar theme binds
         to the RED selected-day fill (#dc2626). Only the events calendar ever
         assigns this part, so the shared .deflock-month selector cannot leak
         into the submit form's date picker. */
      calendar-month.deflock-month::part(button has-events) {
        position: relative;
      }
      calendar-month.deflock-month::part(button has-events)::after {
        content: "";
        position: absolute;
        bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #fbbf24;
      }

      /* The selected day's agenda, below the calendar. The compact agenda card
         reuses the list card's interactive contract (.event-title-btn opens the
         shared popover, .event-share-inline shares) and the event-card--{type}
         typeline colour cue; it drops the left date block — the agenda head
         already names the day — and leads with the time instead. */
      .events-agenda {
        margin-top: 1.25rem;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        padding-top: 1rem;
      }
      .events-agenda-head { color: #e8e8e8; font-weight: 700; font-size: 0.95rem; margin: 0 0 0.75rem; }
      .events-agenda-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
      .events-agenda-empty { color: #a3a3a3; font-size: 0.9rem; margin: 0; }
      .events-agenda-empty[hidden] { display: none; }
      .agenda-card {
        background: #171717;
        border: 1px solid rgba(255, 255, 255, 0.07);
        padding: 0.85rem 1rem;
      }
      .agenda-time {
        font-family: 'Instrument Sans Variable', sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #e8e8e8;
        font-variant-numeric: tabular-nums;
        margin: 0 0 0.25rem;
      }
      .agenda-card .event-title { font-size: 1rem; margin: 0 0 0.25rem; }
      .agenda-card .event-meta { margin: 0; }
      .agenda-card .event-actions { margin: 0.6rem 0 0; }
    ```

- [ ] 3. Update the style block's opening comment (lines ~273–276) — change

    ```
      /* Every rule for event cards, month chips, and tabs is global on purpose.
    ```

    to

    ```
      /* Every rule for event cards, agenda cards, and tabs is global on purpose.
    ```

- [ ] 4. Update the homepage month-panel cap comment (the block comment above `.events-explorer--home #panel-month`, lines ~870–878). Replace that entire comment (from `/* Homepage variant: cap ONLY the month panel's height` through `bounded by row COUNT instead. */`) with:

    ```css
      /* Homepage variant: cap ONLY the month panel's height with its own scroll.
         The LIST is hard-capped to 6 rows in markup (EventsList's slice) and in
         the client controller (events-page.ts), so it needs no scroll cap — the
         "See all events" link is the way to the rest. #panel-month (the Cally
         calendar plus the selected day's agenda, which grows with a busy day)
         keeps a viewport-relative scroll cap here. */
    ```

    Leave the `.events-explorer--home #panel-month { ... }` rule itself unchanged.

- [ ] 5. **Typecheck + build.** Run `node node_modules/typescript/bin/tsc --noEmit` (expect exactly the 14 baseline errors) and `npm run build` (expect exit 0, 21 pages).

- [ ] 6. **Manual check (limited on purpose):** `npm run dev`, open `http://localhost:4321/events`, confirm the **List** tab still renders the full card list and the type filter still works. The Month tab is still inert (Cally unregistered until Task 4) — expected.

- [ ] 7. **Commit:**

    ```
    git add src/components/EventsExplorer.astro
    git commit -m "feat(events): restyle the month panel for the Cally calendar + agenda

    Removes every .month-* grid/chip rule; adds .events-cal-wrap, the
    has-events amber day dot (::part pseudo-element), and the compact
    .agenda-card styles that reuse the list card's interactive classes.
    EventsMonth now takes no props.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

## Task 4 — `events-page.ts`: wire the calendar, agenda, and refresh; delete the chip code (manual-verify)

**Files:**
- `src/scripts/events-page.ts`

- [ ] 1. Update the module doc comment (lines 1–23): change the sentence beginning `The list and month views are server-rendered` (lines 4–5) from:

    ```ts
     * The list and month views are server-rendered from src/data/events.json, so the
     * page is complete with JavaScript off. This module only patches that markup:
    ```

    to:

    ```ts
     * The list view is server-rendered from src/data/events.json, so the page is
     * complete with JavaScript off (the month view is a client-rendered Cally
     * calendar; List is the no-JS view). This module patches the list markup:
    ```

- [ ] 2. Add the Cally side-effect import. Immediately after the closing `*/` of the module doc comment (before `import type { PublicEvent }`), insert:

    ```ts
    // Registers the <calendar-date>/<calendar-month> web components the Month
    // view's calendar uses (side-effect import, same as SubmitEventForm's date
    // picker). Without it the EventsMonth scaffold never upgrades.
    import 'cally';
    ```

- [ ] 3. Extend the `../lib/events-view.js` import list: after the line `  deepLinkAction,` add:

    ```ts
      groupByDate,
      nextMeetingDay,
      callyDayIso,
    ```

- [ ] 4. Replace the ENTIRE "Month chip -> list card" section (lines ~365–402: the section comment, the `focusListCard` function, and the `document.getElementById('panel-month')?.addEventListener('click', …)` block — `focusListCard` has no other caller) with the month-view controller:

    ```ts
    // --- Month view: Cally calendar + day agenda -----------------------------
    // The Month panel is a Cally <calendar-date> (markup in EventsMonth.astro,
    // registered by the `import 'cally'` above) plus an agenda of the selected
    // day's meetings. This module owns all of its data: a by-date occurrence map
    // marks meeting-days via getDayParts (the CSS paints the `has-events` part's
    // amber dot) and fills the agenda for the day the visitor taps. Month
    // navigation (Cally's native ‹ ›) pages the calendar WITHOUT touching the
    // selection; Cally re-invokes getDayParts for the newly shown days on every
    // page, so the dots need no page listener. The `focusday` listener below
    // exists solely for the sr-only meeting-day summary: this cally release
    // has no pagechange event, but every ‹ › page dispatches focusday with a
    // Date inside the newly visible month.

    // Cally ships its own TypeScript declarations, including the global
    // HTMLElementTagNameMap entries; alias the mapped element type because the
    // compound selector below defeats querySelector's tag-name inference.
    type CalendarDateElement = HTMLElementTagNameMap['calendar-date'];

    const monthCal = document.querySelector<CalendarDateElement>('#panel-month calendar-date');

    /** Every upcoming occurrence under the active filter, keyed by ISO date.
     *  Rebuilt by refreshMonthView on every filter change and overlay merge. */
    let byDate = new Map<string, Occurrence[]>();

    /** The agenda's selected day. Set at init (today, else the next meeting
     *  day), then only by the calendar's change event — month paging never
     *  moves it, so the agenda keeps showing the last day tapped. */
    let selectedDay: string | null = null;

    /** The visible month ('YYYY-MM'), for the sr-only meeting-day summary.
     *  Seeded from the initial selection (months="1", so the visible month is
     *  the focused day's month); updated by the focusday listener. */
    let visibleMonth: string | null = null;

    /** A compact agenda card: time-first, no left date block (the agenda head
     *  already names the day, so a per-row date would be redundant). Reuses the
     *  list card's interactive contract — .event-title-btn opens the shared
     *  popover, .event-share-inline shares — so the delegated
     *  #events-agenda-list handler mirrors #events-list's, and the
     *  event-card--{type} modifier keys the typeline colour exactly as
     *  buildCard does. Every event string goes through textContent. */
    function buildAgendaCard(o: Occurrence): HTMLLIElement {
      const e = o.event;
      const li = document.createElement('li');
      li.className = `agenda-card event-card--${eventTypeSlug(e.type)}`;
      li.dataset.eventId = e.id;
      li.dataset.date = o.date;

      li.append(el('p', 'agenda-time', formatTime12(e.time)));

      const heading = el('h3', 'event-title');
      const titleBtn = el('button', 'event-title-btn', e.title) as HTMLButtonElement;
      titleBtn.type = 'button';
      titleBtn.setAttribute('aria-haspopup', 'dialog');
      heading.append(titleBtn);
      li.append(heading);

      // The visible date lives in the agenda head, outside this card; keep an
      // sr-only date here so a screen reader landing on the card still hears
      // which day it belongs to (mirrors buildCard's aria-hidden date panel).
      const meta = el('p', 'event-meta');
      meta.append(el('span', 'sr-only', `${o.date} `), document.createTextNode(placeLabel(e)));
      li.append(meta);

      const repeat = recurrenceLabel(e.recurrence);
      const typeLabel = eventTypeLabel(e.type);
      const actions = el('div', 'event-actions');
      actions.append(el('p', 'event-typeline', repeat ? `${typeLabel} · ${repeat}` : typeLabel));
      const share = el('button', 'event-share-inline') as HTMLButtonElement;
      share.type = 'button';
      share.setAttribute('aria-label', `Share ${e.title}`);
      share.append(shareIcon(), document.createTextNode('Share'));
      actions.append(share);
      li.append(actions);

      return li;
    }

    /** Render the agenda for the selected day: the day's full name, its
     *  meetings, or the "No meetings this day." line. The polite live region
     *  (#events-agenda-status) gets "date — N meetings" so each selection —
     *  including the initial default day — is announced without re-reading
     *  the visible heading awkwardly. */
    function renderAgenda(): void {
      const head = document.getElementById('events-agenda-head');
      const list = document.getElementById('events-agenda-list');
      const empty = document.getElementById('events-agenda-empty');
      const status = document.getElementById('events-agenda-status');
      if (!head || !list || !empty) return;
      if (!selectedDay) {
        head.textContent = '';
        list.replaceChildren();
        empty.hidden = true;
        if (status) status.textContent = '';
        return;
      }
      const dayLabel = fullDateLabel(selectedDay);
      head.textContent = dayLabel;
      const occurrences = byDate.get(selectedDay) ?? [];
      list.replaceChildren(...occurrences.map(buildAgendaCard));
      empty.hidden = occurrences.length > 0;
      if (status) {
        status.textContent =
          occurrences.length === 0
            ? `${dayLabel} — no meetings`
            : `${dayLabel} — ${occurrences.length} ${occurrences.length === 1 ? 'meeting' : 'meetings'}`;
      }
    }

    /** Rebuild the sr-only summary of the visible month's meeting-days — the
     *  accessible equivalent of the amber dots, which are visual-only. */
    function renderCalSummary(): void {
      const summary = document.getElementById('events-cal-summary');
      if (!summary || !visibleMonth) return;
      const monthName = monthLong(
        Number(visibleMonth.slice(0, 4)),
        Number(visibleMonth.slice(5, 7)) - 1,
      );
      const days = [...byDate.keys()]
        .filter((day) => day.slice(0, 7) === visibleMonth)
        .sort()
        .map((day) => dayOfMonth(day));
      summary.textContent =
        days.length === 0
          ? 'No meetings shown this month.'
          : `Meetings this month on ${monthName} ${days.join(', ')}.`;
    }

    /** Rebuild the by-date map from `occurrences` (the active filter's upcoming
     *  set, NOT collapsed — every occurrence of a recurring series keeps its
     *  dot), re-mark the calendar, and re-render the agenda + summary. Assigning
     *  getDayParts a FRESH closure each time is deliberate: Cally re-renders on
     *  the property change, which repaints the visible month's dots — the
     *  "nudge" the design calls for. If the filter removed the selected day's
     *  meetings, the agenda now shows its empty line. */
    function refreshMonthView(occurrences: readonly Occurrence[]): void {
      byDate = groupByDate(occurrences);
      if (monthCal) {
        monthCal.getDayParts = (d: Date) => (byDate.has(callyDayIso(d)) ? 'has-events' : '');
      }
      renderAgenda();
      renderCalSummary();
    }

    /** First-paint month-view setup: bounds (start of the current month → the
     *  12-month horizon), the meeting-day marks, the default selection (today
     *  if it has meetings, else the next day that does, else today), and the
     *  two listeners. Setting `value` on the property does not re-emit Cally's
     *  change event, hence the explicit renders at the end. */
    function initMonthView(): void {
      if (!monthCal) return;
      monthCal.min = `${island.today.slice(0, 7)}-01`;
      monthCal.max = island.horizonEnd;
      refreshMonthView(upcomingFor(filterEvents(allEvents, filter)));
      selectedDay = nextMeetingDay(byDate, island.today) ?? island.today;
      visibleMonth = selectedDay.slice(0, 7);
      monthCal.value = selectedDay;
      monthCal.focusedDate = selectedDay;
      monthCal.addEventListener('change', () => {
        if (!monthCal.value) return;
        selectedDay = monthCal.value;
        renderAgenda();
      });
      // focusday fires on keyboard focus moves AND on every ‹ › page (cally
      // 0.9.2 routes paging through its internal goto(), which dispatches it
      // with a Date inside the newly visible month — there is no pagechange
      // event in this release). ONLY the summary updates here, never the
      // selection: paging leaves the agenda alone (settled behavior).
      monthCal.addEventListener('focusday', (ev) => {
        const detail = (ev as CustomEvent<Date>).detail;
        if (!(detail instanceof Date)) return;
        const month = callyDayIso(detail).slice(0, 7);
        if (month === visibleMonth) return;
        visibleMonth = month;
        renderCalSummary();
      });
      renderAgenda();
      renderCalSummary();
    }
    ```

- [ ] 5. Delete the `buildChip` function entirely (lines ~490–500, from `function buildChip(o: Occurrence): HTMLAnchorElement {` through its closing `}`). Leave `buildPastRow`, `insertSorted`, and everything around it untouched.

- [ ] 6. Add the delegated agenda handler. Immediately AFTER the closing `});` of the existing `document.getElementById('events-list')?.addEventListener('click', …)` block (line ~914), insert:

    ```ts
    // Agenda cards: the same delegation as #events-list, on the agenda's stable
    // <ul>, so it covers every card renderAgenda() inserts without per-card
    // listeners. Share branch first, then the title button → the shared
    // popover. Agenda shares call shareEvent WITHOUT { fromPopover } for the
    // same reason the list's do: a card-initiated copy failure must never
    // borrow a popover that happens to be open by then.
    document.getElementById('events-agenda-list')?.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const shareBtn = target.closest<HTMLElement>('.event-share-inline');
      if (shareBtn) {
        const card = shareBtn.closest<HTMLElement>('[data-event-id]');
        const event = allEvents.find((candidate) => candidate.id === card?.dataset.eventId);
        if (event) shareEvent(event);
        return;
      }
      const btn = target.closest<HTMLElement>('.event-title-btn');
      if (!btn) return;
      const card = btn.closest<HTMLElement>('[data-event-id]');
      const id = card?.dataset.eventId;
      const date = card?.dataset.date;
      if (!id || !date) return;
      const event = allEvents.find((candidate) => candidate.id === id);
      if (event) openEventPopover({ event, date }, btn);
    });
    ```

- [ ] 7. In `applyMerge` (lines ~918–962): replace the tail of the function — from the comment line `// The list collapses a recurring series to one row (its next occurrence); the` (line ~942) down to the closing `}` of the function — with:

    ```ts
      // The list collapses a recurring series to one row (its next occurrence);
      // the month calendar marks every occurrence, but reads it from the
      // refreshMonthView below, not from a per-chip insert.
      const list = document.getElementById('events-list');
      for (const o of collapseSeries(freshOccurrences)) {
        if (list) insertSorted(list, buildCard(o), sortKey(o.date, o.event.time, o.event.id));
      }
      // On the homepage preview an overlay insert could push the list past its cap;
      // trim the tail back to island.listLimit so it stays a "next N" preview.
      // /events leaves listLimit undefined and keeps every inserted row.
      if (island.listLimit != null && list) {
        while (list.children.length > island.listLimit) list.lastElementChild?.remove();
      }

      // 3. The merged set is what every later filter change renders from. The
      //    month calendar re-marks its days and re-renders the agenda from it
      //    too: a merged-in event adds its dot, and its agenda row when its day
      //    is the selected one.
      allEvents = merged;
      refreshMonthView(upcomingFor(filterEvents(allEvents, filter)));
      syncChrome();
    }
    ```

    (Net change: the `for (const o of freshOccurrences) { … buildChip … }` loop is gone, `refreshMonthView` is called after `allEvents = merged`, and the comments say why. The prune loop and `fresh`/`freshOccurrences` computation above stay exactly as they are.)

- [ ] 8. In the comment block above the Filter section (lines ~964–975), change the line:

    ```ts
    // list in place, and keep the choice in the URL hash so a filtered view is
    // shareable and the back button works. `el`, `buildCard`, `buildChip`, and
    // `placeLabel` already exist in this module; they are used, not redefined.
    ```

    to:

    ```ts
    // list in place, and keep the choice in the URL hash so a filtered view is
    // shareable and the back button works. `el`, `buildCard`, and `placeLabel`
    // already exist in this module; they are used, not redefined.
    ```

- [ ] 9. In `applyFilter` (lines ~1269–1307): replace the block from the comment `// The list shows one row per event (collapsed series); the month grid keeps` down through the chip loops (ending with the `}` after `if (chips) chips.append(buildChip(o));`) with:

    ```ts
      // The list shows one row per event (collapsed series); the month calendar
      // marks every occurrence, so each reads a different view of `upcoming`.
      const list = document.getElementById('events-list');
      if (list) {
        // The homepage preview caps the list to island.listLimit (the "next 6");
        // /events leaves it undefined and renders every collapsed row.
        const rows = collapseSeries(upcoming);
        const shown = island.listLimit != null ? rows.slice(0, island.listLimit) : rows;
        list.replaceChildren(...shown.map(buildCard));
      }

      // The month calendar re-marks its meeting-days and re-renders the agenda
      // from the same filtered, UNcollapsed set. If the filter removed the
      // selected day's meetings, the agenda shows its empty line.
      refreshMonthView(upcoming);
    ```

    (The `pastList` re-render and `syncChrome()` lines after this block stay untouched.)

- [ ] 10. **Stale-comment sweep** — four comments still describe the removed chips:

    (a) The section header (line ~404):

    ```ts
    // --- Card and chip construction (mirrors EventsList / EventsMonth) -------
    ```

    becomes:

    ```ts
    // --- Card construction (mirrors EventsList) ------------------------------
    ```

    (b) In `buildCard` (lines ~431–433), the comment:

    ```ts
      // Real id, mirroring EventsList.astro: gives a shared /events#<id> link a
      // native fragment target. List cards only — month chips keep data-event-id.
    ```

    becomes:

    ```ts
      // Real id, mirroring EventsList.astro: gives a shared /events#<id> link a
      // native fragment target. List cards only — agenda cards carry just
      // data-event-id.
    ```

    (c) In `resolveDeepLink` (lines ~1402–1405), the comment lines:

    ```ts
      // 'none' covers empty/filter hashes, unresolvable tokens (#main-content,
      // #event-<id> month anchors, past-only ids — graceful no-ops), and the
    ```

    become:

    ```ts
      // 'none' covers empty/filter hashes, unresolvable tokens (#main-content,
      // stale #event-<id> chip-era links, past-only ids — graceful no-ops), and the
    ```

    (d) In the comment above the `hashchange` listener (lines ~1424–1427), the lines:

    ```ts
    // recognised filter key applies it; any OTHER token routes to the deep-link
    // resolver, where an unknown one (the skip link's #main-content, a month
    // anchor) is a graceful no-op that never wipes the county/type selection.
    ```

    become:

    ```ts
    // recognised filter key applies it; any OTHER token routes to the deep-link
    // resolver, where an unknown one (the skip link's #main-content, a stale
    // chip-era anchor) is a graceful no-op that never wipes the county/type selection.
    ```

- [ ] 11. At the first-paint block near the bottom (lines ~1450–1465), insert `initMonthView();` between the filter bootstrap and the deep-link resolve, so it reads:

    ```ts
    buildFilters();
    if (filter.county === 'all' && filter.type === 'all') {
      syncChrome();
    } else {
      applyFilter(filter);
    }

    // First paint: bound the calendar, mark its meeting-days, and select the
    // default day (today, else the next day with meetings). Runs after the
    // filter bootstrap so a shared #county=… link marks only that county's
    // days. (applyFilter may already have refreshed the map; initMonthView's
    // own refresh is idempotent.)
    initMonthView();

    // First paint: resolve any #<id> already in the URL against the baked set.
    ```

- [ ] 12. **Typecheck.** Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: exactly the 14 baseline errors — in particular NO new errors in `src/scripts/events-page.ts` beyond the pre-existing TS7016 at (70,36) (its line number may shift a few lines from the added imports; same single accessible-autocomplete error, no others).

- [ ] 13. **Build.** Run `npm run build`. Expected: exit 0, `21 page(s) built`.

- [ ] 14. **Manual browser check (core wiring).** `npm run dev`, open `http://localhost:4321/events`, click the Month tab, and verify:
    1. A dark-themed calendar renders (deflock theme, chevron nav) for the current month, and the weekday header starts on Sunday (S M T W T F S order) — proves `first-day-of-week="0"` applied.
    2. Day buttons for meeting-days carry the amber dot **on the correct dates** — cross-check a known meeting date against the List view; a dot one day EARLY means a local-getter regression in the `callyDayIso` usage. In DevTools, inspect a dotted day's button inside the `calendar-month` shadow root and confirm its `part` attribute includes `has-events` (the design asked for this verification explicitly).
    3. The agenda below shows the default day — today if it has meetings, else the next meeting day — with its meetings listed time-first, under a real `<h3>` header.
    4. Tap a different dotted day → its agenda renders; tap an empty day → "No meetings this day." After each tap, `document.getElementById('events-agenda-status').textContent` in the console reads "<full date> — N meetings" (or "— no meetings").
    5. Tap an agenda card's title → the shared popover opens with the right date; its Share works. Tap the card's inline Share → OS share sheet or "Link copied" toast.
    6. ‹ is disabled/no-op before the current month; › stops at the 12-month horizon; paging months does NOT change the agenda; paging back shows the selected day highlighted again; the paged-to month has dots with no interaction.
    7. After paging to the next month, `document.getElementById('events-cal-summary').textContent` in the console names the paged-to month's meeting days ("Meetings this month on <Month> 1, 8, …." or "No meetings shown this month.").
    8. In the DevTools accessibility tree, the calendar's prev/next buttons are named "Previous month" / "Next month".
    9. Switch the type filter (e.g. Council meetings) → dots, agenda, AND the summary update; select a county with no events → dots clear and the selected day shows the empty line. Clear filters → dots return.
    10. No console errors throughout.

- [ ] 15. **Commit:**

    ```
    git add src/scripts/events-page.ts
    git commit -m "feat(events): wire the Cally month calendar and day agenda controller

    import 'cally'; build the filtered by-date map via groupByDate; set
    min/max, getDayParts (has-events dots, UTC-safe via callyDayIso), and
    the nextMeetingDay default selection; render a compact time-first agenda
    card wired through a delegated handler that mirrors #events-list
    (popover + share for free); refresh dots + agenda in applyFilter and
    applyMerge. A11y: an sr-only meeting-day summary refreshed on focusday
    (cally 0.9.2 has no pagechange; paging dispatches focusday) and a polite
    live region announcing each selected day + count. Deletes buildChip, the
    month-chip handler, and its only consumer focusListCard.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

## Task 5 — Final verification: full suite, baselines, and the design's acceptance checks (manual-verify)

**Files:** none (verification only — a clean tree is part of the check).

- [ ] 1. **Full test suite.** Run `npm test`. Expected: `Test Files 32 passed (32)`, `Tests 807 passed (807)` — the 794 baseline plus the 13 new Task-1 tests (4 `groupByDate` + 6 `nextMeetingDay` + 3 `callyDayIso`). Any other number is a failure to investigate.

- [ ] 2. **Typecheck.** Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: exactly the 14 baseline errors listed in "Recorded baselines" (allowing shifted line numbers within the same files), nothing new.

- [ ] 3. **Build.** Run `npm run build`. Expected: exit 0, `21 page(s) built`.

- [ ] 4. **Clean tree.** Run `git status`. Expected: `nothing to commit, working tree clean` on `feature/events-month-cally`, 4 commits ahead of master.

- [ ] 5. **Design acceptance checks** (dev server via `npm run dev`; a real phone on the LAN is ideal for check 1, DevTools device toolbar acceptable):
    1. **375px viewport** (DevTools device toolbar, iPhone SE): the Month tab renders as a real calendar — 7 columns of day numbers, nothing character-wrapped, nav + heading legible. This is the bug the change exists to fix.
    2. Weeks start Sunday (header S M T W T F S); dots on meeting-days **on the correct dates** (spot-check a known meeting date against the List — a dot one day early is the local-getter timezone bug); tap a day → its agenda; tap an empty day → the empty line.
    3. Nav is bounded (current month → 12-month horizon) and leaves the selection alone; dots appear on a paged-to month automatically.
    4. Popover + Share both work from an agenda card.
    5. A type-filter change and a county selection refresh dots + agenda (empty line when the selected day loses its meetings).
    6. Overlay refresh: with the Network tab open, confirm `/api/events` loads and the calendar/agenda still render afterward with no console errors (an overlay-only event is not always available to observe; no-error + intact rendering is the check).
    7. **JS disabled** (DevTools → Command Menu → "Disable JavaScript", reload `/events`): the List content still renders fully server-side. The tab bar and Month panel are inert — by design.
    8. **Homepage** (`http://localhost:4321/`): the events band's Month tab shows the calendar inside its scroll cap; the agenda scrolls within the panel.
    9. **A11y** (DevTools accessibility tree, plus a screen reader — Narrator/NVDA — if available): the prev/next buttons are announced as "Previous month" / "Next month"; `#events-cal-summary` lists the visible month's meeting-days and updates after paging (the dots' accessible equivalent); selecting a day updates `#events-agenda-status` ("<day> — N meetings" / "— no meetings") and a screen reader announces it politely; the agenda `<ul>` is labelled by the `<h3>` head (`aria-labelledby`).

- [ ] 6. No commit in this task. If any check fails, fix it in the task that owns the file, re-run this task from step 1, and amend nothing — add a fix commit with the same trailer.

---

## Spec coverage map (design section → task)

| Design section | Covered by |
|---|---|
| Goal / mobile fix (numbers not titles) | Tasks 2–4; verified Task 5 check 1 |
| Decisions: Cally + agenda, dot marker, JS-enhanced month, data layer unchanged, reuse deflock theme | Tasks 2 (markup/theme), 3 (dot CSS), 4 (JS); data layer untouched everywhere |
| Component markup (`events-cal-wrap`, agenda ids, no-JS note) | Task 2 |
| Marker: `getDayParts` → `has-events`, `::part(button has-events)::after`, verify part emission | Task 3 (CSS), Task 4 steps 4 + 13.2 (assignment + verification) |
| Agenda: change handler, compact time-first card, `.event-title-btn`/`.event-share-inline`, `data-event-id`/`data-date`, delegated handler mirroring `#events-list`, empty line | Task 4 steps 4 + 6 |
| Default selected day (today else next, fall back today; `value` + `focusedDate`) | Task 1 (`nextMeetingDay`) + Task 4 `initMonthView` |
| Navigation: `min`/`max` bounds, paging keeps selection, dots auto-render per page | Task 4 (`initMonthView` bounds; the only page-reactive listener is the summary's `focusday` one, which never touches the selection); verified Task 5 check 3 |
| Data flow: `groupByDate` over the uncollapsed upcoming set; refresh in `applyFilter`/`applyMerge` via fresh `getDayParts` + agenda re-render | Task 1 + Task 4 steps 7 + 9 (see planning decision 6 for the filtered-set reading) |
| Accessibility: `callyDayIso` UTC date conversion (dots on the correct day) | Task 1 (TDD, 3 tests) + Task 4 usage in `getDayParts`/`focusday`; verified Task 4 check 2 + Task 5 check 2 (decision 9: UTC construction source-verified) |
| Accessibility: nav buttons named via sr-only slotted text | Task 2 markup; verified Task 4 check 8 + Task 5 check 9 |
| Accessibility: `first-day-of-week="0"` (kebab attribute) Sunday-first week | Task 2 markup (decision 3); verified Task 4 check 1 + Task 5 check 2 |
| Accessibility: visible-month meeting-day summary, rebuilt on load + paging, selection untouched | Task 2 (`#events-cal-summary`) + Task 4 (`renderCalSummary`, `focusday` listener — `pagechange` does not exist in cally 0.9.2, decision 7); verified Task 4 check 7 + Task 5 check 9 |
| Accessibility: agenda `<h3>` + `aria-labelledby` list + polite live status announcing day + count (incl. initial default) | Task 2 markup + Task 4 `renderAgenda` status update; verified Task 4 check 4 + Task 5 check 9 |
| Removed: `.month-*` CSS; server grid + `byDay`; chip handler + `#event-<id>` hrefs + `buildChip`; dead `groupByMonth` | Task 3 step 2; Task 2 step 1; Task 4 steps 4–5 (+ `focusListCard`, decision 5); Task 1 step 4 |
| Files-changed list (§ Files changed 1–5) | Tasks 2, 3, 4, 1; global.css untouched (dot CSS placed per decision 4) |
| Testing: unit (`groupByDate`, `nextMeetingDay`, `callyDayIso`) + manual + manual-a11y checks | Task 1; Task 5 steps 5.1–5.9 |
| Non-goals (List/Map/share untouched; `months="1"`; single amber dot) | No task touches EventsList/EventsMap/map layers or the share module; Task 2 markup; Task 3 CSS |
| Settled behavior (paging leaves selection; `focusday` listener is summary-only; initial default) | Task 4 change/focusday listener design; Task 5 checks |
