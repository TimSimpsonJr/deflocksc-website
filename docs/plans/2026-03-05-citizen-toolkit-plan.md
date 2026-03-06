# Citizen Toolkit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/toolkit` page with tabbed interface containing FOIA templates, council meeting prep, community outreach materials (including printable business cards), and legal context — all using SC-specific research.

**Architecture:** New Astro page at `src/pages/toolkit.astro` with a `ToolkitTabs` component for client-side tab switching (URL hash deep-linking). Content stored in JSON data files following existing `src/data/` conventions. PDFs and card images as static assets in `public/toolkit/`. Reuses existing styling patterns (section glows, glow-frame cards, FAQ accordion, dark theme color tokens).

**Tech Stack:** Astro 5, Tailwind CSS 4, vanilla JS (tabs + clipboard), satori/sharp for business card image generation (already in deps), existing Inter font.

**Design doc:** `docs/plans/2026-03-05-citizen-toolkit-design.md`

**Content source:** Talking Points note at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Talking Points\Talking Points.md` plus research vault at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\`

---

## Phase 1: Research Cross-Reference

### Task 1: Cross-reference linked toolkit with existing research

**Files:**
- Read (external): `https://github.com/DeflockYourCity/flock-alpr-toolkit` (already reviewed in design phase)
- Read: Obsidian vault research notes (see paths below)
- Create: `docs/research/toolkit-gap-analysis.md`

**Step 1: Read the linked toolkit's topic list**

The DeflockYourCity toolkit covers these topics (from design phase research):
- 22+ CVE security vulnerabilities
- Camera hackability (30-second physical access)
- Contract term changes and data ownership
- Federal agency access incidents
- Patent-documented capabilities (racial/gender classification)
- City contract terminations

**Step 2: Check our research vault for each topic**

Read these vault files to identify gaps:
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\Federal Data Access.md`
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\Flock Safety.md`
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\Commercial ALPR Data Uses.md`
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\Debunking Point-in-Time.md`
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\SC ALPR Legislation.md`
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Research\_Campaign Index.md`

Also read the Talking Points note for existing messaging:
- `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\Talking Points\Talking Points.md`

**Step 3: Write gap analysis**

Create `docs/research/toolkit-gap-analysis.md` documenting:
- Topics we already cover well (with vault file references)
- Topics from the linked toolkit we're missing or undercover
- Topics where we have stronger SC-specific data than the linked toolkit
- Recommendations for what to include in each toolkit tab

**Step 4: Commit**

```bash
git add docs/research/toolkit-gap-analysis.md
git commit -m "docs: cross-reference DeflockYourCity toolkit with SC research"
```

---

## Phase 2: Data Files

### Task 2: Create FOIA template data

**Files:**
- Create: `src/data/toolkit-foia.json`

**Step 1: Research SC FOIA specifics**

SC Freedom of Information Act: S.C. Code § 30-4-10 et seq.
- Any person can request records from any public body
- 15 business days to respond (can extend 10 more with written notice)
- Fees: actual cost of reproduction; can't charge search time for first 2 hours
- Appeals: circuit court within 15 days of denial
- Exemptions: law enforcement records may be partially exempt under § 30-4-40(a)(3)

**Step 2: Write the JSON data file**

Create `src/data/toolkit-foia.json` with this structure:

