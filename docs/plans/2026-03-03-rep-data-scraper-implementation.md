# Statewide Rep Data Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build automated scraping infrastructure for all SC state legislators, 46 county councils, and ~270 municipal councils, paired with expanded district boundary GeoJSON.

**Architecture:** OpenStates CSV for state legislators, adapter-based Python scraper framework for local councils, registry-driven boundary expansion of `build-districts.py`, and ActionModal refactored from hardcoded lookups to registry-driven matching.

**Tech Stack:** Python 3.12, requests, beautifulsoup4, geopandas, shapely, GitHub Actions. Frontend: Astro 5 + existing ActionModal.

---

### Task 1: Create registry.json with existing jurisdictions

Seed the registry with the 5 counties and 3 cities already in `local-councils.json`, plus state legislature entries.

**Files:**
- Create: `src/data/registry.json`

**Step 1: Write the registry file**

```json
{
  "state": {
    "id": "state:sc",
    "name": "South Carolina General Assembly",
    "source": "openstates",
    "sourceUrl": "https://data.openstates.org/people/current/sc.csv",
    "updateSchedule": "weekly"
  },
  "jurisdictions": [
    {
      "id": "county:greenville",
      "name": "Greenville County Council",
      "type": "county",
      "county": "Greenville",
      "adapter": "greenville_county",
      "url": "https://greenvillecounty.org/County_Council/County_Council.asp",
      "districts": 12,
      "atLarge": false,
      "hasBoundary": true,
      "boundarySource": "arcgis",
      "boundaryUrl": "https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/90",
      "boundaryDistrictField": "DISTRICT",
      "boundaryFile": "county-greenville.json",
      "notes": "Districts 17-28"
    },
    {
      "id": "place:greenville",
      "name": "Greenville City Council",
      "type": "place",
      "county": "Greenville",
      "adapter": "greenville_city",
      "url": "https://www.greenvillesc.gov/148/City-Council",
      "districts": 4,
      "atLarge": true,
      "hasBoundary": true,
      "boundarySource": "arcgis",
      "boundaryUrl": "https://citygis.greenvillesc.gov/arcgis/rest/services/AddressSearch/Boundaries/MapServer/2",
      "boundaryDistrictField": "DISTRICT",
      "boundaryFile": "place-greenville.json",
      "notes": "4 districts + 2 at-large + mayor"
    },
    {
      "id": "county:spartanburg",
      "name": "Spartanburg County Council",
      "type": "county",
      "county": "Spartanburg",
      "adapter": "civicplus",
      "adapterConfig": {
        "baseUrl": "https://spartanburgcounty.org",
        "councilPageId": "189"
      },
      "url": "https://www.spartanburgcounty.org/189/County-Council",
      "districts": 6,
      "atLarge": false,
      "hasBoundary": true,
      "boundarySource": "arcgis",
      "boundaryUrl": "https://maps.spartanburgcounty.org/server/rest/services/GIS/County_Council/MapServer/0",
      "boundaryDistrictField": "CoCouncil",
      "boundaryFile": "county-spartanburg.json",
      "notes": "6 districts + chairman"
    },
    {
      "id": "place:spartanburg",
      "name": "Spartanburg City Council",
      "type": "place",
      "county": "Spartanburg",
      "adapter": "manual",
      "url": "https://www.cityofspartanburg.org/city-council",
      "districts": 6,
      "atLarge": false,
      "hasBoundary": false,
      "notes": "6 districts + mayor. No boundary data available."
    },
    {
      "id": "county:anderson",
      "name": "Anderson County Council",
      "type": "county",
      "county": "Anderson",
      "adapter": "manual",
      "url": "https://andersoncountysc.org/county-council",
      "districts": 7,
      "atLarge": false,
      "hasBoundary": true,
      "boundarySource": "arcgis",
      "boundaryUrl": "https://propertyviewer.andersoncountysc.org/arcgis/rest/services/Opengov/MAT/MapServer/5",
      "boundaryDistrictField": "DISTRICT",
      "boundaryFile": "county-anderson.json",
      "notes": "Individual emails not published. Use Clerk to Council (rdwatts@andersoncountysc.org) as fallback. District names stored as words (One, Two, etc.)."
    },
    {
      "id": "place:anderson",
      "name": "Anderson City Council",
      "type": "place",
      "county": "Anderson",
      "adapter": "manual",
      "url": "https://www.cityofandersonsc.com/city-council",
      "districts": 8,
      "atLarge": true,
      "hasBoundary": false,
      "notes": "Seats 1-6 are district, Seats 7-8 are at-large + mayor. Seat 2 currently vacant."
    },
    {
      "id": "county:pickens",
      "name": "Pickens County Council",
      "type": "county",
      "county": "Pickens",
      "adapter": "manual",
      "url": "https://www.pickenscountysc.gov/government/county-council",
      "districts": 6,
      "atLarge": false,
      "hasBoundary": true,
      "boundarySource": "scrfa",
      "boundaryFile": "county-pickens.json",
      "notes": "Boundary from SC RFA statewide shapefile, FIPS 45077"
    },
    {
      "id": "county:laurens",
      "name": "Laurens County Council",
      "type": "county",
      "county": "Laurens",
      "adapter": "manual",
      "url": "https://www.laurenscountysc.gov/government/county-council",
      "districts": 7,
      "atLarge": false,
      "hasBoundary": true,
      "boundarySource": "scrfa",
      "boundaryFile": "county-laurens.json",
      "notes": "Boundary from SC RFA statewide shapefile, FIPS 45059"
    }
  ]
}
```

