# Case Studies Cards — Implementation Plan (v2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the HowItWorks carousel with a 3+2 bento grid of 2.5D case study cards (V1 split layout). Cards 1-4 have animated scenes; Card 5 is a placeholder.

**Architecture:** 2.5D parallax via layered absolutely-positioned elements with different CSS `translate()` amounts on hover. Card 2 uses a small JS class toggle for asymmetric hover-off (lines fade instead of retracing). Overlays preserved from existing system.

**Tech Stack:** Astro 5, Tailwind CSS 4, inline SVG, DM Mono font. Card 2 needs ~20 simplified US state boundary paths for the lower-48 map.

**Design doc:** `docs/plans/2026-03-06-case-studies-design.md`

---

## Task 1: Scaffold bento grid — replace carousel markup

**Files:**
- Modify: `src/components/HowItWorks.astro:51-100` (carousel HTML)
- Modify: `src/components/HowItWorks.astro:106-223` (carousel CSS)
- Modify: `src/components/HowItWorks.astro:225-227` (carousel script import)

**Step 1: Remove carousel HTML**

Replace the carousel wrapper (lines 51-100, the `<div class="px-6 md:px-12 pb-14">` block) with the bento grid skeleton:

```html
<!-- Case studies bento grid -->
<div class="px-6 md:px-12 pb-14">
  <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#555555] mb-4">Case studies</p>
  <div class="cs-bento">
    <!-- Top row: 3 cards -->
    <div class="cs-card" data-overlay="0" tabindex="0" role="group" aria-label="Case study 1 of 5">
      <div class="cs-scene" id="scene-1"><!-- Card 1 scene goes here --></div>
      <div class="cs-body">
        <div class="cs-loc">Greenville, SC</div>
        <div class="cs-title">False Arrest from ALPR Error</div>
        <div class="cs-blurb">A misread scan flagged an innocent driver as a stolen vehicle match. Charges were later dropped.</div>
      </div>
      <div class="cs-num">01</div>
    </div>
    <div class="cs-card" data-overlay="1" tabindex="0" role="group" aria-label="Case study 2 of 5">
      <div class="cs-scene" id="scene-2"><!-- Card 2 scene goes here --></div>
      <div class="cs-body">
        <div class="cs-loc">Ventura County, CA</div>
        <div class="cs-title">364,000 Out-of-State Queries</div>
        <div class="cs-blurb">ALPR data shared with agencies across the country, without oversight or consent.</div>
      </div>
      <div class="cs-num">02</div>
    </div>
    <div class="cs-card" data-overlay="2" tabindex="0" role="group" aria-label="Case study 3 of 5">
      <div class="cs-scene" id="scene-3"><!-- Card 3 scene goes here --></div>
      <div class="cs-body">
        <div class="cs-loc">Santa Cruz, CA</div>
        <div class="cs-title">4,000 Federal Agency Searches</div>
        <div class="cs-blurb">Federal authorities ran thousands of unauthorized queries on local ALPR data.</div>
      </div>
      <div class="cs-num">03</div>
    </div>
    <!-- Bottom row: 2 cards -->
    <div class="cs-card" data-overlay="3" tabindex="0" role="group" aria-label="Case study 4 of 5">
      <div class="cs-scene" id="scene-4"><!-- Card 4 scene goes here --></div>
      <div class="cs-body">
        <div class="cs-loc">Spartanburg, SC</div>
        <div class="cs-title">Sheriff Convicted of Stalking</div>
        <div class="cs-blurb">A sitting sheriff used unrestricted ALPR access to track and stalk private citizens.</div>
      </div>
      <div class="cs-num">04</div>
    </div>
    <div class="cs-card" data-overlay="4" tabindex="0" role="group" aria-label="Case study 5 of 5">
      <div class="cs-scene cs-scene-placeholder" id="scene-5">
        <!-- Placeholder: faint camera outline, no animation -->
      </div>
      <div class="cs-body">
        <div class="cs-loc">Austin, TX</div>
        <div class="cs-title">Zero Measurable Crime Reduction</div>
        <div class="cs-blurb">An independent audit found ALPR cameras had zero statistical impact on crime rates.</div>
      </div>
      <div class="cs-num">05</div>
    </div>
  </div>
</div>
```

