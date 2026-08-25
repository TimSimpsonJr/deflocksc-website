# Council Leave-Behind Pages — Design

**Date:** 2026-08-25
**Branch:** `feature/council-leave-behind` (off current `origin/master`)
**Status:** Design — pending user review before implementation

## Goal

Turn the Greenville-specific constituent brief at
`Tim's Vault/.../2026-08 Council Outreach/council-leave-behind.html` into two
reusable "leave-behind" pages on the DeflockSC toolkit that apply to **any** SC
city or county council, linked from the Speak Up page. Each is a dark,
site-integrated page on screen and prints to a light one-page "paper dossier"
that a citizen hands to council members.

## Why two pages (the crux)

The source brief's argument is load-bearingly city-specific: it assumes the
council commands its own police department. That is only true for a city with
its own PD. In a county, the sheriff is an **independently elected
constitutional officer** the council cannot direct, so the county must regulate
**indirectly** — through the levers it does control (money, property,
rights-of-way). Because the two asks differ materially, the brief is split into
two pages rather than one toggled page (user decision).

The city/county split analysis was sourced from the peer "City Council
documentation" session, which mapped it against Oconee County's filed ordinance
(Article VII, §§ 2-500 to 2-516). Key points captured below.

## Decisions locked in brainstorming

- **Two separate static pages** — city and county. No on-page customization or
  inputs; the page is a clean read.
- **Dark on screen** (site-integrated), **light on print** via `@media print`.
- **No name personalization** — the "Prepared for / Subject / From" preamble is
  dropped entirely; nothing to fill in.
- **Two toolkit links** replace the single council-handout PDF in the Speak Up
  page's leave-behind slot.
- **De-slopped visual treatment** (vs. the first mockup):
  - No section "eyebrow" overlines (amber dot + uppercase mono label). Sections
    lead with a bold heading + a short red tick-bar, matching the source sheet.
  - Pull quote uses a large serif quotation mark set **behind** the quote
    (subtle red), with a clean DM Mono attribution (no em-dash).
  - Print action is a quiet end-of-page row (heading + one line + red print
    button), **no boxed card, no accent rail**.
  - Amber is reserved for genuine accents (the § tags on model cards, links),
    not sprinkled on every section.

Reference mockup (city version, both treatments via a toggle):
`scratchpad/council-leave-behind-mockup.html` (published as a private Artifact
during brainstorming).

## Routes

- `/toolkit/speaking/city-council-brief`
- `/toolkit/speaking/county-council-brief`

Astro builds these as `src/pages/toolkit/speaking/city-council-brief.astro` and
`.../county-council-brief.astro`. `speaking.astro` remains a sibling file; a
`speaking/` directory alongside it is valid.

## Page structure (shared skeleton)

1. **Header** — DEFLOCK/SC lockup + "Constituent brief" filed tag, H1
   ("Public rules for public cameras"), standfirst.
2. **The ask** — take up an ordinance; first step is to direct staff to draft it.
3. **Why this is your council's call** (Authority) — *differs by variant.*
4. **You wouldn't be first, or alone** (Precedent) — shared: Oconee 4-1 vote
   (Aug 18, hearing/final reading Sep 15), Greer 90-day pause (Aug 21), national
   context. Includes the Durham pull quote.
5. **What an ordinance could include** (Model) — *differs by variant.*
6. **FAQ** — *county page only:* the Home-Rule / sheriff explainer (4 Q&As).
7. **See it for yourself** (Sources) — primary sources, shared (+ Home Rule
   link).
8. **Contact** — "Let's talk." + DeflockSC@proton.me.
9. **Print action** (web only; hidden in print).

## City vs. county content deltas

**Shared across both** (transfer cleanly):
- Capability-based definition of the covered system (Oconee **§ 2-502**) — the
  vendor-proof core; never names Flock. Carve-out for a plain hot-list plate
  check (**§ 2-503**).
- Removal timeline (**§ 2-507**): outside data-sharing + funded connections cut
  within 10 business days of notice; equipment removed within 30 days.
- Public reporting + enforcement/remedies (**§§ 2-514 / 2-515**).
- Legal ground: SC Home Rule Act of 1975 (implementing Const. Art. VIII); no SC
  ALPR statute exists yet (S.447 pending, not law), so the field is open for
  local action.

**City version — regulate the PD directly.**
- Authority: the city's cameras are run by the city's own police department,
  which answers to the council; the council can set policy directly. Cite SC
  Code **§ 5-7-30** (municipal general police power) and Const. **Art. VIII
  § 17** (home-rule provisions liberally construed).
- Model: can go further than Oconee — direct operational controls the county
  cannot impose (warrant requirement, retention limit, documented reason per
  search, mandatory audits, **published audit logs**, sharing limits, council
  approval before expansion). Does **not** need the § 2-501(e)/(f)
  constitutional-officer carve-out.
- The "publish the audit logs" card is presented as a **city addition** on top
  of the Oconee template.

**County version — defund and deny.**
- Authority: the sheriff is an independently elected constitutional officer
  (SC Const. **Art. V § 24** — *pin-cite to be verified at build*); the council
  cannot direct the sheriff's operations. Instead it uses what it controls:
  county funds, property, equipment, IT, and county-controlled road
  rights-of-way. Counties also hold home rule (Title 4; **§ 4-9-25** county
  police power).
- Model / levers: prohibition on county expenditures/resources (**§ 2-504**),
  county property (**§ 2-505**), rights-of-way (**§ 2-506**); municipal-funding
  pressure — discretionary distributions (**§ 2-508**), accommodations-tax
  eligibility (**§ 2-509**), county-sponsored events (**§ 2-510**),
  anti-circumvention (**§ 2-513**).