**Step 2: Verify the file is valid JSON**

Run: `python -c "import json; json.load(open('src/data/registry.json'))"`
Expected: No output (valid JSON)

**Step 3: Commit**

```bash
git add src/data/registry.json
git commit -m "feat: add jurisdiction registry for rep data scraper"
```

---

### Task 2: Create the scraper package scaffold

Set up the Python package structure with `__main__.py` entry point and the `BaseAdapter` abstract class.

**Files:**
- Create: `scripts/scrape-reps/__init__.py` (empty)
- Create: `scripts/scrape-reps/__main__.py`
- Create: `scripts/scrape-reps/adapters/__init__.py` (empty)
- Create: `scripts/scrape-reps/adapters/base.py`

**Step 1: Write `scripts/scrape-reps/adapters/base.py`**

```python
"""Base adapter for scraping council member data."""

import abc
from datetime import date


class BaseAdapter(abc.ABC):
    """Abstract base class for jurisdiction scraper adapters."""

    def __init__(self, entry: dict):
        """Initialize with a registry entry dict."""
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
        """Map raw records to the unified schema.

        Subclasses may override for custom normalization.
        Default passes through with required metadata fields.
        """
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

    def adapter_name(self) -> str:
        """Return the adapter name for the source field."""
        return self.__class__.__name__.lower().replace("adapter", "")
```

**Step 2: Write `scripts/scrape-reps/__main__.py`**

