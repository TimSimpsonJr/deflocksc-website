# Scroll Reveal Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add subtle scroll-triggered entrance animations to headlines and major elements across all homepage sections.

**Architecture:** A lightweight data-attribute system (`data-reveal`, `data-reveal-delay`) with CSS transitions in `global.css` and a single `IntersectionObserver` in `Base.astro`. Each component gets attributes on its key elements. Zero dependencies.

**Tech Stack:** CSS transitions, IntersectionObserver API, Astro components

**Design doc:** `docs/plans/2026-03-07-scroll-reveal-design.md`

---

### Task 1: Add reveal CSS to global.css

**Files:**
- Modify: `src/styles/global.css`

**Step 1: Add the reveal transition CSS at the end of `global.css`**

After the existing `.sidebar-active` rules, add:

```css
/* ── Scroll-reveal entrance animations ── */
@media (prefers-reduced-motion: no-preference) {
  [data-reveal] {
    opacity: 0;
    transition: opacity 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  [data-reveal="up"]    { transform: translateY(24px); }
  [data-reveal="down"]  { transform: translateY(-24px); }
  [data-reveal="left"]  { transform: translateX(-24px); }
  [data-reveal="right"] { transform: translateX(24px); }

  [data-reveal].revealed {
    opacity: 1;
    transform: translate(0, 0);
  }

  /* Stagger delay tiers */
  [data-reveal-delay="1"] { transition-delay: 80ms; }
  [data-reveal-delay="2"] { transition-delay: 160ms; }
  [data-reveal-delay="3"] { transition-delay: 240ms; }
  [data-reveal-delay="4"] { transition-delay: 320ms; }
}
```

**Step 2: Verify no syntax errors**

Run: `node node_modules/astro/astro.js check` (or just confirm the dev server has no errors via preview_logs)

**Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add scroll-reveal CSS transition system"
```

---

### Task 2: Add IntersectionObserver script to Base.astro

**Files:**
- Modify: `src/layouts/Base.astro`

**Step 1: Add the observer script before the closing `</body>` tag**

Insert before `</body>` (after `<ActionModal />`):

```html
<script>
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
  } else {
    // Reduced motion: make everything visible immediately
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('revealed'));
  }
</script>
```

**Step 2: Verify the dev server still loads without errors**

Check preview_console_logs for errors. The observer won't do anything visible yet since no elements have `data-reveal` attributes.

**Step 3: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: add IntersectionObserver for scroll-reveal"
```

---

### Task 3: Add reveal attributes to Hero.astro

**Files:**
- Modify: `src/components/Hero.astro`

**Step 1: Add `data-reveal` attributes to the hero content elements**

The hero content is in the bottom content `<div>` (line 84–101). Add attributes to these elements:

1. The red separator bar (`<div class="w-8 h-[2px]...">`, line 86): `data-reveal="up"`
2. The `<h1>` (line 87): `data-reveal="up" data-reveal-delay="1"`
3. The bold subtext `<p>` (line 90): `data-reveal="up" data-reveal-delay="2"`
4. The body text `<p>` (line 93): `data-reveal="up" data-reveal-delay="3"`
5. The CTA `<button>` (line 96): `data-reveal="up" data-reveal-delay="4"`

**Do NOT** add reveal to the camera image, light cones, glitch bars, or metadata bar — these are decorative/ambient and should remain as-is.

**Step 2: Verify in preview**

Reload the page. The hero content should fade up with staggered timing. Check that:
- Elements start invisible, then animate in
- Stagger feels natural (each element ~80ms after the previous)
- The camera/cones/glitch still work normally

**Step 3: Commit**

```bash
git add src/components/Hero.astro
git commit -m "feat: add scroll-reveal to Hero section"
```

---

### Task 4: Add reveal attributes to HowItWorks.astro

**Files:**
- Modify: `src/components/HowItWorks.astro`

**Step 1: Add `data-reveal` attributes to the section header and grid**

1. The mono label `<p>` (line 10, "How it works"): `data-reveal="left"`
2. The `<h2>` heading (line 11): `data-reveal="left" data-reveal-delay="1"`
3. The pipeline grid container `<div class="pipeline-grid...">` (line 17): `data-reveal="up" data-reveal-delay="2"`
4. The "Case studies" mono label `<p>` (line 53): `data-reveal="left"`
5. The bento grid container `<div class="cs-bento">` (line 54): `data-reveal="up" data-reveal-delay="1"`

**Step 2: Verify in preview**

Scroll to the HowItWorks section. Header should slide in from the left, grid and bento should rise from below.

**Step 3: Commit**

```bash
git add src/components/HowItWorks.astro
git commit -m "feat: add scroll-reveal to HowItWorks section"
```

---

### Task 5: Add reveal attributes to MapSection.astro

**Files:**
- Modify: `src/components/MapSection.astro`

**Step 1: Add `data-reveal` attributes**

In the left heading area (lines 15–39):
1. The mono label `<p>` (line 16, "Upstate SC / Camera Network"): `data-reveal="right"`
2. The `<h2>` heading (line 17): `data-reveal="right" data-reveal-delay="1"`
3. The copy container `<div class="space-y-5...">` (line 23): `data-reveal="right" data-reveal-delay="2"`

In the stat column (line 43, `<div class="hidden md:flex..."`):
4. The stat column div: `data-reveal="left"`

