# Camera Counter Design

## Overview

A compact stat line at the top of the action modal results showing how many ALPR cameras Deflock has documented in the user's city and county. Numbers animate with a count-up effect on first display.

## Data Pipeline

**New script:** `scripts/build-camera-counts.py`

- Loads `public/camera-data.json` (flat array of `{id, lat, lon, tags}`)
- Loads all `public/districts/county-*.json` and `place-*.json` boundary GeoJSON files
- Runs Shapely point-in-polygon for each camera against each boundary
- Outputs `public/camera-counts.json` keyed by `county:`/`place:` prefixes (matching existing convention)
- Omits keys with zero cameras

**Output format:**
```json
{
  "county:greenville": 57,
  "county:spartanburg": 23,
  "place:greenville": 41
}
```

**Dependencies:** Same as `build-districts.py` — `shapely`, `json` stdlib. No new deps needed (no geopandas required for this script).

## Display

A single line prepended to `#action-results-list`, above all rep groups:

```
41 cameras in City of Greenville · 57 in Greenville County
```

- City counter first, county counter second, separated by `·`
- City hidden if count is 0 or missing; county hidden if count is 0 or missing
- Entire line hidden if both are zero/missing
- Numbers in white (`text-white font-semibold`), rest in muted (`text-[#a3a3a3] text-sm`)
- Bottom margin to separate from first rep group

**Count-up animation:** Numbers animate from 0 to their final value over ~1s using `requestAnimationFrame`. Eased (ease-out) so it decelerates toward the end.

## File Changes

1. **New:** `scripts/build-camera-counts.py` — build-time point-in-polygon counter
2. **Edit:** `src/components/ActionModal.astro` — add `cameraCounts` to the JSON data island
3. **Edit:** `src/scripts/action-modal/types.ts` — add `cameraCounts: Record<string, number>` to `ModalData`
4. **Edit:** `src/scripts/action-modal/index.ts` — pass `cameraCounts` through to `renderResults()`
5. **Edit:** `src/scripts/action-modal/results-renderer.ts` — prepend stat line with count-up animation
