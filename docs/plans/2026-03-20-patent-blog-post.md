# Patent Blog Post Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write and publish a 2,500-3,000 word blog post exposing the contradiction between Flock Safety's public denial of racial classification and Patent US11416545B1, with every claim sourced and every section tied to SC consequences.

**Architecture:** Single markdown file in `src/content/blog/`, following the same frontmatter schema and HTML patterns (red callouts, CTA blocks, source sections) as existing posts like `greenville-flock-contracts.md`. FAQ schema embedded as inline JSON-LD at the bottom.

**Tech Stack:** Astro content collection (markdown), HTML for callouts/CTA/JSON-LD, existing `strong.red` CSS class for pull quotes.

---

### Task 1: Verify sources

Before writing a single word, verify that every source URL in the design doc resolves. This prevents publishing a post with dead links.

**Files:**
- Read: `docs/plans/2026-03-20-patent-blog-post-design.md`

**Step 1: Check each source URL**

Use WebFetch or WebSearch to verify these URLs are live:
1. `https://pubchem.ncbi.nlm.nih.gov/patent/US-11416545-B1` (patent record)
2. `https://www.flocksafety.com/products/flock-freeform` (FreeForm product page)
3. `https://www.flocksafety.com/blog/are-flock-products-discriminatory/` (discrimination blog)
4. `https://www.aclu.org/news/national-security/surveillance-company-flock-now-using-ai-to-report-us-to-police-if-it-thinks-our-movement-patterns-are-suspicious` (ACLU analysis)
5. `https://consumerrights.wiki/w/Flock_license_plate_readers` (Norfolk case)
6. `https://www.businessinsider.com/flock-safety-alpr-cameras-misreads-2024` (misread reporting)
7. Search for "Flock Safety future of investigations blog" to find the URL for the blog post that mentions facial recognition capability

**Step 2: Document results**

If any URL is dead, note the broken link and find an archive.org fallback or alternative source. If the "Future of Investigations" blog can't be found, attribute the facial recognition admission as: "In a blog post about AI investigative tools (since removed from Flock's website), the company described facial recognition as a capability of its system."

**Step 3: Record verified source list**

Write down the final verified source list to reference during writing. No commit yet.

---

### Task 2: Write the blog post frontmatter and opening

**Files:**
- Create: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write the file with frontmatter and opening section**

```markdown
---
title: "Flock Safety Patented Racial Classification. SC Has No Law Against It."
subtitle: "What Patent US11416545B1 Says About the Cameras on Your Roads"
date: 2026-03-20
summary: "Flock Safety says their cameras don't identify race, gender, or ethnicity. Patent US11416545B1, granted in August 2022, describes a system that does exactly that. Every Flock camera in South Carolina is hardware that could run this software. No SC law prevents it."
tags:
  - flock-safety
  - privacy
  - research
  - sc
  - patents
featuredImage: /blog/flock-patent-racial-classification.png
featuredImageAlt: "Flock Safety patent US11416545B1 describing racial and gender classification capabilities vs. company marketing denial"
draft: true
---
```

Follow with the opening section (~150 words). Structure:

1. Flock's public claim (quote from their discrimination blog post, linked)
2. Patent US11416545B1 description (quote patent language, linked)
3. SC pivot: 1,000+ cameras, 422 million SLED reads, zero laws governing classification capabilities

Voice rules: contractions, short paragraphs, no em dashes, no banned phrases. Open cold with the contradiction. No throat-clearing.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: begin patent blog post with frontmatter and opening"
```

---

### Task 3: Write Section 1 (What the patent actually says)

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 1 (~400 words)**

Section heading: `## What the patent actually says`

Content:
- Patent number, filing date (Oct 4, 2020), grant date (Aug 16, 2022)
- Quoted patent claims: the specific language about race, gender, height, weight, clothing classification. Use blockquote formatting for patent text.
- Cross-camera tracking via "statistical similarity"
- Facial recognition data points
- Explain: patents are filed under penalty of perjury. This isn't speculation. It's what Flock told the US Patent Office their invention does.

SC tie-in: every Flock camera in the state is hardware that could run this software. The patent describes what these specific devices are designed to do.

Pull quote: use `<strong class="red">` for the most damning patent language snippet.

All claims sourced to the patent record. Link to patent on first reference.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add patent claims section with quoted language"
```

---

### Task 4: Write Section 2 (What the cameras already do today)

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 2 (~350 words)**

Section heading: `## What the cameras already do`

Content:
- FreeForm AI product description (sourced to product page)
- Capability comparison table in markdown:

```
| Capability | Patent describes | FreeForm AI does today | Flock says publicly |
```

With rows for: plate capture, vehicle make/model/color, body type/clothing, height/weight estimation, gender classification, race/ethnicity classification, facial recognition data points, cross-camera person tracking.

