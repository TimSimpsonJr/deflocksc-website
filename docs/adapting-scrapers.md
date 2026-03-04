# Adapting Scrapers

This guide explains each data pipeline in the project and what to change when forking the site for a different state.

## Overview

The site has three independent scraper pipelines, each with its own GitHub Actions workflow:

| Pipeline | Script | Output | Workflow |
|----------|--------|--------|----------|
| State legislators | `python -m scripts.scrape_reps --state-only` | `src/data/state-legislators.json` | `scrape-reps.yml` |
| Local councils | `python -m scripts.scrape_reps --local-only` | `src/data/local-councils.json` | `scrape-reps.yml` |
| Bill status | `python scripts/scraper.py` | `src/data/bills.json` | `scrape-bills.yml` |

Two additional pipelines handle geographic and camera data:

| Pipeline | Script | Output | Workflow |
|----------|--------|--------|----------|
| District boundaries | `python scripts/build-districts.py` | `public/districts/*.json` | `scrape-reps.yml` (boundaries-only job) |
| Camera data | `node scripts/fetch-camera-data.mjs` | `public/camera-data.json` | `refresh-camera-data.yml` |

All output files are consumed by Astro components at build time. Workflows commit updated data directly to the repo, which triggers a Netlify redeploy.

## State Legislators

### How it works

