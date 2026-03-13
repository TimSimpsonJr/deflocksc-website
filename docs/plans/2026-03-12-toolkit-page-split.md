# Toolkit Page Split

**Date:** 2026-03-12
**Priority:** Medium — SEO benefit from making hidden tab content independently indexable
**Branch:** create from master (or feature/seo if not yet merged)

---

## Problem

The toolkit currently hides ~3,500 words of content behind JS tabs on a single `/toolkit` page. Search engines may deprioritize tab-hidden content since it's not visible on initial render. Breaking it into separate pages would:

- Make each section independently indexable with its own URL
- Allow keyword-optimized titles and meta descriptions per section
- Create 4 more internal linking targets
- Each page targets different long-tail queries

---

## Current Architecture

```
src/pages/toolkit.astro          → /toolkit (single page, renders ToolkitTabs)
src/components/ToolkitTabs.astro → tab bar + panel container (184 lines)
src/components/ToolkitFoia.astro → FOIA templates (278 lines)
src/components/ToolkitSpeaking.astro → Council meeting prep (158 lines)
src/components/ToolkitOutreach.astro → Outreach materials (366 lines)
src/components/ToolkitLegal.astro    → Legal resources (242 lines)
```

Tab IDs and their hash anchors:
- `#request-records` → ToolkitFoia
- `#speak-up` → ToolkitSpeaking
- `#spread-the-word` → ToolkitOutreach
- `#know-your-rights` → ToolkitLegal

Data files:
- `src/data/toolkit-outreach.json` — social media card data
- `src/data/toolkit-legal.json` — state comparison map, gap analysis, bill comparison

Static assets referenced by toolkit components:
- `/toolkit/foia/*.pdf` — FOIA template PDFs
- `/toolkit/speaking/council-handout.pdf`
- `/toolkit/outreach/one-pager.pdf`
- `/toolkit/outreach/card-*.png` and `cards-*-print.pdf`

---

## Target Architecture

```
src/pages/toolkit.astro          → /toolkit (hub page linking to all 4)
src/pages/toolkit/foia.astro     → /toolkit/foia
src/pages/toolkit/speaking.astro → /toolkit/speaking
src/pages/toolkit/outreach.astro → /toolkit/outreach
src/pages/toolkit/legal.astro    → /toolkit/legal
```

### Hub Page (`/toolkit`)

Keep the current hero section. Replace the tab interface with a grid of 4 cards linking to the subpages. Similar to the CitizenToolkit bento grid on the homepage but as a standalone landing page.

Each card should include:
- Section title
- 1-2 sentence description
- Visual indicator (icon or color accent)
- Link to the subpage

### Subpages (`/toolkit/foia`, etc.)

Each subpage should:
- Use `Base.astro` layout with its own title/description/OG tags
- Include a breadcrumb: Home > Toolkit > [Section Name]
- Render the existing component (ToolkitFoia, ToolkitSpeaking, etc.) directly
- Include a "Back to Toolkit" link and/or sidebar nav to the other 3 sections
- Add JSON-LD BreadcrumbList schema

### Suggested Titles and Meta

| Page | Title | Target Keyword |
|------|-------|---------------|
| `/toolkit/foia` | "FOIA Request Templates for ALPR Camera Data in South Carolina" | "FOIA request ALPR camera data" |
| `/toolkit/speaking` | "How to Speak at a Council Meeting About Surveillance Cameras" | "council meeting surveillance cameras" |
| `/toolkit/outreach` | "Community Outreach Materials — Fight ALPR Surveillance in SC" | "ALPR surveillance outreach" |
| `/toolkit/legal` | "ALPR Laws in South Carolina — Know Your Rights" | "ALPR laws South Carolina" |

---

## Redirects and Backward Compatibility

This is the most important part. Many internal links and external bookmarks point to `/toolkit#request-records`, etc.

### Option A: Client-side redirect on hub page (simpler)
Keep the hash-routing JS on `/toolkit`. When someone hits `/toolkit#request-records`, redirect them to `/toolkit/foia`. This preserves all existing links without touching every file that references them.

```js
const hashRedirects = {
  'request-records': '/toolkit/foia',
  'speak-up': '/toolkit/speaking',
  'spread-the-word': '/toolkit/outreach',
  'know-your-rights': '/toolkit/legal',
};
const hash = window.location.hash.slice(1);
if (hash in hashRedirects) {
  window.location.replace(hashRedirects[hash]);
}
```

