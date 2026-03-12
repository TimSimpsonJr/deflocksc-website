# Blog Preview Section — Homepage

**Date:** 2026-03-12
**Status:** Approved

## Purpose

Show recent blog posts on the homepage between the Bill Tracker and Citizen Toolkit sections. Gives visitors a reason to explore the blog without navigating away from the landing page.

## Component

New file: `src/components/BlogPreview.astro`

Inserted in `src/pages/index.astro` between `<BillTracker />` and `<CitizenToolkit />`.

## Data

- `getCollection('blog')`, filtered to non-draft, sorted by date descending, sliced to first 5
- `estimateReadTime` from `src/lib/blog-utils` for read time display

## Section Header

- DM Mono overline: "From the Blog"
- Bold heading: "Latest Posts"
- One-line subtitle
- "Read all posts" link to `/blog` (right-aligned on desktop, below subtitle on mobile)

## Card Design

Each card is a clickable `<a>` wrapping an `<article>`:

1. Featured image (if present), `object-contain` on `bg-[#0a0a0a]`
2. Date + read time (DM Mono, `#737373`)
3. Title (bold, `#e8e8e8`)
4. Summary (1-2 lines, `#a0a0a0`)
5. Tags row (DM Mono, `#737373`, slash-separated)

Card styling: `bg-[#111111]`, `rounded-xl`, `border border-[rgba(255,255,255,0.07)]`, hover border brightens to `rgba(255,255,255,0.12)`, hover lifts with `-translate-y-0.5`. Matches existing blog index grid cards.

## Responsive Grid

CSS-only (no JavaScript). Posts 4 and 5 hidden by default, revealed at wider breakpoints.

| Breakpoint | Columns | Posts shown |
|------------|---------|-------------|
| < 640px    | 1       | 3           |
| 640px+     | 2       | 3           |
| 900px+     | 3       | 3           |
| 1200px+    | 4       | 4           |
| 1500px+    | 5       | 5           |

Implementation: posts 4 and 5 get a `.blog-preview-extra` class. Hidden by default. `@media (min-width: 1200px)` reveals post 4, `@media (min-width: 1500px)` reveals post 5.

## Section Styling

- Standard section padding: `py-20 md:py-28`
- Wide container: `max-w-[1400px]` to accommodate 5 columns
- `px-6` horizontal padding
- `data-reveal` fade-in on scroll (matches existing sections)
- Grid gap: `gap-6` (matches blog index)

## No-Posts Fallback

If fewer than 3 published posts exist, skip the section entirely (don't render a half-empty grid).
