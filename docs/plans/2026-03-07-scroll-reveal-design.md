# Scroll Reveal Animation Design

## Overview

Add subtle entrance animations to headlines and major elements across the site, triggered by scroll (IntersectionObserver) or on page load for above-the-fold content.

## Approach

Data-attribute driven system. Zero dependencies, ~40 lines of CSS + JS.

## Attributes

- `data-reveal="up|down|left|right"` — entry direction
- `data-reveal-delay="0|1|2|3|4"` — stagger tier (0ms, 80ms, 160ms, 240ms, 320ms)

## Animation Parameters

- Translate distance: 24px
- Duration: 0.65s
- Easing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (smooth deceleration)
- Stagger step: 80ms per delay tier
- Trigger: IntersectionObserver, threshold 0.15
- One-shot: elements animate in once, don't re-hide on scroll out

## Implementation

**CSS** (`global.css`): Define `[data-reveal]` initial states (opacity 0 + directional transform), `.revealed` final state (opacity 1, transform none). Wrap in `@media (prefers-reduced-motion: no-preference)`.

**JS** (`Base.astro`): Single IntersectionObserver watches all `[data-reveal]` elements, adds `.revealed` class on intersection, then unobserves.

## Per-Section Direction Plan

| Section | Element | Direction | Delay |
|---|---|---|---|
| **Hero** | Mono label | `up` | 0 |
| | Headline (h1) | `up` | 1 |
| | Subtext | `up` | 2 |
| | CTA button | `up` | 3 |
| **HowItWorks** | Mono label | `left` | 0 |
| | Heading | `left` | 1 |
| | Subtext | `left` | 2 |
| | Carousel/cards | `up` | 0 |
| **MapSection** | Mono label | `right` | 0 |
| | Heading | `right` | 1 |
| | Map frame | `up` | 0 |
| **BillTracker** | Mono label | `left` | 0 |
| | Heading | `left` | 1 |
| | Bill cards | `up` | 0, 1, 2 |
| **FAQ** | Mono label | `up` | 0 |
| | Heading | `up` | 1 |
| | Sidebar items | `left` | stagger |
| | Panel content | `right` | 0 |
| **TakeAction** | Mono label | `right` | 0 |
| | Heading lines | `right` | 0, 1, 2 |
| | CTA button | `up` | 3 |

Pattern: text clusters share a direction (alternating left/right between sections), standalone visual blocks (map, cards, carousel) rise from below.

## Accessibility

All animations gated behind `@media (prefers-reduced-motion: no-preference)`. With reduced motion preference, elements render immediately — no opacity 0 initial state.
