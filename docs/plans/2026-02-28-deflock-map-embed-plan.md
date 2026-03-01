# Deflock Map Embed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Deflock link button with an inline iframe embed on desktop/tablet, and a toggle-to-reveal button on mobile.

**Architecture:** CSS-only responsive swap using Tailwind `hidden`/`block` + `md:` variants. A small inline `<script>` handles the mobile toggle (hide button, show iframe). No framework or client island needed.

**Tech Stack:** Astro, Tailwind CSS 4, vanilla JS

---

### Task 1: Replace the link button with iframe embed

**Files:**
- Modify: `src/components/MapSection.astro:35-55`

**Step 1: Replace the map embed area**

Replace lines 35-55 of `MapSection.astro` (the entire `<!-- Map embed area -->` block) with:

```astro
<!-- Map embed area -->
<div class="mb-12">
  <p class="text-white font-bold text-lg mb-4">
    Find the cameras in your neighborhood.
  </p>

  <!-- Desktop/tablet: iframe visible by default -->
  <div class="hidden md:block rounded-lg overflow-hidden" style="height: 600px;">
    <iframe
      src="https://deflock.org/map#map=11/34.85/-82.39"
      width="100%"
      height="600"
      style="border: none;"
      loading="lazy"
      allow="geolocation"
      title="DeFlock ALPR Camera Map"
    ></iframe>
  </div>

  <!-- Mobile: toggle button + hidden iframe -->
  <div class="md:hidden">
    <div id="map-button-container" class="bg-[#1e293b] border border-[#334155] rounded-lg p-8 text-center">
      <button
        id="map-toggle"
        type="button"
        class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer"
      >
        Explore the camera map &rarr;
      </button>
    </div>
    <div id="map-iframe-container" class="hidden rounded-lg overflow-hidden" style="height: 600px;">
      <iframe
        id="map-iframe-mobile"
        data-src="https://deflock.org/map#map=11/34.85/-82.39"
        width="100%"
        height="600"
        style="border: none;"
        allow="geolocation"
        title="DeFlock ALPR Camera Map"
      ></iframe>
    </div>
  </div>

  <p class="text-[#64748b] text-sm mt-3">
    Data from <a href="https://deflock.org" target="_blank" rel="noopener" class="text-[#ef4444] hover:text-[#dc2626] transition-colors">Deflock.org</a>, a community-sourced map of Flock Safety camera locations. Help keep it updated by reporting cameras you find.
  </p>
</div>
```

Note: The mobile iframe uses `data-src` instead of `src` so it doesn't load until the user taps the button.

**Step 2: Add the mobile toggle script**

Add this `<script>` block at the end of the file, after the closing `</section>` tag:

```astro
<script>
  const toggle = document.getElementById('map-toggle');
  const buttonContainer = document.getElementById('map-button-container');
  const iframeContainer = document.getElementById('map-iframe-container');
  const iframe = document.getElementById('map-iframe-mobile') as HTMLIFrameElement;

  toggle?.addEventListener('click', () => {
    buttonContainer?.classList.add('hidden');
    iframeContainer?.classList.remove('hidden');
    if (iframe && !iframe.src) {
      iframe.src = iframe.dataset.src || '';
    }
  });
</script>
```

**Step 3: Verify in preview**

Run: dev server via `preview_start`
- Desktop: iframe should be visible, no button
- Mobile (375px): button visible, no iframe. Tap button — button hides, iframe appears.

**Step 4: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat: embed Deflock map with mobile toggle"
```