```python
"""
Scrape representative data for SC jurisdictions.

Reads registry.json, dispatches adapters, updates local-councils.json
and state-legislators.json.

Usage:
    python -m scripts.scrape-reps                   # scrape all
    python -m scripts.scrape-reps --state-only       # state legislators only
    python -m scripts.scrape-reps --local-only       # local councils only
    python -m scripts.scrape-reps --jurisdiction county:greenville  # one only
    python -m scripts.scrape-reps --dry-run          # show what would run
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..", "..")
REGISTRY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "registry.json")
STATE_JSON = os.path.join(PROJECT_ROOT, "src", "data", "state-legislators.json")
LOCAL_JSON = os.path.join(PROJECT_ROOT, "src", "data", "local-councils.json")

# Adapter registry -- import adapters here as they are built
ADAPTERS = {}


def load_registry() -> dict:
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_adapter(entry: dict):
    """Return an adapter instance for a registry entry, or None for manual."""
    adapter_name = entry.get("adapter", "manual")
    if adapter_name == "manual":
        return None
    cls = ADAPTERS.get(adapter_name)
    if cls is None:
        print(f"  WARNING: No adapter registered for '{adapter_name}', skipping {entry['id']}")
        return None
    return cls(entry)


def scrape_state(registry: dict, dry_run: bool = False):
    """Download OpenStates CSV and update state-legislators.json."""
    state_config = registry.get("state", {})
    source_url = state_config.get("sourceUrl", "")
    print(f"\n=== State Legislators ===")
    print(f"  Source: {source_url}")

    if dry_run:
        print("  [DRY RUN] Would download and update state-legislators.json")
        return

    # Import here to avoid dependency if only running local scrape
    from .state import update_state_legislators
    update_state_legislators(source_url, STATE_JSON)


def scrape_local(registry: dict, jurisdiction_filter: str = None, dry_run: bool = False):
    """Run adapters for local jurisdictions and update local-councils.json."""
    with open(LOCAL_JSON, "r", encoding="utf-8") as f:
        local_data = json.load(f)

    changes = []

    for entry in registry.get("jurisdictions", []):
        jid = entry["id"]

        if jurisdiction_filter and jid != jurisdiction_filter:
            continue

        print(f"\n--- {entry['name']} ({jid}) ---")

        adapter = get_adapter(entry)
        if adapter is None:
            print(f"  Skipping (manual adapter)")
            continue

        if dry_run:
            print(f"  [DRY RUN] Would scrape {entry['url']}")
            continue

        try:
            members = adapter.scrape()
            print(f"  Scraped {len(members)} members")

            # Preserve existing label and note
            existing = local_data.get(jid, {})
            local_data[jid] = {
                "label": entry["name"],
                **({k: existing[k] for k in ("note",) if k in existing}),
                "members": members,
            }
            changes.append(jid)
        except Exception as e:
            print(f"  ERROR: {e}")

    if changes and not dry_run:
        with open(LOCAL_JSON, "w", encoding="utf-8") as f:
            json.dump(local_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"\nUpdated {len(changes)} jurisdiction(s) in local-councils.json")
    elif not dry_run:
        print("\nNo changes to local-councils.json")


def main():
    parser = argparse.ArgumentParser(description="Scrape SC representative data.")
    parser.add_argument("--state-only", action="store_true", help="Only update state legislators")
    parser.add_argument("--local-only", action="store_true", help="Only update local councils")
    parser.add_argument("--jurisdiction", type=str, help="Scrape a single jurisdiction by ID")
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without scraping")
    args = parser.parse_args()

    registry = load_registry()

    if not args.local_only:
        scrape_state(registry, dry_run=args.dry_run)

    if not args.state_only:
        scrape_local(registry, jurisdiction_filter=args.jurisdiction, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
```

**Step 3: Test the scaffold runs**

Run: `cd C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website && python -m scripts.scrape-reps --dry-run`
Expected: Prints source URL for state, then "Skipping (manual adapter)" for each existing jurisdiction.

**Step 4: Commit**

```bash
git add scripts/scrape-reps/
git commit -m "feat: scraper package scaffold with BaseAdapter and CLI"
```

---

### Task 3: OpenStates CSV integration for state legislators

Download the nightly OpenStates SC CSV and transform it into the expanded `state-legislators.json` schema.

**Files:**
- Create: `scripts/scrape-reps/state.py`
- Modify: `src/data/state-legislators.json` (schema expands)

**Step 1: Write `scripts/scrape-reps/state.py`**

