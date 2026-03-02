# Action Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the inline Take Action widget into a full-screen modal overlay triggered by buttons throughout the site.

**Architecture:** Split `TakeAction.astro` into two components: a thin inline CTA section (`TakeAction.astro`) and a full-screen modal (`ActionModal.astro`). The modal renders in `Base.astro` outside `<main>`. Trigger buttons use `data-open-action` attributes. Nav and Hero links change from `#take-action` anchors to modal openers.

**Tech Stack:** Astro 5, Tailwind CSS 4, vanilla JS (no framework)

**Design doc:** `docs/plans/2026-03-02-action-modal-design.md`

---

### Task 1: Create ActionModal.astro with overlay shell

Extract the widget from `TakeAction.astro` into a new `ActionModal.astro` component with the full-screen overlay wrapper.

**Files:**
- Create: `src/components/ActionModal.astro`
- Modify: `src/components/TakeAction.astro`

**Step 1: Create `src/components/ActionModal.astro`**

Move all the widget markup and script from `TakeAction.astro` into this new file. Wrap it in the full-screen overlay container.

The overlay wrapper structure:

```html
<div id="action-modal" class="fixed inset-0 z-[60] bg-[#0f172a] overflow-y-auto hidden"
     role="dialog" aria-modal="true" aria-label="Contact your representatives">
  <!-- Fixed close button -->
  <button id="action-modal-close" type="button"
    class="fixed top-4 right-4 z-10 w-10 h-10 rounded-full bg-[#1e293b] hover:bg-[#334155]
           text-[#94a3b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
    aria-label="Close">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <!-- Content container -->
  <div class="max-w-2xl mx-auto px-6 py-12 md:py-16">
    <!-- Paste the existing widget card div here (id="action-input", loading, results, error states) -->
    <!-- Remove the outer bg-[#0f172a] card wrapper since the overlay IS the background -->
  </div>
</div>
```

The frontmatter is identical to what's currently in `TakeAction.astro`:

```astro
---
import actionLetters from '../data/action-letters.json';
import stateLegislators from '../data/state-legislators.json';
import localCouncils from '../data/local-councils.json';
const civicApiKey = import.meta.env.PUBLIC_GOOGLE_CIVIC_API_KEY;
---
```

Move the entire `<script define:vars>` block from `TakeAction.astro` into this file. Add modal open/close logic to the script (see Task 3).

**Step 2: Strip `TakeAction.astro` down to thin CTA section**

Replace the current content of `TakeAction.astro` with:

```astro
---
---

<section id="take-action" class="py-20 md:py-28 bg-[#1e293b] relative overflow-hidden">
  <!-- Multi-glow effect (keep existing 3 glow divs unchanged) -->
  <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
    <div class="absolute top-[25%] left-[55%] -translate-x-1/2 -translate-y-1/2 w-[min(900px,90vw)] h-[500px] opacity-[0.25]"
      style="background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.6) 0%, rgba(29, 78, 216, 0.2) 40%, transparent 70%);">
    </div>
    <div class="absolute top-[70%] left-[40%] -translate-x-1/2 -translate-y-1/2 w-[min(700px,80vw)] h-[400px] opacity-[0.30]"
      style="background: radial-gradient(ellipse at center, rgba(96, 165, 250, 0.5) 0%, rgba(59, 130, 246, 0.15) 50%, transparent 80%);">
    </div>
    <div class="absolute top-[45%] left-[60%] -translate-x-1/2 -translate-y-1/2 w-[min(500px,60vw)] h-[300px] blur-[40px] opacity-[0.35]"
      style="background: radial-gradient(ellipse at center, rgba(147, 197, 253, 0.6) 0%, transparent 70%);">
    </div>
  </div>
  <div class="max-w-3xl mx-auto px-6 relative z-10 text-center">
    <h2 class="text-3xl md:text-4xl font-[900] text-white leading-tight mb-8">
      Tell Your Legislators: South Carolina Won't Be Watched Without a Vote.
    </h2>
    <p class="text-[#cbd5e1] text-lg leading-relaxed mb-10">
      Three bills are sitting in committee. Greenville has 30 cameras and no rules governing them.
      The quickest way to change that is to contact your legislators. Enter your address and we'll
      route your message to the right people automatically.
    </p>
    <button
      type="button"
      data-open-action
      class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer"
    >
      Email Your Legislators
    </button>
  </div>
</section>
```

Note: the section no longer has any `<script>` or data imports. It's purely presentational with a `data-open-action` trigger button.

**Step 3: Verify build passes**

