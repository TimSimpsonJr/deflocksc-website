# Maintainability Implementation Plan

**Revised:** 2026-03-07 (updated after PR #41 merge)

---

## Phase 1: Add Unit Test Infrastructure (do first — protects all later refactoring)

### Step 1.1: Install Vitest
- Add `vitest` as devDependency, add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
- Create `vitest.config.ts` at project root

### Step 1.2: Write tests for `src/lib/geo-utils.js`
- Create `src/lib/geo-utils.test.ts` (~80-120 lines)
- Test cases: pointInPolygon (simple polygon, polygon with hole, MultiPolygon, invalid input), computeBBox, pointInBBox

### Step 1.3: Write tests for `src/lib/district-matcher.js`
- Create `src/lib/district-matcher.test.ts` (~100-150 lines)
- Mock `fetch` for boundary loading and Census API
- Test cases: outside SC bbox early return, matchDistricts with mocked GeoJSON, geocodeAddress parsing, boundary caching
- Add an exported `_clearCacheForTesting()` helper to district-matcher

**Files: 3 new, 1 modified (`package.json`)**

---

## Phase 2: Convert Core Libraries to TypeScript (protected by Phase 1 tests)

### Step 2.1: Convert `geo-utils.js` → `geo-utils.ts`
- Add parameter types (`lat: number`, `lng: number`, `ring: [number, number][]`)
- Define `BBox` interface, type `GeoJSON.FeatureCollection` parameters
- Export types for consumers

### Step 2.2: Convert `district-matcher.js` → `district-matcher.ts`
- Define and export `DistrictMatch` and `GeocodeResult` interfaces
- Type all function signatures
- Update import path from `'./geo-utils.js'` → `'./geo-utils'`

### Step 2.3: Update imports in tests
- Update test file imports to match new `.ts` extensions

**Files: 2 renamed, 1-2 imports updated**

---

## Phase 3: Split ActionModal.astro (the big one — depends on Phase 2)

### Context
ActionModal.astro is 1,272 lines. Lines 221-1272 are a single `<script define:vars={...}>` block containing:
- Lines 222-396: **duplicated copy** of geo-utils + district-matcher (175 lines)
- Lines 398-441: modal management (open/close/state/error)
- Lines 443-639: `buildGroups` — matches reps to letter templates
- Lines 641-668: mailto/clipboard helpers
- Lines 670-993: `renderResults` — DOM rendering of rep cards and letters
- Lines 1008-1161: event handlers (geolocation, form, manual, reset, escape, focus trap)
- Lines 1163-1271: manual dropdown population

### Step 3.1: Solve the `define:vars` data injection problem
The inline script uses `define:vars` to inject server data (`actionLetters`, `stateLegislators`, `localCouncils`, `registry`). An extracted module can't use `define:vars`. Solution:
- Add `<script type="application/json" id="action-modal-data">` in the template with serialized data
- Read and parse it from the extracted module

### Step 3.2: Create `src/scripts/action-modal/` module structure

| File | Lines (approx) | Contents |
|------|----------------|----------|
| `types.ts` | ~60 | `ActionLetter`, `StateLegislator`, `LocalCouncil`, `Registry`, `RepGroup` interfaces |
| `group-builder.ts` | ~200 | `buildGroups()` — rep/letter matching logic |
| `results-renderer.ts` | ~300 | `renderResults()`, `escapeHtml`, event delegation for cards |
| `modal-controller.ts` | ~80 | `openModal`, `closeModal`, `showState`, `showError`, focus trap, escape/backdrop |
| `manual-dropdowns.ts` | ~110 | populate senate/house/county/city selects + change handlers |
| `index.ts` | ~60 | entry point: reads JSON data, wires up geolocation/form/manual/reset/triggers |

### Step 3.3: Delete duplicated geo code
The 175-line inline copy of geo-utils/district-matcher is **replaced by 2 import lines**:
```ts
import { matchDistricts, geocodeAddress } from '../../lib/district-matcher';
```

**Key differences to reconcile** when replacing inline version with library:
- Inline version uses `AbortController` timeout (10s) — add this to the library's `geocodeAddress`
- Inline version fetches via `/api/geocode` proxy — add an optional `baseUrl` parameter to library, or configure the proxy URL
- Inline version uses `var` (global scope) — the module version uses `const/let` (already the case in the library)
- Inline code references `window.umami` — use `(window as any).umami` or `declare global`

### Step 3.4: Slim down ActionModal.astro
After extraction: ~225 lines (frontmatter + HTML template + CSS + one `import` line). Down from 1,272.

**Files: 6 new, 1 modified (ActionModal.astro), ~175 lines of duplication deleted**

---

## Phase 4: Extract BillTracker and ToolkitLegal Inline Scripts (newly identified)

### Step 4.1: Extract BillTracker inline script
- `src/components/BillTracker.astro` has a 108-line inline script
- Create `src/scripts/bill-tracker.ts`
- Follow the `camera-map.ts` pattern: typed module, thin import in `.astro`

### Step 4.2: Extract ToolkitLegal inline script
- `src/components/ToolkitLegal.astro` has a 122-line inline script
- Create `src/scripts/toolkit-legal.ts`
- Same pattern as above

**Files: 2 new, 2 modified**

---

## Phase 5: Add Data Validation to CI (independent — can be done alongside any phase)

### Step 5.1: Add `python scripts/validate-data.py` step to `scrape-bills.yml`
- Insert after the scraper step, before the commit step

### Step 5.2: Add `python scripts/validate-data.py` step to `scrape-reps.yml`
- Add in each of the three jobs after scrape/build and before commit

**Files: 2 workflow YAML files modified**

---

## Phase 6: Audit Remaining Inline Scripts (polish pass)

### Step 6.1: Audit all components for inline scripts > 50 lines
- MapSection.astro (59 lines) — already delegates to `camera-map.ts`, remaining code is thin glue. **Leave as-is.**
- HowItWorks.astro — already extracted to `case-studies.ts`. **No action.**
- Any others found during audit — extract following the `camera-map.ts` pattern

### Step 6.2: Extract any that exceed threshold
Follow the `camera-map.ts` pattern: typed module in `src/scripts/`, thin import in `.astro`.

**Files: 0-3 new depending on audit**

---

## Execution Order

```
Phase 1 (Tests) ──────> Phase 2 (TS) ──────> Phase 3 (ActionModal split)
                                                        │
Phase 4 (BillTracker + ToolkitLegal) ── after Phase 1   │
                                                   Phase 6 (audit remaining)
Phase 5 (CI validation) ── independent, do anytime
```

## Totals

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1     | 3         | 1              |
| 2     | 0         | 3 (renames)    |
| 3     | 6         | 1              |
| 4     | 2         | 2              |
| 5     | 0         | 2              |
| 6     | 0-3       | 0-3            |
| **Total** | **11-14** | **9-12**  |

## Risks

1. **`define:vars` → JSON data island**: Payload size is identical (data already serialized into the page today), only the mechanism changes.
2. **Inline geo code divergence**: The duplicated copy has AbortController timeouts and uses the `/api/geocode` proxy that the library version doesn't. Must reconcile these differences when consolidating.
3. **Module scope change**: Current inline script runs in non-module global scope (`var`, `umami` global). Extracted TS modules use strict module scope. Need `declare global` for `umami` and ensure no implicit globals.
4. **BillTracker/ToolkitLegal extraction**: Lower risk than ActionModal since these are simpler scripts, but still need to verify no `define:vars` dependencies.
