# Map + Toolkit Bento Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle MapSection with a cinematic 2-col layout + ghost number, and add a new CitizenToolkit bento grid section to the homepage between BillTracker and FAQ.

**Architecture:** Two isolated Astro component changes. MapSection.astro gets a structural overhaul (same copy, new layout). CitizenToolkit.astro is a new component inserted into index.astro. No JS changes required for either — both are pure HTML/CSS. Minor cleanup for toolkit.astro and Footer.astro.

**Tech Stack:** Astro 5, Tailwind CSS 4 (arbitrary values), Inter + DM Mono fonts, existing design tokens (`#dc2626`, `#0d0d0d`, `#161616`, `rgba(255,255,255,0.07)`)

**Reference mockup:** `public/mockups-map-toolkit.html` — Map Option B and Bento Option A. Open at `localhost:4321/mockups-map-toolkit.html` while working.

---

## Task 1: Restyle MapSection.astro

**Files:**
- Modify: `src/components/MapSection.astro`

The map embed, MapLibre scripts, glow-frame CSS, and mobile toggle logic are all unchanged. Only the outer section structure and the copy/heading layout change.

### Step 1: Read the current file

```bash
# In editor, open src/components/MapSection.astro
# Note: lines 1-70 are the HTML, lines 72-330 are styles + scripts
# DO NOT touch anything below the closing </section> tag
```

### Step 2: Replace the section HTML (lines 1–70 only)

Replace everything from `<section` through `</section>` (before `<style>`) with:

```astro
<section id="map-section" aria-labelledby="map-section-heading" class="bg-[#0d0d0d] relative overflow-hidden">

  <!-- Ghost "242" background number -->
  <div class="absolute top-[-20px] right-[-40px] font-black leading-none pointer-events-none select-none z-0"
       style="font-size:clamp(12rem,22vw,22rem);color:rgba(220,38,38,0.05);letter-spacing:-0.06em;"
       aria-hidden="true">242</div>

  <!-- Two-column header: copy left, stats right -->
  <div class="md:grid md:grid-cols-[1fr_240px] relative z-10 border-b border-[rgba(255,255,255,0.07)]">

    <!-- Left: heading + copy -->
    <div class="px-6 md:px-16 py-16 md:py-20 md:border-r md:border-[rgba(255,255,255,0.07)]">
      <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555] mb-6">Upstate SC / Camera Network</p>
      <h2 id="map-section-heading" class="font-black leading-none tracking-[-0.035em] mb-8"
          style="font-size:clamp(2rem,3.5vw,3rem);">
        Cameras are<br>already watching.
        <span class="block" style="color:rgba(232,232,232,0.2);">No rules attached.</span>
      </h2>

      <div class="space-y-5 text-[13px] text-[#888] leading-[1.75] max-w-[520px]">
        <p>
          <strong class="text-[#e8e8e8]">Flock Safety cameras are up across Upstate SC:</strong> Greenville, Spartanburg, Anderson, and surrounding areas.
        </p>
        <p>
          <strong class="text-[#e8e8e8]">Greenville:</strong> Greenville PD runs 57 Flock cameras. The first batch went up in January 2021, paid for with federal civil asset forfeiture funds. No city ordinance. No council vote on oversight. There are still no rules about who sees the data, how long it's kept, or who checks how it's used.
        </p>
        <p>
          <strong class="text-[#e8e8e8]">Spartanburg:</strong> City PD runs 15 cameras. The county's were deployed under Sheriff Chuck Wright&hellip; who pled guilty to federal criminal charges in May 2025. A convicted criminal had unrestricted access to a system tracking where you drive. Neither the city nor the county has an oversight policy.
        </p>
        <p>
          <strong class="text-[#e8e8e8]">From Greenville to Spartanburg to Anderson and beyond:</strong> Cameras first, questions never. No Upstate city or county has passed an oversight ordinance. Even when other cities tried, it didn't matter. Local governments can't control where the data goes once it's in Flock's network.
        </p>
        <p>
          <strong class="text-[#e8e8e8]">The official count undersells it.</strong> When Greenville went looking for more cameras, its own RFP required the new ones to connect with HOA and neighborhood cameras too. The city's SafeWatch program asks residents to register their Ring and Nest cameras for police use on demand. At least one Greenville HOA already runs its own license plate reader. The 57-camera figure is a floor, not a ceiling.
        </p>
      </div>
    </div>

    <!-- Right: stat column -->
    <div class="hidden md:flex flex-col px-7 py-20">
      <div class="py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div class="text-[32px] font-black text-[#dc2626] leading-none tracking-[-0.03em] mb-1">242</div>
        <div class="font-['DM_Mono',monospace] text-[8px] uppercase tracking-[0.15em] text-[#555]">Total cameras<br>documented</div>
      </div>
      <div class="py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div class="text-[32px] font-black text-[#dc2626] leading-none tracking-[-0.03em] mb-1">57</div>
        <div class="font-['DM_Mono',monospace] text-[8px] uppercase tracking-[0.15em] text-[#555]">Greenville PD</div>
      </div>
      <div class="py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div class="text-[24px] font-black leading-none tracking-[-0.03em] mb-1" style="color:#555;">0</div>
        <div class="font-['DM_Mono',monospace] text-[8px] uppercase tracking-[0.15em] text-[#555]">Oversight<br>ordinances</div>
      </div>
      <div class="py-4">
        <div class="text-[24px] font-black leading-none tracking-[-0.03em] mb-1" style="color:#555;">0</div>
        <div class="font-['DM_Mono',monospace] text-[8px] uppercase tracking-[0.15em] text-[#555]">Public<br>votes</div>
      </div>
    </div>

  </div>

  <!-- Map embed area (unchanged) -->
  <div class="relative z-10">
    <div class="max-w-4xl mx-auto px-6 py-12">

      <!-- Mobile toggle button -->
      <div id="map-button-container" class="md:hidden bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] p-8 text-center">
        <p class="text-white font-bold text-lg mb-4">
          Find the cameras in your neighborhood.
        </p>
        <button
          id="map-toggle"
          type="button"
          class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer"
        >
          Explore the camera map &rarr;&#xFE0E;
        </button>
      </div>

      <!-- Map container with glow frame -->
      <div id="map-frame" class="hidden md:block glow-frame map-frame" style="position: relative; left: 50%; transform: translateX(-50%);" data-glow-frame>
        <p class="text-white font-bold text-lg mb-4 relative z-[3] px-1">
          Find the cameras in your neighborhood.
        </p>
        <div id="map-container" class="rounded-lg overflow-hidden" style="height: 600px; clip-path: inset(0);">
          <div id="camera-map" style="width: 100%; height: 100%;" role="application" aria-label="ALPR Camera Map"></div>
        </div>
        <div class="map-frame-credits relative z-[3] px-3 pt-2 pb-1">
          <p class="text-[#a3a3a3] text-xs">
            Map tiles by <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &middot; <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> &middot; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>
          </p>
          <p class="text-[#737373] text-sm mt-1">
            Camera data from <a href="https://deflock.org" target="_blank" rel="noopener" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">Deflock.org</a>, a community-sourced map of Flock Safety camera locations. Help keep it updated by reporting cameras you find.
          </p>
        </div>
      </div>

    </div>
  </div>

</section>
```

