# Homepage Events Explorer — reuse the /events two-panel on the homepage

Date: 2026-08-31
Status: Approved (brainstorm complete), ready for implementation
Branch: `feature/homepage-events-explorer`

## 1. Goal

Two homepage changes, plus the refactor they require:

1. **Replace** the homepage's lightweight 3-card events strip (`EventsStrip.astro`) with the
   **full interactive two-panel map+calendar** currently used on `/events`.
2. **Move** the blog section (`BlogCarousel.astro`) to sit **below** the events section.
3. To do (1) without duplicating a 1264-line script and a ~500-line stylesheet, **extract**
   the `/events` two-panel apparatus into a single shared component, `EventsExplorer.astro`,
   used by both `/events` and the homepage.

The ALPR **camera map** (`MapSection.astro`) is unrelated to the events map and **stays as-is**.
The page will carry two MapLibre maps (camera map + events map); both already lazy-init on
scroll-into-view, so the events map costs nothing until the reader reaches it.

## 2. Current state

`src/pages/index.astro` renders, in order:
`Hero → BlogCarousel → ImpactBand → MapSection → LegislationAsks → TakeActionZone → EventsStrip → SignalCta`.

`src/pages/events.astro` renders a page hero (`.events-hero`) followed, inside a
`<section class="events-body">`, by the two-panel apparatus:

- a tabs bar (`#events-tabs`: List / Month / Map),
- a filters `<nav id="events-filters">` (built client-side, ships `hidden`),
- an `.events-grid` holding `#panel-map` (`<EventsMap />`), `#panel-list` (`<EventsList />`),
  and `#panel-month` (`<EventsMonth />`),
- an intake dialog (`#intake-dialog`) and an event-detail `<dialog id="event-detail">`,
- a JSON data island (`<script type="application/json" id="events-data">`),
- `<script>import '../scripts/events-page.js'</script>`,
- a `<style is:global>` block (~lines 262-778) styling all of the above.

`src/scripts/events-page.ts` (1264 lines) is the client controller. It is hard-wired to ~40
unique element IDs and **throws** at load if `#events-data` is missing
(`events-page: #events-data island missing`). It is therefore all-or-nothing: the whole
apparatus must move together.

`EventsStrip.astro` is imported **only** by `index.astro`. It re-implements the same
baked-events pipeline that `events.astro` uses (a second copy).

## 3. Design decisions (locked in brainstorm)

- Events section on the homepage = **full interactive two-panel** (map + List/Month tabs +
  county/type filters + detail popover), i.e. a faithful reuse of the `/events` component.
- The camera `MapSection` **stays**. Two maps on the page is intended and accepted.
- `BlogCarousel` moves to **directly below** the events section; `SignalCta` remains last.
- Reuse is achieved by **extraction into one shared component** (no duplicated markup/script).

### Target homepage order

`Hero → ImpactBand → MapSection → LegislationAsks → TakeActionZone → HomeEvents → BlogCarousel → SignalCta`

where `HomeEvents` is a thin homepage-section wrapper that renders the band + heading and
embeds `<EventsExplorer variant="home" />` (see 5.2). This matches the codebase's
one-component-per-homepage-section pattern (`Hero`, `ImpactBand`, `MapSection`, … are each a
component).

## 4. Component design: `src/components/EventsExplorer.astro`

The component owns the **context-neutral interactive apparatus**. Page-specific chrome
(the `/events` hero, the homepage band + heading, and the outer section wrapper) stays in the
pages, so the component drops into either context.

### 4.1 Props

```ts
interface Props {
  variant?: 'page' | 'home'; // default 'page'
}
```

`variant` only selects a CSS hook class; it changes no data or behavior.

### 4.2 Frontmatter (moved verbatim from `events.astro`)

Move the entire baked-events pipeline out of `events.astro` (currently lines ~19-97) into the
component frontmatter, unchanged:

- validate `events.json` with the strict `publicEventSchema`, project through `toPublicEvent`,
  reject `type: 'council'` records on this path (curated council meetings come via
  `loadCouncilEvents()`);
- `bakedEvents.push(...loadCouncilEvents())`;
- compute `today`, `horizonEnd`, `pastCutoff`;
- derive `cityNames` / `countyNames` from `registry.json` at build time;
- `expandAll → splitByToday → past filter → collapseSeries`;
- build the `island` object and pass it through `toJsonIsland`.

This pipeline currently exists in **both** `events.astro` and `EventsStrip.astro`. After this
change it exists **once**, here.

### 4.3 Markup

Render, wrapped in a single hook element:

```astro
<div class:list={['events-explorer', variant === 'home' && 'events-explorer--home']}>
  <div class="events-tabs-bar"> … #events-tabs tabs … </div>
  <nav id="events-filters" class="events-filters" aria-label="Filter events" hidden></nav>
  <div class="events-grid">
    <div id="panel-map"  …><EventsMap /></div>
    <div id="panel-list" …><EventsList upcoming={upcomingList} past={past} … /></div>
    <div id="panel-month" …><EventsMonth occurrences={upcoming} today={today} … /></div>
  </div>
  <div id="intake-dialog" …> … </div>
  <dialog id="event-detail" class="modal" …> … </dialog>
  <script type="application/json" id="events-data" set:html={toJsonIsland(island)}></script>
  <script>import '../scripts/events-page.js';</script>
</div>
```

