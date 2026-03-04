# Statewide Rep Data Scraper Design

## Goal

Automate collection of representative data for all 46 SC counties, ~270 municipalities, and 170 state legislators. Pair rep data with district boundary GeoJSON so the ActionModal can match any SC resident to their representatives.

## Approach

**State legislators:** Download the OpenStates bulk CSV (free, nightly updates). Rich fields: name, party, district, email, phone, photo, social media, committees.

**Local councils:** Build a scraper framework with per-jurisdiction adapters. A central registry maps each jurisdiction to its adapter, website URL, and boundary source. Start with the 5 existing counties; expand iteratively.

**Boundaries:** Expand `build-districts.py` to read the same registry. Generate simplified GeoJSON for every jurisdiction that publishes boundary data. Jurisdictions without boundaries fall back to showing all members.

Ship rep data and boundaries together so new jurisdictions arrive complete.

## Data Schema

Every representative record follows a unified schema:

```json
{
  "name": "Joe Wilson",
  "title": "Senator",
  "district": "1",
  "party": "R",
  "email": "joewilson@scsenate.gov",
  "phone": "(803) 212-6008",
  "photoUrl": "https://scstatehouse.gov/images/member/...",
  "website": "https://...",
  "termStart": "2023-01-10",
  "termEnd": "2027-01-10",
  "committees": ["Judiciary", "Finance"],
  "source": "openstates",
  "lastUpdated": "2026-03-01"
}
```

Required fields: `name`, `source`, `lastUpdated`. All others are optional (many small municipalities publish only names).

`source` tracks provenance: `openstates`, `scstatehouse`, `manual`, or an adapter name. `lastUpdated` is per-record so stale data is visible.

## Output Files

| File | Contents |
|---|---|
| `src/data/state-legislators.json` | All 170 state legislators (expanded schema) |
| `src/data/local-councils.json` | All local council members keyed by jurisdiction |
| `src/data/registry.json` | Jurisdiction metadata, adapter mapping, boundary sources |
| `public/districts/*.json` | Simplified GeoJSON boundary files (one per jurisdiction) |

## Registry

`registry.json` is the central manifest. Each entry describes one jurisdiction:

```json
{
  "id": "county:greenville",
  "name": "Greenville County Council",
  "type": "county",
  "county": "Greenville",
  "adapter": "greenville_county",
  "url": "https://greenvillecounty.org/council",
  "districts": 12,
  "atLarge": false,
  "hasBoundary": true,
  "boundarySource": "arcgis",
  "boundaryUrl": "https://services1.arcgis.com/.../query",
  "boundaryDistrictField": "DISTRICT",
  "boundaryFile": "county-greenville.json",
  "notes": ""
}
```

For manual jurisdictions:

```json
{
  "id": "county:anderson",
  "adapter": "manual",
  "url": "https://andersoncountysc.org/county-council",
  "notes": "Individual emails not published. Use Clerk to Council as fallback. Check meeting minutes for current members."
}
```

## Scraper Architecture

```
scripts/
  scrape-reps/
    __main__.py              # CLI entry point
    state.py                 # OpenStates CSV -> state-legislators.json
    registry.py              # Load registry, dispatch adapters
    adapters/
      __init__.py
      base.py                # BaseAdapter ABC
      civicplus.py           # CivicPlus platform (multiple counties)
      greenville_county.py
      ...
  build-districts.py         # Existing script, expanded
```

### BaseAdapter

```python
class BaseAdapter:
    def fetch(self) -> str:          # GET the page(s)
    def parse(self, html) -> list:   # Extract raw records
    def normalize(self, raw) -> list: # Map to unified schema
    def scrape(self) -> list:        # fetch -> parse -> normalize
```

### Platform Adapters

Some platforms serve multiple jurisdictions. A `CivicPlusAdapter` handles Spartanburg County, Orangeburg County, Hampton County, and others that share URL patterns and HTML structure. The registry entry provides per-jurisdiction config (page IDs, CSS selectors).

```json
{
  "id": "county:spartanburg",
  "adapter": "civicplus",
  "adapterConfig": {
    "baseUrl": "https://spartanburgcounty.org",
    "councilPageId": "189",
    "memberPageIds": ["194", "197"]
  }
}
```

The adapter type list is open-ended. When scraping reveals a new common pattern, add a new platform adapter rather than forcing data into an existing one.

### Error Handling

Each adapter runs independently. If one jurisdiction's site is down, the scraper keeps the last known data and logs a warning. The GitHub Action continues with other jurisdictions.

### Manual Jurisdictions

Jurisdictions with `"adapter": "manual"` are maintained by hand. A `CONTRIBUTING.md` in `scripts/scrape-reps/` provides instructions so Claude (or a human contributor) can populate data given only the registry entry:

1. Read the registry entry for the jurisdiction's URL and notes
2. Visit the URL and collect member data
3. Write to `local-councils.json` under the jurisdiction key
4. Set `lastUpdated` and `source` fields

The registry `notes` field captures gotchas (missing emails, alternative contact paths, site quirks).

## Boundary Expansion

`build-districts.py` reads `registry.json` for entries with `hasBoundary: true`. Supported source types:

| Source | Description | Example |
|---|---|---|
| `arcgis` | ArcGIS REST endpoint | Greenville, Spartanburg, Anderson counties |
| `tiger` | Census TIGER/Line shapefiles | State legislative districts (SLDU/SLDL) |
| `scrfa` | SC Revenue & Fiscal Affairs statewide shapefile | Pickens, Laurens counties |
| `geojson` | Direct GeoJSON URL | Jurisdictions that publish their own |
| `manual` | Hand-sourced GeoJSON in `public/districts/` | Last resort |

New source types are added as discovered during scraping.

Output: simplified GeoJSON in `public/districts/`, one file per jurisdiction. Coordinates rounded to 5 decimals, geometries simplified to ~111m tolerance. Same format as today.

## ActionModal Integration

The ActionModal currently hardcodes lookups for 5 counties and 3 cities. This refactor makes it registry-driven:

- `buildGroups()` iterates `registry.json` to find jurisdictions matching the user's county/city, instead of a fixed list
- `district-matcher.js` reads the registry to know which boundary files exist for the matched location
- New fields (`party`, `photoUrl`, `committees`, etc.) are additive; existing rendering continues to work

The three input paths (geolocation, address, manual dropdowns) and the rendering (group headers, rep cards, email/call buttons) stay unchanged.

## GitHub Actions

One workflow, three jobs:

| Job | Source | Schedule |
|---|---|---|
| `update-state-legislators` | OpenStates CSV | Weekly (Monday 6am ET) |
| `scrape-local-councils` | Registry adapters | Monthly (1st, 6am ET) |
| `build-boundaries` | Registry boundary sources | Monthly (with local scrape) |

Each job runs independently. Only commits when data changes. Boundary job skips re-download unless `--force` is passed or a new `hasBoundary: true` entry appears.

All jobs support manual dispatch via `workflow_dispatch`.

**Dependencies:** Python 3.12, `requests`, `beautifulsoup4`, `shapely`.

## Rollout Strategy

Iterative. Start with:

1. OpenStates integration for all 170 state legislators
2. Migrate existing 5 counties + 3 cities to the new adapter framework
3. Add counties/cities that have structured websites (ArcGIS, CivicPlus)
4. Fill remaining jurisdictions manually as needed

No jurisdiction blocks another. Each new entry in `registry.json` immediately works in ActionModal (full member list fallback if no boundary data).
