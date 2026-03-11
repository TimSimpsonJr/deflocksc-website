# Blog Overhaul Design

Redesign the blog listing and individual post pages, add nav link, and streamline the Obsidian publish pipeline.

## Blog Listing (`/blog`) — Featured + Grid

The listing page uses a featured-hero layout: the most recent post gets a full-width hero card (large image, large title, full summary, tag pills), with remaining posts in a 2-column card grid below. Grid stacks to single column on mobile. Cards without featured images render text-only (no placeholder).

**Tag filtering:** Horizontal tag pill bar between the page header and posts. "All" pill active by default (red `#ef4444`), others neutral gray. Clicking a tag filters posts client-side with no page reload. URL hash updates on filter (e.g. `/blog#research`) for shareability. Tags derived from existing frontmatter `tags` field.

**Card design:** Dark cards (`#171717`) with subtle border (`#262626`), rounded corners, hover lift effect. Each card shows: featured image (optional, 16:9 aspect), date, title, summary, tag pills.

## Individual Post (`/blog/[slug]`) — Reading Experience

### Layout
Content area: 720px max-width centered. Sticky TOC sidebar (240px) to the right on desktop (hidden on mobile). Article uses CSS Grid with 4 columns: `1fr minmax(0, 720px) 240px 1fr`.

### Enhancements
- **Reading progress bar** — 3px red (`#ef4444`) bar fixed to viewport top, width tracks scroll position
- **Estimated read time** — Calculated from word count (~200 wpm), displayed next to date with a middle-dot separator
- **Tag pills** — Below title, link back to listing with tag filter hash
- **Table of contents** — Auto-generated from `h2`/`h3` headings in the markdown. Sticky sidebar on desktop with active-section tracking (red highlight + left border). Hidden on mobile via `display: none` at `max-width: 1100px`
- **Related posts** — 3-column card grid below the article, matched by shared tags, capped at 3 posts. Stacks to single column on mobile
- **Footer** — Same site-wide 2-column footer (About + Resources)

### Typography
- Body text: 17px, `#d4d4d4`, line-height 1.8
- h2: 24px, `#fff`, weight 800, 48px top margin
- h3: 20px, `#fff`, weight 700, 36px top margin
- Blockquotes: red left border, `#a3a3a3` italic text
- Links: amber `#fbbf24` with hover `#fcd34d`
- Mobile: body drops to 16px, title drops to 28px

## Navigation

Add "Blog" text link to `Nav.astro` alongside the "Take Action" button. Both desktop and mobile show: logo, "Blog" link, "Take Action" CTA button.

## Publishing Pipeline

Enhance `scripts/publish.py` to auto commit and push after copying posts:

1. Write post in Obsidian with `publish: deflocksc` frontmatter
2. Run `python scripts/publish.py`
3. Script copies processed markdown to `src/content/blog/`, commits, and pushes to master
4. Netlify auto-rebuilds from master

Posts default to `draft: true` — flip to `false` in the repo when ready to go live.

## Schema

No changes needed. Existing frontmatter fields cover everything:
- `title`, `date`, `summary`, `tags` (optional), `draft` (optional), `featuredImage` (optional), `ogImage` (optional)

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Card background | `#171717` | Blog cards, related posts |
| Card border | `#262626` | Card borders, dividers |
| Active tag / progress bar | `#ef4444` | Tag pill active state, progress bar, TOC active |
| Tag pill default | `#262626` bg, `#a3a3a3` text | Inactive tags |
| Body text | `#d4d4d4` | Prose paragraphs |
| Muted text | `#737373` | Dates, read time, TOC labels |
| Link color | `#fbbf24` | In-content links, back link |
| Content max-width | 720px | Post body |
| Listing max-width | 900px | Card grid, related posts |
