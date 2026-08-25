# Council Meetings on the Events Calendar — Design

**Status:** Approved design, pending spec review → implementation plan.
**Branch:** `feature/events-calendar` (folded in before the events-calendar finish pass / PR).
**Depends on:** the existing events calendar (this doc extends it; it does not restructure it).

## Goal

Seed the events calendar with SC **city and county council meetings**, each carrying
plain "how to sign up to speak" instructions, so activists can find a concrete public
forum to show up to. Council meetings must be **filterable separately** from other
public events (many recur indefinitely and would otherwise clog the list), and clicking
one must reveal **its upcoming meeting dates**.

## Design decisions (settled)

| Decision | Choice |
|---|---|
| Initial scope | **Priority jurisdictions first** — Tier-1 ALPR-active counties/cities + a few big cities; expand later. |
| Default list behaviour | **Shown, collapsed per series** — council meetings ride the default list as one row each (reusing the recurring-series collapse), filterable to isolate or exclude. |
| Accuracy bar | **Verify each before shipping** — scrape → cross-check every entry against its official source → user reviews the seed → commit. Every entry links its source. |
| Data model | A third event **`type: 'council'`**, *curated-only* (the submission path stays `meetup`/`public`). |
| Recurrence | `until: null` = **indefinite**, expanded to a rolling horizon; council recurrence carries a **`nths` list** so "1st & 3rd Monday" is **one** entry. |
| Popover | Recurring events (council especially) show an **Upcoming meetings** list of the next several dates. |
| Accent | `council` gets a **blue** type accent, distinct from meetup-amber / public-green. |

## Current state (what we build on)

- `src/lib/recurrence.ts` — `expandOccurrences(startDate, rec, horizonEndIso)`. `rec` is
  `{ freq: 'weekly' | 'monthly_nth'; until: string }`. `monthly_nth` derives the weekday
  and the single nth from `startDate`. The effective end is already `min(until, horizon)`,
  and the whole file is UTC calendar-day arithmetic (see its header — do not weaken this).
- `src/lib/event-schema.ts` — submission validation; `MAX_RECURRENCE_MONTHS = 6`,
  `MAX_MONTHS_AHEAD = 12`. Submission `type` enum is `meetup | public`.
- `src/lib/public-event.ts` — `PublicEvent` (the render/data model) with `type: 'meetup' | 'public'`,
  `hasSignalGroup`, `address`, `recurrence`, `organizer`, and `toPublicEvent()` (allowlist projection).
- `src/lib/events-view.ts` — `matchesFilter`, `filterEvents`, occurrence expansion + `collapseSeries`.
- `src/scripts/events-page.ts` — client render (`buildCard`, `openEventPopover`, filter builders).
- `src/pages/events.astro` — list/popover markup + styles; the type filter radiogroup.
- Events come from the weekly fold into `src/data/events.json` (organizer submissions via
  Netlify Blobs) plus the `/api/events` overlay.
- Toolkit speaking guide: `src/pages/toolkit/speaking.astro` + `src/components/ToolkitSpeaking.astro`
  + `src/data/toolkit-speaking.json`.

## 1. Data model: the `council` type

- `PublicEvent.type` becomes `'meetup' | 'public' | 'council'`.
- **Curated-only.** The *submission* schema/enum stays `meetup | public` — organizers cannot
  post a council meeting. The strict *render* schema (`publicEventSchema`) and a new
  `councilEventSchema` allow `council`.
- A council event is a public gathering: `address` is shown, `hasSignalGroup` is `false`
  (the popover already hides the Signal CTA when false), there is **no `signalUrl`** and no
  `/go/:id`, and `organizer` holds the governing body name ("Greenville City Council").
- Rendering treats `council` like `public` for address display; the **type label + dot use the
  blue council accent**, and the label reads "Council meeting". Type is named in text (never
  colour-only), consistent with meetup/public.

## 2. Data file: `src/data/council-meetings.json`

A version-controlled array, merged into the event list at build alongside the folded
submissions. Keeping it in git makes the seed reviewable in the PR diff — that is how the
"verify each before shipping" bar is enforced.

