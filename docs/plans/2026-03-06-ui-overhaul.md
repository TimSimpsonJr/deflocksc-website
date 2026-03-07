# UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Inter-based, centered component styling with the "Asymmetric Data" direction (Option B) — Instrument Sans + DM Mono, asymmetric layouts, 1px-gap grids, no contained panels, red ghost CTA text.

**Architecture:** Component-by-component restyling. No structural data changes (bills.json, district matching, map, modal internals all unchanged). Copy is frozen — words don't change, only HTML structure + CSS. Font swap done first so every component inherits it.

**Tech Stack:** Astro 5, Tailwind CSS 4, Google Fonts (Instrument Sans + DM Mono). No new npm packages.

**Reference mockup:** `public/ui-mockups-v2.html` — Option B tab. Exact CSS values are in `#ob {}` blocks.

---

## Pre-flight

Before starting, create and check out a fresh branch:

```bash
git checkout master
git pull
git checkout -b feature/ui-overhaul
```

Start the dev server:
```
node node_modules/astro/astro.js dev --host 127.0.0.1
```

Open `http://127.0.0.1:4321` in the Claude Preview tool to verify changes after each task.

---

### Task 1: Font swap — Inter → Instrument Sans + DM Mono

**Files:**
- Modify: `src/layouts/Base.astro:1-46`

**Step 1: Replace the Inter fontsource import and body font with Google Fonts**

In `Base.astro`, in the `<head>` block, replace the Inter fontsource import line and add Google Fonts `<link>` tags. Change the `<body>` class font reference.

