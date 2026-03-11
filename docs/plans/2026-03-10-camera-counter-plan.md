# Camera Counter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show animated camera counts per city/county at the top of the action modal results.

**Architecture:** A Python build script runs point-in-polygon matching of camera coordinates against county/city boundary GeoJSON, producing a static `camera-counts.json`. The Astro component injects these counts into the modal's data island. The results renderer prepends a stat line with count-up animation.

**Tech Stack:** Python 3 + Shapely (build), TypeScript (client), Astro (template)

---

### Task 1: Build Script — `scripts/build-camera-counts.py`

**Files:**
- Create: `scripts/build-camera-counts.py`

**Step 1: Write the build script**

```python
"""
Count cameras per county/city boundary and output camera-counts.json.

Loads public/camera-data.json and all public/districts/county-*.json and
place-*.json boundary GeoJSON files. Uses Shapely point-in-polygon to count
cameras inside each jurisdiction's unioned boundary.

Dependencies: pip install shapely

Usage: python scripts/build-camera-counts.py
"""

import glob
import json
import os
import re
import sys

try:
    from shapely.geometry import shape, Point
    from shapely.ops import unary_union
    from shapely.prepared import prep
except ImportError:
    print("Missing dependency. Install with: pip install shapely")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..")
CAMERA_DATA = os.path.join(PROJECT_ROOT, "public", "camera-data.json")
DISTRICTS_DIR = os.path.join(PROJECT_ROOT, "public", "districts")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "public", "camera-counts.json")

# SC bounding box — pre-filter cameras before expensive point-in-polygon
SC_BOUNDS = {"min_lat": 31.5, "max_lat": 35.5, "min_lon": -84.0, "max_lon": -78.0}


def load_cameras():
    with open(CAMERA_DATA, "r", encoding="utf-8") as f:
        all_cameras = json.load(f)
    # Pre-filter to SC bounding box
    return [
        c for c in all_cameras
        if SC_BOUNDS["min_lat"] <= c["lat"] <= SC_BOUNDS["max_lat"]
        and SC_BOUNDS["min_lon"] <= c["lon"] <= SC_BOUNDS["max_lon"]
    ]


def load_boundary(filepath):
    """Load a GeoJSON file and union all features into a single geometry."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    geoms = []
    for feature in data.get("features", []):
        geom = feature.get("geometry")
        if geom:
            geoms.append(shape(geom))
    if not geoms:
        return None
    return unary_union(geoms)


def build_key_from_filename(filename):
    """Convert 'county-greenville.json' -> 'county:greenville',
    'place-charleston.json' -> 'place:charleston'."""
    name = os.path.splitext(filename)[0]
    m = re.match(r"^(county|place)-(.+)$", name)
    if m:
        return m.group(1) + ":" + m.group(2)
    return None


def main():
    cameras = load_cameras()
    print(f"Loaded {len(cameras)} cameras in SC bounding box")

    # Build Shapely points once
    camera_points = [Point(c["lon"], c["lat"]) for c in cameras]

    # Find all county-*.json and place-*.json boundary files
    boundary_files = (
        glob.glob(os.path.join(DISTRICTS_DIR, "county-*.json"))
        + glob.glob(os.path.join(DISTRICTS_DIR, "place-*.json"))
    )

    counts = {}
    for filepath in sorted(boundary_files):
        filename = os.path.basename(filepath)
        key = build_key_from_filename(filename)
        if not key:
            continue

        boundary = load_boundary(filepath)
        if boundary is None or boundary.is_empty:
            print(f"  Skipping {key}: empty boundary")
            continue

        prepared = prep(boundary)
        count = sum(1 for pt in camera_points if prepared.contains(pt))

        if count > 0:
            counts[key] = count
            print(f"  {key}: {count}")
        else:
            print(f"  {key}: 0 (omitted)")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(counts, f, indent=2, sort_keys=True)

    print(f"\nWrote {OUTPUT_PATH} ({len(counts)} entries)")


if __name__ == "__main__":
    main()
```

**Step 2: Run the script**

Run: `python scripts/build-camera-counts.py`
Expected: Outputs counts per jurisdiction, writes `public/camera-counts.json`

**Step 3: Verify output**

Run: `cat public/camera-counts.json | head -20`
Expected: JSON object with `county:*` and `place:*` keys mapped to positive integers

**Step 4: Commit**

```bash
git add scripts/build-camera-counts.py public/camera-counts.json
git commit -m "feat: add build script for camera counts per jurisdiction"
```

---

### Task 2: Add `cameraCounts` to Modal Data Island

**Files:**
- Modify: `src/scripts/action-modal/types.ts:83-88` (ModalData interface)
- Modify: `src/components/ActionModal.astro:1-4` (frontmatter imports)
- Modify: `src/components/ActionModal.astro:222` (data island)

**Step 1: Add `cameraCounts` to `ModalData` type**