```json
[
  {
    "id": "flock-contract",
    "title": "Request Flock Safety Contract & Costs",
    "description": "Get the full text of your agency's Flock Safety contract, including renewal terms, total annual cost, and how it's funded.",
    "why": "Many SC agencies funded Flock cameras through civil asset forfeiture or federal grants, bypassing normal council appropriations. This request reveals the financial arrangement.",
    "template": "Dear [AGENCY RECORDS CUSTODIAN],\n\nPursuant to the South Carolina Freedom of Information Act (S.C. Code § 30-4-10 et seq.), I request copies of the following records:\n\n1. The complete contract between [AGENCY NAME] and Flock Safety, Inc., including all amendments, addenda, and renewal terms\n2. All invoices and payment records related to Flock Safety services for the past three fiscal years\n3. The funding source(s) used to pay for Flock Safety services (general fund, federal grants, civil asset forfeiture, or other)\n4. Any council or commission votes authorizing the Flock Safety contract or its renewal\n\nI request these records in electronic format where available. Per § 30-4-30(c), I ask that you notify me of any fees before processing.\n\nThank you for your prompt attention to this request.\n\nSincerely,\n[YOUR NAME]\n[YOUR ADDRESS]\n[YOUR EMAIL]\n[DATE]",
    "placeholders": ["AGENCY RECORDS CUSTODIAN", "AGENCY NAME", "YOUR NAME", "YOUR ADDRESS", "YOUR EMAIL", "DATE"]
  },
  {
    "id": "data-retention",
    "title": "Request Data Retention & Access Policies",
    "description": "Find out how long your plate data is stored, who can access it, and whether audit logs exist.",
    "why": "Flock claims 30-day local retention, but SLED keeps SC plate data for 3 years. This request reveals the full data lifecycle and who has queried your community's records.",
    "template": "Dear [AGENCY RECORDS CUSTODIAN],\n\nPursuant to the South Carolina Freedom of Information Act (S.C. Code § 30-4-10 et seq.), I request copies of the following records:\n\n1. All policies governing the retention, access, and deletion of data collected by automated license plate reader (ALPR) cameras operated by or on behalf of [AGENCY NAME]\n2. The data retention period for ALPR data held locally by [AGENCY NAME]\n3. Records of any data-sharing agreements between [AGENCY NAME] and SLED's ALPR database, including the retention period applied by SLED\n4. Any audit logs showing which agencies or individuals have queried [AGENCY NAME]'s ALPR data in the past 12 months\n5. Any policies governing how officers may search or access ALPR data, including whether supervisory approval is required\n\nI request these records in electronic format where available. Per § 30-4-30(c), I ask that you notify me of any fees before processing.\n\nSincerely,\n[YOUR NAME]\n[YOUR ADDRESS]\n[YOUR EMAIL]\n[DATE]",
    "placeholders": ["AGENCY RECORDS CUSTODIAN", "AGENCY NAME", "YOUR NAME", "YOUR ADDRESS", "YOUR EMAIL", "DATE"]
  },
  {
    "id": "camera-locations",
    "title": "Request Camera Locations & Deployment Scope",
    "description": "Learn where cameras are deployed, how many exist, and whether expansion is planned.",
    "why": "Greenville PD refuses to publicly reveal camera locations. SCDOT discovered 200+ unpermitted Flock cameras on SC roads in 2024. This request establishes the scope of surveillance in your area.",
    "template": "Dear [AGENCY RECORDS CUSTODIAN],\n\nPursuant to the South Carolina Freedom of Information Act (S.C. Code § 30-4-10 et seq.), I request copies of the following records:\n\n1. The total number of automated license plate reader (ALPR) cameras currently operated by or on behalf of [AGENCY NAME]\n2. The locations (street addresses or intersections) of all ALPR cameras operated by or on behalf of [AGENCY NAME]\n3. Any permits obtained from SCDOT or other agencies for ALPR camera installation on public roadways\n4. Any plans, proposals, or budget requests for expanding the ALPR camera network\n5. Records of any cameras installed and subsequently removed, including the reason for removal\n\nI request these records in electronic format where available. Per § 30-4-30(c), I ask that you notify me of any fees before processing.\n\nSincerely,\n[YOUR NAME]\n[YOUR ADDRESS]\n[YOUR EMAIL]\n[DATE]",
    "placeholders": ["AGENCY RECORDS CUSTODIAN", "AGENCY NAME", "YOUR NAME", "YOUR ADDRESS", "YOUR EMAIL", "DATE"]
  },
  {
    "id": "federal-sharing",
    "title": "Request Federal Data Sharing Agreements",
    "description": "Determine whether your agency shares plate data with ICE, CBP, or other federal agencies.",
    "why": "Flock secretly gave Border Patrol access to local police cameras nationwide without telling agencies. Researchers documented federal access through 'back doors' that agencies never authorized. This request reveals whether your community's data reaches federal hands.",
    "template": "Dear [AGENCY RECORDS CUSTODIAN],\n\nPursuant to the South Carolina Freedom of Information Act (S.C. Code § 30-4-10 et seq.), I request copies of the following records:\n\n1. Any memoranda of understanding (MOUs), data-sharing agreements, or contracts between [AGENCY NAME] and any federal agency (including but not limited to ICE, CBP, DHS, DEA, FBI, ATF, or U.S. Marshals Service) related to automated license plate reader (ALPR) data\n2. Records of any federal agency queries or searches of [AGENCY NAME]'s ALPR data in the past 24 months\n3. Any correspondence between [AGENCY NAME] and Flock Safety, Inc. regarding federal agency access to ALPR data, including any notifications about Flock's federal partnership programs\n4. [AGENCY NAME]'s policy on sharing ALPR data with agencies outside of South Carolina\n5. Any records of [AGENCY NAME]'s participation in regional or national ALPR data-sharing networks\n\nI request these records in electronic format where available. Per § 30-4-30(c), I ask that you notify me of any fees before processing.\n\nSincerely,\n[YOUR NAME]\n[YOUR ADDRESS]\n[YOUR EMAIL]\n[DATE]",
    "placeholders": ["AGENCY RECORDS CUSTODIAN", "AGENCY NAME", "YOUR NAME", "YOUR ADDRESS", "YOUR EMAIL", "DATE"]
  }
]
```

