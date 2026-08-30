# DaisyUI Site-Wide Migration — Design Spec

**Status:** Approved (user signed off on the visual target via the `deflock-ui-kit.html` mockup)
**Date:** 2026-08-29
**Companion plan:** `docs/plans/2026-08-29-daisyui-migration-plan.md`

## 1. Goal

Extend the DaisyUI component vocabulary already established by the events subsystem to every
**non-homepage** area of the site. This is anti-slop consolidation, not a redesign:

- **Consistency:** one component vocabulary (`btn`, `card`, `alert`, `tabs`, `input`, …) themed once
  through the existing `deflock` theme, instead of six hand-rolled variants of every control.
- **Token normalization:** collapse six near-black surface colors to the theme's three base tokens;
  settle the corner radii to the approved slightly-rounded values.
- **Keep layouts.** Page structure, grids, copy, and interaction flows stay as they are. Only the
  component-level rendering vocabulary changes.

This is NOT "adopt DaisyUI" — daisyUI 5.6.18 is installed, themed (`@plugin "daisyui/theme"` named
`deflock` in `src/styles/global.css`), and stamped on `<html data-theme="deflock">` in
`src/layouts/Base.astro`. The events subsystem (`src/pages/events.astro`, `SubmitEventForm.astro`,
`EventsList`/`EventsMonth`, `src/scripts/events-page.ts`) already uses it and is the reference
implementation. This project extends that vocabulary outward.

## 2. Visual target

The approved mockup — vendored into the repo at `docs/plans/assets/deflock-ui-kit.html` by plan
Task 0 (build-safe there: `docs/` is excluded from Tailwind scanning; see §7 first risk) — locks:

| Item | Target |
|---|---|
| Corner radii | `--radius-field: 0.3rem`, `--radius-box: 0.45rem`, `--radius-selector: 0.3rem` (up from 0.25/0.375/0.25) |
| Surfaces | Exactly three: `base-100 #171717` (main), `base-200 #1a1a1a` (elevated), `base-300 #0d0d0d` (deepest) |
| Alerts | Real daisyUI defaults: solid semantic fill, real SVG icons, `--radius-box` corners (theme `--depth:0`/`--noise:0` keeps them flat) |
| Toast | A **neutral** `.alert` (base-200 fill, `border-white/25` hairline, check icon) inside a `.toast` container pinned bottom-right — NOT a green `alert-success`. The container is a PERSISTENT `role="status" aria-live="polite"` region in `Base.astro`, emptied/refilled rather than shown/hidden (a freshly-inserted role=status node is not reliably announced) |
| Tabs | The events-page `tabs tabs-box` treatment verbatim (base-200 tray, `#3d3d3d` active pill with `rgba(255,255,255,0.36)` hairline, `#a3a3a3` inactive text, amber focus ring) |
| Master-detail | Vertical rail of `role="tab"` buttons: transparent resting, `rgba(255,255,255,0.04)` hover, active = base-200 fill + 2px red left border (border always reserved so activation adds no shift), amber inset focus ring |
| Buttons | `btn-primary` (red CTA), `btn-neutral` (grey), `btn-outline`, `btn-ghost`; site CTA idiom = `btn btn-primary text-xs uppercase tracking-[0.08em]` (matches SubmitEventForm) |
| Badges | `badge badge-warning` (amber, e.g. "Your district", bill status), `badge badge-outline` (muted chips), DM Mono uppercase |
| Stats | daisy `stats`/`stat` block: red tabular `stat-value`, DM Mono uppercase `stat-title`, base-100 well with hairline border |
| Breadcrumbs | daisy `breadcrumbs` structure with a global override replacing the chevron separator with the mockup's `/` in muted grey |

## 3. House-style guide (codified events conventions)

These conventions come from the de-slopped events subsystem and now bind all migrated areas:

1. **Aria-keyed active states.** Active/selected styling keys on `[aria-selected="true"]`,
   `[aria-checked="true"]`, `[aria-pressed="true"]`, or `:checked` — never on a lone cosmetic class.
   JS toggles the semantic attribute; CSS follows. (Events: `.events-tab[aria-selected="true"]`.)
2. **Select by luminance and shape, never hue alone.** Active pills/rails are a lighter fill + a
   hairline border + (for rails) a red edge; the text signal differs too. Survives color-blindness.