SC tie-in: FreeForm AI is already active on SC cameras. The gap between "what they do today" and "what they patented" is a software update, not a hardware change. No new hardware needed. No new contract. No notification to the city that signed the deal.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add FreeForm AI capability table and gap analysis"
```

---

### Task 5: Write Section 3 (Flock's own words)

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 3 (~300 words)**

Section heading: `## Three positions from the same company`

Content:
- Position 1: Product page says "does not use facial recognition"
- Position 2: Patent describes facial recognition data points
- Position 3: Blog post describes facial recognition as a capability they have but "choose not to use"
- Frame these as three contradictory statements, not editorializing: just lay them out

SC tie-in: when a company holds three positions simultaneously, which one governs what happens to 422 million plate reads in SLED's database? Which one did your council vote on? (They didn't vote at all, per Greenville Contracts post.)

Pull quote: use `<strong class="red">` to highlight the three-position contradiction. Consider formatting as a short list with each position bolded.

Source each position to its URL. If the "Future of Investigations" blog URL is dead, use the attribution pattern from Task 1.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add Flock contradictory positions section"
```

---

### Task 6: Write Section 4 (Your contract doesn't protect you)

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 4 (~400 words)**

Section heading: `## Your contract doesn't protect you`

Content:
- Link to [Greenville Contracts post](/blog/greenville-flock-contracts) for full contract analysis. Don't repeat it.
- Pull two specific clauses:
  - Section 2.12: Flock can push "any upgrades to the system or platform that it deems necessary or useful" without asking
  - Section 4.5: perpetual, worldwide data rights that survive contract termination
- The upgrade clause means Flock can activate patented capabilities without council approval, without public notice, without renegotiating
- Greenville's contract is representative of Flock contracts statewide

SC tie-ins:
- Florence County cameras on private property (sourced to WPDE) have even less oversight than city contracts
- The Greenville sisters pulled over at gunpoint from a plate misread (link to Greenville post). The patent describes a system that classifies people by race. Misidentification + racial classification = compounded harm.
- Business Insider reporting on Flock misread rates (sourced). If the system misreads plates at unknown rates, its ability to accurately classify race is equally unknown.

Pull quote: use `<strong class="red">` for the unilateral upgrade clause language.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add contract vulnerability section with SC tie-ins"
```

---

### Task 7: Write Section 5 (Scale)

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 5 (~300 words)**

Section heading: `## 20 billion scans a month`

Content:
- Flock processes 20 billion plate scans monthly across its national network (sourced to ACLU)
- 100,000+ cameras in 49 states (sourced to ACLU)
- ACLU analysis: Flock uses AI to flag "suspicious" movement patterns for police review
- Norfolk federal case (Feb 2025): judge ruled extensive Flock use "may require warrants under Carpenter v. United States" (sourced to Consumer Rights Wiki)
- 500+ plate reads of a single vehicle in 4 months documented in Norfolk case

SC tie-in: SLED's database (422M reads, 3-year retention, 2,000+ users across 99+ agencies, sourced to Post and Courier) is exactly the kind of data lake where patent capabilities become most dangerous. Cross-camera tracking across 99+ agencies means the system the patent describes already has the infrastructure to operate in SC. Link to [4th Amendment post](/blog/the-4th-amendment-loophole) for full Carpenter analysis.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add scale and Carpenter analysis section"
```

---

### Task 8: Write Section 6 (What would stop this) and CTA

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Section 6 (~250 words)**

Section heading: `## What would stop this`

Content:
- H4675's AI vehicle tracking ban (Section 2 of the bill) would prohibit activation of patented capabilities
- It's the only pending SC bill that addresses what analysis Flock can run (not just how long data is retained)
- The other 3 bills regulate retention and access but don't touch classification capabilities
- Without H4675 or a local ordinance, there is no legal barrier between the patent and your cameras
- Link to [H4675 post](/blog/h4675-strongest-alpr-bill-in-sc) for full breakdown

**Step 2: Write CTA block (~150 words)**

Two asks, sequenced:

1. **Local ask:** Questions for your council. Format as a short numbered list:
   - Did you know your vendor patented racial classification?
   - Has anyone on council read Patent US11416545B1?
   - Does your contract allow Flock to push upgrades without council approval?

2. **State ask:** Support H4675. Link to H4675 post.

3. Standard CTA button block (copy from existing posts):

```html
<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#1a1a1a] px-8 py-8 text-center">
  <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#737373] mb-3">Take Action</p>
  <p class="text-[#a3a3a3] text-sm mb-5">Find your city council, county council, and state legislators.</p>
  <button type="button" data-open-action class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer">Find Your Rep</button>
</div>
```

**Step 3: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add legislation section and CTA"
```

---

### Task 9: Write FAQ section with JSON-LD schema

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write FAQ section**

Section heading: `## Frequently asked questions`

4 questions as h3 subheadings with short answers (~50 words each):

