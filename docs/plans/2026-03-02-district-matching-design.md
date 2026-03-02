# District Matching Design

**Goal:** Match users to their specific state legislative and local council district representatives entirely client-side (for the geolocation flow) or with a single free Census geocoder call (for the typed address flow). Eliminate the Google Civic API dependency.

**Architecture:** Bundle simplified GeoJSON boundary files as static assets, lazy-loaded on first use. Use a client-side ray-casting point-in-polygon algorithm to match lat/lng to districts. No external libraries required.

---

## Data Pipeline

### Boundary Files

Static GeoJSON files served from `public/districts/`:

| File | Source | Contents |
|------|--------|----------|
| `sldu.json` | SC RFA statewide shapefile | SC Senate district boundaries (46 districts) |
| `sldl.json` | SC RFA statewide shapefile | SC House district boundaries (124 districts) |
| `county-greenville.json` | SC RFA or county ArcGIS | Greenville County Council districts 17-28 |
| `county-spartanburg.json` | SC RFA or county ArcGIS | Spartanburg County Council districts 1-6 |
| `county-anderson.json` | SC RFA or county ArcGIS | Anderson County Council districts 1-7 |
| `county-pickens.json` | SC RFA or county ArcGIS | Pickens County Council districts 1-6 |
| `county-laurens.json` | SC RFA or county ArcGIS | Laurens County Council districts 1-7 |
| `place-greenville.json` | City of Greenville ArcGIS REST API | Greenville City Council districts 1-4 |

### Conversion Script

`scripts/build-districts.py` — downloads shapefiles from SC RFA and ArcGIS REST endpoints, filters to target jurisdictions, simplifies geometries for compact file size, outputs GeoJSON with only the district number property. Run once manually; re-run if redistricting happens.

### Point-in-Polygon

A ~30-line ray-casting function inline in the client-side script. No external library needed.

### Coverage Gaps

- **Spartanburg City Council** — no downloadable boundary data found. Falls back to showing all members.
- **Anderson City Council** — PDF maps only, no GIS data. Falls back to showing all members.

---

## Input UI

The modal input state presents three paths, with geolocation as the clear primary:

### 1. Geolocation (primary, prominent)

Large red button: **"Find My Reps"**

Disclosure below: *"For privacy reasons, we have built this so that your location is matched entirely in your browser. No data is sent to any server."*

### 2. Address Input (secondary)

Divider: "or enter your address"

Same text input + submit button as current design, with disclosure below: *"Your address will be sent to the US Census Bureau's free geocoding service to determine your district. No other data is shared, and we do not retain your information."*

### 3. Manual Selection (tertiary)

Small text link: **"I already know my district"**

Expands inline to show dropdowns:
- Senate district number
- House district number
- County selector → county council district number
- City selector (if applicable) → city council district number

Includes links to the SC RFA "find my district" tool for users who need to look up their numbers. Submitting skips all API calls and geolocation — builds results directly from static data.

---

## Matching Flow

All three paths end at the same `buildGroups()` → `renderResults()` pipeline.

### Geolocation Path (zero API calls)

1. Browser provides lat/lng
2. Fetch boundary GeoJSON from `/districts/` (lazy-loaded, cached after first fetch)
3. Point-in-polygon against `sldu.json` → senate district number
4. Point-in-polygon against `sldl.json` → house district number
5. Point-in-polygon against county council boundaries → county + council district number
6. Point-in-polygon against city council boundaries (if point falls within one) → city council district number
7. Pass all district numbers into `buildGroups()`

### Address Path (one Census API call)

1. Send address to US Census geocoder (`geocoding.geo.census.gov`) → returns lat/lng + state legislative district numbers
2. Use lat/lng for point-in-polygon against council district boundaries (same as geolocation path)
3. Pass everything into `buildGroups()`

### Manual Path (zero API calls)

1. User selects from dropdowns: senate district, house district, county + district, city + district
2. Build matching data directly from selections
3. Pass into `buildGroups()`

### Boundary File Loading

Files are fetched on demand, not at page load. Only the relevant files are fetched (e.g., if point lands in Greenville County, fetch `county-greenville.json` and `place-greenville.json` — skip others). Cached in memory after first fetch.

---

## Results UI

### Result Order

1. **Your State Senator** — single matched rep
2. **Your State Representative** — single matched rep
3. **Your Local Representatives** — matched county council member + matched city council member, pulled into their own section with individual send/call buttons
4. **[County] County Council** — full member list with "Email All Members" button
5. **[City] City Council** — full member list with "Email All Members" button (if applicable)

### District Badge

When a local council rep is matched as the user's district rep, they get a "Your district" badge in blue (`text-[#3b82f6] text-xs font-medium`). At-large members and mayors always show without a badge.

### Manual District Correction

Each local council group gets a link below the header: **"Wrong district?"** → reveals a dropdown to select a different district number. Selecting a different district moves the badge and updates the "Your Local Representatives" section.

### No-Match Fallback

If boundary data didn't produce a match for a council group (e.g., Spartanburg City), all members show with no badge, and the link reads **"Select your district"** with the same dropdown.

### Unchanged

Send email buttons (individual + email all), copy letter, phone links, letter preview/edit — all unchanged from current implementation.

---

## Privacy & Transparency

- **Geolocation button:** *"For privacy reasons, we have built this so that your location is matched entirely in your browser. No data is sent to any server."*
- **Address input:** *"Your address will be sent to the US Census Bureau's free geocoding service to determine your district. No other data is shared, and we do not retain your information."*
- **Manual selection:** No disclosure needed (no data leaves the browser).

---

## Google Civic API Removal

The Google Civic API (`divisionsByAddress`) is replaced entirely:
- State legislative districts: point-in-polygon against bundled `sldu.json`/`sldl.json`, or Census geocoder response
- County/city identification: point-in-polygon against council boundary files
- Synthetic place OCD-ID construction: no longer needed

The `PUBLIC_GOOGLE_CIVIC_API_KEY` environment variable can be removed after migration.