3. **Brand red is reserved** for primary CTAs and the active-rail edge. Amber = emphasis, warning,
   focus rings on dark trays. Party/type colors are reinforcing, never the sole signal.
4. **Class-parity with runtime renderers.** Any DOM built at runtime (results-renderer.ts,
   foia-finder.ts, toast.ts) must emit the exact class strings the templates use, and those strings
   must appear as **complete literals** in the source — Tailwind 4 scans `.ts` files, so
   `'btn btn-primary btn-sm'` works, but a class name assembled from fragments
   (`'bg-[#' + c + ']'`) is invisible to the scanner and emits no CSS. Styling for runtime-built DOM
   lives in **global** (or `is:global`) CSS, never Astro-scoped styles (scoped rules key on a
   `data-astro-*` attribute runtime nodes don't carry).
5. **Unlayered overrides win.** Site re-theming rules (e.g. the tabs-box repair, breadcrumb
   separator swap) are unlayered and placed after the daisy import, so they beat daisyUI's
   `@layer` rules at equal specificity without `!important`.
6. **44px touch targets** on all interactive controls — and because daisyUI's defaults MISS this
   floor (with `--size-field: 0.25rem`, bare `btn`/`input`/`select` = 40px, `btn-sm`/`select-sm` =
   32px), every migrated touch control carries an explicit `min-h-11` (44px) — or `min-h-12`+
   where it matches a taller sibling — with `min-w-11` added on square icon buttons. Amber
   `:focus-visible` ring (inset where a clamped/overflow parent would clip an outset ring); the
   global red `:focus-visible` remains the default elsewhere.
7. **DM Mono label idiom** (`label-mono*` utility classes) for overlines, metadata, breadcrumbs,
   badges — unchanged.
8. **Three surfaces only.** `bg-base-100/200/300` (or their hex equals in global CSS) — no new
   near-blacks. Hairlines: `rgba(255,255,255,0.07)` resting, `…0.10–0.15` hover, `…0.22–0.36` strong.

## 4. Token normalization map

Six near-blacks currently in use collapse to the three base tokens (accepting subtle shifts):

| Current | Count/where | Becomes |
|---|---|---|
| `#111111` | body (Base.astro), Nav scroll-solid, blog/toolkit section bgs, theme-color meta | `#171717` (base-100) |
| `#141414` | toolkit alternating section bgs, outreach primary starter cell | `#171717` (base-100) |
| `#161616` | hover fills (blog tag pill, outreach share) | `#1a1a1a` (base-200) |
| `#171717` | already base-100 | unchanged |
| `#1a1a1a` | already base-200 | unchanged |
| `#0d0d0d` | already base-300 (modal cards, pre blocks) | unchanged |
| `#0a0a0a` | blog image letterbox, foia inputs, lightbox dimmer | `#0d0d0d` (base-300) |

Scope of replacement: site chrome + all migrated areas (Base, Nav, Footer, blog pages, toolkit
pages/components, ActionModal, their scripts). Homepage section components keep their hexes until
the separate homepage rebuild (Item 3). `CouncilBrief.astro` (print doc) and `og-image.ts`
(pre-rendered PNGs) are untouched. Hexes inside blog **markdown content** are content, not theme.

The `#141414`→`#171717` merge deliberately erases the toolkit pages' alternating-section banding —
approved: three surfaces only.

**Neutral-token blast radius (events, verified not edited):** the `--color-neutral` `#1a1a1a`→`#262626`
settle also re-colors two controls inside the EXCLUDED events subsystem that use `btn-neutral`:
the submit form's Cancel button (`SubmitEventForm.astro` ~line 384) and the map's back-to-state
button (`#events-map-back`, `EventsMap.astro`). Both become MORE visible (the old `#1a1a1a` neutral
was near-invisible on base-100); plan Task 1 verifies them on `/events/submit` and `/events`
(select a county to reveal the back button) without touching either file.

**Widget radii decision (settled):** the three hard-coded `0.25rem` border-radii in `global.css`
for runtime-built widgets — `.autocomplete__input`, `.deflock-calendar::part(button)`,
`calendar-month.deflock-month::part(button)` — become `border-radius: var(--radius-field)`
(plan Task 1). Runtime-created elements DO inherit the theme custom property (the `deflock`
theme block cascades from the root), so the rules bind to the token directly; the old
literal-mirror approach would silently fork the token the next time the radius moves.

## 5. Scope

### In scope (per-area component map)

| Area | Files | daisy targets |
|---|---|---|
| **Site chrome** | `src/components/Nav.astro`, `src/components/Footer.astro`, `src/layouts/Base.astro` | `navbar`, `menu` (toolkit dropdown panel + mobile menu), `btn btn-primary` (Take Action), `btn btn-ghost btn-square` (hamburger), `footer-title` headings — footer LAYOUT keeps the explicit `grid md:grid-cols-3` (settled, see exception 7); keep scroll-solid-fade JS + blinking status dot; body/theme-color token swap |
| **Toast (new shared primitive)** | `src/scripts/toast.ts` (new), Base.astro container, `global.css` | `toast toast-end` + neutral `alert`; replaces the three inline "Copied!" text-swaps (action modal, FOIA templates, outreach one-pager — the FOIA/outreach ones carried `role="status"`; the persistent toast region preserves the announcement) |
| **Toolkit chrome** | `src/pages/toolkit/index.astro`, `foia/speaking/outreach/legal.astro`, `speaking/city-council-brief.astro`, `speaking/county-council-brief.astro` | `breadcrumbs` (with `/` separator override), `badge badge-outline` chips on hub cards, `btn btn-outline min-h-11` sibling links; hub 1px-gap grid kept (see exceptions) |
| **Toolkit rails** | `src/components/ToolkitFoia.astro`, `ToolkitSpeaking.astro`, `ToolkitLegal.astro`, `src/scripts/toolkit-legal.ts`, `src/scripts/tab-rail.ts` (new), `global.css` | vertical `role="tablist"` rails replacing the `.sidebar-btn`/`.sidebar-active` pattern; aria-keyed `.rail-tab` styling; one shared init helper replaces three duplicated JS blocks |
| **FOIA finder** | `ToolkitFoia.astro`, `src/scripts/foia-finder.ts` | `btn`, `input`, `join`, `loading loading-spinner`, `alert alert-error`, `alert alert-warning` (prefill banner), radio-`btn` type filter, `badge` in runtime agency cards |
| **Outreach / Speaking misc** | `ToolkitOutreach.astro`, `ToolkitSpeaking.astro` | copy buttons → `btn` + toast; share links → `btn btn-ghost`; business-card lightbox kept as-is; find-meeting link is ALREADY `btn btn-sm btn-outline mb-8` on master (commit `47aadfa`) — it only gains `min-h-11`, keeping `mb-8`; leave-behind brief links → `btn btn-outline` |
| **Blog index** | `src/pages/blog/index.astro` | tag-filter pill bar → radio-`btn` filter group (`:checked`-keyed); featured + grid cards → `card`; keep hash-sync JS |
| **Blog post** | `src/pages/blog/[...slug].astro`, `global.css`, `package.json` | `@tailwindcss/typography` (`prose prose-invert md:prose-lg` themed via `--tw-prose-invert-*` vars); drop the arbitrary-variant selector pile; related-post cards → `card`; keep reading-progress + TOC scrollspy JS |
| **Action modal** (isolated, high risk) | `src/components/ActionModal.astro`, `src/scripts/action-modal/results-renderer.ts` (+ `modal-controller.ts` untouched logic) | `modal-box`-style card tokens, `btn` variants, `input`, `join`, `collapse` (manual `<details>`), `select`, `loading loading-spinner`, `alert alert-error`, `stats`/`stat` (camera count-up), rep `card` + `badge badge-warning`, `textarea`, toast for Copy Letter |
| **404** | `src/pages/404.astro` | `btn btn-primary` + `btn btn-ghost` |
| **Foundation** | `src/styles/global.css`, `Base.astro`, `docs/plans/assets/deflock-ui-kit.html` (new) | docs-scan exclusion (`@source not "../../docs";`, plan Task 0 — see §7 first risk); Task 0 deterministically vendors ALL THREE planning artifacts (this spec + plan into `docs/plans/`, mockup into `docs/plans/assets/`) in the branch's first commit; radius settle (incl. the three widget radii, §4), token swaps, house-style shared CSS (`.rail-tab`, breadcrumb separator, toast) |

### Excluded (do not touch)

- **Every homepage section** (rebuilt separately in Item 3): `Hero.astro`, `HowItWorks.astro`,
  `HowItWorksOverlays.astro`, `MapSection.astro`, `BillTracker.astro`, `BlogPreview.astro`,
  `CitizenToolkit.astro`, `FAQ.astro`, `TakeAction.astro`.
- **The events subsystem** (already daisy; do not churn): `events.astro`, `events/submit.astro`,
  `SubmitEventForm.astro`, `EventsList/EventsMonth/EventsMap`, `events-page.ts`.
- **Keep bespoke:** hero animation, camera map + map scripts, events choropleth, case-study SVG
  hover scenes, ToolkitLegal dotted US-map SVG, the 1px-gap signature grid, ghost background
  typography, council-brief print docs (`CouncilBrief.astro`), `[data-reveal]` scroll-reveal,
  global `:focus-visible`, accessible-autocomplete + Cally skins (their three hard-coded
  `0.25rem` radii DO rebind to `var(--radius-field)` with the token settle — §4; the skins are
  otherwise untouched).

### Resolved conflicts / exceptions

1. **Hub cards vs. the 1px-gap grid.** The toolkit hub, talk-track, one-pager, bill-tracker, and
   conversation-starter grids are the 1px-gap signature pattern (keep-bespoke). Applying `card`
   (radius + gap) would break the seams. Resolution: grids and their square cells stay; only the
   chips inside migrate to `badge badge-outline` and hexes normalize. Standalone cards (blog cards,
   related posts, runtime agency/rep cards) DO become real `card`s.
2. **Breadcrumb separator.** daisy's default separator is a chevron; the approved mockup shows
   `/`. We adopt daisy `breadcrumbs` structure and globally override the separator to `/` (one
   unlayered rule, single source of truth).
3. **Blog tag filter & FOIA type filter.** daisyUI's `filter` component hides unchecked options
   once one is chosen — the mockup shows always-visible chips with one active. We use the daisy
   radio-`btn` pattern (`<input type="radio" class="btn">`) instead: same daisy vocabulary,
   `:checked`-keyed active fill, all chips stay visible. `:checked` is the semantic state, honoring
   convention #1.
4. **Action modal stays a div-based dialog.** Converting to a native `<dialog class="modal">`
   (the events pattern) would rewrite `modal-controller.ts` open/close/focus-trap logic — exactly
   the regression surface the smoke test exists to protect. Only the rendering layer migrates:
   the card takes `modal-box`-equivalent token styling, inner controls take daisy classes, and
   `modal-controller.ts` logic is untouched. A future pass may adopt `<dialog>`.
5. **`.sidebar-btn`/`.sidebar-active` cannot be deleted yet.** The homepage FAQ (excluded) still
   consumes them. The toolkit stops using them; the classes stay in `global.css` with a comment,
   and deletion moves to the homepage rebuild.
6. **Mobile rail layout diverges from the mockup (deliberate).** At ≤620px the mockup switches
   the master-detail rail to horizontal chips with a bottom-border active state; the plan keeps
   the vertical rail (left-border active) at all sizes. One rail treatment means one set of
   aria/focus behaviors and no breakpoint-dependent CSS swap, and the vertical rail already
   stacks above its panels on mobile. Revisit only if mobile testing shows the vertical rail
   wasting too much viewport.
7. **Footer layout: daisy `footer`/`footer-horizontal` rejected (settled — no try-and-revert
   branch).** Grounded in `node_modules/daisyui/components/footer.css`: `.footer` styles every
   direct child as its own grid (`& > :not(script,style,template) { display: grid; gap: .5rem }`),
   fighting the columns' internal `mb-*` rhythm, and forces `font-size: .875rem` on 16px footer
   text; `.footer-horizontal` is `grid-auto-flow: column` — content-sized auto columns, not the
   current equal thirds. The footer keeps its explicit `grid md:grid-cols-3 gap-12` layout and
   adopts only `footer-title` on headings (with `opacity-100` to keep them white) plus the
   base-token swap.

## 6. Blog prose adoption (@tailwindcss/typography)

Today `prose prose-invert` on the post body is **inert** (plugin not installed); all styling is a
hand-rolled arbitrary-variant pile (`[...slug].astro` lines 121–134) plus an `is:global` block.

- Install `@tailwindcss/typography@0.5.20` (released 2026-06-08 — 82 days old, clears the machine's
  30-day minimum-release-age gate). Pin exact.
- Tailwind 4 CSS-first integration (verified against the plugin docs): `@plugin
  "@tailwindcss/typography";` in `global.css` after `@import "tailwindcss";`.
- Theme via `--tw-prose-invert-*` variables scoped to `.blog-post .prose` (body `#b0b0b0`,
  headings `#e8e8e8`, links `#fbbf24`, quotes `#868686`, pre-bg `#0d0d0d`, hairline borders).
- Class becomes `prose prose-invert md:prose-lg max-w-none` (typography's 16px→18px scale matches
  the current responsive font sizes).
- Keep a small residual override block for what typography doesn't cover: link hover color,
  external-link `↗` indicator, pull-quote `.quote`/`.attribution`, `strong.red`, heading
  `scroll-margin-top`, mobile table overflow, TOC active state — and disable typography's inline-code
  backticks and blockquote smart quotes.
- Delete the arbitrary-variant pile and the now-redundant global rules only after a before/after
  rendered-post diff (text content identical; visual checklist passes).

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Tailwind content-scan crash on scanner-hostile bytes under `docs/`** (found during Item 1 verification; root cause corrected after adversarial review: Tailwind 4's automatic content detection scans the whole repo including `docs/`, and its CSS-escape decoder — in the tailwindcss lib, surfacing through `daisyui/functions/variables` — treats a backslash followed by 1–6 hex digits in a scanned string as a CSS unicode escape and calls `String.fromCodePoint` on it; a value above 0x10FFFF throws, hence `RangeError: Invalid code point 12347152` (= 0xBC6710), breaking both `astro dev` and `astro build`. The trigger was a drive-absolute Windows scratchpad path embedded in an earlier draft of these docs — path separator + a hex-leading directory name — NOT daisyUI class strings: `docs/plans/2026-08-24-council-meetings-implementation-plan.md` already contains `btn btn-primary`/`tabs tabs-box` and master builds fine) | Plan Task 0: `@source not "../../docs";` in `src/styles/global.css` directly after `@import "tailwindcss";` (path relative to the stylesheet; syntax and the `../../` resolution verified correct for Tailwind 4.2.1 per the "Ignoring specific paths" docs). Chosen over a `source(none)` + explicit-allowlist approach because one negative source keeps automatic detection intact for real sources. MUST be committed before/with anything landing under `docs/` (including the vendored mockup, which the exclusion makes build-safe). **Residual exposure:** the exclusion covers only `docs/` — a backslash-plus-hex absolute path pasted into any OTHER scanned file (README, `MANIFEST.md`, a `src/` comment) re-triggers the crash, so keep backslashed Windows paths out of scanned sources entirely; this spec and the plan write the scratchpad path in forward-slash form only (inert — the payload requires a backslash before the hex digits) |
| **Action modal regression** (most complex interactive component; past CSP/focus regressions) | Isolated task, last in the plan; `modal-controller.ts`/`group-builder.ts`/district-matching logic untouched; the FULL mandatory smoke test from `.github/pull_request_template.md` (open modal → SC address → results load → no console errors → modal not scroll-jumped → mobile) |
| **Blog prose regression** (wholesale selector swap under real content) | Typography install is its own task; before/after build diff of rendered posts (extracted text must be identical) + explicit visual checklist per element type |
| **Token shifts visible everywhere** (body `#111111`→`#171717` also shows under homepage sections; radius bump also rounds events-page pills/modals slightly; `--color-neutral` `#1a1a1a`→`#262626` re-colors two excluded events `btn-neutral` controls — submit-form Cancel, map back button) | Approved explicitly ("accepting subtle shifts"); foundation task lands first so every later screenshot is against the settled base; plan Task 1 explicitly verifies both events controls on `/events/submit` and `/events` (county selected) without editing them |
| **Runtime renderer class drift** | Class-parity convention (house-style #4) restated as a required note in every task touching `results-renderer.ts`, `foia-finder.ts`, `toast.ts` |
| **Toast under the modal** | Toast container gets `z-[70]` (modal is `z-[60]`, nav `z-50`) |
| **daisy `btn` resets breaking bespoke controls** | daisy classes are opt-in per element; tasks list exact class strings, and anything in the keep-bespoke list never receives them |

## 8. Verification strategy

Every task: `npm run build` must pass + an area-specific check in the dev preview
(`.claude/launch.json` `dev` config). The action-modal task additionally runs the full smoke test
(desktop + mobile, including the geolocation-success path alongside address/manual/reset/error/
wrong-district/clipboard). The blog task additionally runs the before/after rendered-post diff.
Final sweep greps in-scope files for stray near-blacks and runs `npm test`.