### Step 3: Verify in preview

Start server if not running: `node node_modules/astro/astro.js dev --host 127.0.0.1`

Check at `localhost:4321`:
- Ghost "242" visible in upper-right behind heading
- Two-column layout on desktop: copy left, 4 stats right
- Stats: red 242, red 57, dimmed 0 / 0
- Mobile: stat column hidden, copy full-width, toggle button present
- Map still loads on desktop (lazy, fires on scroll)

### Step 4: Commit

```bash
git add src/components/MapSection.astro
git commit -m "feat: restyle MapSection (cinematic option B — ghost number, stat column)"
```

---

## Task 2: Create CitizenToolkit.astro

**Files:**
- Create: `src/components/CitizenToolkit.astro`

### Step 1: Create the file

```astro
---
---

<section id="citizen-toolkit" aria-labelledby="toolkit-heading" class="bg-[#161616] border-t border-[rgba(255,255,255,0.07)]">

  <!-- Section header -->
  <div class="px-6 md:px-10 pt-14 pb-8">
    <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555] mb-3">Citizen Toolkit</p>
    <h2 id="toolkit-heading" class="text-[#e8e8e8] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em] leading-[1.05]">
      Take action beyond the call.
    </h2>
  </div>

  <!-- Bento grid — 1px gap pattern -->
  <div class="bento-wrap px-6 md:px-10 pb-10">
    <div class="bento-grid bg-[rgba(255,255,255,0.07)]" style="display:grid;gap:1px;">

      <!-- 01 REQUEST RECORDS (col-span-2) -->
      <div class="bento-cell" style="grid-column:span 2;border-top:2px solid #dc2626;position:relative;">
        <p class="bento-overline">Request Records</p>
        <h3 class="bento-heading">Four FOIA templates. Ready to file.</h3>
        <ul class="bento-list">
          <li>Camera location data — which roads, which neighborhoods</li>
          <li>Data retention policy — how long your plate is kept</li>
          <li>Federal data sharing — who outside SC can see it</li>
          <li>Flock contract — what your city actually agreed to</li>
        </ul>
        <p class="bento-meta">
          <span>4 PDF templates</span>
          <span>Copy &amp; send</span>
          <span>SC FOIA § 30-4-10</span>
        </p>
        <a href="/toolkit#request-records" class="bento-link">Go to FOIA templates →</a>
        <div class="bento-num" aria-hidden="true">01</div>
      </div>

      <!-- 02 SPEAK UP (col-span-1) -->
      <div class="bento-cell" style="border-top:2px solid #dc2626;position:relative;">
        <p class="bento-overline">Speak Up</p>
        <h3 class="bento-heading">Show up to council. Say exactly this.</h3>
        <p class="bento-desc">Full talk track for public comment. Rebuttals for common pushback. Council handout PDF to leave behind.</p>
        <p class="bento-meta">
          <span>Talk track</span>
          <span>Rebuttals</span>
          <span>Handout PDF</span>
        </p>
        <a href="/toolkit#speak-up" class="bento-link">Prep your remarks →</a>
        <div class="bento-num" aria-hidden="true">02</div>
      </div>

      <!-- 03 SPREAD THE WORD (col-span-1) -->
      <div class="bento-cell" style="border-top:2px solid #dc2626;position:relative;">
        <p class="bento-overline">Spread the Word</p>
        <h3 class="bento-heading">Cards, one-pager, conversation starters.</h3>
        <p class="bento-desc">Four business card designs. Print on Avery 8371. Leave at coffee shops, hand out at events.</p>
        <p class="bento-meta">
          <span>4 card designs</span>
          <span>One-pager</span>
          <span>Print-ready PDFs</span>
        </p>
        <a href="/toolkit#spread-the-word" class="bento-link">Get the materials →</a>
        <div class="bento-num" aria-hidden="true">03</div>
      </div>

      <!-- 04 KNOW YOUR RIGHTS (col-span-2) -->
      <div class="bento-cell" style="grid-column:span 2;border-top:2px solid #dc2626;position:relative;">
        <p class="bento-overline">Know Your Rights</p>
        <h3 class="bento-heading">The 4th Amendment. What SC is missing. What other states did.</h3>
        <p class="bento-desc">Six states have passed ALPR limits. South Carolina has none. Here's the legal landscape, what the pending bills don't cover, and what you need to know before you speak.</p>
        <p class="bento-meta">
          <span>4th Amendment primer</span>
          <span>State comparison</span>
          <span>Bill gap analysis</span>
        </p>
        <a href="/toolkit#know-your-rights" class="bento-link">Understand the law →</a>
        <div class="bento-num" aria-hidden="true">04</div>
      </div>

    </div>
  </div>

</section>

<style>
  /* Desktop: 3-col grid */
  @media (min-width: 768px) {
    .bento-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* Mobile: single column */
  @media (max-width: 767px) {
    .bento-grid {
      grid-template-columns: 1fr;
    }
    /* Reset col-spans on mobile */
    .bento-cell[style*="grid-column:span 2"] {
      grid-column: span 1 !important;
    }
  }

  .bento-cell {
    background: #161616;
    padding: 28px;
    display: flex;
    flex-direction: column;
  }

  .bento-overline {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 12px;
  }

  .bento-heading {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #e8e8e8;
    margin-bottom: 10px;
    line-height: 1.2;
  }

  .bento-desc {
    font-size: 12px;
    color: #888;
    line-height: 1.6;
    flex: 1;
    margin-bottom: 14px;
  }

  /* Bullet list variant (used in FOIA cell) */
  .bento-list {
    list-style: none;
    padding: 0;
    margin: 0 0 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bento-list li {
    font-size: 12px;
    color: #888;
    line-height: 1.5;
    padding-left: 14px;
    position: relative;
  }
  .bento-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 7px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(220, 38, 38, 0.5);
  }

  .bento-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 16px;
  }
  .bento-meta span {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555;
    border: 1px solid rgba(255, 255, 255, 0.07);
    padding: 3px 8px;
  }

  .bento-link {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #dc2626;
    text-decoration: none;
    margin-top: auto;
    transition: color 0.15s;
  }
  .bento-link:hover { color: #ef4444; }

  .bento-num {
    position: absolute;
    bottom: 16px;
    right: 20px;
    font-size: 56px;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1;
    color: rgba(220, 38, 38, 0.15);
    pointer-events: none;
    user-select: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    .bento-link { transition: color 0.15s; }
  }
</style>
```

