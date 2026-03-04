/**
 * Fetches camera data from Deflock CDN and saves to public/camera-data.json.
 * This avoids CORS issues since the CDN doesn't send Access-Control-Allow-Origin.
 *
 * Run: node scripts/fetch-camera-data.mjs
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "camera-data.json");
const CDN_URL = "https://cdn.deflock.me/regions/20/-100.json";

async function main() {
  console.log(`Fetching camera data from ${CDN_URL}...`);
  const resp = await fetch(CDN_URL, {
    headers: { "User-Agent": "deflocksc-website/1.0 (https://github.com/TimSimpsonJr/deflocksc-website)" },
  });
  if (!resp.ok) {
    throw new Error(`CDN responded with ${resp.status} ${resp.statusText}`);
  }

  const cameras = await resp.json();
  console.log(`Fetched ${cameras.length} cameras`);

  writeFileSync(OUT_PATH, JSON.stringify(cameras));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch camera data:", err);
  process.exit(1);
});
