# Council Leave-Behind Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or a Workflow to implement this plan. This is a static Astro content feature (markup, styling, structured data, one small script) — "verification" means `astro build` passing and browser/preview checks, not unit tests.

**Goal:** Ship two printable "leave-behind" toolkit pages (city + county) that read dark on screen and print as a light one-page paper dossier, linked from Speak Up.

**Architecture:** One shared `CouncilBrief.astro` component renders a structured `CouncilBrief` content object (screen styles + a print stylesheet co-located in the component). Two structured content objects (`cityBrief`, `countyBrief`) live in `src/data/council-brief.ts`, sharing identical fragments via consts. Two thin page files wire up `Base`, breadcrumb, JSON-LD, and siblings.

**Tech Stack:** Astro 5, Tailwind 4 (utility classes as used across the site), the existing `deflock` daisyUI dark theme + `.label-mono*` classes, `@media print` for the light sheet. No new dependencies.

**Sources of truth:**
- Design: `docs/plans/2026-08-25-council-leave-behind-design.md`
- Final copy: `scratchpad/council-brief-copy.md` (both variants, copydesk-passed)
- Light-sheet CSS reference: the original `2026-08 Council Outreach/council-leave-behind.html` (print palette + `.sheet`, `.grounds`, `figure.pull`, `.prov-grid`/`.pcard`, `.sources`, `.contact`, `footer`)
- Screen tokens/patterns: `src/styles/global.css`, `src/pages/toolkit/speaking.astro`, `src/components/ToolkitSpeaking.astro`

---

## File Structure

- **Create** `src/data/council-brief.ts` — `CouncilBrief` interface + `cityBrief` and `countyBrief` objects. Shared fragments (the ask body, precedent block incl. the Durham quote, sources rows, contact) are consts reused by both; only standfirst, authority, model, optional FAQ, and the jurisdiction word ("city"/"county") differ.
- **Create** `src/components/CouncilBrief.astro` — props `{ brief: CouncilBrief }`. Renders the whole dark brief (header lockup, standfirst, sections, model cards, optional FAQ, sources, contact, print action) and carries all screen CSS + the `@media print` light-sheet stylesheet. Root wrapper `<article class="leave-behind">`.
- **Create** `src/pages/toolkit/speaking/city-council-brief.astro` — `Base` + breadcrumb (Home / Toolkit / Speak Up / City Council Brief) + BreadcrumbList JSON-LD + back-link + siblings + `<CouncilBrief brief={cityBrief} />`.
- **Create** `src/pages/toolkit/speaking/county-council-brief.astro` — same with `countyBrief` and "County Council Brief".
- **Modify** `src/components/ToolkitSpeaking.astro` — replace the "Council Handout" PDF section (lines ~124-141) with a "Leave-behind" section linking the two new pages.
- **Modify** `src/pages/toolkit/index.astro` — update the "Speak Up" card `desc` + `tags` (drop "Handout PDF" / "Council handout PDF to leave behind").
- **Modify** `src/pages/toolkit/speaking.astro` — update `<description>` ("Council handout PDF to leave behind" → the two leave-behind pages).
- **Leave in place, do not delete** `public/toolkit/speaking/council-handout.pdf` — just remove every link/reference to it.

---

## Data model (`src/data/council-brief.ts`)

```ts
export interface BriefGround { lead: string; rest: string; }        // bold lead + remainder
export interface BriefCard { title: string; cite?: string; body: string; span?: boolean; }
export interface BriefSource { label: string; href: string; tag: string; }
export interface BriefFaq { q: string; a: string; }

export interface CouncilBrief {
  variant: 'city' | 'county';
  breadcrumbLabel: string;          // "City Council Brief"
  pageTitle: string;                // <title>
  pageDescription: string;          // meta description
  standfirst: string;
  ask: { lede: string; paras: string[] };
  authority: { intro: string; grounds: BriefGround[]; ledeClose: string };
  precedent: { intro: string; quote: { text: string; attribution: string }; close: string };
  model: { intro: string; cards: BriefCard[]; note: string };
  faq?: { heading: string; items: BriefFaq[] };   // county only
  sources: { intro: string; items: BriefSource[] };
  contact: { heading: string; body: string; email: string };
}
```

Copy comes verbatim from `scratchpad/council-brief-copy.md`. Shared fragments (ask, precedent incl. quote, contact, and 4 of 5 sources) are defined once and referenced by both objects. `cityBrief.faq` is undefined; `countyBrief.faq` holds the 3 Q&As. Source row 4 differs (city: "municipal powers, Section 5-7-30 / scstatehouse.gov/code/t05c007.php"; county: "county powers, Title 4 (Section 4-9-25)"). Real URLs from the original doc's Sources list; use the same hrefs.

---

## Component (`src/components/CouncilBrief.astro`)

