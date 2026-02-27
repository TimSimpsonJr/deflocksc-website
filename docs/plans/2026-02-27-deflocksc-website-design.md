# DeflockSC Website Design

## Overview

Advocacy website targeting Upstate SC residents. Converts visitors into people who contact their legislators about ALPR surveillance. Single scrolling advocacy page + blog.

## Stack

- **Framework:** Astro + Tailwind CSS
- **Hosting:** Netlify (free tier, auto-deploys from git push)
- **Blog:** Astro content collections (markdown)
- **Repo:** `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website`

## Visual Design

### Typography

- **Font:** Inter (Google Fonts)
- **Headlines:** Inter 900, letter-spacing -0.02em
- **Section headlines:** Inter 800
- **Body:** Inter 400, line-height 1.7
- **Subheadlines:** Inter 500, color #94a3b8
- **Labels/badges:** Inter 700-800, uppercase, letter-spacing 0.03-0.1em

### Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Primary background (dark) | Slate 900 | #0f172a |
| Alternate background (darker) | Slate 800 | #1e293b |
| Headlines | White | #ffffff |
| Subheadlines | Slate 400 | #94a3b8 |
| Body text | Slate 300 | #cbd5e1 |
| Accent / CTAs | Red 600 | #dc2626 |
| Accent hover | Red 700 | #b91c1c |
| Links | Red 500 | #ef4444 |
| Status badges | Amber 400 | #fbbf24 |
| Badge background | Amber 400 @ 10% | rgba(251,191,36,0.1) |
| Borders / dividers | Slate 700 | #334155 |
| Muted text | Slate 500 | #64748b |

### Section Flow

Alternating dark (#0f172a) and darker (#1e293b) backgrounds to create visual rhythm:

1. Hero (#0f172a)
2. What Is Flock Safety? (#1e293b)
3. It's Already Here / Map (#0f172a)
4. Bill Tracker (#1e293b)
5. FAQ (#0f172a)
6. Take Action (#1e293b)
7. Footer (#0f172a)

## Navigation

- **Style:** Hybrid — white Inter 900 logo ("DeflockSC") + uppercase Inter 700 nav links + red button CTA ("Take Action")
- **Links:** Home | Blog | Take Action (anchor to action section)
- **Position:** Fixed top
- **Mobile:** Hamburger menu (standard responsive pattern)

## Page Sections

### 1. Hero (`Hero.astro`)

- Full-width, background image (placeholder gradient until sourced)
- 1984 callback headline (Inter 900, large)
- Subheadline with 155-camera stat
- Body paragraph about the national network
- Red CTA button: "Email Your Legislators" anchoring to Take Action section

### 2. What Is Flock Safety? (`HowItWorks.astro`)

- Centered text layout
- Plain-language explainer of the technology
- Pull quote with red left border: "Your data is shared with agencies you don't control."
- **Fact cards:** Stacked full-width, red left border (#ef4444), background #1e293b, rounded right corners
  - 5 cards covering: Greenville sisters incident, SLED data retention, Santa Cruz federal access, Spartanburg sheriff, Austin audit
- Closing line

### 3. It's Already Here (`MapSection.astro`)

- Section headline: "155 Cameras. Upstate South Carolina. No Public Vote."
- Greenville and Columbia case study text
- HOA Creep / SafeWatch paragraph
- Deflock.org iframe embed (centered on lat 34.85, lng -82.39, zoom ~11) or fallback link button
- Map label above, caption with attribution below
- Eyes Off GSP callout box

### 4. Bill Tracker (`BillTracker.astro`)

- Section headline: "Three Bills. All Stalled. Your Legislators Need to Hear From You."
- Intro paragraph
- **Card layout:** Stacked cards with red left border, hoverable
  - Hover: background lightens to #263548, slight right-shift (translateX 4px), shadow
  - Each card shows: bill ID (red, Inter 800), title, "IN COMMITTEE" amber status badge, "Click for details" hint
- **Click opens centered modal:**
  - Slide-up + fade-in animation on open
  - Fade-down + slide-down animation on close
  - Dark backdrop (rgba(2,6,23,0.85)), also fades in/out
  - Close via: backdrop click, X button, Escape key
  - Modal content: bill ID (red Inter 900), title (Inter 700), metadata row (status/committee/last action), description paragraph
  - **Footer (desktop, >= 520px):** "Read full text on scstatehouse.gov" left-aligned, "Email Your Legislators" button right-aligned
  - **Footer (mobile, < 520px):** "Read full text" above, "Email Your Legislators" below, both left-aligned
- Data source: `src/data/bills.json`, auto-updated by scraper
- "Last updated" timestamp below cards
- Status note about S447 progress and SCPIF v. SLED lawsuit

### 5. FAQ (`FAQ.astro`)

- Section headline: "But what about..."
- **Accordion style:** Minimal left-border, border turns red (#ef4444) when open
- Red +/- indicator on each row
- **Smooth CSS animation** on open/close (not instant toggle)
- 5 Q&A pairs: cameras catch criminals, nothing to hide, crime reduction, data protection, anti-police
- Body text Inter 400, color #94a3b8

### 6. Take Action (`TakeAction.astro`)

- Section headline: "Tell Your Legislators: South Carolina Won't Be Watched Without a Vote."
- Body paragraph
- WeAct iframe embed placeholder (manual setup required)

### 7. Footer (in `Base.astro`)

- About DeflockSC paragraph
- Resource links: Deflock.org, EFF, Ban The Cams, SC Legislature bill pages
- Contact section

## Blog

- **Content collection** with frontmatter: title, date, summary, tags
- **Listing page:** `/blog` — all posts sorted by date
- **Post template:** `/blog/[slug]`
- **RSS feed** via `@astrojs/rss`
- **Content types:** Campaign updates, research pieces (both markdown)

## Scripts

### Bill Scraper (`scripts/scraper.py`)

- Python (requests + BeautifulSoup)
- Parses scstatehouse.gov bill History tabs
- Outputs `src/data/bills.json`
- GitHub Actions cron: weekly during session, monthly otherwise
- On change: commits update, triggers Netlify rebuild

### Obsidian Publish Pipeline (`scripts/publish.py`)

- Finds posts tagged `publish: deflocksc` in vault
- Converts wikilinks to standard markdown
- Strips vault-internal content
- Copies to `src/content/blog/`
- Run manually

## Repo Structure

```
src/
  components/    # Hero, HowItWorks, MapSection, BillTracker, FAQ, TakeAction
  content/blog/  # Markdown blog posts
  data/bills.json
  pages/
    index.astro
    blog/
  layouts/       # Base layout (nav, footer, meta)
scripts/
  publish.py
  scraper.py
public/
  images/        # Hero image, etc.
```

## Deferred / Manual Items

- WeAct campaign setup (account, letters, embed code)
- Deflock.org embed verification (iframe vs fallback link)
- Hero image sourcing
- Domain registration (deflocksc.org or .com)
- Netlify connection
- 155-camera stat verification

## Tone

- Serious, factual, urgent. Not alarmist.
- Non-partisan. 4th Amendment, government overreach, data privacy, fiscal accountability.
- One 1984 reference (Hero only).
- Cite Institute for Justice over EFF for conservative audiences.
- Primary stat: 155 cameras across Upstate SC.
