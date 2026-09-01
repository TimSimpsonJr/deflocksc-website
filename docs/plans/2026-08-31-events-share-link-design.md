# Events share / copy link — design

Date: 2026-08-31
Status: design (approved interaction; pending spec review)
Branch (proposed): `feature/events-share-link`

## Goal

Let anyone share a link to a specific event. Add a share control to every upcoming
event (on the card and in the detail popover), and make the resulting link actually
open that event when a recipient visits it. Applies on `/events` and on the homepage
events preview (same components).

## Decisions (settled with the owner + cross-model review)

- **Placement:** both the card (inline "Share" on the type-line row) *and* the shared
  detail popover footer. Shown on the homepage preview cards too (no variant branching);
  revisit only if visual testing shows it crowding the compact homepage.
- **Behavior:** `navigator.share` when available, else copy to clipboard + toast.
- **Destination:** wire up the currently-inert `/events#<id>` hash so shared links resolve.
- **Analytics:** none in v1 (privacy-first; `/events` already suppresses Umami).
- Reviewed by Sol (gpt-5.6 via Codex, `[MODE: ad-hoc]` thread `01a04de7…`); its
  important/minor findings are folded in below.

## Load-bearing codebase facts

- No per-event pages. The sanctioned permalink is `https://deflocksc.org/events#<id>`
  (already generated + copied by the submit form). Today a bare `#<id>` is inert:
  `/events` only consumes `#county=…&type=…` filter hashes.
- Events come from baked JSON at build (`src/data/events.json` fold +
  `src/data/council-meetings.json`) plus a runtime overlay fetched from `/api/events`
  (events submitted since the last weekly fold), merged client-side add-only. The
  module-level `allEvents: PublicEvent[]` in `src/scripts/events-page.ts` is the master
  list; `applyMerge()` reassigns it after the overlay merge. `loadOverlay()` is
  fire-and-forget on load.
- Types: `meetup` (venue private — never rendered; shared only inside a per-event Signal
  group via `/go/:id`), `public` (real address), `council` (curated, recurring, has an
  official `source` URL). `PublicEvent` = `{ id, type, title, date, time, city, county,
  address?, hasSignalGroup, recurrence?, source? }`. Ids are `[a-z2-7]{8}` (submitted) or
  `council-<slug>` (curated).
- One shared `<dialog id="event-detail">` (daisyUI `modal`), filled + opened per event by
  the exported `openEventPopover(occurrence, invoker)`. It already closes on ✕, the Close
  button, Esc, **and backdrop click** (a `<form method="dialog" class="modal-backdrop">`).
- Cards render on TWO paths under a documented "class-parity" contract: server
  `src/components/EventsList.astro` and client `buildCard()` in `events-page.ts`. The
  card's only interactive control today is the title button, which opens the popover via
  a delegated `#events-list` click handler.
- Reuse: global `showToast(msg)` (`src/scripts/toast.ts`); the submit form's clipboard
  copy (`navigator.clipboard.writeText` + `execCommand('copy')` fallback); inline SVG
  icons built at runtime via `createElementNS` (helper `extLinkIcon()`).

## Design

### 1. The share action (`shareEvent`)

A single function used by both surfaces. The URL is built synchronously and
`navigator.share` is called as the first async step, so it runs inside the click's
transient activation (some browsers reject `share()` if you await first).

Fallback ladder:

1. `navigator.share` exists → `navigator.share({ title: e.title, url })`.
   - resolves → done (no toast; the OS sheet is the feedback).
   - rejects `AbortError` → **stop silently** (user cancelled / no target). No toast, no copy.
   - rejects anything else (`NotAllowedError`, `TypeError`, …) → fall through to copy.
