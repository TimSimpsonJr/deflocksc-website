# Design: MapSection Reimagining + Citizen Toolkit Bento

**Date:** 2026-03-06
**Branch:** feature/ui-overhaul

---

## Overview

Two new components / sections to implement before the UI overhaul PR:

1. **MapSection** — Complete visual rework keeping the same factual copy
2. **CitizenToolkit** — New homepage section (after BillTracker) using a bento grid layout

---

## 1. MapSection Redesign

### Chosen direction: Option B — Cinematic

Ghost "242" behind the heading. Copy on the left, stat column on the right, map full-width below.

### Layout

```
┌────────────────────────────────────────────┐
│  [Ghost "242" — red, opacity 0.05]         │
│                                            │
│  Left (1fr)           │  Right (240px)     │
│  ─────────────────    │  ────────────────  │
│  DM Mono overline     │  Stat: 242         │
│  Heading (large)      │  Stat: 57          │
│  Dimmed sub-heading   │  Stat: 0 oversight │
│                       │  Stat: 0 pub votes │
│  Body copy (4 paras)  │                    │
│                       │                    │
├───────────────────────────────────────────┤
│  Map embed (full width, existing glow frame│
│  + MapLibre setup unchanged)              │
└────────────────────────────────────────────┘
```

### Stat column (right, 240px)

Four stats stacked vertically, each separated by a 1px rgba border:

| Stat | Value | Style |
|------|-------|-------|
| Total cameras documented | 242 | `font-size:32px`, `color:#dc2626` |
| Greenville PD | 57 | `font-size:32px`, `color:#dc2626` |
| Oversight ordinances | 0 | `font-size:24px`, `color:#555` |
| Public votes | 0 | `font-size:24px`, `color:#555` |

### Heading

```
Cameras are
already watching.
[dimmed] No rules attached.
```

- Main: `font-weight:900`, `clamp(2rem, 3.5vw, 3rem)`, `letter-spacing:-0.035em`
- Dimmed line: `color: rgba(232,232,232,0.2)`

### Body copy

Keep all existing paragraph copy verbatim (5 paragraphs). Reduce font size to `13px`, color `#888`, `line-height:1.75`. Bold proper nouns stay `color:#e8e8e8`.

### Ghost number

- Text: `"242"`
- Position: `absolute`, `top:-20px`, `right:-40px`
- Style: `font-size:clamp(12rem,22vw,22rem)`, `font-weight:900`, `color:rgba(220,38,38,0.05)`, `letter-spacing:-0.06em`
- `pointer-events:none`, `user-select:none`, `z-index:0`

### Section bg

`bg-[#0d0d0d]` (matches TakeAction, BillTracker modal)

### Map embed

Unchanged — existing `glow-frame` + MapLibre setup stays as-is. The outer section container wraps it.

### Mobile

Stack: full-width copy, then stat column becomes a 2×2 grid of stat cells (horizontal layout), then map. Mobile map toggle button remains.

---

## 2. Citizen Toolkit Section (New Component)

### Component name: `CitizenToolkit.astro`

### Placement in `index.astro`

```
<BillTracker />
<CitizenToolkit />   ← new
<FAQ />
```

### Chosen direction: Option A — Feature+3

1px-gap bento grid. FOIA spans 2 columns (hero cell), Speak Up fills the right column on row 1. Spread the Word + Know Your Rights fill row 2 (1-col + 2-col).

### Grid layout

```
Section header (full width, outside the gap grid)
┌──────────────────────────────┬──────────────┐
│  REQUEST RECORDS (col-span-2)│  SPEAK UP    │  ← row 1
├──────────────┬───────────────┴──────────────┤
│  SPREAD THE  │  KNOW YOUR RIGHTS (col-span-2)│  ← row 2
│  WORD        │                              │
└──────────────┴──────────────────────────────┘
```

