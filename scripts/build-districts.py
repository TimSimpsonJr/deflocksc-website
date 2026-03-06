"""
Build district boundary GeoJSON files for client-side point-in-polygon matching.

Downloads boundary shapefiles/GeoJSON from public sources, filters to target
jurisdictions, simplifies geometries for compact file size, and outputs GeoJSON
files to public/districts/ with only the district number property.

Reads src/data/registry.json to determine which boundaries to build and how
to fetch them. Supports three boundary source types:
    - tiger:  Census TIGER/Line shapefiles (state legislative districts)
    - arcgis: ArcGIS REST endpoint (county/city council districts)
    - scrfa:  SC RFA statewide county council shapefile (filtered by FIPS)

This is a run-once script. Re-run only if redistricting happens.

Dependencies (install with pip):
    pip install requests geopandas shapely

Usage:
    python scripts/build-districts.py
    python scripts/build-districts.py --dry-run
"""

import argparse
import io
import json
import os
import sys
import tempfile
import zipfile

try:
    import geopandas as gpd
    import requests
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install requests geopandas shapely")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "districts")
REGISTRY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "registry.json")

# Geometry simplification tolerance in degrees (~0.001 deg ~ 111m at equator).
# This keeps files compact for browser use.
SIMPLIFY_TOLERANCE = 0.001

# Coordinate precision (decimal places) for output GeoJSON.
# 5 decimal places ~ 1.1m precision, plenty for district matching.
COORD_PRECISION = 5

