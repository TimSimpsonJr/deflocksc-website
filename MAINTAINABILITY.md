# Maintainability Evaluation

**Project:** DeflockSC Website
**Date:** 2026-03-07
**Overall Rating:** 7.5 / 10

---

## Executive Summary

This is a well-structured Astro 5 static advocacy site with clear architectural intent, good documentation, and thoughtful separation between data and presentation. The codebase is small enough (~5.5K LOC across ~154 files) to remain approachable. Several areas—particularly the oversized ActionModal component and absence of automated tests—present maintainability risks as the project grows.

---

## Strengths

### 1. Clear Architecture & Documentation (9/10)
- **MANIFEST.md** provides a structural map of every file and its purpose.
- A full **docs/** folder covers architecture, scraper adaptation, deployment, and research workflows.
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

### 6. Modular Component Structure (7/10)
- Most components are self-contained with clear, single responsibilities (Hero, FAQ, BillTracker, Footer, Nav).
- The lib/ directory (`district-matcher.js`, `geo-utils.js`) extracts reusable logic cleanly.
- Page composition in `index.astro` and `toolkit.astro` is straightforward and readable.

---

## Areas for Improvement

### 1. ActionModal.astro is a Maintainability Bottleneck (Critical)
**File:** `src/components/ActionModal.astro` — **1,272 lines**

This single file contains:
- The complete modal UI (HTML template)
- All client-side JavaScript for representative lookup, address geocoding, geolocation, letter generation, and clipboard handling
- District matching orchestration logic that partially duplicates `district-matcher.js`

**Impact:** Any change to rep lookup, letter display, or modal behavior requires navigating a 1,200+ line file mixing markup with complex logic. This is the hardest file to modify safely.

**Recommendation:** Extract the inline `<script>` logic into a dedicated module (e.g., `src/scripts/action-modal.ts`). Consider splitting the UI into sub-components (e.g., `RepLookupForm`, `LetterDisplay`, `RepCard`).

### 2. No Automated Test Suite (Critical)
- There are **zero unit tests, integration tests, or end-to-end tests**.
- Lighthouse CI checks performance/accessibility but does not verify functional correctness.
- `validate-data.py` checks data schemas but there's no equivalent for JavaScript/TypeScript code.

**Impact:** Refactoring any component or library (especially `district-matcher.js` or `geo-utils.js`) carries risk of silent regressions. The spatial matching algorithms are particularly critical and testable.

**Recommendation:** Add at minimum:
- Unit tests for `geo-utils.js` (point-in-polygon, bounding box)
- Unit tests for `district-matcher.js` (known coordinates → expected districts)
- Data validation tests that run in CI (extend `validate-data.py` or add a Node equivalent)

### 3. Heavy Use of Inline Scripts (Moderate)
- 12 of 16 components contain inline `<script>` blocks.
- Some of these scripts are substantial (ActionModal, MapSection, HowItWorks).
- Inline scripts are harder to lint, type-check, and test than extracted modules.

**Impact:** IDE support (autocomplete, type checking, refactoring tools) is weaker inside `<script>` tags embedded in `.astro` files. Bugs are harder to catch at build time.

**Recommendation:** Extract scripts exceeding ~50 lines into `src/scripts/*.ts` modules and import them. The existing `camera-map.ts` is a good model for this pattern—extend it to other components.

### 4. TypeScript Coverage is Partial (Moderate)
- `tsconfig.json` uses Astro's strict preset, which is good.
- However, the core libraries (`district-matcher.js`, `geo-utils.js`) are plain JavaScript, not TypeScript.
- Inline scripts in `.astro` files bypass TypeScript checking entirely.

**Impact:** The most algorithmically complex code (spatial matching) gets the least type safety. Refactoring requires manual verification of argument types.

**Recommendation:** Convert `district-matcher.js` and `geo-utils.js` to TypeScript. These are self-contained modules with clear interfaces, making conversion straightforward.

### 5. Styling Approach Could Be More Consistent (Low)
- Tailwind utility classes are used inline throughout, which is standard for Tailwind projects.
- However, some color values are hardcoded as hex literals (`#171717`, `#dc2626`, `#d4d4d4`) rather than using Tailwind's theme system or CSS custom properties.
- Changing the color palette would require a find-and-replace across many files.

**Recommendation:** Define the color palette as CSS custom properties or a Tailwind theme extension, then reference those tokens instead of raw hex values. This is a low-priority improvement.

### 6. Scraper Adapter Pattern Could Use More Validation (Low)
- The Python scraper system has a clean adapter pattern (`base.py`, `civicplus.py`, etc.).
- However, adapter errors could silently produce malformed data that wouldn't be caught until it reaches the frontend.
- `validate-data.py` exists but isn't run as part of the scraper CI workflows.

**Recommendation:** Add `validate-data.py` as a step in the `scrape-bills.yml` and `scrape-reps.yml` workflows, so bad data is caught before it's committed.

---

## Maintainability Metrics Summary

| Dimension                  | Rating | Notes                                           |
|----------------------------|--------|-------------------------------------------------|
| Documentation              | 9/10   | Excellent: MANIFEST, README, docs/ folder       |
| Code Organization          | 7/10   | Good except for ActionModal monolith             |
| Dependency Management      | 9/10   | Minimal, well-chosen dependencies                |
| Test Coverage              | 2/10   | No automated tests for application logic         |
| Type Safety                | 5/10   | Strict tsconfig but core libs are plain JS       |
| CI/CD                      | 8/10   | Strong automation, missing test step             |
| Data Architecture          | 9/10   | Clean JSON-driven, registry as single source     |
| Onboarding / Forkability   | 8/10   | Docs explicitly address adapting to other states |
| Component Granularity      | 6/10   | ActionModal too large; others well-scoped        |
| Error Handling             | 6/10   | Graceful in core libs; inconsistent in scripts   |

---

## Priority Recommendations

1. **Split ActionModal.astro** into smaller components and an extracted script module
2. **Add unit tests** for `geo-utils.js` and `district-matcher.js` (highest ROI)
3. **Convert core libs to TypeScript** (`district-matcher.js`, `geo-utils.js`)
4. **Run data validation in CI** as part of scraper workflows
5. **Extract large inline scripts** into `src/scripts/` modules