```python
"""Download OpenStates SC CSV and update state-legislators.json."""

import csv
import io
import json
from datetime import date

import requests

HEADERS = {"User-Agent": "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"}


def download_csv(url: str) -> list[dict]:
    """Download the OpenStates CSV and return rows as dicts."""
    print(f"  Downloading {url}...")
    resp = requests.get(url, timeout=60, headers=HEADERS)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


def normalize_row(row: dict) -> dict:
    """Convert an OpenStates CSV row to our unified schema."""
    record = {
        "name": row.get("name", "").strip(),
        "district": row.get("current_district", "").strip(),
        "party": _abbreviate_party(row.get("current_party", "")),
        "email": row.get("email", "").strip(),
        "phone": row.get("capitol_voice", "").strip(),
        "photoUrl": row.get("image", "").strip(),
        "website": _first_link(row.get("links", "")),
        "source": "openstates",
        "lastUpdated": date.today().isoformat(),
    }

    # Optional fields -- only include if present
    if row.get("twitter", "").strip():
        record["twitter"] = row["twitter"].strip()
    if row.get("facebook", "").strip():
        record["facebook"] = row["facebook"].strip()

    return record


def _abbreviate_party(party: str) -> str:
    party = party.strip().lower()
    if party.startswith("democrat"):
        return "D"
    if party.startswith("republican"):
        return "R"
    if party.startswith("independent"):
        return "I"
    return party[:1].upper() if party else ""


def _first_link(links_str: str) -> str:
    """Extract first URL from OpenStates links field (semicolon-separated)."""
    if not links_str or not links_str.strip():
        return ""
    return links_str.strip().split(";")[0].strip()


def update_state_legislators(source_url: str, output_path: str):
    """Download OpenStates CSV and write state-legislators.json."""
    rows = download_csv(source_url)
    print(f"  Downloaded {len(rows)} rows")

    senate = {}
    house = {}

    for row in rows:
        chamber = row.get("current_chamber", "").strip().lower()
        district = row.get("current_district", "").strip()
        if not district:
            continue

        record = normalize_row(row)

        if chamber == "upper":
            senate[district] = record
        elif chamber == "lower":
            house[district] = record
        else:
            print(f"  WARNING: Unknown chamber '{chamber}' for {record['name']}")

    print(f"  Senate: {len(senate)} members, House: {len(house)} members")

    data = {"senate": senate, "house": house}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  Wrote {output_path}")
```

**Step 2: Test the OpenStates download**

Run: `python -m scripts.scrape-reps --state-only`
Expected: Downloads CSV, prints member counts (~46 senate, ~124 house), writes updated `state-legislators.json`.

**Step 3: Verify the output schema**

Run: `python -c "import json; d=json.load(open('src/data/state-legislators.json')); r=d['senate']['1']; print(r.keys())"`
Expected: Shows keys including `name`, `district`, `party`, `email`, `phone`, `photoUrl`, `website`, `source`, `lastUpdated`.

**Step 4: Commit**

```bash
git add scripts/scrape-reps/state.py src/data/state-legislators.json
git commit -m "feat: OpenStates CSV integration for state legislators"
```

---

### Task 4: Write CONTRIBUTING.md for manual data entry

Create the instruction file that Claude (or human contributors) reads when populating manual jurisdictions.

**Files:**
- Create: `scripts/scrape-reps/CONTRIBUTING.md`

**Step 1: Write the contributing guide**

```markdown
# Adding and Updating Representative Data

## Manual Jurisdictions

Jurisdictions with `"adapter": "manual"` in `src/data/registry.json` need hand-populated data. This guide tells you exactly how to do it.

## Steps

1. **Read the registry entry** in `src/data/registry.json` for the target jurisdiction. Note the `id`, `url`, and `notes` fields.

2. **Visit the URL** listed in the registry entry. This is the official council page.

3. **Collect member data.** For each council member, gather as many of these fields as the site publishes:

   | Field | Required | Example |
   |-------|----------|---------|
   | `name` | Yes | `"Jane Smith"` |
   | `title` | Yes | `"Council Member, District 3"` |
   | `email` | No | `"jsmith@county.gov"` |
   | `phone` | No | `"(864) 555-1234"` |
   | `party` | No | `"R"`, `"D"`, `"I"` |
   | `photoUrl` | No | `"https://..."` |
   | `website` | No | `"https://..."` |
   | `source` | Yes | `"manual"` |
   | `lastUpdated` | Yes | `"2026-03-03"` (today's date) |

4. **Write to `src/data/local-councils.json`** under the jurisdiction's key (matching the registry `id`). Follow the existing structure:

   ```json
   "county:example": {
     "label": "Example County Council",
     "members": [
       {
         "name": "Jane Smith",
         "title": "Council Member, District 1",
         "email": "jsmith@examplecounty.gov",
         "phone": "(803) 555-1234",
         "source": "manual",
         "lastUpdated": "2026-03-03"
       }
     ]
   }
   ```

5. **Set `source` to `"manual"`** and **`lastUpdated` to today's date** on every record.

## Title Format

Use these patterns for the `title` field:
- `"Council Member, District 3"` -- standard district member
- `"Chairman, District 5"` -- chair with district
- `"Vice Chairman, District 4"` -- vice chair with district
- `"Mayor"` -- mayor (no district)
- `"Council Member, At Large"` -- at-large member
- `"Council Member, Seat 7"` -- numbered seat (Anderson City pattern)

## Common Gotchas

- Some counties don't publish individual emails. Use the Clerk to Council email for all members and note this in the registry `notes` field.
- "Vacant" seats: use `"name": "Vacant"` with empty email and phone.
- Phone numbers: use the format `"(XXX) XXX-XXXX"`.
- Check the registry `notes` field for jurisdiction-specific issues before starting.

## Adding a New Jurisdiction

1. Add a new entry to `src/data/registry.json` in the `jurisdictions` array.
2. Set `"adapter": "manual"` (or the appropriate adapter name if a scraper exists).
3. Include `url` (the official council page) and `notes` (any quirks).
4. Set `hasBoundary` to `false` unless you have boundary data.
5. Add the member data to `src/data/local-councils.json` as above.
```