Entry shape (validated by a strict `councilEventSchema` at build; a bad entry **fails the build**):

```jsonc
{
  "id": "council-greenville-city",          // stable, unique slug
  "type": "council",
  "title": "Greenville City Council",
  "date": "2026-09-07",                      // occurrence #1 (anchor); weekday derived from it
  "time": "18:00",                            // 24h, Eastern (same convention as the rest of the calendar)
  "city": "greenville",                      // jurisdiction slug (must exist in the slug allowlist)
  "county": "greenville",                    // county slug
  "address": "206 S Main St, Greenville, SC 29601",
  "recurrence": { "freq": "monthly_nth", "nths": [1, 3], "until": null },
  "description": "Sign up for public comment by ... . Each speaker gets 3 minutes.",
  "source": "https://www.greenvillesc.gov/...",  // REQUIRED — the official schedule
  "organizer": "Greenville City Council"
}
```

- `source` is **required** for council entries (accountability + the verify workflow anchors on it).
- Build step merges `council-meetings.json` → `PublicEvent[]`, validates each with
  `councilEventSchema`, and concatenates with the folded/overlaid submissions. A validation
  failure aborts the build (no unverified/garbage data ships).
- These entries never touch Netlify Blobs, `/go`, or the submission path.

## 3. Recurrence changes

Two additive changes to `src/lib/recurrence.ts` (and the mirrored type in `event-schema.ts` /
`public-event.ts`). **Preserve the UTC calendar-day discipline and `MAX_OCCURRENCES` bound.**

1. **Indefinite `until`.** `Recurrence.until` becomes `string | null`.
   In `expandOccurrences`, `endMs = rec.until == null ? horizonMs : Math.min(parseIsoDate(rec.until), horizonMs)`.
   Null means "no series end — clamp only by the caller's horizon". Organizer submissions keep a
   required, ≤6-month `until` (submission schema unchanged); only curated council/`until:null` events use it.

2. **Multiple monthly slots (`nths`).** `monthly_nth` gains an optional
   `nths?: Array<1 | 2 | 3 | 4 | 5 | 'last'>`.
   - **Absent** → current behaviour: the single nth derived from `startDate` (back-compatible; all
     existing submissions and tests are unaffected).
   - **Present** → the weekday is still derived from `startDate`; for each month the expansion emits
     **every** listed slot's nth-weekday (`'last'` = the final occurrence of that weekday in the
     month), skipping any that don't exist, merged in date order. `startDate` remains occurrence #1
     and must be one of the produced slots (validated).
   - "1st & 3rd Monday" ⇒ `{ freq: 'monthly_nth', nths: [1, 3], until: null }`, one entry.
   - Weekly councils stay `freq: 'weekly'`. Cadences beyond weekly / monthly-nth(+last) are out of
     scope (see below) — curate as separate entries if ever needed.

`expandOccurrences`'s signature is unchanged; the popover and the list both call it.

## 4. Occurrence expansion + list UX

- The view expansion (`events-view.ts`) passes a **rolling horizon of ~4 months from today** for the
  list (confirm/adjust the current `expandAll` horizon; today it is bounded by `until`). Indefinite
  council meetings therefore expand to that horizon and no further.
- `collapseSeries` already renders one row per recurring series (the next occurrence). Council meetings
  inherit this unchanged — that is what keeps them from clogging the list.
- **Type filter** gains a fourth option. Order: **All / Meetups / Public events / Council meetings**.
  `matchesFilter`: `type: 'council'` matches only `council`; `type: 'public'` matches only `public`
  (excludes council); `meetups` → `meetup`; `all` → everything. So "Public events" cleanly excludes
  council, and "Council meetings" isolates them, per the requirement. The radiogroup keeps its ARIA +
  keyboard behaviour (reuse the existing type-filter component and the tabs-box styling).

## 5. Popover: "Upcoming meetings" list

For **any event with a recurrence** (council, recurring meetup, recurring public), the detail popover
adds an **Upcoming meetings** section below Where/Address:

- Compute the next occurrences client-side via `expandOccurrences(startDate, recurrence, horizon)`
  (horizon ≈ today + 4 months, matching the list), drop past dates, show the **next N (default 6)** as a
  bordered list — each row `Weekday, Mon D` + the time; the first tagged **"Next"**.
