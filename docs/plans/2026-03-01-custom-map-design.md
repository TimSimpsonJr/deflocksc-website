# Custom ALPR Camera Map Design

## Summary

Replace the Deflock iframe embed with a custom MapLibre GL JS map using OpenFreeMap dark tiles, Deflock CDN camera data, and a site-matched color palette.

## Tech Stack

- **Map renderer:** MapLibre GL JS (open source, no API key)
- **Tile provider:** OpenFreeMap dark style (free, unlimited, no registration)
- **Camera data:** Deflock CDN at `cdn.deflock.me/regions/` (public, no auth, ODbL license)
- **Style:** Custom JSON based on OpenFreeMap dark, colors remapped to site palette

## Map Style

Start from `https://tiles.openfreemap.org/styles/dark`, remap colors to site palette:

| Map layer | Target color |
|---|---|
| Background/land | `#0f172a` (site dark bg) |
| Secondary land | `#111d32` (slightly lighter) |
| Water | `#1e293b` (site alt bg) |
| Roads | `#334155` (slate-700) |
| Major roads | `#3d4f66` (slate-600ish) |
| Road/place labels | `#64748b` (slate-500) |
| City labels | `#94a3b8` (slate-400) |
| Parks/landuse | `#162032` (subtle blue-tint) |
| Borders | `#475569` (slate-600) |

Save modified style JSON as `public/map-style.json`.

## Camera Data

- **Source:** `https://cdn.deflock.me/regions/20/-100.json` (southeastern US tile)
- **Fetch:** At runtime when map loads (stays in sync with Deflock's hourly updates)
- **Format:** Array of `{ id, lat, lon, tags, type }` objects
- **Tags used:** `direction`, `camera:direction`, `operator`, `manufacturer`

## Markers

- **Default:** Red (`#ef4444`) circle markers for cameras without direction data
- **Directional:** Semi-transparent red cone (SVG arc) showing camera field of view, parsed from `direction`/`camera:direction` tags (degrees, cardinal, or ranges)
- **Clustering:** MapLibre built-in GeoJSON clustering. Larger red circles with white count label. Clusters break apart on zoom in, disabled at zoom 16+

## Component Architecture

- Replace iframe in `MapSection.astro` with `<div id="camera-map">` container
- Load MapLibre GL JS + CSS via CDN or npm
- Inline `<script>` initializes map, fetches camera data, renders markers
- Same mobile toggle behavior: button reveals map on tap
- Style JSON at `public/map-style.json`

## Responsive Behavior

- **Desktop/tablet (md+):** Map visible by default, 600px height
- **Mobile (<md):** Button toggle reveals map (same as iframe version)
- Map container: rounded corners, overflow hidden

## What Stays the Same

- Section layout, copy, caption, label text
- Section background, glow effects
- 600px map height
- Mobile toggle UX

## What Changes

- Iframe replaced with native MapLibre map
- Custom dark style matching site palette
- Camera markers rendered directly (red dots, direction cones, clusters)
- Attribution updated: OpenFreeMap + OpenMapTiles + OpenStreetMap + Deflock
- No Mapbox dependency or API key needed

## Tile Provider Portability

Since MapLibre accepts any style URL, the tile provider is a one-line swap:
- Current: `public/map-style.json` (OpenFreeMap tiles, custom colors)
- Alt: `https://tiles.openfreemap.org/styles/dark` (stock OpenFreeMap)
- Alt: Mapbox style URL (if ever needed, requires token)

This makes contributing back to Deflock straightforward — same MapLibre code, different style URL.