**Step 2: Commit**

```bash
git add scripts/scrape-reps/CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md for manual rep data entry"
```

---

### Task 5: Build the first real adapter (Greenville County)

A concrete adapter that scrapes Greenville County Council members. This proves the adapter pattern works end-to-end.

**Files:**
- Create: `scripts/scrape-reps/adapters/greenville_county.py`
- Modify: `scripts/scrape-reps/__main__.py` (register the adapter)

**Step 1: Research the Greenville County Council page**

Visit `https://greenvillecounty.org/County_Council/County_Council.asp` to understand the HTML structure. Note element selectors, data locations, and any pagination.

**Step 2: Write the adapter**

Write `scripts/scrape-reps/adapters/greenville_county.py` implementing `BaseAdapter.fetch()` and `BaseAdapter.parse()`. Extract name, title, district, email, phone from the council page. The specific selectors depend on the live HTML -- inspect the page and build the parser accordingly.

```python
"""Greenville County Council scraper adapter."""

from datetime import date
import requests
from bs4 import BeautifulSoup
from .base import BaseAdapter

HEADERS = {"User-Agent": "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"}


class GreenvilleCountyAdapter(BaseAdapter):

    def fetch(self) -> str:
        resp = requests.get(self.url, timeout=30, headers=HEADERS)
        resp.raise_for_status()
        return resp.text

    def parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        members = []
        # Parse member cards/rows from the council page
        # IMPLEMENTATION: inspect the live HTML and write selectors
        # Each member needs: name, title, district, email, phone
        return members
```

Note: the `parse()` body depends on the live HTML structure. The implementing engineer should inspect the page, identify the repeating element pattern, and write the BeautifulSoup selectors.

**Step 3: Register the adapter in `__main__.py`**

Add to the `ADAPTERS` dict in `scripts/scrape-reps/__main__.py`:

```python
from .adapters.greenville_county import GreenvilleCountyAdapter

ADAPTERS = {
    "greenville_county": GreenvilleCountyAdapter,
}
```

**Step 4: Test the adapter**

Run: `python -m scripts.scrape-reps --jurisdiction county:greenville`
Expected: Scrapes and prints member count (12 members), updates `local-councils.json`.

**Step 5: Verify output matches existing data**

Run: `python -c "import json; d=json.load(open('src/data/local-councils.json')); print(len(d['county:greenville']['members']))"`
Expected: 12

**Step 6: Commit**

```bash
git add scripts/scrape-reps/adapters/greenville_county.py scripts/scrape-reps/__main__.py
git commit -m "feat: Greenville County Council scraper adapter"
```

---

### Task 6: Build additional adapters for existing jurisdictions

Build adapters for the remaining non-manual existing jurisdictions. This task covers Greenville City. Spartanburg County uses a CivicPlus adapter (Task 7). The other 4 jurisdictions are manual.

**Files:**
- Create: `scripts/scrape-reps/adapters/greenville_city.py`
- Modify: `scripts/scrape-reps/__main__.py` (register adapter)

Follow the same pattern as Task 5:
1. Visit the jurisdiction URL from the registry
2. Inspect the HTML structure
3. Implement `fetch()` and `parse()`
4. Register in `ADAPTERS`
5. Test with `--jurisdiction place:greenville`
6. Commit

---

### Task 7: Build CivicPlus platform adapter