The inner markup (tabs, filters, grid, both dialogs, island, script) is moved **verbatim**
from `events.astro`. Only the new `.events-explorer` wrapper is added. Element IDs, ARIA,
class names, and the server-render/client-render class contract are unchanged.

> The wrapper `<div>` is safe: every style rule and every `events-page.ts` lookup is
> id- or class-based; none depends on `.events-body` being the direct parent. Verify this
> during implementation (grep the style block for `>` child combinators referencing
> `.events-body`; there are none at time of writing).

### 4.4 Styles

Move the `<style is:global>` block from `events.astro` into the component **unchanged**, then
**append** the homepage variant overrides (Section 5.4). Keep it `is:global`: the runtime
builds cards/chips/filters with no `data-astro-*` attribute, so their styles must be global.
`.events-body` is only referenced by `events.astro`'s wrapper (Section 5.1); it may remain in
this shared block harmlessly.

## 5. Page wiring

### 5.1 `src/pages/events.astro`

- Remove the baked-events pipeline from frontmatter (now in the component). Frontmatter reduces
  to importing `Base` and `EventsExplorer`.
- Keep the `<section class="events-hero">…</section>` hero verbatim.
- Replace the `<section class="events-body"> … </section>` block, the two dialogs, the island
  script, the JS import, and the `<style is:global>` block with:

  ```astro
  <section class="events-body">
    <EventsExplorer />
  </section>
  ```

