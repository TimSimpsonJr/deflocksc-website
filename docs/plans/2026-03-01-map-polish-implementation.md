# Map Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the custom MapLibre map with white frame glow, dark glass zoom controls, and camera info popups.

**Architecture:** All changes are in `src/components/MapSection.astro` — CSS edits for the glow and controls, JS edits for the popup. The GeoJSON properties need `manufacturer` and `operator` added so the popup can display them.

**Tech Stack:** MapLibre GL JS, Astro 5

**Reference:** Design doc at `docs/plans/2026-03-01-map-polish-design.md`

---

### Task 1: Change Frame Glow to White

Swap the blue glow color to the site's standard slate-400 white glow.

**Files:**
- Modify: `src/components/MapSection.astro:92-96` (the `::before` radial gradient)

**Step 1: Edit the glow colors**

In the `<style>` block, find the `.map-frame::before` rule's `background` property and change both `rgba(59, 130, 246, ...)` values to `rgba(148, 163, 184, ...)`:

```css
background: radial-gradient(
  600px circle at var(--frame-x) var(--frame-y),
  rgba(148, 163, 184, 0.35),
  rgba(148, 163, 184, 0.1) 35%,
  transparent 55%
);
```

**Step 2: Start dev server and verify**

Start dev server with `preview_start`. Hover over the map frame.

Expected: Glow is now a silvery white instead of blue. Same intensity and fade behavior.

**Step 3: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "style: change map frame glow from blue to white"
```

---

### Task 2: Style Zoom Controls as Dark Glass

Override MapLibre's default white navigation controls. Also remove the compass button.

**Files:**
- Modify: `src/components/MapSection.astro` — `<style>` block (add new rules) and `initMap()` (change NavigationControl options)

**Step 1: Remove compass from NavigationControl**

In the `initMap()` function, find line 220:

```typescript
map.addControl(new maplibregl.NavigationControl(), 'top-right');
```

Replace with:

```typescript
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
```

**Step 2: Add dark glass CSS**

Add the following rules inside the existing `<style>` block, after the `.map-frame` rules (before the closing `</style>` tag):

```css
/* Dark glass zoom controls */
#camera-map :global(.maplibregl-ctrl-group) {
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

#camera-map :global(.maplibregl-ctrl-group button) {
  width: 36px;
  height: 36px;
}

#camera-map :global(.maplibregl-ctrl-group button + button) {
  border-top: 1px solid #334155;
}

#camera-map :global(.maplibregl-ctrl-group button .maplibregl-ctrl-icon) {
  filter: invert(1) brightness(0.7);
}

#camera-map :global(.maplibregl-ctrl-group button:hover .maplibregl-ctrl-icon) {
  filter: invert(1) brightness(0.9);
}

#camera-map :global(.maplibregl-ctrl-group button:hover) {
  background: rgba(51, 65, 85, 0.5);
}
```

Note: Astro scopes `<style>` by default. The `:global()` wrapper is needed to target MapLibre's dynamically-generated elements inside the `#camera-map` container.

**Step 3: Verify in dev server**

Expected: Zoom controls are now dark semi-transparent with subtle border. + and - icons are white. Compass is gone. Hover brightens icons slightly.