### Step 2: Verify file saved correctly

```bash
# Check the file exists
ls src/components/CitizenToolkit.astro
```

### Step 3: Commit

```bash
git add src/components/CitizenToolkit.astro
git commit -m "feat: add CitizenToolkit bento grid section component"
```

---

## Task 3: Wire CitizenToolkit into index.astro

**Files:**
- Modify: `src/pages/index.astro`

### Step 1: Add import and component

```astro
---
import Base from '../layouts/Base.astro';
import Hero from '../components/Hero.astro';
import HowItWorks from '../components/HowItWorks.astro';
import MapSection from '../components/MapSection.astro';
import BillTracker from '../components/BillTracker.astro';
import CitizenToolkit from '../components/CitizenToolkit.astro';
import FAQ from '../components/FAQ.astro';
import TakeAction from '../components/TakeAction.astro';
---

<Base title="DeflockSC — Stop Surveillance in Upstate SC">
  <Hero />
  <HowItWorks />
  <MapSection />
  <BillTracker />
  <CitizenToolkit />
  <FAQ />
  <TakeAction />
</Base>
```

### Step 2: Verify in preview

At `localhost:4321`, scroll to the BillTracker section. Below it, you should see:
- DM Mono overline "CITIZEN TOOLKIT"
- h2 "Take action beyond the call."
- 2×2 bento grid: FOIA (wide), SPEAK UP, SPREAD, KNOW YOUR RIGHTS (wide)
- Ghost numbers 01–04 in each cell
- Red top borders on all cells
- Clicking any cell link navigates to `/toolkit#<tab-id>`