1. **Does Flock Safety use facial recognition?** — Patent describes it. Blog admitted capability. Product page denies it. Link to Section 3 of this post.
2. **Can Flock Safety cameras identify race or gender?** — Patent US11416545B1 explicitly describes classification by race and gender. Currently marketed as plate-only. Link to Section 1.
3. **What does Flock Safety's patent cover?** — Object-based video queries, human attribute classification (race, gender, height, weight, clothing), cross-camera tracking via statistical similarity. Link to patent.
4. **Can Flock activate new capabilities without city approval?** — Greenville's contract Section 2.12 allows unilateral upgrades. Link to Greenville post.

**Step 2: Add JSON-LD FAQ schema**

After the FAQ section, add an HTML block with the FAQPage schema:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does Flock Safety use facial recognition?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "..."
      }
    },
    ...
  ]
}
</script>
```

Mirror the FAQ text exactly in the schema answers. Keep answers concise for schema (2-3 sentences each).

**Step 3: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add FAQ section with JSON-LD schema"
```

---

### Task 10: Write Sources section

**Files:**
- Modify: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Write Sources section**

Section heading: `## Sources`

List every source cited in the post as a bullet with descriptive link text and date. Follow the exact format used in `greenville-flock-contracts.md`:

```markdown
- [Patent US11416545B1: System and method for object based query of video content (NCBI/PubChem)](URL)
- [Flock Safety: Are Flock Products Discriminatory? (blog)](URL)
- [Flock Safety: FreeForm Product Page](URL)
- [ACLU: Surveillance Company Flock Using AI to Report Suspicious Movement Patterns](URL)
...
```

Include all sources used in the post. Verify each URL one final time.

**Step 2: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: add sources section"
```

---

### Task 11: Voice and quality review

**Files:**
- Read: `src/content/blog/flock-safety-patent-racial-classification.md`

**Step 1: Read the complete post end to end**

Check for:
- Any em dashes (replace with commas, periods, colons, parentheses)
- Any banned phrases from voice-dna.md ("delve," "landscape," "it's worth noting," "This isn't X. This is Y." pattern, etc.)
- AI-sounding vocabulary ("pivotal," "tapestry," "underscore," etc.)
- Paragraphs longer than 3 sentences
- Missing contractions
- Missing or broken source links
- Consistent use of `<strong class="red">` for pull quotes (aim for 4-6 across the whole post)
- Word count in target range (2,500-3,000)

**Step 2: Fix any issues found**

Edit the file to fix voice violations, broken links, or structural problems.

**Step 3: Verify internal links**

Confirm these internal links are correct:
- `/blog/greenville-flock-contracts`
- `/blog/the-4th-amendment-loophole`
- `/blog/h4675-strongest-alpr-bill-in-sc`
- `/blog/sc-has-no-license-plate-camera-law`
- `/blog/how-to-fight-alpr-surveillance-sc`

**Step 4: Commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: voice and quality review pass"
```

---

### Task 12: Build verification

**Step 1: Run the Astro build**

```bash
node node_modules/astro/astro.js build
```

Expected: build succeeds with no errors. The new blog post should appear in the output.

**Step 2: If build fails, fix the issue**

Most likely causes: malformed frontmatter, unclosed HTML tags in the JSON-LD block, or broken markdown table syntax.

**Step 3: Start dev server and preview**

```bash
node node_modules/astro/astro.js dev --host 127.0.0.1
```

Navigate to the blog post. Verify:
- Post renders correctly
- Red callouts display in red
- Capability table renders properly
- FAQ section renders
- CTA button works (opens action modal)
- JSON-LD schema is present in page source
- Internal links resolve
- Source links are clickable

**Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build issues in patent blog post"
```

---

### Task 13: Featured image

**Files:**
- Create: `public/blog/flock-patent-racial-classification.png`

**Step 1: Generate or create featured image**

The post references `featuredImage: /blog/flock-patent-racial-classification.png` in frontmatter. This needs to exist for the blog preview card and OG meta.

Options:
- Use canvas-design skill to generate an image matching the site's dark aesthetic (`#171717` bg, `#dc2626` red accent)
- Or create a simple text-on-dark-bg image with the post title

The image should work at both blog card size (~600x340) and OG size (1200x630).

**Step 2: Verify image renders in blog list**

Check the blog index page to confirm the featured image loads and the alt text is correct.

**Step 3: Commit**

```bash
git add public/blog/flock-patent-racial-classification.png
git commit -m "add featured image for patent blog post"
```

---

### Task 14: Final review and publish decision

**Step 1: Re-read the entire post one more time**

Final check: does every factual claim have a source? Does every SC tie-in feel earned (not bolted on)? Does the post build a case that a council member couldn't dismiss?

**Step 2: Decide on draft status**

The post is currently `draft: true`. If the user wants to publish immediately, change to `draft: false`. Otherwise leave as draft for review.

**Step 3: Final commit**

```bash
git add src/content/blog/flock-safety-patent-racial-classification.md
git commit -m "draft: patent blog post ready for review"
```