Run: `node node_modules/astro/astro.js build`
Expected: Build succeeds (the modal isn't wired up yet, but both components should parse).

**Step 4: Commit**

```bash
git add src/components/ActionModal.astro src/components/TakeAction.astro
git commit -m "refactor: split TakeAction into thin CTA section + ActionModal overlay"
```

---

### Task 2: Wire ActionModal into Base.astro

**Files:**
- Modify: `src/layouts/Base.astro`

**Step 1: Import and render ActionModal**

Add the import to the frontmatter:

```astro
import ActionModal from '../components/ActionModal.astro';
```

Render it after `<Footer />` and before the spotlight script, outside `<main>`:

```astro
    <Footer />
    <ActionModal />

    <script>
```

**Step 2: Verify build passes**

Run: `node node_modules/astro/astro.js build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: render ActionModal in Base layout"
```

---

### Task 3: Add modal open/close logic

**Files:**
- Modify: `src/components/ActionModal.astro` (the `<script>` section)

**Step 1: Add open/close functions to the script**

Add these functions at the top of the `<script>` block, before the existing state management code:

```js
// --- Modal Management ---
var modal = document.getElementById('action-modal');
var openerElement = null; // tracks which button opened the modal for focus return

function openModal(opener) {
  if (!modal) return;
  openerElement = opener || null;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Focus the address input after a tick (let the DOM settle)
  requestAnimationFrame(function() {
    var input = document.getElementById('action-address');
    if (input) input.focus();
  });
}

function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  // Reset to input state for next open
  showState('input');
  // Return focus to the opener
  if (openerElement && typeof openerElement.focus === 'function') {
    openerElement.focus();
  }
  openerElement = null;
}
```

**Step 2: Add event listeners for triggers**

Add at the bottom of the `<script>` block:

```js
// --- Modal Triggers ---

// All elements with data-open-action open the modal
document.querySelectorAll('[data-open-action]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    openModal(btn);
  });
});

// Close button
document.getElementById('action-modal-close')?.addEventListener('click', closeModal);

// Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

// Click on backdrop (only if clicking the overlay itself, not content)
modal?.addEventListener('click', function(e) {
  if (e.target === modal) {
    closeModal();
  }
});
```

**Step 3: Add focus trap**

Add after the trigger listeners:

```js
// --- Focus Trap ---
modal?.addEventListener('keydown', function(e) {
  if (e.key !== 'Tab') return;
  var focusable = modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], details > summary'
  );
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
```

**Step 4: Verify modal opens and closes in dev server**

Run: `node node_modules/astro/astro.js dev --host 127.0.0.1`
- Click "Take Action" in nav → modal opens, address input focused
- Press Escape → modal closes
- Click Hero CTA → modal opens
- Scroll to Take Action section, click button → modal opens
- When results are loaded, Tab should cycle within the modal

**Step 5: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: add modal open/close logic with focus trap and a11y"
```

---

### Task 4: Update Nav trigger links

**Files:**
- Modify: `src/components/Nav.astro`

**Step 1: Change Nav "Take Action" links to buttons**

In the desktop nav, change:

```html
<a href="/#take-action" class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.1em] px-5 py-2.5 rounded transition-colors">Take Action</a>
```

to:

```html
<button type="button" data-open-action class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.1em] px-5 py-2.5 rounded transition-colors cursor-pointer">Take Action</button>
```

Same change in the mobile menu — change the `<a>` to a `<button>` with `data-open-action`. Match existing classes but add `cursor-pointer` and change to `<button>`.

Note: The mobile menu close logic currently uses `menu?.querySelectorAll('a')` to listen for link clicks and close the menu. Since we're replacing the `<a>` with a `<button>`, either:
- Change the selector to `menu?.querySelectorAll('a, button[data-open-action]')`, OR
- Add a click listener on the mobile `data-open-action` button that also closes the mobile menu

The simplest fix: change the mobile menu close selector from `'a'` to `'a, button'`.

**Step 2: Verify nav buttons open modal**

Run dev server, click "Take Action" in desktop nav → modal opens. Click in mobile menu → menu closes, modal opens.

**Step 3: Commit**

```bash
git add src/components/Nav.astro
git commit -m "feat: change nav Take Action links to modal trigger buttons"
```

---

### Task 5: Update Hero CTA

**Files:**
- Modify: `src/components/Hero.astro`

**Step 1: Change Hero CTA from anchor to button**

Change:

```html
<a href="#take-action" class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors">
  Email Your Legislators
</a>
```

to:

```html
<button type="button" data-open-action
  class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer">
  Email Your Legislators
</button>
```

**Step 2: Verify Hero CTA opens modal**

Click "Email Your Legislators" in Hero → modal opens.

**Step 3: Commit**

```bash
git add src/components/Hero.astro
git commit -m "feat: change hero CTA to modal trigger button"
```

---

### Task 6: Visual QA and responsive testing

**Files:** None (read-only testing)

**Step 1: Desktop testing**

Using dev-preview or preview tools:
- Open modal from all 3 trigger points (nav, hero, take-action section)
- Enter a Greenville address → verify results render correctly in the full-screen overlay
- Scroll through results → close button stays fixed in top-right
- Press Escape → closes
- Click X → closes
- After close, focus returns to the button that opened it
- Body doesn't scroll while modal is open

**Step 2: Mobile testing (375px viewport)**

- Nav hamburger → "Take Action" opens modal
- Close button accessible on small screens
- Address input and buttons don't overflow
- Results are scrollable
- Input has proper mobile keyboard (`autocomplete="street-address"`)

**Step 3: Accessibility check**

- Tab through the modal: address input → submit button → geo button → (results buttons) → close button → wraps back
- Screen reader: `role="dialog"`, `aria-modal="true"`, `aria-label` announced
- `aria-live` regions still announce loading/error states

**Step 4: Commit any fixes discovered**

```bash
git add -A
git commit -m "fix: address visual QA issues in action modal"
```

(Only if fixes were needed.)