### Option B: Update all internal links (thorough)
Find-and-replace all `/toolkit#section` links to `/toolkit/section` URLs. More work upfront but cleaner long-term.

### Internal links that need updating (Option B)

These are in `src/` (live site code):

| File | Current Link | New Link |
|------|-------------|----------|
| `src/components/CitizenToolkit.astro:22` | `/toolkit#request-records` | `/toolkit/foia` |
| `src/components/CitizenToolkit.astro:40` | `/toolkit#speak-up` | `/toolkit/speaking` |
| `src/components/CitizenToolkit.astro:53` | `/toolkit#spread-the-word` | `/toolkit/outreach` |
| `src/components/CitizenToolkit.astro:66` | `/toolkit#know-your-rights` | `/toolkit/legal` |
| `src/content/blog/building-deflocksc.md:71` | `/toolkit#request-records` | `/toolkit/foia` |
| `src/content/blog/building-deflocksc.md:73` | `/toolkit#speak-up` | `/toolkit/speaking` |
| `src/content/blog/building-deflocksc.md:75` | `/toolkit#spread-the-word` | `/toolkit/outreach` |
| `src/content/blog/building-deflocksc.md:77` | `/toolkit#know-your-rights` | `/toolkit/legal` |
| `src/content/blog/greenville-flock-contracts.md:25` | `/toolkit#request-records` | `/toolkit/foia` |
| `src/content/blog/greenville-flock-contracts.md:165` | `/toolkit#request-records` | `/toolkit/foia` |
| `src/content/blog/h4675-strongest-alpr-bill-in-sc.md:77` | `/toolkit#know-your-rights` | `/toolkit/legal` |

### Recommendation: Option A + gradual Option B

Ship with Option A (client-side redirect on hub page) to avoid blocking on a massive find-and-replace. Then update internal links to the new URLs over time. The redirects ensure nothing breaks in the meantime.

Also add Netlify `_redirects` or `netlify.toml` rules for any external links that might hit the old hash URLs server-side (hashes don't reach the server, so this only matters if someone linked to `/toolkit` without a hash and expected a specific tab).

---

## Design Decisions (from mockup session)

- **Hub card style:** Red accent dot on overline titles, amber tags at bottom, no bento watermarks
- **Tag color:** `#fbbf24` text with `rgba(251,191,36,0.2)` border (amber, matches existing site accent)
- **TOOLKIT hero watermark:** Kept as-is from current page (`rgba(255,255,255,0.025)`)
- **Body-to-tags spacing:** `mb-6` (24px) for breathing room on narrow cards
- **Arrow indicator:** Bottom-right chevron, gray default, red on hover
- **Card hover:** `bg-[#1a1a1a]` transition
- **Redirect strategy:** Option A (client-side hash redirect) + Option B (update all 11 internal links)

---

## Implementation Checklist

### Phase 1: Create subpages
- [ ] Create `src/pages/toolkit/foia.astro` — imports Base + ToolkitFoia, sets title/meta
- [ ] Create `src/pages/toolkit/speaking.astro` — imports Base + ToolkitSpeaking
- [ ] Create `src/pages/toolkit/outreach.astro` — imports Base + ToolkitOutreach
- [ ] Create `src/pages/toolkit/legal.astro` — imports Base + ToolkitLegal
- [ ] Add BreadcrumbList JSON-LD to each subpage
- [ ] Add cross-navigation between subpages (sidebar or top links)

### Phase 2: Convert hub page
- [ ] Replace ToolkitTabs import in `toolkit.astro` with a card grid linking to subpages
- [ ] Add hash-to-subpage redirect script (Option A)
- [ ] Keep the hero section as-is

### Phase 3: Cleanup
- [ ] Update internal links from `/toolkit#hash` to `/toolkit/section` (Option B, 11 links listed above)
- [ ] Verify sitemap includes all 5 toolkit URLs
- [ ] Test that old bookmarked URLs (`/toolkit#request-records`) redirect correctly
- [ ] ToolkitTabs.astro can be deleted once all links are updated and hash redirects are confirmed working

### Do NOT change
- The 4 toolkit content components (ToolkitFoia, ToolkitSpeaking, ToolkitOutreach, ToolkitLegal) — they stay as-is, just rendered on their own pages instead of in tabs
- Static asset paths (`/toolkit/foia/*.pdf`, etc.) — these already use the right URL structure
- Data files (`toolkit-outreach.json`, `toolkit-legal.json`) — no changes needed