HEADERS = {"User-Agent": "DeflockSC-DistrictBuilder/1.0 (+https://deflocksc.org)"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def round_coords(coords, precision=COORD_PRECISION):
    """Recursively round coordinates to reduce file size."""
    if isinstance(coords, (list, tuple)):
        if len(coords) > 0 and isinstance(coords[0], (int, float)):
            return [round(c, precision) for c in coords]
        return [round_coords(c, precision) for c in coords]
    return coords


def simplify_and_export(gdf, output_path, district_field, district_transform=None):
    """
    Simplify geometries and export GeoJSON with only a 'district' property.

    Args:
        gdf: GeoDataFrame with polygon geometries
        output_path: Path to write the GeoJSON file
        district_field: Name of the field containing district numbers
        district_transform: Optional function to transform district values
    """
    features = []
    for _, row in gdf.iterrows():
        geom = row.geometry

        # Skip features with null geometry
        if geom is None or geom.is_empty:
            continue

        # Simplify geometry
        simplified = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

        # Get district number
        district_val = str(row[district_field]).strip()
        if district_transform:
            district_val = district_transform(district_val)

        # Remove leading zeros (e.g., "001" -> "1")
        district_val = district_val.lstrip("0") or "0"

        # Build GeoJSON feature with rounded coordinates
        geom_dict = mapping(simplified)
        geom_dict["coordinates"] = round_coords(geom_dict["coordinates"])

        features.append({
            "type": "Feature",
            "properties": {"district": district_val},
            "geometry": geom_dict,
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    if len(features) == 0:
        print(f"  WARNING: No valid features after simplification for {output_path}")

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Wrote {output_path} ({len(features)} features, {size_kb:.1f} KB)")
    if size_kb > 100:
        print(f"  WARNING: File exceeds 100KB target. Consider increasing SIMPLIFY_TOLERANCE.")

    # Validate the output file
    validate_output_geojson(output_path, os.path.basename(output_path))


def download_shapefile_zip(url, description):
    """Download a zipped shapefile and return a GeoDataFrame."""
    print(f"  Downloading {description}...")
    print(f"  URL: {url}")
    resp = requests.get(url, timeout=120, headers=HEADERS)
    resp.raise_for_status()

    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, "download.zip")
        with open(zip_path, "wb") as f:
            f.write(resp.content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmpdir)

        # Find the .shp file
        shp_files = [f for f in os.listdir(tmpdir) if f.endswith(".shp")]
        if not shp_files:
            # Check subdirectories
            for root, dirs, files in os.walk(tmpdir):
                for fname in files:
                    if fname.endswith(".shp"):
                        shp_files.append(os.path.join(root, fname))
            if not shp_files:
                raise FileNotFoundError(f"No .shp file found in downloaded archive from {url}")
            shp_path = shp_files[0]
        else:
            shp_path = os.path.join(tmpdir, shp_files[0])

        gdf = gpd.read_file(shp_path)

    print(f"  Downloaded {len(gdf)} features")
    return gdf


def query_arcgis_geojson(base_url, description, where="1=1"):
    """
    Query an ArcGIS REST API MapServer or FeatureServer layer and return
    a GeoDataFrame.

    Uses the /query endpoint with f=geojson to get features directly.
    """
    print(f"  Querying {description}...")
    print(f"  URL: {base_url}")

    query_url = f"{base_url}/query"
    params = {
        "where": where,
        "outFields": "*",
        "outSR": "4326",  # WGS84
        "f": "geojson",
        "returnGeometry": "true",
    }

    resp = requests.get(query_url, params=params, timeout=60, headers=HEADERS)
    resp.raise_for_status()

    geojson_data = resp.json()

    if "error" in geojson_data:
        raise RuntimeError(
            f"ArcGIS API error for {description}: {geojson_data['error']}"
        )

    # Some ArcGIS endpoints return features in a different structure
    if "features" not in geojson_data:
        raise RuntimeError(
            f"Unexpected response format from {description}: no 'features' key"
        )

    gdf = gpd.GeoDataFrame.from_features(geojson_data["features"], crs="EPSG:4326")
    print(f"  Retrieved {len(gdf)} features")
    return gdf


def _download_rfa_statewide(url):
    """
    Download the SC RFA statewide county council districts shapefile.
    Returns a GeoDataFrame.

    This file contains county council districts for ALL SC counties.
    We filter it to extract specific counties that don't have their own
    ArcGIS REST endpoints.
    """
    return download_shapefile_zip(
        url,
        "SC RFA statewide county council districts",
    )


def _extract_county_from_rfa(rfa_gdf, county_fips, county_name, output_path, district_field=None):
    """
    Extract a single county's council districts from the RFA statewide GeoDataFrame.

    The RFA shapefile may use different field names. Common patterns:
    - COUNTYFP / COUNTYFIPS for county FIPS code
    - DISTRICT / DIST / DIST_NUM for district number
    - COUNTY / NAME for county name

    This function tries multiple field name patterns.
    """
    print(f"  Filtering RFA data for {county_name} (FIPS {county_fips})...")

    # Try to find the county filter field
    county_field = None
    for candidate in ["COUNTYFP", "COUNTYFIPS", "COUNTYFP20", "COUNTYFP10", "CNTY_FIPS", "FIPS"]:
        if candidate in rfa_gdf.columns:
            county_field = candidate
            break

    if county_field is None:
        # Try matching by county name (case-insensitive column lookup)
        col_lower = {c.lower(): c for c in rfa_gdf.columns}
        for candidate in ["county", "name", "cnty_name", "namelsad"]:
            if candidate in col_lower:
                county_field = col_lower[candidate]
                county_fips = county_name  # Use name instead of FIPS
                break

    if county_field is None:
        print(f"  ERROR: Could not find county identifier field in RFA data.")
        print(f"  Available columns: {list(rfa_gdf.columns)}")
        print(f"  MANUAL STEP NEEDED: Inspect the RFA shapefile and update field names.")
        return

    # Filter to target county
    if county_field.lower() in ["county", "name", "cnty_name", "namelsad"]:
        # Case-insensitive name match
        county_gdf = rfa_gdf[
            rfa_gdf[county_field].str.lower().str.contains(county_name.lower())
        ]
    else:
        county_gdf = rfa_gdf[rfa_gdf[county_field] == county_fips]

    if len(county_gdf) == 0:
        print(f"  ERROR: No features found for {county_name} in RFA data.")
        print(f"  Unique values in {county_field}: {rfa_gdf[county_field].unique()[:20]}")
        print(f"  MANUAL STEP NEEDED: Check county identifier in the RFA shapefile.")
        return

    print(f"  Found {len(county_gdf)} districts for {county_name}")

    # Find district number field
    if district_field is None:
        for candidate in ["DISTRICT", "DIST", "DIST_NUM", "DIST_ID", "DISTRICTID",
                          "CNCL_DIST", "CC_DIST", "COUNCIL"]:
            if candidate in county_gdf.columns:
                district_field = candidate
                break

    if district_field is None:
        print(f"  ERROR: Could not find district number field in RFA data.")
        print(f"  Available columns: {list(county_gdf.columns)}")
        print(f"  MANUAL STEP NEEDED: Inspect the RFA shapefile and update field names.")
        return

    # Reproject to WGS84 if needed
    if county_gdf.crs and county_gdf.crs.to_epsg() != 4326:
        county_gdf = county_gdf.to_crs(epsg=4326)

    simplify_and_export(county_gdf, output_path, district_field)


# ---------------------------------------------------------------------------
# Generic build functions (dispatched by boundarySource)
# ---------------------------------------------------------------------------

def build_tiger(entry, output_path, dry_run=False):
    """
    Build district boundaries from Census TIGER/Line shapefile.

    Reads boundaryUrl and boundaryDistrictField from the registry entry.
    """
    url = entry["boundaryUrl"]
    district_field = entry["boundaryDistrictField"]
    name = entry["name"]

    if dry_run:
        print(f"  Source: Census TIGER/Line shapefile")
        print(f"  Would download: {url}")
        print(f"  Would write: {output_path}")
        return

    gdf = download_shapefile_zip(url, f"TIGER/Line {name}")

    # Validate district field exists
    if district_field not in gdf.columns:
        raise RuntimeError(
            f"District field '{district_field}' not found in shapefile. "
            f"Available columns: {list(gdf.columns)}"
        )

    # Filter to SC (should already be SC-only, but verify)
    if "STATEFP" in gdf.columns:
        gdf = gdf[gdf["STATEFP"] == "45"]

    validate_geodataframe(gdf, name)

    # Reproject to WGS84 if needed
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    simplify_and_export(gdf, output_path, district_field)


def build_arcgis(entry, output_path, dry_run=False):
    """
    Build district boundaries from an ArcGIS REST API endpoint.

    Reads boundaryUrl, boundaryDistrictField, and optional
    boundaryConfig.districtNameMap from the registry entry.
    """
    url = entry["boundaryUrl"]
    district_field = entry["boundaryDistrictField"]
    name = entry["name"]
    config = entry.get("boundaryConfig", {})

    if dry_run:
        print(f"  Source: ArcGIS REST API")
        print(f"  Would query: {url}")
        print(f"  Would write: {output_path}")
        return

    gdf = query_arcgis_geojson(url, f"{name} districts")

    # Validate district field exists
    if district_field not in gdf.columns:
        raise RuntimeError(
            f"District field '{district_field}' not found in ArcGIS response. "
            f"Available columns: {list(gdf.columns)}"
        )

    validate_geodataframe(gdf, name)

    # Build district transform from config if a name map is provided
    # (e.g., Anderson County: "One" -> "1", "Two" -> "2", etc.)
    district_transform = None
    name_map = config.get("districtNameMap")
    if name_map:
        district_transform = lambda val, m=name_map: m.get(val, val)

    simplify_and_export(gdf, output_path, district_field, district_transform=district_transform)


def build_scrfa(entry, output_path, rfa_gdf, dry_run=False):
    """
    Build district boundaries by extracting from the SC RFA statewide shapefile.

    Reads boundaryConfig.countyFips, boundaryConfig.countyName, and optional
    boundaryDistrictField from the registry entry.
    """
    config = entry.get("boundaryConfig", {})
    county_fips = config.get("countyFips")
    county_name = config.get("countyName", entry.get("county", "Unknown"))
    district_field = entry.get("boundaryDistrictField")  # may be None; _extract will auto-detect

    if dry_run:
        print(f"  Source: SC RFA statewide county council shapefile")
        print(f"  Would extract {county_name} (FIPS {county_fips})")
        print(f"  Would write: {output_path}")
        return

    if rfa_gdf is None:
        print(f"  ERROR: RFA statewide data not available. Cannot build {entry['name']}.")
        return

    _extract_county_from_rfa(rfa_gdf, county_fips, county_name, output_path, district_field)


# ---------------------------------------------------------------------------
# Registry loading and dispatch
# ---------------------------------------------------------------------------

BUILDERS = {
    "tiger": build_tiger,
    "arcgis": build_arcgis,
    "scrfa": build_scrfa,
}


def validate_registry_entry(entry):
    """Validate a registry boundary entry has required fields.

    Returns a list of error messages (empty if valid).
    """
    errors = []
    entry_id = entry.get("id", "<unknown>")

    if not entry.get("name"):
        errors.append(f"{entry_id}: missing 'name'")

    source = entry.get("boundarySource", "")
    if source and source not in BUILDERS:
        errors.append(f"{entry_id}: unknown boundarySource '{source}'")

    if not entry.get("boundaryFile"):
        errors.append(f"{entry_id}: missing 'boundaryFile'")

    # Source-specific field checks
    if source == "tiger":
        if not entry.get("boundaryUrl"):
            errors.append(f"{entry_id}: tiger source requires 'boundaryUrl'")
        if not entry.get("boundaryDistrictField"):
            errors.append(f"{entry_id}: tiger source requires 'boundaryDistrictField'")
    elif source == "arcgis":
        if not entry.get("boundaryUrl"):
            errors.append(f"{entry_id}: arcgis source requires 'boundaryUrl'")
        if not entry.get("boundaryDistrictField"):
            errors.append(f"{entry_id}: arcgis source requires 'boundaryDistrictField'")
    elif source == "scrfa":
        config = entry.get("boundaryConfig", {})
        if not config.get("countyFips"):
            errors.append(f"{entry_id}: scrfa source requires 'boundaryConfig.countyFips'")

    return errors


def validate_geodataframe(gdf, entry_id):
    """Validate a GeoDataFrame contains usable polygon geometries.

    Prints warnings for issues but does not raise.
    """
    if len(gdf) == 0:
        print(f"  WARNING ({entry_id}): GeoDataFrame has 0 features")
        return

    # Check that geometries are polygons
    non_polygon = 0
    null_geom = 0
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            null_geom += 1
        elif geom.geom_type not in ("Polygon", "MultiPolygon"):
            non_polygon += 1

    if null_geom > 0:
        print(f"  WARNING ({entry_id}): {null_geom} features have null/empty geometry")
    if non_polygon > 0:
        print(f"  WARNING ({entry_id}): {non_polygon} features are not Polygon/MultiPolygon")


def validate_output_geojson(output_path, entry_id):
    """Validate the generated GeoJSON file after writing.

    Checks that coordinates fall within SC bounds.
    """
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  WARNING ({entry_id}): Could not validate output: {e}")
        return

    features = data.get("features", [])
    if len(features) == 0:
        print(f"  WARNING ({entry_id}): Output has 0 features")
        return

    # Spot-check first coordinate of each feature is within SC bounds
    out_of_bounds = 0
    for feature in features:
        coords = feature.get("geometry", {}).get("coordinates", [])
        # Navigate to first [lng, lat]
        first = coords
        while isinstance(first, list) and len(first) > 0 and isinstance(first[0], list):
            first = first[0]
        if isinstance(first, list) and len(first) >= 2:
            lng, lat = first[0], first[1]
            if not (-84.0 <= lng <= -78.0 and 31.5 <= lat <= 35.5):
                out_of_bounds += 1

    if out_of_bounds > 0:
        print(f"  WARNING ({entry_id}): {out_of_bounds}/{len(features)} features have coordinates outside SC bounds")


def load_registry():
    """Load and return the registry.json data."""
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def collect_boundary_entries(registry):
    """
    Collect all boundary entries from the registry, yielding tuples of
    (entry_dict, output_filename) for state boundaries and local jurisdictions
    with hasBoundary: true.
    """
    # State-level boundaries (e.g., senate and house districts)
    for entry in registry.get("state", {}).get("boundaries", []):
        yield entry

    # Local jurisdiction boundaries
    for entry in registry.get("jurisdictions", []):
        if entry.get("hasBoundary"):
            yield entry


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Build district boundary GeoJSON files for DeflockSC."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be downloaded without actually downloading.",
    )
    args = parser.parse_args()

    # Load registry
    registry = load_registry()
    print(f"Loaded registry from {REGISTRY_PATH}")

    # Create output directory
    if not args.dry_run:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        print(f"Output directory: {OUTPUT_DIR}")
    else:
        print("=== DRY RUN MODE ===")
        print(f"Output directory would be: {OUTPUT_DIR}")

    errors = []

    # Lazy-loaded RFA statewide GeoDataFrame (downloaded once, shared by all
    # scrfa entries). We track the URL from the first scrfa entry we see.
    rfa_gdf = None
    rfa_downloaded = False

    for entry in collect_boundary_entries(registry):
        entry_id = entry.get("id", "unknown")
        entry_name = entry.get("name", entry_id)
        source = entry.get("boundarySource")
        output_file = entry.get("boundaryFile")

        # Validate registry entry before processing
        entry_errors = validate_registry_entry(entry)
        if entry_errors:
            for err in entry_errors:
                print(f"  VALIDATION: {err}")
            errors.extend((output_file or entry_id, err) for err in entry_errors)

        if not source or not output_file:
            print(f"\n--- Skipping {entry_name}: missing boundarySource or boundaryFile ---")
            continue

        output_path = os.path.join(OUTPUT_DIR, output_file)
        print(f"\n=== {entry_name} ({entry_id}) ===")

        builder = BUILDERS.get(source)
        if builder is None:
            print(f"  ERROR: Unknown boundarySource '{source}'")
            errors.append((output_file, f"Unknown boundarySource '{source}'"))
            continue

        try:
            if source == "scrfa":
                # Lazy-download the RFA statewide file on first scrfa entry
                if not rfa_downloaded:
                    rfa_downloaded = True
                    rfa_url = entry.get("boundaryUrl")
                    if rfa_url and not args.dry_run:
                        try:
                            rfa_gdf = _download_rfa_statewide(rfa_url)
                            if rfa_gdf is not None and rfa_gdf.crs and rfa_gdf.crs.to_epsg() != 4326:
                                rfa_gdf = rfa_gdf.to_crs(epsg=4326)
                        except Exception as e:
                            print(f"\n  ERROR downloading RFA statewide file: {e}")
                            print(f"  Counties using scrfa source will not be generated.")
                            errors.append(("RFA statewide download", str(e)))
                    elif args.dry_run:
                        rfa_url = entry.get("boundaryUrl", "unknown")
                        print(f"  (RFA statewide file would be downloaded from {rfa_url})")

                build_scrfa(entry, output_path, rfa_gdf, dry_run=args.dry_run)
            else:
                builder(entry, output_path, dry_run=args.dry_run)
        except Exception as e:
            print(f"  ERROR: {e}")
            errors.append((output_file, str(e)))

    # --- Summary ---
    print("\n" + "=" * 60)
    if errors:
        print(f"Completed with {len(errors)} error(s):")
        for name, err in errors:
            print(f"  - {name}: {err}")
    else:
        if args.dry_run:
            print("Dry run complete. No files were downloaded or written.")
        else:
            print("All district files built successfully!")

    print("=" * 60)


if __name__ == "__main__":
    main()
