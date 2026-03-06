# Toolkit Tweaks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the homepage toolkit CTA into the BillTracker section with an icon row, replace text-based business card previews with actual PNG images and an inline-expand lightbox, and rework 3 of 4 card designs to use illustration backgrounds.

**Architecture:** Three independent changes to the existing citizen toolkit feature. Card generation pipeline shifts from pure satori to a sharp composite pipeline for image-backed cards. No new dependencies needed (satori and sharp already installed).

**Tech Stack:** Astro 5, Tailwind CSS 4, sharp (image compositing), satori (text rendering), pdf-lib (print sheets)

---

### Task 1: Save single-camera source image

The user provided a single-camera-on-pole illustration. Save it as a source asset for the city-council card generation.

**Files:**
- Create: `public/toolkit/outreach/single-camera.png`

**Step 1:** Save the user-provided single camera image (the second image from the conversation — single Flock camera on a pole, white background) to `public/toolkit/outreach/single-camera.png`. This is the source asset used by the card generator in Task 2.

**Step 2:** Verify file exists and has reasonable size:
```bash
ls -la public/toolkit/outreach/single-camera.png
```

**Step 3: Commit**
```bash
git add public/toolkit/outreach/single-camera.png
git commit -m "asset: add single-camera source image for business cards"
```

---

### Task 2: Rework business card generation script

Rewrite `scripts/generate-business-cards.js` to produce image-backed cards for 1984, city-council, and surveillance. The 1000-eyes card stays unchanged.

**Files:**
- Modify: `scripts/generate-business-cards.js`

**Step 1:** Add a `generateHeroCard(card, qrDataUri, fontData, opts)` function to the script. This function:

1. Creates a dark `#171717` canvas at `CARD_WIDTH x CARD_HEIGHT` (700x400) using `sharp`
2. Loads `public/hero-cameras.png` (camera array), resizes to fit card width, applies `modulate({ brightness: 0.85 })`, positions in upper portion
3. Generates a static light-cone SVG layer: 3 inner cone polygons at fixed angles (~5deg rotation), same white-to-transparent linear gradient with Gaussian blur (`stdDeviation="8"`), rendered at card dimensions. Cone origins map to the 3 inner cameras in the array.
4. Renders the SVG to PNG via `sharp(Buffer.from(svgString)).png().toBuffer()`
5. Composites light cone PNG onto the camera layer
6. Adds a bottom-fade gradient overlay (transparent top → `#171717` bottom) for text readability
7. Renders text (headline, subtext, QR code) via satori as a transparent-background PNG
8. Composites text layer on top
9. Returns final PNG buffer

The `opts` param allows different cone angles or camera positioning for 1984 vs surveillance so they look distinct.

**Step 2:** Add a `generateSingleCameraCard(card, qrDataUri, fontData)` function:

1. Creates dark `#171717` canvas at `CARD_WIDTH x CARD_HEIGHT`
2. Loads `public/toolkit/outreach/single-camera.png`, resizes to fit within ~60% card height, positions right-of-center
3. Applies `modulate({ brightness: 0.9 })` for subtle darkening
4. Renders text+QR via satori (text on left side, QR bottom-right) on transparent background
5. Composites text on top
6. Returns final PNG buffer

**Step 3:** Update the main loop to route cards to the correct generator:

```javascript
if (card.id === '1000-eyes') {
  pngBuffer = await generateEyeCard(card, qrDataUri, fontData);
} else if (card.id === '1984') {
  pngBuffer = await generateHeroCard(card, qrDataUri, fontData, { coneAngle: 5 });
} else if (card.id === 'surveillance') {
  pngBuffer = await generateHeroCard(card, qrDataUri, fontData, { coneAngle: -8 });
} else if (card.id === 'city-council') {
  pngBuffer = await generateSingleCameraCard(card, qrDataUri, fontData);
}
```

**Step 4:** Run the generation script and verify all 4 cards + 4 print sheets are produced:
```bash
node scripts/generate-business-cards.js
ls -la public/toolkit/outreach/card-*.png public/toolkit/outreach/cards-*-print.pdf
```
Expected: 4 PNG files (updated timestamps on 1984, city-council, surveillance; unchanged 1000-eyes) and 4 PDF print sheets.

**Step 5:** Visually inspect the generated PNGs via the preview server to confirm:
- card-1984: dark bg, camera array visible, light cones, "1984" headline readable
- card-city-council: dark bg, single camera illustration, city-council headline readable
- card-surveillance: dark bg, camera array (different from 1984), headline readable
- card-1000-eyes: unchanged

**Step 6: Commit**
```bash
git add scripts/generate-business-cards.js public/toolkit/outreach/card-*.png public/toolkit/outreach/cards-*-print.pdf
git commit -m "feat: rework 3 business card designs with illustration backgrounds"
```

---

### Task 3: Replace card previews with images + inline-expand lightbox

Replace the styled text-div card previews in ToolkitOutreach.astro with `<img>` tags and add an inline-expand lightbox.

**Files:**
- Modify: `src/components/ToolkitOutreach.astro`

**Step 1:** In the "Section 3: Business Cards" block (around line 119), replace the inner card preview markup. Current code creates a styled `<div>` with card.headline text inside an `<a download>` link. Replace with:

```astro
<button
  type="button"
  class="card-zoom block w-full rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(220,38,38,0.15)] relative"
  data-card-id={card.id}
  aria-label={`Preview ${card.headline} card`}
>
  <img
    src={`/toolkit/outreach/card-${card.id}.png`}
    alt={card.headline}
    class="w-full aspect-[3.5/2] object-cover rounded-lg"
    loading="lazy"
  />
  <!-- Zoom hint overlay on hover -->
  <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg">
    <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  </div>
</button>
```

