# Live SC Camera Counter — Design

> **STATUS (superseded):** The live-fetch endpoint (Approach A below) was abandoned in favor of
> build-time-daily (Approach C) because DeFlock's CDN returns 403 to fetches from Netlify's function
> egress, so the live function never returned a real count in production (PR #118 discussion). The
> shipped design keeps only the build-time SC count, refreshed **daily** by the `refresh-camera-data`
> GitHub Action (which fetches DeFlock from GitHub egress, not blocked) through the validating
> all-or-nothing fetch. The rest of this document is retained as a historical record of the
> Approach A design.

Date: 2026-09-04
Status: Superseded — Approach A (live Netlify Function) dropped for Approach C (build-time, daily refresh)
Branch: `feature/live-camera-counter`

## 1. Problem & goal

The homepage's statewide ALPR camera number (`impact-stats.json` `scTotal`, currently 1,624) is
computed **at build time** by `scripts/build-impact-stats.mjs` and refreshed **weekly** by the
`refresh-camera-data.yml` GitHub Action. It therefore only changes when the site rebuilds *and
deploys* — and production deploys are currently manual, so the displayed number can lag DeFlock by
weeks. DeFlock's own SC count updates hourly and climbs steadily.

Goal: show a **daily-fresh** SC camera count on the homepage that is **decoupled from the deploy
pipeline**, without changing the counting methodology, and that degrades gracefully to the existing
build-time number.

## 2. Decisions (maintainer-approved)

- **Approach A** — an on-demand, edge-cached Netlify Function; not a scheduled/Blobs job (B) and not
  build-time-only (C).
- **Cadence:** daily (24h edge cache).
- **Reach:** the live number updates **everywhere the SC total appears** on the homepage — the hero
  "more than N" line, the ImpactBand count-up stat, and the MapSection camera statline.
- **Methodology unchanged:** keep the rigorous **SC-polygon-clipped unique-camera-ID count** (the
  current `scTotal` method). DeFlock's looser ~1,900 tally remains a *copy/press* figure only; the
  site keeps its own defensible number.

## 3. Architecture

Three parts plus a build change:

### 3.1 Shared count module (`src/lib/sc-camera-count.ts`, new)
Extract the SC-count logic that currently lives inline in `build-impact-stats.mjs` (the point-in-
polygon pass over `public/districts/state-outline.json`, plus the per-jurisdiction pass over the
`county-*`/`place-*` boundary files, mirroring `src/lib/geo-utils.ts`) into one importable module:

- `countScCameras(cameras, stateOutline, jurisdictionBoundaries) => { scTotal, jurisdictions, perJurisdiction }`
- Pure, dependency-free, Vitest-covered. **One source of truth** for the methodology, imported by
  BOTH the build script and the new function, so the two can never diverge.
- `build-impact-stats.mjs` is refactored to import this instead of its inline copy (targeted
  cleanup of code we're already touching; no behavior change — guarded by the new unit test).

### 3.2 Endpoint: `netlify/functions/sc-camera-count.ts` (new)
- On invocation: fetch the DeFlock camera source **the same way `fetch-camera-data.mjs` does** (reuse
  its DeFlock CDN URL + the SC bounding-box pre-filter so only the ~few-thousand SC-area candidates
  are point-in-polygon tested, not the full ~62k SE-US tile), read the committed
  `public/districts/state-outline.json` + boundary files, run `countScCameras`, and return:
  ```json
  { "scTotal": 1624, "jurisdictions": 37, "generatedAt": "2026-09-04T00:00:00Z", "stale": false }
  ```
- **Caching:** `Netlify-CDN-Cache-Control: public, durable, s-maxage=86400, stale-while-revalidate=86400`
  → DeFlock is hit at most ~once/day regardless of traffic (polite), viewers get an instant edge-
  cached response, and a stale value is served while a fresh one is fetched in the background.
- **Errors:** any upstream/compute failure returns HTTP 200 with `{ stale: true }` and no `scTotal`
  (or the last-known build-time number if trivially available), so the client simply keeps the
  build-time value. The function never 5xxs the homepage's fetch.

### 3.3 Client integration (`src/scripts/live-count.ts`, new; wired in the homepage components)
- On load, `fetch('/api/sc-camera-count')` (same-origin; mapped to the function via `netlify.toml`
  redirect, e.g. `/api/sc-camera-count` → `/.netlify/functions/sc-camera-count`).
- On success with a numeric `scTotal`:
  - **ImpactBand:** retarget the count-up (`count-up.ts`) to the live value.
  - **Hero:** recompute the "more than N" floor (`Math.floor(scTotal/100)*100`) from the live value.
  - **MapSection statline:** update its camera count.
- On failure, non-numeric, or `stale: true`: do nothing — every element already rendered the
  build-time number.
- Respects `prefers-reduced-motion` the same way the existing count-up does.

### 3.4 Build change
- Bump `refresh-camera-data.yml` cron **weekly → daily** so the committed fallback number and the
  map's committed `camera-data.json` snapshot stay fresh too.
- Run the refresh once during implementation so the committed `impact-stats.json` isn't a week stale
  at merge.

## 4. Data-flow & fallback ladder

```
DeFlock CDN ──(daily, on cache-miss)──▶ sc-camera-count fn ──▶ edge cache (24h SWR) ──▶ client fetch
                                                                                          │
homepage build ── build-impact-stats.mjs ──▶ impact-stats.json ──(SSR)──▶ DOM value ◀─────┘ (fallback)
```

Fallback ladder (the number is never blank, never blocks render):
1. **Live** value from the endpoint (client-side, best).
2. **Build-time** `impact-stats.json` value (server-rendered; used if fetch fails / stale / JS off).
3. It is always at least the SSR'd build number — no empty state.

## 5. Non-goals / out of scope

- Switching the site's count to DeFlock's (looser) methodology — explicitly rejected; the site keeps
  its rigorous clipped count.
- A scheduled function + Netlify Blobs pre-compute (Approach B) — unnecessary for a daily cadence;
  revisit only if runtime DeFlock fetches prove flaky.
- Per-jurisdiction live updates in the ActionModal statlines — the modal keeps its build-time
  `camera-counts.json`; only the three homepage SC-total surfaces go live. (Can extend later.)
- Any change to the map's live per-viewport tile rendering (already live via the tile proxy).

## 6. CSP / security / politeness

- The client fetch is **same-origin** (`/api/...`) → satisfies the existing `connect-src 'self'` CSP
  in `public/_headers` + `netlify.toml`; no CSP change needed. Confirm the `/api/*` redirect is
  added to `netlify.toml` (and mirrored in the dev proxy in `astro.config.mjs` if needed for local).
- Edge caching means ≤ ~1 DeFlock fetch/day site-wide → respects DeFlock (no per-view scraping).
- The function exposes only an aggregate count (no camera coordinates/PII).

## 7. Testing

- **Unit (`src/lib/sc-camera-count.test.ts`):** fixture camera set + a small SC polygon → assert
  `scTotal` (unique-ID dedup, polygon-clip, holes/MultiPolygon), and per-jurisdiction counts.
- **Regression:** assert the refactored `build-impact-stats.mjs` produces the same `scTotal` for a
  fixture as the pre-refactor inline logic (parity).
- **Function:** returns the `{ stale: true }` fallback shape on a mocked upstream error; sets the
  documented cache-control header on success.
- **Client:** with JS disabled the build-time number renders; on fetch failure the DOM value is
  unchanged (graceful degradation).

## 8. Files

New:
- `src/lib/sc-camera-count.ts` (+ `.test.ts`)
- `netlify/functions/sc-camera-count.ts` (+ a function test under `tests/functions/`)
- `src/scripts/live-count.ts`

Modified:
- `scripts/build-impact-stats.mjs` (import the shared module; drop the inline copy)
- `src/components/Hero.astro`, `ImpactBand.astro`, `MapSection.astro` (opt into the live-count script / data hooks)
- `netlify.toml` (`/api/sc-camera-count` redirect; confirm CSP unchanged), `astro.config.mjs` (dev proxy if needed)
- `.github/workflows/refresh-camera-data.yml` (weekly → daily)

## 9. Rollout

Feature branch → workflow-driven implementation (implementer + adversarial self-review) → PR. The
maintainer deploys via Netlify when ready. The live counter starts working as soon as the function
is deployed; until then the build-time fallback shows exactly as today.
