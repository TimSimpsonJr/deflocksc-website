# DeflockSC Website Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-page advocacy website that converts Upstate SC residents into people who contact their legislators about ALPR surveillance, with a blog and auto-updating bill tracker.

**Architecture:** Astro static site with Tailwind CSS, deployed to Netlify. Single scrolling homepage composed of section components. Blog via Astro content collections. Bill data in JSON, updated by Python scraper on GitHub Actions cron.

**Tech Stack:** Astro 5, Tailwind CSS 4, Inter (Google Fonts), Python 3.12 (scraper/publish scripts), GitHub Actions

**Design doc:** `docs/plans/2026-02-27-deflocksc-website-design.md`

**Copy source:** Obsidian vault at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\docs\plans\deflocksc-website.md` — all section copy is there verbatim. Read each section's copy from the vault note when building that component.

---

## Task 1: Scaffold Astro Project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `tailwind.config.mjs`
- Create: `src/pages/index.astro` (minimal placeholder)
- Create: directory structure per design doc

**Step 1: Initialize Astro project**

Run from repo root (files already exist from design mockups — scaffold into existing directory):
```bash
npm create astro@latest . -- --template minimal --no-install --no-git
```
If it prompts about existing files, overwrite only the Astro scaffold files.

**Step 2: Install dependencies**

```bash
npm install
npx astro add tailwind
```
Accept defaults when prompted.

**Step 3: Add Inter font**

Add Google Fonts link for Inter (weights 400, 500, 700, 800, 900) to the Astro layout head. This happens in Task 2 when we create the base layout.

**Step 4: Create directory structure**

```bash
mkdir -p src/components src/content/blog src/data src/layouts src/pages/blog scripts public/images
```

**Step 5: Create initial bills.json**

Create `src/data/bills.json` with the three bills from the design doc:
```json
[
  {
    "bill": "S447",
    "title": "Would regulate license plate reader systems statewide",
    "status": "In Committee, Senate Judiciary",
    "url": "https://www.scstatehouse.gov/sess126_2025-2026/bills/447.htm",
    "lastAction": "Referred to subcommittee",
    "lastActionDate": "",
    "description": "S447 has gotten the furthest of the three bills. It cleared a Senate Judiciary subcommittee, but the full committee hasn't acted. This bill would establish statewide rules for how law enforcement can use license plate readers, including data retention limits and access controls."
  },
  {
    "bill": "H3155",
    "title": "Would regulate automatic license plate readers",
    "status": "In Committee, House Judiciary",
    "url": "https://www.scstatehouse.gov/sess126_2025-2026/bills/3155.htm",
    "lastAction": "",
    "lastActionDate": "",
    "description": "H3155 sits in the House Judiciary Committee with no action taken. It would regulate how automatic license plate readers are deployed and require transparency about data sharing with other agencies, including federal law enforcement."
  },
  {
    "bill": "H4013",
    "title": "Would regulate automated license plate readers",
    "status": "In Committee, House Ed & Public Works",
    "url": "https://www.scstatehouse.gov/sess126_2025-2026/bills/4013.htm",
    "lastAction": "",
    "lastActionDate": "",
    "description": "H4013 is in the House Education and Public Works Committee with no action taken. It addresses automated license plate reader regulation, focusing on deployment oversight and data access policies."
  }
]
```

**Step 6: Verify dev server starts**

```bash
npm run dev
```
Expected: Astro dev server starts, blank page loads at localhost.

**Step 7: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json tailwind.config.mjs src/ public/
git commit -m "feat: scaffold Astro project with Tailwind and directory structure"
```

---

## Task 2: Base Layout with Nav and Footer

**Files:**
- Create: `src/layouts/Base.astro`

**Reference:** Read Section 6 (Footer) and Navigation copy from the vault note at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\docs\plans\deflocksc-website.md`.

**Step 1: Create Base.astro layout**

This is the shell for every page. Includes:
- HTML head: charset, viewport, title prop, Inter Google Font link (weights 400,500,700,800,900), Tailwind
- Open Graph meta tags (title, description, image placeholders)
- Fixed top nav bar:
  - White Inter 900 logo "DeflockSC" (left)
  - Uppercase Inter 700 links: HOME, BLOG (right)
  - Red button CTA: "Take Action" linking to `/#take-action` (right)
  - Mobile: hamburger menu toggling a slide-down menu
- Footer:
  - About DeflockSC paragraph (from vault copy)
  - Links column: Deflock.org, EFF License Plate Reader Hub, Ban The Cams, three SC Legislature bill links
  - Contact placeholder: "Want to get more involved? Email us"