Find and replace:
```astro
import '@fontsource-variable/inter';
```
Delete this line (it's in the frontmatter `---` block at the top).

**Step 2: Add Google Fonts preconnect + stylesheet links in `<head>`**

After the `<link rel="icon">` line, add:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
```

**Step 3: Update `<body>` class to use Instrument Sans**

Change:
```astro
<body class="bg-[#171717] text-[#d4d4d4] font-['Inter_Variable',sans-serif] leading-[1.7] min-h-screen">
```
To:
```astro
<body class="bg-[#171717] text-[#d4d4d4] font-['Instrument_Sans',sans-serif] leading-[1.7] min-h-screen">
```

**Step 4: Verify in preview**

Load `http://127.0.0.1:4321` — body text and headings should now render in Instrument Sans (similar to the current Inter but slightly wider, with more character). Check Network tab to confirm Google Fonts loads.

**Step 5: Commit**
```bash
git add src/layouts/Base.astro
git commit -m "feat: swap Inter for Instrument Sans + DM Mono via Google Fonts"
```

---

### Task 2: Nav — status dot + slash wordmark

**Files:**
- Modify: `src/components/Nav.astro`

**What changes:**
- Replace plain `DeflockSC` text with a blinking red dot + `DEFLOCK/SC` (slash in red)
- Keep Home + Toolkit links, keep scroll-solid behavior, keep `data-open-action` button
- Button: remove `rounded`, keep red

**Step 1: Replace the nav wordmark `<a>` and nav button**

Replace:
```astro
<a href="/" class="text-white font-black text-xl tracking-[-0.02em]">DeflockSC</a>
```
With:
```astro
<a href="/" class="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-[0.12em]">
  <span class="status-dot w-[6px] h-[6px] rounded-full bg-[#dc2626] flex-shrink-0" aria-hidden="true"></span>
  DEFLOCK<span class="text-[#dc2626]">/</span>SC
</a>
```

Replace the Take Action button:
```astro
<button type="button" data-open-action class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.1em] px-5 py-2.5 transition-colors cursor-pointer">Take Action</button>
```
(Remove `rounded` — square corners match the mockup direction.)

**Step 2: Add blink animation to `<style>` block**

In the existing `<style>` block, add:
```css
.status-dot {
  box-shadow: 0 0 5px #dc2626;
  animation: nav-blink 2.5s ease-in-out infinite;
}
@keyframes nav-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

**Step 3: Verify in preview**

Check: blinking dot visible, slash in red, no rounded corners on button, scroll-solid still works.

**Step 4: Commit**
```bash
git add src/components/Nav.astro
git commit -m "feat: restyle nav with status dot and slash wordmark"
```

---

### Task 3: Hero — left-aligned layout + data sidebar

**Files:**
- Modify: `src/components/Hero.astro`

**What changes:**
- Keep camera image + SVG cones exactly as-is (don't touch the `<picture>` block or `<svg>` block)
- Remove centered text layout, replace with bottom-anchored 2-column grid
- Left: headline + body + CTAs. Right: data sidebar (4 stat items)
- Add glitch scan bars (CSS animation, purely decorative)
- Copy stays the same words; headline restructured to 3 lines with key word in red italic

**Step 1: Replace the hero content `<div>` (lines 58–75)**

Replace:
```astro
<div class="max-w-5xl mx-auto px-6 relative z-10 text-center" style="text-shadow: 0 2px 16px rgba(0,0,0,0.6);">
  <h1 id="hero-heading" class="text-white font-black text-3xl md:text-5xl lg:text-6xl tracking-[-0.02em] leading-[1.1] mb-4">
    In 1984, the Thought Police <br class="hidden md:block" />weren't looking for criminals. <br class="hidden md:block" />Neither is <span class="text-[#dc2626]">Flock Safety</span>
  </h1>
  <p class="text-[#d4d4d4] font-semibold text-xl md:text-2xl lg:text-3xl mb-6 leading-snug">
    99% of the plates they scan belong to people suspected of nothing.
  </p>
  <p class="text-[#a3a3a3] font-medium text-lg md:text-xl mb-8 leading-relaxed">
    242 cameras are watching Upstate South Carolina right now. Every car that passes gets photographed. That data goes into a national network. And nobody voted on any of it.
  </p>
  <button type="button" data-open-action
    class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer">
    Contact Your Reps
  </button>
</div>
```

With:
```astro
<!-- Glitch scan bars -->
<div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
  <div class="glitch-bar absolute left-0 right-0 h-[2px] bg-[rgba(220,38,38,0.15)]"></div>
  <div class="glitch-bar2 absolute left-0 right-0 h-[1px] bg-[rgba(255,255,255,0.04)]"></div>
</div>

<div class="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 grid md:grid-cols-[1fr_300px] gap-8 md:gap-16 items-center" style="text-shadow: 0 2px 16px rgba(0,0,0,0.6);">
  <!-- Left: headline + body + CTAs -->
  <div>
    <p class="hero-kicker font-['DM_Mono',monospace] text-[10px] tracking-[0.18em] uppercase text-[rgba(220,38,38,0.7)] mb-6">SC · ALPR · Active · Unregulated</p>
    <h1 id="hero-heading" class="text-white font-bold text-[clamp(3rem,7vw,5.5rem)] tracking-[-0.03em] leading-[0.95] mb-6">
      Your plates<br>
      are <em class="text-[#dc2626] not-italic font-bold">tracked.</em><br>
      No vote taken.
    </h1>
    <p class="text-[#909090] text-base md:text-[15px] leading-[1.65] max-w-[440px] mb-8">
      242 cameras are watching Upstate South Carolina right now. Every car that passes gets photographed. That data goes into a national network. And nobody voted on any of it.
    </p>
    <div class="flex items-center gap-4">
      <button type="button" data-open-action
        class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.08em] px-8 py-3.5 transition-colors cursor-pointer">
        Contact Your Reps
      </button>
      <a href="#how-it-works" class="font-['DM_Mono',monospace] text-[11px] uppercase tracking-[0.06em] text-[#555555] hover:text-[#a0a0a0] transition-colors">
        View Camera Map ↓
      </a>
    </div>
  </div>

  <!-- Right: data sidebar -->
  <div class="hidden md:flex flex-col">
    <div class="border-t border-[rgba(255,255,255,0.07)] py-4">
      <div class="text-[#dc2626] font-bold text-3xl tracking-[-0.025em] leading-none mb-1">242</div>
      <div class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.1em] text-[#555555]">Cameras · Upstate SC</div>
    </div>
    <div class="border-t border-[rgba(255,255,255,0.07)] py-4">
      <div class="text-[#e8e8e8] font-bold text-3xl tracking-[-0.025em] leading-none mb-1">422M</div>
      <div class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.1em] text-[#555555]">Reads in SLED database</div>
    </div>
    <div class="border-t border-[rgba(255,255,255,0.07)] py-4">
      <div class="text-[#dc2626] font-bold text-3xl tracking-[-0.025em] leading-none mb-1">0</div>
      <div class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.1em] text-[#555555]">Oversight ordinances</div>
    </div>
    <div class="border-t border-b border-[rgba(255,255,255,0.07)] py-4">
      <div class="text-[#fbbf24] font-bold text-3xl tracking-[-0.025em] leading-none mb-1">S447</div>
      <div class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.1em] text-[#555555]">Active bill · In committee</div>
    </div>
  </div>
</div>
```

**Step 2: Add glitch animation to `<style>` block (alongside existing cone styles)**

Add inside the existing `<style>` tag:
```css
@keyframes glitch-scan {
  0%   { top: -2px; opacity: 0; }
  5%   { opacity: 1; }
  95%  { opacity: 0.3; }
  100% { top: 100%; opacity: 0; }
}
@keyframes glitch-scan2 {
  0%   { top: -1px; }
  100% { top: 100%; }
}
.glitch-bar  { animation: glitch-scan  8s linear infinite; }
.glitch-bar2 { animation: glitch-scan2 5s linear infinite 2s; }
@media (prefers-reduced-motion: reduce) {
  .glitch-bar, .glitch-bar2 { animation: none; }
}
```

**Step 3: Update the hero section wrapper classes**

The outer `<section>` currently has `py-24 md:py-32`. Change to use `min-height` and bottom-anchor the content:
```astro
<section aria-labelledby="hero-heading" class="bg-[#0d0d0d] min-h-[88vh] flex flex-col justify-end pb-16 pt-8 relative overflow-hidden">
```

**Step 4: Verify in preview**

Check: 2-column layout on desktop, data sidebar visible, glitch bars animating, camera image + cones still intact. On mobile, data sidebar should be hidden (it has `hidden md:flex`).

**Step 5: Commit**
```bash
git add src/components/Hero.astro
git commit -m "feat: restyle hero with asymmetric 2-col layout and data sidebar"
```

---

### Task 4: HowItWorks — asymmetric pipeline grid

**Files:**
- Modify: `src/components/HowItWorks.astro`

**What changes:**
- Remove centered `<h2>`, replace with left-aligned section label + title with giant decorative section number
- Replace the split prose+carousel layout with a 3-cell asymmetric grid: 1 primary (2-row) + 2 secondary
- Primary cell: the main prose (first 2 paragraphs from the existing content)
- Secondary cells: paragraphs 3 and 4 (national network, no warrant)
- Keep the carousel case studies — move to a 4th cell or below the grid (the case studies are distinct content worth preserving)
- Remove `bg-[#262626]` section background and section glow

**Step 1: Replace the entire section content**

Replace everything inside `<section>` down to (but not including) `<HowItWorksOverlays />`:

```astro
<section id="how-it-works" aria-labelledby="how-it-works-heading" class="bg-[#111111] py-0 relative overflow-hidden">

  <!-- Section header -->
  <div class="relative overflow-hidden px-6 md:px-12 pt-14 pb-4">
    <div class="how-bg-num absolute right-4 -top-6 font-bold leading-none text-[rgba(255,255,255,0.025)] pointer-events-none select-none" aria-hidden="true">02</div>
    <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-3">How it works</p>
    <h2 id="how-it-works-heading" class="text-[#e8e8e8] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em] leading-[1.05] max-w-[600px] mb-10">
      What happens every time you drive past a camera
    </h2>
  </div>

  <!-- Asymmetric grid: primary (2-row) + 2 secondary -->
  <div class="pipeline-grid grid md:grid-cols-2 bg-[rgba(255,255,255,0.07)] mx-6 md:mx-12 mb-12" style="gap:1px">
    <!-- Primary cell: spans 2 rows on desktop -->
    <div class="pipeline-cell-primary bg-[#141414] p-8 md:p-12 relative md:row-span-2">
      <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.15em] text-[#555555] mb-10">Primary node · 01 / Capture</p>
      <h3 class="text-[#e8e8e8] font-bold text-[1.6rem] tracking-[-0.015em] leading-[1.2] mb-4 relative">
        Camera reads your plate — flagged or not
      </h3>
      <p class="text-[#a0a0a0] text-[14px] leading-[1.65] max-w-[340px] relative">
        Flock Safety puts cameras on poles at intersections and along roadsides. Small. Solar-powered. Easy to miss. Every car that drives by gets photographed. Your plate number, vehicle make, color, and location get uploaded to Flock's servers. Every time. The camera doesn't wait for suspicion. It reads everything and checks later.
      </p>
      <div class="p-num-bg absolute bottom-6 right-6 font-bold leading-none text-[rgba(255,255,255,0.04)] pointer-events-none select-none" aria-hidden="true">01</div>
    </div>

    <!-- Secondary cell 1 -->
    <div class="bg-[#111111] p-8 relative">
      <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.15em] text-[#555555] mb-8">02 / Ingest</p>
      <h3 class="text-[#e8e8e8] font-semibold text-[1.3rem] tracking-[-0.015em] leading-[1.2] mb-3 relative">Enters a national network</h3>
      <p class="text-[#a0a0a0] text-[14px] leading-[1.65] relative">
        That data doesn't stay in your county. Flock runs a national network. Police from other states can search it. Federal agencies can too. Researchers found three separate ways federal agents get into local camera data — including a back door that let outside agencies search without anyone knowing.
      </p>
      <div class="p-num-bg absolute bottom-4 right-4 font-bold leading-none text-[rgba(255,255,255,0.04)] pointer-events-none select-none" aria-hidden="true">02</div>
    </div>

    <!-- Secondary cell 2 -->
    <div class="bg-[#111111] p-8 relative">
      <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.15em] text-[#555555] mb-8">03 / Access</p>
      <h3 class="text-[#e8e8e8] font-semibold text-[1.3rem] tracking-[-0.015em] leading-[1.2] mb-3 relative">No one watching the watchers</h3>
      <p class="text-[#a0a0a0] text-[14px] leading-[1.65] relative">
        None of it requires a warrant. Your local police can't turn off the federal access. <span class="text-[#dc2626] font-semibold">And neither can you.</span> No SC city or county has passed an oversight ordinance. The cameras went up, the data started flowing, and no rules govern how long it's kept.
      </p>
      <div class="p-num-bg absolute bottom-4 right-4 font-bold leading-none text-[rgba(255,255,255,0.04)] pointer-events-none select-none" aria-hidden="true">03</div>
    </div>
  </div>

  <!-- Case studies carousel (preserved below the grid) -->
  <div class="px-6 md:px-12 pb-14">
    <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-4">Case studies</p>
    <div class="factoid-carousel" id="factoidCarousel" role="region" aria-label="Case studies carousel">
      <div class="carousel-container">
        <button class="carousel-arrow carousel-arrow-prev" id="prevBtn" aria-label="Previous factoid">&lsaquo;</button>
        <div class="carousel-viewport" aria-live="polite">
          <div class="carousel-track" id="carouselTrack">
            <!-- [same 5 carousel-card divs as before — copy them unchanged] -->
            <div class="carousel-card" data-idx="0" data-overlay="0" tabindex="0" role="group" aria-label="Case study 1 of 5">
              <div class="carousel-card-content">
                <span class="block text-[#dc2626] font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.08em] mb-3">Greenville, SC &mdash; False Arrest</span>
                <p class="text-[#a0a0a0] text-[0.9rem] leading-relaxed mb-4">Two sisters driving a rental car were flagged as stolen by a Flock camera. Police drew weapons and handcuffed both women. The car wasn't stolen &mdash; it had been improperly reported. They are now suing Greenville PD.</p>
                <span class="read-more-text">See the full lawsuit story &rarr;&#xFE0E;</span>
              </div>
            </div>
            <div class="carousel-card" data-idx="1" data-overlay="1" tabindex="-1" role="group" aria-label="Case study 2 of 5">
              <div class="carousel-card-content">
                <span class="block text-[#dc2626] font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.08em] mb-3">Ventura County, CA &mdash; Data Shared Without Permission</span>
                <p class="text-[#a0a0a0] text-[0.9rem] leading-relaxed mb-4">Ventura County disabled Flock's cross-jurisdiction sharing to comply with state law. The feature was reactivated without anyone knowing. Out-of-state agencies searched their data 364,000 times in two months before deputies found out.</p>
                <span class="read-more-text">See how your data leaves the state &rarr;&#xFE0E;</span>
              </div>
            </div>
            <div class="carousel-card" data-idx="2" data-overlay="2" tabindex="-1" role="group" aria-label="Case study 3 of 5">
              <div class="carousel-card-content">
                <span class="block text-[#dc2626] font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.08em] mb-3">Santa Cruz, CA &mdash; 4,000 Federal Searches</span>
                <p class="text-[#a0a0a0] text-[0.9rem] leading-relaxed mb-4">State agencies accessed local camera data 4,000 times on behalf of federal authorities, including ICE, before the city found out and cancelled the contract 6&ndash;1.</p>
                <span class="read-more-text">See why the city voted 6&ndash;1 to cancel &rarr;&#xFE0E;</span>
              </div>
            </div>
            <div class="carousel-card" data-idx="3" data-overlay="3" tabindex="-1" role="group" aria-label="Case study 4 of 5">
              <div class="carousel-card-content">
                <span class="block text-[#dc2626] font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.08em] mb-3">Spartanburg, SC &mdash; Sheriff Convicted</span>
                <p class="text-[#a0a0a0] text-[0.9rem] leading-relaxed mb-4">Spartanburg County Sheriff Chuck Wright oversaw Flock deployments and pled guilty to federal charges: conspiracy to commit theft and wire fraud. The man with access to your location history was a convicted federal criminal.</p>
                <span class="read-more-text">See who had access to your data &rarr;&#xFE0E;</span>
              </div>
            </div>
            <div class="carousel-card" data-idx="4" data-overlay="4" tabindex="-1" role="group" aria-label="Case study 5 of 5">
              <div class="carousel-card-content">
                <span class="block text-[#dc2626] font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.08em] mb-3">Austin, TX &mdash; No Crime Reduction</span>
                <p class="text-[#a0a0a0] text-[0.9rem] leading-relaxed mb-4">Austin's own city audit couldn't find evidence the cameras reduce crime. Over 20% of searches lacked proper documentation. The city cancelled the contract.</p>
                <span class="read-more-text">See the audit that killed the contract &rarr;&#xFE0E;</span>
              </div>
            </div>
          </div>
        </div>
        <button class="carousel-arrow carousel-arrow-next" id="nextBtn" aria-label="Next factoid">&rsaquo;</button>
        <div class="carousel-dots-bar" id="carouselDots"></div>
      </div>
    </div>
  </div>

</section>
```

**Step 2: Update `<style>` block — remove `bg-[#171717]` carousel bg, add decorative number sizes**

In the `<style>` block, find `.carousel-container` and change:
```css
background: #171717;
border-radius: 10px;
```
To:
```css
background: #141414;
border-radius: 0;
border-top: 1px solid rgba(255,255,255,0.07);
```

Add decorative number sizes:
```css
.how-bg-num { font-size: clamp(10rem, 20vw, 18rem); }
.p-num-bg   { font-size: clamp(5rem, 9vw, 8rem); }
```

**Step 3: Verify in preview**

Check: no centered heading, asymmetric grid renders correctly, carousel still works, overlay modals still open on carousel click.

**Step 4: Commit**
```bash
git add src/components/HowItWorks.astro
git commit -m "feat: restyle HowItWorks with asymmetric pipeline grid"
```

---

### Task 5: BillTracker — horizontal 3-column grid, no container box

**Files:**
- Modify: `src/components/BillTracker.astro`

**What changes:**
- Remove `bg-[#262626]` section background, remove section glow
- Remove the rounded container box (`bg-[rgba(163,163,163,0.12)] rounded-xl`)
- Replace per-bill `<button>` cards with horizontal 3-column grid (1px gap)
- Keep bill modal exactly as-is (all JS preserved, same `data-bill` attributes)
- Resyle the toolkit CTA block below — remove icon grid, replace with inline link
- Add left-aligned section header with giant decorative number

**Step 1: Replace the section opening and prose block**

Change section tag:
```astro
<section id="bill-tracker" aria-labelledby="bill-tracker-heading" class="bg-[#111111] relative overflow-hidden">
```
(Remove glow div entirely.)

Replace the heading and prose:
```astro
<!-- Section header -->
<div class="relative overflow-hidden px-6 md:px-12 pt-14 pb-4">
  <div class="bills-bg-num absolute right-4 -top-6 font-bold leading-none text-[rgba(255,255,255,0.025)] pointer-events-none select-none" aria-hidden="true">04</div>
  <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-3">Active legislation</p>
  <h2 id="bill-tracker-heading" class="text-[#e8e8e8] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em] leading-[1.05] mb-6">
    Three bills. All stalled.
  </h2>
  <p class="text-[#a0a0a0] text-[15px] leading-[1.7] max-w-[680px] mb-8">
    Three bills to rein in license plate cameras are sitting in SC committee right now. None have had a hearing. That changes when legislators hear from you.
  </p>
  <p class="text-[#a0a0a0] text-[14px] leading-[1.7] max-w-[680px] mb-10">
    <strong class="text-[#e8e8e8]">But even the strongest bill has a critical gap.</strong> All three regulate what <em>government agencies</em> can do with camera data. None address what <em>Flock</em> does with it. A 90-day retention limit means nothing if Flock keeps the data indefinitely. These bills need to be amended to regulate the network itself, not just the agencies plugged into it.
  </p>
</div>
```

**Step 2: Replace bill cards block with horizontal grid**

Replace the old container + cards:
```astro
<!-- 3-column bill grid -->
<div class="bills-grid grid md:grid-cols-3 bg-[rgba(255,255,255,0.07)] mx-6 md:mx-12 mb-6" style="gap:1px">
  {bills.map((bill: any, i: number) => (
    <button
      type="button"
      class="bill-col bg-[#111111] p-8 flex flex-col gap-3 text-left cursor-pointer hover:bg-[#161616] transition-colors"
      data-bill={i}
      aria-label={`${bill.bill}: ${bill.title}`}
    >
      <div class="text-[#e8e8e8] font-bold text-[2rem] tracking-[-0.03em] leading-none">{bill.bill}</div>
      <div class="text-[#a0a0a0] text-[13px] leading-[1.5] flex-1">{bill.title}</div>
      <div class="text-[#a0a0a0] text-xs mt-1">See what this bill would change →</div>
      <div class="border-t border-[rgba(255,255,255,0.07)] pt-4 mt-auto font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.1em] flex items-center gap-2">
        <span class="w-[5px] h-[5px] rounded-full bg-[#fbbf24] flex-shrink-0" aria-hidden="true"></span>
        <span class="text-[#fbbf24]">{bill.status}</span>
        {bill.committee && <span class="text-[#555555] ml-auto">{bill.committee}</span>}
      </div>
    </button>
  ))}
</div>
```

**Step 3: Replace toolkit CTA block**

Replace the icon grid block with a simpler inline link:
```astro
<div class="px-6 md:px-12 pb-14 border-t border-[rgba(255,255,255,0.07)] mt-6 pt-8">
  <p class="text-[#555555] text-sm mb-3">
    Last updated: February 2026 · Bill status checked automatically during session.
  </p>
  <p class="text-[#a0a0a0] text-sm">
    <em>S447 has gotten the furthest: cleared a Senate Judiciary subcommittee, but the full committee hasn't acted. H3155 and H4013 haven't had any committee action at all.</em>
  </p>
  <a href="/toolkit" class="inline-flex items-center gap-2 mt-6 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.1em] px-6 py-3 transition-colors">
    Open the Citizen Toolkit →
  </a>
</div>
```

**Step 4: Add `bills-bg-num` size to the section's `<style>` block (add one if none exists)**
```html
<style>
  .bills-bg-num { font-size: clamp(10rem, 20vw, 18rem); }
</style>
```

**Step 5: Verify in preview**

Check: 3-column grid renders, bill modal still opens on click (test by clicking a bill), amber status dot + label visible. Check mobile: should stack to single column.

**Step 6: Commit**
```bash
git add src/components/BillTracker.astro
git commit -m "feat: restyle BillTracker with horizontal 3-col grid"
```

---

### Task 6: FAQ — sidebar question list + answer panel

**Files:**
- Modify: `src/components/FAQ.astro`

**What changes:**
- Remove `<details>`/`<summary>` accordion entirely
- Replace with: fixed sidebar list (280px) of question buttons + right panel showing active answer
- Keep all 5 FAQ items + their source links
- Keep all existing copy (lead, rest, source fields)
- Section header: left-aligned with DM Mono overline

**Step 1: Replace the entire section HTML**

```astro
<section id="faq" aria-labelledby="faq-heading" class="bg-[#161616]">

  <!-- Section header -->
  <div class="px-6 md:px-12 pt-14 pb-6 border-b border-[rgba(255,255,255,0.07)]">
    <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-3">Common objections</p>
    <h2 id="faq-heading" class="text-[#e8e8e8] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em] leading-[1.05]">
      But what about&hellip;
    </h2>
  </div>

  <!-- Sidebar + answer panel -->
  <div class="faq-layout md:grid md:grid-cols-[280px_1fr]">

    <!-- Question list -->
    <div class="faq-sidebar border-b md:border-b-0 md:border-r border-[rgba(255,255,255,0.07)]">
      <div class="font-['DM_Mono',monospace] text-[9px] uppercase tracking-[0.18em] text-[#555555] px-8 py-4 border-b border-[rgba(255,255,255,0.07)]">
        Questions
      </div>
      {faqs.map((faq, i) => (
        <button
          type="button"
          class:list={['faq-q-btn w-full text-left px-8 py-4 text-[14px] font-medium leading-[1.35] border-b border-[#161616] transition-colors cursor-pointer', i === 0 ? 'faq-active' : '']}
          data-faq={i}
          aria-selected={i === 0 ? 'true' : 'false'}
        >
          {faq.question}
        </button>
      ))}
    </div>

    <!-- Answer panel -->
    <div class="faq-answer-panel p-8 md:p-12 flex flex-col justify-center min-h-[320px]">
      {faqs.map((faq, i) => (
        <div class:list={['faq-answer', i !== 0 ? 'hidden' : '']} data-answer={i}>
          <div class="text-[#e8e8e8] font-semibold text-[1.4rem] tracking-[-0.015em] leading-[1.2] mb-5">{faq.question}</div>
          <p class="text-[#a0a0a0] text-[15px] leading-[1.75] max-w-[560px]">
            <strong class="text-[#e8e8e8]">{faq.lead}</strong> {faq.rest}
          </p>
          {faq.source && (
            <p class="text-[#555555] text-xs mt-3" set:html={faq.source} />
          )}
        </div>
      ))}
    </div>
  </div>
</section>
```

**Step 2: Replace the `<style>` block**

```html
<style>
  .faq-q-btn { color: #888; }
  .faq-q-btn:hover { color: #e8e8e8; background: #1a1a1a; }
  .faq-active {
    color: #e8e8e8 !important;
    background: #1a1a1a !important;
    border-left: 2px solid #dc2626;
    padding-left: calc(2rem - 2px);
  }
</style>
```

**Step 3: Replace the `<script>` block**

```html
<script>
  const buttons = document.querySelectorAll('.faq-q-btn');
  const answers = document.querySelectorAll('.faq-answer');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-faq');
      buttons.forEach(b => {
        b.classList.remove('faq-active');
        b.setAttribute('aria-selected', 'false');
      });
      answers.forEach(a => a.classList.add('hidden'));
      btn.classList.add('faq-active');
      btn.setAttribute('aria-selected', 'true');
      document.querySelector(`.faq-answer[data-answer="${idx}"]`)?.classList.remove('hidden');
    });
  });
</script>
```

**Step 4: Verify in preview**

Check: clicking a question updates the active state (red left border) and swaps the answer panel. Source links still render with amber color (they're set via `set:html` with existing classes). Check mobile: stacks vertically.

**Step 5: Commit**
```bash
git add src/components/FAQ.astro
git commit -m "feat: replace FAQ accordion with sidebar question/answer panel"
```

---

### Task 7: TakeAction — ghost red CTA text

**Files:**
- Modify: `src/components/TakeAction.astro`

**What changes:**
- Remove multi-glow radial gradient decorations and `bg-[#262626]`
- Change to `bg-[#0d0d0d]`
- Left-align everything (remove `text-center` and `mx-auto` centering constraint)
- Add ghost "ACT" background text in red
- Dimmed middle line in headline
- Button + context text inline (flex row)

**Step 1: Replace entire component**

```astro
---
---

<section id="take-action" aria-labelledby="take-action-heading" class="bg-[#0d0d0d] py-20 md:py-28 relative overflow-hidden border-t border-[rgba(255,255,255,0.07)]">
  <!-- Ghost "ACT" background text -->
  <div class="cta-ghost-text absolute bottom-[-3rem] right-[-1rem] font-bold leading-none text-[rgba(220,38,38,0.07)] pointer-events-none select-none" aria-hidden="true">ACT</div>

  <div class="max-w-5xl mx-auto px-6 md:px-12 relative z-10">
    <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-6">Your legislators need to hear from you</p>
    <h2 id="take-action-heading" class="text-[#e8e8e8] font-bold text-[clamp(2.5rem,5vw,4.5rem)] tracking-[-0.03em] leading-[0.95] mb-10">
      Three bills sitting in committee.<br>
      <span class="text-[rgba(232,232,232,0.25)]">Zero hearings. Zero votes.</span><br>
      That changes when you call.
    </h2>
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <button
        type="button"
        data-open-action
        class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.08em] px-8 py-4 transition-colors cursor-pointer flex-shrink-0"
      >
        Contact Your Reps
      </button>
      <p class="text-[#a0a0a0] text-sm leading-[1.6] max-w-[400px]">
        We'll match you to your SC House and Senate districts and help you draft a message in under two minutes.
      </p>
    </div>
  </div>
</section>

<style>
  .cta-ghost-text { font-size: clamp(10rem, 22vw, 20rem); letter-spacing: -0.06em; }
</style>
```

**Step 2: Verify in preview**

Check: ghost "ACT" visible bottom-right in red tint, headline middle line dimmed, button left-aligned, `data-open-action` still opens the action modal.

**Step 3: Commit**
```bash
git add src/components/TakeAction.astro
git commit -m "feat: restyle TakeAction with ghost red ACT text"
```

---

### Task 8: Global CSS cleanup

**Files:**
- Modify: `src/styles/global.css`

**What changes:**
- Remove the `.section-glow` rule (no longer used)
- `[data-spotlight]` can stay (still used by any components that retain it)
- `.glow-frame` can stay (still used by MapSection and BillTracker glow frame)

**Step 1: Remove the `.section-glow` block**

Delete:
```css
/* Section glow accent */
.section-glow {
  background: radial-gradient(ellipse at center, rgba(163, 163, 163, 0.6) 0%, transparent 70%);
}
```

**Step 2: Commit**
```bash
git add src/styles/global.css
git commit -m "chore: remove unused section-glow utility"
```

---

### Task 9: Full visual review + mobile pass

No file changes — verification only.

**Step 1: Desktop review**

Load `http://127.0.0.1:4321` and scroll all sections:
- Nav: blinking dot, slash wordmark, scroll-solid behavior
- Hero: 2-col layout, data sidebar, glitch bars, camera image intact
- HowItWorks: asymmetric grid, carousel functional, overlay modals open
- MapSection: unchanged (skip)
- BillTracker: 3-col grid, bill modal opens on click
- FAQ: sidebar selection working, source links amber
- TakeAction: ghost ACT, left-aligned, modal opens

**Step 2: Mobile review (375px)**

Use the Preview resize tool (`mobile` preset) and scroll all sections:
- Hero: data sidebar hidden, headline stacks correctly
- HowItWorks: grid stacks to single column
- BillTracker: grid stacks to single column
- FAQ: sidebar stacks above answer panel
- TakeAction: button + context stack vertically

**Step 3: Accessibility check**

- Tab through all interactive elements: bill modal, FAQ questions, action modal
- Check focus rings are visible (red `#ef4444` outline from `global.css`)
- Verify `aria-labelledby` references all match heading IDs

**Step 4: Commit if any fixes needed, otherwise move to PR**
```bash
git add -p  # stage any fixup changes
git commit -m "fix: mobile + a11y review fixes"
```

---

### Task 10: Merge PR

```bash
git push -u origin feature/ui-overhaul
gh pr create --title "feat: UI overhaul — asymmetric data direction" --body "$(cat <<'EOF'
## Summary

- Swaps Inter for Instrument Sans + DM Mono (Google Fonts)
- Reworks Nav, Hero, HowItWorks, BillTracker, FAQ, TakeAction with Option B asymmetric direction
- No copy changes, no data/logic changes
- Eliminates shared patterns with nolaughingmatter.net kill list

## Visual reference
`public/ui-mockups-v2.html` — Option B tab

## Test plan
- [ ] Desktop scroll-through of all sections
- [ ] Mobile (375px) layout check
- [ ] Bill modal opens from 3-col grid
- [ ] FAQ sidebar question switching
- [ ] Action modal opens from Hero, TakeAction, and bill modal CTA
- [ ] HowItWorks carousel + overlay modals functional

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After merging, regenerate `MANIFEST.md` to reflect any new structural patterns.