`scripts/scrape_reps/state.py` downloads a CSV from [OpenStates](https://openstates.org/), a free API that tracks state legislators across all 50 states:

1. **Download** -- fetches the CSV from the URL in `registry.json` (`state.openStatesUrl`)
2. **Normalize** -- maps OpenStates fields to a unified schema: `name`, `district`, `party`, `email`, `phone`, `photoUrl`, `website`
3. **Backfill phones** -- for any member missing a phone number, scrapes their individual page on `scstatehouse.gov` to find it
4. **Write** -- outputs `src/data/state-legislators.json`, keyed by chamber (`senate` / `house`) then by district number

The CSV uses `current_chamber` values of `upper` (senate) and `lower` (house), and normalizes party names to single-letter abbreviations (D, R, I).

### What to change for your state

**`src/data/registry.json`** -- update the `state` block:

```json
{
  "state": {
    "openStatesUrl": "https://data.openstates.org/people/current/sc.csv",
    "updateSchedule": "weekly",
    "boundaries": [
      {
        "id": "state:sc:senate",
        "name": "SC Senate Districts",
        "boundarySource": "tiger",
        "boundaryUrl": "https://www2.census.gov/geo/tiger/TIGER2024/SLDU/tl_2024_45_sldu.zip",
        "boundaryDistrictField": "SLDUST",
        "boundaryFile": "sldu.json"
      },
      {
        "id": "state:sc:house",
        "name": "SC House Districts",
        "boundarySource": "tiger",
        "boundaryUrl": "https://www2.census.gov/geo/tiger/TIGER2024/SLDL/tl_2024_45_sldl.zip",
        "boundaryDistrictField": "SLDLST",
        "boundaryFile": "sldl.json"
      }
    ]
  }
}
```

Replace:

- **`openStatesUrl`** -- change `sc` to your state's two-letter abbreviation. Find your state's CSV at `https://data.openstates.org/people/current/{state-abbr}.csv`.
- **`boundaryUrl`** -- change the FIPS code (`45` = South Carolina) to your state's FIPS code. The TIGER URL pattern is `https://www2.census.gov/geo/tiger/TIGER2024/SLDU/tl_2024_{FIPS}_sldu.zip` for upper chamber and `SLDL/tl_2024_{FIPS}_sldl.zip` for lower chamber. Nebraska (unicameral) only needs one entry.
- **`boundaryDistrictField`** -- `SLDUST` (upper) and `SLDLST` (lower) are standard TIGER field names. These should work for all states.

**Phone backfill** -- the `_backfill_phones()` function in `state.py` scrapes `scstatehouse.gov` member pages to fill in missing phone numbers. If OpenStates has complete phone data for your state, you can skip this entirely by removing the `_backfill_phones(data)` call. If your state's legislature site has a different HTML structure, adapt `_scrape_phone()` to match -- it currently looks for a `<span>` containing "Business Phone" and extracts the phone number from the parent element.

## Local Councils

### The adapter pattern

Each local jurisdiction in `registry.json` maps to an adapter class that knows how to scrape that government's website. The base class in `scripts/scrape_reps/adapters/base.py` defines the contract:

```python
class BaseAdapter(abc.ABC):
    def __init__(self, entry: dict):
        self.entry = entry
        self.id = entry["id"]
        self.url = entry.get("url", "")
        self.config = entry.get("adapterConfig", {})

    @abc.abstractmethod
    def fetch(self) -> str:
        """Fetch raw page content. Return HTML string."""

    @abc.abstractmethod
    def parse(self, html: str) -> list[dict]:
        """Parse HTML into raw member records."""

    def normalize(self, raw: list[dict]) -> list[dict]:
        """Default passes through with metadata fields."""
        today = date.today().isoformat()
        for record in raw:
            record.setdefault("source", self.adapter_name())
            record.setdefault("lastUpdated", today)
        return raw

    def scrape(self) -> list[dict]:
        """Full pipeline: fetch -> parse -> normalize."""
        html = self.fetch()
        raw = self.parse(html)
        return self.normalize(raw)
```

The CLI entry point (`scripts/scrape_reps/__main__.py`) iterates over `registry.json` jurisdiction entries and dispatches to the matching adapter. Each adapter is registered in the `ADAPTERS` dict at the top of `__main__.py`:

```python
from .adapters.civicplus import CivicPlusAdapter
from .adapters.greenville_city import GreenvilleCityAdapter
from .adapters.greenville_county import GreenvilleCountyAdapter

ADAPTERS = {
    "civicplus": CivicPlusAdapter,
    "greenville_city": GreenvilleCityAdapter,
    "greenville_county": GreenvilleCountyAdapter,
}
```

### Reusable CivicPlus adapter

Many local governments use CivicPlus as their website platform. The `adapters/civicplus.py` adapter handles the common patterns:

- **Page discovery** -- given a `councilPageId`, it fetches the council landing page and auto-discovers the staff directory URL (`/directory.aspx?did=N`)
- **Cloudflare fallback** -- some `.org` CivicPlus sites have Cloudflare bot protection. The adapter tries the `.gov` variant if a `.org` request returns 403
- **Email de-obfuscation** -- CivicPlus hides emails behind inline JavaScript (`var w = "localpart"; var x = "domain.org"`). The adapter reconstructs the address
- **Title normalization** -- maps CivicPlus directory titles like "District 1 Representative" to standard format "Council Member, District 1"
- **Member filtering** -- excludes non-council staff (e.g., "Clerk to County Council") via configurable exclude terms

To use CivicPlus for a new jurisdiction, add a registry entry with `"adapter": "civicplus"` and the appropriate `adapterConfig`:

```json
{
  "id": "county:spartanburg",
  "name": "Spartanburg County Council",
  "adapter": "civicplus",
  "adapterConfig": {
    "baseUrl": "https://spartanburgcounty.org",
    "councilPageId": "189/County-Council",
    "directoryDeptId": "42",
    "memberFilter": ["clerk"]
  }
}
```

Config fields:

- `baseUrl` -- the site root URL
- `councilPageId` -- the CivicPlus page path for the council landing page
- `directoryDeptId` -- (optional) the directory department ID; auto-discovered from the council page if omitted
- `memberFilter` -- (optional) list of title substrings to exclude from results; defaults to `["clerk"]`

### Writing a custom adapter

When a jurisdiction's website does not use CivicPlus, write a custom adapter. Here is the step-by-step process:

**1. Create the adapter file.**

Create `scripts/scrape_reps/adapters/your_jurisdiction.py`:

```python
"""Adapter for scraping Your County Council members."""

import requests
from bs4 import BeautifulSoup

from .base import BaseAdapter

USER_AGENT = "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"


class YourCountyAdapter(BaseAdapter):
    """Scraper for Your County Council."""

    def fetch(self) -> str:
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(self.url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.text

    def parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        members = []

        # TODO: navigate the page's DOM to extract member data.
        # Each member dict should have at minimum:
        #   name, title, email, phone

        return members
```

**2. Implement `fetch()`.**

Return the raw HTML string. If you need data from multiple pages (like Greenville County, which merges a listing page with a contact page), fetch the additional pages here and store them as instance attributes.

**3. Implement `parse(html)`.**

Return a list of member dicts. Each dict should include at least `name` and `title`. Optional fields: `email`, `phone`, `party`, `photoUrl`, `website`.

**4. Override `normalize()` if needed.**

The base class adds `source` and `lastUpdated` automatically. Override only if you need custom field transformations.

**5. Register the adapter.**

In `scripts/scrape_reps/__main__.py`, import and add your adapter to the `ADAPTERS` dict:

```python
from .adapters.your_county import YourCountyAdapter

ADAPTERS = {
    # ... existing adapters ...
    "your_county": YourCountyAdapter,
}
```

**6. Add a registry entry.**

In `src/data/registry.json`, add an entry to the `jurisdictions` array:

```json
{
  "id": "county:your_county",
  "name": "Your County Council",
  "type": "county",
  "county": "Your County",
  "adapter": "your_county",
  "url": "https://yourcounty.gov/council",
  "districts": 7,
  "atLarge": false,
  "hasBoundary": false
}
```

**7. Test it.**

```sh
python -m scripts.scrape_reps --jurisdiction county:your_county
```

### Manual data entry

Not every jurisdiction has a scrapable website. For those, set `"adapter": "manual"` in the registry entry and hand-populate the data in `src/data/local-councils.json`. The scraper will skip manual entries automatically.

See `scripts/scrape_reps/CONTRIBUTING.md` for the full guide on manual data entry, including the required fields and title format conventions.

### Registry entry reference

All fields available for a `jurisdictions` entry in `registry.json`:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique key, prefixed by type: `county:greenville`, `place:greenville` |
| `name` | Yes | Display name: "Greenville County Council" |
| `type` | Yes | `county` or `place` (city/town) |
| `county` | Yes | County name for grouping in the UI |
| `adapter` | Yes | Adapter key (e.g., `civicplus`, `greenville_county`) or `manual` |
| `adapterConfig` | No | Object passed to the adapter's `self.config`; contents vary by adapter |
| `url` | No | Official council webpage URL |
| `districts` | No | Total number of districts |
| `districtRange` | No | District number range if non-standard, e.g., `"17-28"` |
| `atLarge` | No | `true` if the council has at-large seats |
| `hasBoundary` | No | `true` if district boundary data is available |
| `boundarySource` | No | `tiger`, `arcgis`, or `scrfa` |
| `boundaryUrl` | No | URL to fetch boundary data from |
| `boundaryDistrictField` | No | Field name in the boundary data containing the district number |
| `boundaryFile` | No | Output filename in `public/districts/` |
| `notes` | No | Free-text notes about quirks or data quality |

## Bill Scraper

### How it works

`scripts/scraper.py` reads the list of tracked bills from `src/data/bills.json`, then scrapes each bill's page on `scstatehouse.gov` to update three fields:

- `status` -- current committee assignment, extracted from the "STATUS INFORMATION" section
- `lastAction` -- most recent action from the history table
- `lastActionDate` -- date of that action

The bill list itself (which bills to track) is defined in `bills.json`. The scraper does not discover new bills -- it only updates the status of existing entries.

### What to change for your state

This is the most state-specific scraper. Your state's legislature site will have completely different HTML structure.

1. **Replace the bill list** in `src/data/bills.json`. Each entry needs at minimum: `bill`, `title`, `url`, `description`.
2. **Rewrite `scrape_bill()`** in `scripts/scraper.py`. The current implementation parses `scstatehouse.gov`'s specific HTML: a `div.statusCoverSheet` containing a `<table>` for action history and `<p>` tags for status information. Your state's site will have different markup.
3. **Update the User-Agent** string in `HEADERS` to reflect your site's domain.

The overall structure (read JSON, scrape each URL, update fields, write JSON) is reusable. Only the HTML parsing needs to change.

## District Boundaries

### How it works

`scripts/build-districts.py` reads `src/data/registry.json` and generates simplified GeoJSON files in `public/districts/`. These are loaded by the browser for client-side point-in-polygon district matching.

The script supports three boundary source types:

- **`tiger`** -- Census TIGER/Line shapefiles. Used for state legislative districts. Downloads a zip file, extracts the shapefile, simplifies geometries, and outputs GeoJSON with a single `district` property.
- **`arcgis`** -- ArcGIS REST API endpoints. Used for county and city council districts where the local GIS department publishes boundary data. Queries the `/query` endpoint with `f=geojson`.
- **`scrfa`** -- SC Revenue and Fiscal Affairs statewide shapefile. A fallback source containing county council districts for all SC counties. The script downloads it once and extracts individual counties by FIPS code.

All output files are simplified to ~0.001 degree tolerance (~111m) and coordinates are rounded to 5 decimal places to keep files compact for browser loading.

### What to change for your state

**State legislative boundaries** -- change the FIPS code in the TIGER URLs. The pattern is:

```
https://www2.census.gov/geo/tiger/TIGER2024/SLDU/tl_2024_{FIPS}_sldu.zip
https://www2.census.gov/geo/tiger/TIGER2024/SLDL/tl_2024_{FIPS}_sldl.zip
```

Also update the `STATEFP` filter in `build_tiger()` -- it currently checks for `"45"` (SC).

**Local council boundaries** -- you will need to find ArcGIS REST endpoints for your counties/cities. Many local governments publish their GIS data through ArcGIS Online or an on-premises ArcGIS Server. Look for a MapServer or FeatureServer layer that contains council district polygons.

Each jurisdiction with boundary data needs these fields in its registry entry:

```json
{
  "hasBoundary": true,
  "boundarySource": "arcgis",
  "boundaryUrl": "https://gis.yourcounty.gov/arcgis/rest/services/.../MapServer/0",
  "boundaryDistrictField": "DISTRICT",
  "boundaryFile": "county-yourcounty.json"
}
```

**The `scrfa` source is SC-specific.** Your state may have an equivalent statewide source of county council boundaries, or you may need to find individual ArcGIS endpoints for each jurisdiction. Remove the `scrfa` builder if it does not apply to your state.

## Camera Data

### How it works

`scripts/fetch-camera-data.mjs` fetches ALPR camera locations from the [Deflock](https://deflock.org) CDN. The CDN serves camera data in geographic tiles; the script fetches a single tile covering the Southeast US:

```
https://cdn.deflock.me/regions/20/-100.json
```

The output is saved to `public/camera-data.json` and loaded by the MapLibre GL JS map component at runtime.

### What to change for your state

**Tile coordinates** -- the tile URL `regions/20/-100.json` covers roughly the Southeast US. If your state is in a different region, you may need a different tile. Deflock's tiling scheme uses latitude/longitude grid coordinates. Check [deflock.org/map](https://deflock.org/map) to find which tile(s) cover your area.

**Map center and zoom** -- update `MAP_CENTER` and `MAP_ZOOM` in `src/scripts/camera-map.ts`. The current values center the map on Greenville, SC:

```typescript
const MAP_CENTER: [number, number] = [-82.39, 34.85];
const MAP_ZOOM = 11;
```

Replace these with coordinates and zoom level appropriate for your region.

**Map style** -- the camera map uses a custom dark style at `public/map-style.json`, generated by `scripts/build-map-style.mjs`. This script fetches the OpenFreeMap dark base style and remaps its gray palette to the site's dark-blue tones. If you change the site's color palette, regenerate it with `node scripts/build-map-style.mjs` after updating the color map in `buildExactMap()`.

## GitHub Actions

Three workflow files in `.github/workflows/`:

### `scrape-reps.yml`

Runs three jobs: `update-state-legislators`, `scrape-local-councils`, and `build-boundaries`. State legislators update weekly (every Monday). Local councils and boundaries update monthly (1st of each month). Supports manual dispatch with a scope selector (`all`, `state-only`, `local-only`, `boundaries-only`).

### `scrape-bills.yml`

Bill status updates weekly on Mondays during legislative session (January through June) and monthly on the 1st off-session (July through December). Adjust the cron schedules for your state's session calendar.

### `refresh-camera-data.yml`

Camera data refreshes weekly on Wednesdays. This schedule is unlikely to need changes.

### What to update

- **Cron schedules** -- adjust for your state's legislative session dates. The bill scraper's `1-6` month range assumes a January-June session.
- **Python version** -- currently set to 3.12. Update if your environment differs.
- **Commit messages** -- the bot commits use descriptive messages like "chore: update bill status data". Update these if you rename the output files.

### OAuth scope gotcha

If you push a repo that contains `.github/workflows/` files, GitHub requires the `workflow` OAuth scope on your token. If you are using the GitHub CLI, refresh your auth:

```sh
gh auth refresh --hostname github.com --scopes workflow
```

Without this, pushes that include workflow file changes will be rejected.

## Running Scrapers Locally

All commands are run from the project root.

**Prerequisites:**

```sh
pip install -r requirements.txt
```

For the boundary builder, you also need `geopandas` and `shapely` (included in `requirements.txt`).

**Commands:**

```sh
# Bill status scraper
python scripts/scraper.py

# State legislators only
python -m scripts.scrape_reps --state-only

# Local councils only
python -m scripts.scrape_reps --local-only

# Single jurisdiction
python -m scripts.scrape_reps --jurisdiction county:greenville

# Dry run (show what would be scraped without making requests)
python -m scripts.scrape_reps --dry-run

# Build district boundary files
python scripts/build-districts.py
python scripts/build-districts.py --dry-run

# Refresh camera data
node scripts/fetch-camera-data.mjs
```

All scrapers include a `User-Agent` header identifying the bot (e.g., `DeflockSC-RepScraper/1.0`). Update these strings in each script to reflect your site's domain. The state legislator backfill adds a 300ms delay between requests to avoid hammering `scstatehouse.gov` -- maintain similar politeness in any custom scrapers.
