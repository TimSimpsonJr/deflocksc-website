"""
Count cameras per county/city boundary and output camera-counts.json.

Loads public/camera-data.json and all public/districts/county-*.json and
place-*.json boundary GeoJSON files. Uses Shapely point-in-polygon to count
cameras inside each jurisdiction's unioned boundary.

Dependencies: pip install shapely

Usage: python scripts/build-camera-counts.py
"""

import glob
import json
import os
import re
import sys

try:
    from shapely.geometry import shape, Point
    from shapely.ops import unary_union
    from shapely.prepared import prep
except ImportError:
    print("Missing dependency. Install with: pip install shapely")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..")
CAMERA_DATA = os.path.join(PROJECT_ROOT, "public", "camera-data.json")
DISTRICTS_DIR = os.path.join(PROJECT_ROOT, "public", "districts")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "public", "camera-counts.json")

# SC bounding box — pre-filter cameras before expensive point-in-polygon
SC_BOUNDS = {"min_lat": 31.5, "max_lat": 35.5, "min_lon": -84.0, "max_lon": -78.0}


def load_cameras():
    with open(CAMERA_DATA, "r", encoding="utf-8") as f:
        all_cameras = json.load(f)
    # Pre-filter to SC bounding box
    return [
        c for c in all_cameras
        if SC_BOUNDS["min_lat"] <= c["lat"] <= SC_BOUNDS["max_lat"]
        and SC_BOUNDS["min_lon"] <= c["lon"] <= SC_BOUNDS["max_lon"]
    ]


def load_boundary(filepath):
    """Load a GeoJSON file and union all features into a single geometry."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    geoms = []
    for feature in data.get("features", []):
        geom = feature.get("geometry")
        if geom:
            geoms.append(shape(geom))
    if not geoms:
        return None
    return unary_union(geoms)


def build_key_from_filename(filename):
    """Convert 'county-greenville.json' -> 'county:greenville',
    'place-charleston.json' -> 'place:charleston'."""
    name = os.path.splitext(filename)[0]
    m = re.match(r"^(county|place)-(.+)$", name)
    if m:
        return m.group(1) + ":" + m.group(2)
    return None


def main():
    cameras = load_cameras()
    print(f"Loaded {len(cameras)} cameras in SC bounding box")

    # Build Shapely points once
    camera_points = [Point(c["lon"], c["lat"]) for c in cameras]

    # Find all county-*.json and place-*.json boundary files
    boundary_files = (
        glob.glob(os.path.join(DISTRICTS_DIR, "county-*.json"))
        + glob.glob(os.path.join(DISTRICTS_DIR, "place-*.json"))
    )

    counts = {}
    for filepath in sorted(boundary_files):
        filename = os.path.basename(filepath)
        key = build_key_from_filename(filename)
        if not key:
            continue

        boundary = load_boundary(filepath)
        if boundary is None or boundary.is_empty:
            print(f"  Skipping {key}: empty boundary")
            continue

        prepared = prep(boundary)
        count = sum(1 for pt in camera_points if prepared.contains(pt))

        if count > 0:
            counts[key] = count
            print(f"  {key}: {count}")
        else:
            print(f"  {key}: 0 (omitted)")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(counts, f, indent=2, sort_keys=True)

    print(f"\nWrote {OUTPUT_PATH} ({len(counts)} entries)")


if __name__ == "__main__":
    main()
