# Events month view → Cally calendar + day agenda — design

Date: 2026-09-01
Status: design (approved interaction; pending spec review)
Branch (proposed): `feature/events-month-cally`

## Goal

Replace the events **Month** view. The current view is a fixed 7-column grid that renders event *titles* inside day cells; on a phone the columns are ~40px, so titles wrap one character per line and it's unusable. Replace it with a proper calendar (the Cally web component, already a dependency) that shows day **numbers** with a marker on meeting-days, and an **agenda of the selected day's meetings** below it. Numbers fit 7 columns at any width, so the mobile problem disappears.

## Decisions (settled with the owner)

- **Cally `<calendar-date>` + selected-day agenda.** DaisyUI's "calendar" is the Cally date-picker; we use it as the month view.
- **Dot marker** (single amber dot under the number) on days with meetings.
- **Month becomes JS-enhanced** (Cally is a web component). The **List view stays server-rendered** as the no-JS fallback; the tab bar already requires JS, so this is consistent.
- **Data/recurrence layer unchanged** — recurring events already expand to every correct date; only the *view* changes.
- Reuse the existing `.deflock-calendar` / `.deflock-month` dark theme from `global.css` (the submit form's date picker) for visual consistency.

## Load-bearing facts (verified)

- **Why mobile breaks**: `.month-dow, .month-grid { grid-template-columns: repeat(7, minmax(0,1fr)) }` in `EventsExplorer.astro` (~line 521) is applied at *all* widths with no month-view media queries; `min-width:0` on cells/chips + `overflow-wrap:anywhere` inherited by chip titles from `.event-title` (chips render `class="event-title month-chip-title"`) make titles wrap per character in ~30px boxes.
- **Recurrence is already correct**: `EventsExplorer.astro:142` passes the *full* `splitByToday(expandAll(...)).upcoming` set to `EventsMonth`; `EventsMonth.astro` buckets by each occurrence's real `o.date` (a `byDay` map); the client re-render (`events-page.ts` `applyFilter`/`applyMerge`) keys chips into `[data-chips="<date>"]` cells by real date. Only the List collapses via `collapseSeries`. **No data fix needed.**
- **Cally is already a dependency**: `import 'cally'` in `SubmitEventForm.astro`; structure is a `<calendar-date class="deflock-calendar">` with slotted prev/next nav content (SVG + text) wrapping a child `<calendar-month class="deflock-month">`; themed via `::part(heading|button|today|outside|disallowed)` in `global.css` (~472–514).
- **Cally API** (verified against the installed cally 0.9.2): `<calendar-date value min max months>` plus the observed attribute `first-day-of-week` (kebab — the camelCase form is ignored by Atomico); properties `getDayParts(date)=>string` (CSS part names for a day's button, targetable via `::part(button <name>)`) and `isDateDisallowed(date)=>boolean`; events `change` (value changed — read `cal.value`), `focusday`, `selectday`. **0.9.2 has no `pagechange`** — paging dispatches `focusday` with a `Date` in the newly shown page. `focusedDate` navigates programmatically.
- **Stale code**: `groupByMonth` in `events-view.ts` (~314–325) is exported but imported nowhere (its docstring falsely claims `EventsMonth.astro` uses it). Remove it as fold-in cleanup.

## Design

### Component

`EventsMonth.astro` is rewritten to render a single inline Cally calendar plus an agenda container (no more pre-rendered day-cell grid):

```
<div class="events-cal-wrap">
  <calendar-date class="deflock-calendar events-cal" months="1" first-day-of-week="0">
    <span slot="previous" class="sr-only">Previous month</span>
    <svg slot="previous" aria-hidden="true"><!-- ‹ chevron --></svg>
    <span slot="next" class="sr-only">Next month</span>
    <svg slot="next" aria-hidden="true"><!-- › chevron --></svg>
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

Server-render note: with no JS, Cally does not upgrade, so the month panel is empty. That's acceptable — the List panel is the default/no-JS view. (The tab bar itself is JS.)

### Marker (dot)

`getDayParts(date)` returns `'has-events'` for any date present in the client's by-date map, else `''`. Styled with a pseudo-element on the part:

```css
calendar-month.deflock-month::part(button has-events)::after {
  content: ""; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
  width: 5px; height: 5px; border-radius: 50%; background: var(--color-accent); /* amber */
}
```

(Selected day already themed via `::part(button selected)`; today via `::part(today)`.) Verify Cally emits `has-events` alongside its built-in parts and that a pseudo-element on `::part` renders in the target browsers during implementation.

### Agenda

On the calendar's `change` event, read `cal.value` (YYYY-MM-DD) and render that day's occurrences into `#events-agenda-list`. Each is a **compact agenda card** — time-first, no left date-block (the agenda header already names the day, so the list card's day/month block would be redundant on every row). It carries `data-event-id` + `data-date` and reuses the same interactive classes as the list card: `.event-title-btn` (opens the shared detail popover) and `.event-share-inline` (the inline **Share** button), so the popover + the share/deep-link feature come for free. A delegated click handler on `#events-agenda-list` mirrors the existing `#events-list` one (share branch, then title branch → `openEventPopover({ event, date }, btn)`). Empty day → the "No meetings this day." line.

- **Default selected day**: today if it has meetings, else the next upcoming day that does (fall back to today if none). Set `cal.value` + `focusedDate` on init.
- **Navigation**: `‹ ›` page months (Cally native), bounded by `min` = start of the current month and `max` = the 12-month horizon (`island.horizonEnd`). Paging does **not** change the selection — the agenda keeps showing the last day you tapped (it may be off the current page; Cally reveals the selected day again when you page back). Cally re-invokes `getDayParts` for the newly shown days on every page, so dots appear on the new month automatically — **no handler is needed for the dots** (a `focusday` listener refreshes only the sr-only meeting-day summary; see Accessibility).

### Data flow (client, `events-page.ts`)

- Build a `Map<isoDate, Occurrence[]>` from the **full** upcoming set (`upcomingFor(allEvents)` — the same set the month grid used, NOT collapsed) via a new pure, tested helper `groupByDate(occurrences)` (replacing the dead `groupByMonth`).
- `getDayParts` reads that map's keys; the agenda reads the map's values for the selected date.
- **Refresh on the same triggers as today**: filter change (`applyFilter`) and overlay merge (`applyMerge`) rebuild the map, reassign `getDayParts` (then nudge Cally to re-render the current page), and re-render the agenda for the selected day. If the selected day's meetings changed, the agenda updates; if the filter removes the selected day's only meetings, show the empty line.

### Accessibility

- **Date conversion (correctness + a11y)**: Cally hands `getDayParts` a `new Date(Date.UTC(...))`. Convert to ISO with **UTC** getters (`getUTCFullYear/Month/Date`) via a pure, tested `callyDayIso(date)` helper — local getters shift to the previous day in Eastern time and would dot every meeting a day early.
- **Nav buttons**: the slotted prev/next SVGs are `aria-hidden`, so Cally's shadow buttons would have no accessible name. Include visually-hidden slotted text (`<span slot="previous" class="sr-only">Previous month</span>`, likewise `next`) alongside the SVGs.
- **Week start**: set `first-day-of-week="0"` (the kebab attribute Atomico observes; the camelCase form is ignored) so weeks start Sunday, matching the old grid.
- **Meeting-day discoverability**: the amber dot is visual-only. Add a visually-hidden summary of the visible month's meeting-days, rebuilt on load and whenever the visible month changes. (cally 0.9.2 dispatches no `pagechange`; use `focusday`, which fires on paging with a `Date` in the newly visible month. The listener refreshes only the summary, never the selection.)
- **Agenda announcement**: the agenda header is a real `<h3 id="events-agenda-head">` and the list is `aria-labelledby` it; a polite `aria-live` status announces the selected day + meeting count (or the empty state) on each selection, including the initial default day.

### Removed

- The `.month-dow`, `.month-grid`, `.month-cell`, `.month-chips`, `.month-chip*` CSS in `EventsExplorer.astro`.
- The server day-cell grid in `EventsMonth.astro` and its `byDay` pre-render.
- The `#panel-month` delegated month-chip → `focusListCard` handler and the `#event-<id>` chip hrefs / `buildChip()` in `events-page.ts` (replaced by the agenda's card handlers, which already exist for the list).
- The stale `groupByMonth` export + its tests, if any.

## Files changed

1. `src/components/EventsMonth.astro` — replace the grid with the Cally calendar + agenda container.
2. `src/components/EventsExplorer.astro` — remove `.month-*` CSS; add `.events-cal-wrap` / `.events-agenda*` CSS and the `::part(button has-events)` dot; ensure `import 'cally'` reaches this view (via `events-page.ts`).
3. `src/scripts/events-page.ts` — `import 'cally'`; `groupByDate` usage; wire `getDayParts`, the `change` handler, initial default-day selection (via `nextMeetingDay`), a compact `buildAgendaCard(occurrence)` + a delegated `#events-agenda-list` handler (share/title, mirroring `#events-list`), and the filter/overlay refresh; delete `buildChip` + the month-chip handler.
4. `src/lib/events-view.ts` — add pure helpers `groupByDate(occurrences): Map<string, Occurrence[]>`, `nextMeetingDay(byDate, fromIso)` (initial default-day selection), and `callyDayIso(date)` (UTC-safe ISO from a Cally `Date`); remove dead `groupByMonth`.
5. `src/styles/global.css` — only if the `has-events` part styling belongs with the other `.deflock-month` parts (keep the two Cally themes together); otherwise in `EventsExplorer.astro`.

## Testing

- **Unit (`events-view.test.ts`)**: `groupByDate` (buckets by real date, multiple per day, empty); `nextMeetingDay(map, fromIso)` (today-has-events → today; today-empty → next day with events; none → null); `callyDayIso(date)` (UTC extraction — a `Date.UTC` midnight yields the same calendar day, no Eastern-time off-by-one). These make the default-day and date-conversion logic testable.
- **Manual (dev server, incl. a real phone / narrow viewport)**: month view renders as a calendar at 375px (no character-wrapping); weeks start Sunday; dots on meeting-days (on the correct dates — spot-check a known meeting date, not off-by-one); tap a day → its agenda; nav months (bounded); popover + Share work from an agenda card; type-filter change updates dots + agenda; overlay merge adds a dot/agenda entry; List view still renders with JS disabled.
- **Manual a11y**: nav buttons are announced ("Previous/Next month"); the visually-hidden meeting-day summary lists the visible month's meeting-days and refreshes when paging; selecting a day announces the date + meeting count (or empty) via the polite live region; the agenda list is associated with its `<h3>` header.

## Non-goals / scope

- No change to the data/recurrence layer, the List view, the Map view, or the share/deep-link feature.
- No multi-month desktop layout for v1 (`months="1"`, navigate for more); can revisit.
- No color-coded-by-type markers for v1 (single amber dot); nearly all events are council today.

## Settled behavior

Month navigation (`‹ ›`) **leaves the selection alone** — it only pages the calendar; the agenda continues to show the last day you tapped until you tap another. Dots on the newly shown month render automatically (Cally re-invokes `getDayParts` per page). A `focusday` listener (cally 0.9.2 has no `pagechange`) exists solely to refresh the visually-hidden meeting-day summary (see Accessibility) — it never changes the selection. The initial default selection is today, or the next day with meetings if today has none.