In the map intro bar (line 65):
5. The map intro div: `data-reveal="up"`

**Do NOT** add reveal to the map container itself — it has its own lazy-load IntersectionObserver.

**Step 2: Verify in preview**

Scroll to the map section. Heading/copy should slide in from the right, stat column from the left.

**Step 3: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat: add scroll-reveal to MapSection"
```

---

### Task 6: Add reveal attributes to BillTracker.astro

**Files:**
- Modify: `src/components/BillTracker.astro`

**Step 1: Add `data-reveal` attributes**

In the section header (lines 8–21):
1. The mono label `<p>` (line 10, "Active legislation"): `data-reveal="left"`
2. The `<h2>` heading (line 11): `data-reveal="left" data-reveal-delay="1"`
3. The first `<p>` body text (line 15): `data-reveal="left" data-reveal-delay="2"`
4. The second `<p>` body text (line 18): `data-reveal="left" data-reveal-delay="3"`

For the bill grid, wrap each bill card with a stagger. The bills are rendered with `.map()` so add `data-reveal="up"` and a computed delay to each `<button>`:

5. Each bill `<button>` (line 26): `data-reveal="up" data-reveal-delay={String(i)}`

This gives bill 0 delay=0, bill 1 delay=1, bill 2 delay=2.

**Step 2: Verify in preview**

Scroll to BillTracker. Header slides from the left, bill cards rise from below with stagger.

**Step 3: Commit**

```bash
git add src/components/BillTracker.astro
git commit -m "feat: add scroll-reveal to BillTracker section"
```

---

### Task 7: Add reveal attributes to FAQ.astro

**Files:**
- Modify: `src/components/FAQ.astro`

**Step 1: Add `data-reveal` attributes**

In the section header (lines 38–43):
1. The mono label `<p>` (line 39, "Common objections"): `data-reveal="up"`
2. The `<h2>` heading (line 40): `data-reveal="up" data-reveal-delay="1"`

In the sidebar + panel layout (lines 46–79):
3. The sidebar container `<div class="faq-sidebar...">` (line 49): `data-reveal="left"`
4. The answer panel `<div class="faq-answer-panel...">` (line 66): `data-reveal="right" data-reveal-delay="1"`

**Step 2: Verify in preview**

Scroll to FAQ. Header fades up, sidebar slides in from left, answer panel from right.

**Step 3: Commit**

```bash
git add src/components/FAQ.astro
git commit -m "feat: add scroll-reveal to FAQ section"
```

---

### Task 8: Add reveal attributes to TakeAction.astro

**Files:**
- Modify: `src/components/TakeAction.astro`

**Step 1: Add `data-reveal` attributes**

1. The mono label `<p>` (line 9): `data-reveal="right"`
2. The `<h2>` heading (line 10): `data-reveal="right" data-reveal-delay="1"`
3. The CTA row `<div class="flex flex-col...">` (line 15): `data-reveal="up" data-reveal-delay="2"`

**Step 2: Verify in preview**

Scroll to TakeAction. Heading slides in from the right, CTA row rises from below.

**Step 3: Commit**

```bash
git add src/components/TakeAction.astro
git commit -m "feat: add scroll-reveal to TakeAction section"
```

---

### Task 9: Add reveal attributes to Footer.astro

**Files:**
- Modify: `src/components/Footer.astro`

**Step 1: Add `data-reveal="up"` to the footer content container**

The footer should have a single subtle fade-up on its main content wrapper. Read the file first to identify the right element, then add `data-reveal="up"` to the outermost content container inside the `<footer>`.

**Step 2: Verify in preview**

Scroll to the very bottom. Footer content should gently fade up.

**Step 3: Commit**

```bash
git add src/components/Footer.astro
git commit -m "feat: add scroll-reveal to Footer"
```

---

### Task 10: Full-page scroll-through verification

**Files:** None (verification only)

**Step 1: Full page scroll test**

Using the preview tool, reload the page from the top and scroll through every section. Check:
- Hero content fades up on load
- Each subsequent section animates as it enters the viewport
- No flash of unstyled content (FOUC) — elements should not briefly appear then disappear
- Animations fire once and don't re-trigger on scroll back up
- No horizontal scrollbar introduced by translateX animations (sections have `overflow-hidden`)

**Step 2: Check reduced motion**

Using preview_eval, simulate reduced motion:
```js
document.documentElement.style.setProperty('--test', '1');
```
Actually, test by checking that the CSS media query gate works: with `prefers-reduced-motion: reduce`, elements should appear immediately with no animation. Verify by inspecting that `[data-reveal]` elements without `.revealed` still show if reduced motion is active (the CSS only hides them inside the `@media (prefers-reduced-motion: no-preference)` block).

**Step 3: Mobile check**

Use preview_resize to test mobile (375px). Confirm:
- No horizontal overflow from translateX animations
- Animations still work and look good on narrow screens

**Step 4: Commit (if any fixes needed)**

Only if fixes were required during verification.

---

### Task 11: Clean up mockup file

**Files:**
- Delete: `public/mockup-animations.html`

**Step 1: Remove the mockup**

```bash
rm public/mockup-animations.html
```

This was a temporary comparison file and shouldn't ship.

**Step 2: Commit**

```bash
git add -u public/mockup-animations.html
git commit -m "chore: remove animation mockup file"
```