**Step 2: Replace carousel CSS with bento + card CSS**

Remove all `.carousel-*`, `.factoid-carousel`, `.read-more-text`, `.carousel-dot` styles (lines 106-223). Replace with:

```css
/* Bento grid */
.cs-bento {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  background: rgba(255,255,255,0.07);
}
.cs-card:nth-child(-n+3) { grid-column: span 2; }
.cs-card:nth-child(n+4)  { grid-column: span 3; }

/* Card shell */
.cs-card {
  background: #111;
  cursor: pointer;
  transition: background 0.22s;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
.cs-card:hover { background: #1a1a1a; }

/* Scene panel */
.cs-scene {
  position: relative;
  height: 180px;
  overflow: hidden;
  background: #0d0d0d;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  transition: border-color 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cs-card:hover .cs-scene { border-color: rgba(220,38,38,0.22); }

/* Card body */
.cs-body {
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}
.cs-loc {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #dc2626;
}
.cs-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e2e2;
  line-height: 1.35;
}
.cs-blurb {
  font-size: 11px;
  color: rgba(255,255,255,0.38);
  line-height: 1.55;
}
.cs-num {
  position: absolute;
  top: 9px;
  right: 10px;
  font-family: 'DM Mono', monospace;
  font-size: 8px;
  color: rgba(255,255,255,0.14);
}

/* Mobile: single column */
@media (max-width: 767px) {
  .cs-bento { grid-template-columns: 1fr; }
  .cs-card:nth-child(-n+3),
  .cs-card:nth-child(n+4) { grid-column: span 1; }
}
```

**Step 3: Remove carousel script import**

Delete the `<script>import '../scripts/carousel';</script>` block at the bottom of the file.

**Step 4: Verify**

Navigate to homepage, scroll to How It Works. Should see 5 empty card shells in the 3+2 grid. No console errors. Overlays won't work yet (no click handler).

**Step 5: Commit**

```
feat: scaffold case study bento grid, remove carousel
```

---

## Task 2: Port overlay logic to new script

