"""
Generate an SVG map of South Carolina counties from district GeoJSON files.

Merges district polygons per county into outer boundaries using Shapely,
projects to SVG coordinates, and outputs a styled SVG with red county fills
on a dark gradient background.
"""

import json
import glob
import os
import math
import random

from shapely.geometry import shape, MultiPolygon
from shapely.ops import unary_union

DISTRICTS_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "districts")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "blog", "sc-county-map.svg")

# SVG dimensions (2:1 aspect for blog featured image)
SVG_WIDTH = 1440
SVG_HEIGHT = 720

# Padding inside SVG
PADDING = 40

# Red shades close to #dc2626
RED_SHADES = [
    "#b91c1c",  # red-700
    "#c42020",
    "#cc2222",
    "#d42525",
    "#dc2626",  # base red
    "#e02a2a",
    "#e53333",
    "#e83d3d",
    "#ef4444",  # red-500
    "#c92424",
    "#d12828",
    "#bf1e1e",
    "#d92929",
    "#e13030",
]


def load_county_boundaries():
    """Load and merge district polygons into county outer boundaries."""
    counties = {}
    pattern = os.path.join(DISTRICTS_DIR, "county-*.json")

    for filepath in sorted(glob.glob(pattern)):
        name = os.path.basename(filepath).replace("county-", "").replace(".json", "")

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        polygons = []
        for feat in data["features"]:
            geom = shape(feat["geometry"])
            if geom.is_valid:
                polygons.append(geom)
            else:
                polygons.append(geom.buffer(0))

        if polygons:
            merged = unary_union(polygons)
            # Buffer out then back in to close micro-gaps between districts
            merged = merged.buffer(0.001).buffer(-0.001)
            # Drop any tiny fragments left over
            if merged.geom_type == "MultiPolygon":
                merged = MultiPolygon([p for p in merged.geoms if p.area > 0.0001])
            # Simplify to reduce point count (tolerance in degrees, ~100m)
            merged = merged.simplify(0.002, preserve_topology=True)
            counties[name] = merged

    return counties


def get_bounds(counties):
    """Get the bounding box of all counties."""
    min_lon = float("inf")
    min_lat = float("inf")
    max_lon = float("-inf")
    max_lat = float("-inf")

    for geom in counties.values():
        bounds = geom.bounds  # (minx, miny, maxx, maxy)
        min_lon = min(min_lon, bounds[0])
        min_lat = min(min_lat, bounds[1])
        max_lon = max(max_lon, bounds[2])
        max_lat = max(max_lat, bounds[3])

    return min_lon, min_lat, max_lon, max_lat


def project_coords(lon, lat, bounds, width, height, padding):
    """Project lon/lat to SVG coordinates with aspect-ratio preservation."""
    min_lon, min_lat, max_lon, max_lat = bounds

    # Available drawing area
    draw_w = width - 2 * padding
    draw_h = height - 2 * padding

    # Scale to fit while preserving aspect ratio
    # Apply Mercator-like latitude correction for SC (~33-35 degrees)
    mid_lat = (min_lat + max_lat) / 2
    lat_correction = math.cos(math.radians(mid_lat))

    geo_w = (max_lon - min_lon) * lat_correction
    geo_h = max_lat - min_lat

    scale_x = draw_w / geo_w
    scale_y = draw_h / geo_h
    scale = min(scale_x, scale_y)

    # Center the map
    projected_w = geo_w * scale
    projected_h = geo_h * scale
    offset_x = padding + (draw_w - projected_w) / 2
    offset_y = padding + (draw_h - projected_h) / 2

    x = offset_x + (lon - min_lon) * lat_correction * scale
    y = offset_y + (max_lat - lat) * scale  # flip Y

    return x, y


def geometry_to_path(geom, bounds, width, height, padding):
    """Convert a Shapely geometry to SVG path data."""
    paths = []

    if geom.geom_type == "Polygon":
        polygons = [geom]
    elif geom.geom_type == "MultiPolygon":
        polygons = list(geom.geoms)
    else:
        return ""

    for poly in polygons:
        # Exterior ring
        coords = list(poly.exterior.coords)
        if len(coords) < 3:
            continue

        parts = []
        for i, (lon, lat) in enumerate(coords):
            x, y = project_coords(lon, lat, bounds, width, height, padding)
            if i == 0:
                parts.append(f"M{x:.1f},{y:.1f}")
            else:
                parts.append(f"L{x:.1f},{y:.1f}")
        parts.append("Z")
        paths.append("".join(parts))

        # Interior rings (holes) — draw in reverse winding
        for hole in poly.interiors:
            hole_coords = list(hole.coords)
            if len(hole_coords) < 3:
                continue
            hole_parts = []
            for i, (lon, lat) in enumerate(hole_coords):
                x, y = project_coords(lon, lat, bounds, width, height, padding)
                if i == 0:
                    hole_parts.append(f"M{x:.1f},{y:.1f}")
                else:
                    hole_parts.append(f"L{x:.1f},{y:.1f}")
            hole_parts.append("Z")
            paths.append("".join(hole_parts))

    return " ".join(paths)


