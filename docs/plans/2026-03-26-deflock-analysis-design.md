# Design: deflock-analysis — Surveillance Proximity Analysis

**Date:** 2026-03-26
**Purpose:** Nationwide analysis of ALPR camera proximity to schools, parks, and playgrounds. Answers the question: "Is Flock watching your child's school?"

---

## Goals

1. **Blog post stats** — Generate defensible, citation-ready statistics (e.g., "X% of SC K-12 schools have an ALPR camera within 500 feet")
2. **Website features** — Structured data for interactive maps and school lookup tools on deflocksc
3. **Directional analysis** — Identify cameras aimed at schools/parks rather than roads, challenging Flock's "road monitoring only" narrative
4. **Reproducibility** — Re-runnable pipeline with versioned output and delta tracking between runs

---

## Repo: `deflock-analysis`

New standalone repo designed to hold multiple analyses over time. School/park proximity is the first analysis.

### Integration with deflocksc-website

The analysis outputs clean JSON. The deflocksc website consumes the SC slice at build time (mechanism TBD during implementation — likely GitHub releases or a dist branch, same pattern as `fetch-camera-data.mjs`).

---

## Data Sources

| Source | Data | Format | Size |
|--------|------|--------|------|
| Deflock GitHub (`Ringmast4r/FLOCK`) | Camera locations + network/sharing data | GeoJSON (`CAMERAS_WITH_NETWORK_DATA.geojson`) | ~102MB |
| NCES Common Core of Data (CCD) | Public K-12 school locations | CSV with lat/lon | ~15MB |
| NCES Private School Survey (PSS) | Private K-12 school locations | CSV with lat/lon | ~5MB |
| NCES IPEDS | Postsecondary institution locations | CSV with lat/lon | ~3MB |
| Geofabrik | US OpenStreetMap extract (roads, parks, playgrounds) | PBF | ~10GB |
| SC official parks GIS | Supplement if available | TBD | TBD |

### Camera ID compatibility

The Deflock GitHub GeoJSON may use different IDs than the CDN endpoint that deflocksc currently uses. The pipeline must verify ID compatibility and include both ID schemes if they differ, so the website can join analysis output with its existing camera data.

### School data filtering

Only currently operating schools are included. NCES data contains closed/inactive schools which must be filtered out. The specific NCES data year used is documented in `meta.json`.

---

## Data Model

### Principle: each thing lives in one place

Normalized core files are the source of truth. Pre-joined views are generated build artifacts.

### Normalized Core

**`cameras.json`** — keyed by camera ID, one record per camera:
```json
{
  "12345": {
    "lat": 34.85,
    "lon": -82.39,
    "manufacturer": "Flock Safety",
    "operator": "Greenville PD",
    "direction": 180,
    "network": ["agency-a", "agency-b"],
    "state": "SC"
  }
}
```

**`locations.json`** — keyed by source-prefixed ID, one record per location:
```json
{
  "nces-450001": {
    "name": "Greenville High School",
    "address": "1 Vardry St, Greenville SC 29601",
    "type": "public_k12",
    "subtype": "high_school",
    "lat": 34.8526,
    "lon": -82.3940,
    "state": "SC",
    "county": "Greenville",
    "source": "nces-ccd-2024"
  }
}
```

Location types: `public_k12`, `private_k12`, `university`, `park`, `playground`
Subtypes for K-12: `elementary`, `middle`, `high_school`, `combined`

Park/playground records include `area_acres` for filtering large parks.

**`proximity.json`** — relationship records only:
```json
[
  {
    "camera_id": "12345",
    "location_id": "nces-450001",
    "distance_ft": 380,
    "ring": "500ft",
    "bearing_to_location": 165,
    "aimed_at": "road",
    "nearest_road_bearing": 175
  }
]
```

**`meta.json`** — provenance, thresholds, and limitations:
```json
{
  "generated": "2026-03-26T...",
  "version": "2026-03-26",
  "sources": {
    "cameras": { "source": "deflock-github", "fetched": "2026-03-26", "count": 37272 },
    "public_k12": { "source": "nces-ccd-2024", "count": 98000 },
    "private_k12": { "source": "nces-pss-2023", "count": 32000 },
    "postsecondary": { "source": "nces-ipeds-2024", "count": 6500 },
    "parks": { "source": "osm", "count": null },
    "roads": { "source": "osm-geofabrik-us", "downloaded": "2026-03-26" }
  },
  "thresholds_ft": [500, 1320, 2640],
  "limitations": [
    "School locations are address points, not property boundaries. Actual distances to school property may be shorter.",
    "Park distances are measured to polygon edge, not centroid.",
    "OSM park/playground coverage varies by region.",
    "Camera network/sharing data availability depends on Deflock GitHub dataset."
  ]
}
```

