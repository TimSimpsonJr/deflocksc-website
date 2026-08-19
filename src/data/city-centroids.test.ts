import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guard test for the generated file. Regenerate with:
//   python scripts/build-city-centroids.py
const CENTROIDS_PATH = fileURLToPath(new URL('./city-centroids.json', import.meta.url));
const REGISTRY_PATH = fileURLToPath(new URL('./registry.json', import.meta.url));

// Same box scripts/build-camera-counts.py uses to pre-filter cameras.
const SC_BOUNDS = { minLon: -84.0, maxLon: -78.0, minLat: 31.5, maxLat: 35.5 };

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const placeSlugs: string[] = readJson(REGISTRY_PATH)
  .jurisdictions.filter((j: any) => j.type === 'place')
  .map((j: any) => j.id.split(':')[1])
  .sort();

describe('city-centroids.json', () => {
  it('exists (run: python scripts/build-city-centroids.py)', () => {
    expect(existsSync(CENTROIDS_PATH)).toBe(true);
  });

  it('has exactly one centroid per registry place slug, and no extras', () => {
    const centroids = readJson(CENTROIDS_PATH);
    expect(Object.keys(centroids).sort()).toEqual(placeSlugs);
  });

  it('stores every centroid as a [lon, lat] pair inside South Carolina', () => {
    const centroids = readJson(CENTROIDS_PATH);
    for (const slug of placeSlugs) {
      const point = centroids[slug];
      expect(Array.isArray(point), `${slug} is not an array`).toBe(true);
      expect(point.length, `${slug} is not a 2-element pair`).toBe(2);
      const [lon, lat] = point;
      expect(typeof lon, `${slug} lon is not a number`).toBe('number');
      expect(typeof lat, `${slug} lat is not a number`).toBe('number');
      expect(lon >= SC_BOUNDS.minLon && lon <= SC_BOUNDS.maxLon, `${slug} lon ${lon} outside SC`).toBe(true);
      expect(lat >= SC_BOUNDS.minLat && lat <= SC_BOUNDS.maxLat, `${slug} lat ${lat} outside SC`).toBe(true);
    }
  });
});