CivicPlus powers several SC county/city websites. Build a reusable adapter that takes `adapterConfig` (base URL, page IDs) and scrapes council member data. Start with Spartanburg County as the test case.

**Files:**
- Create: `scripts/scrape-reps/adapters/civicplus.py`
- Modify: `scripts/scrape-reps/__main__.py` (register adapter)

**Step 1: Research the CivicPlus HTML pattern**

Visit `https://www.spartanburgcounty.org/189/County-Council` and note the page structure. CivicPlus sites typically use a consistent template with member cards or a directory listing. The `adapterConfig.councilPageId` maps to the URL path.

**Step 2: Write the CivicPlus adapter**

```python
"""CivicPlus platform adapter for council member data."""

from datetime import date
import requests
from bs4 import BeautifulSoup
from .base import BaseAdapter

HEADERS = {"User-Agent": "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"}


class CivicPlusAdapter(BaseAdapter):

    def fetch(self) -> str:
        base = self.config.get("baseUrl", self.url)
        page_id = self.config.get("councilPageId", "")
        url = f"{base}/{page_id}" if page_id else self.url
        resp = requests.get(url, timeout=30, headers=HEADERS)
        resp.raise_for_status()
        return resp.text

    def parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        members = []
        # IMPLEMENTATION: CivicPlus member card/row parsing
        # Selectors depend on live HTML -- inspect and build
        return members
```

**Step 3: Register in `__main__.py`**

```python
from .adapters.civicplus import CivicPlusAdapter

ADAPTERS = {
    ...
    "civicplus": CivicPlusAdapter,
}
```

**Step 4: Test with Spartanburg County**

Run: `python -m scripts.scrape-reps --jurisdiction county:spartanburg`
Expected: Scrapes 7 members.

**Step 5: Commit**

```bash
git add scripts/scrape-reps/adapters/civicplus.py scripts/scrape-reps/__main__.py
git commit -m "feat: CivicPlus platform adapter (Spartanburg County)"
```

---

### Task 8: Refactor build-districts.py to read from registry

Replace the hardcoded URLs and build functions in `build-districts.py` with registry-driven logic. The script reads `registry.json` for `hasBoundary: true` entries and dispatches by `boundarySource`.

**Files:**
- Modify: `scripts/build-districts.py`

**Step 1: Refactor to registry-driven**

Keep the existing helper functions (`simplify_and_export`, `download_shapefile_zip`, `query_arcgis_geojson`, `_download_rfa_statewide`, `_extract_county_from_rfa`, `round_coords`). Replace the individual `build_*` functions and the hardcoded `main()` dispatch with a loop over registry entries:

```python
def build_from_registry(registry_path, dry_run=False):
    with open(registry_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    rfa_gdf = None  # lazy-load once if needed

    for entry in registry.get("jurisdictions", []):
        if not entry.get("hasBoundary"):
            continue

        jid = entry["id"]
        source = entry.get("boundarySource", "")
        output_path = os.path.join(OUTPUT_DIR, entry["boundaryFile"])

        print(f"\n=== {entry['name']} ({jid}) ===")

        if source == "arcgis":
            build_arcgis(entry, output_path, dry_run)
        elif source == "tiger":
            build_tiger(entry, output_path, dry_run)
        elif source == "scrfa":
            if rfa_gdf is None:
                rfa_gdf = _download_rfa_statewide(dry_run)
                if rfa_gdf is not None and rfa_gdf.crs and rfa_gdf.crs.to_epsg() != 4326:
                    rfa_gdf = rfa_gdf.to_crs(epsg=4326)
            build_scrfa(entry, output_path, rfa_gdf, dry_run)
        elif source == "geojson":
            build_geojson(entry, output_path, dry_run)
        else:
            print(f"  Unknown boundary source: {source}")
```

State legislative districts (SLDU/SLDL) are special -- they don't belong to a single jurisdiction entry. Add them as entries in the registry or handle them separately. Recommend adding two entries:

