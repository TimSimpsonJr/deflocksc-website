# Map Polish Design — Frame Glow, Zoom Controls, Popup

## 1. Frame Glow Color

Change the cursor-reactive glow from blue to the site's standard silvery white (slate-400).

**Current:** `rgba(59, 130, 246, 0.35)` → `rgba(59, 130, 246, 0.1)` → `transparent`
**New:** `rgba(148, 163, 184, 0.35)` → `rgba(148, 163, 184, 0.1)` → `transparent`

Backdrop-filter `::after` pseudo-element unchanged (amplifies whatever color is behind it).

## 2. Zoom Controls — Dark Glass

Override MapLibre default white controls via scoped CSS on `.maplibregl-ctrl-group`:

- Background: `rgba(30, 41, 59, 0.85)` with `backdrop-filter: blur(8px)`
- Border: `1px solid rgba(51, 65, 85, 0.6)`
- Border-radius: `0.5rem`
- Button icons: white at 70% opacity, 90% on hover
- Button separator: `#334155`
- Remove compass button (not useful for 2D map)

## 3. Map Label Fonts

No changes. Noto Sans on map tiles is visually close to Inter. No text on controls.

## 4. Camera Info Popup

Click `camera-dots` and `camera-cones` layers to show a MapLibre `Popup` with custom HTML.

**Content:**
- Placeholder image area (solid color block; vector camera type images added later)
- "Made by {manufacturer}" (from `tags.manufacturer`)
- Operator line if present (from `tags.operator`)
- Direction badge if present (e.g. "Facing 135°")
- "VIEW ON OSM" link → `https://www.openstreetmap.org/node/{id}`

**Styling:**
- Dark bg: `#1e293b`, border: `1px solid #334155`, rounded corners
- White headings, `#94a3b8` secondary text
- Red accent (`#ef4444`) on OSM link
- Override MapLibre popup default CSS (`.maplibregl-popup-content`, `.maplibregl-popup-tip`, close button)

**Data flow:** GeoJSON properties already include `id`, `direction`, `hasDirection`. Add `manufacturer` and `operator` to the GeoJSON feature properties during the data conversion step.