### Step 3: Mobile check

At 375px viewport width:
- All 4 cells stack single column
- Ghost numbers visible
- col-span-2 cells collapse to full width

### Step 4: Commit

```bash
git add src/pages/index.astro
git commit -m "feat: wire CitizenToolkit section into homepage between BillTracker and FAQ"
```

---

## Task 4: Minor cleanup — toolkit.astro + Footer.astro

**Files:**
- Modify: `src/pages/toolkit.astro`
- Modify: `src/components/Footer.astro`

### Step 1: Fix toolkit.astro — remove dead section-glow div

Current line 8:
```html
<div class="section-glow absolute -top-24 left-1/2 -translate-x-1/2 w-[min(800px,90vw)] h-[300px] blur-[64px] opacity-[0.15] pointer-events-none" aria-hidden="true"></div>
```

Remove that entire div. The CSS class `.section-glow` was deleted in the earlier cleanup commit.

### Step 2: Fix Footer.astro — update border colors

Update `border-[#262626]` to `border-[rgba(255,255,255,0.07)]` (two occurrences: outer border-t, and inner mt-12 border-t):

```astro
<footer class="bg-[#171717] border-t border-[rgba(255,255,255,0.07)] py-16">
  ...
  <div class="mt-12 pt-8 border-t border-[rgba(255,255,255,0.07)] text-center text-[#a3a3a3] text-xs">
```

### Step 3: Verify

- `localhost:4321/toolkit` — no console errors, header section renders without broken glow div
- Footer border consistent with other sections

### Step 4: Commit

```bash
git add src/pages/toolkit.astro src/components/Footer.astro
git commit -m "fix: remove dead section-glow div from toolkit page, update footer borders"
```

---

## Task 5: Full visual review + mobile pass

**No file changes — verification only**

### Step 1: Desktop scroll-through

At `localhost:4321`, verify the full page flow:

| Section | Check |
|---------|-------|
| Hero | Unchanged |
| HowItWorks | Unchanged |
| MapSection | Ghost "242", 2-col layout, stats right, map loads |
| BillTracker | Unchanged |
| CitizenToolkit | Bento grid, 4 cells, 01–04 numbers |
| FAQ | Sidebar panel, unchanged |
| TakeAction | Ghost "ACT", unchanged |
| Footer | Updated border color, no visual change |

### Step 2: Mobile at 375px

Using dev-preview at `localhost:4321/dev-preview.html`:
- MapSection: stat column hidden, copy full-width, toggle button shows
- CitizenToolkit: 4 cells stacked single column
- No horizontal overflow (check with: `Array.from(document.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 2).map(el => el.tagName + ' ' + el.className)`)

### Step 3: Nav smoke test

- Click "Take Action" button → action modal opens
- Click a bill card → bill modal opens
- Click FAQ questions → sidebar switches answers
- Click `/toolkit` nav link → toolkit page loads with tabs

---

## Task 6: PR

**After Task 5 passes:**

```bash
# Invoke: superpowers:finishing-a-development-branch
```

Follow the finishing skill to create the PR to master.