In `src/scripts/action-modal/types.ts`, add to the `ModalData` interface:

```typescript
export interface ModalData {
  actionLetters: ActionLetter[];
  stateLegislators: StateLegislators;
  localCouncils: LocalCouncils;
  registry: Registry;
  cameraCounts: Record<string, number>;
}
```

**Step 2: Import camera counts in ActionModal.astro frontmatter**

In `src/components/ActionModal.astro`, add after the existing imports (line 4):

```typescript
import cameraCounts from '../../public/camera-counts.json';
```

Note: Astro can import JSON from `public/` at build time.

**Step 3: Add to data island**

In `src/components/ActionModal.astro` line 222, add `cameraCounts` to the JSON:

```html
<script type="application/json" id="action-modal-data" set:html={JSON.stringify({ actionLetters, stateLegislators, localCouncils, registry, cameraCounts })}></script>
```

**Step 4: Verify dev server starts**

Run dev server. Check browser console for no errors on the action modal page.

**Step 5: Commit**

```bash
git add src/scripts/action-modal/types.ts src/components/ActionModal.astro
git commit -m "feat: inject camera counts into action modal data island"
```

---

### Task 3: Render Camera Counter with Count-Up Animation

**Files:**
- Modify: `src/scripts/action-modal/index.ts:16,32-34` (pass cameraCounts to renderResults)
- Modify: `src/scripts/action-modal/results-renderer.ts:43-47` (prepend stat line)

**Step 1: Pass cameraCounts through index.ts**

In `src/scripts/action-modal/index.ts`, update the `init` function to extract `cameraCounts` and pass it to `handleMatch`:

```typescript
function init(data: ModalData): void {
  const { actionLetters, stateLegislators, localCouncils, registry, cameraCounts } = data;
  // ...existing code...

  function handleMatch(match: DistrictMatch): void {
    const groups = buildGroups(match, actionLetters, stateLegislators, localCouncils);
    showState('results');
    renderResults(groups, cameraCounts);
    document.getElementById('action-results')?.focus();
  }
  // ...rest unchanged...
}
```

**Step 2: Update renderResults signature and add stat line**

In `src/scripts/action-modal/results-renderer.ts`, update the function:

```typescript
function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function animateCount(el: HTMLElement, target: number): void {
  const duration = 1000;
  const start = performance.now();
  function tick(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out: 1 - (1 - t)^3
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function renderResults(groups: RepGroup[], cameraCounts?: Record<string, number>): void {
  currentGroups = groups;
  const container = document.getElementById('action-results-list');
  if (!container) return;
  container.innerHTML = '';

  // Camera counter stat line
  if (cameraCounts) {
    // Extract countyKey and cityKey from groups
    let countyKey: string | undefined;
    let cityKey: string | undefined;
    for (const g of groups) {
      if (g.countyKey && !countyKey) countyKey = g.countyKey;
      if (g.cityKey && !cityKey) cityKey = g.cityKey;
    }

    const cityCount = cityKey ? (cameraCounts[cityKey] || 0) : 0;
    const countyCount = countyKey ? (cameraCounts[countyKey] || 0) : 0;

    if (cityCount > 0 || countyCount > 0) {
      const statDiv = document.createElement('div');
      statDiv.className = 'text-[#a3a3a3] text-sm mb-6 pb-4 border-b border-[#404040]';

      const parts: string[] = [];

      if (cityCount > 0) {
        const cityName = cityKey!.split(':')[1];
        parts.push('<span class="text-white font-semibold" data-count="' + cityCount + '">0</span> cameras in City of ' + titleCase(cityName));
      }

      if (countyCount > 0) {
        const countyName = countyKey!.split(':')[1];
        const prefix = cityCount > 0 ? '' : '';
        const label = cityCount > 0
          ? ' in ' + titleCase(countyName) + ' County'
          : ' cameras in ' + titleCase(countyName) + ' County';
        parts.push('<span class="text-white font-semibold" data-count="' + countyCount + '">0</span>' + label);
      }

      statDiv.innerHTML = parts.join(' <span class="mx-1">\u00b7</span> ');

      container.appendChild(statDiv);

      // Trigger count-up animations
      statDiv.querySelectorAll('[data-count]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count')!, 10);
        animateCount(el as HTMLElement, target);
      });
    }
  }

  // ...rest of existing renderResults code (the for loop over groups)...
```

The existing `for (let gi = 0; gi < groups.length; gi++)` loop remains unchanged after this block.

**Step 3: Verify in browser**

1. Start dev server
2. Open action modal, enter a Greenville address
3. Confirm stat line appears above rep groups with animated count-up
4. Confirm city counter appears first, county second
5. Try an address in a county with no cameras — confirm counters are hidden

**Step 4: Commit**

```bash
git add src/scripts/action-modal/index.ts src/scripts/action-modal/results-renderer.ts
git commit -m "feat: render camera counter with count-up animation in action modal"
```