**Step 3: Commit**

```bash
git add src/data/toolkit-foia.json
git commit -m "feat: add FOIA request template data"
```

### Task 3: Create speaking/council meeting data

**Files:**
- Create: `src/data/toolkit-speaking.json`

**Step 1: Write the JSON data file**

Draw the talk track and rebuttals from the Talking Points note. The talk track should be a 3-minute scripted comment (~400 words) using the SC-specific angles: Greenville sisters lawsuit, SLED database (422M reads, 3-year retention), SCDOT unpermitted cameras, the bipartisan support angle (Rep. Smith R + Rep. Rutherford D), and the ask (moratorium pending oversight ordinance).

The rebuttals come directly from the FAQ/Counterarguments table in the Talking Points note, adapted for spoken delivery.

Structure:

```json
{
  "intro": "How public comment works in SC...",
  "tips": ["Sign up early...", "Bring copies...", "Stay under 3 minutes..."],
  "talkTrack": {
    "title": "3-Minute Public Comment",
    "sections": [
      { "label": "Open", "text": "...", "timing": "30 sec" },
      { "label": "The Problem", "text": "...", "timing": "60 sec" },
      { "label": "Local Impact", "text": "...", "timing": "60 sec" },
      { "label": "The Ask", "text": "...", "timing": "30 sec" }
    ]
  },
  "rebuttals": [
    {
      "claim": "It only catches criminals",
      "response": "99% of plates scanned belong to people suspected of nothing..."
    }
  ]
}
```

Write all content from scratch using the Talking Points as source material. Keep the voice direct, factual, conversational. No AI-sounding language.

**Step 2: Commit**

```bash
git add src/data/toolkit-speaking.json
git commit -m "feat: add council meeting talk track and rebuttals data"
```

### Task 4: Create outreach data

**Files:**
- Create: `src/data/toolkit-outreach.json`

**Step 1: Write the JSON data file**

Structure:

```json
{
  "onePager": {
    "title": "What's Happening with Surveillance Cameras in SC?",
    "sections": [
      { "heading": "What are ALPRs?", "text": "..." },
      { "heading": "How big is the problem?", "text": "..." },
      { "heading": "Why should I care?", "text": "..." },
      { "heading": "What can I do?", "text": "..." }
    ]
  },
  "conversationStarters": [
    {
      "audience": "Neighbors",
      "opener": "Did you know there are 1,000+ cameras scanning every car in SC?",
      "followUp": "..."
    },
    {
      "audience": "Parents",
      "opener": "Your kids' school may have cameras feeding data to federal agencies",
      "followUp": "..."
    },
    {
      "audience": "Small-government conservatives",
      "opener": "Your local PD spent $22K on surveillance cameras without council approval",
      "followUp": "..."
    },
    {
      "audience": "General",
      "opener": "Your license plate was probably scanned today",
      "followUp": "..."
    }
  ],
  "businessCards": [
    {
      "id": "1984",
      "headline": "In 1984, the Thought Police weren't looking for criminals. Neither is Flock Safety.",
      "subtext": "deflocksc.org",
      "style": "fact"
    },
    {
      "id": "city-council",
      "headline": "Your city council signed a contract that hands your movement data to the federal government — with no local veto.",
      "subtext": "deflocksc.org",
      "style": "question"
    },
    {
      "id": "surveillance",
      "headline": "Surveillance doesn't equal safety.",
      "subtext": "deflocksc.org",
      "style": "cta"
    },
    {
      "id": "1000-eyes",
      "headline": "1,000 eyes on every SC road.",
      "subtext": "deflocksc.org",
      "style": "graphic",
      "graphic": "/toolkit/outreach/eye-graphic.png"
    }
  ]
}
```

