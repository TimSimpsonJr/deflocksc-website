# Code Quality Fixes

Date: 2026-03-11
Branch: `fix/code-quality`

## Fixes

### 1. Gitignore lighthouse reports (repo hygiene)

**Problem:** `lighthouse-report.json` (887KB) and `lighthouse-prod.json` (712KB) are untracked but not gitignored. One `git add .` commits 1.5MB of CI artifacts.

**Fix:** Add `lighthouse*.json` to `.gitignore`.

### 2. Fix `any` types (type safety)

**Problem:** Four `catch (err: any)` blocks bypass TypeScript's type system.

**Files:**
- `src/scripts/action-modal/index.ts` lines 51, 90
- `src/scripts/foia-finder.ts` lines 211, 239

**Fix:** Change to `catch (err: unknown)` with proper type narrowing. For the geolocation catch (index.ts line 51), narrow with an object shape check for `.code` (GeolocationPositionError). For address/generic catches, use `err instanceof Error` with `String(err)` fallback.

### 3. Fix HTTP photo URL (mixed content)

**Problem:** One legislator photo URL uses `http://` instead of `https://`.

**File:** `src/data/state-legislators.json` line 251

**Fix:** Change `http://www.scstatehouse.gov/` to `https://www.scstatehouse.gov/`.

## Dropped After Investigation

- **GHA schedule conditions** — `github.event.schedule` does contain the cron expression string; the conditions are correct
- **GHA validation gating** — `validate-data.py` exits with code 1 on errors, GHA stops correctly
- **Lazy-load modal data island** — deferred; integration risk outweighs benefit right now
- **Arc animation CSS** — hand-tuned acceleration curve, parameterizing would change timings
- **innerHTML refactor** — escapeHtml() used consistently, low risk
- **Hardcoded Windows path** — local-only script, only runs on one machine
- **Draft mode** — intentional behavior
