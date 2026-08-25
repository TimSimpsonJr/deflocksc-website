# Events council-expansion — design

Four post-launch improvements to the DeflockSC events calendar, on branch
`feature/events-council-expansion` (off master after PR #99 merged). Built in an
isolated worktree because a concurrent effort (`feature/council-leave-behind`)
holds the primary working directory.

## 1. Metro-satellite council sweep (data)

Expand `src/data/council-meetings.json` with verified suburban / satellite **city**
councils across the five SC metros — Upstate, Midlands, Lowcountry, Grand Strand,
Pee Dee — beyond the 30 big-city/county councils already shipped.

- Gather via the proven discover → extract → adversarial-verify workflow
  (`scratchpad/metro-council-gather.js`): per-metro discovery of incorporated
  municipalities with a public-comment council meeting, then per-muni extract +
  independent verify against official sources.
- Each new city slug is added to `src/data/registry.json` (as a `place:` entry)
  and `src/data/city-centroids.json` (regenerated), exactly as York was — which
  also lights the town up as a city pin on the map.
- Build-time strict validation (`council-events.ts`) gates bad data; honest
  "call the Clerk at <phone>" copy where a sign-up rule is not published.
- Tim reviews the verified table before the seed is committed.

## 2. De-slop two chrome bits (daisyUI)

- The "All of SC" back control — currently the bespoke `.map-back` glass pill in
  `src/components/EventsMap.astro` — becomes daisyUI `btn btn-sm btn-neutral` with
  the back arrow. Keeps its top-left position, hidden-until-county-selected
  toggle, and aria-label.
- The "Next" tag — currently the bespoke `.event-pop-upcoming-next` span built in
  `src/scripts/events-page.ts` — becomes daisyUI `badge badge-sm badge-outline` in
  amber. Deliberately not `badge-primary` (red is reserved for the Signal CTA).

## 3. Count each recurring event once per county (map)

`countBy()` in `src/scripts/map/layers/events.ts` counts occurrences, so a
recurring series inflates a county's badge. Dedupe by `occurrence.event.id`
before tallying, so each event counts once. Applied to both the county choropleth
badges and the city-centroid pins for consistency. Unit-tested.

## 4. Shared "find others attending" Signal group on council meetings

One shared council-attendees Signal group (Tim-provided invite) held as a single
constant — NOT stored per council entry, so no change to `councilEventSchema`, the
`publicEventSchema` allowlist, or `toPublicEvent`.

- Each council popover gains a "Find others who may be attending" action.
- Clicking it opens the existing "Before you join" unvetted-Signal warning +
  setup-instructions dialog (`#intake-dialog` in `src/pages/events.astro`),
  generalized so its confirm opens the destination it was opened for (today the
  organizer intake path; now also the council group). On confirm it opens the
  shared group.
- Popover-only, matching the established pattern where the Signal action was
  intentionally removed from the event cards.

## Testing

- Vitest unit tests for the `countBy` distinct-count change and any view helpers.
- `tsc --noEmit` clean of new errors; `astro build` passes (also validates the
  council seed).
- Action-modal smoke test NOT triggered — this batch touches no
  `_headers` / `netlify.toml` CSP / `results-renderer` / `district-matcher` code.

## Execution

Data via the background gather workflow (research only, no file edits). Code via
TDD directly in the isolated worktree (workflow agents would edit the shared
primary working directory and collide with the concurrent leave-behind session).