```json
{
  "id": "state:sc:senate",
  "name": "SC Senate Districts",
  "type": "state",
  "hasBoundary": true,
  "boundarySource": "tiger",
  "boundaryUrl": "https://www2.census.gov/geo/tiger/TIGER2024/SLDU/tl_2024_45_sldu.zip",
  "boundaryDistrictField": "SLDUST",
  "boundaryFile": "sldu.json"
},
{
  "id": "state:sc:house",
  "name": "SC House Districts",
  "type": "state",
  "hasBoundary": true,
  "boundarySource": "tiger",
  "boundaryUrl": "https://www2.census.gov/geo/tiger/TIGER2024/SLDL/tl_2024_45_sldl.zip",
  "boundaryDistrictField": "SLDLST",
  "boundaryFile": "sldl.json"
}
```

**Step 2: Test the refactored script**

Run: `python scripts/build-districts.py --dry-run`
Expected: Lists each `hasBoundary: true` entry with what it would download.

**Step 3: Run a full build to verify output matches existing files**

Run: `python scripts/build-districts.py`
Expected: Generates the same 8 GeoJSON files as before. Compare with `git diff public/districts/`.

**Step 4: Commit**

```bash
git add scripts/build-districts.py src/data/registry.json
git commit -m "refactor: build-districts.py reads from registry.json"
```

---

### Task 9: Expand state-legislators.json consumers in ActionModal

The ActionModal currently reads `name`, `email`, `phone` from state legislators. The expanded schema adds `party`, `photoUrl`, `website`, etc. Update ActionModal to handle both old and new fields gracefully.

**Files:**
- Modify: `src/components/ActionModal.astro`

**Step 1: Update the `define:vars` data injection**

The frontmatter already imports `stateLegislators`. The new fields are additive -- the existing `buildGroups()` and `renderResults()` functions access `rep.name`, `rep.email`, `rep.phone`. No breakage occurs from extra fields.

Optional enhancement: show party badge next to rep names in results. Add `(R)` or `(D)` after the name if `rep.party` exists.

**Step 2: Test the modal still works**

Start the dev server and open the ActionModal. Verify existing functionality (geolocation, address, manual) still works with the expanded JSON.

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: ActionModal displays party affiliation from expanded schema"
```

---

### Task 10: Make ActionModal jurisdiction lookups registry-driven

Replace the hardcoded `county:greenville`, `place:greenville`, etc. lookups in `buildGroups()` with dynamic lookups from `registry.json`.

**Files:**
- Modify: `src/components/ActionModal.astro`
- Modify: `src/lib/district-matcher.js`

**Step 1: Import registry in ActionModal frontmatter**

```astro
import registry from '../data/registry.json';
```

Pass it to `define:vars` alongside the existing data.

**Step 2: Refactor `buildGroups()` to use registry**

Instead of:
```js
if (match.county === 'greenville') {
  // hardcoded lookup
}
```

Iterate `registry.jurisdictions` to find entries matching the user's county/city:
```js
const countyEntries = registry.jurisdictions.filter(
  j => j.type === 'county' && j.county.toLowerCase() === match.county.toLowerCase()
);
```

**Step 3: Refactor `district-matcher.js` COUNTY_FILES and CITY_FILES**

Replace the hardcoded objects with dynamic lookups from registry data. Since `district-matcher.js` functions are inlined in ActionModal (due to `define:vars` limitations), the registry data is already available in scope.

**Step 4: Test with existing jurisdictions**

Verify the modal still correctly matches and displays reps for Greenville, Spartanburg, Anderson, Pickens, Laurens.

**Step 5: Test with a jurisdiction that has no boundary**

Add a test jurisdiction to the registry with `hasBoundary: false`. Verify the modal falls back to showing all members.

**Step 6: Commit**

```bash
git add src/components/ActionModal.astro src/lib/district-matcher.js src/data/registry.json
git commit -m "refactor: ActionModal uses registry for jurisdiction lookups"
```

---

### Task 11: GitHub Actions workflow for rep data

Create the combined workflow with three jobs: state legislators, local councils, and boundaries.

**Files:**
- Create: `.github/workflows/scrape-reps.yml`

**Step 1: Write the workflow**

```yaml
name: Scrape Representative Data

on:
  schedule:
    # State legislators: weekly Monday 10am ET
    - cron: '0 15 * * 1'
    # Local councils + boundaries: monthly 1st at 10am ET
    - cron: '0 15 1 * *'
  workflow_dispatch:
    inputs:
      scope:
        description: 'What to update'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - state-only
          - local-only
          - boundaries-only

