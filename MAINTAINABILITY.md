# Maintainability Evaluation

**Project:** DeflockSC Website
**Date:** 2026-03-07 (revised after PR #41 merge)
**Overall Rating:** 7/10

---

## Executive Summary

This is a well-structured Astro 5 static advocacy site with clear architectural intent, good documentation, and thoughtful separation between data and presentation. The codebase is small enough (~5.5K LOC across ~154 files) to remain approachable. Several areas—particularly the oversized ActionModal component and absence of automated tests—present maintainability risks as the project grows.

PR #41 (`feature/ui-overhaul`) added well-written TypeScript modules (`camera-map.ts`, `case-studies.ts`) and a clean new component (`CitizenToolkit.astro`), but did not address the core maintainability issues. The gap between new code quality and legacy code quality is widening.

---

## Strengths

### 1. Clear Architecture & Documentation (9/10)
- **MANIFEST.md** provides a structural map of every file and its purpose.
- A full **docs/** folder (35+ planning/design documents) covers architecture, scraper adaptation, deployment, and research workflows.
- **README.md** includes a guide for forking/adapting the project to other states.
- Configuration files (registry.json) serve as a single source of truth for jurisdiction metadata, keeping the scraper infrastructure and frontend in sync.

### 2. Data-Driven Design (9/10)
- Content is cleanly separated into JSON data files (`bills.json`, `state-legislators.json`, `action-letters.json`, `registry.json`).
- Scrapers (Python) write structured data that the frontend consumes directly—no manual synchronization needed.
- GitHub Actions automate data refresh on schedules (weekly bill scraping, periodic rep and camera data updates).

### 3. Small, Focused Dependency Surface (9/10)
- Only 10 production dependencies and 2 dev dependencies.
- No heavy frontend framework (React, Vue, etc.)—Astro's island architecture keeps the client bundle minimal.
- Python scraping scripts use standard, well-known libraries (BeautifulSoup, requests, geopandas).

### 4. Privacy-by-Design (8/10)
- Geocoding runs client-side through the Census Bureau (proxied to avoid CORS).
- Analytics (Umami) are self-hosted and proxied through the site domain.
- No third-party tracking scripts or cookies.

### 5. CI/CD Automation (8/10)
- Lighthouse CI enforces performance/accessibility standards on PRs.
- Scheduled workflows keep data fresh without manual intervention.
- Netlify auto-deploys from master, making the deploy pipeline zero-friction.

### 6. New Code Quality (8/10) — *New in this revision*
- `src/scripts/camera-map.ts` (404 lines): Fully typed, JSDoc-documented, clean lazy-load pattern for MapLibre with cluster rendering and vendor image lookup.
- `src/scripts/case-studies.ts` (130 lines): Fully typed, proper focus trap (a11y), count-up animation with clean event handling.
- `CitizenToolkit.astro` (197 lines): Lightweight, no inline script, pure HTML/CSS bento grid.
- These set a good standard for future code.

### 7. Modular Component Structure (7/10)
- Most components are self-contained with clear, single responsibilities (Hero, FAQ, Footer, Nav).
- The lib/ directory (`district-matcher.js`, `geo-utils.js`) extracts reusable logic cleanly.
- Page composition in `index.astro` and `toolkit.astro` is straightforward and readable.

---

## Areas for Improvement

### 1. ActionModal.astro is a Maintainability Bottleneck (Critical)
**File:** `src/components/ActionModal.astro` — **1,272 lines**

This single file contains:
- The complete modal UI (HTML template, ~220 lines)
- A 1,051-line inline `<script>` block with all client-side JavaScript for representative lookup, address geocoding, geolocation, letter generation, and clipboard handling
- **~175 lines of duplicated geometry code** (`dmPointInRing`, `dmPointInPolygon`, `dmComputeBBox`, `dmPointInBBox`) that are degraded copies of the functions already in `geo-utils.js`

**Impact:** Any change to rep lookup, letter display, or modal behavior requires navigating a 1,200+ line file mixing markup with complex logic. The duplicated geo code creates two copies to maintain.

**Recommendation:** Extract the inline `<script>` logic into a dedicated module (e.g., `src/scripts/action-modal/`). Import `geo-utils.js` instead of duplicating it. Consider splitting the UI into sub-components.

### 2. No Automated Test Suite (Critical)
- There are **zero unit tests, integration tests, or end-to-end tests**.
- No test framework is installed; no `test` script in `package.json`.
- Lighthouse CI checks performance/accessibility but does not verify functional correctness.
- `validate-data.py` checks data schemas but there's no equivalent for JavaScript/TypeScript code.

**Impact:** Refactoring any component or library (especially `district-matcher.js` or `geo-utils.js`) carries risk of silent regressions. The spatial matching algorithms are particularly critical and testable.

**Recommendation:** Add at minimum:
- Unit tests for `geo-utils.js` (point-in-polygon, bounding box)
- Unit tests for `district-matcher.js` (known coordinates → expected districts)
- Data validation tests that run in CI

### 3. Heavy Use of Inline Scripts (Moderate)
Multiple components contain substantial inline `<script>` blocks:

| Component | Inline Script Lines | Status |
|-----------|-------------------|--------|
| ActionModal.astro | 1,051 | **Critical** |
| ToolkitLegal.astro | 122 | **Large** |
| BillTracker.astro | 108 | **Large** |
| MapSection.astro | 59 | Acceptable (thin glue for camera-map.ts) |

Inline scripts are harder to lint, type-check, and test than extracted modules.

**Impact:** IDE support (autocomplete, type checking, refactoring tools) is weaker inside `<script>` tags embedded in `.astro` files. Bugs are harder to catch at build time.

**Recommendation:** Extract scripts exceeding ~50 lines into `src/scripts/*.ts` modules. The existing `camera-map.ts` and `case-studies.ts` demonstrate the right pattern.

### 4. TypeScript Coverage is Partial (Moderate)
- `tsconfig.json` uses Astro's strict preset, which is good.
- New code (`camera-map.ts`, `case-studies.ts`) is properly typed — good trend.
- However, the core libraries (`district-matcher.js`, `geo-utils.js`) remain plain JavaScript.
- Inline scripts in `.astro` files bypass TypeScript checking entirely.

**Impact:** The most algorithmically complex code (spatial matching) gets the least type safety. Refactoring requires manual verification of argument types.

**Recommendation:** Convert `district-matcher.js` and `geo-utils.js` to TypeScript. These are self-contained modules with clear interfaces, making conversion straightforward.

### 5. Styling Approach Could Be More Consistent (Low)
- Tailwind utility classes are used inline throughout, which is standard for Tailwind projects.
- However, some color values are hardcoded as hex literals (`#171717`, `#dc2626`, `#d4d4d4`) rather than using Tailwind's theme system or CSS custom properties.
- Changing the color palette would require a find-and-replace across many files.

**Recommendation:** Define the color palette as CSS custom properties or a Tailwind theme extension, then reference those tokens instead of raw hex values.

### 6. Data Validation Not Enforced in CI (Low)
- `validate-data.py` exists (362 lines) and is wired to `npm run validate` for local use.
- However, it is **not run in any CI workflow** — not in `scrape-bills.yml`, `scrape-reps.yml`, `refresh-camera-data.yml`, or `lighthouse.yml`.
- Adapter errors could silently produce malformed data that wouldn't be caught until it reaches the frontend.

**Recommendation:** Add `validate-data.py` as a step in the `scrape-bills.yml` and `scrape-reps.yml` workflows, so bad data is caught before it's committed.

---

## Maintainability Metrics Summary

| Dimension                  | Rating | Notes                                                      |
|----------------------------|--------|------------------------------------------------------------|
| Documentation              | 9/10   | Excellent: MANIFEST, README, 35+ docs/plans files          |
| Code Organization          | 7/10   | Good except for ActionModal monolith                        |
| Dependency Management      | 9/10   | Minimal, well-chosen dependencies                           |
| Test Coverage              | 2/10   | No automated tests for application logic                    |
| Type Safety                | 5/10   | Strict tsconfig but core libs are plain JS                  |
| CI/CD                      | 7/10   | Strong automation, missing test + validation steps          |
| Data Architecture          | 9/10   | Clean JSON-driven, registry as single source                |
| Onboarding / Forkability   | 8/10   | Docs explicitly address adapting to other states            |
| Component Granularity      | 6/10   | ActionModal too large; others well-scoped                   |
| New Code Quality           | 8/10   | camera-map.ts and case-studies.ts set a high bar            |
| Error Handling             | 6/10   | Graceful in core libs; inconsistent in inline scripts       |

---

## Priority Recommendations

1. **Split ActionModal.astro** into smaller components and an extracted script module — delete duplicated geo code
2. **Add unit tests** for `geo-utils.js` and `district-matcher.js` (highest ROI)
3. **Convert core libs to TypeScript** (`district-matcher.js`, `geo-utils.js`)
4. **Extract BillTracker and ToolkitLegal inline scripts** into `src/scripts/` modules
5. **Run data validation in CI** as part of scraper workflows