### Pre-Joined Views (generated, not source of truth)

**`locations-with-cameras.json`** — for school lookup:
```json
[
  {
    "id": "nces-450001",
    "name": "Greenville High School",
    "address": "1 Vardry St, Greenville SC 29601",
    "type": "public_k12",
    "subtype": "high_school",
    "state": "SC",
    "camera_count": { "500ft": 1, "quarter_mile": 3, "half_mile": 7 },
    "cameras_aimed_at_location": 2,
    "nearest_camera_ft": 380
  }
]
```

**`cameras-with-locations.json`** — for map rendering:
```json
[
  {
    "id": "12345",
    "lat": 34.85,
    "lon": -82.39,
    "manufacturer": "Flock Safety",
    "operator": "Greenville PD",
    "direction": 180,
    "nearby_schools": 3,
    "nearby_parks": 1,
    "aimed_at_school_or_park": true
  }
]
```

---

## Proximity Thresholds

| Ring | Distance | Rationale |
|------|----------|-----------|
| `500ft` | 500 feet | Line-of-sight surveillance range |
| `quarter_mile` | 1,320 feet | Roughly a school zone |
| `half_mile` | 2,640 feet | Broader neighborhood context |

### Distance measurement

- **Schools/universities:** point-to-point (address lat/lon to camera lat/lon). Limitation documented in methodology — actual distance to property line may be shorter.
- **Parks/playgrounds:** point-to-polygon-edge (camera to nearest point on park boundary). Includes `area_acres` field for filtering large parks (state forests, etc.).

---

## Directional Analysis

**Goal:** Identify cameras that are primarily monitoring people (especially children) rather than traffic. We give every benefit of the doubt to the "road monitoring" interpretation — cameras flagged as "aimed at location" are strong findings.

### Road types included (generous definition)

OSM highway types treated as "roads": `motorway`, `motorway_link`, `trunk`, `trunk_link`, `primary`, `primary_link`, `secondary`, `secondary_link`, `tertiary`, `tertiary_link`, `unclassified`, `residential`, `service`.

Excluded: `footway`, `cycleway`, `path`, `track`, `pedestrian`, `steps`, `bridleway`.

### Classification logic

For each camera+location pair within proximity where the camera has a `direction` tag:

1. Calculate bearing from camera to location (haversine bearing)
2. Query nearest road segment from extracted OSM road data
3. Calculate bearing of that road segment at the point nearest the camera
4. Classify:
   - Camera direction within **±30°** of road bearing → `"road"`
   - Camera direction within **±45°** of location bearing AND not aligned with road → `"location"`
   - No direction data or ambiguous → `"unknown"`

### Direction field format handling

The camera data has two formats:
- Single value: `"180"` — camera faces one direction
- Range: `"70;240"` — camera sweeps an arc (treat as two directions, flag as `"location"` if either direction aims at the location AND neither aligns with a road)

---

## Versioning and Delta Tracking

Output directories are timestamped:

```
output/
├── runs/
│   ├── 2026-03-26/
│   │   ├── core/
│   │   ├── views/
│   │   └── by-state/
│   └── 2026-06-15/
│       ├── core/
│       ├── views/
│       └── by-state/
├── latest -> runs/2026-06-15    # symlink
└── deltas/
    └── 2026-03-26_to_2026-06-15.json
```

### Delta tracking

Between runs, track:
- **New cameras:** cameras appearing near locations that weren't there before
- **Removed cameras:** cameras no longer in the dataset
- **Changed proximity:** locations gaining or losing nearby cameras
- **New locations:** schools that opened, new parks added to OSM

Delta file format:
```json
{
  "from": "2026-03-26",
  "to": "2026-06-15",
  "cameras_added": 142,
  "cameras_removed": 8,
  "new_proximity_pairs": [...],
  "removed_proximity_pairs": [...]
}
```

---

## Validation

The pipeline generates a spot-check report as a formal step:

**`validation-report.md`** — 10 randomly selected school-camera pairs with:
- School name and address
- Camera ID, manufacturer, operator
- Calculated distance
- Directional classification
- OpenStreetMap link centered on the camera+school pair for visual verification

This report is committed alongside the output and serves as part of the methodology documentation.

---

## Pipeline