2. no `navigator.share` → copy directly.
3. copy = `navigator.clipboard.writeText(url)`; on failure, the `execCommand('copy')`
   fallback (checking its boolean result).
   - copy succeeded → `showToast('Link copied')`.
   - **both paths failed → honest failure**, never a lying toast: when a popover is open,
     reveal a "select and copy" affordance with the URL selected; from a card with no
     popover open, `showToast('Couldn't copy — open the event to copy the link')`.

Payload is `title` + `url` only — no address, organizer, or type. A meetup deep-link opens
the popover showing "Shared in the Signal group" (no venue), so sharing leaks nothing the
page doesn't already show.

### 2. URL + pure helpers (in `src/lib/events-view.ts`, unit-tested)

- `eventShareUrl(origin: string, id: string): string` → `${origin}/events#${encodeURIComponent(id)}`.
  Client calls `eventShareUrl(location.origin, e.id)` (matches the submit form's `/events#<id>`).
- `parseEventIdHash(hash: string): string | null` → strips a leading `#`; returns `null`
  for an empty hash or any hash containing `=` (a `county=`/`type=` filter hash); otherwise
  returns the token, `decodeURIComponent`-d (returning the raw token if decoding throws, e.g.
  `#%`). Lookup-by-id downstream is the real guard, so reserved tokens (`#main-content`,
  `#event-<id>` month-chip anchors) parse to a string that simply matches no event.
- `occurrenceById(occurrences: Occurrence[], id: string): Occurrence | undefined` — a tested
  finder over an already-collapsed upcoming set. The resolver feeds it
  `collapseSeries(upcomingFor(allEvents))` (the existing list pipeline), which naturally
  yields a recurring series' next upcoming occurrence and excludes past-only events.

### 3. Deep-link resolver (state machine, `events-page.ts`)

Given a bare `#<id>`: resolve it to an upcoming occurrence, select the List tab,
best-effort scroll the card into view, and open the popover. Invariants (per Sol):

- **Re-parse the live hash before every resolution** — never trust a stale remembered id.
- Resolve via `occurrenceById(collapseSeries(upcomingFor(allEvents)), id)`.
- Set `pendingDeepLinkId` only when the current hash names an id that is *not yet resolvable*
  and the overlay has not settled. Clear it on hashchange, on a successful resolve, or once
  the overlay settles without that id.
- **Never call `showModal()` when the dialog is already open** (it throws). If a popover is
  already open, defer pending resolution until its `close` event. Re-resolving the
  already-open id is a no-op.
- **Best-effort scroll:** select the List tab, then `scrollIntoView` the card *if present*;
  pass the card's title button as `invoker` so close returns focus to it. If no card is
  rendered (filtered out, behind Month/Map, beyond the homepage cap, overlay not yet
  merged), open the detail anyway and return focus to the List tab / events heading. Never
  clear a filter to manufacture a card. No flash on this path (it would sit behind the modal).
- **Close on hash-away:** if the hash changes away from a deep-link-opened dialog while it is
  open, close that dialog (track a `deepLinkOwned` flag on open).

Three moments call the resolver:

1. **First paint** — after `buildFilters()` / `syncChrome()`, resolve the current hash
   against the baked set. Baked list cards also carry a real `id` (see §4), so the browser's
   native fragment scroll already lands even before JS runs / with JS disabled.
2. **After the overlay merge** — at the end of `loadOverlay()`'s success path (after
   `allEvents = merged` and card insertion), re-parse the hash and resolve `pendingDeepLinkId`
   if it is still current; then mark the overlay settled so an unknown id stops being pending.
3. **`hashchange`** — extend the existing handler (which today ignores non-filter hashes):
   empty or filter-key hash → `applyFilter` (unchanged); otherwise route the bare id to the
   resolver (no-op if it matches nothing).

Leaving `#<id>` in the URL after close is intentional and not a trap: closing adds no history
entry, so Back leaves the page normally; reload/Forward re-opens, consistent with the URL.
No history state is added.

### 4. Card changes (both render paths — class-parity)

`EventsList.astro` and `buildCard()`:

- Add a real `id={event.id}` to each upcoming list card (only list cards — month chips keep
  `data-event-id` + `#event-<id>` hrefs, so no duplicate-id collision). Gives baked links a
  native fragment target with JS off and simplifies lookup.
- Wrap the existing `.event-typeline` in a flex `.event-actions` row (space-between) and add
  an inline **Share** button (`.event-share-inline`): neutral grey (not the type colour),
  `flex-shrink: 0`, a ~44px touch target despite the 11px type-line, `type="button"`,
  `aria-label="Share <event title>"`, and an `aria-hidden` inline SVG share glyph (built via
  `createElementNS` in the client path, mirroring `extLinkIcon`).
- The delegated `#events-list` click handler gains a `.event-share-inline` branch (checked
  before the title-button branch) that calls `shareEvent` with the card's event; one listener
  covers server- and client-rendered cards.

### 5. Popover changes (`EventsExplorer.astro` + `openEventPopover`)

- Add `#event-detail-share` (`btn btn-neutral btn-sm` + share icon + "Share") to the footer,
  between Close and the Signal CTA. Brand red stays reserved for the Signal CTA.
- `openEventPopover` stores the current event; a static listener wires the Share button to
  `shareEvent(popoverEvent)`. Backdrop click / Esc / Close continue to close the dialog
  unchanged (preserved requirement — the owner specifically asked that clicking off the
  popover closes it; the daisyUI `modal-backdrop` form already provides this).
- The "select and copy" failure affordance (§1) lives here, hidden by default.

## Files changed

1. `src/components/EventsList.astro` — card `id`, `.event-actions` wrapper, inline Share button.
2. `src/components/EventsExplorer.astro` — popover footer Share button, failure affordance,
   `.event-actions` / `.event-share-inline` CSS.
3. `src/scripts/events-page.ts` — `shareEvent`, `copyLink`, `shareIcon`; card render parity in
   `buildCard`; delegated card-share branch; popover Share wiring + `popoverEvent`; the
   deep-link resolver + `pendingDeepLinkId` + overlay-settled flag + hash-away close;
   `hashchange` extension. Import `showToast` from `./toast.js`.
4. `src/lib/events-view.ts` — `eventShareUrl`, `parseEventIdHash`, `occurrenceById`.

## Testing

- **Unit (`events-view.test.ts`):** `eventShareUrl` (encoding); `parseEventIdHash` incl.
  empty, `#county=…`, `#type=…`, bare id, `#main-content`, `#event-<id>`, and malformed
  percent (`#%`, `#%zz`); `occurrenceById` incl. one-off, recurring→next, past-only→none,
  unknown→undefined.
- **Manual acceptance matrix** (jsdom is not installed here): native share (mobile) incl.
  cancel = silent; desktop copy + toast; forced copy failure = honest affordance; baked
  deep-link on load; overlay-only deep-link (pending → resolve after merge); unknown/past id
  (no popover, no filter change); deep-link while another popover is open (defer); hashchange
  to a bare id; hash-away close; backdrop click closes; JS-disabled baked link scrolls to card.

## Scope / non-goals

- Upcoming cards + popover, all three types. **Past-event rows excluded** (minimal,
  non-interactive). No per-event pages, no new routes, no history manipulation.

## Known limitations

- Link-preview bots fetch `/events` without the fragment, so social previews are generic
  page metadata, not event-specific.
- A recurring permalink identifies the *series* and resolves to its next upcoming occurrence,
  not a fixed date (the popover's "Upcoming meetings" list already communicates this).
- A link to an event that has since become past, or an unknown id, lands on `/events` with no
  popover (graceful).

## Out of scope (noted, deferred)

The client `PublicEvent` payload already includes the `organizer` pseudonym and `createdAt`
(in the data island / `/api/events`), though the UI never displays them. This feature does not
newly expose them; whether to strip them from the public projection is filed separately
(background task "Review organizer pseudonym exposure in client event payload").