jobs:
  update-state-legislators:
    if: >
      github.event_name == 'workflow_dispatch' && (github.event.inputs.scope == 'all' || github.event.inputs.scope == 'state-only')
      || github.event.schedule == '0 15 * * 1'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python -m scripts.scrape-reps --state-only
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet src/data/state-legislators.json || \
            (git add src/data/state-legislators.json && \
             git commit -m "chore: update state legislator data" && \
             git push)

  scrape-local-councils:
    if: >
      github.event_name == 'workflow_dispatch' && (github.event.inputs.scope == 'all' || github.event.inputs.scope == 'local-only')
      || github.event.schedule == '0 15 1 * *'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python -m scripts.scrape-reps --local-only
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet src/data/local-councils.json || \
            (git add src/data/local-councils.json && \
             git commit -m "chore: update local council data" && \
             git push)

  build-boundaries:
    if: >
      github.event_name == 'workflow_dispatch' && (github.event.inputs.scope == 'all' || github.event.inputs.scope == 'boundaries-only')
      || github.event.schedule == '0 15 1 * *'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python scripts/build-districts.py
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet public/districts/ || \
            (git add public/districts/ && \
             git commit -m "chore: update district boundary data" && \
             git push)
```

**Step 2: Update requirements.txt**

Verify `requirements.txt` includes all needed packages: `requests`, `beautifulsoup4`, `geopandas`, `shapely`.

Run: `cat requirements.txt`

Add any missing packages.

**Step 3: Commit**

```bash
git add .github/workflows/scrape-reps.yml requirements.txt
git commit -m "feat: GitHub Actions workflow for rep data scraping"
```

---

### Task 12: Add new counties to the registry (batch 1)

Research and add registry entries for the next wave of counties. Focus on counties that have ArcGIS GIS portals (structured data sources for both rep data and boundaries).

Good candidates to research first:
- **Charleston County** (largest after Greenville)
- **Richland County** (Columbia)
- **Lexington County**
- **Horry County** (Myrtle Beach)
- **York County** (Rock Hill)
- **Beaufort County** (Hilton Head)

**Files:**
- Modify: `src/data/registry.json`
- Modify: `src/data/local-councils.json` (new jurisdiction entries)

**Step 1: Research each county**

For each county:
1. Visit the county website and find the council page
2. Check for ArcGIS endpoints (search for `arcgis` or `gis` subdomains)
3. Determine number of districts, at-large seats
4. Note which adapter would work (existing platform adapter, new adapter needed, or manual)

**Step 2: Add registry entries**

For counties with scrapable sites, add full registry entries with adapter info. For manual counties, add entries with `"adapter": "manual"`.

**Step 3: Populate initial member data**

For manual counties, follow `CONTRIBUTING.md` to populate `local-councils.json`.

**Step 4: Commit**

```bash
git add src/data/registry.json src/data/local-councils.json
git commit -m "feat: add batch 1 county registry entries (Charleston, Richland, etc.)"
```

---

### Task 13: Continue adding counties and municipalities

Repeat Task 12 for remaining counties and municipalities. This is an ongoing effort -- each batch adds 5-10 jurisdictions. Prioritize by:

1. Population (larger counties first)
2. Data availability (ArcGIS/structured sites before manual)
3. ALPR deployment (counties with Flock cameras get priority)

This task repeats until all 46 counties are in the registry. Municipalities follow the same pattern.

---

### Task 14: End-to-end integration test

Verify the full pipeline works: scraper runs, data files update, ActionModal renders new jurisdictions, boundaries load correctly.

**Step 1: Run the full scraper**

Run: `python -m scripts.scrape-reps`
Expected: State legislators update from OpenStates, local councils update from adapters, manual jurisdictions skipped.

**Step 2: Run the boundary builder**

Run: `python scripts/build-districts.py`
Expected: All `hasBoundary: true` jurisdictions generate GeoJSON files.

**Step 3: Start the dev server and test ActionModal**

Run the dev server. Test addresses in different jurisdictions (Greenville, Charleston, Columbia) and verify the modal shows the correct reps with the expanded data.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for rep data pipeline"
```