- `<slot />` between nav and footer for page content

**Color/typography spec from design doc:**
- Nav background: `#0f172a` with bottom border `#1e293b`
- Footer background: `#0f172a`
- Body default background: `#0f172a`
- All text colors, font weights, and spacing per design doc color palette

**Step 2: Update index.astro to use Base layout**

Wrap a placeholder `<h1>DeflockSC</h1>` in the Base layout.

**Step 3: Verify in browser**

Start dev server, confirm:
- Nav renders with logo, links, and CTA button
- Footer renders with about text and links
- Mobile hamburger works at 375px width
- Fixed nav stays at top on scroll

**Step 4: Commit**

```bash
git add src/layouts/Base.astro src/pages/index.astro
git commit -m "feat: add base layout with responsive nav and footer"
```

---

## Task 3: Hero Section

**Files:**
- Create: `src/components/Hero.astro`
- Modify: `src/pages/index.astro`

**Reference:** Read Section 1 (Hero) copy from the vault note.

**Step 1: Build Hero component**

- Full-width section, background `#0f172a`
- Placeholder dark gradient background (until hero image is sourced)
- Headline: 1984 quote (Inter 900, large, white) — copy verbatim from vault
- Subheadline: 155 cameras stat (Inter 500, #94a3b8)
- Body paragraph about the national network (Inter 400, #cbd5e1)
- Red CTA button: "Email Your Legislators" linking to `#take-action`
- Max-width container for text content, generous vertical padding
- Responsive: text sizes scale down on mobile

**Step 2: Add Hero to index.astro**

Import and place as first component inside Base layout.

**Step 3: Verify in browser**

Confirm hero renders with correct copy, typography, and CTA button. Check mobile at 375px.

**Step 4: Commit**

```bash
git add src/components/Hero.astro src/pages/index.astro
git commit -m "feat: add Hero section with 1984 hook and CTA"
```

---

## Task 4: How It Works Section

**Files:**
- Create: `src/components/HowItWorks.astro`
- Modify: `src/pages/index.astro`

**Reference:** Read Section 2 (How It Works) copy from the vault note. All 5 fact card texts are in the vault.

**Step 1: Build HowItWorks component**

- Section background: `#1e293b` (alternating)
- Section headline: "What Is Flock Safety?" (Inter 800)
- Body text: three paragraphs explaining the technology (Inter 400, #cbd5e1)
- Pull quote: "Your data is shared with agencies you don't control." — red left border (#ef4444), Inter 700 italic, #f8fafc
- 5 fact cards stacked full-width:
  - Background `#1e293b` (will appear as slightly raised cards on the alternating bg — use a subtle border or slightly different shade)
  - Red left border 3px #ef4444
  - Rounded right corners (border-radius 0 6px 6px 0)
  - Text: Inter 400, #cbd5e1, 0.9rem
  - All 5 fact texts from vault copy
- Closing line (Inter 400, #cbd5e1)

**Step 2: Add to index.astro**

Place after Hero.

**Step 3: Verify in browser**

Confirm section renders with all copy, pull quote styling, and 5 fact cards.

**Step 4: Commit**

```bash
git add src/components/HowItWorks.astro src/pages/index.astro
git commit -m "feat: add What Is Flock Safety section with fact cards"
```

---

## Task 5: Map Section

**Files:**
- Create: `src/components/MapSection.astro`
- Modify: `src/pages/index.astro`

**Reference:** Read Section 3 (It's Already Here) copy from the vault note.

**Step 1: Build MapSection component**

- Section background: `#0f172a` (alternating)
- Section headline: "155 Cameras. Upstate South Carolina. No Public Vote." (Inter 800)
- Body text: Greenville paragraph (with bold "Greenville:" prefix), Columbia paragraph (with bold "Columbia:" prefix), playbook paragraph, HOA Creep/SafeWatch paragraph — all from vault copy
- Map embed area:
  - Label above: "Find the cameras in your neighborhood." (Inter 700)
  - Fallback: link button "Open the camera map →" pointing to `https://deflock.org/?lat=34.85&lng=-82.39&zoom=11` (use this as default — iframe can be swapped in later if available)
  - Caption below: "Data from Deflock.org, a community-sourced map of Flock Safety camera locations."
- Eyes Off GSP callout box: background `#1e293b`, rounded, padding. Text: "You're not alone in this. Eyes Off GSP is already organizing in the Greenville-Spartanburg area." with link to eyesoffgsp.org

**Step 2: Add to index.astro**

Place after HowItWorks.

**Step 3: Verify in browser**

Confirm section renders with all copy, map fallback link, and Eyes Off GSP callout.

**Step 4: Commit**

```bash
git add src/components/MapSection.astro src/pages/index.astro
git commit -m "feat: add Map section with Deflock.org link and local data"
```

---

## Task 6: Bill Tracker Section

**Files:**
- Create: `src/components/BillTracker.astro`
- Create: `src/components/BillModal.astro` (or inline as client-side JS — Astro islands)
- Modify: `src/pages/index.astro`

**Reference:** Read Section 4 (Bill Tracker) copy from the vault note. Modal spec from design doc.

This is the most complex component. It reads `bills.json`, renders hoverable cards, and opens a modal overlay on click.

**Step 1: Build BillTracker component — static cards**

- Section background: `#1e293b` (alternating)
- Section headline: "Three Bills. All Stalled. Your Legislators Need to Hear From You." (Inter 800)
- Intro paragraph from vault copy
- Import and iterate over `bills.json` data
- Render each bill as a card:
  - Background `#0f172a` (contrast against section bg)
  - Red left border 3px, rounded right corners
  - Top row: bill ID (Inter 800, #ef4444) left, status badge (Inter 700, #fbbf24, amber bg) right
  - Title text (Inter 400, #cbd5e1)
  - "Click for details" hint (Inter 500, #475569, lightens on card hover)
  - Hover: background `#263548`, translateX(4px), box-shadow
  - `data-bill` attribute storing bill index for JS
  - `cursor: pointer`

**Step 2: Build modal overlay (client-side JavaScript)**

Since Astro is static, the modal interaction needs client-side JS. Use a `<script>` tag in the component (Astro supports inline scripts that ship to client).

Modal HTML (rendered once, populated dynamically):
- Backdrop: fixed overlay, `rgba(2,6,23,0.85)`, z-index 100
- Card: centered, max-width 560px, background `#1e293b`, border-left 4px #ef4444, rounded
- Close button (x) top-right
- Bill ID (Inter 900, #ef4444), title (Inter 700, white)
- Metadata row: Status (amber) | Committee | Last Action — using labeled pairs
- Description paragraph (Inter 400, #94a3b8)
- Actions footer:
  - Desktop (>= 520px): `flex-direction: row-reverse; justify-content: space-between` — CTA right, link left
  - Mobile (< 520px): `flex-direction: column; align-items: flex-start` — link above, CTA below
  - CTA: "Email Your Legislators" red button linking to `#take-action`
  - Link: "Read full text on scstatehouse.gov →" linking to bill URL

Animations:
- Open: backdrop fade-in (opacity 0→1, 200ms), card slide-up + fade-in (translateY 20px→0, opacity 0→1, 250ms ease-out)
- Close: card fade-down (translateY 0→20px, opacity 1→0, 200ms ease-in), backdrop fade-out (200ms)
- Use CSS classes toggled by JS (not CSS-only, since we need the close animation before removing)

Close triggers: backdrop click, X button, Escape key

**Step 3: Wire up card clicks to modal**

JS: click handler on `.bill-card` reads `data-bill` index, populates modal fields from bills data (embedded as JSON in a script tag), shows modal.

**Step 4: Add status note and timestamp**

Below the cards:
- "Last updated: February 2026" timestamp
- Status note paragraph about S447, H3155, H4013, and SCPIF v. SLED — from vault copy

**Step 5: Add to index.astro**

Place after MapSection.

**Step 6: Verify in browser**

- Cards render with correct data from bills.json
- Hover effect works (background change, shift, shadow)
- Click opens modal with fade-up animation
- Modal shows correct bill data
- Close works via backdrop, X, Escape
- Close has fade-down animation
- Desktop: CTA right-aligned, link left
- Mobile (375px): link above CTA, both left-aligned

**Step 7: Commit**

```bash
git add src/components/BillTracker.astro src/pages/index.astro
git commit -m "feat: add Bill Tracker with hoverable cards and detail modal"
```

---

## Task 7: FAQ Section

**Files:**
- Create: `src/components/FAQ.astro`
- Modify: `src/pages/index.astro`

**Reference:** Read Section 4.5 (FAQ) copy from the vault note. All 5 Q&A pairs are in the vault.

**Step 1: Build FAQ component**

- Section background: `#0f172a` (alternating)
- Section headline: "But what about..." (Inter 800)
- 5 Q&A pairs using `<details>` elements:
  - Left border 3px, default `#1e293b`, turns `#ef4444` when open
  - Summary: question text in quotes (Inter 700, white)
  - Red +/- indicator on right side of summary (CSS `::after` pseudo-element)
  - Answer div: Inter 400, #94a3b8, line-height 1.7
  - **Smooth animation:** Use CSS `grid-template-rows: 0fr` → `1fr` transition on a wrapper div inside `<details>`, with `overflow: hidden`. This is the modern CSS-only approach for animating `<details>` open/close. Requires a JS snippet to toggle a class for the close animation (since `<details>` closing is instant by default).

**Step 2: Add to index.astro**

Place after BillTracker.

**Step 3: Verify in browser**

- All 5 Q&As render
- Click opens smoothly (not instant)
- Click again closes smoothly
- +/- indicator toggles
- Border turns red when open

**Step 4: Commit**

```bash
git add src/components/FAQ.astro src/pages/index.astro
git commit -m "feat: add FAQ accordion with smooth animation"
```

---

## Task 8: Take Action Section

**Files:**
- Create: `src/components/TakeAction.astro`
- Modify: `src/pages/index.astro`

**Reference:** Read Section 5 (Take Action) copy from the vault note.

**Step 1: Build TakeAction component**

- Section background: `#1e293b` (alternating), `id="take-action"` for anchor linking
- Section headline: "Tell Your Legislators: South Carolina Won't Be Watched Without a Vote." (Inter 800)
- Body paragraph from vault copy
- Placeholder for WeAct embed: a styled container with text "Action widget will be embedded here once the WeAct campaign is set up." Background `#0f172a`, border `#334155`, rounded, centered text, muted color. This gets replaced with the actual iframe once the WeAct account is ready.

**Step 2: Add to index.astro**

Place after FAQ.

**Step 3: Verify in browser**

Confirm section renders, anchor link from nav and Hero CTA scrolls to this section.

**Step 4: Commit**

```bash
git add src/components/TakeAction.astro src/pages/index.astro
git commit -m "feat: add Take Action section with embed placeholder"
```

---

## Task 9: Blog System

**Files:**
- Create: `src/content/config.ts`
- Create: `src/pages/blog/index.astro`
- Create: `src/pages/blog/[...slug].astro`
- Create: `src/pages/rss.xml.ts`
- Create: `src/content/blog/welcome.md` (test post)

**Step 1: Define content collection schema**

`src/content/config.ts`:
```typescript
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
```

**Step 2: Create blog listing page**

`src/pages/blog/index.astro`: Lists all posts sorted by date descending. Shows title, date, summary for each. Uses Base layout. Dark theme consistent with main site.

**Step 3: Create blog post template**

`src/pages/blog/[...slug].astro`: Renders individual post with Base layout. Title, date, rendered markdown content. Prose styling for markdown (Tailwind typography plugin or manual styles).

**Step 4: Create test blog post**

`src/content/blog/welcome.md`:
```markdown
---
title: "DeflockSC is Live"
date: 2026-02-27
summary: "We're launching DeflockSC to bring transparency to license plate surveillance in Upstate South Carolina."
tags: ["launch", "campaign"]
---

DeflockSC is live. More updates coming soon.
```

**Step 5: Add RSS feed**

Install `@astrojs/rss`:
```bash
npm install @astrojs/rss
```

Create `src/pages/rss.xml.ts` generating RSS from blog collection.

**Step 6: Verify in browser**

- `/blog` lists the test post
- Clicking through shows the full post
- `/rss.xml` returns valid RSS

**Step 7: Commit**

```bash
git add src/content/ src/pages/blog/ src/pages/rss.xml.ts package.json package-lock.json
git commit -m "feat: add blog with content collection, listing, posts, and RSS"
```

---

## Task 10: Bill Scraper Script

**Files:**
- Create: `scripts/scraper.py`
- Create: `requirements.txt`

**Python path:** `C:\Users\tim\AppData\Local\Programs\Python\Python312\python.exe`

**Step 1: Create requirements.txt**

```
requests
beautifulsoup4
```

**Step 2: Install dependencies**

```bash
/c/Users/tim/AppData/Local/Programs/Python/Python312/python.exe -m pip install -r requirements.txt
```

**Step 3: Write scraper script**

`scripts/scraper.py`:
- Takes list of bill URLs from current `bills.json`
- For each bill, fetches the History page on scstatehouse.gov
- Parses HTML with BeautifulSoup to find:
  - Current status (committee assignment)
  - Last action text
  - Last action date
- Updates `src/data/bills.json` with new status fields
- Preserves existing `title`, `description`, `url` fields
- Writes JSON with proper formatting (indent=2)
- Prints summary of what changed

Note: scstatehouse.gov markup may vary — build the parser by examining the actual page structure at runtime. Include error handling so a parse failure for one bill doesn't break the others.

**Step 4: Test scraper locally**

```bash
/c/Users/tim/AppData/Local/Programs/Python/Python312/python.exe scripts/scraper.py
```
Verify `bills.json` is updated (or unchanged if data is current).

**Step 5: Commit**

```bash
git add scripts/scraper.py requirements.txt
git commit -m "feat: add bill status scraper for scstatehouse.gov"
```

---

## Task 11: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/scrape-bills.yml`

**Step 1: Create workflow file**

```yaml
name: Scrape Bill Status

on:
  schedule:
    # Weekly on Mondays at 9am ET during session (Jan-Jun)
    - cron: '0 14 * 1-6 1'
    # Monthly on 1st at 9am ET off-session (Jul-Dec)
    - cron: '0 14 1 7-12 *'
  workflow_dispatch: # manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python scripts/scraper.py
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet src/data/bills.json || (git add src/data/bills.json && git commit -m "chore: update bill status data" && git push)
```

**Step 2: Commit**

```bash
git add .github/workflows/scrape-bills.yml
git commit -m "feat: add GitHub Actions workflow for weekly bill scraping"
```

---

## Task 12: Obsidian Publish Pipeline

**Files:**
- Create: `scripts/publish.py`

**Step 1: Write publish script**

`scripts/publish.py`:
- Scans vault path `C:\Users\tim\OneDrive\Documents\Tim's Vault` for markdown files with `publish: deflocksc` in YAML frontmatter
- For each matching file:
  - Reads content
  - Converts `[[wikilinks]]` to standard markdown links (strip to plain text — no vault-internal linking needed on the site)
  - Converts `[[wikilinks|display text]]` to just the display text
  - Strips any vault-internal metadata (tags that start with `area-`, `type-`, etc.)
  - Ensures required frontmatter fields exist: title, date, summary
  - Copies processed file to `src/content/blog/`
- Prints summary of files processed

**Step 2: Test with a mock file**

Create a test markdown file in the vault publish folder, run the script, verify output in `src/content/blog/`.

**Step 3: Commit**

```bash
git add scripts/publish.py
git commit -m "feat: add Obsidian-to-blog publish pipeline"
```

---

## Task 13: Responsive QA Pass

**Files:**
- Modify: any components that need responsive fixes

**Step 1: Test at mobile (375px)**

Check every section:
- Nav collapses to hamburger
- Hero text is readable, CTA is tappable
- Fact cards are full-width
- Map section link/embed fits
- Bill tracker cards and modal work
- FAQ accordion works
- Take Action section fits
- Footer stacks properly

**Step 2: Test at tablet (768px)**

Check layout at mid-width breakpoint.

**Step 3: Test at desktop (1280px)**

Verify full-width layout, max-width containers, nav layout.

**Step 4: Fix any issues found**

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: responsive layout adjustments across all sections"
```

---

## Task 14: Production Build and Cleanup

**Files:**
- Remove: `typography-preview.html`, `visual-preview.html`, `nav-preview.html`, `bill-tracker-preview.html` (design mockups no longer needed)
- Modify: `astro.config.mjs` if needed for build settings

**Step 1: Remove design preview files**

```bash
rm typography-preview.html visual-preview.html nav-preview.html bill-tracker-preview.html
```

**Step 2: Run production build**

```bash
npm run build
```
Expected: Clean build, no errors, output in `dist/`.

**Step 3: Preview production build**

```bash
npm run preview
```
Spot-check all pages and interactions.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove design mockups and verify production build"
```

---

## Task 15: Create GitHub Repo and Push

**Step 1: Create remote repo**

```bash
gh repo create deflocksc-website --public --source=. --remote=origin
```

**Step 2: Push**

```bash
git push -u origin master
```

**Step 3: Verify on GitHub**

Confirm repo is live with all commits.

---

## Post-Implementation (Manual / Deferred)

These are not automated tasks — they require the user's action:

- [ ] Source hero image (own photo or CC-licensed)
- [ ] Set up WeAct account and campaign, get embed code, replace placeholder in TakeAction
- [ ] Verify Deflock.org iframe availability, swap fallback link if iframe works
- [ ] Register domain (deflocksc.org or .com)
- [ ] Connect GitHub repo to Netlify
- [ ] Verify 155-camera stat against Deflock.org
- [ ] Trigger GitHub Actions workflow manually to test scraper in CI
- [ ] Publish first real blog post via Obsidian pipeline