Write all content from scratch using Talking Points as source.

**Step 2: Commit**

```bash
git add src/data/toolkit-outreach.json
git commit -m "feat: add outreach and business card data"
```

### Task 5: Create legal landscape data

**Files:**
- Create: `src/data/toolkit-legal.json`

**Step 1: Write the JSON data file**

Draw from `SC ALPR Legislation.md` in the research vault and the Talking Points note.

Structure:

```json
{
  "fourthAmendment": {
    "title": "Your 4th Amendment Rights",
    "intro": "...",
    "keyPoints": [
      { "point": "Carpenter v. United States (2018)", "detail": "..." },
      { "point": "The mosaic theory", "detail": "..." },
      { "point": "IJ v. City of Norfolk", "detail": "..." }
    ],
    "disclaimer": "This is not legal advice..."
  },
  "otherStates": [
    { "state": "Virginia", "law": "Law enforcement-only access, 7-day retention" },
    { "state": "Montana", "law": "Outright ban on ALPR data sharing" },
    { "state": "Utah", "law": "Strict retention limits" },
    { "state": "Maine", "law": "21-day retention, civilian oversight required" },
    { "state": "South Carolina", "law": "No ALPR-specific law. No retention limits. No access restrictions." }
  ],
  "billGaps": [
    {
      "gap": "No restrictions on federal agency access",
      "detail": "..."
    },
    {
      "gap": "No prohibition on immigration enforcement use",
      "detail": "..."
    },
    {
      "gap": "No limits on Flock's national data-sharing network",
      "detail": "..."
    },
    {
      "gap": "No disclosure requirements for vendor data agreements",
      "detail": "..."
    }
  ]
}
```

**Step 2: Commit**

```bash
git add src/data/toolkit-legal.json
git commit -m "feat: add legal landscape and bill gaps data"
```

---

## Phase 3: Page and Components

### Task 6: Create the toolkit page shell

**Files:**
- Create: `src/pages/toolkit.astro`

**Step 1: Create the page**

```astro
---
import Base from '../layouts/Base.astro';
import ToolkitTabs from '../components/ToolkitTabs.astro';
---

<Base title="Citizen Toolkit — DeflockSC" description="FOIA templates, council meeting prep, outreach materials, and legal resources for South Carolina residents concerned about mass surveillance.">
  <section class="bg-[#171717] pt-28 pb-12 relative overflow-hidden">
    <div class="section-glow absolute -top-24 left-1/2 -translate-x-1/2 w-[min(800px,90vw)] h-[300px] blur-[64px] opacity-[0.15] pointer-events-none" aria-hidden="true"></div>
    <div class="max-w-4xl mx-auto px-6 relative z-10">
      <h1 class="text-white font-extrabold text-3xl md:text-5xl tracking-[-0.02em] mb-4">
        Citizen Toolkit
      </h1>
      <p class="text-[#a3a3a3] text-lg max-w-2xl">
        Everything you need to push back against mass surveillance in South Carolina. File records requests, speak at council meetings, or spread the word in your community.
      </p>
    </div>
  </section>

  <ToolkitTabs />
</Base>
```

**Step 2: Commit**

```bash
git add src/pages/toolkit.astro
git commit -m "feat: add toolkit page shell"
```

### Task 7: Create the ToolkitTabs component

**Files:**
- Create: `src/components/ToolkitTabs.astro`

**Step 1: Build the tabbed interface**

The tabs component handles:
- Tab bar with 4 tabs (horizontal scroll on mobile)
- URL hash sync (`#request-records`, `#speak-up`, `#spread-the-word`, `#know-your-rights`)
- Active tab styling (amber underline/highlight)
- Panel visibility toggling
- Default to first tab, or hash-specified tab on load

Use `role="tablist"`, `role="tab"`, `role="tabpanel"` ARIA pattern. Tabs are `<button>` elements. Panels have `aria-labelledby` pointing to their tab. Arrow key navigation between tabs.

Each tab panel imports and renders its own sub-component:
- `ToolkitFoia.astro` for Request Records
- `ToolkitSpeaking.astro` for Speak Up
- `ToolkitOutreach.astro` for Spread the Word
- `ToolkitLegal.astro` for Know Your Rights

