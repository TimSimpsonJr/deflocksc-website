"""
Generate an isometric SVG map of South Carolina counties from district GeoJSON.

Counties are extruded based on camera count and colored by intensity
(more cameras = darker red, taller extrusion).
"""

import json
import glob
import os
import math
import random

from shapely.geometry import shape, MultiPolygon
from shapely.ops import unary_union

DISTRICTS_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "districts")
CAMERA_COUNTS_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "camera-counts.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "blog", "sc-county-map-iso.svg")

# SVG dimensions (2:1 aspect for blog featured image)
SVG_WIDTH = 1440
SVG_HEIGHT = 720

# Isometric projection settings
ISO_ANGLE = 30  # degrees
MAX_EXTRUDE = 80  # max extrusion height in pixels for the top county
MIN_EXTRUDE = 2   # minimum extrusion so zero-camera counties still have depth

# Color range: lighter red (few cameras) to darker red (many cameras)
# We'll interpolate between these
COLOR_LOW = (239, 68, 68)     # #ef4444 — lighter red
COLOR_HIGH = (127, 29, 29)    # #7f1d1d — dark red-900
COLOR_ZERO = (220, 60, 60)    # for zero-camera counties, a mid red

# Side face darkening factor
SIDE_DARKEN = 0.55


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
            merged = merged.buffer(0.001).buffer(-0.001)
            if merged.geom_type == "MultiPolygon":
                merged = MultiPolygon([p for p in merged.geoms if p.area > 0.0001])
            merged = merged.simplify(0.002, preserve_topology=True)
            counties[name] = merged

    return counties