- A muted footer line states the cadence in words and whether it recurs indefinitely
  ("Recurs indefinitely · showing the next 6" / "Repeats weekly", etc.).
- One-off (non-recurring) events show **no** list (unchanged popover).
- Styling: reuse the deflock dark popover; amber links; the council type label in blue. Mockup of the
  structure was reviewed and approved.
- Keep it accessible: a real list, readable contrast, no reliance on colour.

## 6. Data-gathering workflow (runs after the code lands)

A `Workflow`, **one lane per priority jurisdiction**:

1. **Extract** — an agent (WebSearch/WebFetch, and the browser for agenda systems —
   Legistar / Granicus / CivicClerk / municipal sites) finds the official meeting cadence, time,
   location, and the public-comment sign-up rule; emits a structured draft entry
   (title, weekday+`nths` or `weekly`, time, address, city/county slugs, sign-up text, `source`).
2. **Adversarially verify** — a second agent re-checks **every field against the cited source**,
   especially the cadence and the sign-up rule; flags any field it can't confirm as
   `needs-manual-research` rather than guessing.
3. **User review** — the verified draft (a rendered table or the JSON diff) is presented for the
   user's approval before anything is committed to `council-meetings.json`.

Priority set is drawn from the existing Tier-1 research + action-letters cities. Municipal sites vary;
the workflow **never ships an unverified field** (per the accuracy bar), and gaps are surfaced for
manual fill. Exact lane list + agent prompts are the implementation plan's job.

## 7. Toolkit link

In the toolkit speaking guide (`ToolkitSpeaking.astro` / `toolkit-speaking.json` / `speaking.astro`),
add a link/CTA to the events page filtered to council meetings (e.g. `/events#type=council`) —
"Find your council's next meeting". (The CTA copy is the only new outward-facing prose; run it through
`copydesk:write` when authored. The per-meeting sign-up instructions are terse factual instructions
sourced during gathering, not voice prose.)

## 8. Testing

- `recurrence.ts`: `until: null` expands to the horizon only; `nths` multi-slot (1st & 3rd Monday
  produces the right sequence; `'last'` resolves correctly; missing slots skipped; UTC-correct across a
  DST boundary); back-compat — absent `nths` = unchanged single-nth; `MAX_OCCURRENCES` still caps.
- `events-view.ts`: `matchesFilter` — `public` excludes `council`, `council` isolates, `all` includes;
  collapse-per-series with a council series.
- `councilEventSchema`: rejects a missing `source`, a bad recurrence, an unknown city/county slug; the
  build merge concatenates + validates.
- Popover: upcoming list shows the next N for a recurring event, "Next" on the first, none for a one-off.
- A11y: the 4th filter option keeps radiogroup semantics; the type label names `council`.

## 9. Security / invariants preserved

- Council entries have **no `signalUrl`** and no `/go` — nothing to leak.
- The curated file is **strictly validated at build**; a bad entry fails the build (no unverified data ships).
- **Submission path unchanged**: organizers still cannot submit `council` (submission enum stays
  `meetup | public`); the honeypot, code gate, blob fail-closed, and `publicEventSchema` strict projection
  are untouched.
- UTC recurrence discipline and the `MAX_OCCURRENCES` bound are preserved.

## 10. Out of scope / future

- Cadences beyond weekly and monthly-nth(+`last`) — e.g. "every other week from date", quarterly.
  Curate around it for now; extend the model only if a real jurisdiction needs it.
- Automated periodic re-verification / re-scrape of the seed (schedules and sign-up rules drift).
- Expanding past the priority jurisdictions (later phases, same pipeline).

## 11. Rollout sequence

1. **Code** — data model, recurrence (`until:null` + `nths`), build merge + `councilEventSchema`,
   4th filter option, popover upcoming-list, toolkit link. One implementation plan; all behind unit tests.
2. **Data** — run the gathering workflow → verify → user review → commit `council-meetings.json` seed.
3. Then resume the events-calendar **finish pass** (dummy-data teardown, dev-page deletion, PR).
