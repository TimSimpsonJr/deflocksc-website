# Case Studies Cards — Design Doc (v2)

**Date:** 2026-03-06
**Branch:** feature/ui-overhaul
**Replaces:** HowItWorks carousel (5 sliding cards)

---

## Overview

Replace the carousel in `HowItWorks.astro` with a 3+2 bento grid of case study cards using the V1 split layout. Each card has a 2.5D visual panel (top ~55%) with layered elements that create depth via CSS transition parallax on hover. Text body below.

Card 5 (Austin) is deferred — placeholder card in the grid until reconceptualized after the section is on the homepage.

---

## Layout

**Desktop:** 3-column top row + 2-column bottom row via `grid-template-columns: repeat(6, 1fr)` with top cards spanning 2 cols and bottom cards spanning 3 cols. 1px gap, `background: rgba(255,255,255,0.07)`.
**Mobile:** single column stack.
**Variant:** V1 Split — scene panel top ~55%, padded text body below.

---

## Card styling

- Card bg: `#111111`, hover: `#1a1a1a`
- Panel bg: `#0d0d0d`
- Panel border: `1px solid rgba(255,255,255,0.06)`, hover: `rgba(220,38,38,0.22)`
- Red accent: `#dc2626`
- Font: DM Mono (monospace labels/values), Inter (body text)
- Location tag: DM Mono 9px, `#dc2626`
- Card number: DM Mono 8px, `rgba(255,255,255,0.14)`, top-right

---

## Animation contract

- CSS `transition` (not `@keyframes`) for all effects except Card 2's line draw
- **Trigger:** `.card:hover` parent selector drives child transitions
- **No loops** — animate to end state on hover, reverse on hover-off
- **2.5D parallax:** multiple absolutely-positioned layers shift by different `translate()` amounts on hover (far: small, near: large)
- **Stagger:** `transition-delay` increments (~100-130ms apart)
- **Duration:** 0.35–0.55s per element, `ease-out`

**Exception — Card 2 hover-off:** Lines fade via opacity instead of retracing. Uses different transition properties for hover vs hover-off states.

---

## Visual scenes

### Card 1 — Greenville, SC / False Arrest
**Concept:** False Match — Two license plates with OCR-confusable difference

Elements:
- Back plate (DATABASE ENTRY): `SC · GHP 4B92` — dim, z-index 1
- Front plate (ALPR SCAN): `SC · GHP 4892` — bright, z-index 2, drop shadow
- `≠` indicator between plates (fades in on hover)
- "FALSE MATCH · ARREST MADE" badge with red dot (bottom-right, fades in)

The B/8 single-character confusion is the OCR misread that causes the false arrest.

Animation (on hover):
- Back plate: `translate(-12px, -12px)`, opacity 0.42 → 0.62
- Front plate: `translate(10px, 10px)`, shadow grows
- `≠` indicator: `color: transparent` → `rgba(220,38,38,0.8)`, delay 0.24s
- Badge: `opacity: 0, scale(0.88)` → `opacity: 1, scale(1)`, delay 0.38s

### Card 2 — Ventura County, CA / Unauthorized Sharing
**Concept:** Zoom-out data web — CA outline expands to lower-48 with cascading arcing lines

Elements:
- SVG group containing all layers, starts `scale(2.5)` centered on CA
- California outline (prominent stroke)
- Lower-48 state outlines (very dim, fade in on hover)
- ~20-25 quadratic arc paths (`Q` curves) from CA to other states

Animation (3 phases on hover):
1. SVG group: `scale(2.5)` → `scale(1)` (zoom out), duration 0.6s
2. State outlines: `opacity: 0` → `opacity: 0.15`, delay 0.2s
3. Arc lines draw via `stroke-dashoffset`:
   - First 4-5 lines: delays 0.3s–0.5s (nearby/major states)
   - Next 15-20 lines: delays 0.5s–1.2s (dense spray, cascading)

**Asymmetric hover-off:**
- Zoom reverses normally (scales back to CA close-up)
- Lines FADE via `opacity: 0` transition (0.3s) instead of retracting
- Implementation: on hover-off, swap transition property from `stroke-dashoffset` to `opacity`
- This requires a JS class toggle or separate hover/non-hover transition declarations

### Card 3 — Santa Cruz, CA / Federal Searches
**Concept:** File stack with federal shield on top

Elements:
- Three offset document cards (bottom=far, top=near) with slight rotations
- Doc headers: "CASE FILE", "QUERY LOG", "AUTH. RECORD"
- Placeholder text lines (dim bars)
- Federal shield badge (SVG) — **highest z-index, floats above all docs**

No "ICE" anywhere — badge reads "FED. AUTHORITY".

Animation (on hover):
- Bottom doc: `rotate(3.5deg)` → `rotate(5deg) translate(-4px, 4px)`
- Mid doc: `rotate(1.5deg)` → `rotate(2.5deg) translate(-2px, 2px)`
- Top doc: lifts `translateY(-18px)`, shadow grows
- Shield badge: `opacity: 0, scale(0.72)` → `opacity: 1, scale(1)`, delay 0.3s, z-index above all docs

### Card 4 — Spartanburg, SC / Sheriff Convicted
**Concept:** Badge + conviction stamp

Elements:
- Far layer: personnel record lines (header, field bars, ROLE/ACCESS text)
- Mid layer: sheriff star badge (6-point polygon + circle + text)
- Near layer: "CONVICTED / FEDERAL CHARGE" stamp (red border, large text)

Animation (on hover):
- Record lines: drift `translate(-4px, 3px)` (far layer shift)
- Badge: shift `translate(3px, -3px)` (mid layer shift)
- Stamp: `opacity: 0, rotate(-25deg) scale(0.8)` → `opacity: 1, rotate(-12deg) scale(1)`, delay 0.15s, spring easing `cubic-bezier(0.34,1.56,0.64,1)`

### Card 5 — Austin, TX / No Crime Reduction (DEFERRED)
**Placeholder card.** Shows title, location, and blurb text in the card body. Scene panel displays a minimal static element (e.g. faint camera outline) or is left as empty `#0d0d0d`. No animation. Will be reconceptualized after the section is live on the homepage.

---

## Implementation target

- `src/components/HowItWorks.astro` — replace carousel with bento grid + 4 animated scenes + 1 placeholder
- `src/components/HowItWorksOverlays.astro` — overlays remain (triggered by card click)
- `src/scripts/carousel.ts` — delete (carousel no longer used)
- Carousel script import in `HowItWorks.astro` to be removed
- Card 2 needs a small JS snippet for the asymmetric hover-off (toggling a class to switch transition property)
