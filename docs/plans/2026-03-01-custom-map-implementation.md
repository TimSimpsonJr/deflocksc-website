# Custom Camera Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Deflock iframe embed with a custom MapLibre GL JS map using OpenFreeMap dark tiles, Deflock CDN camera data, and the site's dark blue color palette.

**Architecture:** MapLibre GL JS renders a customized dark map inside `MapSection.astro`. Camera data is fetched at runtime from Deflock CDN, converted to GeoJSON, and rendered with clustering (zoomed out) and individual markers (zoomed in) — red dots for cameras without direction data, semi-transparent red cones for cameras with direction. A custom map style JSON (recolored from OpenFreeMap's dark theme) is served from `public/map-style.json`.

**Tech Stack:** MapLibre GL JS (npm), OpenFreeMap tiles, Deflock CDN (`cdn.deflock.me/regions/20/-100.json`), Astro 5

**Reference:** Design doc at `docs/plans/2026-03-01-custom-map-design.md`

---

### Task 1: Create Custom Map Style

Create a Node script that fetches OpenFreeMap's dark style, remaps colors to site palette, and saves as `public/map-style.json`.

**Files:**
- Create: `scripts/build-map-style.mjs`
- Create: `public/map-style.json`

**Step 1: Write the style builder script**

Create `scripts/build-map-style.mjs`. The script should:

1. Fetch `https://tiles.openfreemap.org/styles/dark`
2. Walk all layers and collect every unique color used in paint/layout properties
3. Remap each color based on this table (use the closest match by luminance when exact hex doesn't match):

| Original color context | Target hex |
|---|---|
| Background/land (darkest, ~0-5% lum) | `#0f172a` |
| Secondary land/fills (~5-12% lum) | `#111d32` |
| Water layers (by layer ID containing "water") | `#1e293b` |
| Minor roads (~12-15% lum) | `#334155` |
| Major roads (~15-25% lum) | `#3d4f66` |
| Road casings/borders (~25-35% lum) | `#475569` |
| Place/road labels (~35-50% lum) | `#64748b` |
| City/prominent labels (~50%+ lum) | `#94a3b8` |
| Park/landuse layers (by layer ID) | `#162032` |

Known original colors from the OpenFreeMap dark style:
- `rgb(12,12,12)` / `#0c0c0c` → `#0f172a` (background)
- `rgb(27,27,29)` / `#1b1b1d` → `#1e293b` (water)
- `#181818` → `#334155` (minor roads)
- `hsl(0,0%,7%)` → `#3d4f66` (major roads)
- `rgba(60,60,60,0.8)` → `rgba(71,85,105,0.8)` (road casing, preserve alpha)
- `hsl(0,0%,23%)` → `#475569` (borders)
- `rgb(101,101,101)` → `#64748b` (labels)

Color property names to check in paint/layout objects: `background-color`, `fill-color`, `fill-outline-color`, `line-color`, `text-color`, `text-halo-color`, `circle-color`, `icon-color`, `fill-extrusion-color`.

Handle these value formats:
- Plain strings: `"#181818"`, `"rgb(12,12,12)"`, `"hsl(0,0%,7%)"`, `"rgba(60,60,60,0.8)"`
- Stops arrays: `{ "stops": [[zoom, color], [zoom, color]] }` — remap each color
- Expressions: `["interpolate", ...]` or `["match", ...]` — remap color values within

4. Write result to `public/map-style.json`

**Step 2: Run the script**

Run: `node scripts/build-map-style.mjs`

Expected: `public/map-style.json` is created. No errors.

**Step 3: Commit**

```bash
git add scripts/build-map-style.mjs public/map-style.json
git commit -m "feat: add custom map style based on OpenFreeMap dark"
```

---

### Task 2: Install MapLibre and Rewrite MapSection

Install MapLibre GL JS and replace the iframe with a basic MapLibre map. Keep section layout, copy, and mobile toggle UX.

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/components/MapSection.astro`

**Step 1: Install MapLibre GL JS**

Run: `npm install maplibre-gl`

**Step 2: Rewrite MapSection.astro**

Replace the iframe-based map with a MapLibre container. Keep all section text and styling. Key points:

- Import MapLibre CSS in frontmatter: `import 'maplibre-gl/dist/maplibre-gl.css';`
- Replace both iframe blocks (desktop + mobile) with one shared map container
- Map container: `hidden md:block` by default, toggled on mobile
- Use `clip-path: inset(0)` on container (prevents blur bleed, documented gotcha)
- Center: `[-82.39, 34.85]` (Greenville/Upstate SC), zoom: `11`
- Custom attribution: Deflock, OpenFreeMap, OpenMapTiles, OpenStreetMap
- Navigation control: top-right

Mobile toggle logic:
- Button click hides button container, shows map container
- If map not yet created, call `initMap()`; else call `map.resize()`
- Also handle resize from mobile→desktop via `matchMedia` listener

```astro
---
import 'maplibre-gl/dist/maplibre-gl.css';
---

<section class="bg-[#0f172a] py-20 md:py-28 relative overflow-hidden">
  <!-- Section glow accent (unchanged) -->
  <div class="section-glow absolute -top-24 left-1/2 -translate-x-1/2 w-[min(800px,90vw)] h-[200px] blur-[64px] opacity-[0.08] md:opacity-[0.10] pointer-events-none"></div>

  <div class="max-w-4xl mx-auto px-6">
    <h2 class="text-white font-extrabold text-2xl md:text-4xl tracking-[-0.02em] mb-10">
      155 Cameras. Upstate South Carolina. No Public Vote.
    </h2>

    <!-- Keep all existing body copy paragraphs exactly as-is -->
    <div class="space-y-6 text-[#cbd5e1] text-base leading-relaxed mb-12">
      <!-- ... all 5 existing <p> tags unchanged ... -->
    </div>

    <!-- Map embed area -->
    <div class="mb-12">
      <p class="text-white font-bold text-lg mb-4">
        Find the cameras in your neighborhood.
      </p>

      <!-- Mobile toggle button -->
      <div id="map-button-container" class="md:hidden bg-[#1e293b] border border-[#334155] rounded-lg p-8 text-center">
        <button
          id="map-toggle"
          type="button"
          class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer"
        >
          Explore the camera map &rarr;
        </button>
      </div>

      <!-- Map container -->
      <div id="map-container" class="hidden md:block rounded-lg overflow-hidden" style="height: 600px; clip-path: inset(0);">
        <div id="camera-map" style="width: 100%; height: 100%;"></div>
      </div>

      <p class="text-[#64748b] text-sm mt-3">
        Data from <a href="https://deflock.org" target="_blank" rel="noopener" class="text-[#ef4444] hover:text-[#dc2626] transition-colors">Deflock.org</a>, a community-sourced map of Flock Safety camera locations. Help keep it updated by reporting cameras you find.
      </p>
    </div>
  </div>
</section>

<script>
  import maplibregl from 'maplibre-gl';

  const MAP_CENTER: [number, number] = [-82.39, 34.85];
  const MAP_ZOOM = 11;

  let map: maplibregl.Map | null = null;

  function initMap() {
    map = new maplibregl.Map({
      container: 'camera-map',
      style: '/map-style.json',
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({
      customAttribution: [
        '<a href="https://deflock.org" target="_blank">Deflock</a>',
        '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>',
        '<a href="https://openmaptiles.org" target="_blank">OpenMapTiles</a>',
        '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      ],
    }));

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
  }

  // Desktop: init immediately
  if (window.matchMedia('(min-width: 768px)').matches) {
    initMap();
  }

  // Handle resize mobile → desktop
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
    if (e.matches && !map) initMap();
  });

  // Mobile toggle
  document.getElementById('map-toggle')?.addEventListener('click', () => {
    document.getElementById('map-button-container')?.classList.add('hidden');
    const container = document.getElementById('map-container');
    if (container) {
      container.classList.remove('hidden');
      container.classList.add('block');
    }
    if (!map) {
      initMap();
    } else {
      map.resize();
    }
  });
</script>
```

**Step 3: Start dev server and verify**

Start dev server with `preview_start`. Navigate to the map section.

Expected: Map renders with custom dark style matching site palette. Navigation controls visible. Centered on Upstate SC. Mobile toggle shows button, clicking it reveals map.

**Step 4: Commit**

```bash
git add src/components/MapSection.astro package.json package-lock.json
git commit -m "feat: replace iframe with MapLibre GL JS map"
```

---

### Task 3: Add Camera Data and Clustering

Fetch camera data from Deflock CDN, convert to GeoJSON, and render with MapLibre clustering.

**Files:**
- Modify: `src/components/MapSection.astro` (script section only)

**Step 1: Add camera data loading**

Inside `initMap()`, after adding controls, add a `map.on('load', ...)` handler that:

1. Fetches `https://cdn.deflock.me/regions/20/-100.json`
2. Converts array to GeoJSON FeatureCollection with properties: `id`, `direction` (parsed number or null), `hasDirection` (boolean)
3. Adds a GeoJSON source `'cameras'` with clustering enabled (`clusterMaxZoom: 15`, `clusterRadius: 50`)
4. Adds these layers:

**Cluster circles:**
```js
{
  id: 'clusters',
  type: 'circle',
  source: 'cameras',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#ef4444',
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
    'circle-opacity': 0.85,
  },
}
```

**Cluster count labels:**
```js
{
  id: 'cluster-count',
  type: 'symbol',
  source: 'cameras',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 13,
    // Use a font from the style's glyphs — check public/map-style.json
    // for available font stacks. Likely "Open Sans Bold" or "Noto Sans Bold".
  },
  paint: { 'text-color': '#ffffff' },
}
```

**Unclustered dots (no direction):**
```js
{
  id: 'camera-dots',
  type: 'circle',
  source: 'cameras',
  filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'hasDirection']]],
  paint: {
    'circle-color': '#ef4444',
    'circle-radius': 6,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#991b1b',
  },
}
```

5. Adds click handler on `'clusters'` layer to zoom into cluster (`getClusterExpansionZoom`)
6. Adds cursor pointer on cluster hover

**Direction parser function:**
```js
function parseDirection(tags: Record<string, string> | undefined): number | null {
  if (!tags) return null;
  const raw = tags['direction'] || tags['camera:direction'];
  if (!raw) return null;
  const first = String(raw).split(';')[0].trim();

  // Range format "138-183" → midpoint
  if (/^\d+-\d+$/.test(first)) {
    const [a, b] = first.split('-').map(Number);
    return (a + b) / 2;
  }

  // Cardinal directions
  const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const upper = first.toUpperCase();
  if (upper in cardinals) return cardinals[upper];

  // Numeric degrees
  const deg = Number(first);
  return isNaN(deg) ? null : deg;
}
```

**Step 2: Verify in dev server**

Expected: Red cluster circles with white counts at default zoom. Clicking a cluster zooms in. At high zoom, individual red dots visible. Cursor changes to pointer over clusters.

**Step 3: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat: add camera data loading with clustering"
```

---

### Task 4: Add Directional Cone Markers

Add semi-transparent red cone markers for cameras with direction data.

**Files:**
- Modify: `src/components/MapSection.astro` (script section only)

**Step 1: Create cone image and add symbol layer**

Inside the `map.on('load', ...)` handler, after adding the dot layers:

1. Create a `48x48` canvas
2. Draw a cone/wedge pointing up (0° = north):
   - Sector arc from center, radius 22px, ±25° half-angle (50° total cone)
   - Fill: `rgba(239, 68, 68, 0.45)` (red-500, semi-transparent)
   - Center dot: 4px radius, `#ef4444` fill, `#991b1b` 1px stroke
3. Register as map image: `map.addImage('cone', { width: 48, height: 48, data: ctx.getImageData(...).data })`
4. Add symbol layer:

```js
{
  id: 'camera-cones',
  type: 'symbol',
  source: 'cameras',
  filter: ['all', ['!', ['has', 'point_count']], ['get', 'hasDirection']],
  layout: {
    'icon-image': 'cone',
    'icon-size': 0.75,
    'icon-rotate': ['get', 'direction'],
    'icon-allow-overlap': true,
    'icon-rotation-alignment': 'map',
  },
}
```

**Step 2: Verify in dev server**

Expected: When zoomed in past cluster threshold, cameras with direction show as red cones pointing in their recorded direction. Cameras without direction remain as red dots.

**Step 3: Commit**

```bash
git add src/components/MapSection.astro
git commit -m "feat: add directional cone markers for cameras"
```

---

### Task 5: Build Verification and Final Review

**Step 1: Run production build**

Run: `node node_modules/astro/astro.js build`

Expected: Build succeeds with no errors.

**Step 2: Visual review**

Start dev server, check:
- Map loads and renders with site-matching dark palette
- Clusters appear, zoom to break apart works
- Red dots and directional cones render correctly
- Mobile toggle works (button → map)
- Attribution text visible
- No console errors

**Step 3: Review diff**

Run: `git diff master...HEAD --stat`

Verify all changes make sense and nothing unexpected is included.

**Step 4: Final commit if needed**

Commit any remaining fixes from the review.