Grid: `grid-template-columns: repeat(3, 1fr)` on md+. Mobile: single column stack.

### Section header (outside bento grid)

```
[DM Mono overline: CITIZEN TOOLKIT]
[h2: "Take action beyond the call."]
```

- Section bg: `bg-[#161616]`
- Header padding: `px-6 md:px-10 pt-14 pb-8`
- h2: `font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em]`

### Bento grid wrapper

```html
<div class="bg-[rgba(255,255,255,0.07)]" style="display:grid; grid-template-columns:repeat(3,1fr); gap:1px;">
```

### Cell spec (all four)

Each cell:
- `bg-[#161616]` (matches section bg)
- `padding: 28px`
- `border-top: 2px solid #dc2626` (inline style, same pattern as modals)
- `position: relative` (for ghost number)

Contents per cell:
1. DM Mono overline (`#555`, `9px`, `tracking-[0.2em]`)
2. Heading (`font-bold`, `18px`, `tracking-[-0.02em]`)
3. Description (`12px`, `color:#888`, `line-height:1.6`)
4. Meta tags — small bordered chips (optional per cell)
5. Link: `font-family:DM Mono`, `9px`, `uppercase`, `color:#dc2626`, arrow
6. Ghost number: `position:absolute`, `bottom:16px`, `right:20px`, `font-size:56px`, `font-weight:900`, `color:rgba(220,38,38,0.15)`, `pointer-events:none`

### Cell content

**REQUEST RECORDS** (col-span-2, ghost: `01`)
- Overline: `Request Records`
- Heading: `Four FOIA templates. Ready to file.`
- Bullet list (4 items): Camera location data · Data retention policy · Federal data sharing · Flock contract
- Meta chips: `4 PDF templates` · `Copy & send` · `SC FOIA § 30-4-10`
- Link: `Go to FOIA templates →` → `/toolkit#request-records`
- Ghost: `01`

**SPEAK UP** (col-span-1, ghost: `02`)
- Overline: `Speak Up`
- Heading: `Show up to council. Say exactly this.`
- Desc: Full talk track for public comment. Rebuttals for common pushback. Council handout PDF to leave behind.
- Meta chips: `Talk track` · `Rebuttals` · `Handout PDF`
- Link: `Prep your remarks →` → `/toolkit#speak-up`
- Ghost: `02`

**SPREAD THE WORD** (col-span-1, ghost: `03`)
- Overline: `Spread the Word`
- Heading: `Cards, one-pager, conversation starters.`
- Desc: Four business card designs. Print on Avery 8371. Leave at coffee shops, hand out at events.
- Meta chips: `4 card designs` · `One-pager` · `Print-ready PDFs`
- Link: `Get the materials →` → `/toolkit#spread-the-word`
- Ghost: `03`

**KNOW YOUR RIGHTS** (col-span-2, ghost: `04`)
- Overline: `Know Your Rights`
- Heading: `The 4th Amendment. What SC is missing. What other states did.`
- Desc: Six states have passed ALPR limits. South Carolina has none. Here's the legal landscape, what the pending bills don't cover, and what you need to know before you speak.
- Meta chips: `4th Amendment primer` · `State comparison` · `Bill gap analysis`
- Link: `Understand the law →` → `/toolkit#know-your-rights`
- Ghost: `04`

### Mobile behavior

Single column. Each cell stacks full width. Ghost numbers visible. Red top border on each.

---

## 3. MapSection — Sections NOT changing

- The actual MapLibre map initialization (`camera-map.ts`)
- Glow frame CSS (global.css)
- Map toggle button logic
- All existing copy text (verbatim)
- Map attribution footer

---

## 4. Sections still needing audit before PR

- **Footer**: Minor cleanup only — update `border-[#262626]` to `border-[rgba(255,255,255,0.07)]` for consistency. No structural changes.
- **toolkit.astro** page header: Still has old `section-glow` div reference — remove that dead div.