```
fetch_cameras.py     → data/cameras/cameras.geojson
fetch_schools.py     → data/schools/*.csv
fetch_osm.py         → data/osm/us-latest.osm.pbf
         ↓
extract_roads.py     → data/osm/roads-near-cameras.gpkg
extract_parks.py     → data/osm/parks.gpkg
         ↓
analyze_proximity.py → output/runs/{date}/core/*.json
         ↓
build_views.py       → output/runs/{date}/views/*.json
                       output/runs/{date}/by-state/**/*.json
                       output/runs/{date}/summary.md
                       output/runs/{date}/validation-report.md
         ↓
build_deltas.py      → output/deltas/{old}_to_{new}.json
```

Orchestrated by a `Makefile` that supports partial runs (only re-runs steps whose inputs have changed).

### Performance

- **Spatial indexing with R-tree** — 37K cameras × 130K+ locations would be ~5 billion naive comparisons. R-tree pre-filters to candidates within the largest threshold, reducing to thousands of actual distance calculations.
- **Streaming OSM processing** — `pyosmium` streams the 10GB PBF without loading into memory. Extracts only features within buffer zones around camera locations.

---

## Dependencies

```
shapely
geopandas
pandas
pyosmium
rtree
requests
```

OS-level: `osmium-tool` (for PBF filtering if needed outside Python)

---

## Repo Structure

```
deflock-analysis/
├── README.md
├── Makefile
├── requirements.txt
├── data/                            # gitignored
│   ├── cameras/
│   │   └── cameras.geojson
│   ├── schools/
│   │   ├── nces-public-k12.csv
│   │   ├── nces-private-k12.csv
│   │   └── nces-postsecondary.csv
│   ├── osm/
│   │   ├── us-latest.osm.pbf
│   │   ├── roads-near-cameras.gpkg
│   │   └── parks.gpkg
│   └── parks/
├── scripts/
│   ├── fetch_cameras.py
│   ├── fetch_schools.py
│   ├── fetch_osm.py
│   ├── extract_roads.py
│   ├── extract_parks.py
│   ├── analyze_proximity.py
│   ├── build_views.py
│   ├── build_deltas.py
│   └── validate.py
├── output/                          # gitignored or LFS
│   ├── runs/
│   │   └── {date}/
│   │       ├── core/
│   │       │   ├── cameras.json
│   │       │   ├── locations.json
│   │       │   ├── proximity.json
│   │       │   └── meta.json
│   │       ├── views/
│   │       │   ├── locations-with-cameras.json
│   │       │   └── cameras-with-locations.json
│   │       ├── by-state/
│   │       │   └── {state}/
│   │       │       ├── cameras.json
│   │       │       ├── locations.json
│   │       │       ├── proximity.json
│   │       │       ├── locations-with-cameras.json
│   │       │       └── cameras-with-locations.json
│   │       ├── summary.md
│   │       └── validation-report.md
│   ├── latest -> runs/{date}
│   └── deltas/
│       └── {old}_to_{new}.json
├── docs/
│   └── plans/
│       └── 2026-03-26-deflock-analysis-design.md
└── analyses/
    └── school-proximity/
        ├── README.md
        └── methodology.md
```

---

## Methodology Documentation

**`methodology.md`** in `analyses/school-proximity/` documents:
- Data sources and versions
- Distance measurement approach (point-to-point for schools, point-to-edge for parks)
- Directional classification thresholds and rationale
- Road type inclusion criteria
- Known limitations (address points vs. property boundaries, OSM coverage gaps, direction data availability)
- Validation process

This document is written to withstand scrutiny from press, legal proceedings, or legislative testimony.

---

## Known Data Gaps (documented, not blocking)

- **Daycares and preschools** — not in NCES data. Would require state licensing databases or OSM `amenity=kindergarten`/`amenity=childcare`. Noted as future data source.
- **School property boundaries** — NCES provides address points, not parcel polygons. Distances are measured from the address, not the property line. Actual distances may be shorter.
- **SC official parks data** — OSM-only for v1. SC DPRT or county GIS data can supplement if found.
- **Camera installation dates** — Deflock data does not include temporal information. Cannot determine whether camera or school was there first.

---

## Meerschaum Compatibility

All pipeline functions are designed to accept and return DataFrames, enabling future wrapping as Meerschaum pipes for automated incremental updates. Not implemented in v1.

---

## What This Enables

### For the blog post ("Family Surveillance Angle")
- "X% of SC K-12 schools have an ALPR camera within 500 feet"
- "Y cameras across SC are aimed directly at school/park properties, not roads"
- "The average SC school has Z cameras within a quarter mile"
- Specific school callouts for Greenville-area schools
- Comparison stats across states

### For the website
- School lookup: "Enter your child's school" → show nearby cameras, distance, direction
- Map layer: cameras colored by whether they're near schools/parks
- Filter by type: K-12 only, universities, parks
- Per-state pages if the site expands beyond SC
- Delta tracking for "X new cameras appeared near schools this quarter"
