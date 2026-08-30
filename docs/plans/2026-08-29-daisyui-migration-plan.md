# DaisyUI Site-Wide Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the events subsystem's DaisyUI vocabulary to all non-homepage areas (chrome, toolkit, blog, action modal, 404), normalize the six near-black surface colors to the three theme base tokens, and settle the theme radii to the approved slightly-rounded values.

**Architecture:** DaisyUI 5.6.18 is already installed and themed (`deflock` theme in `src/styles/global.css`, `data-theme="deflock"` on `<html>`). Each task swaps hand-rolled component styling for the daisy vocabulary while keeping layouts, copy, and interaction logic. A build-unblocking Tailwind scan exclusion (Task 0) precedes everything — it makes `docs/` categorically safe to commit documentation into (an embedded backslash-plus-hex absolute path in any scanned file crashes the Tailwind build; see Task 0 for the corrected root cause); then shared primitives (theme tokens, toast, rail tabs, filter chips) land; the action modal migrates last, isolated, behind its mandatory smoke test.

**Tech Stack:** Astro 5, Tailwind CSS 4 (CSS-first config, `@plugin` directives), daisyUI 5.6.18, `@tailwindcss/typography` 0.5.20 (new), vitest.

**Companion spec:** `docs/plans/2026-08-29-daisyui-migration-design.md` — read its house-style guide (§3) and exceptions (§5) before starting. The approved visual target is the `deflock-ui-kit.html` mockup, which Task 0 Step 3 copies into the repo at its stable reference path `docs/plans/assets/deflock-ui-kit.html`. (The originals sit in the planning session's scratchpad; Task 0 spells that directory out with FORWARD slashes only — the scanner payload is specifically a backslash followed by hex digits, so the forward-slash spelling is inert. Never write the backslash form of that path into any committed file.)

**Ground rules for every task:**
- Do NOT touch homepage section components (`Hero`, `HowItWorks`, `HowItWorksOverlays`, `MapSection`, `BillTracker`, `BlogPreview`, `CitizenToolkit`, `FAQ`, `TakeAction`), the events subsystem, `CouncilBrief.astro`, `og-image.ts`, or blog markdown content.
- Class strings emitted from TypeScript must be complete literals (Tailwind 4 scans `.ts` files; concatenated class-name fragments emit no CSS).
- Runtime DOM is built with safe DOM methods (`createElement` + `textContent`); no new `innerHTML` sinks.
- **44px touch floor (house rule #6), stated once and applied everywhere touch controls are migrated:** daisyUI's defaults miss it — with this theme's `--size-field: 0.25rem`, a bare `btn`/`input`/`select` is 40px tall and `btn-sm`/`select-sm` is 32px. Every migrated control a finger can hit therefore carries an explicit `min-h-11` (44px) — or `min-h-12`/`min-h-14` where it matches a taller sibling — and square icon buttons pair it with `min-w-11`. The per-control classes are spelled out in each task; a daisy class list without a `min-h-*` on a touch control is a task error.
- Verification baseline per task: `npm run build` exits 0. Preview checks use the `dev` config in `.claude/launch.json` (`node node_modules/astro/astro.js dev --host 127.0.0.1`). Shell commands in this plan are written for the repo's primary shell, PowerShell 5.1 (no `&&`, no `export`); `grep -rn` verification one-liners run in Git Bash (the Bash tool).

---

## Phase A — Foundation

### Task 0: Exclude `docs/` from Tailwind content scanning (guards the build against scanner-hostile doc content)

**Files:**
- Modify: `src/styles/global.css` (one line, directly after `@import "tailwindcss";`)
- Create: `docs/plans/2026-08-29-daisyui-migration-design.md` (the design spec, copied in from the planning session's scratchpad — Step 3)
- Create: `docs/plans/2026-08-29-daisyui-migration-plan.md` (this plan, copied in — Step 3)
- Create: `docs/plans/assets/deflock-ui-kit.html` (the approved mockup, copied in — Step 3)

**Why this is Task 0 (root cause, corrected after adversarial review):** Tailwind CSS 4's automatic content detection scans the whole repo — including `docs/`. Its candidate scanner runs a CSS-escape decoder (in the tailwindcss lib) over scanned strings: a backslash followed by 1–6 hex digits is treated as a CSS unicode escape and decoded with `String.fromCodePoint`, which throws for any value above the Unicode maximum 0x10FFFF. An earlier draft of this plan embedded the planning session's drive-absolute Windows scratchpad path, whose directory segment is a UUID that begins with hex characters — the path separator plus that segment forms exactly such an escape, and its leading hex digits decode to 0xBC6710 = 12,347,152: the `RangeError: Invalid code point 12347152` observed during Item 1 verification (surfacing through `daisyui/functions/variables` → the tailwindcss lib during the CSS transform, breaking BOTH `astro dev` AND the production `astro build`). The trigger is an embedded backslash-plus-hex absolute path in a scanned file — NOT daisyUI class strings: `docs/plans/2026-08-24-council-meetings-implementation-plan.md` already contains `btn btn-primary` and `tabs tabs-box`, and master builds fine. This plan/design pair is defanged (the scratchpad directory appears only in forward-slash form, which the CSS-escape decoder ignores — the payload requires a backslash immediately before the hex digits), but the exclusion still lands first: it makes `docs/` categorically safe, so no future doc that pastes a backslashed Windows path — or any other scanner-hostile byte sequence — can take the build down.

**Ordering constraint (hard):** Step 2's exclusion and Step 3's three copied artifacts land together in the branch's FIRST commit (Step 5), before any other Item 2 work. The docs themselves are defanged, but the exclusion is what guarantees nothing under `docs/` (now or later) can re-trigger the scanner crash — no committed state may ever contain these docs without the guard.

- [ ] **Step 1: Create the working branch** (PowerShell 5.1 — no `&&`; run as separate commands)

```powershell
git checkout master
git pull
git checkout -b feature/daisyui-migration
```

- [ ] **Step 2: Add the negative source directive**

In `src/styles/global.css`, directly after `@import "tailwindcss";` (before the `@plugin` lines), add:

```css
@source not "../../docs";
```

The path is relative to the stylesheet: `global.css` lives at `src/styles/`, so `../../docs` resolves to the repo-root `docs/` folder (verified against the repo layout). Syntax verified against the current Tailwind 4 docs ("Detecting classes in source files → Ignoring specific paths"): `@source not "<path>";` excludes that path from automatic content detection.

**Alternative considered (not chosen):** disable automatic detection entirely (`@import "tailwindcss" source(none);`) and maintain an explicit `@source` allowlist such as `@source "../../src/**/*.{astro,html,js,ts,jsx,tsx}";` that simply omits `.md`. Rejected: the negative source is one line, keeps automatic detection working for any legitimate new source location, and cannot silently drop real sources an allowlist forgot (config files, future `.mdx`, scripts emitting class literals). **Recommended: the `@source not` exclusion.**

- [ ] **Step 3: Copy all three planning artifacts to their stable repo paths (deterministic — always run, no conditionals)**

From the repo root, in PowerShell 5.1:

```powershell
# Scratchpad source dir — spelled with FORWARD slashes on purpose: the Tailwind
# scanner payload is a backslash followed by 1-6 hex digits, so this spelling is
# inert even where a scanner reads it. Never write the backslash form of this
# path into any committed file.
$src = 'C:/Users/tim/AppData/Local/Temp/claude/C--Users-tim-workspace-deflocksc-website/bc67103d-efce-4ea8-8f91-778e0caa2384/scratchpad'
New-Item -ItemType Directory -Force docs/plans/assets
Copy-Item "$src/2026-08-29-daisyui-migration-design.md" docs/plans/2026-08-29-daisyui-migration-design.md
Copy-Item "$src/2026-08-29-daisyui-migration-plan.md" docs/plans/2026-08-29-daisyui-migration-plan.md
Copy-Item "$src/deflock-ui-kit.html" docs/plans/assets/deflock-ui-kit.html
```

All three land under `docs/`, which Step 2 just excluded from Tailwind scanning, so the copies are build-safe regardless of what byte sequences they contain. `docs/plans/assets/deflock-ui-kit.html` is the stable reference path every doc uses from now on.

- [ ] **Step 4: Verify**

With the exclusion in place and the migration docs + mockup present under `docs/`:

- `npm run build` (`astro build`) exits 0 — no `RangeError: Invalid code point …` from the CSS transform — and `astro dev` (the `dev` config in `.claude/launch.json`) serves the homepage cleanly.
- Repro check (proves the exclusion actually guards `docs/`): create a throwaway `docs/scan-repro.md` containing Step 3's `$src` path converted to backslashes (type the backslash form into the throwaway file ONLY — never into this plan or any committed file) and re-run `npm run build` — it must still exit 0. As the negative control, temporarily comment out the `@source not` line: the same build now fails with the RangeError. Restore the line and delete `docs/scan-repro.md`.
- daisyUI utilities used by real components still generate: `/events` renders styled (tabs pill, buttons intact), and the built CSS under `dist/` still contains `.btn` — the exclusion must only remove `docs/` from scanning, never suppress real component classes.

- [ ] **Step 5: Commit — the branch's first commit, all four files together**

```powershell
git add src/styles/global.css docs/plans/2026-08-29-daisyui-migration-design.md docs/plans/2026-08-29-daisyui-migration-plan.md docs/plans/assets/deflock-ui-kit.html
git commit -m "fix(build): exclude docs/ from Tailwind content scan (CSS-escape RangeError) + vendor migration docs and UI-kit mockup"
```

This is deliberately one commit: the exclusion and the three vendored artifacts land atomically, so no committed state ever has the docs without the guard.

---

### Task 1: Settle theme tokens (radius, neutral) and chrome surfaces

**Files:**
- Modify: `src/styles/global.css` (theme block lines ~63–71; three widget radii at ~350/~433/~445)
- Modify: `src/layouts/Base.astro` (lines 53, 75)

- [ ] **Step 1: Update the `deflock` theme block in `src/styles/global.css`**

Replace:

```css
  --color-neutral: #1a1a1a;
```

with (the mockup's improvised neutral — `btn-neutral` at theme value #1a1a1a is invisible on base-100):

```css
  --color-neutral: #262626;
```

Replace:

```css
  --radius-selector: 0.25rem;
  --radius-field: 0.25rem;
  --radius-box: 0.375rem;
```

with:

```css
  --radius-selector: 0.3rem;
  --radius-field: 0.3rem;
  --radius-box: 0.45rem;
```

Also update the theme block's comment from "squared/small corners" to "slightly-rounded corners (0.3rem fields / 0.45rem boxes, per the approved UI-kit mockup)".

Then update the three hard-coded `0.25rem` radii further down in `global.css` — the accessible-autocomplete and Cally skins. Runtime-created elements DO inherit the theme's custom properties (the `deflock` theme block sits on `[data-theme]` at the root, so `--radius-field` cascades to them like any inherited custom property), so bind these rules to the token directly instead of mirroring it by literal:

- `.autocomplete__input` (~line 350): `border-radius: 0.25rem;` → `border-radius: var(--radius-field);`
- `.deflock-calendar::part(button)` (~line 433): same change
- `calendar-month.deflock-month::part(button)` (~line 445): same change

**Decision (settled):** these bind to `var(--radius-field)` rather than staying behind as hard-coded exceptions. The autocomplete rule's own comment declares it "matched to the daisyUI `.input` look … field radius" — a literal value would silently fork the token the next time the theme radius moves; the `var()` reference tracks it forever.

- [ ] **Step 2: Update `src/layouts/Base.astro` surface tokens**

Line 53, replace `content="#111111"` with `content="#171717"`.

Line 75, replace:

```html
<body class="bg-[#111111] text-[#a0a0a0] font-['Instrument_Sans_Variable',sans-serif] leading-[1.7] min-h-screen">
```

with:

```html
<body class="bg-base-100 text-[#a0a0a0] font-['Instrument_Sans_Variable',sans-serif] leading-[1.7] min-h-screen">
```

- [ ] **Step 3: Verify**

Run: `npm run build` — expect exit 0.
Start the dev preview, load `/events`: page background is now `#171717` (was `#111111` behind the hero band), tabs pill and modal corners slightly rounder, no layout breakage. Load `/` briefly: homepage still renders (its sections paint their own backgrounds; the body shift is the approved subtle change).

**Neutral-token blast radius — two EXCLUDED events controls use `btn-neutral` and shift `#1a1a1a` → `#262626` (verify, do NOT edit them):**
- Load `/events/submit` and check the form's Cancel button (`btn btn-neutral`, `SubmitEventForm.astro` ~line 384): now a visible `#262626` fill on base-100 (the old `#1a1a1a` neutral was near-invisible there), `#d4d4d4` text still readable, hover state sane.
- On `/events`, select a county on the map to reveal the back-to-state control (`#events-map-back`, `btn btn-sm btn-neutral map-back`, `EventsMap.astro`): same checks, and it still sits legibly over the map.

Both shifts are expected wins; the check is that neither control reads as broken or out of place.

**Radii verification:** on `/events/submit` (desktop) the city combobox input and the Cally calendar buttons show the theme's 0.3rem field-radius corners matching the daisy inputs beside them (their rules now resolve `var(--radius-field)`) — no stray 0.25rem corners left in those widgets.

- [ ] **Step 4: Commit**

```powershell
git add src/styles/global.css src/layouts/Base.astro
git commit -m "feat(theme): settle deflock radii/neutral to approved mockup, body to base-100"
```

---

### Task 2: Shared primitives — toast, rail tabs, filter chips, breadcrumb separator

**Files:**
- Create: `src/scripts/toast.ts`
- Modify: `src/styles/global.css` (append after the `.sidebar-active` rules)
- Modify: `src/layouts/Base.astro` (before `</body>`)

- [ ] **Step 1: Create `src/scripts/toast.ts`**

```ts
// Site-wide copy-feedback toast: a neutral daisyUI `.alert` inside the fixed
// `.toast` container in Base.astro. Replaces the per-button "Copied!" text
// swaps. One toast at a time; auto-dismisses. All DOM is built with safe DOM
// methods; the class strings are complete literals on purpose — Tailwind 4
// scans this file for them (class-parity rule).
//
// A11y: the container in Base.astro is the PERSISTENT live region
// (role="status" aria-live="polite"). We only empty/refill it — a
// newly-inserted element carrying role=status is not reliably announced by
// screen readers, so the injected alert itself carries no role.

const SVG_NS = 'http://www.w3.org/2000/svg';

function checkIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'h-6 w-6 shrink-0 stroke-current');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z');
  svg.appendChild(path);
  return svg;
}

let hideTimer: number | undefined;

export function showToast(message: string): void {
  const container = document.getElementById('app-toast');
  if (!container) return;
  const alert = document.createElement('div');
  alert.className = 'alert border-white/25';
  const span = document.createElement('span');
  span.textContent = message;
  alert.append(checkIcon(), span);
  container.replaceChildren(alert);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    container.replaceChildren();
  }, 2400);
}
```

- [ ] **Step 2: Add the toast container to `src/layouts/Base.astro`**

Insert directly before the closing `</body>` tag (after the `[data-reveal]` script):

```html
    {/* Copy-feedback toast target (src/scripts/toast.ts). z-[70] sits above the
        action modal (z-[60]). PERSISTENT aria-live region: always in the DOM
        and the accessibility tree so screen readers reliably announce content
        swapped into it (a freshly-inserted role=status node is not reliably
        announced). Empty = renders nothing. */}
    <div id="app-toast" class="toast toast-end z-[70]" role="status" aria-live="polite"></div>
```

- [ ] **Step 3: Append shared house-style CSS to `src/styles/global.css`**

Add after the `.sidebar-active.px-8` rule. Also edit the existing comment above `.sidebar-btn` from `(FAQ, FOIA templates, Rebuttals, Legal)` to `(homepage FAQ only — toolkit consumers migrated to .rail-tab; delete with the homepage rebuild)`.

```css
/* ── DaisyUI migration shared primitives (2026-08 site-wide pass) ──
   Unlayered on purpose: these win over daisyUI's @layer rules at equal
   specificity. Runtime renderers (toast.ts, foia-finder.ts,
   results-renderer.ts) build DOM carrying these classes, so they must stay
   global — scoped styles would never match (class-parity rule). */

/* Toast container: a PERSISTENT live region — never display:none'd (toggling
   display, like inserting a fresh role=status node, makes screen-reader
   announcements unreliable). Empty it paints nothing, but daisy's .toast is a
   fixed padded flex box, so keep the shell click-transparent. */
#app-toast { pointer-events: none; }
#app-toast > * { pointer-events: auto; }

/* Master-detail rail: vertical tabs replacing .sidebar-btn/.sidebar-active.
   Active state keys on aria-selected (toggled by src/scripts/tab-rail.ts) —
   luminance + red edge + weight, never hue alone. The 2px left border is
   always reserved so activation adds no layout shift. */
.rail-tab {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-left: 2px solid transparent;
  color: #a3a3a3;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.rail-tab + .rail-tab { border-top: 1px solid rgba(255, 255, 255, 0.04); }
.rail-tab:hover { background: rgba(255, 255, 255, 0.04); color: #e8e8e8; }
.rail-tab[aria-selected="true"] {
  background: #1a1a1a;
  border-left-color: #dc2626;
  color: #e8e8e8;
  font-weight: 600;
}
.rail-tab:focus-visible { outline: 2px solid #fbbf24; outline-offset: -2px; }

/* Filter chips: daisy radio-as-btn groups (blog tags, FOIA agency types).
   All chips stay visible; :checked is the semantic active state and paints
   the mockup's primary fill. */
.filter-chip:checked {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}

/* daisyUI breadcrumbs, deflock skin: the approved mockup separates crumbs
   with "/" — replace daisy's rotated-border chevron. Spacing decision:
   daisy's own separator margin-inline (0.5rem 0.75rem) is deliberately KEPT —
   this override touches glyph properties only, never margins. */
.breadcrumbs > ul > li + li::before {
  content: "/";
  border: 0;
  rotate: none;
  width: auto;
  height: auto;
  opacity: 1;
  color: #525252;
  background: none;
}
```

- [ ] **Step 4: Verify the breadcrumb override against the real component CSS**

Read `node_modules/daisyui/components/breadcrumbs.css` and confirm the separator selector and glyph properties (`content`, border, `rotate`, size, `opacity`). Separator spacing is settled: keep daisy's stock `margin-inline` (0.5rem 0.75rem) on the separator — the override must not add or reset margins. If daisy targets `li + *::before` instead of `li + li::before`, adjust the selector; reset exactly the glyph properties daisy sets, nothing more.

- [ ] **Step 5: Verify build + toast smoke**

Run: `npm run build` — exit 0.
In the dev preview on any page, run in the console: `import('/src/scripts/toast.ts').then(m => m.showToast('Letter copied to clipboard'))` — a neutral dark alert with a check icon appears bottom-right and disappears after ~2.4s. Confirm in the browser's accessibility tree that `#app-toast` is a status live region present BEFORE the toast fires (that persistence is what makes the announcement reliable); with a screen reader running, the message is spoken. Also confirm the empty container doesn't block clicks in the bottom-right corner. (If the dev-server module path 404s, verify instead after Task 6 wires a real consumer.)

- [ ] **Step 6: Commit**

```bash
git add src/scripts/toast.ts src/styles/global.css src/layouts/Base.astro
git commit -m "feat(ui): shared daisy primitives — toast, rail tabs, filter chips, breadcrumb separator"
```

---

## Phase B — Per-area migration

### Task 3: Site chrome — Nav

**Files:**
- Modify: `src/components/Nav.astro`

Keep unchanged: the scroll-solid-fade behavior, the blinking `.status-dot` + its `<style>` block, the desktop toolkit hover-dropdown JS (show/hide with 150 ms grace), the `nav::after` sheen.

- [ ] **Step 1: Desktop bar**

Replace line 5:

```html
  <div class="px-6 md:px-12 h-16 flex items-center justify-between">
```

with:

```html
  <div class="navbar h-16 min-h-0 py-0 px-6 md:px-12 justify-between">
```

- [ ] **Step 2: Toolkit dropdown panel → daisy `menu`**

Replace the panel (lines 21–26, the `div` inside `.toolkit-menu`) with:

```html
          <ul class="menu menu-sm bg-base-200 border border-[rgba(255,255,255,0.07)] rounded-field min-w-[180px] p-1">
            <li><a href="/toolkit/foia" class="text-[#a3a3a3] hover:text-white font-bold text-[11px] uppercase tracking-[0.1em]">FOIA Templates</a></li>
            <li><a href="/toolkit/speaking" class="text-[#a3a3a3] hover:text-white font-bold text-[11px] uppercase tracking-[0.1em]">Speaking Guide</a></li>
            <li><a href="/toolkit/outreach" class="text-[#a3a3a3] hover:text-white font-bold text-[11px] uppercase tracking-[0.1em]">Outreach Kit</a></li>
            <li><a href="/toolkit/legal" class="text-[#a3a3a3] hover:text-white font-bold text-[11px] uppercase tracking-[0.1em]">Legal Primer</a></li>
          </ul>
```

- [ ] **Step 3: Take Action buttons → `btn btn-primary`**

Desktop (line 31):

```html
      <button type="button" data-open-action class="hidden md:inline-flex btn btn-primary btn-sm min-h-11 text-xs uppercase tracking-[0.1em]">Take Action</button>
```

(`min-h-11` per the 44px floor: bare `btn-sm` is 32px, and even the current bespoke button is only ~38px — the migration is where it gets fixed.)

- [ ] **Step 4: Hamburger → `btn btn-ghost btn-square`**

Replace the hamburger button's class list (line 32) with:

```html
class="md:hidden btn btn-ghost btn-square min-h-11 min-w-11 text-[#a3a3a3] hover:text-white"
```

(keep `id`, `aria-label`, `aria-expanded`, and the inner SVG). The current bespoke button is 40×40 and a bare `btn-square` is 40×40 too — both under the floor; `min-h-11 min-w-11` brings it to 44×44.

- [ ] **Step 5: Mobile menu → daisy `menu` with a native `<details>` submenu**

Replace the whole `#nav-mobile-menu` block (lines 41–61) with:

```html
  <!-- Mobile menu -->
  <ul id="nav-mobile-menu" class="menu md:hidden hidden w-full bg-base-100 border-t border-[rgba(255,255,255,0.07)] px-4 py-4 gap-1">
    <li><a href="/" class="min-h-11 text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em]">Home</a></li>
    <li>
      <details>
        <summary class="min-h-11 text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em]">Toolkit</summary>
        <ul>
          <li><a href="/toolkit" class="min-h-11 text-[#737373] hover:text-white font-bold text-xs uppercase tracking-[0.1em]">All Tools</a></li>
          <li><a href="/toolkit/foia" class="min-h-11 text-[#737373] hover:text-white font-bold text-xs uppercase tracking-[0.1em]">FOIA Templates</a></li>
          <li><a href="/toolkit/speaking" class="min-h-11 text-[#737373] hover:text-white font-bold text-xs uppercase tracking-[0.1em]">Speaking Guide</a></li>
          <li><a href="/toolkit/outreach" class="min-h-11 text-[#737373] hover:text-white font-bold text-xs uppercase tracking-[0.1em]">Outreach Kit</a></li>
          <li><a href="/toolkit/legal" class="min-h-11 text-[#737373] hover:text-white font-bold text-xs uppercase tracking-[0.1em]">Legal Primer</a></li>
        </ul>
      </details>
    </li>
    <li><a href="/blog" class="min-h-11 text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em]">Blog</a></li>
    <li><a href="/events" class="min-h-11 text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em]">Events</a></li>
    <li class="mt-1"><button type="button" data-open-action class="btn btn-primary min-h-12 justify-start text-sm uppercase tracking-[0.1em]">Take Action</button></li>
  </ul>
```

(Touch floor: daisy `menu` items are only ~36px tall, so every mobile link and the Toolkit `<summary>` carries `min-h-11` — this menu is touch-first. `min-h-12` keeps the mobile Take Action at its current ~48px height. The DESKTOP toolkit hover-dropdown in Step 2 is pointer-only and keeps `menu-sm` heights.)

Then in the `<script>`: delete the "Mobile toolkit sub-menu toggle" block (lines 129–139) — the native `<details>` replaces it. Keep the hamburger toggle and close-on-link-click blocks unchanged.

- [ ] **Step 6: Scroll-fade class parity**

In the scroll listener (lines 69–77), replace both occurrences of `'bg-[#111111]'` with `'bg-base-100'` (the add list and the remove list).

- [ ] **Step 7: Verify**

`npm run build` — exit 0. Dev preview:
- Desktop: brand + links laid out as before; scroll down → nav fades to solid `#171717`; toolkit hover-dropdown opens as a dark menu with 150 ms grace; Take Action is the red daisy button and opens the modal.
- Mobile (375 px): hamburger opens the menu; Toolkit `<details>` expands; tapping a link closes the menu; Take Action opens the modal.
- Status dot still blinks.

- [ ] **Step 8: Commit**

```bash
git add src/components/Nav.astro
git commit -m "feat(nav): daisy navbar/menu/btn vocabulary, native details submenu, token swap"
```

---

### Task 4: Site chrome — Footer

**Files:**
- Modify: `src/components/Footer.astro`

- [ ] **Step 1: Token swap + `footer-title` headings (layout keeps the explicit grid — settled decision)**

**Decision (settled, no fallback branch):** the footer does NOT adopt daisy's `footer`/`footer-horizontal` layout classes. Grounded in `node_modules/daisyui/components/footer.css`: `.footer` styles every direct child as its own grid (`& > :not(script,style,template) { display: grid; gap: .5rem }`) — which would fight the columns' internal `mb-*` spacing — and forces `font-size: .875rem` on a footer whose About/Resources text is 16px; `.footer-horizontal` is just `grid-auto-flow: column`, i.e. content-sized auto columns, NOT the current equal thirds. The final layout line is the current explicit responsive grid, unchanged: `class="grid md:grid-cols-3 gap-12"` (line 7 — do not touch it). Daisy's contribution to this component is `footer-title` on the headings plus the base-token swap.

Replace line 4:

```html
<footer class="bg-[#171717] border-t border-[rgba(255,255,255,0.07)] py-16">
```

with:

```html
<footer class="bg-base-100 border-t border-[rgba(255,255,255,0.07)] py-16">
```

Add `footer-title` alongside each of the three `<h3>` class lists (lines 10, 17, 30), keeping the existing classes, e.g.:

```html
<h3 class="footer-title text-white font-extrabold text-sm uppercase tracking-[0.1em] mb-4 opacity-100">
```

(`opacity-100` overrides daisy's dimmed footer-title so the headings stay white. `footer-title` is a standalone styling class — it does not require a `.footer` parent.)

- [ ] **Step 2: Verify**

`npm run build`. Preview any page footer: three EQUAL columns on desktop, stacked on mobile, headings white, amber resource links unchanged, Explore grid (2-col mono list) intact, body text still 16px.

- [ ] **Step 3: Commit**

```powershell
git add src/components/Footer.astro
git commit -m "feat(footer): footer-title headings + base tokens (layout grid kept, settled)"
```

---

### Task 5: 404 page

**Files:**
- Modify: `src/pages/404.astro`

- [ ] **Step 1: Buttons**

Replace lines 13–14 with:

```html
        <a href="/" class="btn btn-primary min-h-11 text-xs uppercase tracking-[0.08em] px-8">Back to Home</a>
        <a href="/blog" class="btn btn-ghost min-h-11 text-[#fbbf24] hover:text-[#fcd34d] text-xs uppercase tracking-[0.08em] px-8">Read the Blog</a>
```

(`min-h-11` = the 44px touch-target floor, house rule #6 — the current bespoke buttons are ~46px; a bare daisy `btn` would drop them to ~40px.)

- [ ] **Step 2: Verify + commit**

`npm run build`; preview `/definitely-not-a-page`: red daisy button + amber ghost button, ghost "404" backdrop unchanged.

```bash
git add src/pages/404.astro
git commit -m "feat(404): daisy btn vocabulary"
```

---

### Task 6: Copy-feedback → shared toast (toolkit call sites)

**Files:**
- Modify: `src/components/ToolkitFoia.astro` (copy button markup + inline script)
- Modify: `src/components/ToolkitOutreach.astro` (copy button markup + inline script)

(The third call site — the action modal's Copy Letter — migrates inside Task 14 so the modal is touched exactly once.)

- [ ] **Step 1: ToolkitFoia copy button**

Replace the copy button (lines 160–167) with:

```html
          <button
            type="button"
            class="copy-btn btn btn-primary min-h-11 text-xs uppercase tracking-[0.1em]"
            data-template-id={tmpl.id}
          >
            Copy Template
          </button>
```

(`min-h-11`: a bare daisy `btn` is 40px — under the 44px floor.)

In the inline `<script>`, add at the top:

```ts
  import { showToast } from '../scripts/toast';
```

and in the copy handler replace the label/success swap (the `const label = …` through the `setTimeout` block) with:

```ts
        showToast('Template copied to clipboard');
```

(The old inline "Copied!" feedback carried `role="status"`; deleting it does NOT lose the screen-reader announcement — the persistent `#app-toast` live region from Task 2 announces the toast message instead. Same applies to the outreach button in Step 2.)

- [ ] **Step 2: ToolkitOutreach copy button**

Replace the copy button (lines 39–45) with:

```html
    <button
      type="button"
      class="copy-onepager-btn btn btn-primary min-h-11 text-xs uppercase tracking-[0.1em]"
    >
      Copy Text
    </button>
```

In its `<script>`, add `import { showToast } from '../scripts/toast';` at the top and replace the label/success swap block with:

```ts
        showToast('One-pager copied to clipboard');
```

- [ ] **Step 3: Verify**

`npm run build`. Preview `/toolkit/foia`: click Copy Template → clipboard filled, neutral toast bottom-right, button text never changes. Same on `/toolkit/outreach` Copy Text. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolkitFoia.astro src/components/ToolkitOutreach.astro
git commit -m "feat(toolkit): unify copy feedback into shared neutral toast"
```

---

### Task 7: Toolkit chrome — breadcrumbs, sibling chips, hub badges, surface tokens

**Files:**
- Modify: `src/pages/toolkit/index.astro`
- Modify: `src/pages/toolkit/foia.astro`, `speaking.astro`, `outreach.astro`, `legal.astro`
- Modify: `src/pages/toolkit/speaking/city-council-brief.astro`, `county-council-brief.astro`

- [ ] **Step 1: Breadcrumbs (6 files: the 4 toolkit sub-pages + 2 brief pages)**

Each page has the same `<nav aria-label="Breadcrumb">` block (~lines 28–36). Replace the `<nav>`+`<ol>` with the daisy structure, keeping the same links/labels per page. Pattern (foia example — briefs have one extra crumb):

```html
      <nav aria-label="Breadcrumb" class="breadcrumbs label-mono-nav py-0 mb-6">
        <ul>
          <li><a href="/" class="text-[#737373] hover:text-[#a3a3a3] transition-colors">Home</a></li>
          <li><a href="/toolkit" class="text-[#737373] hover:text-[#a3a3a3] transition-colors">Toolkit</a></li>
          <li class="text-[#e8e8e8]">Request Records</li>
        </ul>
      </nav>
```

Drop the manual `<li class="text-[#525252]">/</li>` separators — the global override from Task 2 renders `/` automatically. Do not touch the JSON-LD BreadcrumbList blocks.

- [ ] **Step 2: Sibling chips ("More from the Toolkit", 6 files)**

Replace each sibling `<a>` class list (e.g. foia.astro line 51) with:

```html
class="btn btn-outline min-h-11 label-mono-compact font-medium"
```

- [ ] **Step 3: Hub card badges (`toolkit/index.astro` line 79)**

Replace the tag span with:

```html
<span class="badge badge-outline font-['DM_Mono',monospace] text-[9px] tracking-[0.1em] uppercase">{tag}</span>
```

(The amber tint goes; mockup hub chips are muted outline badges.)

- [ ] **Step 4: Surface-token sweep across the 7 files**

In all seven files replace: `bg-[#111111]` → `bg-base-100`, `bg-[#141414]` → `bg-base-100`, `hover:bg-[#1a1a1a]` → `hover:bg-base-200`, `group-hover:bg-[#1a1a1a]` → `group-hover:bg-base-200`. (The alternating `#141414` section banding is deliberately flattened — three surfaces only. Note: `toolkit/index.astro` has no `#141414` occurrences, so the `#141414` pass is a harmless no-op there — not a missed file.) Keep the 1px-gap hub grid, its red top borders, ghost typography, and the hash-redirect script untouched.

- [ ] **Step 5: Verify**

`npm run build`. Preview `/toolkit` and each sub-page + one brief page: breadcrumbs show `Home / Toolkit / …` with muted slashes; sibling chips are outline buttons; hub grid seams intact; hub tags are outline badges. Brief pages: the print view (Ctrl+P preview) of CouncilBrief is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/toolkit
git commit -m "feat(toolkit): daisy breadcrumbs, outline-btn siblings, badge chips, base tokens"
```

---

### Task 8: Toolkit master-detail rails (FOIA templates, rebuttals, 4th-Amendment, bill gaps)

**Files:**
- Create: `src/scripts/tab-rail.ts`
- Modify: `src/components/ToolkitFoia.astro` (template sidebar + panels + script)
- Modify: `src/components/ToolkitSpeaking.astro` (rebuttals sidebar + panels + script)
- Modify: `src/components/ToolkitLegal.astro` (key-points + gaps sidebars/panels)
- Modify: `src/scripts/toolkit-legal.ts` (drop duplicated sidebar JS)

- [ ] **Step 1: Create `src/scripts/tab-rail.ts`**

```ts
// Shared master-detail rail behavior (toolkit FOIA templates, rebuttals,
// 4th-Amendment points, bill gaps). Proper tabs semantics: role=tablist/tab/
// tabpanel, aria-selected drives the visual state (.rail-tab in global.css),
// roving tabindex + arrow-key navigation, panels toggled via [hidden].
// Re-running after astro:after-swap binds the fresh nodes.

export function initTabRail(railId: string): void {
  const rail = document.getElementById(railId);
  if (!rail) return;
  const tabs = Array.from(rail.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  const panelFor = (tab: HTMLElement): HTMLElement | null =>
    document.getElementById(tab.getAttribute('aria-controls') || '');

  function select(tab: HTMLButtonElement, focus?: boolean): void {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelFor(t);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => select(tab)));

  rail.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      select(tabs[next], true);
    }
  });
}
```

- [ ] **Step 2: ToolkitFoia — rail markup**

Sidebar container (line 122): add tablist attributes and the token swap:

```html
  <div class="bg-base-100" role="tablist" aria-label="FOIA templates" id="foia-rail">
```

Template buttons (lines 126–135) become:

```html
    {foiaTemplates.map((tmpl: any, i: number) => (
      <button
        type="button"
        role="tab"
        id={`foia-tab-${i}`}
        aria-controls={`foia-panel-${i}`}
        aria-selected={i === 0 ? 'true' : 'false'}
        tabindex={i === 0 ? 0 : -1}
        class="rail-tab px-6 py-4 text-sm font-medium leading-[1.35]"
      >
        {tmpl.title}
      </button>
    ))}
```

(`sidebar-btn`/`sidebar-active`, `data-foia`, and the per-button `border-b` utilities go away — the rail divider is the `.rail-tab + .rail-tab` rule. A `border-b` utility would lose to `.rail-tab`'s unlayered `border: 0` anyway.)

Panels (line 141): replace the `class:list` wrapper with:

```html
      <div
        class="foia-panel"
        id={`foia-panel-${i}`}
        role="tabpanel"
        aria-labelledby={`foia-tab-${i}`}
        hidden={i !== 0}
      >
```

In the inline script, delete the `foiaBtns`/`foiaPanels` selection block and replace it with:

```ts
  import { initTabRail } from '../scripts/tab-rail';
  // inside initFoiaTab():
  initTabRail('foia-rail');
```

(Keep the copy-button handler from Task 6 and the `astro:after-swap` re-init.)

Also swap this component's remaining `bg-[#111111]` cells → `bg-base-100` while the file is open.

- [ ] **Step 3: ToolkitSpeaking — same conversion for rebuttals**

Sidebar container gets `role="tablist" aria-label="Rebuttal claims" id="rebuttal-rail"`; buttons become `role="tab" id={`rebuttal-tab-${i}`} aria-controls={`rebuttal-panel-${i}`} aria-selected={i === 0 ? 'true' : 'false'} tabindex={i === 0 ? 0 : -1} class="rail-tab px-6 py-4 text-sm font-medium leading-[1.35]"`; panels become `id={`rebuttal-panel-${i}`} role="tabpanel" aria-labelledby={`rebuttal-tab-${i}`} hidden={i !== 0}`. Replace the whole inline script body of `initSpeakingTab()` with `initTabRail('rebuttal-rail');` (plus the import). Swap this component's `bg-[#111111]` cells → `bg-base-100`.

- [ ] **Step 4: ToolkitLegal — two rails**

Same conversion twice in `ToolkitLegal.astro`:
- Key points: `id="legal-rail"`, tabs `legal-tab-${i}` / panels `legal-panel-${i}` (panel `hidden` state moves to the `hidden` attribute).
- Bill gaps: `id="gap-rail"`, tabs `gap-tab-${i}` / panels `gap-panel-${i}`.
- Swap `bg-[#111111]` cells → `bg-base-100`, and — explicitly — line 134's `hover:bg-[#161616]` → `hover:bg-base-200` (Task 7's sweep covers toolkit *pages*, not this component; without this the file keeps a stray near-black that Task 15's audit would catch late).

In `src/scripts/toolkit-legal.ts`, delete the two sidebar-selection blocks at the top of `initLegalTab()` (lines 11–45) and replace with:

```ts
import { initTabRail } from './tab-rail.js';

export function initLegalTab(): void {
  initTabRail('legal-rail');
  initTabRail('gap-rail');
  // …US-map logic below unchanged…
```

Keep everything else (map fetch, popout, bill modal) untouched.

- [ ] **Step 5: Verify**

`npm run build`. Preview:
- `/toolkit/foia`: clicking each template shows its panel; active rail item = base-200 fill + red left edge; Up/Down/Home/End arrows move selection; Tab from the rail goes into the panel.
- `/toolkit/speaking` rebuttals and `/toolkit/legal` both rails: same behavior. Mobile 375 px: rails stack above panels and still switch.
- `grep -rn "sidebar-active" src/components/Toolkit*` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/tab-rail.ts src/scripts/toolkit-legal.ts src/components/ToolkitFoia.astro src/components/ToolkitSpeaking.astro src/components/ToolkitLegal.astro
git commit -m "feat(toolkit): master-detail sidebars -> aria-keyed rail tabs via shared tab-rail helper"
```

---

### Task 9: FOIA finder — inputs, alerts, loading, filter chips, runtime cards

**Files:**
- Modify: `src/components/ToolkitFoia.astro` (finder zone, lines ~26–116)
- Modify: `src/scripts/foia-finder.ts` (runtime class strings + chip listener)

- [ ] **Step 1: Finder input controls**

Geo button (lines 28–33):

```html
      <button id="foia-geo" type="button" class="btn btn-primary text-sm uppercase tracking-[0.08em] min-h-12 whitespace-nowrap">
        Use My Location
      </button>
```

Address form (lines 36–50) → daisy `join`:

```html
        <form id="foia-address-form" class="join w-full">
          <input
            id="foia-address"
            type="text"
            placeholder="Or enter your address..."
            class="input join-item flex-1 min-h-12"
            autocomplete="street-address"
          />
          <button type="submit" class="btn btn-neutral join-item min-h-12">Find</button>
        </form>
```

- [ ] **Step 2: Loading state (lines 59–64)**

```html
  <div id="foia-finder-loading" class="hidden text-center py-8">
    <span class="loading loading-spinner loading-md text-primary" aria-hidden="true"></span>
    <p class="text-[#a3a3a3] text-sm mt-3" role="status">Finding agencies near you...</p>
  </div>
```

- [ ] **Step 3: Error state → real `alert alert-error` (lines 67–70)**

Keep the outer id/`hidden` wrapper so `showFinderState`'s class toggling is untouched; the alert is a child:

```html
  <div id="foia-finder-error" class="hidden mb-6">
    <div class="alert alert-error" role="alert">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6 shrink-0 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <span id="foia-finder-error-msg"></span>
      <button id="foia-finder-retry" type="button" class="btn btn-outline btn-sm min-h-11">Try again</button>
    </div>
  </div>
```

- [ ] **Step 4: Prefill banner → `alert alert-warning` (lines 111–116)**

```html
<div id="foia-prefill-banner" class="hidden mb-6">
  <div class="alert alert-warning" role="status">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6 shrink-0 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    <span>Templates pre-filled for <strong id="foia-prefill-name"></strong></span>
    <button id="foia-prefill-clear" type="button" class="btn btn-outline btn-sm min-h-11">Clear</button>
  </div>
</div>
```

**Touch-target decision (settled, applies to both alerts above):** the Try again / Clear controls were first drafted as `btn-xs` (24px) — well under the 44px floor. Decision: NO exception to house rule #6 is carved; both ship as `btn-sm min-h-11` (44px hit target, compact `btn-sm` type scale). The alerts grow a few pixels taller, which is acceptable; a sub-44px control inside an error/prefill flow is not.

- [ ] **Step 5: Browse search + type chips (lines 90–104)**

Search input:

```html
        <input id="foia-search" type="text" placeholder="Search agencies..." class="input flex-1 min-w-[200px] min-h-12" />
```

(`min-h-12`: a bare daisy `input` is 40px; 48px matches the finder's geo/address/Find controls above.)

Type chips → daisy radio-as-btn group (all chips stay visible; `:checked` = active via the Task 2 `.filter-chip` rule):

```html
        <div class="flex gap-1 flex-wrap" role="radiogroup" aria-label="Filter by agency type">
          <input type="radio" name="foia-type" value="all" aria-label="All" checked class="filter-chip foia-type-chip btn btn-sm min-h-11 text-xs uppercase tracking-[0.05em]" />
          <input type="radio" name="foia-type" value="police" aria-label="Police" class="filter-chip foia-type-chip btn btn-sm min-h-11 text-xs uppercase tracking-[0.05em]" />
          <input type="radio" name="foia-type" value="sheriff" aria-label="Sheriff" class="filter-chip foia-type-chip btn btn-sm min-h-11 text-xs uppercase tracking-[0.05em]" />
          <input type="radio" name="foia-type" value="clerk" aria-label="Clerk" class="filter-chip foia-type-chip btn btn-sm min-h-11 text-xs uppercase tracking-[0.05em]" />
          <input type="radio" name="foia-type" value="state" aria-label="State" class="filter-chip foia-type-chip btn btn-sm min-h-11 text-xs uppercase tracking-[0.05em]" />
        </div>
```

- [ ] **Step 6: `foia-finder.ts` — chip listener + runtime class strings**

Replace the chip click handler (lines 333–344) with:

```ts
  document.querySelectorAll<HTMLInputElement>('.foia-type-chip').forEach(chip => {
    chip.addEventListener('change', () => {
      if (!chip.checked) return;
      activeTypeFilter = chip.value || 'all';
      filterBrowse();
    });
  });
```

`typeBadge` colors map (lines 39–45) → complete daisy literals (class-parity: every string is a full literal so Tailwind's scanner sees it):

```ts
  const colors: Record<string, string> = {
    police: 'badge badge-error',
    sheriff: 'badge badge-error',
    clerk: 'badge badge-warning',
    sled: 'badge badge-neutral',
    scdot: 'badge badge-neutral',
  };
```

and the returned span becomes:

```ts
  return `<span class="${colors[type] || 'badge badge-neutral'} font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.05em]">${labels[type] || type}</span>`;
```

(This file's card renderer keeps its existing template-string approach — data is the build-time contacts JSON, same trust boundary as today; do not add new interpolation of user input.)

Agency card wrapper (line 75): replace the wrapper div's class with:

```
card bg-base-200 border border-white/10 p-4 hover:border-white/20 transition-colors
```

"Use This Agency" button (line 86): replace its class with:

```
foia-use-btn shrink-0 btn btn-neutral btn-sm min-h-11 text-xs uppercase tracking-[0.05em]
```

Confirm no `bg-[#0a0a0a]` remains in this component after Steps 1/5 (the daisy `input` class paints base-100 itself).

- [ ] **Step 7: Verify**

`npm run build`. Preview `/toolkit/foia`:
- Address path: enter a Greenville address → spinner shows, agency cards render as base-200 cards with solid badges, "Use This Agency" prefills templates and shows the amber alert banner; Clear restores.
- Bad address → red alert-error with icon + Try Again.
- Browse all: search filters; type chips switch (active chip = red fill, all chips remain visible).
- No console errors; geolocation path still works if permitted.

- [ ] **Step 8: Commit**

```bash
git add src/components/ToolkitFoia.astro src/scripts/foia-finder.ts
git commit -m "feat(foia-finder): daisy inputs/join/loading/alerts, radio-btn type filter, card+badge runtime renderer"
```

---

### Task 10: Outreach + Speaking remaining controls

**Files:**
- Modify: `src/components/ToolkitOutreach.astro`
- Modify: `src/components/ToolkitSpeaking.astro`

Keep unchanged: the business-card lightbox (markup, styles, JS), the 1px-gap grids, ghost labels.

- [ ] **Step 1: ToolkitOutreach**

- Download PDF link (lines 46–55): class → `btn btn-ghost min-h-11 text-sm font-semibold text-[#a3a3a3] hover:text-white` (keep `download` + SVG).
- The three share links (lines 168–202): each class → `btn btn-ghost min-h-11 text-sm font-bold text-[#a3a3a3] hover:text-white` (keep SVGs + sr-only spans; drop `hover:bg-[#161616]`). (`min-h-11` on all four ghost buttons: bare `btn` is 40px.)
- PNG / Print Sheet links inside card cells: unchanged (quiet mono links).
- Primary conversation-starter cell (line 76): `bg-[#141414]` → `bg-base-200` (it is deliberately elevated above its siblings — the one intent-over-nearest mapping; siblings' `bg-[#111111]` → `bg-base-100`).
- Other `bg-[#111111]` cells in this file → `bg-base-100`; the `bg-[rgba(10,10,10,0.7)]` dimmer stays.

- [ ] **Step 2: ToolkitSpeaking (before-states re-grounded against current master — commit `47aadfa` already de-slopped the find-a-meeting link)**

- Find-a-meeting link (line 27): on current master this is ALREADY a daisy button — `<a href={speakingData.findMeeting.href} class="btn btn-sm btn-outline mb-8">` (the old blue-accent chip is gone; do not reintroduce it). Only change: add the touch floor, PRESERVING `mb-8` — final class list: `btn btn-sm btn-outline min-h-11 mb-8`.
- The two leave-behind brief links (lines ~127–144, inside the "Leave one behind" section's `flex flex-wrap gap-3` row): currently bespoke `inline-flex items-center gap-2 label-mono-compact text-[#a3a3a3] hover:text-[#e8e8e8] border …` chips; class → `btn btn-outline min-h-11 label-mono-compact font-medium` (keep the arrow spans).
- `bg-[#111111]` cells in this file → `bg-base-100`.

- [ ] **Step 3: Verify + commit**

`npm run build`. Preview `/toolkit/outreach`: share/download buttons are ghost buttons; lightbox still zooms cards; primary starter cell reads elevated. `/toolkit/speaking`: find-a-meeting button unchanged in look but ≥44px tall with its `mb-8` gap intact; brief links are outline buttons.

```powershell
git add src/components/ToolkitOutreach.astro src/components/ToolkitSpeaking.astro
git commit -m "feat(toolkit): outreach/speaking controls to daisy btn vocabulary, surface tokens"
```

---

### Task 11: Install @tailwindcss/typography (own task — 30-day age gate)

**Files:**
- Modify: `package.json` (devDependency)
- Modify: `src/styles/global.css` (one `@plugin` line)

- [ ] **Step 1: Capture the "before" rendering of every blog post** (PowerShell 5.1; explicit session-independent work dir under `C:/tmp` — inside the writable roots, no environment variables to remember to export)

```powershell
npm run build
# Clear-then-recreate so a rerun can never retain stale rendered posts
if (Test-Path 'C:/tmp/daisyui-blog-diff/blog-before') { Remove-Item -Recurse -Force 'C:/tmp/daisyui-blog-diff/blog-before' }
New-Item -ItemType Directory -Force 'C:/tmp/daisyui-blog-diff/blog-before'
Copy-Item -Recurse -Force dist/blog/* 'C:/tmp/daisyui-blog-diff/blog-before/'
```

This must happen BEFORE the plugin lands: the post body already carries `prose prose-invert`, so installing the plugin immediately changes rendering. Task 12 Step 5's diff script reads the same `C:/tmp/daisyui-blog-diff/` paths, hard-coded.

- [ ] **Step 2: Install the plugin — exact pin, age-gate compliant**

`@tailwindcss/typography@0.5.20` was published 2026-06-08 (82 days before this plan's date), clearing the machine-wide 30-day minimum-release-age gate. Pin it exactly:

```bash
npm install -D -E @tailwindcss/typography@0.5.20
```

- [ ] **Step 3: Load it in Tailwind 4 CSS-first config**

In `src/styles/global.css`, directly after `@import "tailwindcss";` (before the daisyui `@plugin`), add:

```css
@plugin "@tailwindcss/typography";
```

(Verified against the plugin's v4 docs: `@plugin "@tailwindcss/typography";` is the CSS-first integration; theming uses the `--tw-prose-*` variables.)

- [ ] **Step 4: Confirm blast radius**

Run: `grep -rn "prose" src --include="*.astro" --include="*.ts"` — expected matches: `src/pages/blog/[...slug].astro` (the real consumer) plus `src/lib/event-schema.ts:379`, where the word "prose" appears in a comment (a known non-class hit — ignore it). If any OTHER file uses `prose` classes, stop and list them before proceeding.

- [ ] **Step 5: Verify + commit**

`npm run build` — exit 0. (Posts now render with typography defaults layered under the old pile; Task 12 reconciles.)

```bash
git add package.json package-lock.json src/styles/global.css
git commit -m "feat(blog): install @tailwindcss/typography 0.5.20 (age-gate compliant) via @plugin"
```

---

### Task 12: Blog post page — typography prose + related cards

**Files:**
- Modify: `src/pages/blog/[...slug].astro`

- [ ] **Step 1: Swap the prose class pile for themed typography**

Replace the entire `class` of the prose wrapper (lines 121–134) with:

```html
      <div class="prose prose-invert md:prose-lg max-w-none">
```

(`md:prose-lg` reproduces the current 16 px → 18 px responsive body scale.)

- [ ] **Step 2: Theme + residual overrides in the `is:global` style block**

Replace the current `is:global` block's contents with the following. DELETED (typography now covers them): responsive font-size rules, list markers, the table styling pile (except mobile scroll). KEPT: everything typography cannot express.

```css
  /* Typography plugin theme — deflock palette via the plugin's CSS variables. */
  .blog-post .prose {
    --tw-prose-invert-body: #b0b0b0;
    --tw-prose-invert-headings: #e8e8e8;
    --tw-prose-invert-lead: #a0a0a0;
    --tw-prose-invert-links: #fbbf24;
    --tw-prose-invert-bold: #e8e8e8;
    --tw-prose-invert-counters: #737373;
    --tw-prose-invert-bullets: #737373;
    --tw-prose-invert-hr: rgba(255, 255, 255, 0.07);
    --tw-prose-invert-quotes: #868686;
    --tw-prose-invert-quote-borders: rgba(255, 255, 255, 0.15);
    --tw-prose-invert-captions: #737373;
    --tw-prose-invert-code: #e8e8e8;
    --tw-prose-invert-pre-code: #d4d4d4;
    --tw-prose-invert-pre-bg: #0d0d0d;
    --tw-prose-invert-th-borders: rgba(255, 255, 255, 0.12);
    --tw-prose-invert-td-borders: rgba(255, 255, 255, 0.06);
  }

  /* Typography emits quote glyphs and code backticks the house style doesn't use. */
  .blog-post .prose code::before,
  .blog-post .prose code::after { content: none; }
  .blog-post .prose blockquote p:first-of-type::before,
  .blog-post .prose blockquote p:last-of-type::after { content: none; }

  /* Inline-code chip (typography colors code but doesn't chip it). */
  .blog-post .prose :not(pre) > code {
    background: rgba(255, 255, 255, 0.07);
    padding: 0.125rem 0.375rem;
    font-weight: 400;
  }

  /* Link hover/focus — typography sets only the resting color. */
  .blog-post .prose a:hover,
  .blog-post .prose a:focus-visible { color: #fcd34d; }

  /* Scroll offset so headings land below the fixed nav. */
  .blog-post .prose h2[id],
  .blog-post .prose h3[id] { scroll-margin-top: 5rem; }

  /* Mobile table overflow (typography handles the borders/colors). */
  @media (max-width: 640px) {
    .blog-post .prose :not(.not-prose) > table {
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }

  /* External link indicator — href starting with http (not internal /). */
  .blog-post .prose a[href^="http"]::after {
    content: "\2009\2197";
    font-size: 0.75em;
    vertical-align: super;
    opacity: 0.5;
    text-decoration: none;
    display: inline-block;
  }

  /* Pull quote system — prominent quote + smaller attribution. */
  .blog-post .prose blockquote .quote {
    font-size: 1.25em;
    line-height: 1.5;
    font-weight: 600;
    color: #e8e8e8;
  }
  .blog-post .prose blockquote .attribution {
    font-size: 14px;
    font-style: normal;
    color: #737373;
  }

  /* Red bold for damning emphasis points. */
  .blog-post .prose strong.red { color: #dc2626; }

  /* TOC active state — prevent hover from overriding red. */
  .toc-link.toc-active {
    color: #dc2626 !important;
    border-color: #dc2626 !important;
  }
```

- [ ] **Step 3: Related-post cards → daisy `card`**

Replace the related-post `<article>` class (line 175) with:

```html
            <article class="card bg-base-200 border border-white/10 overflow-hidden group-hover:border-white/20 group-hover:-translate-y-0.5 transition-all duration-200 h-full">
```

and its inner `<div class="p-4">` → `<div class="card-body p-4 gap-1">`. Image `bg-[#0a0a0a]` → `bg-base-300`.

- [ ] **Step 4: Token swaps elsewhere in the file**

`bg-[#0a0a0a]` (hero fallback + hero img letterbox) → `bg-base-300`; the `text-[#1a1a1a]` ghost-title fill stays (ghost typography, keep bespoke).

- [ ] **Step 5: Before/after rendered-post diff** (PowerShell 5.1; paths hard-coded to Task 11 Step 1's work dir `C:/tmp/daisyui-blog-diff` — no env vars)

```powershell
npm run build
# Clear-then-recreate so a rerun can never retain stale rendered posts
if (Test-Path 'C:/tmp/daisyui-blog-diff/blog-after') { Remove-Item -Recurse -Force 'C:/tmp/daisyui-blog-diff/blog-after' }
New-Item -ItemType Directory -Force 'C:/tmp/daisyui-blog-diff/blog-after'
Copy-Item -Recurse -Force dist/blog/* 'C:/tmp/daisyui-blog-diff/blog-after/'
@'
const fs=require('fs'),path=require('path');
const strip=f=>fs.readFileSync(f,'utf8')
  .replace(/<script[\s\S]*?<\/script>/g,'')
  .replace(/<style[\s\S]*?<\/style>/g,'')
  .replace(/<[^>]+>/g,' ')
  .replace(/\s+/g,' ').trim();
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>
  e.isDirectory()?walk(path.join(d,e.name)):e.name==='index.html'?[path.join(d,e.name)]:[]);
const A='C:/tmp/daisyui-blog-diff/blog-before';
const B='C:/tmp/daisyui-blog-diff/blog-after';
let bad=0;
for(const f of walk(A)){
  const rel=path.relative(A,f), g=path.join(B,rel);
  if(!fs.existsSync(g)){console.log('MISSING',rel);bad++;continue}
  if(strip(f)!==strip(g)){console.log('TEXT DIFF',rel);bad++}else console.log('ok',rel);
}
process.exit(bad?1:0);
'@ | Set-Content -Encoding utf8 'C:/tmp/daisyui-blog-diff/diff-text.js'
node 'C:/tmp/daisyui-blog-diff/diff-text.js'
```

(The script is written to a file via a single-quoted here-string — PowerShell leaves the JS untouched — then run with `node <file>`; `node -e` with a multiline body is not PowerShell-safe.)

Expected: every post prints `ok` (identical text content; only markup/classes changed). Any `TEXT DIFF` is a regression — investigate before proceeding.

- [ ] **Step 6: Visual checklist in the dev preview**

Open the longest published post and one with tables/code. Confirm: h2/h3 white with tight tracking; body `#b0b0b0` at 16 px mobile / 18 px desktop; links amber with amber-light hover and `↗` on external; blockquotes left-bordered italic (no injected curly quotes); ul/ol markers muted; inline code chipped with NO backticks; pre blocks `#0d0d0d`; tables bordered and horizontally scrollable at 375 px; hr hairline; reading-progress bar and TOC scrollspy (red active state) still work; related cards render as base-200 cards.

- [ ] **Step 7: Commit**

```bash
git add "src/pages/blog/[...slug].astro"
git commit -m "feat(blog): posts on themed @tailwindcss/typography, drop hand-rolled prose pile"
```

---

### Task 13: Blog index — filter chips + cards

**Files:**
- Modify: `src/pages/blog/index.astro`

- [ ] **Step 1: Tag bar → daisy radio-btn filter group**

Replace the tag bar block (lines 23–43) with:

```html
      {allTags.length > 0 && (
        <div class="flex flex-wrap items-center gap-2 mb-10" id="tag-bar" role="radiogroup" aria-label="Filter posts by tag">
          <input type="radio" name="blog-tag" value="all" aria-label="All" checked class="filter-chip tag-filter btn btn-sm min-h-11" />
          {allTags.map((tag) => (
            <input type="radio" name="blog-tag" value={tag} aria-label={tag} class="filter-chip tag-filter btn btn-sm min-h-11" />
          ))}
        </div>
      )}
```

(The `/` separators go; chips are self-delimited buttons per the mockup. `:checked` carries the active state — Task 2's `.filter-chip` rule paints it primary. `min-h-11` keeps the chips at the 44px touch-target floor — bare `btn btn-sm` is 32px — matching the FOIA type chips in Task 9, house rule #6.)

- [ ] **Step 2: Rework the filter JS for radios**

Replace the `<script>` contents with:

```ts
  const pills = document.querySelectorAll<HTMLInputElement>('.tag-filter');
  const cards = document.querySelectorAll<HTMLElement>('.blog-card');

  function filterByTag(tag: string) {
    window.location.hash = tag === 'all' ? '' : tag;

    pills.forEach((p) => {
      p.checked = p.value === tag;
    });

    cards.forEach((card) => {
      const cardTags = (card.dataset.tags ?? '').split(',').filter(Boolean);
      const show = tag === 'all' || cardTags.includes(tag);
      card.classList.toggle('hidden-by-filter', !show);
    });

    const anyVisible = Array.from(cards).some((c) => !c.classList.contains('hidden-by-filter'));
    const noResults = document.getElementById('no-results');
    if (noResults) noResults.classList.toggle('hidden', anyVisible);
  }

  pills.forEach((pill) => {
    pill.addEventListener('change', () => {
      if (pill.checked) filterByTag(pill.value);
    });
  });

  const hashTag = decodeURIComponent(window.location.hash.slice(1));
  if (hashTag) filterByTag(hashTag);

  window.addEventListener('hashchange', () => {
    filterByTag(decodeURIComponent(window.location.hash.slice(1)) || 'all');
  });
```

Then delete the `.tag-filter` rules from the scoped `<style>` block (keep `.blog-card.hidden-by-filter`).

- [ ] **Step 3: Featured + grid cards → daisy `card`**

Featured `<article>` (line 52):

```html
          <article class="card bg-base-100 border border-white/10 overflow-hidden group-hover:border-white/20 transition-all duration-200">
```

its content `<div class="p-7 md:p-8">` → `<div class="card-body p-7 md:p-8 gap-0">`.

Grid `<article>` (line 95):

```html
              <article class="card bg-base-100 border border-white/10 overflow-hidden group-hover:border-white/20 transition-all duration-200 group-hover:-translate-y-0.5 h-full">
```

its `<div class="p-5">` → `<div class="card-body p-5 gap-0">`. Both images: `bg-[#0a0a0a]` → `bg-base-300`. (`rounded-xl` drops — card radius is now the theme's `--radius-box`.)

- [ ] **Step 4: Verify + commit**

`npm run build`. Preview `/blog`: chips render as buttons with "All" active (red); clicking a tag filters cards, updates the hash, survives reload-with-hash and back/forward; cards look unchanged apart from the slightly tighter radius; card inner spacing matches before (card-body gap zeroed).

```bash
git add src/pages/blog/index.astro
git commit -m "feat(blog): index tag filter as daisy radio-btn chips, cards on card vocabulary"
```

---

### Task 14: Action modal (ISOLATED — full mandatory smoke test)

**Files:**
- Modify: `src/components/ActionModal.astro`
- Modify: `src/scripts/action-modal/results-renderer.ts`

**Untouched by design:** `modal-controller.ts`, `group-builder.ts`, `manual-dropdowns.ts`, `index.ts`, `district-matcher` — district-matching and open/close/focus-trap logic is out of bounds. The modal stays a div-based dialog (see design §5.4). Class-parity rule applies to every string in `results-renderer.ts`: complete literals only, safe DOM construction only.

- [ ] **Step 1: ActionModal.astro — shell tokens**

- Backdrop (line 22): `bg-[#171717]` → `bg-base-100` (keep the md: overlay classes).
- Card (line 25): `md:bg-[#0d0d0d] md:border md:border-[rgba(255,255,255,0.1)]` → `md:bg-base-300 md:border md:border-white/10 md:rounded-box`; keep the `style="border-top: 2px solid #dc2626;"`.
- Close button (lines 27–31): class →

```
fixed top-4 right-4 z-10 btn btn-ghost btn-square min-h-11 min-w-11 text-[#a3a3a3] hover:text-white md:absolute md:top-3 md:right-3
```

(keep id, `aria-label`, SVG; `min-h-11 min-w-11` — the current bespoke button and a bare `btn-square` are both 40×40, under the 44px floor).

- [ ] **Step 2: Input state controls**

- Geo button (lines 53–58): class → `btn btn-primary btn-lg w-full max-w-xs min-h-14`.
- Address input (line 82): class → `input flex-1 text-base min-h-12` (theme paints bg/border/placeholder/focus).
- Address submit (line 86): class → `btn btn-neutral min-h-11 whitespace-nowrap` (keep the stacked-mobile `flex-col sm:flex-row` wrapper — no `join`, the responsive stack stays).
- All six manual `<select>`s (lines 105, 111, 119, 128, 136, 142): class → `select select-sm min-h-11 w-full` (`select-sm` alone is 32px — under the 44px floor; `min-h-11` keeps the compact type scale at a tappable height).
- Manual submit (lines 150–156): class → `btn btn-primary w-full min-h-11`.

- [ ] **Step 3: Manual section → daisy `collapse`**

Replace line 97:

```html
        <details id="action-manual-details" class="collapse collapse-arrow bg-base-100 border border-white/10 w-full">
```

Summary (line 98): class → `collapse-title text-[#a3a3a3] text-sm font-medium min-h-11`.
Inner `<div class="mt-4 space-y-3">` → `<div class="collapse-content space-y-3">`.
Delete the entire `<style>` block (lines 204–222) — the iOS summary-marker hack is obsolete under `collapse`.

- [ ] **Step 4: Loading + error states**

Loading (line 166): replace the spinner div with:

```html
        <span class="loading loading-spinner loading-lg text-primary" aria-hidden="true"></span>
```

Error (lines 186–197): keep the outer `#action-error` wrapper + `#action-retry` button; the message becomes a real alert:

```html
    <div id="action-error" class="hidden">
      <div class="flex flex-col items-center justify-center py-8 gap-4">
        <div class="alert alert-error" role="alert">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6 shrink-0 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span id="action-error-msg"></span>
        </div>
        <button id="action-retry" type="button" class="btn btn-neutral btn-sm min-h-11">Start Over</button>
      </div>
    </div>
```

(`showError` sets `#action-error-msg` textContent — unchanged contract.)

- [ ] **Step 5: results-renderer.ts — camera stats → daisy `stats` (safe DOM, removes an existing innerHTML use)**

Replace the stat-line construction (lines 75–95, everything from `const statDiv` through `container.appendChild(statDiv)` — the `animateCount` loop at lines 97–100 stays) with:

```ts
      const statDiv = document.createElement('div');
      statDiv.className = 'stats stats-vertical sm:stats-horizontal w-full bg-base-100 border border-white/10 mb-6';

      function buildStat(count: number, title: string): HTMLElement {
        const stat = document.createElement('div');
        stat.className = 'stat py-3';
        const value = document.createElement('div');
        value.className = 'stat-value text-primary text-3xl';
        value.setAttribute('data-count', String(count));
        value.textContent = '0';
        const label = document.createElement('div');
        label.className = 'stat-title label-mono-compact whitespace-normal';
        label.textContent = title;
        stat.append(value, label);
        return stat;
      }

      if (cityCount > 0) {
        const cityName = cityKey!.split(':')[1];
        statDiv.appendChild(buildStat(cityCount, 'Cameras \u00b7 City of ' + titleCase(cityName)));
      }
      if (countyCount > 0) {
        const countyName = countyKey!.split(':')[1];
        statDiv.appendChild(buildStat(countyCount, 'Cameras \u00b7 ' + titleCase(countyName) + ' County'));
      }

      container.appendChild(statDiv);
```

(`animateCount` over `[data-count]` below is unchanged.)

- [ ] **Step 6: results-renderer.ts — rep rows, badges, buttons, textarea**

Exact class-string replacements (all complete literals):

| Line | Old | New |
|---|---|---|
| 109 | `'mt-8 pt-8 border-t border-[#404040]'` | `'mt-8 pt-8 border-t border-white/15'` |
| 138 (repDiv) | `'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2'` | `'card bg-base-200 border border-white/10 p-4 flex-col sm:flex-row sm:items-center sm:justify-between gap-2'` |
| 183 ("Your district" badge) | `'text-[#a3a3a3] text-xs font-medium block'` | `'badge badge-warning badge-sm mt-1 w-fit'` |
| 205 (Send Email) | `'bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium rounded px-4 py-2 text-sm min-h-[44px] transition-colors cursor-pointer inline-flex items-center'` | `'btn btn-primary btn-sm min-h-11'` |
| 235 (group btn row) | `'flex gap-2 mt-4 pt-4 border-t border-[#404040]'` | `'flex gap-2 mt-4 pt-4 border-t border-white/15'` |
| 249 (Email All) | same red pile as 205 | `'btn btn-primary btn-sm min-h-11'` |
| 258 (Copy Letter) | `'bg-[#404040] hover:bg-[#475569] text-[#e2e8f0] font-medium rounded px-4 py-2 text-sm min-h-[44px] transition-colors cursor-pointer'` | `'btn btn-outline btn-sm min-h-11'` |
| 287 (textarea) | `'bg-[#171717] border border-[#404040] text-[#d4d4d4] rounded p-4 w-full text-sm min-h-[200px] focus:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4] transition-colors resize-y'` | `'textarea w-full text-sm min-h-[200px] resize-y'` |
| 367 (wrong-district select) | `'bg-[#262626] border border-[#404040] text-white rounded px-3 py-1 text-sm focus:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4]'` | `'select select-sm min-h-11 w-fit'` (44px floor, same as the manual selects) |

Leave untouched: header/label idiom, party-color spans (`text-red-400`/`text-blue-400` — reinforcing signal beside the letter), phone links, `wrongLink`, summary link styling, all `data-action`/`data-group`/`data-rep` attributes, and every function below `renderResults`.

- [ ] **Step 7: results-renderer.ts — Copy Letter feedback → toast**

Add at the top:

```ts
import { showToast } from '../toast.js';
```

Replace the body of `copyToClipboard` (lines 14–32) with:

```ts
async function copyToClipboard(text: string): Promise<void> {
  if (typeof umami !== 'undefined') umami.track('letter-copied');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  showToast('Letter copied to clipboard');
}
```

and update the call site (line 352): `copyToClipboard(copyText, target);` → `copyToClipboard(copyText);`.

- [ ] **Step 8: Build**

Run: `npm run build` — exit 0. Run: `npm test` — existing vitest suite passes.

- [ ] **Step 9: FULL MANDATORY SMOKE TEST (per `.github/pull_request_template.md`)**

Dev preview, desktop (1280 px), console open:
1. Click Take Action → modal opens, focus lands in the address input, no console errors.
2. **Geolocation success path** (the geo button is migrated in this task, so its happy path is part of the smoke): click "Find My Reps" (the geo button) and grant browser location permission — or use devtools sensor override to set an SC coordinate (e.g. Greenville, 34.8526 / −82.3940) — → loading spinner → results render with the same assertions as step 4. If the environment genuinely cannot grant permission, note that in the PR checklist; the address path is not a substitute when permission is available.
3. **Reset to the input state**: click Reset ("Look up a different address") — or close and reopen the modal — so the address input is visible again. (Step 2 ends in the RESULTS state; step 4 needs the input state.)
4. Enter `1234 Main St, Greenville, SC 29601` → submit → loading spinner → results render: stats block counts up in red, state reps + council cards (base-200 cards, red Send Email, outline Copy Letter, amber "Your district" badge).
5. **Modal is at the top — NOT scroll-jumped to the results.**
6. Preview & edit letter opens; Copy Letter → toast appears ABOVE the modal, letter in clipboard.
7. "Wrong district?" → select swaps the matched member; re-render clean.
8. Reset ("Look up a different address") → input state; "I already know my district" collapse opens with arrow, dropdowns cascade (county → district, city → city district), manual submit renders results.
9. Error path: submit `zzzz` → red alert-error with icon; Start Over returns to input.
10. Esc closes; focus returns to the Take Action button; backdrop click closes.
11. **Mobile (375 px):** repeat steps 1 and 4–6 and 8 — full-screen modal, close button reachable, no horizontal overflow, no console errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/ActionModal.astro src/scripts/action-modal/results-renderer.ts
git commit -m "feat(action-modal): daisy rendering layer (btn/input/select/collapse/loading/alert/stats/card/badge/toast) — logic untouched, smoke test passed"
```

---

### Task 15: Final sweep

**Files:** none new — verification + stragglers only.

- [ ] **Step 1: Stray near-black audit**

```bash
grep -rn "#111111\|#141414\|#161616\|#0a0a0a" src --include="*.astro" --include="*.ts" --include="*.css"
```

Expected remaining hits ONLY in: homepage section components (Hero, HowItWorks, HowItWorksOverlays, MapSection, BillTracker, BlogPreview, CitizenToolkit, FAQ, TakeAction), the events subsystem, `CouncilBrief.astro`, and `og-image.ts`. (Blog markdown never appears here — the include filters cover only `.astro`/`.ts`/`.css`.) Fix any hit in a migrated file (map per design §4).

- [ ] **Step 2: Sidebar-pattern audit**

```bash
grep -rn "sidebar-btn\|sidebar-active" src
```

Expected: `src/styles/global.css` (kept, with the FAQ-only comment) and `src/components/FAQ.astro` only.

- [ ] **Step 3: Full verification** (PowerShell 5.1 — no `&&`; run as separate commands)

```powershell
npm run build
npm test
```

Both exit 0. Spot-check in the preview: one page per area (/, /blog, a post, /toolkit, /toolkit/foia, /events, /404-x) at desktop + 375 px; consoles clean.

- [ ] **Step 4: Commit any straggler fixes** (worktree safety: NEVER `git add -A`/`git add .` here — the worktree carries unrelated untracked files, e.g. `scripts/setup-deploy-env.mjs`, which must not ride along)

```powershell
git add -u
git commit -m "chore(ui): final token/pattern sweep for daisy migration"
```

`git add -u` stages only modifications to already-tracked files — exactly what a straggler sweep produces. In the unlikely event the sweep created a NEW file, add it by explicit path alongside `-u`; before committing, `git status --short` must show no staged `??`-origin files you didn't name.

- [ ] **Step 5: PR prep note**

Open the PR with the action-modal smoke-test checklist filled in (the PR template requires it — Task 14 touched `action-modal/`). Rewrite `MANIFEST.md` before merge per the repo's manifest rule.

---

## Self-review notes (spec coverage)

- Every inventory area has a task: chrome (3, 4), 404 (5), copy-toast (2, 6, 14§7), toolkit breadcrumbs/hub/siblings (7), rails (8), FOIA finder (9), outreach/speaking (10), typography (11), blog post (12), blog index (13), action modal (14). Foundation: docs-scan exclusion (0 — must land first or the build breaks), tokens/radius (1), shared primitives (2). Sweep (15).
- Keep-bespoke list honored: no task touches hero, maps, SVG scenes, the US map (Task 8 explicitly preserves the map logic in `toolkit-legal.ts`), 1px-gap grids, ghost typography, CouncilBrief, `[data-reveal]`, autocomplete/Cally skins.
- Class-parity + safe-DOM notes present in every task touching runtime TS renderers (2, 9, 14).
- The events subsystem is only affected by the approved theme-token settle (Task 1), never edited.
- Task 0's root cause corrected per adversarial review (CSS-escape decode of a backslash-plus-hex embedded path, not daisyUI class strings). Task 0 is fully deterministic: PowerShell 5.1 commands with explicit paths copy ALL THREE artifacts (design, plan, mockup) into the repo and commit them with the `@source not` exclusion as the branch's first commit. The scratchpad path appears in these docs in forward-slash form only — inert to the scanner, whose payload requires a backslash before hex digits.
- Before-states re-grounded against current origin/master (commit `0825475`): the only drift found was `ToolkitSpeaking.astro` — commit `47aadfa` already converted the find-a-meeting link to `btn btn-sm btn-outline mb-8`; Task 10 now reflects that and preserves `mb-8`. Every other cited file/line/class list was verified unchanged.
- Touch-target floor (house rule #6) is stated once in the ground rules and applied per control: Nav desktop CTA + mobile menu links/summary `min-h-11`, hamburger + modal close `min-h-11 min-w-11`, Nav mobile Take Action `min-h-12`, 404 buttons `min-h-11`, toolkit copy/share/download buttons `min-h-11`, sibling chips + brief links + find-a-meeting `min-h-11`, FOIA search input `min-h-12`, blog tag chips + FOIA type chips `min-h-11`, alert Try again/Clear `btn-sm min-h-11` (no `btn-xs` exception), all seven modal selects (six manual + wrong-district) `select-sm min-h-11`, modal collapse-title `min-h-11`.
- Settled decisions this revision: footer keeps the explicit `grid md:grid-cols-3` layout (daisy `footer`/`footer-horizontal` rejected — child-grid styling + auto-flow columns are not equivalent); the three hard-coded 0.25rem widget radii (autocomplete + Cally) bind to `var(--radius-field)` in Task 1 (runtime-created elements inherit the theme custom property).
- Task 14's smoke test now includes the geolocation-success path; Task 1 verifies the two excluded events `btn-neutral` controls (submit-form Cancel, map back button) after the neutral shift; Task 15 stages with `git add -u` so unrelated untracked files (e.g. `scripts/setup-deploy-env.mjs`) can never ride along.