- Renders every section from the `brief` prop. Header = DEFLOCK/SC lockup + "Constituent brief · Aug 2026" filed tag, H1 "Public rules for public cameras", standfirst. **No "Prepared for / Subject / From" block.**
- Section heads: bold `<h2>` with a `::before` red tick-bar (24×3px) — no eyebrow overlines.
- Grounds: 1px-gap dark rows, red square mark + bold lead + rest.
- Pull quote: `<figure><span class="qmark" aria-hidden="true">&ldquo;</span><blockquote>…</blockquote><figcaption>…</figcaption></figure>` — large serif quote mark behind (`rgba(220,38,38,~0.2)`), mono attribution, no em dash.
- Model cards: dark `#111` cards in a 1px-gap grid, amber § `cite` tag; `span` card full-width. Card `title` may contain a trailing " — a city addition" style qualifier rendered inline (author it in the data as part of `title`; the render must not add an em dash — use the exact punctuation from the copy doc, i.e. "a city addition" phrased without a dash, e.g. as a parenthetical or a following clause).
- FAQ (if `brief.faq`): stacked open Q&A (bold `<h3>` question + `<p>` answer) so it prints fully; no JS accordion.
- Print action: quiet end-of-page row (heading + one line + red `<button id="print-brief">`), `class="no-print"`. Script: `document.getElementById('print-brief')?.addEventListener('click', () => window.print())` (guard for `astro:after-swap` re-init like other components).
- Reveal-on-scroll: reuse the site's `data-reveal` hook or omit; must not hide content when printed or under `prefers-reduced-motion`.

### Print stylesheet (co-located, global, scoped)

`<style is:global>` block, entirely inside `@media print`, transforms the page to the light sheet:
- Hide site chrome: `nav`, `footer`, the `ActionModal` root, the breadcrumb section, the siblings section, the skip link, and `.no-print` (the print button). Confirm the actual selectors/classes in `Base.astro`, `Nav.astro`, `Footer.astro`, `ActionModal.astro` before writing the hide list.
- Restyle `.leave-behind` to the light paper: white panel, 5px red top border, light ink `#1b1b1e`, muted `#4f4f57`, accent `#b45309` links, `.qmark` low-opacity red, cards as light `#fafafa` with hairline borders — port values from the original `council-leave-behind.html` `@media print` + `.sheet` rules.
- `break-inside: avoid` on cards, quote, grounds rows; `h1,h2,h3 { break-after: avoid }`. Target ~1 page (2 acceptable). No animations.
- The dark `deflock` theme sets `color-scheme: dark`; force `color-scheme: light` and explicit colors on the brief for print so nothing inverts.

---

## Toolkit integration copy

Replace `ToolkitSpeaking.astro`'s "Council Handout" block with:

- Heading "Leave one behind"
- One line: "A one-page brief with the case, the Oconee model, and the sources. Print copies for each member and hand them to the clerk before you speak."
- Two links (site's bordered/label-mono link style, not a filled button): "City council →" `/toolkit/speaking/city-council-brief` and "County council →" `/toolkit/speaking/county-council-brief".

`toolkit/index.astro` "Speak Up" card: `desc` → "Full talk track for public comment. Rebuttals for common pushback. Printable leave-behind briefs for city and county councils." `tags` → replace "Handout PDF" with "Leave-behind briefs".

`speaking.astro` `<description>`: "…Rebuttals for common pushback. Printable leave-behind briefs for city and county councils."

---

## Facts to verify during the build (do not ship unverified)

- **SC Const. Art. V § 24** elected-sheriff pin-cite. If the exact section can't be confirmed quickly, phrase as "an independently elected constitutional officer under the state constitution" without the pin-cite rather than assert a wrong number.
- Oconee § mapping and the dated facts (Aug 18 4-1 vote, Sep 15 hearing, Aug 21 Greer pause) match the original doc's sources; keep the original doc's source URLs.

---

## Tasks

1. **Content module.** Create `src/data/council-brief.ts` from the copy doc (typed, shared fragments as consts). `astro build` still passes (unused module compiles).
2. **Component — screen.** Create `CouncilBrief.astro` rendering the dark brief from a passed `brief`. Temporarily render it on one page to eyeball.
3. **Component — print.** Add the `@media print` light-sheet block; verify in browser print preview that chrome is hidden and the sheet renders light on ~1 page.
4. **Pages.** Create the two page files (Base + breadcrumb + JSON-LD + siblings + back-link), each rendering its variant.
5. **Toolkit links + copy.** Update `ToolkitSpeaking.astro`, `toolkit/index.astro`, `speaking.astro`; remove all references to `council-handout.pdf`.
6. **Verify.** `astro build` clean; dev server: both pages render dark, no console errors, print preview shows the light sheet with chrome hidden; mobile + desktop; toolkit links resolve; grep confirms no remaining `council-handout.pdf` reference in `src/`.
7. **Adversarial self-review + fix.** Re-read the diff against this plan and the design doc: fatal-pattern/em-dash-free copy in the rendered output, print CSS actually hides every chrome element, no horizontal overflow on mobile, focus states present, `prefers-reduced-motion` respected.

---

## Verification commands

```bash
npx astro build
# grep for orphaned references (should return nothing in src/)
grep -rn "council-handout" src/
```

Then dev-server + preview checks per Task 6.
