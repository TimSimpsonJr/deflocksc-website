# Action Guide Blog Post — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write and publish the cornerstone action guide blog post "How to Fight License Plate Surveillance in Your SC Community" — the highest-ROI SEO content piece remaining (zero SERP competition for target keyword).

**Architecture:** Single markdown blog post in Astro content collection, following existing post format. Post links to every major site tool (camera map, rep finder, FOIA toolkit, speaking prep, outreach materials, bill tracker). After publishing, add cross-links from 2 existing posts back to this one.

**Tech Stack:** Astro content collections (markdown), existing `data-open-action` CTA button pattern.

---

### Task 1: Write the blog post

**Files:**
- Create: `src/content/blog/how-to-fight-alpr-surveillance-sc.md`

**Reference files (read these for format, voice, and link patterns):**
- `src/content/blog/h4675-strongest-alpr-bill-in-sc.md` — frontmatter format, `<strong class="red">` usage, `data-open-action` button HTML
- `src/content/blog/greenville-flock-contracts.md` — voice, FOIA details to reference
- `~/.claude/voice-dna.md` — voice rules (contractions, short paragraphs, NO em dashes, banned phrases)
- `docs/plans/2026-03-12-action-guide-blog-post-design.md` — full design spec with section structure and word counts

**Step 1: Write the complete markdown file**

Frontmatter:

```yaml
---
title: "How to Fight License Plate Surveillance in Your SC Community"
date: 2026-03-12T00:00:00.000Z
summary: "5 concrete steps any South Carolinian can take to push back against ALPR cameras: find what's in your area, file records requests, show up at council meetings, and support H4675."
tags:
  - action
  - toolkit
  - sc
draft: false
featuredImage: /blog/how-to-fight-alpr-surveillance-sc.png
featuredImageAlt: "How to fight license plate surveillance in South Carolina — action guide"
---
```

Body sections (follow design doc `docs/plans/2026-03-12-action-guide-blog-post-design.md` exactly):

1. **Intro** (~120 words): "You found out your city has cameras. Now what?" Direct, no preamble. 5 steps, one person, no org needed.

2. **Step 1: Find out what's in your area** (~200 words): Link `/#camera-map`. Deflock.org source. 110+ agencies, 1,000+ cameras. Explain dots = individual cameras, clusters = dense areas.

3. **Step 2: Find out who's responsible** (~200 words): Embed `data-open-action` button. Most contracts signed by police chief, not council. Greenville: 6 years, zero votes. State bills would override.

4. **Step 3: File a records request** (~350 words): Link `/toolkit#request-records`. SC § 30-4-10 basics (10 business days, free electronic records). 4 template types. Greenville success: 96 pages, $2K→$131K escalation. Richland caution: $9K quote. National: Eugene, 800/1,200 searches no case number.

5. **Step 4: Show up at a council meeting** (~350 words): Link `/toolkit#speak-up`. How to find meetings, how public comment works. 4 talking points. National proof: Hays County TX ("vendor accountability, not anti-police"), Olympia WA (200-person rally, next-day result).

6. **Step 5: Get your neighbors asking questions** (~200 words): Link `/toolkit#spread-the-word`. HOA, Nextdoor, Facebook. Eyes Off GSP in the Upstate.

7. **What's happening at the state level** (~200 words): Link `/#bill-tracker`. 4 bills, committee, no hearing. H4675 provisions. Bipartisan. Link `/blog/h4675-strongest-alpr-bill-in-sc`.

8. **CTA** (~80 words): "Pick one step. Do it today." Embed `data-open-action` button (copy exact HTML from other posts).

9. **FAQ** (~150 words): 3 Q&A pairs. Link camera map, toolkit, bill tracker.

Voice rules (CRITICAL):
- NO em dashes (use commas, periods, colons, semicolons, parentheses)
- Short paragraphs (1-3 sentences max)
- Contractions always (don't, can't, won't, you'll)
- Second person ("you") throughout
- No banned phrases from voice-dna.md (no "delve", "leverage", "straightforward", "in today's", "furthermore", etc.)
- No "This isn't X. This is Y." pattern (FATAL)
- Specific SC examples, not hypotheticals
- `<strong class="red">` for key emphasis moments (2-3 total, not more)
- Bold sparingly

**Step 2: Verify the post builds**

Run: `node node_modules/astro/astro.js build`
Expected: Build succeeds with no errors. New post appears in output.

**Step 3: Commit**

```bash
git add src/content/blog/how-to-fight-alpr-surveillance-sc.md
git commit -m "feat(blog): add action guide — how to fight ALPR surveillance in SC"
```

---

### Task 2: Run /humanize on the post

**Files:**
- Modify: `src/content/blog/how-to-fight-alpr-surveillance-sc.md`

**Step 1: Run the humanize skill**

Invoke `/humanize` on the blog post content. This checks for AI-sounding language, banned phrases, em dashes, and mechanical transitions.

**Step 2: Apply any fixes**

Edit the post to fix anything humanize flags.

**Step 3: Commit**

```bash
git add src/content/blog/how-to-fight-alpr-surveillance-sc.md
git commit -m "style(blog): humanize action guide copy"
```

---

### Task 3: Add cross-links from existing posts

**Files:**
- Modify: `src/content/blog/sc-has-no-license-plate-camera-law.md`
- Modify: `src/content/blog/h4675-strongest-alpr-bill-in-sc.md`

**Step 1: Add link from "SC Has No Law" post**

Find the CTA section at the bottom (near the `data-open-action` button). Add a sentence linking to the action guide. Example placement: just before the CTA button, add something like "For a step-by-step playbook, read the [action guide](/blog/how-to-fight-alpr-surveillance-sc)."

**Step 2: Add link from "H4675" post**

Same pattern. Find the CTA section at the bottom. Add a cross-link to the action guide.

**Step 3: Verify build**

Run: `node node_modules/astro/astro.js build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/content/blog/sc-has-no-license-plate-camera-law.md src/content/blog/h4675-strongest-alpr-bill-in-sc.md
git commit -m "feat(blog): add cross-links to action guide from SC-no-law and H4675 posts"
```

---

### Task 4: Verify in preview

**Step 1: Start dev server**

Use `preview_start` with the `dev` config.

**Step 2: Navigate to the post**

Go to `http://127.0.0.1:4321/blog/how-to-fight-alpr-surveillance-sc`

**Step 3: Check content and links**

- All internal links work (camera map, toolkit sections, other blog posts)
- `data-open-action` button opens the action modal
- FAQ section renders correctly
- No layout issues

**Step 4: Check cross-links**

Navigate to `/blog/sc-has-no-license-plate-camera-law` and `/blog/h4675-strongest-alpr-bill-in-sc`. Verify the new links to the action guide are visible and work.

**Step 5: Take screenshot for proof**

---

### Task 5: Note featured image requirement

The post references `/blog/how-to-fight-alpr-surveillance-sc.png` which doesn't exist yet. The OG image system (`blog/[...slug]/og.png.ts`) will auto-generate an OG card, but a featured image for the blog listing needs manual creation or an alternative approach. Flag this to the user.

---

## Notes

- Featured image (`/blog/how-to-fight-alpr-surveillance-sc.png`) needs to be created separately. The post will build and render without it, but the blog listing card will show no image.
- The post should be the most internally-linked piece on the site. Double-check every link target exists.
- After merge + deploy, submit updated sitemap to GSC.