- Net effect: `/events` is visually and behaviorally **identical** to before. `.events-body`
  still supplies its background (#171717) and padding; the component supplies everything inside.

### 5.2 New wrapper: `src/components/HomeEvents.astro`, and `src/pages/index.astro`

The `.hp-band` / `.hp-shell` / `.sec-*` helpers are **scoped** styles: each homepage section
component (`TakeActionZone`, `SignalCta`, and today `EventsStrip`) carries its own copy. So the
homepage events band needs a component to own its copy. Create a thin wrapper
`HomeEvents.astro`:

```astro
---
import EventsExplorer from './EventsExplorer.astro';
---
<section id="events" class="hp-band b1" aria-labelledby="events-heading">
  <div class="hp-shell">
    <div class="sec-head-wrap" data-reveal="up">
      <h2 id="events-heading" class="sec-title">Upcoming events: show up.</h2>
      <p class="sec-lead">The room is where it's decided. Here's where to be next.</p>
    </div>
    <EventsExplorer variant="home" />
  </div>
</section>

<style>
  /* Copy the .hp-band, .hp-band.b1, .hp-shell, .sec-head-wrap, .sec-title, .sec-lead
     rules verbatim from EventsStrip.astro's scoped <style> (same scoped-duplication
     pattern TakeActionZone and SignalCta already follow). */
</style>
```

Nesting `<EventsExplorer variant="home" />` inside `.hp-shell` makes its inner blocks inherit
the shell width (≤1120px) and horizontal padding, aligning their left edge with the heading.
The heading copy is carried over from `EventsStrip`.

In `index.astro`:

- Remove the `EventsStrip` import; add a `HomeEvents` import.
- Replace `<EventsStrip />` with `<HomeEvents />`.
- Move `<BlogCarousel />` to **directly after** `<HomeEvents />`. `SignalCta` stays last.

`index.astro` stays pure composition (no new `<style>` block); the band styles live in
`HomeEvents.astro`.

### 5.3 Delete `src/components/EventsStrip.astro`

Orphaned once `index.astro` imports `HomeEvents` instead (it has no other consumer). Delete the
file and confirm no remaining import references it. Its `.hp-*`/`.sec-*` scoped rules survive as
the copy in `HomeEvents.astro`; its baked-events pipeline is superseded by `EventsExplorer`.

### 5.4 Homepage variant CSS (appended to the component's global style block)

The only override the homepage needs is to stop the tabs bar from pinning mid-page (its
page-level `position: sticky; top: 4rem` is correct on `/events`, wrong inside a homepage band):

```css
.events-explorer--home .events-tabs-bar {
  position: static;
  top: auto;
}
```

Explicitly **keep** on the homepage:

- the desktop two-column `.events-grid` and the sticky **map panel**
  (`[data-panel='map'] { position: sticky; top: 8rem }`) — this is the intended two-panel
  behavior;
- all filter, tab, popover, and card styling.

Width alignment needs no extra CSS because the component is nested in `.hp-shell`; the inner
blocks' own `max-width: 84rem; margin: 0 auto` simply fill the narrower shell. If, in the live
preview, any inner block fails to align to the heading or overflows the shell, add a scoped
`.events-explorer--home <block> { max-width: none }` fix — but prefer the nesting approach and
add overrides only if the preview shows a real misalignment.

## 6. Invariants that MUST be preserved

These are load-bearing guarantees of the events page. A careless extraction can silently break
them; the implementation must keep every one:

1. **Strict validation, not a cast.** `events.json` is validated with the shared
   `publicEventSchema` (`.strict()`) and projected through `toPublicEvent`. Do **not** replace
   this with a type cast or a partial field check.
2. **Council guard.** Records with `type: 'council'` on the `events.json` path must still throw;
   curated council meetings load only via `loadCouncilEvents()`.
3. **No-JavaScript invariant.** The page prerenders the **full, unfiltered** list; the client
   narrows it in place. The server-rendered `EventsList`/`EventsMonth` must still render every
   upcoming occurrence with no client dependency. This holds on the homepage too.
4. **Data-island minimalism.** `registry.json` (~50 KB) never reaches the client. Only the
   derived `cityNames`/`countyNames` maps and the validated public events go into the island,
   via `toJsonIsland`.
5. **No event data via innerHTML.** The detail dialog and all runtime-built nodes fill via
   `textContent` / built nodes. Do not introduce `innerHTML` for event data.
6. **Render-path parity.** The class-name contract between the server render
   (`EventsList.astro`) and the client render (`buildCard` in `events-page.ts`) is unchanged.
7. **Single instance per page.** `events-page.ts` uses unique IDs and one `#events-data`
   island. The component must be rendered **at most once per page** (it is: once on `/events`,
   once on the homepage). No page renders it twice.
8. **Lazy map init.** The events map still initializes only on scroll-into-view (desktop) or
   when the Map tab is opened (mobile). The homepage must not eagerly boot two maps on first
   paint.

## 7. Acceptance criteria / regression checklist

- [ ] `npx astro check` passes (no new TS errors); `npm run build` succeeds.
- [ ] `/events` is visually and behaviorally identical to `master`: List/Month/Map tabs, county
      + type filters, event-detail popover, intake dialog, sticky tab bar, sticky desktop map,
      and the no-JS full list all work.
- [ ] Homepage renders the full two-panel events section in place of the old 3-card strip.
- [ ] Homepage still renders the ALPR camera `MapSection`, working, above the events section.
- [ ] Homepage order is exactly:
      `Hero → ImpactBand → MapSection → LegislationAsks → TakeActionZone → Events(two-panel) → BlogCarousel → SignalCta`.
- [ ] Homepage events blocks align to the 1120px homepage shell; the tab bar is **not** sticky
      mid-page; the desktop map panel **is** sticky within the band.
- [ ] No console errors on `/` or `/events` (desktop and mobile widths).
- [ ] Both maps lazy-init (network shows event tiles loading only after scrolling to the section).
- [ ] `EventsStrip.astro` is deleted and nothing imports it; the baked-events pipeline exists in
      exactly one place (`EventsExplorer.astro`).
- [ ] Homepage does not rely on any `.hp-*`/`.sec-*` rule that lived only in the deleted file.
- [ ] All Section 6 invariants hold.

## 8. Out of scope

- Any change to `MapSection` (camera map), `Hero`, `ImpactBand`, `LegislationAsks`,
  `TakeActionZone`, `SignalCta`.
- Any change to events data, the submission flow, `/go`, Netlify Blobs, or the council loader.
- Redesigning the events two-panel itself (filters, popover, map behavior) — this is reuse, not
  redesign.
- Scrollytelling or any homepage motion work beyond preserving existing `data-reveal` behavior.

## 9. Files touched

| File | Change |
|---|---|
| `src/components/EventsExplorer.astro` | **New.** Owns the extracted two-panel apparatus + pipeline + styles + `variant` prop. |
| `src/components/HomeEvents.astro` | **New.** Thin homepage-section wrapper: `.hp-band` + heading + `<EventsExplorer variant="home" />`; carries the `.hp-*`/`.sec-*` scoped styles. |
| `src/pages/events.astro` | Slim frontmatter; body/dialogs/island/script/styles replaced by `<EventsExplorer />` under the existing hero. |
| `src/pages/index.astro` | Drop `EventsStrip`; add `<HomeEvents />` where it was; move `BlogCarousel` below it. |
| `src/components/EventsStrip.astro` | **Deleted.** |

## 10. Suggested execution order (for workflow subagents)

1. Create `EventsExplorer.astro`: move the pipeline, the inner markup (verbatim), both dialogs,
   the island, the script import, and the global style block; add the `variant` prop, wrapper
   class, and the one `--home` sticky override.
2. Rewire `events.astro` to use `<EventsExplorer />`; delete the moved code from it.
3. Create `HomeEvents.astro` (band + heading + `<EventsExplorer variant="home" />`, with the
   `.hp-*`/`.sec-*` scoped styles copied from `EventsStrip`).
4. Rewire `index.astro`: import and place `<HomeEvents />` where `EventsStrip` was; move
   `<BlogCarousel />` below it.
6. Delete `EventsStrip.astro`; grep for dangling references.
7. Run `npx astro check` and `npm run build`; fix any errors.
8. Self-review against Section 6 invariants and Section 7 checklist.
