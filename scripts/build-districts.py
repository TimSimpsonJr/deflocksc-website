"""
Build district boundary GeoJSON files for client-side point-in-polygon matching.

Downloads boundary shapefiles/GeoJSON from public sources, filters to target
jurisdictions, simplifies geometries for compact file size, and outputs GeoJSON
files to public/districts/ with only the district number property.

This is a run-once script. Re-run only if redistricting happens.

Dependencies (install with pip):
    pip install requests geopandas shapely

Data sources:
    - SC Senate (SLDU): US Census Bureau TIGER/Line 2024
    - SC House (SLDL): US Census Bureau TIGER/Line 2024
    - Greenville County Council (districts 17-28):
        Greenville County GIS (gcgis.org) ArcGIS REST API
    - Spartanburg County Council (districts 1-6):
        Spartanburg County GIS ArcGIS REST API
    - Anderson County Council (districts 1-7):
        Anderson County GIS ArcGIS REST API
    - Pickens County Council (districts 1-6):
        SC RFA statewide county council districts shapefile
    - Laurens County Council (districts 1-7):
        SC RFA statewide county council districts shapefile
    - Greenville City Council (districts 1-4):
        City of Greenville GIS ArcGIS REST API

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

# Geometry simplification tolerance in degrees (~0.001 deg ~ 111m at equator).
# This keeps files compact for browser use.
SIMPLIFY_TOLERANCE = 0.001

# Coordinate precision (decimal places) for output GeoJSON.
# 5 decimal places ~ 1.1m precision, plenty for district matching.
COORD_PRECISION = 5

HEADERS = {"User-Agent": "DeflockSC-DistrictBuilder/1.0 (+https://deflocksc.org)"}

# --- Census TIGER/Line URLs ---
# SC FIPS code: 45
# TIGER/Line 2024 shapefiles for state legislative districts
TIGER_SLDU_URL = "https://www2.census.gov/geo/tiger/TIGER2024/SLDU/tl_2024_45_sldu.zip"
TIGER_SLDL_URL = "https://www2.census.gov/geo/tiger/TIGER2024/SLDL/tl_2024_45_sldl.zip"

# --- SC RFA statewide county council districts shapefile ---
# Contains all county council districts for the entire state.
# Used as fallback for counties without their own ArcGIS REST API.
# Download from: https://rfa.sc.gov/programs-services/precinct-demographics/jurisdictional-mapping/political-gis-data
RFA_COUNTY_COUNCIL_URL = "https://rfa.sc.gov/media/8135"

# --- ArcGIS REST API endpoints ---
# These return GeoJSON directly when queried with f=geojson.

# Greenville County Council Districts (layer 90 in GreenvilleJS/Map_Layers_JS)
# Districts 17-28, field: DISTRICT (SmallInteger)
GREENVILLE_COUNTY_COUNCIL_URL = (
    "https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/90"
)

# City of Greenville Council Districts (layer 2 in AddressSearch/Boundaries)
# Districts 1-4, field: DISTRICT (SmallInteger)
GREENVILLE_CITY_COUNCIL_URL = (
    "https://citygis.greenvillesc.gov/arcgis/rest/services/AddressSearch/Boundaries/MapServer/2"
)

# Spartanburg County Council (layer 0 in GIS/County_Council)
# Field: CoCouncil (numeric)
SPARTANBURG_COUNTY_COUNCIL_URL = (
    "https://maps.spartanburgcounty.org/server/rest/services/GIS/County_Council/MapServer/0"
)

# Anderson County Council Districts (layer 5 in Opengov/MAT)
# Field: DISTRICT (text, e.g. "One", "Two" ... "Seven")
ANDERSON_COUNTY_COUNCIL_URL = (
    "https://propertyviewer.andersoncountysc.org/arcgis/rest/services/Opengov/MAT/MapServer/5"
)

# FIPS codes for counties we need from the RFA statewide shapefile
# Used to filter the statewide file to just the counties we need.
COUNTY_FIPS = {
    "pickens": "077",   # Pickens County FIPS
    "laurens": "059",   # Laurens County FIPS
}

# Anderson district name-to-number mapping (the Anderson ArcGIS layer
# stores district names as words instead of numbers)
ANDERSON_DISTRICT_NAMES = {
    "One": "1",
    "Two": "2",
    "Three": "3",
    "Four": "4",
    "Five": "5",
    "Six": "6",
    "Seven": "7",
}


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

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Wrote {output_path} ({len(features)} features, {size_kb:.1f} KB)")
    if size_kb > 100:
        print(f"  WARNING: File exceeds 100KB target. Consider increasing SIMPLIFY_TOLERANCE.")


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


# ---------------------------------------------------------------------------
# Build functions for each district file
# ---------------------------------------------------------------------------

def build_sldu(dry_run=False):
    """
    Build SC Senate district boundaries from Census TIGER/Line.

    Source: US Census Bureau TIGER/Line 2024, SLDU (State Legislative
    District Upper Chamber). SC-specific file (STATEFP=45).
    District number field: SLDUST (string, zero-padded).
    """
    print("\n=== SC Senate Districts (SLDU) ===")
    output_path = os.path.join(OUTPUT_DIR, "sldu.json")

    if dry_run:
        print(f"  Would download: {TIGER_SLDU_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = download_shapefile_zip(TIGER_SLDU_URL, "TIGER/Line 2024 SC Senate districts")

    # Filter to SC (should already be SC-only since we downloaded the SC file,
    # but verify just in case)
    if "STATEFP" in gdf.columns:
        gdf = gdf[gdf["STATEFP"] == "45"]

    # Reproject to WGS84 if needed
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    # The district number field is SLDUST (e.g., "001", "046")
    simplify_and_export(gdf, output_path, "SLDUST")


def build_sldl(dry_run=False):
    """
    Build SC House district boundaries from Census TIGER/Line.

    Source: US Census Bureau TIGER/Line 2024, SLDL (State Legislative
    District Lower Chamber). SC-specific file (STATEFP=45).
    District number field: SLDLST (string, zero-padded).
    """
    print("\n=== SC House Districts (SLDL) ===")
    output_path = os.path.join(OUTPUT_DIR, "sldl.json")

    if dry_run:
        print(f"  Would download: {TIGER_SLDL_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = download_shapefile_zip(TIGER_SLDL_URL, "TIGER/Line 2024 SC House districts")

    if "STATEFP" in gdf.columns:
        gdf = gdf[gdf["STATEFP"] == "45"]

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    simplify_and_export(gdf, output_path, "SLDLST")


def build_greenville_county(dry_run=False):
    """
    Build Greenville County Council district boundaries.

    Source: Greenville County GIS (gcgis.org)
    ArcGIS REST API: GreenvilleJS/Map_Layers_JS/MapServer/90
    Districts 17-28, field: DISTRICT (SmallInteger)
    """
    print("\n=== Greenville County Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "county-greenville.json")

    if dry_run:
        print(f"  Would query: {GREENVILLE_COUNTY_COUNCIL_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = query_arcgis_geojson(
        GREENVILLE_COUNTY_COUNCIL_URL,
        "Greenville County Council districts",
    )

    simplify_and_export(gdf, output_path, "DISTRICT")


def build_spartanburg_county(dry_run=False):
    """
    Build Spartanburg County Council district boundaries.

    Source: Spartanburg County GIS
    ArcGIS REST API: GIS/County_Council/MapServer/0
    Field: CoCouncil (numeric district number)
    """
    print("\n=== Spartanburg County Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "county-spartanburg.json")

    if dry_run:
        print(f"  Would query: {SPARTANBURG_COUNTY_COUNCIL_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = query_arcgis_geojson(
        SPARTANBURG_COUNTY_COUNCIL_URL,
        "Spartanburg County Council districts",
    )

    # The field is CoCouncil (numeric). Convert to string for our output.
    simplify_and_export(gdf, output_path, "CoCouncil")


def build_anderson_county(dry_run=False):
    """
    Build Anderson County Council district boundaries.

    Source: Anderson County GIS
    ArcGIS REST API: Opengov/MAT/MapServer/5
    Field: DISTRICT (text, e.g. "One", "Two" ... "Seven")

    Note: Anderson stores district names as words. We convert them to numbers.
    """
    print("\n=== Anderson County Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "county-anderson.json")

    if dry_run:
        print(f"  Would query: {ANDERSON_COUNTY_COUNCIL_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = query_arcgis_geojson(
        ANDERSON_COUNTY_COUNCIL_URL,
        "Anderson County Council districts",
    )

    def transform_anderson_district(val):
        """Convert word district names to numbers."""
        return ANDERSON_DISTRICT_NAMES.get(val, val)

    simplify_and_export(
        gdf, output_path, "DISTRICT", district_transform=transform_anderson_district
    )


def _download_rfa_statewide(dry_run=False):
    """
    Download and cache the SC RFA statewide county council districts shapefile.
    Returns a GeoDataFrame, or None if dry_run.

    This file contains county council districts for ALL SC counties.
    We filter it to extract specific counties that don't have their own
    ArcGIS REST endpoints.
    """
    if dry_run:
        print(f"  Would download SC RFA statewide county council file: {RFA_COUNTY_COUNCIL_URL}")
        return None

    return download_shapefile_zip(
        RFA_COUNTY_COUNCIL_URL,
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
    for candidate in ["COUNTYFP", "COUNTYFIPS", "COUNTYFP20", "COUNTYFP10", "CNTY_FIPS"]:
        if candidate in rfa_gdf.columns:
            county_field = candidate
            break

    if county_field is None:
        # Try matching by county name
        for candidate in ["COUNTY", "NAME", "CNTY_NAME", "NAMELSAD"]:
            if candidate in rfa_gdf.columns:
                county_field = candidate
                county_fips = county_name  # Use name instead of FIPS
                break

    if county_field is None:
        print(f"  ERROR: Could not find county identifier field in RFA data.")
        print(f"  Available columns: {list(rfa_gdf.columns)}")
        print(f"  MANUAL STEP NEEDED: Inspect the RFA shapefile and update field names.")
        return

    # Filter to target county
    if county_field in ["COUNTY", "NAME", "CNTY_NAME", "NAMELSAD"]:
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


def build_pickens_county(dry_run=False, rfa_gdf=None):
    """
    Build Pickens County Council district boundaries.

    Source: SC RFA statewide county council districts shapefile.
    Pickens County does not have a publicly accessible ArcGIS REST API
    endpoint for council districts. Their open data portal
    (pcgis-pickenscosc.opendata.arcgis.com) has parcels, addresses, and
    tax districts but not council districts.

    Fallback: SC RFA statewide file filtered to Pickens County (FIPS 077).
    """
    print("\n=== Pickens County Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "county-pickens.json")

    if dry_run:
        print(f"  Would extract from SC RFA statewide file")
        print(f"  Would write: {output_path}")
        return

    if rfa_gdf is None:
        print("  ERROR: RFA statewide data not available. Cannot build Pickens County.")
        return

    _extract_county_from_rfa(rfa_gdf, COUNTY_FIPS["pickens"], "Pickens", output_path)


def build_laurens_county(dry_run=False, rfa_gdf=None):
    """
    Build Laurens County Council district boundaries.

    Source: SC RFA statewide county council districts shapefile.
    Laurens County does not have a publicly accessible ArcGIS REST API
    for council districts. Their GIS presence is limited to a property
    parcel viewer (laurenscountygis.org).

    Fallback: SC RFA statewide file filtered to Laurens County (FIPS 059).
    """
    print("\n=== Laurens County Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "county-laurens.json")

    if dry_run:
        print(f"  Would extract from SC RFA statewide file")
        print(f"  Would write: {output_path}")
        return

    if rfa_gdf is None:
        print("  ERROR: RFA statewide data not available. Cannot build Laurens County.")
        return

    _extract_county_from_rfa(rfa_gdf, COUNTY_FIPS["laurens"], "Laurens", output_path)


def build_greenville_city(dry_run=False):
    """
    Build Greenville City Council district boundaries.

    Source: City of Greenville GIS
    ArcGIS REST API: AddressSearch/Boundaries/MapServer/2
    Districts 1-4, field: DISTRICT (SmallInteger)
    """
    print("\n=== Greenville City Council Districts ===")
    output_path = os.path.join(OUTPUT_DIR, "place-greenville.json")

    if dry_run:
        print(f"  Would query: {GREENVILLE_CITY_COUNCIL_URL}")
        print(f"  Would write: {output_path}")
        return

    gdf = query_arcgis_geojson(
        GREENVILLE_CITY_COUNCIL_URL,
        "Greenville City Council districts",
    )

    simplify_and_export(gdf, output_path, "DISTRICT")


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

    # Create output directory
    if not args.dry_run:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        print(f"Output directory: {OUTPUT_DIR}")
    else:
        print("=== DRY RUN MODE ===")
        print(f"Output directory would be: {OUTPUT_DIR}")

    errors = []

    # --- State legislative districts (Census TIGER/Line) ---
    try:
        build_sldu(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("sldu.json", str(e)))

    try:
        build_sldl(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("sldl.json", str(e)))

    # --- County council districts with direct ArcGIS endpoints ---
    try:
        build_greenville_county(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("county-greenville.json", str(e)))

    try:
        build_spartanburg_county(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("county-spartanburg.json", str(e)))

    try:
        build_anderson_county(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("county-anderson.json", str(e)))

    # --- County council districts from RFA statewide shapefile ---
    # Download the statewide file once, then extract each county.
    rfa_gdf = None
    try:
        rfa_gdf = _download_rfa_statewide(dry_run=args.dry_run)
        if rfa_gdf is not None and rfa_gdf.crs and rfa_gdf.crs.to_epsg() != 4326:
            rfa_gdf = rfa_gdf.to_crs(epsg=4326)
    except Exception as e:
        print(f"\n  ERROR downloading RFA statewide file: {e}")
        print(f"  Pickens and Laurens county districts will not be generated.")
        errors.append(("RFA statewide download", str(e)))

    try:
        build_pickens_county(dry_run=args.dry_run, rfa_gdf=rfa_gdf)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("county-pickens.json", str(e)))

    try:
        build_laurens_county(dry_run=args.dry_run, rfa_gdf=rfa_gdf)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("county-laurens.json", str(e)))

    # --- City council districts ---
    try:
        build_greenville_city(dry_run=args.dry_run)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(("place-greenville.json", str(e)))

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