Style the tab bar:
- Sticky below the page header
- Dark background (`bg-[#1a1a1a]`) with bottom border
- Active tab: amber text (`text-[#fbbf24]`) + amber bottom border
- Inactive: `text-[#a3a3a3]` + hover `text-white`
- Font: `text-sm font-bold uppercase tracking-[0.05em]`
- Mobile: horizontal scroll with `-webkit-overflow-scrolling: touch`, no scrollbar

**Step 2: Commit**

```bash
git add src/components/ToolkitTabs.astro
git commit -m "feat: add tabbed interface component"
```

### Task 8: Build the FOIA tab (Request Records)

**Files:**
- Create: `src/components/ToolkitFoia.astro`

**Step 1: Build the component**

Import `toolkit-foia.json`. Render:
- Intro section: brief FOIA explainer (SC Code § 30-4-10, 15-day response, who can file)
- Card grid: 1 column on mobile, 2 on desktop (`grid md:grid-cols-2 gap-6`)
- Each card uses the glow-frame or bill-card styling pattern:
  - Title (white, bold)
  - Description (gray, `text-[#a3a3a3]`)
  - "Why this matters" expandable section (use `<details>` accordion pattern from FAQ)
  - "Copy Template" button
  - "Download PDF" link
- Filing instructions section at bottom

**Copy to clipboard implementation:**

```html
<button class="copy-btn" data-template-id="flock-contract">
  <span class="copy-label">Copy Template</span>
  <span class="copy-success hidden">Copied!</span>
</button>
```

```js
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.dataset.templateId;
    const template = btn.closest('.template-card').querySelector('.template-text').textContent;
    try {
      await navigator.clipboard.writeText(template);
      btn.querySelector('.copy-label').classList.add('hidden');
      btn.querySelector('.copy-success').classList.remove('hidden');
      setTimeout(() => {
        btn.querySelector('.copy-label').classList.remove('hidden');
        btn.querySelector('.copy-success').classList.add('hidden');
      }, 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = template;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  });
});
```

The template text is rendered in a `<pre>` or styled `<div>` with `whitespace-pre-wrap`, visible but styled as a code/letter block. The `[PLACEHOLDER]` fields should be visually highlighted (amber text or amber background).

**Step 2: Commit**

```bash
git add src/components/ToolkitFoia.astro
git commit -m "feat: build FOIA templates tab with copy-to-clipboard"
```

### Task 9: Build the Speaking tab (Speak Up)

**Files:**
- Create: `src/components/ToolkitSpeaking.astro`

**Step 1: Build the component**

Import `toolkit-speaking.json`. Render:
- Intro with tips (bulleted list)
- Talk track: styled as a "script card" with timing labels on each section. Use a distinctive visual treatment — maybe a left amber border to distinguish from the rebuttal cards. Each section shows its timing badge (`30 sec`, `60 sec`).
- Rebuttals: use the `<details>` accordion pattern from FAQ. Claim as the summary, response as the expanded content. Red left border when open (same as FAQ).
- Council handout: download link for PDF (placeholder initially, PDF created in Phase 4)

**Step 2: Commit**

```bash
git add src/components/ToolkitSpeaking.astro
git commit -m "feat: build council meeting prep tab"
```

### Task 10: Build the Outreach tab (Spread the Word)

**Files:**
- Create: `src/components/ToolkitOutreach.astro`

**Step 1: Build the component**

Import `toolkit-outreach.json`. Render:
- One-pager section: rendered on-page + download links (copy + PDF)
- Conversation starters: card grid with audience label badge and opener text. Each card has a "Read more" expandable with follow-up talking points.
- Business cards section:
  - Preview images of all 3 designs (PNG thumbnails)
  - Download buttons for each: "Download Card (PNG)" and "Download Print Sheet (PDF)"
  - Brief instructions: "Print on Avery 8371 cardstock or any 3.5×2 inch business card paper"
- Share links: pre-formatted buttons for Twitter/X, Facebook, email with suggested copy

**Step 2: Commit**

```bash
git add src/components/ToolkitOutreach.astro
git commit -m "feat: build outreach and business cards tab"
```

### Task 11: Build the Legal tab (Know Your Rights)

**Files:**
- Create: `src/components/ToolkitLegal.astro`

**Step 1: Build the component**

