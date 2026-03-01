/**
 * Fetches the OpenFreeMap dark style and remaps its neutral gray palette
 * to the DeflockSC dark-blue site palette, then writes public/map-style.json.
 *
 * Run: node scripts/build-map-style.mjs
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "map-style.json");

// ---------------------------------------------------------------------------
// Color-property names that can contain color values in MapLibre styles
// ---------------------------------------------------------------------------
const COLOR_PROPS = new Set([
  "background-color",
  "fill-color",
  "fill-outline-color",
  "line-color",
  "text-color",
  "text-halo-color",
  "circle-color",
  "icon-color",
  "fill-extrusion-color",
]);

// ---------------------------------------------------------------------------
// Normalise any CSS color string to a lowercase, whitespace-collapsed form
// so we can do reliable lookups.
// ---------------------------------------------------------------------------
function normalizeColorString(c) {
  return c.toLowerCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Exact color map – keys are normalised original colors.
// ---------------------------------------------------------------------------
const EXACT_MAP = buildExactMap();

function buildExactMap() {
  const m = new Map();
  const add = (raw, target) => m.set(normalizeColorString(raw), target);

  // Background / darkest fills  (0-5 % luminance)
  add("rgb(12,12,12)", "#0f172a");
  add("#000", "#0f172a");
  add("#000000", "#0f172a");
  add("rgb(10,10,10)", "#0f172a");
  add("hsl(0,1%,2%)", "#0f172a");

  // Secondary land fills  (5-12 % luminance)
  add("hsl(0,2%,5%)", "#111d32");

  // Water fills
  add("rgb(27,27,29)", "#1e293b");

  // Park / wood / landuse fills
  add("rgb(32,32,32)", "#162032");

  // Minor roads  (~9-14 % luminance)
  add("#181818", "#334155");
  add("rgb(35,35,35)", "#334155");

  // Major roads  (~15-25 % luminance)
  add("#2a2a2a", "#3d4f66");
  add("hsl(0,0%,7%)", "#3d4f66");

  // Road casings / borders  (~25-35 % luminance, preserve alpha)
  add("rgba(60,60,60,0.8)", "rgba(71,85,105,0.8)");
  add("hsl(0,0%,21%)", "#475569");
  add("hsl(0,0%,23%)", "#475569");
  add("hsl(0,0%,27%)", "#475569");

  // Labels  (~35-50 % luminance)
  add("hsl(0,0%,37%)", "#64748b");
  add("rgba(80,78,78,1)", "#64748b");

  // City / prominent labels  (50 %+ luminance)
  add("rgb(101,101,101)", "#94a3b8");

  // Text halos with alpha
  add("rgba(0,0,0,0.7)", "rgba(15,23,42,0.7)");
  add("rgba(0,0,0,1)", "#0f172a");
  add("hsla(0,0%,0%,0.7)", "rgba(15,23,42,0.7)");

  // Motorway inner bright value (interpolation endpoint)
  add("hsla(0,0%,85%,0.53)", "hsla(215,20%,65%,0.53)");

  return m;
}

// ---------------------------------------------------------------------------
// Remap a single color string using the exact map.
// ---------------------------------------------------------------------------
function remapColor(color) {
  const norm = normalizeColorString(color);
  const mapped = EXACT_MAP.get(norm);
  return mapped !== undefined ? mapped : color;
}

// ---------------------------------------------------------------------------
// Walk a paint/layout value and remap every color string found.
// Handles plain strings, stops arrays, and MapLibre expressions.
// ---------------------------------------------------------------------------
function walkValue(val) {
  if (typeof val === "string") {
    if (/^(#|rgb|hsl)/i.test(val)) {
      return remapColor(val);
    }
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((v) => walkValue(v));
  }

  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === "stops" && Array.isArray(v)) {
        out.stops = v.map(([zoom, color]) => [
          zoom,
          typeof color === "string" && /^(#|rgb|hsl)/i.test(color)
            ? remapColor(color)
            : color,
        ]);
      } else {
        out[k] = walkValue(v);
      }
    }
    return out;
  }

  return val;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Fetching OpenFreeMap dark style...");
  const resp = await fetch("https://tiles.openfreemap.org/styles/dark");
  if (!resp.ok) {
    throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const style = await resp.json();

  console.log(`Processing ${style.layers.length} layers...`);

  for (const layer of style.layers) {
    if (layer.paint) {
      for (const prop of Object.keys(layer.paint)) {
        if (COLOR_PROPS.has(prop)) {
          layer.paint[prop] = walkValue(layer.paint[prop]);
        }
      }
    }

    if (layer.layout) {
      for (const prop of Object.keys(layer.layout)) {
        if (COLOR_PROPS.has(prop)) {
          layer.layout[prop] = walkValue(layer.layout[prop]);
        }
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(style, null, 2) + "\n");
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