Remove the old download link wrapping the preview div. Keep the download buttons below as-is.

**Step 2:** Add the dimmer overlay element at the bottom of the component template (before `</div>` of the business cards section or at component root level):

```html
<div id="card-dimmer" class="fixed inset-0 bg-[rgba(10,10,10,0.7)] z-40 hidden cursor-pointer" aria-hidden="true"></div>
```

**Step 3:** Add CSS for the expanded state:

```css
.card-zoom.expanded {
  transform: scale(1.8);
  z-index: 50;
  box-shadow: 0 0 80px rgba(0,0,0,0.7);
  position: relative;
}
```

**Step 4:** Add JavaScript for the lightbox behavior in the existing `<script>` block:

```javascript
// Inline-expand lightbox for business card previews
const dimmer = document.getElementById('card-dimmer');
let expandedCard = null;

document.querySelectorAll('.card-zoom').forEach(btn => {
  btn.addEventListener('click', () => {
    if (expandedCard === btn) {
      btn.classList.remove('expanded');
      dimmer?.classList.add('hidden');
      expandedCard = null;
    } else {
      if (expandedCard) expandedCard.classList.remove('expanded');
      btn.classList.add('expanded');
      dimmer?.classList.remove('hidden');
      expandedCard = btn;
    }
  });
});

dimmer?.addEventListener('click', () => {
  if (expandedCard) {
    expandedCard.classList.remove('expanded');
    dimmer.classList.add('hidden');
    expandedCard = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && expandedCard) {
    expandedCard.classList.remove('expanded');
    dimmer?.classList.add('hidden');
    expandedCard = null;
  }
});
```

**Step 5:** Verify via preview server: navigate to `/toolkit#outreach`, confirm cards show as images, hover shows magnifying glass, click expands in place with dimmer, click dimmer or Escape collapses.

**Step 6: Commit**
```bash
git add src/components/ToolkitOutreach.astro
git commit -m "feat: replace text card previews with images + inline-expand lightbox"
```

---

### Task 4: Move CTA into BillTracker with icon row

Move the standalone toolkit CTA from index.astro into the bottom of BillTracker.astro.

**Files:**
- Modify: `src/components/BillTracker.astro`
- Modify: `src/pages/index.astro`

**Step 1:** In `src/pages/index.astro`, delete the standalone CTA section (lines 17-24, the `<section class="bg-[#171717] py-12">` block between `<BillTracker />` and `<FAQ />`).

**Step 2:** In `src/components/BillTracker.astro`, add the toolkit CTA block inside the section, after the bill-frame closing `</div>` (after line 54) and before the section's closing `</div>` (line 55). Insert:

```astro
<!-- Toolkit CTA -->
<div class="border-t border-[#404040] mt-10 pt-10 text-center">
  <p class="text-[#a3a3a3] text-base mb-6">Ready to take the next step?</p>

  <div class="flex flex-wrap justify-center gap-x-10 gap-y-6 mb-8">
    <!-- FOIA Templates -->
    <div class="flex flex-col items-center gap-2">
      <svg class="w-8 h-8 text-[#a3a3a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="text-[#a3a3a3] text-[0.65rem] font-bold uppercase tracking-[0.08em]">FOIA Templates</span>
    </div>

    <!-- Talking Points -->
    <div class="flex flex-col items-center gap-2">
      <svg class="w-8 h-8 text-[#a3a3a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
      <span class="text-[#a3a3a3] text-[0.65rem] font-bold uppercase tracking-[0.08em]">Talking Points</span>
    </div>

    <!-- Printables -->
    <div class="flex flex-col items-center gap-2">
      <svg class="w-8 h-8 text-[#a3a3a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
      <span class="text-[#a3a3a3] text-[0.65rem] font-bold uppercase tracking-[0.08em]">Printables</span>
    </div>

    <!-- Legal Guide -->
    <div class="flex flex-col items-center gap-2">
      <svg class="w-8 h-8 text-[#a3a3a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
      <span class="text-[#a3a3a3] text-[0.65rem] font-bold uppercase tracking-[0.08em]">Legal Guide</span>
    </div>
  </div>

  <a href="/toolkit" class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.1em] px-6 py-3 rounded transition-colors">
    Open the Citizen Toolkit
  </a>
</div>
```

**Step 3:** Verify via preview server:
- Homepage: BillTracker section now ends with the icon row + CTA button
- No more standalone CTA section between BillTracker and FAQ
- Icons are visible, properly spaced, responsive at 375px (2x2 grid via flex-wrap)

**Step 4: Commit**
```bash
git add src/components/BillTracker.astro src/pages/index.astro
git commit -m "feat: move toolkit CTA into BillTracker section with icon row"
```

---

### Task 5: Cleanup + production build

Remove mockup files, verify production build, and do final visual pass.

**Files:**
- Delete: `public/mockup-cta.html`
- Delete: `public/mockup-lightbox.html`

**Step 1:** Delete mockup files:
```bash
rm public/mockup-cta.html public/mockup-lightbox.html
```

**Step 2:** Run production build:
```bash
node node_modules/astro/astro.js build
```
Expected: clean build, no errors. Toolkit page generated at `dist/toolkit/index.html`.

**Step 3:** Verify all static assets in dist:
```bash
ls -la dist/toolkit/outreach/card-*.png
```
Expected: 4 PNG files with updated timestamps for 1984, city-council, surveillance.

**Step 4:** Final visual verification via preview server:
- `/toolkit#outreach`: 4 card images render, lightbox works
- `/`: BillTracker section ends with icon CTA, no standalone section
- Mobile (375px): icons wrap to 2x2, cards stack to 1 column

**Step 5: Commit**
```bash
git add -A
git commit -m "chore: remove mockup files, verify production build"
```