def build_svg(counties, bounds):
    """Build the complete SVG string."""
    # Deterministic color assignment
    random.seed(42)
    county_names = sorted(counties.keys())

    # Assign colors ensuring neighbors don't match (simple random with seed)
    colors = {}
    shades = list(RED_SHADES)
    for name in county_names:
        colors[name] = random.choice(shades)

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" width="{SVG_WIDTH}" height="{SVG_HEIGHT}">')

    # Background gradient
    lines.append("  <defs>")
    lines.append('    <radialGradient id="bg" cx="50%" cy="40%" r="70%">')
    lines.append('      <stop offset="0%" stop-color="#262626"/>')
    lines.append('      <stop offset="100%" stop-color="#171717"/>')
    lines.append("    </radialGradient>")
    # Subtle vignette
    lines.append('    <radialGradient id="vignette" cx="50%" cy="50%" r="60%">')
    lines.append('      <stop offset="0%" stop-color="transparent"/>')
    lines.append('      <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>')
    lines.append("    </radialGradient>")
    # Red dot glow filter
    lines.append('    <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">')
    lines.append('      <feGaussianBlur stdDeviation="3" result="blur"/>')
    lines.append('      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>')
    lines.append("    </filter>")
    lines.append("  </defs>")

    # Background
    lines.append(f'  <rect width="{SVG_WIDTH}" height="{SVG_HEIGHT}" fill="url(#bg)"/>')

    # County paths
    lines.append('  <g fill-rule="evenodd" stroke="#171717" stroke-width="1.2" stroke-linejoin="round">')
    for name in county_names:
        geom = counties[name]
        path_data = geometry_to_path(geom, bounds, SVG_WIDTH, SVG_HEIGHT, PADDING)
        if path_data:
            color = colors[name]
            lines.append(f'    <path d="{path_data}" fill="{color}" fill-opacity="0.85"/>')
    lines.append("  </g>")

    # Vignette overlay
    lines.append(f'  <rect width="{SVG_WIDTH}" height="{SVG_HEIGHT}" fill="url(#vignette)"/>')

    # DEFLOCK/SC logo — lower right corner
    # Matches nav: bold uppercase, tracking-[0.12em], red dot + red slash
    logo_x = SVG_WIDTH - 40
    logo_y = SVG_HEIGHT - 40
    font_size = 28
    tracking = 0.12  # em

    # Use text-anchor="start" so we know exactly where the text begins
    # Estimate text width: ~12.5px per char at 28px bold + tracking
    # "DEFLOCK/SC" = 10 chars → ~195px
    text_w = 195
    text_x = logo_x - text_w
    # Cap height center: ~35% of font-size above baseline
    cap_center_y = logo_y - font_size * 0.35
    # Dot: 3/4 of cap height ≈ 0.75 * 0.7 * font_size ≈ 15px diameter → r=7.5 ... too big
    # 3/4 of the letter height visually means about 3/4 of cap height
    # Cap height ≈ 0.7 * font_size = ~20px, so 3/4 = 15px → but that's the whole dot
    # Nav dot is w-[6px] h-[6px] = 3px radius at 14px text. Scale: 28/14 = 2x → r=6
    dot_r = 5.5
    dot_gap = 10  # gap between dot and D

    lines.append(f'  <g>')
    # Logo text
    lines.append(f'    <text x="{text_x}" y="{logo_y}" font-family="Inter, system-ui, sans-serif" font-size="{font_size}" font-weight="700" letter-spacing="{tracking}em" text-anchor="start">')
    lines.append('      <tspan fill="white">DEFLOCK</tspan>')
    lines.append('      <tspan fill="#dc2626">/</tspan>')
    lines.append('      <tspan fill="white">SC</tspan>')
    lines.append("    </text>")
    # Red dot: centered vertically with cap height, just left of text
    lines.append(f'    <circle cx="{text_x - dot_gap - dot_r}" cy="{cap_center_y}" r="{dot_r}" fill="#dc2626" filter="url(#dot-glow)"/>')
    lines.append("  </g>")

    lines.append("</svg>")
    return "\n".join(lines)


def main():
    print("Loading county boundaries...")
    counties = load_county_boundaries()
    print(f"Loaded {len(counties)} counties")

    bounds = get_bounds(counties)
    print(f"Bounds: lon [{bounds[0]:.3f}, {bounds[2]:.3f}], lat [{bounds[1]:.3f}, {bounds[3]:.3f}]")

    print("Building SVG...")
    svg = build_svg(counties, bounds)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(svg)

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"Wrote {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
