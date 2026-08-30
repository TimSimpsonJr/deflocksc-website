# Homepage Rebuild — Design Spec

## Revision history

Rev 2 (2026-08-30): folded in Codex + Fable design-review findings and user decisions.
Rev 3 (2026-08-30): round-2 gate fixes — camera generator, mobile map-open, icon glyph, movement-stat wording, consistency.
Rev 3.1 (2026-08-30): movement-stat verb corrected to span the tracker's full 109 (Codex round-3); Fable nits folded (stale-caption flag, pointInPolygon coordinate-order note).

**Date:** 2026-08-30
**Branch:** `feature/homepage-rebuild`
**Status:** Design locked (user-approved through brainstorm); this doc transcribes it for review + implementation.
**Visual/copy source of truth:** `docs/plans/assets/2026-08-30-homepage-mockup.html` (the v-final ship mockup, committed to the repo). Where this doc and the mockup could ever disagree, the mockup governs — except where a Rev 2 decision below explicitly overrides mockup chrome (nav, footer, stat values, the count-up reset bug).

## 1. Overview / goals

Ground-up recomposition of the DeflockSC homepage. "Rework from the ground up" means:

- `src/pages/index.astro` is recomposed from a new section list. Two existing components survive (Hero trimmed, MapSection recentered/leaned); everything else on the current homepage is cut or replaced by new section components.
- The page moves from an Upstate/Greenville frame to a **statewide South Carolina** frame (copy, map center, stats).
- The funnel is rebalanced: **inform** (hero, blog, impact stats, map) → **legislation** (the Oconee-modeled ask) → **act** (speak at council, toolkit, events, Signal). One combined conversion zone replaces the old scattered CTAs.
- Architecture: vanilla Astro on the daisyUI `deflock` theme foundation (PR #104). **No React islands** — explicitly deferred.
- The map section depends on PR #103 (live per-viewport camera data + earlier declustering). This rebuild changes only the map's initial view + framing, never the shared map internals. **Sequencing (hard):** rebase/merge `feature/map-live-data` (PR #103) into `feature/homepage-rebuild` **before** implementing §2.4 — §2.4 edits `MapSection.astro`'s inline script, exactly the code #103 rewrites (and where `MAP_CENTER`/`MAP_ZOOM` live today).

Ship-page section order (the mockup's DOM order — note blog sits directly after the hero, in the slot the deferred scrollytelling mechanism would have occupied):

| # | Section | Mockup id | Band bg (daisyUI token) |
|---|---------|-----------|-------------------------|
| 1 | Hero | — | `base-300` (#0d0d0d) |
| 2 | Blog carousel | `#blog` | `base-200` (#1a1a1a) |
| 3 | Impact stat band | — | `base-300` |
| 4 | Camera map (SC-wide) | `#map` | `base-100` (#171717) |
| 5 | Legislation / ordinance asks | `#legislation` | `base-200` |
| 6 | Take Action (speak at council + toolkit) | `#act` | `base-300` |
| 7 | Events strip | `#events` | `base-100` |
| 8 | Signal signup | `#stay` | `base-200` |

Bands alternate `base-300 / base-200 / base-100` with a 1px `border-top` (`rgba(255,255,255,0.10)`) between sections and shared vertical rhythm `padding-block: clamp(3rem, 7vw, 5.5rem)`; content sits in a `max-width` shell (mockup: 1120px, `padding-inline: clamp(1rem, 4vw, 2.25rem)`).

**Legacy anchor continuity (Rev 2).** The new homepage carries the legacy anchor ids so existing deep links keep resolving with zero content edits elsewhere:

- The map section keeps **`id="camera-map"`** on the live map element (it is both the MapLibre mount and the legacy anchor target today, so retaining the element id preserves `/#camera-map` automatically). The section wrapper takes the mockup's `#map` id.
- The Legislation section gets **`id="bill-tracker"`** in addition to its semantic `id="legislation"` — one element can't carry two ids, so place `bill-tracker` on a zero-height anchor target (or the section heading) at the top of the section.

Because those two anchors survive, the existing published blog-post links resolve unchanged: `/#bill-tracker` (x5) and `/#camera-map` (x4 — building-deflocksc x2, how-to-fight-alpr x2; Rev 3 count correction) across published posts. **There are NO blog-content link edits in this rebuild** (supersedes any earlier "update blog links" language). Footer: see below.

**Nav (Rev 2 decision D1): keep the full sitewide nav.** `Nav.astro` — rebuilt in the daisyUI migration with Home / Toolkit (dropdown) / Blog / Events links plus a mobile hamburger — stays essentially as-is; **no redesign**. The mockup's slim anchor-only nav is **mockup chrome only**. The only homepage requirement is that anchor targets exist for any on-page links (satisfied by the section ids above).

**Footer (Rev 2, hard user constraint: don't change the footer links; repoint only the two orphans).** `Footer.astro`'s "Explore" list has six links. Four are **left byte-for-byte unchanged** — `/toolkit`, `/blog`, `/#camera-map`, `/#bill-tracker` — the two hash links keep working via the legacy anchors above. Only the **two orphans** whose sections are deleted get repointed (labels stay "How ALPR Works" and "FAQ"):

- `/#how-it-works` → `/blog/the-4th-amendment-loophole` (the most relevant published ALPR-explainer post — how the private dragnet works and why it skirts the warrant requirement; the other explainer candidates are still drafts).
- `/#faq` → `/toolkit/legal` (nearest Q&A-style content; non-duplicative with the existing `/toolkit` and `/blog` footer links).

This supersedes Rev 1's "the existing `Footer.astro` stays as-is": Footer.astro moves to the Modified list, scoped to ONLY these two `href` values. The mockup's review banner ("Rebuild mockup for review") and its simplified footer remain **mockup chrome only** — not shipped.

## 2. Section-by-section spec

### 2.1 Hero (KEEP, trimmed) — `src/components/Hero.astro` (modified)

**Purpose:** statewide hook. Branding + camera PNG + animated SVG light cones + headline survive intact.

**Keep** (verbatim from current Hero.astro):
- Camera `<picture>` (responsive webp/png srcset, blur/brightness filter, mask fade).
- Animated SVG light cones (`#hero-cones`, `cone-sweep` keyframes, randomized duration/delay/direction script, outer cones hidden < 768px, `prefers-reduced-motion` disables animation).
- Red rule + `data-reveal` staggered entrance on the text block.
- Primary CTA `Contact Your Reps` with `data-open-action` (opens the action modal).

**Cut** (confirmed against Hero.astro lines 58–72): the top metadata bar — the `hidden md:flex` dossier block with the four sub-elements *Subject / Automated License Plate Readers*, *Jurisdiction / State of South Carolina*, *Status / Unregulated · Active Deployment*, *Record Count / 422,000,000+ Reads*. These are exactly the "subject/jurisdiction/status/record-count sub-elements" the locked design removes (the 422M figure moves into the impact band).

**Copy** (mockup, verbatim):
- H1 (unchanged apart from the closing period): `In 1984, the Thought Police weren't looking for criminals. Neither is Flock Safety.` — "Flock Safety" in `#dc2626`.
- Sub (unchanged): `99% of the plates they scan belong to people suspected of nothing.` — "99%" in red, tabular-nums.
- Support (REPLACES the current "242 cameras are watching Upstate…" paragraph): `South Carolina has more than 1,600 of these cameras logging your daily movements, and not one state law that says who can look, or for how long they keep it.` — the "more than 1,600" prose floor is tied to the data refresh (§4.1).
- CTAs: primary `Contact Your Reps` (`data-open-action`) + **new** secondary outline button `See the map` → anchor scroll to `#map`.

The mockup's flat-CSS hero scene (grid lines + faux cones) is a stand-in; the live hero keeps its existing animated scene (the mockup says so in its own `hero-standin` note).

### 2.2 Blog carousel — new `src/components/BlogCarousel.astro` (replaces `BlogPreview.astro`)

**Purpose:** depth/credibility directly after the hook; occupies the slot reserved for the deferred mechanism section.

**Heading:** `From the blog`.

**Layout:** horizontal CSS scroll-snap carousel — pure CSS, no JS (`display:flex; gap:1rem; overflow-x:auto; scroll-snap-type:x mandatory`), cards `flex: 0 0 280px; scroll-snap-align:start`, thin visible scrollbar, hint line below: `↔ Scroll for more` (mono label idiom, arrow `aria-hidden`). The container carries `tabindex="0"` + `aria-label="Blog posts, horizontal scroller"` so keyboard users can arrow-scroll it. No auto-advance, so no reduced-motion special-casing and no carousel script at all (the old HowItWorks carousel's script does not exist on this branch — §3).

**Card** (mockup `post-card`, daisyUI `card` base): thumb (aspect 16/10, 1px border) → mono category label → title (h3) → `Read →` mono label pinned to the bottom. The whole card is one `<a>` to `/blog/{post.id}` (follow BlogPreview's whole-card-link pattern; mockup's inert `<article>` is mockup-only).

**Data:** identical query to today's `BlogPreview.astro` — `getCollection('blog')`, filter `!draft`, sort by date desc, `slice(0, 5)`. Card fields: `featuredImage` (+`featuredImageAlt`) for the thumb, first `tags[]` entry for the category label, `title`. `tags` is optional in the blog schema: when a post has no tags, **omit the category label entirely** (never render an empty one). Thumb fallback when a post has no `featuredImage`: the mockup's decorative "lens" placeholder (red ring on dark gradient, `aria-hidden`). The five titles in the mockup are the real current posts — live data, not hardcoded copy.

**Responsive:** the carousel is inherently one-row at all widths; cards stay 280px and the container scrolls. No breakpoint variants needed. (Grid-vs-carousel: resolved — carousel, per the approved mockup; Open Questions #3.)

### 2.3 Impact stat band — new `src/components/ImpactBand.astro`

**Purpose:** the scale, in three numbers, with count-up animation.

**Heading:** `The scale of it, in South Carolina`

**Stats** (one bordered `base-100` grid, red values, mono uppercase captions):

| Value | Caption | Source |
|-------|---------|--------|
| `1,624` (real computed figure — regenerated at build, §4.1; mockup shows the earlier working number 1,676) | `ALPR cameras tracked in SC` | fresh camera-count build (`src/data/impact-stats.json`) |
| `110+` | `SC agencies running them` | statewide research (static, `src/data`) |
| `422M+` | `Plate reads · SLED, 2019–22` | SLED figure (static, moved here from the old hero metadata bar) |

**The iPad divider fix (final responsive stat layout, from the mockup):** during design review the 5-stat band broke on iPad — the grid wrapped to 2+ columns per row and the vertical dividers landed wrong. The fix, which the mockup encodes and this spec mandates:

1. The impact band holds **exactly 3 stats in 3 columns at every width** (`grid-template-columns: repeat(3, 1fr)`; dividers are `border-left` on non-first cells). Below 560px, **type and padding shrink** (`clamp` font sizes down to ~1.15rem, padding 1.15rem 0.7rem, caption 0.55rem) — the column count never changes, so the dividers can never mis-stack.
2. The remaining two stats (`0 · State laws regulating ALPR`, `100+ · Communities have canceled, rejected, paused, or rolled back Flock nationwide`) **moved out of this band entirely**, down into the legislation section as its closing 2-column `ask-frame` (§2.5). Same shrink-don't-wrap rule there. (The committed mockup's ask-frame still shows the stale `80+` **and its stale caption** — lines 593–594 — just as it shows the stale 1,676 camera count; ship the corrected `100+` value and caption.)

The `0` stat renders its value in amber (`istat zero` treatment) — the one non-red stat on the page.

**Count-up:** all stat values (plus the map statline numbers, §2.4) animate 0 → final on first scroll into view; see §7 Motion for the shared implementation and §6/§8 for its a11y contract (final value always in the DOM for AT; never a partial/zero exposed). Movement framing: the "100+ communities have canceled, rejected, paused, or rolled back Flock" line is the campaign's movement-momentum stat; citation resolved (§4.3 — DeFlock's national cancellation tracker, as of Aug 2026).

### 2.4 Camera map, SC-wide — `src/components/MapSection.astro` (modified)

**Purpose:** the "see it near you" proof, reframed statewide.

**What changes vs. the current MapSection:**
- **Recenter on South Carolina as a whole.** Today: `MAP_CENTER = [-82.39, 34.85]`, `MAP_ZOOM = 11` (Greenville). New: initial view fits the SC bounding box (approx `[[-83.35, 32.03], [-78.54, 35.22]]`) with padding, rather than a hardcoded center/zoom, so the whole state is in frame at any viewport. **Mechanism (resolved, Rev 2):** in MapSection's own inline script, call `handle.map.fitBounds(SC_BBOX, { padding, duration: 0 })` (or the equivalent `jumpTo`) immediately after `createMap` returns — this needs no change to the out-of-scope shared `src/scripts/map/core.ts`. **Sequencing:** rebase/merge `feature/map-live-data` (PR #103) into this branch **before** implementing this section — #103 rewrites the same inline script. Non-blocking positive from review: PR #103's tile loader handles the SC-wide viewport (the SC bounds intersect only a few 20° tiles, well under its 8-tile cap), which lowers the clustering-density risk at statewide zoom — but still verify density in the smoke pass. `src/scripts/map/core.ts`, `layers/cameras.ts`, popups, style are shared with the events map and remain out of scope.
- **The section leans out.** The current two-column Upstate essay (Greenville/Spartanburg/Wright paragraphs), ghost "242" numeral, and right-hand stat column are all cut (their statewide replacements live in the impact band and legislation section).

**New layout** (mockup): single heading, then a 2-column grid ≥ 900px (`1.7fr 1fr`, map left / side column right), stacking to one column below.

- Heading: `These cameras are watching your South Carolina town right now.`
- Map frame: the existing live MapLibre embed (`#camera-map`, which also remains the legacy `/#camera-map` anchor target — §1) inside a bordered rounded frame. Critical CSS from the mockup (transcribed because it fixes a real overflow bug): the frame needs `width:100%; min-width:0; aspect-ratio:16/9; min-height:320px;` — width must stay definite (= the grid track) so `aspect-ratio` derives *height*; otherwise aspect-ratio + min-height derive *width* (~569px) and overflow narrow tracks, scrolling the body. The current `#map-container` carries `clip-path: inset(0)` (the repo's blur-bleed gotcha fix — CSS `filter: blur()` bleeds past `overflow: hidden`); **carry `clip-path: inset(0)` onto the new bordered frame** unless the new frame demonstrably contains no filtered/blurred children, in which case note the removal in the PR.
- Side column: statline `[1,624] cameras · [37] jurisdictions` (red tabular numbers, count-up; both values computed at build from `src/data/impact-stats.json`, §4.1; mockup shows the earlier working number 1,676) → caption `On the real site this is the live, interactive MapLibre map: pan across the state, tap any dot to see the vendor, operating agency, and direction each camera faces.` — **adapt this caption**: it was written for the mockup's stand-in frame; the live page should describe the map directly, e.g. `Pan across the state, tap any dot to see the vendor, operating agency, and direction each camera faces.` (copy passes the copydesk gate at build) → outline button `Open the full map`.
- **`Open the full map` behavior (Rev 2 decision D3, reworked in Rev 3 for mobile):** Rev 2's plain scroll+focus fails on mobile — `#camera-map` sits inside the mobile `#map-frame`, which stays `display:none` (`hidden md:block`) until the existing toggle button reveals it and initializes the map, so scrolling/focusing alone lands on nothing, and a mobile `/#camera-map` hash visit wouldn't land on visible content either. **Define ONE shared "open-map" operation:** reveal `#map-frame` if hidden (hiding `#map-button-container`, exactly as the current toggle handler does) → initialize the map + `handle.resize()` (the existing `loadMap()` flow) → scroll the map into view (`scrollIntoView({ behavior: 'smooth' })`, instant under reduced motion) → move keyboard focus to the map region — the `#camera-map` frame / its labelled `role="application"` container (programmatically focusable via `tabindex="-1"` if it isn't already). This single operation is invoked from THREE call sites: (a) the existing mobile toggle button (keeping its umami event), (b) the new `Open the full map` CTA, and (c) initial-load + `hashchange` handling for `#camera-map`. On desktop, where the map is already visible/initialized, the op reduces to scroll+focus. This reconciles D3 with the retained mobile toggle flow and keeps the legacy `/#camera-map` anchor working on mobile. No standalone map page, no expand-in-place.

**Keep from the current component:** lazy-load via IntersectionObserver (desktop), the mobile toggle button flow (`map-toggle` → reveal + `handle.resize()`, with its umami event — now routed through the shared open-map operation above), the scroll-zoom toggle button, the "ALPR Network" live badge, and the OpenFreeMap/OSM/Deflock.org attribution block.

### 2.5 Legislation / ordinance asks — new `src/components/LegislationAsks.astro`

**Purpose:** replaces BillTracker. The ask is now local ordinances patterned off the Oconee County ordinance ("SC's first, advancing"), not stalled statehouse bills.

**Heading:** `What we're asking every SC council to pass.`

**Oconee callout** (bordered `base-200` card, amber `First in SC` badge + one paragraph, verbatim from mockup):

> Oconee County is advancing South Carolina's first ordinance of its kind: "Protection from Mass Surveillance." It cleared its first reading 4–1 on Aug 18, 2026, with the final vote set for Sept 15. Here are the provisions we've modeled on it for every SC council, two of them tailored to city or county authority.

(Date-staleness risk after the Sept 15 vote: Open Questions #7.)

**Six ask cards**, 2-column grid (1-column < 720px), deck-card style mirroring the council leave-behind's provisions cards: a Tabler **icon in a bordered 44×44 well** (red icon on `base-100`, `radius-box`) replaces the number, title beside it, description below, mono cite line at the bottom. Cards 5–6 additionally carry an outline scope badge (`City` / `County`) right-aligned in the head row.

These are the 6 ask provisions from `src/data/council-brief.ts` (the city brief's 5 cards ∪ the county brief's 5 cards = 3 shared + the money/property card + the city-only audit-logs card + the county-only side-doors card). The homepage renders **abridged bodies** (approved via the mockup); titles and cites align with the brief. Copy verbatim from the mockup:

| # | Icon (Tabler) | Title | Body | Cite | Scope |
|---|---------------|-------|------|------|-------|
| 1 | `route` | Define the problem by capability | It never names Flock: a system is covered when it logs people or vehicles in public and can build a searchable location history, track across places, run facial recognition, or share to an outside network, while a basic hot-list plate check is carved out. | Oconee § 2-502 | — |
| 2 | `cash-banknote-off` | Keep public money and property out of it | No public funds, subscriptions, power, or communications may support a covered system, and none of it may sit on public property or road rights-of-way. | Oconee §§ 2-504 to 506 | — |
| 3 | `calendar-dot` | Set a firm removal timeline | For a system already in place, outside data-sharing and funded connections stop within 10 business days of notice and the equipment comes down within 30, turning a pause into a removal on a fixed schedule. | Oconee § 2-507 | — |
| 4 | `clipboard-clock` (homepage-only glyph, mockup path data — NOT CouncilBrief's `clipboard`; see icon note) | Report publicly, and enforce it | The policy is administered, reported in public once a year, and backed by defined remedies when the rules are broken, so it stays accountable to the people it covers. | Oconee §§ 2-514 to 515 | — |
| 5 | `file-search` (same as CouncilBrief `ICONS['file-search']`) | Publish the audit logs | Post a plain public record of every search on a regular schedule, who ran it, when, and the reason they gave, so audits catch misuse without waiting for a complaint. | A city addition, beyond Oconee | City |
| 6 | `building-off` | Close the side doors | The county can condition its discretionary money to towns, its accommodations-tax funds, and its sponsored events on the same rule, and bar anyone from routing the system through a nonprofit or festival committee to dodge it. | Oconee §§ 2-508 to 510, 2-513 | County |

Icon note (Rev 2, resolves review finding E + Open Questions #6; share arithmetic corrected Rev 3): the mockup's inline SVG path data is authoritative for the glyphs. The glyphs currently live in `CouncilBrief.astro`'s **private, component-local `ICONS` map** — NOT in `council-brief.ts` — so a data module cannot import them as Rev 1 implied. **Fix: extract `ICONS` into an importable module `src/data/brief-icons.ts`** that both `CouncilBrief.astro` and the new `LegislationAsks.astro` import. The correct share arithmetic is **1 truly-shared glyph (`file-search`) + 5 homepage glyphs**: Rev 2 counted `clipboard` as shared, but the mockup's card-4 glyph has a clock-FACE circle that CouncilBrief's `clipboard` path (clock hands, no face) lacks — it is a different drawing. So the five homepage glyphs (`route`, `cash-banknote-off`, `calendar-dot`, `clipboard-clock`, `building-off`) are added to `brief-icons.ts` as their own keys using the mockup's path data — the full mockup clipboard-clock path lands under its **own `clipboard-clock` key**, and the shared `clipboard` glyph is **not modified** (changing it would alter CouncilBrief's rendered output, contradicting §5's "rendered output identical" promise). This inline module is the **primary mechanism**; astro-icon + `@iconify-json/tabler` stays optional (nearest-Tabler names above are for lookup if it is adopted — where a name is ambiguous, the mockup's path data governs). Five of the six mockup glyphs differ from the historical CouncilBrief `ICONS` keys (`route` vs `scan`, `cash-banknote-off` vs `money-off`, `calendar-dot` vs `clock`, `clipboard-clock` vs `clipboard`, `building-off` vs `door`) — the mockup governs the homepage.

**Data module:** new `src/data/homepage-asks.ts` — a projection that imports from `council-brief.ts` where content is shared (canonical cites) and from `src/data/brief-icons.ts` for glyphs, carrying the homepage-abridged titles/bodies above, with a comment pointing at `council-brief.ts` as the canonical long-form.

**Cite drift guard (Rev 2, redesigned so it passes on day one):** each homepage ask distinguishes a **canonical `cite`** (must exactly match a `cite` present in a city or county brief card in `council-brief.ts`) from an **optional homepage display suffix**. Card 5 is the concrete case: canonical cite `A city addition` (matches `council-brief.ts`), display suffix `, beyond Oconee` — the homepage renders `A city addition, beyond Oconee`, but the vitest guard checks **only the canonical `cite` field** for exact membership in the union of city+county brief cites. (Rev 1's exact-match-on-display-string guard would have failed immediately on card 5.) The rendered cite line is always `cite + (displaySuffix ?? '')`.

**Closing `ask-frame`** (the two stats relocated from the impact band, §2.3): 2-column bordered band — `0 / State laws regulating ALPR` (amber value) and `100+ / Communities have canceled, rejected, paused, or rolled back Flock nationwide` (red, sourced per §4.3). Count-up applies. Columns hold at 2 at every width; type shrinks below 560px. (The committed mockup's ask-frame still shows the stale `80+` **and its stale caption** — lines 593–594 — just as it shows the stale 1,676 camera count; ship the corrected `100+` value and caption.)

### 2.6 Take Action zone (combined conversion) — new `src/components/TakeActionZone.astro` + `EventsStrip.astro` + `SignalCta.astro`

One conversion zone spanning three consecutive bands (`#act`, `#events`, `#stay`), merging the old standalone TakeAction band, the CitizenToolkit bento, and the conversion CTA. The emphasis is **speaking at city/county council meetings** — that is the primary action; everything else is support (toolkit) or depth (events, Signal).

#### 2.6a `#act` — speak at council + toolkit (`TakeActionZone.astro`)

- Heading: `The most powerful thing you can do: speak at your city and county council.`
- Lead: `A camera contract is decided in a room you're allowed to stand up in. Find who represents you, then show up: three minutes of public comment moves more than a thousand clicks.`
- **Modal posture (Rev 2 decision D2): the existing general-representative modal flow is KEPT, fully unchanged** — no "council-first modal mode", no changes to the action modal or district-matching logic (simpler, lower-risk; the modal already returns city/county council members among the reps). The homepage copy is softened instead: the button/label promises "find who represents you / find your representatives," never a council-only result, while the surrounding prose keeps the accurate "show up and speak at your council" emphasis.
- CTA row: primary lg `Find your representatives` (`data-open-action` — same action modal, untouched) + outline lg `Grab the one-page council brief` → **`/toolkit/speaking`** (resolved-by-default, Open Questions #5: a single button; `/toolkit/speaking` hosts both the city and county briefs plus the talk track, so no chooser is needed).
- Note under CTAs (softened per D2; copydesk gate at build): `The Contact Your Reps flow matches your address to everyone who represents you — including your city and county council — in seconds. Print the one-page brief and hand it across the dais: it's plain-language, sourced, and stands on its own.`
- **Toolkit row** — four link cards (daisyUI `card` + the mockup's `card-link` hover: border brighten, `translateY(-2px)` lift + arrow slide gated behind `@media (hover:hover)` so touch never sticks). 4 columns → 2 (< 900px) → 1 (< 480px). Each card: title + red `→` arrow, one-line desc, one outline badge. Copy verbatim:

| Card | Href | Desc | Badge |
|------|------|------|-------|
| FOIA templates | `/toolkit/foia` | Ready-to-send public-records letters for any SC agency running Flock. | Templates |
| Public-comment scripts | `/toolkit/speaking` | Three-minute remarks you can adapt and read straight from the podium. | Scripts |
| Outreach materials | `/toolkit/outreach` | Flyers, briefs, and social graphics to rally your neighbors before the vote. | Print + social |
| Know your rights | `/toolkit/legal` | What SC law does and doesn't allow, and what to say when you're recording in public. | Legal |

Cards are real `<a>` links (mockup's `tabindex="0"` articles are mockup-only).

#### 2.6b `#events` — events strip, the "Depth" tier (`EventsStrip.astro`)

- Heading: `Upcoming events: show up.` Lead: `The room is where it's decided. Here's where to be next.`
- **Three event cards** in a 3-col grid (1-col < 840px): big day numeral (red, mono) + month/year label → type badge → title → 1–2 line description → location/time line. Below the grid: `See all events →` linking to `/events`.
- **Data (Rev 2 rewrite — the record-level filter was wrong):** the current dataset is **`src/data/events.json` = `[]` (zero submitted records)**; every candidate event is one of the **~83 recurring council-meeting series** from `loadCouncilEvents()` (each carries `recurrence` with `until: null`). A record-level "filter `date >= today`, sort, `slice(0, 3)`" therefore fails three ways: it drops recurring series whose *base* date has passed, it prints the base date instead of the next occurrence, and it decays to zero over time (permanently hiding the section). **Mandated pipeline — reuse the exact helpers `src/pages/events.astro` already uses from `src/lib/events-view.ts`:** parse baked `src/data/events.json` with the strict `publicEventSchema` / `toPublicEvent`, push `loadCouncilEvents()`, then `expandAll(events, horizonEnd)` over a bounded horizon (`horizonEnd = addMonths(today, 12)`, matching events.astro) → `splitByToday(occurrences, today)` → `collapseSeries(upcoming)`. Because the occurrence list is sorted ascending, `collapseSeries` keeps each series' **NEXT upcoming occurrence** — each card renders **that occurrence's date**, never the record's base date.
- **Composition (Rev 2 decision, Fable#13):** 83 standing recurring council meetings would otherwise fill all 3 slots forever. From the collapsed upcoming list, **cap routine council meetings at max 2** (max 1 whenever any non-council event exists in the window): prefer real submitted organizing events (`public`/`meetup`) when any exist, fill the remainder with the soonest council meetings, then take 3 total, re-sorted by occurrence date. **Deterministic tie-break:** the pipeline's `sortKey` (date → time → id) already gives a stable total order; same-date, same-time council meetings therefore order by their stable jurisdiction-derived event ids — no additional sort logic needed, but the cap-and-fill selection must preserve that order so the strip is reproducible build-to-build. Practical launch state: with zero submitted events, the strip shows the 2 soonest council meetings (the cap makes the sparse 2-card render the norm, not a bug) — "mostly routine council meetings" is the expected day-one look.
- **Baked-only:** the homepage strip does NOT run the events page's client overlay merge; the weekly fold keeps it fresh. (Consequence: a just-submitted event appears on `/events` before the homepage. Accepted.)
- **Type badges/labels:** reuse **`eventTypeLabel()` from `src/lib/events-view.ts`** (the single source of truth) — council `Council meeting` (warning/amber badge), public `Public event` (outline), meetup `Location in group` (outline). Meetup privacy holds on the homepage exactly as on `/events`: **never print a meetup's location** (the `toPublicEvent` projection already strips `signalUrl` etc.; the card's location line renders only for public events and council meetings).
- Cards link to `/events` (per-event detail lives in the events page popover).
- Empty/sparse state: render however many upcoming events exist (1–3); if zero, hide the section entirely. **Rev 2 note:** with 83 standing `until: null` council series expanded over a 12-month horizon, the zero-state is **effectively unreachable** — it stays specced only as a defensive fallback (resolves Open Questions #8).

#### 2.6c `#stay` — Signal signup (`SignalCta.astro`)

Centered bordered panel (max-width 640px). Copy verbatim from the mockup:

- Heading: `Stay in the loop.`
- Lead: `Organizing happens fast, and votes get scheduled with little notice. Join the DeflockSC Signal group to hear about hearings and actions before they happen.`
- Primary lg button: `Join the Signal group` (`id`, **no `href`** — see countermeasure below).
- Safety note (inline, always visible, amber lead-in): `Heads up: this group is open and unvetted: anyone can be inside it. Join with a pseudonym, not your real name, and share only what you'd be comfortable seeing made public.` — the word **"pseudonym"** is required copy (never "real name" as the instruction).

**Scraper countermeasure — same posture as the events page** (verified in `src/pages/events.astro` + `src/scripts/events-page.ts` + `netlify/functions/go.ts`):

1. The CTA is a `<button>` carrying **no `href` and no `data-*` URL** — the destination appears nowhere in the prerendered HTML.
2. A click handler sets `window.location.href = '/go/intake'` **at click time**, so the path lives only in the bundled JS, is absent from view-source, and a scraper that never clicks never harvests it. (The mockup's `atob` wrapper is equivalent flavor; the shipped implementation should match the events page exactly: plain literal in the bundled module, click-time assignment.)
3. `/go/intake` is the existing Netlify function (`netlify/functions/go.ts`): the literal id `intake` is special-cased to resolve the operator's vetting-page Signal link from the Blobs `links` store (key `intake`, written by the CLI's `set-intake`), re-validated with `validateSignalUrl`, and refused identically when unset/invalid. This is the Bitpart-managed intake the events page already uses — **no new endpoint is created**; the homepage points at the same one.
4. Any explanatory comment near the button must be an **Astro comment**, not an HTML comment, so the build strips it (events.astro precedent — an HTML comment would leak the path into static markup).

Unlike the events page, the homepage does not open the "Before you join" dialog: the safety note is inline and always visible, and the click navigates directly (mockup behavior). The events page's dialog copy remains canonical for the longer warning language. **Analytics (Rev 2 decision, Fable#14): the Signal CTA fires NO analytics event** — no `umami.track` call — consistent with Base.astro excluding `/events/*` from analytics entirely (the subpoena threat model: a record of who moved toward the Signal group is exactly what a subpoena would want).

## 3. Cut & deferred

**Cut from the homepage** (components deleted unless another page imports them — verify with grep before deleting; as of this writing all are homepage-only):

- `src/components/HowItWorks.astro`, `src/components/HowItWorksOverlays.astro`, `src/scripts/case-studies.ts` — the how-it-works carousel + case-study overlays. (Rev 2 correction: `src/scripts/carousel.ts` was on Rev 1's delete list but **does not exist on this branch** — HowItWorks imports only `case-studies.ts`.)
- `src/components/BillTracker.astro` (+ its bill modal markup/script) **and `src/scripts/bill-tracker.ts`** (imported only by BillTracker.astro; orphaned by its deletion — Rev 2 addition) — replaced by the Legislation section. `src/data/bills.json` and `scripts/scraper.py` + its GitHub Action **stay** (data keeps updating for future use; removing the pipeline is out of scope).
- `src/components/FAQ.astro` — cut entirely. Consequence: the homepage loses its FAQPage JSON-LD schema (SEO). Accepted under the locked design; a future standalone `/faq` page could reclaim it (out of scope, one-line pointer only). **Also delete the FAQ sidebar CSS block in `src/styles/global.css`** (`.sidebar-btn` / `.sidebar-active`, ~line 298 — its own comment says "homepage FAQ only … delete with the homepage rebuild"; toolkit consumers already migrated to `.rail-tab`).
- `src/components/TakeAction.astro` — merged into §2.6.
- `src/components/CitizenToolkit.astro` — superseded by the toolkit row in §2.6a (the four `/toolkit/*` pages themselves are untouched).
- `src/components/BlogPreview.astro` — replaced by `BlogCarousel.astro`.

**Deferred (deliberately NOT on the shipped homepage):** the "how it works" scrollytelling mechanism section (dragnet/RTIC diagrams). Future work, one line for the record: Metaphor A — the map lights up, then bleeds outward; real MapLibre, vanilla JS. The blog carousel occupies its slot until it lands.

## 4. Data & sourcing

### 4.1 Camera counts — ONE atomic refresh job (Rev 2 rewrite)

**Real figures, computed from current data (camera snapshot of 2026-08-26):** SC total = **1,624** cameras (unique camera IDs inside the SC boundary, `public/districts/state-outline.json`); jurisdictions = **37** (non-zero keys). These supersede the mockup's working numbers (1,676 / 37 → 1,624 / 37; the mockup's ask-frame `80+` is likewise superseded by `100+` — §4.3); the hero prose floor "more than 1,600" holds. **The spec forbids hardcoding any camera number in markup** — all copy that carries a camera figure (hero support-line floor, Base.astro's default meta description, impact band, map statline) consumes `src/data/impact-stats.json`. Zero hardcoded numbers.

**Why counts rot today:** the weekly workflow `.github/workflows/refresh-camera-data.yml` runs only the JS fetch (`node scripts/fetch-camera-data.mjs` → `public/camera-data.json`, current as of 2026-08-26) and **never runs the Python counter**, so `public/camera-counts.json` (built 2026-03-10; 33 non-zero keys summing ~865, with place counts double-counting cameras inside their county) went stale while the raw data stayed fresh.

**The fix: one atomic refresh job.** A single job produces every camera-derived artifact together, so they can never disagree:

1. **Fetch + validate** a fresh camera snapshot (the existing `scripts/fetch-camera-data.mjs` → `public/camera-data.json`).
2. **Count unique camera IDs inside the SC boundary** (`public/districts/state-outline.json`) → the SC total (NOT the double-counting sum of camera-counts.json keys).
3. **Regenerate `public/camera-counts.json`** per-jurisdiction (un-stales the action modal's stat lines).
4. **Emit `src/data/impact-stats.json`** with both figures (`scTotal`, `jurisdictions`) plus a `generatedAt` timestamp.
5. **Commit all artifacts together** (one commit; partial refreshes never land).

**Wire the job into the weekly workflow** (`refresh-camera-data.yml`), replacing the fetch-only step. **Mandated (Rev 3): the generator is a Node build-time script (e.g. `scripts/build-impact-stats.mjs`) that reuses the repo's existing tested `pointInPolygon` from `src/lib/geo-utils.ts`** — it handles holes, is the same routine the district matcher runs in production, and both round-2 gate reviews independently reproduced 1,624 cameras / 37 jurisdictions with it. (Rev 2's `polygon-clipping` recommendation is withdrawn: that package only does polygon boolean ops — it has no point-in-polygon — and Shapely is not a declared dependency anywhere CI could rely on.) Implementation notes: (a) `geo-utils.ts` is TypeScript, so the CI generator needs `tsx`/Node type-stripping to import it — or a small inlined JS port of `pointInPolygon`; (b) the current `refresh-camera-data.yml` installs nothing (checkout + setup-node + run only), so if the generator imports any npm dependency the workflow must gain an install/setup step (`npm ci`); (c) `pointInPolygon(lat, lng, geometry)` takes lat then lng, while camera records carry `lat`/`lon` and GeoJSON rings are `[lng, lat]` — mind the coordinate-order swap when wiring the generator. `scripts/build-camera-counts.py` (Shapely) may stay as the local-only per-jurisdiction tool, but the statewide impact-stats generator — and everything the committed workflow runs, including the per-jurisdiction `camera-counts.json` regen (step 3) — is Node + geo-utils. (Resolves Open Questions #1.)

### 4.2 Static sourced figures (`src/data`, with source comments)

- `110+` SC agencies — statewide research corpus (docs/research-workflow.md).
- `422M+` plate reads, SLED 2019–22 — the SLED figure previously in the hero metadata bar.
- `0` state laws regulating ALPR — established site claim (blog post "SC Has No License Plate Camera Law").

### 4.3 "100+ communities have canceled, rejected, paused, or rolled back Flock" (Rev 2: resolved; Rev 3: verb broadened)

The movement-framing stat, now cited: **DeFlock's national cancellation tracker** (https://deflocktheusa.com/cancellations/), showing **109 US jurisdictions as of late Aug 2026** — attributed as advocacy-tracker data. The 109 breakdown is **48 canceled, 21 rejected, 19 deactivated, 12 paused, 8 removed, 1 banned**. Because canceled + rejected + paused alone cover only 81 of the 109 (Codex round-3 catch), Rev 3.1 (executing the user decision to keep `100+` with an accurate, broadened verb) states the stat as **"canceled, rejected, paused, or rolled back"** — where "rolled back" umbrellas the 28 deactivated / removed / banned jurisdictions — so the claim spans the full 109 and stays defensible while keeping the `100+` number. The homepage ships **`100+`** with an **"as of Aug 2026"** note wherever the stat renders (§2.3 relocation note, §2.5 ask-frame). The number, source URL, attribution ("per DeFlock's cancellation tracker"), and as-of date land together in the data module so they update as one unit. (Resolves Open Questions #2.)

### 4.4 Council asks

`src/data/council-brief.ts` (canonical, copydesk-passed) → projected through new `src/data/homepage-asks.ts` (§2.5) with the vitest **canonical-cite** drift guard (display suffixes excluded — §2.5).

### 4.5 Events + blog

Events: baked `src/data/events.json` (strict `publicEventSchema` + `toPublicEvent`) + `loadCouncilEvents()`, build-time only (§2.6b). Blog: the `blog` content collection (§2.2). No new data sources.

## 5. Component inventory

**New components:**

| File | Section |
|------|---------|
| `src/components/BlogCarousel.astro` | §2.2 |
| `src/components/ImpactBand.astro` | §2.3 |
| `src/components/LegislationAsks.astro` | §2.5 |
| `src/components/TakeActionZone.astro` | §2.6a |
| `src/components/EventsStrip.astro` | §2.6b |
| `src/components/SignalCta.astro` | §2.6c |
| `src/data/homepage-asks.ts` | §2.5 data projection |
| `src/data/brief-icons.ts` | shared inline-SVG ICONS module (§2.5 icon note; extracted from CouncilBrief.astro, extended with the 5 homepage glyphs incl. `clipboard-clock`; existing glyphs untouched) |
| `src/scripts/count-up.ts` | shared count-up util (§6/§7; extracted from results-renderer.ts) |
| `scripts/build-impact-stats.mjs` | §4.1 atomic camera refresh generator (Node + geo-utils `pointInPolygon`; SC total, per-jurisdiction counts, `impact-stats.json`) |

**Modified:**

| File | Change |
|------|--------|
| `src/pages/index.astro` | Recomposed to the §1 section order; page meta description rewritten statewide (camera floor from `impact-stats.json`, copydesk at build) |
| `src/components/Hero.astro` | Cut metadata bar; new support copy; add "See the map" secondary CTA |
| `src/components/MapSection.astro` | SC-wide initial view via `fitBounds` after `createMap` (§2.4, after the PR #103 rebase); lean layout (heading + map + side column); shared open-map operation (reveal/init/scroll/focus, three call sites — §2.4); Upstate essay/stat column/ghost numeral removed |
| `src/layouts/Base.astro` | One-line inline `<head>` script stamping `document.documentElement.classList.add('has-js')` (§7/§8 no-JS fix); default meta description updated from the stale "Over 240 ALPR cameras…" to the statewide >1,600 framing (copydesk at build) |
| `src/components/Footer.astro` | ONLY two `href` values repointed (`/#how-it-works` → `/blog/the-4th-amendment-loophole`, `/#faq` → `/toolkit/legal`); labels and the other four Explore links byte-for-byte unchanged (§1) |
| `src/components/CouncilBrief.astro` | Private `ICONS` map extracted to `src/data/brief-icons.ts`; component now imports it (rendered output identical) |
| `src/scripts/action-modal/results-renderer.ts` | `animateCount` extracted to `src/scripts/count-up.ts`; the modal adopts the shared util (its plain-integer stat path must not regress — §6). Matching/orchestration logic untouched |
| `src/styles/global.css` | `[data-reveal]` opacity rules scoped under `.has-js` (§7/§8); FAQ sidebar block (`.sidebar-btn`/`.sidebar-active`) deleted (§3) |
| `.github/workflows/refresh-camera-data.yml` | Fetch-only step replaced by the atomic refresh job (§4.1); gains an install/setup step if the generator imports any npm dep |
| `public/camera-counts.json` (+ new generated `src/data/impact-stats.json`) | Regenerated per §4.1 |

**Not modified (Rev 2 decision D1):** `src/components/Nav.astro` — the full sitewide nav stays; no anchor-nav redesign.

**Deleted:** `HowItWorks.astro`, `HowItWorksOverlays.astro`, `BillTracker.astro`, `FAQ.astro`, `TakeAction.astro`, `CitizenToolkit.astro`, `BlogPreview.astro`, `src/scripts/bill-tracker.ts`, `src/scripts/case-studies.ts` (each verified unreferenced first).

**Untouched (explicitly):** `Nav.astro`, the action modal's matching/orchestration logic + district matcher (the only modal-adjacent edit is the count-up extraction in `results-renderer.ts`, above), `src/scripts/map/*` internals, all `/toolkit/*`, `/events*`, `/blog*` pages (including blog content — no link edits, §1), `netlify/functions/*`.

## 6. Architecture & tech

- **Vanilla Astro, zero islands.** All interactivity is small inline `<script>`s or plain TS modules (existing pattern). React/islands are deferred as a later option — do not introduce them.
- **daisyUI `deflock` theme (PR #104)** is the styling foundation: semantic classes (`btn btn-primary btn-lg btn-outline`, `badge badge-warning badge-outline`, `card`) + theme tokens (`base-100/200/300`, `primary` #dc2626, `warning`/amber #fbbf24, `--radius-field` 0.3rem / `--radius-box` 0.45rem, `--depth:0`). The mockup's kit CSS (`.istat`, `.demand`, `.band`, `.carousel`, `.signal`) maps to component-scoped styles + Tailwind utilities on top of those tokens — port the structural/responsive rules, not the token values (already in `global.css`).
- **Fonts:** self-hosted Instrument Sans Variable + DM Mono, unchanged. The mockup drops DM Mono for its own reasons (Google-Fonts standalone); **the live site keeps the existing DM Mono `label-mono*` idiom** for the mono-label roles the mockup approximates with letter-spaced Instrument Sans.
- **Icons (Rev 2, resolves Open Questions #6):** Tabler glyphs per §2.5. **Primary mechanism: the shared inline-SVG module `src/data/brief-icons.ts`** — `CouncilBrief.astro`'s private `ICONS` map extracted into an importable module, extended with the five homepage-only glyphs using the mockup's path data (only `file-search` is truly shared — §2.5); both `CouncilBrief.astro` and `LegislationAsks.astro` import it. Zero new dependencies, pixel-identical output. astro-icon + `@iconify-json/tabler` remains an **optional** alternative only (both would be new devDependencies subject to the 30-day package-age gate — no need to take that on when the inline module already ships).
- **Count-up (Rev 2, hardened):** extract the action modal's `animateCount` (`src/scripts/action-modal/results-renderer.ts:38` — rAF, 1000–1200ms, cubic ease-out `1-(1-t)^3`) to shared `src/scripts/count-up.ts`, extended per the mockup script: parse `([\d,]+)(suffix)`, preserve comma grouping via `toLocaleString('en-US')` and the suffix (`+`, `M+`) through every frame; fire once via IntersectionObserver (`threshold: 0.4`).
  - **The modal ADOPTS the shared util** (results-renderer.ts imports it; §5). The modal's stat values are plain integers — no commas, no suffix — so the shared util must handle that path with no regression; **add a vitest test for the plain-integer path**.
  - **A11y:** ship the FINAL value in the DOM markup and animate only the visual — never expose a partial/zero value to assistive tech. Implementation: an `aria-hidden` animated span + visually-hidden final text, or a stable `aria-label` carrying the final value.
  - **Reduced-motion AND IntersectionObserver-absent:** values stay FINAL — never reset to 0. Reset to 0 **only when the animation will actually run** (observer constructed, reduced-motion not set, element observed). This spec's rule **wins over the mockup script's buggy "reset whenever `!reduce`"** (which zeroes values even when no observer will ever fire).
- **Scroll reveals:** reuse the existing sitewide `data-reveal` system (observer in `Base.astro`, CSS in `global.css` — `data-reveal="up|left|right"` + `data-reveal-delay="1..4"`, reduced-motion handled), **with the Rev 2 `.has-js` gate (§7/§8)** so the CSS never hides content when JS is off. Do not add a second reveal mechanism. The mockup's `.reveal`/`.reveal-group` staggers map onto `data-reveal` + per-child `data-reveal-delay`.

## 7. Motion summary

| Element | Behavior | Reduced motion |
|---------|----------|----------------|
| Hero text block | Existing staggered `data-reveal` entrance | Instant (existing) |
| Light cones | Existing `cone-sweep` keyframes | `animation: none` (existing) |
| Section content | `data-reveal` rise+fade, fire once | Instant, visible |
| Stat values (impact, ask-frame, map statline) | Count-up 1200ms cubic ease-out on first view | Final values, no animation |
| Toolkit cards | Hover lift + arrow slide, `@media (hover:hover)` only | n/a (transition, not animation; harmless) |
| Blog carousel | Manual scroll-snap only, no auto-advance | n/a |

All motion is transform/opacity (+ textContent for count-ups); no layout animation.

**No-JS reveal gate (Rev 2 correction).** Rev 1 claimed "reveal-hiding is gated on the observer attaching" — that is FALSE today: `global.css` (~lines 382–403) sets `[data-reveal] { opacity: 0 }` **unconditionally** under `prefers-reduced-motion: no-preference`, and only the Base.astro script ever un-hides — with JS off, all 8 homepage sections would be invisible. **Fix (the mockup already does this): a `.has-js` root-class gate.** A tiny inline script in Base.astro's `<head>` stamps `document.documentElement.classList.add('has-js')`, and the `global.css` `[data-reveal]` opacity/transform rules are scoped under `.has-js`. With JS off the class never appears, so nothing is hidden; with JS on, behavior is unchanged. This keeps ONE reveal mechanism and satisfies no-JS. Stat markup additionally ships final values (§6).

## 8. Responsiveness & accessibility

- **Mobile-first; the whole page must be responsive** with no horizontal body scroll at 375 / 768 (the iPad width that broke the dividers) / 1024 / 1280. The two stat bands use the shrink-don't-wrap rule (§2.3); the map frame uses the definite-width aspect-ratio rule (§2.4); grid items that contain flex children get `min-w-0` (known repo gotcha).
- Breakpoint map (from the mockup): stats hold columns at all widths (type shrinks < 560px); map side column stacks < 900px; ask cards 1-col < 720px; toolkit 4→2 (< 900px)→1 (< 480px); events 3→1 (< 840px); mobile map keeps the existing toggle-button flow.
- **Touch targets ≥ 44px** for all interactive elements (buttons already 2.7–3.1rem; the carousel hint and mono links must not become tiny tap targets — links get padding).
- **Focus:** global `:focus-visible` outline (existing); carousel container focusable with `aria-label`; toolkit cards and event cards are real links in tab order.
- **ARIA:** each section gets `aria-labelledby` on its heading (existing pattern); decorative art (`lens` thumbs, cones, arrows, date numerals' pin emoji) `aria-hidden`; the map keeps `role="application"` + label; count-up containers need no `aria-live` — the final value is in the DOM for AT from first paint (per §6: `aria-hidden` animated span + visually-hidden final text, or a stable `aria-label`; AT never sees a partial/zero value).
- **Reduced motion:** per §7 — every new animation honors `prefers-reduced-motion: reduce` via the existing CSS media query + the count-up's matchMedia check; count-up values additionally stay final whenever IntersectionObserver is absent (§6).
- **No-JS:** full content renders — the `.has-js` root-class gate (§7) means the `[data-reveal]` hiding CSS never applies without JS, stats ship final values, blog/events are baked. The two JS-dependent controls are the action modal CTAs and the Signal button — both are buttons that simply do nothing without JS, matching current site behavior.

## 9. Testing / verification

1. `npx astro build` clean (prebuild sync scripts included).
2. `npm test` — existing vitest suite green + the new homepage-asks **canonical-cite** drift guard (§2.5) + the count-up plain-integer-path test (§6).
3. **Browser smoke pass** (dev server via `.claude/launch.json` `dev` config, desktop + `public/dev-preview.html` mobile iframe):
   - Map renders, initial view frames all of SC (not Greenville) via `fitBounds`, clusters/dots load at statewide zoom (verify clustering density — §2.4), popup opens; mobile toggle path works; "Open the full map" runs the shared open-map op (on mobile it reveals + initializes the map first; desktop reduces to scroll+focus); a mobile `/#camera-map` hash visit lands on the visible, initialized map.
   - Stat count-ups fire once on scroll, formatting preserved (`1,624`, `110+`, `422M+`, `0`, `100+` — the `100+` caption reads "canceled, rejected, paused, or rolled back", §4.3); with reduced-motion emulated, final values show instantly; AT-facing value is final at all times.
   - **No-JS check:** with JavaScript disabled, all 8 sections are visible (the `.has-js` gate — §7) and stats show final values.
   - Blog carousel: 5 posts, scroll-snap, keyboard scroll when focused, card links resolve; a tagless post renders no category label.
   - Take-action zone: `Find your representatives` opens the action modal; `Grab the one-page council brief` resolves to `/toolkit/speaking`; 4 toolkit links resolve.
   - Events strip: cards show real upcoming occurrences with **next-occurrence dates** (not base dates), council meetings capped per §2.6b, no meetup locations; `See all events` resolves.
   - Footer: the two repointed links (`How ALPR Works` → `/blog/the-4th-amendment-loophole`, `FAQ` → `/toolkit/legal`) resolve; `/#camera-map` and `/#bill-tracker` still land on their sections (legacy anchors — §1).
   - Signal button: no href in view-source; click navigates to `/go/intake` (deploy preview: resolves to the intake page).
   - No horizontal body scroll at 375 / 768 / 1024.
4. **Action modal smoke test is mandatory** (repo rule: PRs touching CTAs that open the modal — and this PR also touches `results-renderer.ts` for the count-up extraction): open modal → SC address → results load without console errors, per-jurisdiction stat count-up animates as before → modal at top → mobile too.
5. Reader-facing copy (new/changed hero support, map caption, meta description) passes the copydesk gate **at build time** — copy QA is not this spec's scope.
6. Process: rewrite `MANIFEST.md` before merge (repo rule); deploy preview verified on Netlify before merging to master.

## 10. Open questions / risks

**Resolved in Rev 2** (numbering kept to match the gate reviews):

1. **Fresh camera numbers — RESOLVED.** Real computed figures: SC total **1,624**, jurisdictions **37** (§4.1). Staleness fixed structurally: the weekly workflow runs the ONE atomic refresh job (fetch → SC count → per-jurisdiction counts → `impact-stats.json` → single commit); the job is a Node generator (`scripts/build-impact-stats.mjs`) reusing `pointInPolygon` from `src/lib/geo-utils.ts` (Rev 3 — supersedes Rev 2's unworkable `polygon-clipping` suggestion; see §4.1 for the TypeScript-execution and workflow-install implementation notes).
2. **Movement-stat citation — RESOLVED.** `100+` communities, cited to DeFlock's national cancellation tracker (109 US jurisdictions as of late Aug 2026), attributed as advocacy-tracker data with an "as of Aug 2026" note (§4.3).
3. **Blog grid vs carousel — RESOLVED.** Carousel, per the approved mockup (§2.2).
4. **Nav — RESOLVED (user decision D1).** Keep the full sitewide nav; `Nav.astro` is not redesigned. The mockup's anchor-only nav is mockup chrome (§1).
5. **Council brief CTA destination — RESOLVED (by default).** A single `Grab the one-page council brief` button → `/toolkit/speaking`, which hosts both the city and county briefs plus the talk track (§2.6a).
6. **Icons — RESOLVED.** Shared inline ICONS module `src/data/brief-icons.ts` is the primary mechanism (extracted from CouncilBrief.astro, extended with the mockup glyphs); astro-icon is optional only and not needed (§2.5, §6). Rev 3 correction: 1 truly-shared glyph (`file-search`) + 5 homepage glyphs — the card-4 clipboard-clock gets its own key; CouncilBrief's `clipboard` glyph is never modified (§2.5).
8. **Events strip sparse state — RESOLVED (folded with Fable#13).** Cap routine council meetings (max 2; max 1 when any real submitted event exists) and prefer real organizing events; the zero-state (hide the section) is effectively unreachable given the 83 standing `until: null` council series, and stays only as a defensive fallback (§2.6b).
9. **Map initial view + button — RESOLVED (user decision D3; open-map op reworked Rev 3).** `fitBounds` on the SC bbox immediately after `createMap` in MapSection's own script; `Open the full map` invokes the shared open-map operation (§2.4: reveal-if-hidden → init/resize → scroll → focus; three call sites including `#camera-map` hash handling — plain scroll+focus on desktop; no standalone page, no expand-in-place). Rebase PR #103 first; its tile loader handles the statewide viewport (bounds intersect only a few 20° tiles, under the 8-tile cap) — verify clustering density in the smoke pass (§2.4).
10. **Meta description — RESOLVED.** Statewide framing on the ">1,600" floor from `impact-stats.json`, for both `index.astro`'s page description and `Base.astro`'s stale default ("Over 240 ALPR cameras…"); final phrasing passes the copydesk gate at build (§4.1, §5).

**Still open:**

7. **Oconee copy staleness.** "final vote set for Sept 15" dies on 2026-09-15, and the "First in SC / advancing" framing needs a passed/failed variant ready. Recommend drafting the post-vote sentence (both outcomes) at implementation time so the day-after edit is a one-liner.