Import `toolkit-legal.json` and `bills.json`. Render:
- 4th Amendment primer: styled as a prominent info block with key points
- SC Bill Tracker (compact): simple list with status badges reusing BillTracker's badge styling (`text-[#fbbf24] font-bold text-[0.7rem] uppercase bg-[rgba(251,191,36,0.1)] px-3 py-1 rounded`)
- Legal landscape: comparison table or card list showing other states vs. SC
- Bill gaps: styled as a "What's missing" section with red accent. Each gap as a card with the gap title and supporting detail.
- Disclaimer at bottom: "This is not legal advice..."

**Step 2: Commit**

```bash
git add src/components/ToolkitLegal.astro
git commit -m "feat: build legal landscape tab"
```

---

## Phase 4: Navigation and Homepage Integration

### Task 12: Add Toolkit link to Nav

**Files:**
- Modify: `src/components/Nav.astro`

**Step 1: Add link**

Add a "Toolkit" text link to the nav, positioned before the "Take Action" button:

```astro
<a href="/toolkit" class="text-[#a3a3a3] hover:text-white font-bold text-xs uppercase tracking-[0.1em] transition-colors">Toolkit</a>
```

This sits between the logo and the Take Action button. On mobile, keep it visible (it's just one small text link).

**Step 2: Verify nav looks right**

Start dev server, check both mobile and desktop. The nav should show: `DeflockSC [logo] ... Toolkit [link] Take Action [red button]`.

**Step 3: Commit**

```bash
git add src/components/Nav.astro
git commit -m "feat: add Toolkit link to nav"
```

### Task 13: Add homepage teaser

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: Add a teaser CTA**

After the BillTracker section, before FAQ, add a brief CTA block linking to `/toolkit`:

```astro
<section class="bg-[#171717] py-12">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <p class="text-[#a3a3a3] text-base mb-4">Ready to take the next step?</p>
    <a href="/toolkit" class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.1em] px-6 py-3 rounded transition-colors">
      Open the Citizen Toolkit
    </a>
  </div>
</section>
```

Keep it minimal — don't add a full section with heading and glow. Just a nudge between BillTracker and FAQ.

**Step 2: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add toolkit teaser CTA to homepage"
```

---

## Phase 5: Static Assets (PDFs and Business Cards)

### Task 14: Generate FOIA template PDFs

**Files:**
- Create: `public/toolkit/foia/flock-contract.pdf`
- Create: `public/toolkit/foia/data-retention.pdf`
- Create: `public/toolkit/foia/camera-locations.pdf`
- Create: `public/toolkit/foia/federal-sharing.pdf`

**Step 1: Create a PDF generation script**

Create `scripts/generate-toolkit-pdfs.js` that reads `src/data/toolkit-foia.json` and generates styled PDFs using `satori` (already in deps) + `sharp` for rasterization. Each PDF should:
- Use dark theme matching the site (or a clean print-friendly light theme — light theme is better for printing)
- Include the template text with placeholder fields highlighted
- Include a header with "DeflockSC.org — Citizen Toolkit" and the template title
- Include filing instructions at the bottom
- Letter size (8.5" x 11")

Alternative approach if satori PDF generation proves complex: generate simple HTML → PDF using a minimal approach, or create the PDFs as pre-formatted text files that users can print. The key constraint is NO external dependencies beyond what's already in `package.json`.

**Step 2: Run the script and verify PDFs**

```bash
node scripts/generate-toolkit-pdfs.js
```

Check each PDF opens correctly and is readable.

**Step 3: Commit**

```bash
git add scripts/generate-toolkit-pdfs.js public/toolkit/foia/
git commit -m "feat: generate FOIA template PDFs"
```

### Task 15: Generate council handout PDF

**Files:**
- Create: `public/toolkit/speaking/council-handout.pdf`

**Step 1: Generate the handout**

One-page PDF with:
- Header: "License Plate Surveillance in South Carolina"
- 3-4 key facts with sources
- "The 3 Asks" section (moratorium, oversight ordinance, data audit)
- Footer: deflocksc.org
- Print-friendly layout (light background or clean dark that prints well)

Use the same generation script or extend it.

**Step 2: Commit**

```bash
git add public/toolkit/speaking/
git commit -m "feat: generate council meeting handout PDF"
```

### Task 16: Generate business card images and print sheets

**Files:**
- Create: `public/toolkit/outreach/card-1984.png`
- Create: `public/toolkit/outreach/card-city-council.png`
- Create: `public/toolkit/outreach/card-surveillance.png`
- Create: `public/toolkit/outreach/card-1000-eyes.png`
- Create: `public/toolkit/outreach/cards-1984-print.pdf`
- Create: `public/toolkit/outreach/cards-city-council-print.pdf`
- Create: `public/toolkit/outreach/cards-surveillance-print.pdf`
- Create: `public/toolkit/outreach/cards-1000-eyes-print.pdf`
- Existing: `public/toolkit/outreach/eye-graphic.png` (already in repo)

**Step 1: Generate card images**

Use `satori` to render each card design as SVG, then `sharp` to convert to PNG. Each card:
- 3.5" x 2" (1050px x 600px at 300dpi, or 700px x 400px for web preview)
- Dark background (#171717) with white text
- QR code pointing to deflocksc.org (generate with a lightweight QR library or use a pre-made QR image)
- Card 1: "In 1984, the Thought Police weren't looking for criminals. Neither is Flock Safety." + QR + deflocksc.org
- Card 2: "Your city council signed a contract that hands your movement data to the federal government — with no local veto." + QR + deflocksc.org
- Card 3: "Surveillance doesn't equal safety." + QR + deflocksc.org
- Card 4: **"1,000 Eyes"** — Visual-forward design. Features the eye graphic (`public/toolkit/outreach/eye-graphic.png`) as the dominant element. Headline: "1,000 eyes on every SC road." The eye graphic is a stylized surveillance eye with red concentric circles on a dark iris — it should sit prominently (roughly 40-50% of card area) with the headline text below or alongside. QR + deflocksc.org. This card leads with the visual, text is secondary.

For QR generation: use `qrcode` npm package (add as dev dependency) or generate a static QR code image manually.

**Step 2: Generate Avery 8371 print sheets**

Layout: 10 cards per letter page (2 columns x 5 rows). Avery 8371 specs:
- Page: 8.5" x 11"
- Card: 3.5" x 2"
- Top/bottom margin: 0.5"
- Left/right margin: 0.75"
- No gap between cards

Generate as PDF. One design per sheet, 4 sheets total.

**Step 3: Create generation script**

Create `scripts/generate-business-cards.js` that handles both card PNGs and print sheets. For the "1000 Eyes" card, the script reads `public/toolkit/outreach/eye-graphic.png` and composites it into the card layout using `sharp`.

**Step 4: Commit**

```bash
git add scripts/generate-business-cards.js public/toolkit/outreach/
git commit -m "feat: generate business card images and print sheets"
```

### Task 17: Generate one-pager PDF

**Files:**
- Create: `public/toolkit/outreach/one-pager.pdf`

**Step 1: Generate the one-pager**

One-page PDF with the "What's Happening with Surveillance Cameras in SC?" content. Print-friendly layout. Include:
- 4 sections from toolkit-outreach.json onePager data
- Key stats highlighted
- Footer with deflocksc.org and QR code

**Step 2: Commit**

```bash
git add public/toolkit/outreach/one-pager.pdf
git commit -m "feat: generate community one-pager PDF"
```

---

## Phase 6: Visual Verification and Polish

### Task 18: Start dev server and verify all tabs

**Step 1: Start the dev server**

Use `preview_start` with the `dev` config from `.claude/launch.json`.

**Step 2: Navigate to /toolkit and verify each tab**

Check:
- [ ] Page loads with correct title and intro
- [ ] Tab bar renders all 4 tabs
- [ ] Each tab switches correctly
- [ ] URL hash updates on tab click
- [ ] Direct navigation to `/toolkit#speak-up` loads correct tab
- [ ] Tab keyboard navigation (arrow keys) works
- [ ] ARIA attributes are correct

**Step 3: Verify Request Records tab**

- [ ] All 4 FOIA template cards render
- [ ] Copy button works (copies template text to clipboard)
- [ ] "Copied!" feedback appears and resets
- [ ] PDF download links work
- [ ] Placeholder fields are visually highlighted
- [ ] Filing instructions section renders

**Step 4: Verify Speak Up tab**

- [ ] Talk track renders with timing labels
- [ ] Rebuttal accordions open/close smoothly
- [ ] Council handout download link works

**Step 5: Verify Spread the Word tab**

- [ ] One-pager content renders
- [ ] Conversation starters display correctly
- [ ] Business card previews show
- [ ] Download links work for PNGs and print sheets

**Step 6: Verify Know Your Rights tab**

- [ ] 4th Amendment section renders
- [ ] Bill status badges show correctly (reusing BillTracker style)
- [ ] Legal landscape comparison renders
- [ ] Bill gaps section renders

**Step 7: Check responsive layout**

Use `preview_resize` to test mobile (375px) and tablet (768px). Verify:
- [ ] Tab bar scrolls horizontally on mobile
- [ ] Cards stack to single column on mobile
- [ ] Template text is readable on small screens
- [ ] No horizontal overflow

### Task 19: Verify nav and homepage integration

**Step 1: Check homepage**

- [ ] Toolkit teaser CTA appears between BillTracker and FAQ
- [ ] Link navigates to /toolkit

**Step 2: Check nav**

- [ ] "Toolkit" link appears in nav
- [ ] Link works from both homepage and toolkit page
- [ ] Nav solid background works on toolkit page (scroll behavior)

### Task 20: Content review pass

**Step 1: Review all written content**

Read through every piece of content on the toolkit page. Check:
- [ ] No AI-sounding language (no "delve", "tapestry", "pivotal", "comprehensive", etc.)
- [ ] All factual claims have sources in the Talking Points note or research vault
- [ ] FOIA templates cite correct SC Code sections
- [ ] Talk track stays under 3 minutes when read aloud (~400 words)
- [ ] Bipartisan framing throughout (not left-leaning or right-leaning)
- [ ] No em dashes (use regular dashes or rewrite)

**Step 2: Fix any issues found**

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: content review polish pass"
```

---

## Phase 7: Build Verification and Final Commit

### Task 21: Run production build

**Step 1: Build**

```bash
npm run build
```

Expected: clean build with no errors. Check for:
- No TypeScript errors
- No missing imports
- All static assets copied to `dist/`
- `/toolkit` page generated

**Step 2: Fix any build errors**

**Step 3: Run data validation**

```bash
python scripts/validate-data.py
```

Check that new JSON files pass validation (may need to update the validator to include new files).

### Task 22: Final commit and push

**Step 1: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: complete citizen toolkit with FOIA templates, council prep, outreach, and legal resources

Closes #8, closes #39"
```

**Step 2: Push the branch**

```bash
git push -u origin feature/citizen-toolkit
```

---

## Reference: Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Dark bg | `#171717` | Primary section background |
| Alt bg | `#1a1a1a` | Alternate sections, tab bar |
| Card bg | `#262626` | Card backgrounds |
| Frame bg | `rgba(163,163,163,0.12)` | Glow frame, template cards |
| White | `#ffffff` | Headlines |
| Light gray | `#d4d4d4` | Body text, lead text |
| Mid gray | `#a3a3a3` | Secondary text, descriptions |
| Dark gray | `#737373` | Metadata, labels |
| Red | `#dc2626` / `#ef4444` | CTA buttons, accents, borders |
| Amber | `#fbbf24` | Active tab, status badges, links |

## Reference: File Tree (New Files)

```
src/
  pages/
    toolkit.astro                    (page shell)
  components/
    ToolkitTabs.astro               (tab container + switching)
    ToolkitFoia.astro               (Request Records tab)
    ToolkitSpeaking.astro           (Speak Up tab)
    ToolkitOutreach.astro           (Spread the Word tab)
    ToolkitLegal.astro              (Know Your Rights tab)
  data/
    toolkit-foia.json               (FOIA templates)
    toolkit-speaking.json           (talk track + rebuttals)
    toolkit-outreach.json           (one-pager + cards + starters)
    toolkit-legal.json              (legal landscape + gaps)
public/
  toolkit/
    foia/
      flock-contract.pdf
      data-retention.pdf
      camera-locations.pdf
      federal-sharing.pdf
    speaking/
      council-handout.pdf
    outreach/
      eye-graphic.png                 (source art for 1000 Eyes card)
      card-1984.png
      card-city-council.png
      card-surveillance.png
      card-1000-eyes.png
      cards-1984-print.pdf
      cards-city-council-print.pdf
      cards-surveillance-print.pdf
      cards-1000-eyes-print.pdf
      one-pager.pdf
scripts/
  generate-toolkit-pdfs.js          (FOIA + handout + one-pager PDFs)
  generate-business-cards.js        (card PNGs + Avery print sheets)
docs/
  research/
    toolkit-gap-analysis.md
```
