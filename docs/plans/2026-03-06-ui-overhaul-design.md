# UI Overhaul Design — DeflockSC

**Date:** 2026-03-06
**Branch:** feature/citizen-toolkit (to be continued or branched from master)
**Status:** Approved — ready for implementation

## Direction: Option B — Asymmetric Data

The overhaul keeps the dark theme, red accent, and all existing copy unchanged. It replaces the current component language — which shares too many patterns with nolaughingmatter.net — with a more distinctive visual system built around data density and asymmetric layouts.

Typography shifts from Inter to **Instrument Sans** (body/headings) + **DM Mono** (labels, codes, metadata). Both via Google Fonts.

---

## Kill List

Patterns being eliminated from every section:

- Centered section headings
- Contained dark panels (box-within-box)
- Red-colored data identifiers (bill IDs, numbers)
- ALL CAPS label + numbered card hierarchy
- Equal 3-column card grids
- Amber pill badges
- Standard +/− accordion
- Centered CTA with isolated button
- Background shade alternation between sections

---

## Component Patterns by Section

### Nav
- Blinking red status dot + `DEFLOCK/SC` wordmark (slash in red)
- Single `TAKE ACTION` button, right-aligned
- Thin bottom border rule

### Hero
- Full-viewport, dark radial gradient background
- Scanning glitch bars (CSS animation, two bars at different speeds)
- Two-column layout: left = headline + body + CTAs, right = data sidebar
- Headline: `clamp(3.2rem, 7vw, 6rem)`, weight 700, tight leading (0.95), key word in red italic
- Data sidebar: stacked items separated by thin rules — value large (2rem, weight 700), label in DM Mono 10px uppercase. Red values for alarming stats (242, 0), amber for bill status
- CTAs: solid red primary + ghost outline secondary

### How It Works (pipeline)
- Giant decorative section number (`18rem`, `rgba(255,255,255,0.025)`) positioned absolute top-right
- Small DM Mono overline category label
- Asymmetric grid: 1 large primary cell (spans 2 rows) + 2 smaller cells
- Grid separated by 1px lines (gap: 1px, background on grid = border color)
- Step label in DM Mono, ghost large number bottom-right of each cell
- No background color variation between cells (primary cell uses `#141414` vs `#111`)

### Bill Tracker
- Same giant bg number treatment as pipeline
- Horizontal 3-column grid separated by 1px lines (no box containers)
- Each column: large bill ID (2rem, weight 700), description body copy, status footer with amber dot + label + committee right-aligned
- Footer separated from body by thin rule

### FAQ
- Fixed-width question list sidebar (280px) + expanding answer panel
- Sidebar items in DM Mono, 14px, `#888` inactive → full text + `#161616` bg + red left border (2px) active
- Answer panel: large question restatement (1.4rem, weight 600) + body copy
- No +/− toggle, no accordion expand animation

### Take Action (CTA)
- Dark `#0d0d0d` background
- Ghost "ACT" text absolute positioned bottom-right: `16rem`, `rgba(220,38,38,0.07)`
- DM Mono overline label above headline
- Headline: `clamp(2.5rem, 5vw, 4.5rem)`, tight leading (0.95), dimmed middle line for contrast
- Button left-aligned + body context copy right of button

### Footer
- No changes to structure (already extracted, 2-col About + Resources)

---

## Typography System

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display headlines | Instrument Sans | 700 | clamp scale |
| Body copy | Instrument Sans | 400 | 14–16px |
| UI labels / metadata | DM Mono | 400–500 | 9–11px |
| Data values | Instrument Sans | 700 | 2–2.5rem |
| Bill IDs (hero sidebar) | Instrument Sans | 700 | 2rem |

Google Fonts import:
```
Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600
DM+Mono:ital,wght@0,300;0,400;0,500;1,300
```

---

## Color System (unchanged)

```css
--red:    #dc2626
--amber:  #fbbf24
--bg:     #111111
--bg2:    #161616
--bg3:    #0d0d0d
--border: rgba(255,255,255,0.07)
--text:   #e8e8e8
--muted:  #a0a0a0   /* lifted from #666 for WCAG AA compliance */
--dim:    #555555   /* lifted from #3a3a3a */
```

---

## Scope

**In scope:**
- Replace Inter with Instrument Sans + DM Mono in global CSS
- Rework Nav, Hero, HowItWorks, BillTracker, FAQ, TakeAction component styles
- No copy changes
- No structural/data changes (bills.json, district matching, map, modal internals unchanged)

**Out of scope:**
- ActionModal interior (complex widget, separate pass)
- MapSection map itself (MapLibre styles unchanged)
- Blog pages
- Hero image/animation (camera PNG + SVG light cones unchanged)