**Files:**
- Create: `src/scripts/case-studies.ts`
- Modify: `src/components/HowItWorks.astro` (add script import)
- Keep: `src/scripts/carousel.ts` (don't delete yet — will clean up later)

**Step 1: Create case-studies.ts with overlay logic only**

Port lines 139-216 from carousel.ts (overlay code: backdrop, panel show/hide, focus trap, Escape key, Enter/Space on cards). Replace `.carousel-card` selector with `.cs-card`. Remove all carousel-specific code (track, dots, arrows, auto-advance, swipe).

```typescript
/**
 * Case studies card interactions: overlay panels + Card 2 asymmetric hover.
 */

// --- Overlays ---

const cards = document.querySelectorAll('.cs-card');
const backdrop = document.getElementById('overlayBackdrop');
const overlayPanels = document.querySelectorAll('.overlay-panel');
const closeBtns = document.querySelectorAll('.overlay-close');
let previouslyFocused: Element | null = null;

function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const panel = e.currentTarget as HTMLElement;
  const focusable = panel.querySelectorAll(
    'button, a[href], [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>;
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

cards.forEach(card => {
  card.addEventListener('click', () => {
    previouslyFocused = document.activeElement;
    const idx = card.getAttribute('data-overlay');
    overlayPanels.forEach(p => {
      p.classList.remove('active');
      p.removeEventListener('keydown', trapFocus);
    });
    const panel = document.querySelector(`[data-overlay-panel="${idx}"]`);
    panel?.classList.add('active');
    backdrop?.classList.add('active');
    document.body.style.overflow = 'hidden';
    const closeBtn = panel?.querySelector('.overlay-close') as HTMLElement;
    closeBtn?.focus();
    panel?.addEventListener('keydown', trapFocus);
  });

  // Enter/Space opens overlay
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
});

function closeOverlay() {
  backdrop?.classList.remove('active');
  overlayPanels.forEach(p => {
    p.classList.remove('active');
    p.removeEventListener('keydown', trapFocus);
  });
  document.body.style.overflow = '';
  if (previouslyFocused instanceof HTMLElement) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

closeBtns.forEach(btn => btn.addEventListener('click', closeOverlay));
backdrop?.addEventListener('click', (e) => {
  if (e.target === backdrop) closeOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay();
});
```

**Step 2: Add script import to HowItWorks.astro**

At the bottom of the file (where the old `<script>` block was), add:

```html
<script>
  import '../scripts/case-studies';
</script>
```

**Step 3: Verify overlays**

Click each card in the bento grid. The corresponding overlay panel should open. Close with X button, backdrop click, or Escape. Focus should return to the card.

**Step 4: Commit**

```
feat: port overlay logic to case-studies.ts, wire bento cards
```

---

## Task 3: Card 1 — False Match scene (Greenville)

**Files:**
- Modify: `src/components/HowItWorks.astro` (add scene HTML + CSS)

**Step 1: Add scene markup inside `#scene-1`**

Two license plates (HTML divs, not SVG) with OCR-confusable B/8 difference:

```html
<div class="s1-wrap">
  <div class="s1-plate s1-back">
    <div class="s1-tag">DATABASE ENTRY</div>
    <div class="s1-num">GHP·4B92</div>
    <div class="s1-state">SOUTH CAROLINA</div>
  </div>
  <div class="s1-plate s1-front">
    <div class="s1-tag">ALPR SCAN</div>
    <div class="s1-num">GHP·4892</div>
    <div class="s1-state">SOUTH CAROLINA</div>
  </div>
  <div class="s1-neq">≠</div>
  <div class="s1-badge"><span class="s1-dot"></span>FALSE MATCH · ARREST MADE</div>
</div>
```

**Step 2: Add CSS for Card 1**

```css
/* Card 1 — False Match */
.s1-wrap { position: relative; width: 210px; height: 126px; }
.s1-plate {
  position: absolute; width: 174px; border-radius: 3px;
  padding: 8px 14px 10px; display: flex; flex-direction: column;
  align-items: center; gap: 3px;
  transition: transform 0.48s ease-out, opacity 0.48s ease-out, box-shadow 0.48s ease-out;
}
.s1-tag { font-family: 'DM Mono',monospace; font-size: 7px; letter-spacing: 0.14em; color: rgba(255,255,255,0.22); }
.s1-num { font-family: 'DM Mono',monospace; font-size: 22px; font-weight: 500; letter-spacing: 0.06em; color: #e2e2e2; line-height: 1; }
.s1-state { font-family: 'DM Mono',monospace; font-size: 8px; letter-spacing: 0.16em; color: rgba(255,255,255,0.28); }

/* Back plate = DATABASE (shows 4B92) */
.s1-back { top: 0; left: 0; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.08); opacity: 0.42; z-index: 1; }
/* Front plate = ALPR SCAN (shows 4892) */
.s1-front { top: 28px; left: 22px; background: #151515; border: 1px solid rgba(255,255,255,0.28); z-index: 2; box-shadow: 0 4px 18px rgba(0,0,0,0.55); }

.cs-card:hover .s1-back  { transform: translate(-12px,-12px); opacity: 0.62; }
.cs-card:hover .s1-front { transform: translate(10px,10px); box-shadow: 0 12px 36px rgba(0,0,0,0.8); }

/* ≠ indicator */
.s1-neq {
  position: absolute; top: 28px; left: 78px; z-index: 3;
  font-size: 16px; font-family: 'DM Mono',monospace;
  color: transparent; transition: color 0.28s 0.24s; pointer-events: none;
}
.cs-card:hover .s1-neq { color: rgba(220,38,38,0.8); }

/* FALSE MATCH badge */
.s1-badge {
  position: absolute; bottom: 2px; right: 0; z-index: 4;
  display: flex; align-items: center; gap: 5px; padding: 4px 8px;
  background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.32); border-radius: 2px;
  font-family: 'DM Mono',monospace; font-size: 8px; letter-spacing: 0.1em; color: #dc2626;
  opacity: 0; transform: scale(0.88) translateY(4px);
  transition: opacity 0.3s 0.38s, transform 0.3s 0.38s; white-space: nowrap;
}
.s1-dot { width: 5px; height: 5px; border-radius: 50%; background: #dc2626; flex-shrink: 0; }
.cs-card:hover .s1-badge { opacity: 1; transform: scale(1) translateY(0); }
```

**Step 3: Verify** — hover Card 1: plates separate revealing B/8 difference, ≠ fades in, badge appears.

**Step 4: Commit**

```
feat: add Card 1 False Match scene (license plate parallax)
```

---

## Task 4: Card 2 — Data Web scene (Ventura County)

**Files:**
- Modify: `src/components/HowItWorks.astro` (scene HTML + CSS)
- Modify: `src/scripts/case-studies.ts` (asymmetric hover-off JS)

This is the most complex card. Three-phase animation with asymmetric hover-off.

**Step 1: Create the SVG map**

Inside `#scene-2`, add an SVG with:
- A container group (`g.s2-map`) that starts at `transform: scale(2.5)` (zoomed into CA)
- CA outline path (prominent, always visible)
- Simplified lower-48 boundary path (very dim, fades in on hover)
- ~20-25 quadratic arc paths from CA's center to other state locations

The SVG should use `viewBox="0 0 960 600"` (standard US map proportions) with `preserveAspectRatio="xMidYMid meet"`. CA center is approximately `(120, 350)`.

Arc destinations (approximate coordinates for key states):
```
TX(480,480), FL(780,480), NY(820,180), IL(600,240),
GA(720,400), OH(680,220), PA(760,200), MI(640,180),
NC(760,340), VA(740,280), WA(140,100), OR(110,170),
AZ(250,420), NV(170,280), CO(350,300), MN(520,140),
MO(560,320), TN(670,350), SC(740,370), AL(680,420),
IN(640,250), NJ(790,210), MA(840,165), MD(760,260)
```

Each arc line is:
```svg
<path class="s2-arc s2-arc-N" d="M120,350 Q{midX},{midY} {endX},{endY}"
  fill="none" stroke="rgba(220,38,38,0.5)" stroke-width="1"
  stroke-dasharray="200" stroke-dashoffset="200"/>
```

The `Q` control point should be offset upward from the midpoint to create a nice curve:
```
midX = (120 + endX) / 2
midY = Math.min(startY, endY) - 60  // arc above the straight line
```

**Step 2: Add CSS for zoom + line draw + fade**

```css
/* Card 2 — Data Web */
.s2-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }

.s2-map {
  transition: transform 0.65s ease-out;
  transform: scale(2.5);
  transform-origin: 120px 350px; /* CA center */
}
.cs-card:hover .s2-map { transform: scale(1); }

/* Lower-48 outline (fades in as zoom completes) */
.s2-states { opacity: 0; transition: opacity 0.4s 0.2s; }
.cs-card:hover .s2-states { opacity: 0.15; }

/* CA outline (always visible, just brighter on hover) */
.s2-ca { opacity: 0.6; transition: opacity 0.3s; }
.cs-card:hover .s2-ca { opacity: 1; }

/* Arc lines — draw forward on hover */
.s2-arc {
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  transition: stroke-dashoffset 0.5s ease-out;
}

/* Stagger: first batch (4-5 lines) early, rest cascade */
.s2-arc-1  { transition-delay: 0.30s; }
.s2-arc-2  { transition-delay: 0.35s; }
.s2-arc-3  { transition-delay: 0.40s; }
.s2-arc-4  { transition-delay: 0.45s; }
.s2-arc-5  { transition-delay: 0.50s; }
.s2-arc-6  { transition-delay: 0.55s; }
.s2-arc-7  { transition-delay: 0.58s; }
.s2-arc-8  { transition-delay: 0.62s; }
.s2-arc-9  { transition-delay: 0.65s; }
.s2-arc-10 { transition-delay: 0.68s; }
.s2-arc-11 { transition-delay: 0.72s; }
.s2-arc-12 { transition-delay: 0.76s; }
.s2-arc-13 { transition-delay: 0.78s; }
.s2-arc-14 { transition-delay: 0.80s; }
.s2-arc-15 { transition-delay: 0.82s; }
.s2-arc-16 { transition-delay: 0.85s; }
.s2-arc-17 { transition-delay: 0.88s; }
.s2-arc-18 { transition-delay: 0.90s; }
.s2-arc-19 { transition-delay: 0.92s; }
.s2-arc-20 { transition-delay: 0.95s; }

.cs-card:hover .s2-arc { stroke-dashoffset: 0; }

/* Asymmetric hover-off: when .s2-fading class present, lines fade via opacity */
.s2-arc.s2-fading {
  transition: opacity 0.3s ease-out !important;
  stroke-dashoffset: 0;  /* keep drawn */
  opacity: 0;
}
```

**Step 3: Add JS for asymmetric hover-off**

In `case-studies.ts`, add after overlay code:

```typescript
// --- Card 2: asymmetric hover-off ---
const card2 = document.querySelector('.cs-card[data-overlay="1"]');
const arcs = card2?.querySelectorAll('.s2-arc') ?? [];

card2?.addEventListener('mouseenter', () => {
  // Remove fading class so lines draw normally
  arcs.forEach(arc => arc.classList.remove('s2-fading'));
});

card2?.addEventListener('mouseleave', () => {
  // Add fading class so lines fade via opacity instead of retracing
  arcs.forEach(arc => arc.classList.add('s2-fading'));
  // After fade completes, reset for next hover
  setTimeout(() => {
    arcs.forEach(arc => {
      arc.classList.remove('s2-fading');
      // Reset dashoffset to 200 so next hover draws again
      // Force a reflow between removing class and resetting
      (arc as SVGElement).style.transition = 'none';
      arc.setAttribute('stroke-dashoffset', '200');
      // Re-enable transitions on next frame
      requestAnimationFrame(() => {
        (arc as SVGElement).style.transition = '';
      });
    });
  }, 350); // match fade duration
});
```

**Step 4: Add source dot + counter label**

```html
<!-- Inside the SVG, after arcs -->
<circle cx="120" cy="350" r="6" fill="#dc2626" opacity="0.8"/>
<text class="s2-label" x="120" y="380" text-anchor="middle"
  font-family="DM Mono,monospace" font-size="12" fill="rgba(255,255,255,0.2)">
  364,000 QUERIES
</text>
```

```css
.s2-label { opacity: 0; transition: opacity 0.3s 1.0s; }
.cs-card:hover .s2-label { opacity: 1; }
```

**Step 5: Verify**

Hover Card 2:
1. Map zooms out from CA to show full US
2. State outlines fade in
3. First few arcs draw from CA to nearby states
4. Dense spray of remaining arcs cascades across the map
5. "364,000 QUERIES" label fades in last

On hover-off:
1. Map zooms back into CA (normal reverse)
2. Lines FADE OUT (don't retrace)
3. Label disappears

**Step 6: Commit**

```
feat: add Card 2 data web scene (US map zoom + cascading arcs)
```

---

## Task 5: Card 3 — File Stack scene (Santa Cruz)

**Files:**
- Modify: `src/components/HowItWorks.astro` (scene HTML + CSS)

**Step 1: Add scene markup inside `#scene-3`**

Three stacked document divs + federal shield SVG at highest z-index:

```html
<div class="s3-wrap">
  <div class="s3-doc s3-doc-1">
    <div class="s3-hdr">CASE FILE</div>
    <div class="s3-line w88"></div><div class="s3-line w72"></div>
    <div class="s3-line w55"></div><div class="s3-line w80"></div>
  </div>
  <div class="s3-doc s3-doc-2">
    <div class="s3-hdr">QUERY LOG</div>
    <div class="s3-line w88"></div><div class="s3-line w72"></div>
    <div class="s3-line w55"></div><div class="s3-line w80"></div>
  </div>
  <div class="s3-doc s3-doc-3">
    <div class="s3-hdr">AUTH. RECORD</div>
    <div class="s3-line w88"></div><div class="s3-line w72"></div>
    <div class="s3-line w55"></div><div class="s3-line w80"></div>
  </div>
  <div class="s3-shield">
    <svg width="38" height="44" viewBox="0 0 38 44">
      <path d="M19,2 L35,8 L35,22 C35,33 19,42 19,42 C19,42 3,33 3,22 L3,8 Z"
        fill="rgba(220,38,38,0.1)" stroke="rgba(220,38,38,0.5)" stroke-width="1.2"/>
      <text x="19" y="20" text-anchor="middle" font-family="DM Mono,monospace"
        font-size="7" fill="rgba(220,38,38,0.8)">FED.</text>
      <text x="19" y="30" text-anchor="middle" font-family="DM Mono,monospace"
        font-size="5.5" fill="rgba(220,38,38,0.6)">AUTHORITY</text>
    </svg>
  </div>
</div>
```

**Step 2: Add CSS**

```css
/* Card 3 — File Stack */
.s3-wrap { position: relative; width: 196px; height: 138px; }
.s3-doc {
  position: absolute; width: 155px; height: 106px; border-radius: 3px;
  padding: 9px 12px; overflow: hidden;
}
.s3-doc-1 { bottom: 0; left: 0; background: rgba(10,10,10,0.9); border: 1px solid rgba(255,255,255,0.06); z-index: 1; transform: rotate(3.5deg); transition: transform 0.46s ease-out; }
.s3-doc-2 { bottom: 14px; left: 14px; background: rgba(13,13,13,0.95); border: 1px solid rgba(255,255,255,0.09); z-index: 2; transform: rotate(1.5deg); transition: transform 0.46s 0.04s ease-out; }
.s3-doc-3 { bottom: 28px; left: 28px; background: #161616; border: 1px solid rgba(255,255,255,0.16); z-index: 3; box-shadow: 0 4px 18px rgba(0,0,0,0.6); transition: transform 0.46s ease-out, box-shadow 0.46s ease-out; }

.cs-card:hover .s3-doc-1 { transform: rotate(5deg) translate(-4px,4px); }
.cs-card:hover .s3-doc-2 { transform: rotate(2.5deg) translate(-2px,2px); }
.cs-card:hover .s3-doc-3 { transform: translateY(-18px); box-shadow: 0 20px 44px rgba(0,0,0,0.88); }

.s3-hdr { font-family: 'DM Mono',monospace; font-size: 7px; letter-spacing: 0.12em; color: rgba(255,255,255,0.2); margin-bottom: 8px; }
.s3-line { height: 3px; border-radius: 2px; background: rgba(255,255,255,0.07); margin: 4px 0; }
.s3-line.w88 { width: 88%; } .s3-line.w72 { width: 72%; }
.s3-line.w55 { width: 55%; } .s3-line.w80 { width: 80%; }

/* Federal shield — HIGHEST z-index, above all docs */
.s3-shield {
  position: absolute; right: 6px; bottom: 10px; z-index: 10;
  opacity: 0; transform: scale(0.72) translateY(6px);
  transition: opacity 0.34s 0.3s, transform 0.34s 0.3s;
}
.cs-card:hover .s3-shield { opacity: 1; transform: scale(1) translateY(0); }
```

**Step 3: Verify** — hover Card 3: top doc lifts, docs fan out, federal shield appears ON TOP of everything.

**Step 4: Commit**

```
feat: add Card 3 file stack scene (Santa Cruz)
```

---

## Task 6: Card 4 — Badge + Stamp scene (Spartanburg)

**Files:**
- Modify: `src/components/HowItWorks.astro` (scene HTML + CSS)

**Step 1: Add SVG scene inside `#scene-4`**

Full inline SVG with three layer groups (record, badge, stamp):

```html
<svg class="s4-svg" viewBox="0 0 200 180" preserveAspectRatio="xMidYMid meet"
  style="position:absolute;inset:0;width:100%;height:100%;">
  <!-- Far: personnel record lines -->
  <g class="s4-record">
    <text x="28" y="36" font-family="DM Mono,monospace" font-size="7"
      fill="rgba(255,255,255,0.18)" letter-spacing="2">PERSONNEL RECORD</text>
    <rect x="28" y="44" width="80" height="3" rx="1.5" fill="rgba(255,255,255,0.08)"/>
    <rect x="28" y="54" width="62" height="3" rx="1.5" fill="rgba(255,255,255,0.08)"/>
    <rect x="28" y="64" width="74" height="3" rx="1.5" fill="rgba(255,255,255,0.08)"/>
    <rect x="28" y="74" width="50" height="3" rx="1.5" fill="rgba(255,255,255,0.08)"/>
    <text x="28" y="94" font-family="DM Mono,monospace" font-size="6"
      fill="rgba(255,255,255,0.12)" letter-spacing="1">ROLE · SHERIFF</text>
    <text x="28" y="106" font-family="DM Mono,monospace" font-size="6"
      fill="rgba(255,255,255,0.12)" letter-spacing="1">ACCESS · UNRESTRICTED</text>
  </g>
  <!-- Mid: sheriff star badge -->
  <g class="s4-badge">
    <circle cx="148" cy="110" r="34" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <polygon points="148,79 154,96 172,96 158,107 163,124 148,113 133,124 138,107 124,96 142,96"
      fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>
    <circle cx="148" cy="105" r="10" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <text x="148" y="108" text-anchor="middle" font-family="DM Mono,monospace"
      font-size="5" fill="rgba(255,255,255,0.25)" letter-spacing="0.5">SHERIFF</text>
  </g>
  <!-- Near: CONVICTED stamp -->
  <g class="s4-stamp">
    <rect x="30" y="88" width="140" height="40" rx="3"
      fill="rgba(220,38,38,0.08)" stroke="rgba(220,38,38,0.6)" stroke-width="1.5"/>
    <text x="100" y="108" text-anchor="middle" font-family="DM Mono,monospace"
      font-size="20" font-weight="500" fill="#dc2626" letter-spacing="2">CONVICTED</text>
    <text x="100" y="122" text-anchor="middle" font-family="DM Mono,monospace"
      font-size="8" fill="rgba(220,38,38,0.7)" letter-spacing="3">FEDERAL CHARGE</text>
  </g>
</svg>
```

**Step 2: Add CSS**

```css
/* Card 4 — Badge + Stamp */
.s4-record { transition: transform 0.52s ease-out; opacity: 0.55; }
.cs-card:hover .s4-record { transform: translate(-4px,3px); }

.s4-badge { transition: transform 0.46s ease-out; }
.cs-card:hover .s4-badge { transform: translate(3px,-3px); }

.s4-stamp {
  opacity: 0; transform: rotate(-25deg) scale(0.8);
  transform-box: fill-box; transform-origin: center center;
  transition: opacity 0.42s 0.15s, transform 0.42s 0.15s cubic-bezier(0.34,1.56,0.64,1);
}
.cs-card:hover .s4-stamp { opacity: 1; transform: rotate(-12deg) scale(1); }
```

**Step 3: Verify** — hover Card 4: record drifts back, badge shifts, stamp rotates in with spring.

**Step 4: Commit**

```
feat: add Card 4 badge + stamp scene (Spartanburg)
```

---

## Task 7: Card 5 placeholder + cleanup

**Files:**
- Modify: `src/components/HowItWorks.astro` (add placeholder SVG)
- Delete: `src/scripts/carousel.ts`

**Step 1: Add placeholder to `#scene-5`**

A faint camera outline centered in the scene:

```html
<svg viewBox="0 0 60 50" width="60" height="50" style="opacity: 0.08;">
  <rect x="0" y="12" width="60" height="38" rx="3"
    fill="none" stroke="white" stroke-width="2"/>
  <rect x="18" y="5" width="20" height="8" rx="2"
    fill="none" stroke="white" stroke-width="2"/>
  <circle cx="30" cy="31" r="11"
    fill="none" stroke="white" stroke-width="2"/>
</svg>
```

**Step 2: Delete carousel.ts**

Confirmed in Task 1 that it's only imported in HowItWorks.astro (which now imports case-studies.ts instead).

```bash
git rm src/scripts/carousel.ts
```

**Step 3: Verify full section**

Navigate to homepage. Hover all 5 cards. Verify:
- Cards 1-4 animate correctly
- Card 5 shows faint camera icon, no animation
- Clicking any card opens the correct overlay
- Mobile (375px) stacks single-column
- No console errors

**Step 4: Commit**

```
feat: add Card 5 placeholder, delete carousel.ts
```

---

## Checklist

- [ ] Carousel markup/CSS/script fully removed from HowItWorks.astro
- [ ] Bento 3+2 grid renders correctly (6-col grid with span 2/3)
- [ ] Card 1: plates separate showing B/8 misread, badge appears
- [ ] Card 2: CA zooms out to US map, arcs cascade, lines FADE on hover-off (not retrace)
- [ ] Card 3: docs fan out, federal shield appears ON TOP (z-index 10)
- [ ] Card 4: record drifts, badge shifts, stamp springs in
- [ ] Card 5: placeholder with faint camera, no animation
- [ ] No "ICE" anywhere on Card 3
- [ ] Overlays work (click card → panel opens, Escape/backdrop closes)
- [ ] Mobile single-column layout at 375px
- [ ] carousel.ts deleted