- The hinge, stated plainly: **§ 2-501(e)/(f)** — applied to an elected officer,
  the ordinance reaches only county funds, county contracts, and county property
  / rights-of-way, and explicitly does **not** dictate the officer's operational
  use. No published-audit-logs "city addition" card (the county can't compel it).
- **FAQ** (from the peer session, run through copydesk): why a county regulates
  "around" the sheriff; why a city can go further and more directly; why the
  county approach does not step on the sheriff's authority / separation of
  powers; and why a capability-based ordinance is vendor-proof (can't just swap
  Flock for Axon).

## Visual / design system

Honor the existing site system (do not invent a new one):
- Tokens: ground `#111111`, panel `#141414`/`#1a1a1a`, hairlines
  `rgba(255,255,255,0.07)`, ink `#e8e8e8`, body `#a3a3a3`/`#d4d4d4`, dim
  `#737373`, red `#dc2626`, amber `#fbbf24`. Fonts: Instrument Sans Variable +
  DM Mono (self-hosted, already in `global.css`); the `.label-mono*` classes.
- Toolkit chrome matches `speaking.astro`: breadcrumb (Home / Toolkit / Speak Up
  / City|County Council Brief) on `#111`, body on `#141414`, BreadcrumbList
  JSON-LD, and a "More from the Toolkit" siblings footer (plus a back link to
  Speak Up).
- Section heads: red tick-bar (`24×3px`) + bold H2, no eyebrows.
- Model provisions: dark cards grid (`#111` cards, 1px-gap grid) with amber §
  tags; the audit-logs card spans full width (city only).
- Pull quote: large serif `“` behind the text (`rgba(220,38,38,~0.2)`,
  `aria-hidden`), quote in `#e8e8e8`, mono attribution.

## Print stylesheet (`@media print`)

- Hide site chrome: `Nav`, `Footer`, `ActionModal`, the breadcrumb section, the
  siblings footer, the skip link, and the print button.
- Restyle the brief container to the light paper sheet from the source doc:
  white panel, 5px red top rule, light ink (`#1b1b1e`), `b45309` link/accent,
  the meta-less header, capability cards, quote, sources, contact, and footer
  ("Home rule, applied at home.").
- Force light colors scoped to the brief so the dark `deflock` theme is
  overridden on paper. Target ~1 page (2 acceptable); `break-inside: avoid` on
  cards/quote; no animations.

## Implementation architecture

- **Shared skeleton, two variant pages.** A shared component
  (`src/components/CouncilBrief.astro`) renders the full brief and its styles
  (screen + print), with the variable parts (standfirst, Authority, Model,
  optional FAQ, and the city-only audit-logs card) supplied per variant — via a
  `variant: 'city' | 'county'` prop plus structured content, or named slots.
  Shared sections (ask, precedent, sources, contact, print action) live once in
  the component.
- Two thin page files (`city-council-brief.astro`, `county-council-brief.astro`)
  wire up `Base`, the breadcrumb, JSON-LD, siblings, and render the component
  with the correct variant.
- Print CSS ships only on these pages (the component is used nowhere else), so a
  global `@media print` block in the component is safe; scope transforms under a
  page wrapper class (e.g. `.leave-behind`).
- Final decision on prop-vs-slot componentization is deferred to the
  implementation plan; the acceptance criterion is a single shared source for
  the skeleton + styles and two correctly-arguing variants.

## Toolkit integration

- `ToolkitSpeaking.astro`: replace the "Council Handout" section (single PDF
  download) with a **Leave-behind** section offering **two links** — "City
  council brief" and "County council brief" — with updated copy.
- `toolkit/index.astro`: update the "Speak Up" card (tag "Handout PDF" and the
  desc line "Council handout PDF to leave behind") to reflect the two pages.
- `speaking.astro` `<description>`: update the "Council handout PDF to leave
  behind" phrasing.
- The superseded `public/toolkit/speaking/council-handout.pdf` and its reference
  are removed (recoverable via git history).

## Copy / voice

- All outward-facing copy runs through **copydesk:write** (advocacy register):
  no em-dashes, no AI vocabulary, sourced claims. Reuse the source doc's
  already-crafted sentences where they transfer.

## Facts to verify at build

- SC Const. **Art. V § 24** sheriff pin-cite (flagged by the peer session).
- Oconee dates: 4-1 vote Aug 18, public hearing / final reading Sep 15; Greer
  90-day pause Aug 21. Treat as current precedent; the brief is inherently dated
  to Aug 2026.
- Oconee § mapping (peer session pulled it from the filed ordinance PDF; verify
  against `oconeesc.com` backup PDF).

## Accessibility

- Semantic headings, `<figure>/<blockquote>/<figcaption>`, `aria-label` on the
  breadcrumb, decorative quote mark `aria-hidden`, real `<button>` for print,
  visible focus states, `prefers-reduced-motion` respected.

## Out of scope (YAGNI)

- Interactive personalization / name fill-in, PDF generation library (browser
  print is the PDF path), auto-detecting a visitor's jurisdiction, per-county
  camera-count injection.

## Verification

- Dev server: both pages render dark with no console errors; print preview shows
  the light sheet with site chrome hidden, fitting ~1 page; mobile + desktop.
- Toolkit links resolve; old PDF reference gone.
- Action-modal smoke test **not** required (these pages don't touch
  `district-matcher`, `ActionModal`, CSP/proxy, or security hardening).