def load_camera_counts():
    """Load camera counts per county."""
    with open(CAMERA_COUNTS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    counts = {}
    for key, val in data.items():
        if key.startswith("county:"):
            name = key.replace("county:", "")
            counts[name] = val
    return counts


def get_bounds(counties):
    """Get the bounding box of all counties."""
    min_lon = float("inf")
    min_lat = float("inf")
    max_lon = float("-inf")
    max_lat = float("-inf")

    for geom in counties.values():
        bounds = geom.bounds
        min_lon = min(min_lon, bounds[0])
        min_lat = min(min_lat, bounds[1])
        max_lon = max(max_lon, bounds[2])
        max_lat = max(max_lat, bounds[3])

    return min_lon, min_lat, max_lon, max_lat


def project_flat(lon, lat, bounds, padding=60):
    """Project lon/lat to flat 2D coordinates (before isometric transform)."""
    min_lon, min_lat, max_lon, max_lat = bounds

    draw_w = SVG_WIDTH - 2 * padding
    draw_h = SVG_HEIGHT - 2 * padding

    mid_lat = (min_lat + max_lat) / 2
    lat_correction = math.cos(math.radians(mid_lat))

    geo_w = (max_lon - min_lon) * lat_correction
    geo_h = max_lat - min_lat

    scale_x = draw_w / geo_w
    scale_y = draw_h / geo_h
    scale = min(scale_x, scale_y) * 0.75  # scale down to leave room for extrusion

    projected_w = geo_w * scale
    projected_h = geo_h * scale

    # Center horizontally, shift down to leave room for extrusion at top
    offset_x = (SVG_WIDTH - projected_w) / 2
    offset_y = (SVG_HEIGHT - projected_h) / 2 + MAX_EXTRUDE * 0.3

    x = offset_x + (lon - min_lon) * lat_correction * scale
    y = offset_y + (max_lat - lat) * scale

    return x, y


def iso_transform(x, y, z=0):
    """Apply isometric-style transform: tilt the flat map and add Z offset."""
    # Simple pseudo-isometric: compress Y axis and shift up by Z
    # Tilt factor: compress Y to create depth illusion
    tilt = 0.6
    new_x = x
    new_y = y * tilt - z
    return new_x, new_y


def lerp_color(t, low, high):
    """Linearly interpolate between two RGB colors."""
    return tuple(int(low[i] + (high[i] - low[i]) * t) for i in range(3))


def color_to_hex(rgb):
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def darken(rgb, factor):
    return tuple(max(0, int(c * factor)) for c in rgb)


def get_polygon_edges(coords):
    """Get edges of a polygon as list of ((x1,y1), (x2,y2)) segments."""
    edges = []
    for i in range(len(coords) - 1):
        edges.append((coords[i], coords[i + 1]))
    return edges


def build_svg(counties, bounds, camera_counts):
    """Build the isometric SVG."""
    max_count = max(camera_counts.values()) if camera_counts else 1

    # Calculate extrusion height and color per county
    county_data = {}
    for name, geom in counties.items():
        count = camera_counts.get(name, 0)
        t = count / max_count if max_count > 0 else 0

        # Extrusion height (use sqrt for more visible variation)
        extrude = MIN_EXTRUDE + (MAX_EXTRUDE - MIN_EXTRUDE) * math.sqrt(t)

        # Color: interpolate from light to dark based on count
        if count == 0:
            top_color = COLOR_ZERO
        else:
            top_color = lerp_color(t, COLOR_LOW, COLOR_HIGH)

        side_color = darken(top_color, SIDE_DARKEN)

        county_data[name] = {
            "geom": geom,
            "count": count,
            "extrude": extrude,
            "top_color": top_color,
            "side_color": side_color,
        }

    # Sort counties back-to-front (by centroid Y in projected space)
    # Counties at the top of the map (higher lat = lower Y) should render first
    def sort_key(name):
        centroid = county_data[name]["geom"].centroid
        _, y = project_flat(centroid.x, centroid.y, bounds)
        return y

    sorted_names = sorted(county_data.keys(), key=sort_key)

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" width="{SVG_WIDTH}" height="{SVG_HEIGHT}">')

    # Background gradient
    lines.append("  <defs>")
    lines.append('    <radialGradient id="bg" cx="50%" cy="40%" r="70%">')
    lines.append('      <stop offset="0%" stop-color="#262626"/>')
    lines.append('      <stop offset="100%" stop-color="#171717"/>')
    lines.append("    </radialGradient>")
    lines.append('    <radialGradient id="vignette" cx="50%" cy="50%" r="60%">')
    lines.append('      <stop offset="0%" stop-color="transparent"/>')
    lines.append('      <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>')
    lines.append("    </radialGradient>")
    lines.append('    <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">')
    lines.append('      <feGaussianBlur stdDeviation="3" result="blur"/>')
    lines.append('      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>')
    lines.append("    </filter>")
    lines.append("  </defs>")

    lines.append(f'  <rect width="{SVG_WIDTH}" height="{SVG_HEIGHT}" fill="url(#bg)"/>')

    # Render counties back-to-front
    for name in sorted_names:
        cd = county_data[name]
        geom = cd["geom"]
        extrude = cd["extrude"]
        top_hex = color_to_hex(cd["top_color"])
        side_hex = color_to_hex(cd["side_color"])

        # Get polygons
        if geom.geom_type == "Polygon":
            polys = [geom]
        elif geom.geom_type == "MultiPolygon":
            polys = list(geom.geoms)
        else:
            continue

        for poly in polys:
            coords_lonlat = list(poly.exterior.coords)
            if len(coords_lonlat) < 3:
                continue

            # Project to flat 2D
            flat_coords = [project_flat(lon, lat, bounds) for lon, lat in coords_lonlat]

            # Top face (isometric with Z offset)
            top_coords = [iso_transform(x, y, extrude) for x, y in flat_coords]

            # Bottom face (isometric, no Z)
            bottom_coords = [iso_transform(x, y, 0) for x, y in flat_coords]

            # Draw side faces (only for edges where bottom is visible below top)
            # We draw side quads for each edge
            for i in range(len(flat_coords) - 1):
                bx1, by1 = bottom_coords[i]
                bx2, by2 = bottom_coords[i + 1]
                tx1, ty1 = top_coords[i]
                tx2, ty2 = top_coords[i + 1]

                # Only draw side if the edge faces "forward" (bottom Y > top Y on average)
                # This gives the 3D extrusion look
                mid_bottom_y = (by1 + by2) / 2
                mid_top_y = (ty1 + ty2) / 2
                if mid_bottom_y > mid_top_y:
                    quad = f"M{bx1:.1f},{by1:.1f} L{bx2:.1f},{by2:.1f} L{tx2:.1f},{ty2:.1f} L{tx1:.1f},{ty1:.1f} Z"
                    lines.append(f'    <path d="{quad}" fill="{side_hex}" stroke="#171717" stroke-width="0.5"/>')

            # Draw top face
            top_path_parts = []
            for i, (tx, ty) in enumerate(top_coords):
                if i == 0:
                    top_path_parts.append(f"M{tx:.1f},{ty:.1f}")
                else:
                    top_path_parts.append(f"L{tx:.1f},{ty:.1f}")
            top_path_parts.append("Z")
            top_path = "".join(top_path_parts)
            lines.append(f'    <path d="{top_path}" fill="{top_hex}" stroke="#171717" stroke-width="0.8"/>')

    # Vignette overlay
    lines.append(f'  <rect width="{SVG_WIDTH}" height="{SVG_HEIGHT}" fill="url(#vignette)"/>')

    # DEFLOCK/SC logo — lower right corner
    logo_x = SVG_WIDTH - 40
    logo_y = SVG_HEIGHT - 40
    font_size = 28
    tracking = 0.12
    text_w = 195
    text_x = logo_x - text_w
    cap_center_y = logo_y - font_size * 0.35
    dot_r = 5.5
    dot_gap = 10

    lines.append("  <g>")
    lines.append(f'    <text x="{text_x}" y="{logo_y}" font-family="Inter, system-ui, sans-serif" font-size="{font_size}" font-weight="700" letter-spacing="{tracking}em" text-anchor="start">')
    lines.append('      <tspan fill="white">DEFLOCK</tspan>')
    lines.append('      <tspan fill="#dc2626">/</tspan>')
    lines.append('      <tspan fill="white">SC</tspan>')
    lines.append("    </text>")
    lines.append(f'    <circle cx="{text_x - dot_gap - dot_r}" cy="{cap_center_y}" r="{dot_r}" fill="#dc2626" filter="url(#dot-glow)"/>')
    lines.append("  </g>")

    lines.append("</svg>")
    return "\n".join(lines)


def main():
    print("Loading county boundaries...")
    counties = load_county_boundaries()
    print(f"Loaded {len(counties)} counties")

    print("Loading camera counts...")
    camera_counts = load_camera_counts()
    print(f"Loaded counts for {len(camera_counts)} counties (max: {max(camera_counts.values())})")

    bounds = get_bounds(counties)
    print(f"Bounds: lon [{bounds[0]:.3f}, {bounds[2]:.3f}], lat [{bounds[1]:.3f}, {bounds[3]:.3f}]")

    print("Building isometric SVG...")
    svg = build_svg(counties, bounds, camera_counts)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(svg)

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"Wrote {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