**Step 4: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "style: dark glass zoom controls"
```

---

### Task 3: Add Camera Info Popup

Add click handlers to individual camera markers (dots and cones) that show a styled popup with manufacturer, operator, direction, and OSM link.

**Files:**
- Modify: `src/components/MapSection.astro` — script section (GeoJSON properties + click handlers) and style section (popup CSS)

**Step 1: Add manufacturer and operator to GeoJSON properties**

In the `map.on('load', ...)` handler, find the `features: cameras.map(...)` block (around line 230). Update the properties object to include `manufacturer` and `operator`:

```typescript
properties: {
  id: cam.id,
  direction,
  hasDirection: direction !== null,
  manufacturer: cam.tags?.manufacturer || null,
  operator: cam.tags?.operator || null,
},
```

**Step 2: Add popup click handler function**

After the existing `mouseleave` handler for clusters (after line 397), add this function and the two click handlers:

```typescript
function showCameraPopup(e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
  if (!e.features?.length || !map) return;
  const feat = e.features[0];
  const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
  const props = feat.properties;

  // Parse properties (MapLibre stringifies nested values)
  const id = props.id;
  const manufacturer = props.manufacturer && props.manufacturer !== 'null' ? props.manufacturer : null;
  const operator = props.operator && props.operator !== 'null' ? props.operator : null;
  const direction = props.direction != null && props.direction !== 'null' ? Number(props.direction) : null;

  let html = '<div class="camera-popup">';

  // Placeholder image area
  html += '<div class="camera-popup-img"><span>ALPR Camera</span></div>';

  // Manufacturer
  if (manufacturer) {
    html += `<div class="camera-popup-mfr">Made by<br><strong>${manufacturer}</strong></div>`;
  }

  // Operator
  if (operator && operator !== manufacturer) {
    html += `<div class="camera-popup-op">Operated by ${operator}</div>`;
  }

  // Direction
  if (direction !== null) {
    html += `<div class="camera-popup-dir">Facing ${Math.round(direction)}&deg;</div>`;
  }

  // OSM link
  html += `<a class="camera-popup-link" href="https://www.openstreetmap.org/node/${id}" target="_blank" rel="noopener">&#x2197; VIEW ON OSM</a>`;

  html += '</div>';

  new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
}

// Camera dot clicks
map!.on('click', 'camera-dots', showCameraPopup);

// Camera cone clicks
map!.on('click', 'camera-cones', showCameraPopup);

// Pointer cursor on camera hover
map!.on('mouseenter', 'camera-dots', () => { map!.getCanvas().style.cursor = 'pointer'; });
map!.on('mouseleave', 'camera-dots', () => { map!.getCanvas().style.cursor = ''; });
map!.on('mouseenter', 'camera-cones', () => { map!.getCanvas().style.cursor = 'pointer'; });
map!.on('mouseleave', 'camera-cones', () => { map!.getCanvas().style.cursor = ''; });
```

**Step 3: Add popup CSS**

Add the following rules inside the `<style>` block (after the zoom control rules):

```css
/* Camera popup */
#camera-map :global(.maplibregl-popup-content) {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.75rem;
  padding: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-family: 'Inter', sans-serif;
}

#camera-map :global(.maplibregl-popup-tip) {
  border-top-color: #1e293b;
}

#camera-map :global(.maplibregl-popup-close-button) {
  color: #64748b;
  font-size: 18px;
  padding: 4px 8px;
  right: 2px;
  top: 2px;
}

#camera-map :global(.maplibregl-popup-close-button:hover) {
  color: #cbd5e1;
  background: transparent;
}

:global(.camera-popup) {
  width: 220px;
}

:global(.camera-popup-img) {
  background: #0f172a;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

:global(.camera-popup-img span) {
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

:global(.camera-popup-mfr) {
  padding: 12px 14px 0;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.4;
}

:global(.camera-popup-mfr strong) {
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
}

:global(.camera-popup-op) {
  padding: 6px 14px 0;
  color: #64748b;
  font-size: 12px;
}

:global(.camera-popup-dir) {
  padding: 6px 14px 0;
  color: #64748b;
  font-size: 12px;
}

:global(.camera-popup-link) {
  display: block;
  padding: 10px 14px;
  margin-top: 10px;
  border-top: 1px solid #334155;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-decoration: none;
  transition: color 0.2s ease;
}

:global(.camera-popup-link:hover) {
  color: #f87171;
}
```

**Step 4: Verify in dev server**

Zoom into an area with individual cameras. Click a red dot or a cone.

Expected:
- Dark popup appears with close button
- Shows placeholder image area, manufacturer, operator (if present), direction (if present), OSM link
- Popup arrow/tip matches dark background
- Close button is subtle gray, brightens on hover
- OSM link is red, opens in new tab
- Clicking a different camera closes the previous popup

**Step 5: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat: add camera info popup on marker click"
```

---

### Task 4: Build Verification

**Step 1: Run production build**

Run: `node node_modules/astro/astro.js build`

Expected: Build succeeds with no errors.

**Step 2: Visual review**

Start dev server, check:
- Frame glow is white/silver on hover
- Zoom controls are dark glass style, no compass
- Camera popups appear on dot/cone click with correct data
- Popup closes on X or clicking another camera
- Mobile toggle still works
- No console errors

**Step 3: Commit any fixes**

Commit any remaining fixes from the review.
